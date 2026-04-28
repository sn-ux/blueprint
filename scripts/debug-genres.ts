/**
 * Debug script: find why artists stored as "unknown" in DB actually have genres
 * on Spotify. Tests multiple API endpoints and compares results.
 *
 * Run: npx tsx scripts/debug-genres.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env") });

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getClientCredentialsToken(): Promise<string> {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  if (!res.ok) throw new Error(`Token error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function spotifyFetch(token: string, path: string): Promise<any> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Spotify ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ── DB lookup: find artists whose tracks are rawGenre="unknown" ──────────────

import { prisma } from "../lib/prisma";

async function getUnknownArtists(limit = 5): Promise<{ artistId: string; artist: string; count: number }[]> {
  // We don't have an Artist table — derive from Track.spotifyId isn't available.
  // Instead join from tracks: find unique artist names with rawGenre=unknown,
  // then look up their Spotify IDs by searching.
  const rows = await prisma.track.groupBy({
    by: ["artist"],
    where: { rawGenre: "unknown" },
    _count: { artist: true },
    orderBy: { _count: { artist: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({ artistId: "", artist: r.artist, count: r._count.artist }));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const token = await getClientCredentialsToken();
  console.log("✓ Got Client Credentials token\n");

  // 1. Find DB artists with rawGenre="unknown"
  const unknownArtists = await getUnknownArtists(10);
  console.log("=== Top artists with rawGenre='unknown' in DB ===");
  unknownArtists.forEach(({ artist, count }) =>
    console.log(`  ${artist.padEnd(30)} ${count} tracks`)
  );
  console.log();

  // 2. For the top 5, try three endpoints and log genres returned by each
  const topArtists = unknownArtists.slice(0, 5);

  for (const { artist } of topArtists) {
    console.log(`\n━━━ ${artist} ━━━`);

    // 2a. Search endpoint (what Developer Console likely uses)
    try {
      const searchData = await spotifyFetch(
        token,
        `/search?q=${encodeURIComponent(artist)}&type=artist&limit=3`
      );
      const items: any[] = searchData?.artists?.items ?? [];
      const exact = items.find(
        (a: any) => a.name.toLowerCase() === artist.toLowerCase()
      ) ?? items[0];

      if (!exact) {
        console.log("  /search → no results");
      } else {
        console.log(`  /search → id=${exact.id} genres=${JSON.stringify(exact.genres)}`);

        // 2b. Direct artist endpoint with the ID from search
        const directData = await spotifyFetch(token, `/artists/${exact.id}`);
        console.log(`  /artists/{id} → genres=${JSON.stringify(directData.genres)}`);

        // 2c. Batch endpoint
        const batchData = await spotifyFetch(token, `/artists?ids=${exact.id}`);
        const batchArtist = batchData?.artists?.[0];
        console.log(`  /artists?ids=  → genres=${JSON.stringify(batchArtist?.genres)}`);

        // 2d. Related artists (each related artist has genres)
        const relData = await spotifyFetch(token, `/artists/${exact.id}/related-artists`);
        const relWithGenres = (relData?.artists ?? []).filter((a: any) => a.genres?.length > 0);
        const aggregated = Array.from(
          new Set(relWithGenres.flatMap((a: any) => a.genres as string[]))
        ).slice(0, 8);
        console.log(`  /related-artists → ${relData?.artists?.length ?? 0} related, ${relWithGenres.length} have genres`);
        console.log(`    Aggregated genres: ${JSON.stringify(aggregated)}`);
      }
    } catch (err) {
      console.log(`  ERROR: ${err}`);
    }
  }

  // 3. Also check a known-good artist (Drake) as control
  console.log("\n\n=== Control: Drake (should have genres) ===");
  const drakeSearch = await spotifyFetch(token, `/search?q=Drake&type=artist&limit=1`);
  const drake = drakeSearch?.artists?.items?.[0];
  if (drake) {
    console.log(`  /search → id=${drake.id} genres=${JSON.stringify(drake.genres)}`);
    const drakeDir = await spotifyFetch(token, `/artists/${drake.id}`);
    console.log(`  /artists/{id} → genres=${JSON.stringify(drakeDir.genres)}`);
  }

  // 4. Summary: total DB tracks, breakdown by rawGenre
  const total = await prisma.track.count();
  const unknownCount = await prisma.track.count({ where: { rawGenre: "unknown" } });
  const worldDist = await prisma.track.groupBy({
    by: ["blueprintWorld"],
    _count: { blueprintWorld: true },
    orderBy: { _count: { blueprintWorld: "desc" } },
  });
  console.log(`\n\n=== DB Summary ===`);
  console.log(`Total tracks: ${total}`);
  console.log(`rawGenre="unknown": ${unknownCount} (${((unknownCount/total)*100).toFixed(1)}%)`);
  console.log("blueprintWorld distribution:");
  worldDist.forEach(({ blueprintWorld, _count }) =>
    console.log(`  ${blueprintWorld.padEnd(35)} ${_count.blueprintWorld}`)
  );
}

main()
  .catch((err) => { console.error("FATAL:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());

/**
 * Follow-up debug:
 * 1. Does market=US on the search endpoint expose genres for 21 Savage?
 * 2. For 21 Savage's tracks in the DB, do any co-artists have genres?
 *    (shows how many would be rescued by the multi-artist fix)
 * 3. What % of "unknown" tracks are solo vs. have a co-artist with genres?
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env") });

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

async function getToken(): Promise<string> {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const d = await res.json() as any;
  return d.access_token;
}

async function sf(token: string, path: string): Promise<any> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

import { prisma } from "../lib/prisma";

async function main() {
  const token = await getToken();
  console.log("✓ token\n");

  // ── 1. Does market=US change genres for 21 Savage? ──────────────────────────
  console.log("=== Market=US test for 21 Savage, Tyler The Creator, JID ===");
  for (const q of ["21 Savage", "Tyler The Creator", "JID"]) {
    const d = await sf(token, `/search?q=${encodeURIComponent(q)}&type=artist&limit=1&market=US`);
    const a = d?.artists?.items?.[0];
    console.log(`  ${q}: id=${a?.id} genres=${JSON.stringify(a?.genres ?? [])}`);
  }

  // ── 2. Audio features for a 21 Savage track ─────────────────────────────────
  // Track-level audio features don't include genre, but let's confirm
  console.log("\n=== Audio features (track-level — no genre field expected) ===");
  const track21 = await prisma.track.findFirst({
    where: { artist: "21 Savage", rawGenre: "unknown" },
    select: { spotifyId: true, name: true },
  });
  if (track21) {
    try {
      const af = await sf(token, `/audio-features/${track21.spotifyId}`);
      console.log(`  Track: "${track21.name}" (${track21.spotifyId})`);
      console.log(`  Audio features keys: ${Object.keys(af).join(", ")}`);
      // genre is not in audio features, but confirm
    } catch (e) {
      console.log(`  audio-features error: ${e}`);
    }
  }

  // ── 3. Track recommendations endpoint — includes seed_genres ────────────────
  // This endpoint accepts genre seeds but doesn't return per-track genres.
  // Just checking for completeness.
  console.log("\n=== Available genre seeds (Spotify's genre list) ===");
  try {
    const seeds = await sf(token, "/recommendations/available-genre-seeds");
    const genres: string[] = seeds?.genres ?? [];
    console.log(`  Total available genre seeds: ${genres.length}`);
    console.log(`  Sample: ${genres.slice(0, 10).join(", ")}`);
  } catch (e) {
    console.log(`  Error: ${e}`);
  }

  // ── 4. How many "unknown" tracks would multi-artist fix rescue? ──────────────
  console.log("\n=== Multi-artist rescue potential ===");
  // Get "unknown" tracks, find their spotifyIds, fetch from Spotify to check ALL artists
  const unknownTracks = await prisma.track.findMany({
    where: { rawGenre: "unknown" },
    select: { spotifyId: true, name: true, artist: true },
    take: 50,
  });

  // Batch fetch track details to see all artists
  const ids = unknownTracks.map(t => t.spotifyId).filter(Boolean);
  let tracksWithMultipleArtists = 0;
  let artistIdsToCheck = new Set<string>();

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const d = await sf(token, `/tracks?ids=${chunk.join(",")}`);
    for (const t of d?.tracks ?? []) {
      if (!t) continue;
      const artistIds: string[] = (t.artists ?? []).map((a: any) => a.id);
      if (artistIds.length > 1) tracksWithMultipleArtists++;
      artistIds.forEach(id => artistIdsToCheck.add(id));
    }
  }

  // Check genres for all unique artists on these tracks
  const artistArr = Array.from(artistIdsToCheck);
  const artistGenres = new Map<string, string[]>();
  for (let i = 0; i < artistArr.length; i += 50) {
    const chunk = artistArr.slice(i, i + 50);
    const d = await sf(token, `/artists?ids=${chunk.join(",")}`);
    for (const a of d?.artists ?? []) {
      if (a) artistGenres.set(a.id, a.genres ?? []);
    }
  }

  // Re-fetch those 50 tracks and check how many would be rescued
  let wouldBeRescued = 0;
  let stillUnknown = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const d = await sf(token, `/tracks?ids=${chunk.join(",")}`);
    for (const t of d?.tracks ?? []) {
      if (!t) continue;
      const allGenres = (t.artists ?? []).flatMap((a: any) => artistGenres.get(a.id) ?? []);
      if (allGenres.length > 0) wouldBeRescued++;
      else stillUnknown++;
    }
  }

  console.log(`  Sample of 50 "unknown" tracks:`);
  console.log(`    ${tracksWithMultipleArtists}/50 have multiple artists`);
  console.log(`    ${wouldBeRescued}/50 would get genres via multi-artist fix`);
  console.log(`    ${stillUnknown}/50 would STILL be unknown (all artists have genres=[])`);

  // ── 5. Print a few "still unknown" examples ──────────────────────────────────
  console.log("\n=== Artists whose genres=[] on ALL endpoints (sample) ===");
  const noGenreArtists = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const d = await sf(token, `/tracks?ids=${chunk.join(",")}`);
    for (const t of d?.tracks ?? []) {
      if (!t) continue;
      const allGenres = (t.artists ?? []).flatMap((a: any) => artistGenres.get(a.id) ?? []);
      if (allGenres.length === 0) {
        for (const a of t.artists ?? []) {
          noGenreArtists.set(a.id, a.name);
        }
      }
    }
  }

  const noGenreList = Array.from(noGenreArtists.entries()).slice(0, 20);
  noGenreList.forEach(([id, name]) => console.log(`  ${name.padEnd(30)} ${id}`));
}

main()
  .catch(e => { console.error("FATAL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

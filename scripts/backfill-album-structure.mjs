/**
 * Step H — populate album structure on rows imported before it was captured.
 *
 *   node --import ./scripts/register.mjs scripts/backfill-album-structure.mjs [--dry]
 *
 * Reads GET /v1/tracks?ids=… fifty at a time and UPDATEs only the five new
 * columns. Deliberately not a re-import: runLikedSongsImport purges rows that
 * are no longer in a user's Spotify library, and a metadata backfill has no
 * business deleting anything. Track metadata is not user-specific, so one
 * working token resolves ids for every user's rows.
 */
import { PrismaClient } from "@prisma/client";

const DRY = process.argv.includes("--dry");
const prisma = new PrismaClient();

// ── A usable access token from any linked account ───────────────────────────
async function accessToken() {
  const accounts = await prisma.account.findMany({
    where: { provider: "spotify", refresh_token: { not: null } },
    select: { id: true, access_token: true, refresh_token: true },
  });
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  for (const a of accounts) {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: a.refresh_token }),
    });
    if (!res.ok) continue;
    const json = await res.json();
    if (json.access_token) {
      // Keep the refreshed token, exactly as the import would.
      if (!DRY) {
        await prisma.account.update({
          where: { id: a.id },
          data: {
            access_token: json.access_token,
            refresh_token: json.refresh_token ?? a.refresh_token,
            expires_at: json.expires_in ? Math.floor(Date.now() / 1000) + json.expires_in : undefined,
          },
        });
      }
      return json.access_token;
    }
  }
  throw new Error("no account could refresh a Spotify token");
}

const token = await accessToken();
console.log("token acquired");

// ── Every distinct track we hold that still lacks album structure ───────────
const rows = await prisma.track.findMany({
  where: { albumId: null },
  select: { spotifyId: true },
  distinct: ["spotifyId"],
});
const ids = [...new Set(rows.map((r) => r.spotifyId))].filter(Boolean);
console.log(`${ids.length.toLocaleString()} distinct tracks need album structure`);

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const batches = chunk(ids, 50);

let fetched = 0, updated = 0, skipped = 0;
const byType = new Map();

for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  let res = await fetch(`https://api.spotify.com/v1/tracks?ids=${batch.join(",")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after") ?? "2");
    console.log(`  rate limited, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
    res = await fetch(`https://api.spotify.com/v1/tracks?ids=${batch.join(",")}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!res.ok) { console.log(`  batch ${i} failed ${res.status}`); skipped += batch.length; continue; }

  const { tracks } = await res.json();
  const writes = [];
  for (const t of tracks ?? []) {
    if (!t?.id || !t.album?.id) { skipped++; continue; }
    fetched++;
    byType.set(t.album.album_type, (byType.get(t.album.album_type) ?? 0) + 1);
    writes.push({
      spotifyId: t.id,
      albumId: t.album.id,
      albumTotalTracks: typeof t.album.total_tracks === "number" ? t.album.total_tracks : null,
      trackNumber: typeof t.track_number === "number" ? t.track_number : null,
      discNumber: typeof t.disc_number === "number" ? t.disc_number : null,
      albumType: t.album.album_type ?? null,
      durationMs: typeof t.duration_ms === "number" ? t.duration_ms : null,
      releaseDate: t.album.release_date ?? null,
      releaseDatePrecision: t.album.release_date_precision ?? null,
    });
  }

  if (!DRY) {
    // One update per spotifyId, across every user holding it.
    await Promise.all(writes.map((w) => {
      const { spotifyId, ...data } = w;
      return prisma.track.updateMany({ where: { spotifyId }, data });
    }));
  }
  updated += writes.length;

  if (i % 25 === 0 || i === batches.length - 1) {
    console.log(`  batch ${i + 1}/${batches.length}  ${updated.toLocaleString()} tracks resolved`);
  }
}

console.log(`\nresolved ${fetched.toLocaleString()}, skipped ${skipped.toLocaleString()}${DRY ? " (dry run — nothing written)" : ""}`);
console.log("album types:", [...byType.entries()].map(([k, v]) => `${k}=${v}`).join("  "));

if (!DRY) {
  const after = await prisma.track.count({ where: { albumId: { not: null } } });
  const total = await prisma.track.count();
  console.log(`rows with album structure: ${after.toLocaleString()} / ${total.toLocaleString()}`);
}
await prisma.$disconnect();

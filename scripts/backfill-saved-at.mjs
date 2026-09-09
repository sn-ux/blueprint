/**
 * Fills Track.savedAt from Spotify's Liked Songs, for one user.
 *
 * Additive and nothing else: it pages /v1/me/tracks, reads each item's
 * `added_at`, and writes that one column onto rows that already exist. No
 * upsert, no purge, no other field touched — an ordinary import does all of
 * that and this deliberately does not, so it can be run against a live
 * library without moving anything else.
 *
 * Rows Spotify does not report a save for are left null. A playlist-only
 * track has no Liked Songs save and stays null, because a playlist add is a
 * different event and substituting one for the other would be inventing a
 * date that was never given.
 *
 *   node --import ./scripts/register.mjs scripts/backfill-saved-at.mjs <userId>
 */
import { prisma } from "../lib/prisma.ts";
import { getSpotifyToken } from "../lib/spotify-token.ts";

const userId = process.argv[2];
if (!userId) { console.log("usage: backfill-saved-at.mjs <userId>"); process.exit(1); }

const token = await getSpotifyToken(userId);
if (!token) { console.log(`no Spotify account linked to ${userId}`); process.exit(1); }

const savedAtOf = new Map();
let url = "https://api.spotify.com/v1/me/tracks?limit=50";
let pages = 0;
while (url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.accessToken}` } });
  if (!res.ok) {
    console.log(`Spotify refused page ${pages}: ${res.status} ${await res.text().catch(() => "")}`);
    process.exit(1);
  }
  const data = await res.json();
  for (const item of data.items ?? []) {
    const id = item?.track?.id;
    if (id && item.added_at) savedAtOf.set(id, new Date(item.added_at));
  }
  url = data.next ?? null;
  pages++;
}
console.log(`read ${savedAtOf.size} save dates over ${pages} pages`);

const rows = await prisma.track.findMany({
  where: { userId, spotifyId: { in: [...savedAtOf.keys()] } },
  select: { id: true, spotifyId: true },
});
let written = 0;
const BATCH = 50;
for (let i = 0; i < rows.length; i += BATCH) {
  await Promise.all(rows.slice(i, i + BATCH).map(async (r) => {
    await prisma.track.update({
      where: { id: r.id },
      data: { savedAt: savedAtOf.get(r.spotifyId) },
    });
    written++;
  }));
}

const total = await prisma.track.count({ where: { userId } });
const dated = await prisma.track.count({ where: { userId, savedAt: { not: null } } });
console.log(`wrote ${written} — ${dated} of this library's ${total} rows now carry a save date`);
await prisma.$disconnect();

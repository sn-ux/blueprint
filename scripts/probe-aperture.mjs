/** Concentration distributions for every multi-track set the engine can form. */
import { PrismaClient } from "@prisma/client";
import { buildIndex, UNKNOWN_LANE } from "../lib/discovery/sets.ts";
import { GENERATORS } from "../lib/discovery/generators.ts";

const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";
const prisma = new PrismaClient();
const people = await prisma.user.findMany({ where: { midvaleHidden: false, tracks: { some: {} } }, select: { id: true, name: true, image: true } });
const tracks = await prisma.track.findMany({
  where: { user: { midvaleHidden: false } },
  select: { userId: true, spotifyId: true, name: true, artist: true, album: true, imageUrl: true,
    artistId: true, artistImageUrl: true, blueprintWorld: true, blueprintSubgenre: true,
    albumId: true, albumTotalTracks: true, trackNumber: true, discNumber: true, albumType: true },
});
await prisma.$disconnect();

const index = buildIndex({ viewerId: userId, people, tracks });
const albumIdOf = index.albumIdOf;
const artistIdOf = new Map();
for (const t of tracks) if (t.artistId && !artistIdOf.has(t.spotifyId)) artistIdOf.set(t.spotifyId, t.artistId);

const share = (ids, keyOf) => {
  const m = new Map();
  for (const id of ids) { const k = keyOf(id); if (k == null) continue; m.set(k, (m.get(k) ?? 0) + 1); }
  const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? { key: top[0], count: top[1], share: top[1] / ids.length, distinct: m.size } : { key: null, count: 0, share: 0, distinct: 0 };
};
const conc = (ids) => ({
  album: share(ids, (i) => albumIdOf.get(i) ?? null),
  artist: share(ids, (i) => artistIdOf.get(i) ?? index.meta.get(i)?.artist ?? null),
  lane: share(ids, (i) => { const s = index.meta.get(i)?.subgenre; return s && s !== UNKNOWN_LANE ? s : null; }),
  genre: share(ids, (i) => index.meta.get(i)?.world ?? null),
});

console.log("═══ A. current SONG_SET candidates (CONSENSUS_IN_LANE, lane-grouped) ═══");
const cons = GENERATORS.find((g) => g.id === "CONSENSUS_IN_LANE").run(index);
console.log(`${cons.length} produced`);
for (const c of cons.slice(0, 40)) {
  const k = conc(c.deliverableIds);
  console.log(`  ${String(c.subject.label).padEnd(30)} n=${c.deliverableIds.length}  album ${(k.album.share*100).toFixed(0)}% (${k.album.distinct})  artist ${(k.artist.share*100).toFixed(0)}% (${k.artist.distinct})  lane ${(k.lane.share*100).toFixed(0)}% (${k.lane.distinct})  genre ${(k.genre.share*100).toFixed(0)}% (${k.genre.distinct})`);
}

console.log("\n═══ B. source-combination groups: tracks held by exactly the same set of sources ═══");
const bySig = new Map();
for (const id of index.D) {
  const h = (index.holders.get(id) ?? []).slice().sort();
  if (h.length < 2) continue;
  const sig = h.join("|");
  (bySig.get(sig) ?? bySig.set(sig, []).get(sig)).push(id);
}
const groups = [...bySig.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`${groups.length} distinct source combinations of size >= 2`);
for (const [sig, ids] of groups) {
  const names = sig.split("|").map((i) => index.nameOf.get(i) ?? "?");
  const k = conc(ids);
  console.log(`  [${names.join(" + ")}] n=${ids.length}  album ${(k.album.share*100).toFixed(0)}% (${k.album.distinct})  artist ${(k.artist.share*100).toFixed(0)}% (${k.artist.distinct})  lane ${(k.lane.share*100).toFixed(0)}% (${k.lane.distinct})  genre ${(k.genre.share*100).toFixed(0)}% (${k.genre.distinct})`);
}

console.log("\n═══ C. same, but capped at the 15 most-corroborated / alphabetical (what a card would deliver) ═══");
for (const [sig, ids] of groups) {
  if (ids.length < 12) continue;
  const sorted = ids.slice().sort((a, b) => (index.meta.get(a)?.name ?? "").localeCompare(index.meta.get(b)?.name ?? ""));
  const top = sorted.slice(0, 15);
  const names = sig.split("|").map((i) => index.nameOf.get(i) ?? "?");
  const k = conc(top);
  console.log(`  [${names.join(" + ")}] n=15  album ${(k.album.share*100).toFixed(0)}%  artist ${(k.artist.share*100).toFixed(0)}%  lane ${(k.lane.share*100).toFixed(0)}% (${k.lane.distinct} lanes)  genre ${(k.genre.share*100).toFixed(0)}% (${k.genre.distinct})`);
}

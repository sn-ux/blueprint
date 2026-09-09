/** Broad lane inventory vs. what a stronger holder threshold actually selects. */
import { PrismaClient } from "@prisma/client";
import { buildIndex } from "../lib/discovery/sets.ts";

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
const holders = (id) => index.holders.get(id)?.length ?? 0;
console.log(`sources ${index.friends.length}   eligible universe ${index.eligibleSourceUniverse}`);
console.log("\nlane                          owned   gap  h>=2  h>=3  h>=4   avgH(top15@3)  selectivity@3");
const rows = [];
for (const lane of index.lanes.values()) {
  const owned = index.viewerByLane.get(lane.subgenre) ?? 0;
  if (owned < 3) continue;
  const g2 = lane.gap.filter((i) => holders(i) >= 2);
  const g3 = lane.gap.filter((i) => holders(i) >= 3);
  const g4 = lane.gap.filter((i) => holders(i) >= 4);
  if (g2.length < 6) continue;
  const top = g3.sort((a, b) => holders(b) - holders(a)).slice(0, 15);
  const avg = top.length ? (top.reduce((s, i) => s + holders(i), 0) / top.length) : 0;
  rows.push({ lane: lane.subgenre, owned, gap: lane.gap.length, g2: g2.length, g3: g3.length, g4: g4.length, avg, sel: g2.length ? 1 - Math.min(15, g3.length) / g2.length : 0 });
}
rows.sort((a, b) => b.g3 - a.g3);
for (const r of rows) {
  console.log(`${r.lane.padEnd(28)} ${String(r.owned).padStart(5)} ${String(r.gap).padStart(5)} ${String(r.g2).padStart(5)} ${String(r.g3).padStart(5)} ${String(r.g4).padStart(5)}   ${r.avg.toFixed(2).padStart(6)}        ${(r.sel * 100).toFixed(0)}%`);
}
console.log(`\nlanes with >=12 tracks held by >=3 sources: ${rows.filter((r) => r.g3 >= 12).length}`);
console.log(`lanes with >=12 tracks held by >=4 sources: ${rows.filter((r) => r.g4 >= 12).length}`);
console.log("\ncorroborated (h>=2) lane inventory distribution:");
const sizes = rows.map((r) => r.g2).sort((a, b) => a - b);
for (const p of [0.5, 0.75, 0.9, 1]) console.log(`  p${p * 100}: ${sizes[Math.min(sizes.length - 1, Math.floor(p * sizes.length))]}`);

console.log("\n═══ scoped to the parent genre instead of the lane ═══");
console.log("world                            owned    gap  h>=2  h>=3  h>=4   distinct lanes@3  distinct artists@3");
for (const w of index.worlds.values()) {
  const owned = index.viewerByWorld.get(w.world) ?? 0;
  if (owned === 0) continue;
  const g2 = w.gap.filter((i) => holders(i) >= 2);
  const g3 = w.gap.filter((i) => holders(i) >= 3);
  const g4 = w.gap.filter((i) => holders(i) >= 4);
  const lanes = new Set(g3.map((i) => index.meta.get(i)?.subgenre));
  const artists = new Set(g3.map((i) => index.meta.get(i)?.artist));
  console.log(`${w.world.padEnd(32)} ${String(owned).padStart(5)} ${String(w.gap.length).padStart(6)} ${String(g2.length).padStart(5)} ${String(g3.length).padStart(5)} ${String(g4.length).padStart(5)}   ${String(lanes.size).padStart(6)}            ${String(artists.size).padStart(6)}`);
}
const all3 = index.D.filter((i) => holders(i) >= 3);
const all4 = index.D.filter((i) => holders(i) >= 4);
console.log(`\nacross all of D: ${all3.length} tracks held by >=3 sources, ${all4.length} by all 4`);
console.log("top of that set:");
for (const id of all3.sort((a, b) => holders(b) - holders(a)).slice(0, 20)) {
  const m = index.meta.get(id);
  console.log(`  ${String(holders(id))}x  ${m.name} — ${m.artist}   [${m.world} / ${m.subgenre}]`);
}

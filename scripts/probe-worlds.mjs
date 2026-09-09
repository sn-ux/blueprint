/** Why whole worlds never reach the feed, traced per world and per lane. */
import { prisma } from "../lib/prisma.ts";
import * as CFG from "../lib/discovery/config.ts";
import { buildFeed } from "../lib/discovery/feed.ts";
import { UNKNOWN_LANE } from "../lib/discovery/sets.ts";

const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";
const r = await buildFeed(userId, 0);
const { index, all } = r;
const holders = (id) => index.holders.get(id)?.length ?? 0;

const cardsByWorld = new Map();
for (const c of all) cardsByWorld.set(c.genre ?? "—", (cardsByWorld.get(c.genre ?? "—") ?? 0) + 1);

console.log("world                            owned    gap   h>=2  lanes  lanes>=6corr  ownedArtistsInGap  cards");
for (const w of index.worlds.values()) {
  const owned = index.viewerByWorld.get(w.world) ?? 0;
  const corr = w.gap.filter((i) => holders(i) >= CFG.MIN_SOURCES_PER_TRACK);
  const lanes = new Set(w.gap.map((i) => index.meta.get(i)?.subgenre).filter((x) => x && x !== UNKNOWN_LANE));
  let laneOk = 0;
  for (const l of lanes) {
    const n = w.gap.filter((i) => index.meta.get(i)?.subgenre === l && holders(i) >= CFG.MIN_SOURCES_PER_TRACK).length;
    if (n >= CFG.LANE.minDeliverable) laneOk++;
  }
  // Artists the viewer already owns who also appear in this world's gap.
  const bridge = new Set(w.gap.map((i) => index.meta.get(i)?.artist).filter((a) => a && (index.viewerByArtist.get(a) ?? 0) > 0));
  console.log(`${w.world.padEnd(32)} ${String(owned).padStart(5)} ${String(w.gap.length).padStart(6)} ${String(corr.length).padStart(6)} ${String(lanes.size).padStart(6)} ${String(laneOk).padStart(12)} ${String(bridge.size).padStart(18)} ${String(cardsByWorld.get(w.world) ?? 0).padStart(6)}`);
}

console.log("\n── lanes the viewer has NOTHING in, ranked by what could vouch for them ──");
console.log("lane                          world                  gap  h>=2  friendsWithDepth  ownedArtistsInLane  ownedTracksByThem");
const rows = [];
for (const lane of index.lanes.values()) {
  if ((index.viewerByLane.get(lane.subgenre) ?? 0) !== 0) continue;
  if (lane.subgenre === UNKNOWN_LANE) continue;
  const corr = lane.gap.filter((i) => holders(i) >= 2).length;
  // Depth: friends holding a real amount of this lane, not one crossover track.
  const depth = [...lane.byFriend.entries()].filter(([, set]) => set.size >= 8).length;
  const bridgeArtists = new Set(lane.gap.map((i) => index.meta.get(i)?.artist)
    .filter((a) => a && (index.viewerByArtist.get(a) ?? 0) > 0));
  const ownedByThem = [...bridgeArtists].reduce((s, a) => s + (index.viewerByArtist.get(a) ?? 0), 0);
  rows.push({ lane: lane.subgenre, world: lane.world, gap: lane.gap.length, corr, depth, bridge: bridgeArtists.size, ownedByThem, names: [...bridgeArtists].slice(0, 3) });
}
rows.sort((a, b) => (b.depth - a.depth) || (b.bridge - a.bridge) || (b.gap - a.gap));
for (const x of rows.slice(0, 30)) {
  console.log(`${x.lane.slice(0,28).padEnd(29)} ${x.world.slice(0,20).padEnd(21)} ${String(x.gap).padStart(5)} ${String(x.corr).padStart(5)} ${String(x.depth).padStart(17)} ${String(x.bridge).padStart(19)} ${String(x.ownedByThem).padStart(18)}   ${x.names.join(", ")}`);
}
console.log(`\nlanes viewer is absent from: ${rows.length}`);
console.log(`  with >=2 friends holding >=8 tracks:            ${rows.filter((x) => x.depth >= 2).length}`);
console.log(`  and also >=1 artist the viewer already owns:    ${rows.filter((x) => x.depth >= 2 && x.bridge >= 1).length}`);
console.log(`  and >=12 gap tracks:                            ${rows.filter((x) => x.depth >= 2 && x.bridge >= 1 && x.gap >= 12).length}`);
await prisma.$disconnect();

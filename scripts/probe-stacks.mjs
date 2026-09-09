/** How much inventory each candidate stacked proposition would actually have. */
import { prisma } from "../lib/prisma.ts";
import { buildFeed } from "../lib/discovery/feed.ts";
import { UNKNOWN_LANE } from "../lib/discovery/sets.ts";

const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";
const { index } = await buildFeed(userId, 0);
const holders = (id) => index.holders.get(id) ?? [];

const lanes = [];
for (const lane of index.lanes.values()) {
  if (lane.subgenre === UNKNOWN_LANE) continue;
  const owned = index.viewerByLane.get(lane.subgenre) ?? 0;
  const sources = new Set();
  for (const id of lane.gap) for (const h of holders(id)) sources.add(h);
  // Artists the viewer already holds who also make music in this lane, and how
  // much of them the viewer owns — the bridge, and its weight.
  const bridge = new Map();
  for (const id of lane.gap) {
    const a = index.meta.get(id)?.artist;
    const ownedBy = a ? index.viewerByArtist.get(a) ?? 0 : 0;
    if (a && ownedBy > 0) bridge.set(a, ownedBy);
  }
  const bridgeTracks = lane.gap.filter((id) => bridge.has(index.meta.get(id)?.artist ?? ""));
  const depth = [...lane.byFriend.entries()].map(([f, set]) => [index.nameOf.get(f), set.size])
    .sort((a, b) => b[1] - a[1]);
  lanes.push({
    key: lane.subgenre, world: lane.world, owned, gap: lane.gap.length,
    sources: sources.size, bridge, bridgeTracks: bridgeTracks.length,
    bridgeOwned: [...bridge.values()].reduce((a, b) => a + b, 0), depth,
  });
}

const fmt = (x) => `${x.key.slice(0,26).padEnd(27)} ${x.world.slice(0,18).padEnd(19)} own${String(x.owned).padStart(5)} gap${String(x.gap).padStart(5)} src${String(x.sources).padStart(3)} bridgeArtists${String(x.bridge.size).padStart(3)} bridgeTracks${String(x.bridgeTracks).padStart(4)} ownedByBridge${String(x.bridgeOwned).padStart(5)}`;

const NEW = lanes.filter((l) => l.owned === 0);
console.log("═══ STACK A · new lane + >=2 sources + artist bridge (SUBGENRE card) ═══");
const A = NEW.filter((l) => l.sources >= 2 && l.bridge.size >= 1 && l.bridgeOwned >= 5 && l.gap >= 6)
  .sort((a, b) => b.bridgeOwned - a.bridgeOwned);
console.log(`qualifying lanes: ${A.length}`);
for (const x of A.slice(0, 16)) console.log("  " + fmt(x) + `  ${[...x.bridge].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([a,n])=>`${a}(${n})`).join(", ")}`);

console.log("\n═══ STACK B · new lane + >=2 sources + 12-15 track set (SONG_SET) ═══");
const B = NEW.filter((l) => l.sources >= 2 && l.gap >= 12).sort((a, b) => b.sources - a.sources || b.gap - a.gap);
console.log(`qualifying lanes: ${B.length}   (with a bridge too: ${B.filter((l) => l.bridge.size >= 1).length})`);
for (const x of B.slice(0, 12)) console.log("  " + fmt(x) + `  depth ${x.depth.slice(0,3).map(([n,c])=>`${n}:${c}`).join(" ")}`);

console.log("\n═══ STACK C · new lane, set drawn only from artists you already own (SONG_SET) ═══");
const C = NEW.filter((l) => l.bridgeTracks >= 12 && l.sources >= 2).sort((a, b) => b.bridgeTracks - a.bridgeTracks);
console.log(`qualifying lanes: ${C.length}`);
for (const x of C.slice(0, 12)) console.log("  " + fmt(x));

console.log("\n═══ STACK D · lane you ARE in + artist bridge you have depth in (SUBGENRE) ═══");
const D = lanes.filter((l) => l.owned > 0 && l.sources >= 2 && l.bridge.size >= 2 && l.gap >= 12)
  .sort((a, b) => b.bridgeOwned - a.bridgeOwned);
console.log(`qualifying lanes: ${D.length}`);

console.log("\n═══ per-world reach of stacks A+B+C ═══");
const reach = new Map();
for (const x of [...A, ...B, ...C]) reach.set(x.world, (reach.get(x.world) ?? new Set()).add(x.key));
for (const [w, set] of [...reach].sort((a, b) => b[1].size - a[1].size)) console.log(`  ${w.padEnd(32)} ${set.size}`);
await prisma.$disconnect();

/** Five consecutive sessions, plus why BRIDGE_SET finds nothing. */
import { prisma } from "../lib/prisma.ts";
import * as CFG from "../lib/discovery/config.ts";
import { buildFeed } from "../lib/discovery/feed.ts";
import { UNKNOWN_LANE } from "../lib/discovery/sets.ts";
import { startSession } from "../lib/recommendations/session.ts";

const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";
const { index } = await buildFeed(userId, 0);

console.log("── BRIDGE_SET feasibility (lanes the viewer occupies) ──");
const rows = [];
for (const lane of index.lanes.values()) {
  if (lane.subgenre === UNKNOWN_LANE) continue;
  const owned = index.viewerByLane.get(lane.subgenre) ?? 0;
  if (owned < CFG.LANE.minOwnedForPresent) continue;
  const byArtist = new Map();
  for (const id of lane.gap) {
    const a = index.meta.get(id)?.artist;
    if (a && (index.viewerByArtist.get(a) ?? 0) > 0) byArtist.set(a, (byArtist.get(a) ?? 0) + 1);
  }
  const tracks = [...byArtist.values()].reduce((x, y) => x + y, 0);
  const ownedByThem = [...byArtist.keys()].reduce((s, a) => s + (index.viewerByArtist.get(a) ?? 0), 0);
  if (byArtist.size > 0) rows.push({ lane: lane.subgenre, artists: byArtist.size, tracks, ownedByThem });
}
rows.sort((a, b) => b.tracks - a.tracks);
for (const r of rows.slice(0, 10)) console.log(`  ${r.lane.padEnd(26)} ownedArtists ${String(r.artists).padStart(3)}  bridgeTracks ${String(r.tracks).padStart(4)}  ownedByThem ${String(r.ownedByThem).padStart(4)}`);
console.log(`  lanes with >=3 owned artists AND >=12 bridge tracks: ${rows.filter((r) => r.artists >= 3 && r.tracks >= 12).length}`);
console.log(`  lanes with >=2 owned artists AND >=12 bridge tracks: ${rows.filter((r) => r.artists >= 2 && r.tracks >= 12).length}`);

console.log("\n── five consecutive sessions ──");
const firsts = [];
const orders = [];
for (let i = 0; i < 5; i++) {
  const b = await startSession(userId, false);
  const ids = b.stored.map((s) => s.card.id);
  orders.push(ids);
  firsts.push(b.stored.slice(0, 5).map((s) => `${s.card.cardType}:${s.card.title}`));
  console.log(`  session ${i + 1}: ${b.stored.length} cards`);
  for (const t of firsts[i]) console.log(`      ${t}`);
}
console.log("\n  first-screen churn between consecutive sessions (top 24):");
for (let i = 1; i < orders.length; i++) {
  const a = new Set(orders[i - 1].slice(0, 24));
  const shared = orders[i].slice(0, 24).filter((x) => a.has(x)).length;
  const sameSlot = orders[i].slice(0, 24).filter((x, j) => orders[i - 1][j] === x).length;
  console.log(`    ${i} → ${i + 1}: ${24 - shared}/24 cards new, ${24 - sameSlot}/24 changed position`);
}
const pinned = orders[0].slice(0, 10).filter((id, j) => orders.every((o) => o[j] === id));
console.log(`  cards pinned to the same slot across all five: ${pinned.length}`);
await prisma.$disconnect();

/** What the failed validation runs left behind on the real viewer. */
import { prisma } from "../lib/prisma.ts";
import { dbReady } from "./db-ready.mjs";

if (!(await dbReady(prisma))) { console.log("database unreachable — stopping cleanly"); await prisma.$disconnect(); process.exit(1); }

const userId = "cmown82yw0000l404njt51be8";
const rows = await prisma.recommendationExposure.findMany({ where: { userId } });
const now = new Date();
console.log(`\nRecommendationExposure for Surya: ${rows.length} rows`);
if (rows.length) {
  console.log(`  impressions total ${rows.reduce((a, b) => a + b.impressionCount, 0)}`);
  console.log(`  opened ${rows.filter((r) => r.openCount > 0).length}  dismissed ${rows.filter((r) => r.dismissedAt).length}  actedOn ${rows.filter((r) => r.actedOnAt).length}`);
  console.log(`  resting now ${rows.filter((r) => r.cooldownUntil && r.cooldownUntil > now).length}`);
  const times = rows.map((r) => r.createdAt).sort();
  console.log(`  written between ${times[0].toISOString()} and ${times.at(-1).toISOString()}`);
}

const sessions = await prisma.recommendationFeedSession.findMany({
  where: { userId }, select: { id: true, createdAt: true, depth: true, laps: true, cards: true },
  orderBy: { createdAt: "desc" },
});
console.log(`\nRecommendationFeedSession: ${sessions.length} rows`);
let bytes = 0;
for (const s of sessions) {
  const n = Array.isArray(s.cards) ? s.cards.length : 0;
  const size = Buffer.byteLength(JSON.stringify(s.cards));
  bytes += size;
  console.log(`  ${s.id.slice(0, 10)} ${s.createdAt.toISOString()}  depth ${s.depth}  laps ${s.laps}  ${n} cards  ${(size / 1e6).toFixed(2)} MB`);
}
console.log(`  total snapshot storage ${(bytes / 1e6).toFixed(2)} MB`);
await prisma.$disconnect();

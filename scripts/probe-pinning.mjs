/** Ten consecutive refreshes with impressions accruing, as a reader would. */
import { prisma } from "../lib/prisma.ts";
import { recordEvents } from "../lib/recommendations/events.ts";
import { startSession } from "../lib/recommendations/session.ts";

const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";
const saved = await prisma.recommendationExposure.findMany({ where: { userId } });
await prisma.recommendationExposure.deleteMany({ where: { userId } });

const track = new Map();
const tops = [];
try {
  for (let r = 0; r < 10; r++) {
    const b = await startSession(userId, false);
    const top = b.stored.slice(0, 10).map((s) => s.card);
    tops.push(top.map((c) => c.id));
    console.log(`refresh ${r + 1}  (${b.stored.length} eligible)`);
    top.slice(0, 5).forEach((c, i) => {
      console.log(`   ${i + 1}. [${c.cardType.padEnd(9)}] ${c.title.slice(0, 42).padEnd(43)} ${c.distanceBand}  score ${c.score.toFixed(3)}`);
    });
    b.stored.forEach((s, i) => {
      const k = s.card.title;
      const list = track.get(k) ?? [];
      list.push(i + 1);
      track.set(k, list);
    });
    // The reader sees the first screen, as they would.
    await recordEvents(userId, top.map((c) => ({ key: c.id, type: "IMPRESSION", version: c.version })));
  }
} finally {
  await prisma.recommendationExposure.deleteMany({ where: { userId } });
  if (saved.length) {
    await prisma.recommendationExposure.createMany({
      data: saved.map((r) => { const c = { ...r }; delete c.id; return c; }),
    });
  }
}

console.log("\n── position spread across the ten refreshes (cards that ever hit the top 5) ──");
const rows = [...track.entries()]
  .filter(([, p]) => Math.min(...p) <= 5)
  .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]));
for (const [title, p] of rows.slice(0, 14)) {
  console.log(`  ${title.slice(0, 40).padEnd(41)} ${p.join(", ")}`);
}

console.log("\n── churn in positions 1-10 between consecutive refreshes ──");
for (let i = 1; i < tops.length; i++) {
  const prev = new Set(tops[i - 1]);
  const fresh = tops[i].filter((x) => !prev.has(x)).length;
  const moved = tops[i].filter((x, j) => tops[i - 1][j] !== x).length;
  console.log(`  ${i} → ${i + 1}: ${fresh}/10 new, ${moved}/10 changed slot`);
}
await prisma.$disconnect();

/** Twenty sessions, identical lifecycle state. Does the seed change anything? */
import { prisma } from "../lib/prisma.ts";
import { startSession } from "../lib/recommendations/session.ts";
const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";
const saved = await prisma.recommendationExposure.findMany({ where: { userId } });
await prisma.recommendationExposure.deleteMany({ where: { userId } });
const slots = new Map();
const tops = [];
try {
  for (let r = 0; r < 20; r++) {
    const b = await startSession(userId, false);
    const top = b.stored.slice(0, 10).map((s) => s.card);
    tops.push(top);
    top.forEach((c, i) => {
      const k = `${c.title}`;
      const m = slots.get(k) ?? [];
      m.push(i + 1);
      slots.set(k, m);
    });
  }
} finally {
  await prisma.recommendationExposure.deleteMany({ where: { userId } });
  if (saved.length) await prisma.recommendationExposure.createMany({ data: saved.map((r) => { const c = { ...r }; delete c.id; return c; }) });
}
console.log("── how often each card takes a top-10 slot, across 20 identical-state sessions ──");
for (const [title, pos] of [...slots.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
  const mode = pos.sort((a, b) => a - b)[Math.floor(pos.length / 2)];
  const same = pos.filter((p) => p === mode).length;
  console.log(`  ${title.slice(0, 38).padEnd(39)} appears ${String(pos.length).padStart(2)}/20  median slot ${String(mode).padStart(2)}  same slot ${same}/${pos.length}`);
}
console.log("\n── slot occupancy ──");
for (let slot = 0; slot < 5; slot++) {
  const occupants = new Map();
  for (const t of tops) {
    const k = t[slot]?.title ?? "—";
    occupants.set(k, (occupants.get(k) ?? 0) + 1);
  }
  const top = [...occupants.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`  slot ${slot + 1}: ${top.slice(0, 3).map(([k, n]) => `${k.slice(0, 26)} ×${n}`).join("  |  ")}   (${occupants.size} distinct)`);
}
await prisma.$disconnect();

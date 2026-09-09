/** What each depth band actually adds. */
import { prisma } from "../lib/prisma.ts";
import { buildFeed } from "../lib/discovery/feed.ts";
const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";
for (const depth of [0, 1, 2, 3]) {
  const r = await buildFeed(userId, 0, depth);
  const byTier = new Map();
  for (const c of r.all) byTier.set(c.tier ?? 0, (byTier.get(c.tier ?? 0) ?? 0) + 1);
  const bands = { EXCEPTIONAL: 0, STRONG: 0, SOLID: 0 };
  for (const c of r.all) bands[c.qualityBand]++;
  console.log(`depth ${depth}: ${r.all.length} cards   tiers ${[...byTier].sort().map(([k,v])=>`${k}:${v}`).join(" ")}   E${bands.EXCEPTIONAL} S${bands.STRONG} s${bands.SOLID}`);
}
await prisma.$disconnect();

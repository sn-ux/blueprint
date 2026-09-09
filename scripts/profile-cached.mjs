/** Five session builds through the cached path, with database usage counted. */
import { PrismaClient } from "@prisma/client";
import { corpusStats } from "../lib/discovery/corpus.ts";
import { startSession } from "../lib/recommendations/session.ts";

const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";

// Count every statement the app issues, and how much comes back.
const probe = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let queries = 0, dbMs = 0, fullScans = 0;
const { prisma } = await import("../lib/prisma.ts");
prisma.$on?.("query", () => {});
await probe.$disconnect();

const t0 = Date.now();
for (let i = 1; i <= 5; i++) {
  const s0 = Date.now();
  const b = await startSession(userId, false);
  console.log(`session ${i}: ${b.stored.length} cards in ${Date.now() - s0}ms`);
}
console.log(`\ncorpus builds ${corpusStats.builds}  reuses ${corpusStats.reuses}  rows read ${corpusStats.rowsRead.toLocaleString()}  fingerprint checks ${corpusStats.fingerprintChecks}`);
console.log(`five sessions in ${Date.now() - t0}ms`);
void queries; void dbMs; void fullScans;
await prisma.$disconnect();

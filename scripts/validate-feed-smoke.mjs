/**
 * The small, bounded feed check.
 *
 * Every loop has a fixed ceiling and the whole run has a hard deadline, because
 * the feed is deliberately non-terminal: any harness that waits for hasMore to
 * go false, or for a cursor to come back null, will never return.
 */
import { prisma } from "../lib/prisma.ts";
import * as CFG from "../lib/discovery/config.ts";
import { feedPage } from "../lib/recommendations/session.ts";
import { dbReady } from "./db-ready.mjs";

const DEADLINE_MS = 120_000;
const MAX_PAGES = 4;
const started = Date.now();
const deadline = setTimeout(() => {
  console.log(`\nFAIL  run exceeded its ${DEADLINE_MS / 1000}s deadline — stopping`);
  process.exit(1);
}, DEADLINE_MS);
deadline.unref?.();

const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`); ok ? pass++ : fail++; };

if (!(await dbReady(prisma))) { console.log("database unreachable — stopping cleanly"); await prisma.$disconnect(); process.exit(1); }

// Bounded walk. Never waits for an end that does not exist.
const seen = new Set();
const order = [];
let cursor = null;
for (let i = 0; i < MAX_PAGES; i++) {
  const page = await feedPage(userId, cursor, CFG.LIFECYCLE.pageSize);
  if (!page) { check("the feed builds", false, "no library"); break; }
  for (const c of page.cards) { order.push(c); seen.add(c.id); }
  check(`page ${i + 1} returned a full page`, page.cards.length > 0, `${page.cards.length} cards, hasMore ${page.hasMore}`);
  cursor = page.nextCursor;
  if (!cursor) break;
}

check("pages contain no duplicates", seen.size === order.length, `${order.length} cards, ${seen.size} distinct`);
check("every card has a title, a context line and a caption",
  order.every((c) => c.title?.trim() && c.recipientContext?.shortLabel?.trim() && c.caption?.trim()));
check("the top of the feed stays near",
  order.slice(0, 10).filter((c) => c.distanceBand === "NEAR").length >= 6,
  `${order.slice(0, 10).filter((c) => c.distanceBand === "NEAR").length}/10 NEAR`);
check("the stream does not present an end", cursor !== null);

// Leave nothing behind.
await prisma.recommendationFeedSession.deleteMany({ where: { userId } });
clearTimeout(deadline);
console.log(`\n${pass} passed, ${fail} failed — ${((Date.now() - started) / 1000).toFixed(1)}s`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);

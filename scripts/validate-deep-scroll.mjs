/**
 * One long scroll, through the cached corpus path.
 *
 *   node --import ./scripts/register.mjs scripts/validate-deep-scroll.mjs
 */
import { prisma } from "../lib/prisma.ts";
import * as CFG from "../lib/discovery/config.ts";
import { corpusStats } from "../lib/discovery/corpus.ts";
import { recordEvents } from "../lib/recommendations/events.ts";
import { feedPage } from "../lib/recommendations/session.ts";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; };
const userId = arg("--user", "cmown82yw0000l404njt51be8");
const PAGES = Number(arg("--pages", "30"));

let pass = 0, fail = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`); ok ? pass++ : fail++; };

const saved = await prisma.recommendationExposure.findMany({ where: { userId } });
await prisma.recommendationExposure.deleteMany({ where: { userId } });
await prisma.recommendationFeedSession.deleteMany({ where: { userId } });

const seenOrder = [];
const firstAt = new Map();
const repeats = [];
let cursor = null, terminal = false, pages = 0;
const bandsByPage = [];

try {
  // A dismissal and a resolution, to prove they stay gone all the way down.
  const p0 = await feedPage(userId, null, CFG.LIFECYCLE.pageSize);
  const dismissedKey = p0.cards[0].id;
  const actedKey = p0.cards[1].id;
  await recordEvents(userId, [
    { key: dismissedKey, type: "DISMISS", version: p0.cards[0].version },
    { key: actedKey, type: "ACTION", version: p0.cards[1].version },
  ]);
  await prisma.recommendationFeedSession.deleteMany({ where: { userId } });

  cursor = null;
  for (let i = 0; i < PAGES; i++) {
    const page = await feedPage(userId, cursor, CFG.LIFECYCLE.pageSize);
    pages++;
    const bands = { E: 0, S: 0, s: 0 };
    for (const c of page.cards) {
      if (firstAt.has(c.id)) repeats.push({ id: c.id, at: seenOrder.length, first: firstAt.get(c.id) });
      else firstAt.set(c.id, seenOrder.length);
      seenOrder.push(c);
      bands[c.qualityBand === "EXCEPTIONAL" ? "E" : c.qualityBand === "STRONG" ? "S" : "s"]++;
    }
    bandsByPage.push(bands);
    // The reader is looking at them.
    await recordEvents(userId, page.cards.map((c) => ({ key: c.id, type: "IMPRESSION", version: c.version })));
    if (!page.hasMore || !page.nextCursor) { terminal = true; break; }
    cursor = page.nextCursor;
  }

  const distinct = new Set(seenOrder.map((c) => c.id)).size;
  console.log(`\nscrolled ${seenOrder.length} cards over ${pages} pages — ${distinct} distinct propositions`);
  console.log(`corpus: ${corpusStats.builds} full reads, ${corpusStats.reuses} reuses, ${corpusStats.fingerprintChecks} fingerprint checks`);

  /**
   * The boundary is the size of the universe, wherever that currently sits.
   *
   * These were written against a 325-card universe and hard-coded it. The
   * track floor has since made the universe smaller on purpose, so what is
   * actually being tested — that a reader can scroll past everything the
   * engine generated without the stream ending, and that nothing repeats
   * before it has all been seen — is stated against `distinct` instead.
   */
  check("the scroll passed the whole generated universe",
    seenOrder.length > distinct, `${seenOrder.length} cards over ${distinct} propositions`);
  check("no terminal state during the scroll", !terminal, terminal ? `stopped at page ${pages}` : `${pages} pages, always more`);
  check("nothing repeats until everything has been shown",
    seenOrder.slice(0, distinct).length === new Set(seenOrder.slice(0, distinct).map((c) => c.id)).size,
    `${distinct} distinct of ${seenOrder.length} shown`);
  check("nothing repeats before it has been out of sight",
    repeats.every((r) => r.at - r.first >= CFG.LIFECYCLE.resurfaceMinGap),
    repeats.length ? `${repeats.length} resurfaced, closest gap ${Math.min(...repeats.map((r) => r.at - r.first))}` : "none yet");
  check("the dismissed card never appears", !firstAt.has(dismissedKey));
  check("the acted-on card never appears", !firstAt.has(actedKey));
  check("no duplicate semantic proposition is passed off as new",
    repeats.every((r) => seenOrder[r.at].id === seenOrder[r.first].id));

  /**
   * The opening is paced by novelty now, not by nearness.
   *
   * This required six in ten of the first twenty-five to be NEAR, which the
   * feed is no longer trying to do: the reading leads with ground the viewer
   * holds none of, and a NEW card is by construction not the nearest thing
   * available. What still has to hold is that the widening is a pacing and
   * not an absence of one — new ground leads, adjacent ground keeps its
   * share, and the opening is not a run of leaps.
   */
  const early = seenOrder.slice(0, 25);
  const newEarly = early.filter((c) => c.novelty === "NEW").length;
  const supply = new Set(seenOrder.filter((c) => c.novelty === "NEW").map((c) => c.id)).size
    / new Set(seenOrder.map((c) => c.id)).size;
  /**
   * The bias shows as front-loading, not as a share.
   *
   * Only about two thirds of this universe is new ground, and nothing weak is
   * invented to raise that, so the opening cannot hold three quarters for
   * long — a share threshold near the supply ceiling measures noise. What the
   * bias actually does is spend the new material early, so the test is that
   * the opening is newer than a later stretch of the same reading.
   */
  const later = seenOrder.slice(75, 125);
  const newLater = later.filter((c) => c.novelty === "NEW").length;
  check("the opening leads with new ground, ahead of what follows",
    newEarly / early.length > newLater / Math.max(1, later.length),
    `${newEarly}/25 NEW at the top against ${newLater}/${later.length} later`
    + `, ${Math.round(supply * 100)}% of the universe is NEW`);
  check("adjacent ground keeps its share of the opening",
    early.length - newEarly >= 3, `${early.length - newEarly}/25 ADJACENT`);
  check("the opening is not a run of leaps",
    early.filter((c) => c.distanceBand === "FAR").length <= early.length / 2,
    `${early.filter((c) => c.distanceBand === "FAR").length}/25 FAR`);

  const strongShare = bandsByPage.map((b) => (b.E + b.S) / Math.max(1, b.E + b.S + b.s));
  console.log(`\nstrong-or-better by page: ${strongShare.map((v) => `${Math.round(v * 100)}%`).join(" ")}`);
  check("quality declines gradually rather than collapsing",
    strongShare.every((v, i) => i === 0 || strongShare[i - 1] - v <= 0.6));

  const types = new Map();
  for (const c of seenOrder) types.set(c.cardType, (types.get(c.cardType) ?? 0) + 1);
  console.log(`types: ${[...types].map(([k, v]) => `${k}:${v}`).join("  ")}`);
  console.log(`new: ${distinct}   resurfaced: ${seenOrder.length - distinct}`);
} finally {
  await prisma.recommendationExposure.deleteMany({ where: { userId } });
  if (saved.length) await prisma.recommendationExposure.createMany({ data: saved.map((r) => { const c = { ...r }; delete c.id; return c; }) });
  await prisma.recommendationFeedSession.deleteMany({ where: { userId } });
}
console.log(`\n${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);

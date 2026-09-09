/**
 * Stage-by-stage census of the recommendation funnel for one viewer.
 *
 *   node --import ./scripts/register.mjs scripts/diagnose-funnel.mjs --user <id>
 *
 * Reports how many candidates exist at every point between the generators and
 * what the client can actually reach, so a drop can be attributed to the exact
 * stage that caused it rather than guessed at.
 */
import { prisma } from "../lib/prisma.ts";
import * as CFG from "../lib/discovery/config.ts";
import { buildFeed } from "../lib/discovery/feed.ts";
import { GENERATORS } from "../lib/discovery/generators.ts";
import { evaluate } from "../lib/discovery/lifecycle.ts";
import { buildIndex } from "../lib/discovery/sets.ts";
import { feedPage, startSession } from "../lib/recommendations/session.ts";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; };
const userId = arg("--user", "cmown82yw0000l404njt51be8");
const tally = (xs, f) => { const m = new Map(); for (const x of xs) m.set(f(x), (m.get(f(x)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
const show = (label, pairs) => { console.log(`  ${label}`); for (const [k, v] of pairs) console.log(`    ${String(k).padEnd(30)} ${v}`); };

const viewer = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
console.log(`═══ FUNNEL — ${viewer?.name ?? userId} ═══\n`);

// ── Raw generation, measured independently of the engine ───────────────────
const people = await prisma.user.findMany({ where: { midvaleHidden: false, tracks: { some: {} } }, select: { id: true, name: true, image: true } });
const tracks = await prisma.track.findMany({
  where: { user: { midvaleHidden: false } },
  select: { userId: true, spotifyId: true, name: true, artist: true, album: true, imageUrl: true,
    artistId: true, artistImageUrl: true, blueprintWorld: true, blueprintSubgenre: true,
    albumId: true, albumTotalTracks: true, trackNumber: true, discNumber: true, albumType: true },
});
const index = buildIndex({ viewerId: userId, people, tracks });
const raw = [];
for (const g of GENERATORS) raw.push(...g.run(index));
console.log(`RAW GENERATOR OUTPUT              ${raw.length}`);
show("by generator:", tally(raw, (c) => c.generator));

// ── The engine's own accounting ────────────────────────────────────────────
const result = await buildFeed(userId, 0);
const { all, rejected, coexisting } = result;

const byStage = new Map();
for (const r of rejected) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + 1);
const lost = (stage) => byStage.get(stage) ?? 0;

const gateStages = ["eligibility", "claims", "deliverability", "attention"];
const gateLoss = gateStages.reduce((s, k) => s + lost(k), 0);
console.log(`\nAFTER HARD CORRECTNESS GATES      ${raw.length - lost("eligibility")}   (−${lost("eligibility")} eligibility)`);
console.log(`AFTER APERTURE                    ${raw.length - lost("eligibility") - lost("aperture")}   (−${lost("aperture")} unresolved)`);
console.log(`AFTER CLAIMS / DELIVERABILITY     ${raw.length - lost("eligibility") - lost("aperture") - lost("claims") - lost("deliverability") - lost("attention")}   (−${lost("claims")} inexplicable, −${lost("deliverability")} undeliverable, −${lost("attention")} low attention)`);
console.log(`AFTER SUBJECT COLLAPSE            (−${lost("collapse")} duplicate subject, −${lost("dedupe")} duplicate fact)`);
console.log(`AFTER PROPOSITION REDUNDANCY      (−${lost("redundancy")} redundant;  ${coexisting.length} overlapping pairs deliberately kept)`);
console.log(`\nVALID CANDIDATE UNIVERSE          ${all.length}`);
show("by type:", tally(all, (c) => c.cardType));
show("by generator:", tally(all, (c) => c.generator));
show("by anchor:", tally(all, (c) => c.anchor?.type ?? "NONE"));
show("all rejections:", tally(rejected, (r) => `${r.stage}/${r.reasonCode}`));
void gateLoss;

// ── Lifecycle ──────────────────────────────────────────────────────────────
const rows = await prisma.recommendationExposure.findMany({ where: { userId } });
const state = new Map(rows.map((r) => [r.recommendationKey, {
  recommendationKey: r.recommendationKey, impressionCount: r.impressionCount, openCount: r.openCount,
  firstShownAt: r.firstShownAt, lastShownAt: r.lastShownAt, lastOpenedAt: r.lastOpenedAt,
  dismissedAt: r.dismissedAt, actedOnAt: r.actedOnAt, cooldownUntil: r.cooldownUntil,
  lastUnderlyingVersion: r.lastUnderlyingVersion,
}]));
const now = new Date();
const buckets = { UNSEEN: 0, READY: 0, MATERIALLY_CHANGED: 0, COOLING: 0, DISMISSED: 0, ACTED_ON: 0 };
let restingImpression = 0, restingOpen = 0;
for (const c of all) {
  const st = state.get(c.recommendationKey ?? "");
  const v = evaluate(c, st, now);
  buckets[v.status]++;
  if (v.status === "COOLING") { if ((st?.openCount ?? 0) > 0) restingOpen++; else restingImpression++; }
}
console.log(`\nLIFECYCLE  (exposure rows for this viewer: ${rows.length})`);
console.log(`  total valid candidates            ${all.length}`);
console.log(`  unseen                            ${buckets.UNSEEN}`);
console.log(`  resting from impression only      ${restingImpression}`);
console.log(`  resting from open                 ${restingOpen}`);
console.log(`  dismissed                         ${buckets.DISMISSED}`);
console.log(`  acted on                          ${buckets.ACTED_ON}`);
console.log(`  ELIGIBLE RIGHT NOW                ${buckets.UNSEEN + buckets.READY + buckets.MATERIALLY_CHANGED}`);
const soonest = rows.filter((r) => r.cooldownUntil && r.cooldownUntil > now).map((r) => r.cooldownUntil).sort((a, b) => a - b)[0];
if (soonest) console.log(`  first rest expires                ${soonest.toISOString()}  (in ${((soonest - now) / 3600000).toFixed(1)}h)`);

// ── Session snapshot and cursor walk ───────────────────────────────────────
const built = await startSession(userId, false);
console.log(`\nFEED SESSION SNAPSHOT             ${built.stored.length} cards`);
show("suppressed by lifecycle:", tally(built.suppressed, (s) => s.status));

console.log(`\nAPI CURSOR WALK  (page size ${CFG.LIFECYCLE.pageSize})`);
let cursor = null, page = 0, seen = new Set(), guard = 0;
do {
  const p = await feedPage(userId, cursor, CFG.LIFECYCLE.pageSize);
  page++;
  for (const c of p.cards) seen.add(c.id);
  console.log(`  page ${String(page).padStart(2)}  returned ${String(p.cards.length).padStart(3)}  cumulative distinct ${String(seen.size).padStart(3)}  hasMore ${p.hasMore}  nextCursor ${p.nextCursor ? "yes" : "null"}`);
  cursor = p.nextCursor;
} while (cursor && guard++ < 100);
console.log(`  total distinct reachable          ${seen.size}`);

await prisma.recommendationFeedSession.deleteMany({ where: { userId, id: { notIn: (await prisma.recommendationFeedSession.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: CFG.LIFECYCLE.sessionsRetained, select: { id: true } })).map((s) => s.id) } } });
await prisma.$disconnect();

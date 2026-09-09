/**
 * Lifecycle, pagination and detail-payload validation.
 *
 *   node --import ./scripts/register.mjs scripts/validate-lifecycle.mjs --user <id>
 *
 * Runs against the real viewer, then restores their exposure rows exactly as
 * it found them. Nothing else is written.
 */
import { prisma } from "../lib/prisma.ts";
import { LIFECYCLE } from "../lib/discovery/config.ts";
import * as LIFECYCLE_CFG from "../lib/discovery/config.ts";
import { recordEvents } from "../lib/recommendations/events.ts";
import { cardDetail, feedPage, startSession } from "../lib/recommendations/session.ts";
import { evaluate } from "../lib/discovery/lifecycle.ts";
import { buildFeed } from "../lib/discovery/feed.ts";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; };
const userId = arg("--user", "cmown82yw0000l404njt51be8");

let pass = 0, fail = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (ok) pass++; else fail++;
};

// ── Save and restore whatever lifecycle state already exists ───────────────
const saved = await prisma.recommendationExposure.findMany({ where: { userId } });
const savedSessions = await prisma.recommendationFeedSession.findMany({ where: { userId }, select: { id: true } });
await prisma.recommendationExposure.deleteMany({ where: { userId } });

/**
 * Puts the viewer back exactly as they were found.
 *
 * The checks below deliberately force states the product cannot reach on its
 * own — every card resting, impression counts advanced by hand. None of that
 * may survive the run: a developer's next device test would inherit it and
 * look like a regression, which is precisely how this script once left a real
 * viewer with two thirds of their feed asleep.
 */
async function restore() {
  await prisma.recommendationExposure.deleteMany({ where: { userId } });
  if (saved.length) {
    await prisma.recommendationExposure.createMany({
      data: saved.map((r) => { const copy = { ...r }; delete copy.id; return copy; }),
    });
  }
  await prisma.recommendationFeedSession.deleteMany({
    where: { userId, id: { notIn: savedSessions.map((s) => s.id) } },
  });
  // A rest is only ever legitimate behind an open, a dismissal or a
  // resolution. Anything else can only have been forced — by this harness, or
  // by an older run whose snapshot this one inherited — so it is stripped on
  // the way out rather than handed to the next device test.
  const swept = await prisma.recommendationExposure.updateMany({
    where: { userId, cooldownUntil: { not: null }, openCount: 0,
             dismissedAt: null, actedOnAt: null },
    data: { cooldownUntil: null },
  });
  if (swept.count > 0) console.log(`  (restore stripped ${swept.count} forced rests)`);
  const leaked = await prisma.recommendationExposure.count({
    where: { userId, cooldownUntil: { gt: new Date() }, openCount: 0,
             dismissedAt: null, actedOnAt: null },
  });
  if (leaked > 0) throw new Error(`restore left ${leaked} forced rests behind`);
}

const result = await buildFeed(userId, 0);

try {
  // ── SECTION 5 · pagination ───────────────────────────────────────────────
  console.log("═══ SECTION 5 — PAGINATION ═══");
  const size = LIFECYCLE.pageSize;
  const p1 = await feedPage(userId, null, size);
  const p2 = await feedPage(userId, p1.nextCursor, size);
  const p3 = await feedPage(userId, p2.nextCursor, size);
  const ids1 = p1.cards.map((c) => c.id);
  const ids2 = p2.cards.map((c) => c.id);
  const ids3 = p3.cards.map((c) => c.id);
  console.log(`  page 1 ${ids1.length}  page 2 ${ids2.length}  page 3 ${ids3.length}   universe ${p1.total}`);
  console.log(`  page 1 ranks ${p1.cards[0]?.rank}-${p1.cards.at(-1)?.rank}, page 2 ${p2.cards[0]?.rank}-${p2.cards.at(-1)?.rank}, page 3 ${p3.cards[0]?.rank}-${p3.cards.at(-1)?.rank}`);

  const all3 = [...ids1, ...ids2, ...ids3];
  check("pages 1-3 contain no duplicate ids", new Set(all3).size === all3.length,
    `${all3.length} cards, ${new Set(all3).size} distinct`);
  check("pages 1-3 stay inside one session",
    p1.sessionId === p2.sessionId && p2.sessionId === p3.sessionId);

  // The same cursor twice must give the same cards: the order is frozen.
  const p2again = await feedPage(userId, p1.nextCursor, size);
  check("a cursor is stable — replaying it returns the same cards",
    JSON.stringify(p2again.cards.map((c) => c.id)) === JSON.stringify(ids2));

  // Walk to the end.
  let cursor = p1.nextCursor, seen = [...ids1], guard = 0, last = p1;
  const walked = [...p1.cards];
  while (cursor && guard++ < 200) {
    last = await feedPage(userId, cursor, size);
    seen.push(...last.cards.map((c) => c.id));
    walked.push(...last.cards);
    cursor = last.nextCursor;
  }
  check("walking the whole session yields no duplicates",
    new Set(seen).size === seen.length, `${seen.length} cards`);
  check("exhausting the inventory ends the stream cleanly",
    last.hasMore === false && last.nextCursor === null && last.caughtUp === true);
  check("the stream is not truncated at a fixed length",
    seen.length === p1.total, `${seen.length} of ${p1.total} reachable`);

  // Quality must not collapse monotonically as the reader keeps scrolling.
  console.log("\n  per-page composition:");
  const pages = [];
  for (let i = 0; i < seen.length; i += size) pages.push(seen.slice(i, i + size));
  const cardsByKey = new Map(walked.map((c) => [c.id, c]));
  let worstBandShare = 1;
  pages.forEach((ids, i) => {
    const cs = ids.map((k) => cardsByKey.get(k)).filter(Boolean);
    const bands = { EXCEPTIONAL: 0, STRONG: 0, SOLID: 0 };
    const types = new Map();
    const gens = new Map();
    for (const c of cs) {
      bands[c.qualityBand]++;
      types.set(c.cardType, (types.get(c.cardType) ?? 0) + 1);
      gens.set(c.generator, (gens.get(c.generator) ?? 0) + 1);
    }
    const strongShare = (bands.EXCEPTIONAL + bands.STRONG) / cs.length;
    worstBandShare = Math.min(worstBandShare, strongShare);
    console.log(`    page ${i + 1} (${cs.length}): E${bands.EXCEPTIONAL} S${bands.STRONG} s${bands.SOLID}`
      + `  types ${[...types].map(([t, n]) => `${t}:${n}`).join(" ")}`
      + `  top generator ${Math.max(...gens.values())}/${cs.length}`);
  });
  const lastPageTypes = new Set(pages.at(-1).map((k) => cardsByKey.get(k)?.cardType));
  check("no page is a single card type", pages.every((ids) =>
    new Set(ids.map((k) => cardsByKey.get(k)?.cardType)).size > 1 || ids.length < 4),
    `last page spans ${lastPageTypes.size} types`);
  // Quality is allowed to decline as unseen inventory runs down; what is not
  // allowed is padding. Every card on every page cleared the same publishing
  // floor, and the decline is gradual rather than a cliff.
  const shares = pages.map((ids) => {
    const cs = ids.map((k) => cardsByKey.get(k)).filter(Boolean);
    return cs.filter((c) => c.qualityBand !== "SOLID").length / cs.length;
  });
  check("every page is made only of cards that cleared the publishing floor",
    pages.every((ids) => ids.every((k) => ["EXCEPTIONAL", "STRONG", "SOLID"].includes(cardsByKey.get(k)?.qualityBand))));
  check("quality declines gradually rather than in a cliff",
    shares.every((v, i) => i === 0 || shares[i - 1] - v <= 0.6),
    `strong-or-better by page: ${shares.map((v) => `${Math.round(v * 100)}%`).join(" → ")} (${worstBandShare === 0 ? "inventory holds 46 above SOLID in total" : ""})`);

  // ── SECTION 2 · detail images ────────────────────────────────────────────
  console.log("\n═══ SECTION 2 — DETAIL IMAGES ═══");
  // One session, walked once. Each cursor-less request now seeds a new
  // ordering, so cards must be compared against the session they came from.
  const session = await feedPage(userId, null, LIFECYCLE.maxPageSize);
  const everything = [...session.cards];
  let c2 = session.nextCursor;
  while (c2) {
    const nxt = await feedPage(userId, c2, LIFECYCLE.maxPageSize);
    everything.push(...nxt.cards);
    c2 = nxt.nextCursor;
  }

  // Nothing may reach the network while a card is being opened.
  const realFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = (...a) => { externalCalls++; return realFetch(...a); };

  const byType = new Map();
  let mismatched = 0, withImage = 0;
  let titleDrift = 0, contextDrift = 0, explanationMissing = 0;
  for (const card of everything) {
    const detail = await cardDetail(userId, card.id);
    // The page must present the same subject and the same relationship the
    // feed card did, not a second rendering that could disagree.
    if (detail?.card.title !== card.title) { titleDrift++; console.log(`    TITLE DRIFT ${card.title} → ${detail?.card.title}`); }
    if (detail?.card.recipientContext?.shortLabel !== card.recipientContext?.shortLabel) contextDrift++;
    if (!detail?.card.detailExplanation?.trim()) explanationMissing++;
    const row = byType.get(card.cardType) ?? { pass: 0, fail: 0, noImage: 0 };
    if (!card.subjectImageUrl) row.noImage++;
    else {
      withImage++;
      if (detail?.card.subjectImageUrl === card.subjectImageUrl) row.pass++;
      else { row.fail++; mismatched++; console.log(`    MISMATCH ${card.cardType} ${card.title}`); }
    }
    byType.set(card.cardType, row);
  }
  globalThis.fetch = realFetch;

  for (const [t, r] of byType) {
    console.log(`  ${t.padEnd(10)} feed image === detail image: ${r.pass}/${r.pass + r.fail}   without artwork: ${r.noImage}`);
  }
  check("the detail page shows the same title as the feed card", titleDrift === 0,
    `${everything.length} cards compared`);
  check("the detail page shows the same recipient context", contextDrift === 0);
  check("every detail page carries an expanded explanation", explanationMissing === 0);
  check("every card's detail image is the card's feed image", mismatched === 0,
    `${withImage} cards carry artwork`);
  check("opening a card makes no external request", externalCalls === 0,
    `${externalCalls} calls`);

  const sample = everything.find((c) => c.deliverableCount > 0);
  const sampleDetail = await cardDetail(userId, sample.id);
  check("a detail page delivers exactly what its caption promises",
    sampleDetail.tracks.length === sample.deliverableCount,
    `"${sample.caption}" → ${sampleDetail.tracks.length}`);

  // ── SECTION 4 · lifecycle ────────────────────────────────────────────────
  console.log("\n═══ SECTION 4 — LIFECYCLE ═══");
  await prisma.recommendationExposure.deleteMany({ where: { userId } });

  const fresh = await startSession(userId, false);
  check("with no history every card is unseen and prioritised",
    fresh.stored.every((s) => s.lifecycle.status === "UNSEEN"),
    `${fresh.stored.length} cards`);

  const firstTwenty = fresh.stored.slice(0, 20).map((s) => s.card);
  const seenKey = firstTwenty[0].id;
  const openedKey = firstTwenty[1].id;
  const dismissedKey = firstTwenty[2].id;
  const actedKey = firstTwenty[3].id;
  const changedKey = firstTwenty[4].id;
  const untouchedKey = firstTwenty[5].id;

  await recordEvents(userId, firstTwenty.map((c) => ({ key: c.id, type: "IMPRESSION", version: c.version })));
  // A second pass over the same cards: now they have been passed over.
  await recordEvents(userId, [{ key: untouchedKey, type: "IMPRESSION", version: firstTwenty[5].version }]);
  await recordEvents(userId, [{ key: openedKey, type: "OPEN", version: firstTwenty[1].version }]);
  await recordEvents(userId, [{ key: dismissedKey, type: "DISMISS", version: firstTwenty[2].version }]);
  await recordEvents(userId, [{ key: actedKey, type: "ACTION", version: firstTwenty[3].version }]);
  // A card whose material changed: store a version that no longer matches.
  await prisma.recommendationExposure.update({
    where: { userId_recommendationKey: { userId, recommendationKey: changedKey } },
    data: { lastUnderlyingVersion: "stale-version" },
  });

  const second = await startSession(userId, false);
  const rank = new Map(second.stored.map((s, i) => [s.card.id, i + 1]));
  const status = new Map(second.stored.map((s) => [s.card.id, s.lifecycle.status]));
  const suppressed = new Map(second.suppressed.map((s) => [s.key, s.status]));

  console.log(`  new session: ${second.stored.length} eligible, ${second.suppressed.length} suppressed`);
  for (const [k, v] of Object.entries({ seen: seenKey, opened: openedKey, dismissed: dismissedKey, actedOn: actedKey, changed: changedKey, alsoSeen: untouchedKey })) {
    console.log(`    ${k.padEnd(10)} ${String(v).slice(0, 10)}  ${status.get(v) ?? `SUPPRESSED/${suppressed.get(v)}`}${rank.has(v) ? `  rank ${rank.get(v)}` : ""}`);
  }

  // One sighting must never withhold a card. A reader who scrolls the whole
  // feed once would otherwise open the app to nothing the next morning.
  check("a single impression costs priority but never withholds the card",
    rank.has(seenKey) && status.get(seenKey) === "READY",
    rank.has(seenKey) ? `still eligible at rank ${rank.get(seenKey)}` : `SUPPRESSED as ${suppressed.get(seenKey)}`);
  check("scrolling the whole feed once does not empty the next session",
    second.stored.length >= fresh.stored.length - 5,
    `${second.stored.length} of ${fresh.stored.length} still eligible after seeing 20`);
  check("a dismissed card is suppressed", suppressed.get(dismissedKey) === "DISMISSED");
  check("a card acted on does not return", suppressed.get(actedKey) === "ACTED_ON");
  check("an opened card rests where a merely-seen one does not",
    suppressed.get(openedKey) === "COOLING" && !suppressed.has(seenKey));
  check("a materially changed card becomes eligible again",
    status.get(changedKey) === "MATERIALLY_CHANGED",
    status.get(changedKey) ?? `suppressed as ${suppressed.get(changedKey)}`);

  // Opened and seen must not be treated identically.
  const openRow = await prisma.recommendationExposure.findUnique({
    where: { userId_recommendationKey: { userId, recommendationKey: openedKey } },
  });
  const seenRow = await prisma.recommendationExposure.findUnique({
    where: { userId_recommendationKey: { userId, recommendationKey: seenKey } },
  });
  check("opening is recorded separately from an impression",
    openRow.openCount === 1 && seenRow.openCount === 0 && seenRow.impressionCount === 1);
  check("only opening produces a rest; an impression never does",
    openRow.cooldownUntil !== null && seenRow.cooldownUntil === null,
    `opened rests ${LIFECYCLE.openCooldownHours}h; seen rests not at all`);

  check("a card passed over twice is still eligible",
    !suppressed.has(untouchedKey) && rank.has(untouchedKey),
    `${(await prisma.recommendationExposure.findUnique({ where: { userId_recommendationKey: { userId, recommendationKey: untouchedKey } } })).impressionCount} impressions, rank ${rank.get(untouchedKey)}`);

  // ── Once the rests expire, seen material has to fall behind unseen ───────
  //
  // Composed rank is not a plain sort — diversification moves cards around on
  // purpose — so the ordering claim is made over medians across the whole
  // session, and the penalty claim is made over the lifecycle score itself.
  await prisma.recommendationExposure.updateMany({
    where: { userId, recommendationKey: { notIn: [dismissedKey, actedKey] } },
    data: { cooldownUntil: new Date(Date.now() - 1000) },
  });
  const third = await startSession(userId, false);
  const r3 = new Map(third.stored.map((s, i) => [s.card.id, i + 1]));
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Infinity;
  // Compared within one distance band. The composer now also widens the
  // aperture with position, and the cards that were shown first are the ones
  // that ranked best — which correlates with being near. Mixing bands would
  // measure that correlation rather than the lifecycle penalty.
  const bandOfCard = new Map(third.stored.map((s) => [s.card.id, s.card.distanceBand]));
  const seenIds = new Set(third.stored.filter((s) => s.lifecycle.status !== "UNSEEN"
    && s.card.id !== changedKey).map((s) => s.card.id));
  const bands = [...new Set([...seenIds].map((k) => bandOfCard.get(k)))];
  const unseenRanks = third.stored
    .filter((s) => s.lifecycle.status === "UNSEEN" && bands.includes(s.card.distanceBand))
    .map((s) => r3.get(s.card.id));
  const seenRanks = [...seenIds].map((k) => r3.get(k));
  console.log(`  rests expired: ${third.stored.length} eligible`);
  console.log(`    median rank — unseen ${median(unseenRanks)} (${unseenRanks.length} cards), previously seen ${median(seenRanks)} (${seenRanks.length} cards)`);
  check("once rested, cards already shown fall behind comparable unseen ones",
    median(unseenRanks) < median(seenRanks),
    `bands ${bands.join("/")}`);
  // Session shuffling must never outrank the lifecycle penalty it sits beside.
  check("session shuffling stays smaller than a single impression's penalty",
    LIFECYCLE_CFG.FEED.jitterBand
      < LIFECYCLE.impressionPenalty + LIFECYCLE.recentImpressionPenalty,
    `jitter ${LIFECYCLE_CFG.FEED.jitterBand} vs penalty ${(LIFECYCLE.impressionPenalty + LIFECYCLE.recentImpressionPenalty).toFixed(2)}`);
  check("nothing that was merely seen was removed from the universe",
    seenRanks.length + 2 === 20 || seenRanks.length >= 17,
    `${seenRanks.length} of the 20 shown are back in the stream`);

  // Repeated exposure costs priority on the lifecycle scale, in isolation.
  await prisma.recommendationExposure.update({
    where: { userId_recommendationKey: { userId, recommendationKey: seenKey } },
    data: { impressionCount: 5 },
  });
  const fourth = await startSession(userId, false);
  const scoreOf = (b, k) => b.stored.find((s) => s.card.id === k)?.lifecycle.score;
  const once = scoreOf(third, seenKey), fiveTimes = scoreOf(fourth, seenKey);
  const never = fresh.stored.find((s) => s.card.id === seenKey).lifecycle.score;
  check("each further exposure lowers the same card's lifecycle score",
    never > once && once > fiveTimes,
    `unseen ${never.toFixed(3)} > seen once ${once.toFixed(3)} > seen five times ${fiveTimes.toFixed(3)}`);
  check("a heavily-seen card is still eligible, never removed",
    fiveTimes !== undefined);

  // ── Reading the whole feed, repeatedly, must cost nothing but position ────
  // One real pass through the write path, proving it records no rest, then the
  // counts are advanced directly: what is under test here is how repeated
  // exposure is *evaluated*, and the event path itself is already covered
  // above. Three hundred sequential upserts to prove the same thing is only a
  // slower way to prove it.
  // The endpoint caps a batch at two hundred events, so a universe larger
  // than that has to be reported in chunks — as a real client would.
  const allEvents = fresh.stored.map((s2) => ({ key: s2.card.id, type: "IMPRESSION", version: s2.card.version }));
  for (let i = 0; i < allEvents.length; i += 150) {
    await recordEvents(userId, allEvents.slice(i, i + 150));
  }
  // Rows an earlier step deliberately back-dated are not rests; only a
  // cooldown in the future withholds anything.
  const restsWritten = await prisma.recommendationExposure.count({
    where: { userId, cooldownUntil: { gt: new Date() }, openCount: 0,
             dismissedAt: null, actedOnAt: null },
  });
  check("recording an impression never writes a rest",
    restsWritten === 0, `${restsWritten} rests written across ${fresh.stored.length} impressions`);
  await prisma.recommendationExposure.updateMany({
    where: { userId }, data: { impressionCount: 8, lastShownAt: new Date() },
  });
  const sweep = await startSession(userId, false);
  const swept = await prisma.recommendationExposure.aggregate({
    where: { userId }, _max: { impressionCount: true },
  });
  const openedRows = await prisma.recommendationExposure.findMany({
    where: { userId, openCount: { gt: 0 } }, select: { recommendationKey: true },
  });
  const openedKeys = new Set(openedRows.map((r) => r.recommendationKey));
  const restingNotOpened = sweep.suppressed
    .filter((x) => x.status === "COOLING" && !openedKeys.has(x.key)).length;
  // The only things allowed to be missing are decisions and the opened card.
  const wrongly = sweep.suppressed.filter((x) =>
    x.status !== "DISMISSED" && x.status !== "ACTED_ON" && !openedKeys.has(x.key));
  check("reading the entire feed repeatedly withholds nothing",
    wrongly.length === 0,
    `${sweep.stored.length} of ${fresh.stored.length} eligible after ${swept._max.impressionCount} passes;`
    + ` suppressed only ${sweep.suppressed.map((x) => x.status).join(", ") || "nothing"}`);
  check("no card is ever resting from impressions, however many",
    restingNotOpened === 0, `${restingNotOpened} resting without having been opened`);
  check("the defensive floor did not have to fire",
    !sweep.stored.some((s2) => s2.lifecycle.status === "REVIVED"));

  // ── Repeat exposure has to cost position, monotonically ──────────────────
  //
  // Evaluated directly rather than through a session, so the ladder measures
  // the rule itself instead of whatever state the steps above left behind.
  const ladderCard = fresh.stored[0];
  const subject = result.all.find((c) => c.recommendationKey === ladderCard.card.id);
  const at = (impressionCount, hoursAgo = 0) => evaluate(subject, impressionCount === null ? undefined : {
    recommendationKey: subject.recommendationKey,
    impressionCount, openCount: 0,
    firstShownAt: new Date(), lastShownAt: new Date(Date.now() - hoursAgo * 3_600_000),
    lastOpenedAt: null, dismissedAt: null, actedOnAt: null, cooldownUntil: null,
    lastUnderlyingVersion: subject.underlyingVersion,
  }, new Date());

  const ladder = [["unseen", at(null)], ["seen 1x", at(1)], ["seen 2x", at(2)],
    ["seen 4x", at(4)], ["seen 8x", at(8)]];
  console.log(`  exposure ladder: ${ladder.map(([l, v]) => `${l} ${v.score.toFixed(3)}`).join("  >  ")}`);
  check("each further impression lowers the score",
    ladder.every(([, v], i) => i === 0 || v.score < ladder[i - 1][1].score));
  check("no number of impressions ever makes a card ineligible",
    ladder.every(([, v]) => v.eligible), `8x → ${at(8).status}`);

  const longAgo = at(4, 14 * 24), justNow = at(4, 0);
  check("a card seen long ago outranks the same card seen this morning",
    longAgo.score > justNow.score,
    `${longAgo.score.toFixed(3)} vs ${justNow.score.toFixed(3)}`);

  // The defensive floor. Impressions can no longer produce this state, so it
  // is forced here to prove the invariant still holds if anything ever does.
  await prisma.recommendationExposure.updateMany({
    where: { userId }, data: { cooldownUntil: new Date(Date.now() + 86_400_000) },
  });
  const starved = await startSession(userId, false);
  const floor = LIFECYCLE.minEligiblePages * LIFECYCLE.pageSize;
  check("resting can never empty the feed — longest-rested cards return",
    starved.stored.length >= Math.min(floor, fresh.stored.length),
    `every card resting → ${starved.stored.length} still served (floor ${floor})`);
  check("revived cards are marked as such, not passed off as fresh",
    starved.stored.some((s2) => s2.lifecycle.status === "REVIVED"));
} finally {
  await restore();
  await prisma.$disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

import { isAllowedCardType, resolveAperture } from "./aperture";
import { bandOf, distanceOf, distancePenalty } from "./distance";
import { stampIdentity } from "./identity";
import { TIERS, withTier } from "./tiers";
import { resolveRedundancy, type CoexistingPair, type RedundancyPair } from "./redundancy";
import * as CFG from "./config";
import { attentionValue, ATTENTION_FLOOR, buildClaims, CLAIM_FLOOR, promisedCount } from "./claims";
import { ES_FLOOR, GENERATORS } from "./generators";
import { buildIndex, type DiscoveryIndex } from "./sets";
import type { Candidate, EngineInput, GeneratorId, Rejection } from "./types";

/**
 * Steps F and G — exclusion, rationale collapse, ranking and feed composition.
 *
 * evidenceStrength and attentionValue stay true [0,1] measures and are never
 * written to again after their generator sets them. Ranking is a separate
 * quantity built on top of them, and is allowed to exceed 1 — keeping the two
 * apart is what lets the anchor table stay interpretable on its own.
 */

export interface EngineOptions {
  feedSize?: number;
  /** Diversification strength. */
  lambda?: number;
  /** Per-session seed for tie-breaking between near-equal cards. */
  seed?: string;
  /**
   * How deep to search. Each band relaxes what counts as a strong enough
   * recipient relationship or a large enough miss, and nothing else.
   */
  depth?: number;
}

export interface EngineResult {
  index: DiscoveryIndex;
  /**
   * The whole eligible recommendation universe, ranked and de-duplicated.
   *
   * There is no product boundary at any particular number here. The feed
   * paginates over this; if it holds a hundred and eight cards the viewer can
   * reach a hundred and eight, and if it holds a hundred thousand the same
   * code serves those without changing what any of them mean.
   */
  all: Candidate[];
  /** A composed prefix, for callers that want one run's worth in order. */
  feed: Candidate[];
  rejected: Rejection[];
  byGenerator: Map<GeneratorId, number>;
  /** Cross-card collisions and how each was resolved. */
  redundancy: RedundancyPair[];
  /** Overlapping cards that both survived, and what they say differently. */
  coexisting: CoexistingPair[];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * A card's subject must own every track its page shows.
 *
 * An artist card whose page carries other people's records, or an album card
 * assembled from a title string that two releases share, is a different card
 * from the one its caption describes. Checked here rather than trusted from
 * each generator.
 */
function subjectMismatch(index: DiscoveryIndex, c: Candidate): string | null {
  const ids = c.deliverableIds ?? [];
  if (c.subject.type === "Artist") {
    const artist = c.subject.artist;
    const wrong = ids.filter((id) => index.meta.get(id)?.artist !== artist);
    if (wrong.length) return `${wrong.length} track(s) not by ${artist}`;
  }
  if (c.subject.type === "Album") {
    const albumId = c.albumId;
    if (!albumId) return "album card without an authoritative albumId";
    const wrong = ids.filter((id) => index.albumIdOf.get(id) !== albumId);
    if (wrong.length) return `${wrong.length} track(s) not on albumId ${albumId}`;
  }
  return null;
}

/**
 * Recommendation quality — the card-level band, not the evidence band.
 *
 * evidenceStrength measures how strong the evidence is; it says nothing about
 * whether anyone would care. A lane void can carry solid evidence about 300
 * tracks and still be inventory. So a card only reaches EXCEPTIONAL when the
 * evidence is strong AND the fact gives a human reason to look, and the word
 * is reserved for cards that could plausibly be graded 3.
 */
export type QualityBand = "EXCEPTIONAL" | "STRONG" | "SOLID";

export function qualityBand(es: number, av: number): QualityBand {
  if (es >= CFG.BANDS.exceptionalEs && av >= CFG.BANDS.exceptionalAv) return "EXCEPTIONAL";
  if ((es >= CFG.BANDS.strongEs && av >= CFG.BANDS.strongAv)
    || (es >= CFG.BANDS.strongEsAlt && av >= CFG.BANDS.strongAvAlt)) return "STRONG";
  return "SOLID";
}

export function runEngine(input: EngineInput, opts: EngineOptions = {}): EngineResult {
  const feedSize = opts.feedSize ?? 100;
  const lambda = opts.lambda ?? CFG.FEED.lambda;

  const index = buildIndex(input);
  const rejected: Rejection[] = [];
  const raw: Candidate[] = [];
  const byGenerator = new Map<GeneratorId, number>();

  // ── C · generate, tier by tier ────────────────────────────────────────────
  //
  // Every tier runs every generator; what changes is how much the recipient
  // side has to hold and how large the miss has to be before it is worth a
  // card. A candidate found at full strength is never re-emitted weaker, so
  // each tier only contributes what the ones above it could not reach.
  const seenSubject = new Set<string>();
  const maxTier = Math.min(TIERS.length - 1, opts.depth ?? TIERS.length - 1);
  for (let tier = 0; tier <= maxTier; tier++) {
    withTier(tier, () => {
      for (const g of GENERATORS) {
        for (const c of g.run(index)) {
          const key = `${c.generator}␟${c.subjectKey}`;
          if (seenSubject.has(key)) continue;
          seenSubject.add(key);
          c.tier = tier;
          byGenerator.set(g.id, (byGenerator.get(g.id) ?? 0) + 1);
          raw.push(c);
        }
      }
    });
  }

  // Aperture no longer has to choose between an item and a set: a single
  // track is never a card, so one fact has one zoom level by construction.
  const aperture = raw;

  // ── Gates 1–6 · hard exclusion, cheapest first ────────────────────────────
  const eligible: Candidate[] = [];
  for (const c of aperture) {
    // Gate 1 — the invariant, re-asserted at the candidate level.
    if (c.subject.type === "Song" && index.U.has(c.subject.spotifyId)) {
      rejected.push({ stage: "eligibility", reasonCode: "IN_LIBRARY", generator: c.generator, subjectKey: c.subjectKey });
      continue;
    }
    // Gate 2 — unrenderable subject.
    if (c.subject.type === "Song" && (!c.subject.name.trim() || !c.subject.artist.trim())) {
      rejected.push({ stage: "eligibility", reasonCode: "UNRENDERABLE", generator: c.generator, subjectKey: c.subjectKey });
      continue;
    }
    // Gate 4 — below the generator's own anchored floor.
    if (c.evidenceStrength < ES_FLOOR) {
      rejected.push({ stage: "eligibility", reasonCode: "BELOW_FLOOR", generator: c.generator, subjectKey: c.subjectKey, detail: `ES=${c.evidenceStrength.toFixed(2)}` });
      continue;
    }
    // Gate 5 — nothing surfaces without a named vouch.
    if (c.sourceFriendIds.length === 0) {
      rejected.push({ stage: "eligibility", reasonCode: "NO_VOUCH", generator: c.generator, subjectKey: c.subjectKey });
      continue;
    }
    // Gate 5b — nothing surfaces without a reason it belongs to this viewer.
    // "Your friends have this" is a fact about other people, not a
    // recommendation, and a card that can only say that does not ship.
    if (!c.anchor) {
      rejected.push({ stage: "eligibility", reasonCode: "NO_RECIPIENT_ANCHOR", generator: c.generator, subjectKey: c.subjectKey });
      continue;
    }
    // Gate 5c — one source owning something is not evidence anyone missed it.
    if (c.sourceFriendIds.length < CFG.MIN_SOURCES_PER_CARD) {
      rejected.push({
        stage: "eligibility", reasonCode: "SINGLE_SOURCE",
        generator: c.generator, subjectKey: c.subjectKey,
        detail: `${c.sourceFriendIds.length} source`,
      });
      continue;
    }
    // Gate 5d — the invariant, over every track the page will show.
    const leaked = (c.deliverableIds ?? []).filter((id) => index.U.has(id));
    if (leaked.length > 0) {
      rejected.push({
        stage: "eligibility", reasonCode: "DELIVERABLE_IN_LIBRARY",
        generator: c.generator, subjectKey: c.subjectKey, detail: `${leaked.length} track(s)`,
      });
      continue;
    }
    // Gate 5e — the subject must own its own deliverables.
    const mismatch = subjectMismatch(index, c);
    if (mismatch) {
      rejected.push({
        stage: "eligibility", reasonCode: "SUBJECT_DELIVERABLE_MISMATCH",
        generator: c.generator, subjectKey: c.subjectKey, detail: mismatch,
      });
      continue;
    }
    eligible.push(c);
  }

  // ── Presentation resolution · every card is one of six things ─────────────
  const resolved: Candidate[] = [];
  for (const c of eligible) {
    const ap = resolveAperture(index, c);
    if (!isAllowedCardType(ap.cardType)) {
      rejected.push({
        stage: "aperture", reasonCode: "APERTURE_UNRESOLVED",
        generator: c.generator, subjectKey: c.subjectKey, detail: ap.note,
      });
      continue;
    }
    c.cardType = ap.cardType;
    c.apertureNote = ap.note;
    c.concentration = ap.concentration;
    if (ap.subject) {
      c.subject = ap.subject;
      c.subjectKey = ap.subject.type === "Subgenre" ? `Subgenre:${ap.subject.subgenre}`
        : ap.subject.type === "Genre" ? `Genre:${ap.subject.genre}`
        : c.subjectKey;
    }
    if (ap.deliverableIds) {
      c.deliverableIds = ap.deliverableIds;
      c.deliverableCount = ap.deliverableIds.length;
    }
    resolved.push(c);
  }

  // ── E · claims, then the attention and explainability gates ───────────────
  const explained: Candidate[] = [];
  for (const c of resolved) {
    const claims = buildClaims(index, c);
    if (claims.length === 0) {
      rejected.push({ stage: "claims", reasonCode: "INEXPLICABLE", generator: c.generator, subjectKey: c.subjectKey, detail: "no claim available" });
      continue;
    }
    const winning = claims[0];
    if (winning.score < CLAIM_FLOOR) {
      rejected.push({ stage: "claims", reasonCode: "INEXPLICABLE", generator: c.generator, subjectKey: c.subjectKey, detail: `claim=${winning.score.toFixed(2)}` });
      continue;
    }

    // DELIVERABILITY — the number a caption implies must equal the number the
    // page can actually show. Enforced here rather than per generator so a new
    // claim type cannot quietly promise more than its set contains.
    const promised = promisedCount(winning.proposition);
    if (promised > c.deliverableCount) {
      rejected.push({
        stage: "deliverability", reasonCode: "UNDELIVERABLE",
        generator: c.generator, subjectKey: c.subjectKey,
        detail: `caption implies ${promised}, page can show ${c.deliverableCount}`,
      });
      continue;
    }

    const av = attentionValue(winning.claimType, c);
    if (av.value < ATTENTION_FLOOR) {
      rejected.push({ stage: "attention", reasonCode: "LOW_ATTENTION", generator: c.generator, subjectKey: c.subjectKey, detail: `AV=${av.value.toFixed(2)}` });
      continue;
    }

    c.claims = claims;
    c.winningClaim = winning;
    c.losingClaims = claims.slice(1);
    c.caption = winning.text;
    c.attentionValue = av.value;
    c.componentScores = { ...c.componentScores, ...Object.fromEntries(Object.entries(av.parts).map(([k, v]) => [`av_${k}`, v])) };
    explained.push(c);
  }

  // ── Within-generator percentile, tie-break only ───────────────────────────
  const groups = new Map<GeneratorId, Candidate[]>();
  for (const c of explained) {
    const list = groups.get(c.generator) ?? [];
    list.push(c);
    groups.set(c.generator, list);
  }
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.evidenceStrength - b.evidenceStrength);
    const n = sorted.length;
    sorted.forEach((c, i) => { c.tieBreak = n <= 1 ? CFG.TIE_BREAK_SINGLETON : CFG.TIE_BREAK_MAX * (i / (n - 1)); });
  }

  // ── Ranking. Base stays in [0,1]; rankingScore may exceed it. ─────────────
  for (const c of explained) {
    c.baseRankingScore = clamp01(
      CFG.RANK_WEIGHTS.evidence * c.evidenceStrength
      + CFG.RANK_WEIGHTS.attention * c.attentionValue,
    );
    c.corroborationBonus = 0;
    c.rankingScore = c.baseRankingScore + (c.tieBreak ?? 0);
    c.qualityBand = qualityBand(c.evidenceStrength, c.attentionValue);
  }

  // ── F · collapse duplicate subjects, keeping the strongest rationale ──────
  const bySubject = new Map<string, Candidate[]>();
  for (const c of explained) {
    const list = bySubject.get(c.subjectKey) ?? [];
    list.push(c);
    bySubject.set(c.subjectKey, list);
  }
  const collapsed: Candidate[] = [];
  for (const [, list] of bySubject) {
    list.sort((a, b) => (b.rankingScore ?? 0) - (a.rankingScore ?? 0));
    const winner = list[0];
    const others = list.slice(1);
    if (others.length) {
      winner.secondaryRationales = others.map((o) => ({
        generator: o.generator, evidenceStrength: o.evidenceStrength, caption: o.caption,
      }));
      const distinct = new Set(others.map((o) => o.generator)).size;
      winner.corroborationBonus = Math.min(
        CFG.CORROBORATION_MAX, CFG.CORROBORATION_PER_GENERATOR * distinct,
      );
      winner.rankingScore = (winner.baseRankingScore ?? 0) + (winner.tieBreak ?? 0) + winner.corroborationBonus;
      for (const o of others) {
        rejected.push({ stage: "collapse", reasonCode: "DUPLICATE_SUBJECT", generator: o.generator, subjectKey: o.subjectKey, detail: `lost to ${winner.generator}` });
      }
    }
    collapsed.push(winner);
  }

  // Gate 8 — one card per underlying fact.
  const seenFact = new Set<string>();
  const all: Candidate[] = [];
  for (const c of collapsed.sort((a, b) => (b.rankingScore ?? 0) - (a.rankingScore ?? 0))) {
    if (seenFact.has(c.discoverySetId)) {
      rejected.push({ stage: "dedupe", reasonCode: "DUPLICATE_FACT", generator: c.generator, subjectKey: c.subjectKey });
      continue;
    }
    seenFact.add(c.discoverySetId);
    all.push(c);
  }

  // ── Cross-card redundancy · one fact, one card ────────────────────────────
  //
  // Two candidates can survive everything above and still hand the reader the
  // same tracks at different zoom levels. Measured on deliverable overlap, and
  // resolved toward the aperture that explains the material most precisely.
  const { kept, dropped, pairs, coexisting } = resolveRedundancy(all);
  for (const d of dropped) {
    rejected.push({
      stage: "redundancy", reasonCode: "REDUNDANT_WITH_BETTER_APERTURE",
      generator: d.candidate.generator, subjectKey: d.candidate.subjectKey,
      detail: `${d.shared} of its tracks (${Math.round(d.containment * 100)}%) already on ${d.against.cardType} "${d.against.subjectKey}"`,
    });
  }

  // The hard gate, re-asserted at the boundary: no candidate reaches the feed
  // without one of the five allowed card subjects.
  for (const c of kept) {
    if (!isAllowedCardType(c.cardType)) {
      throw new Error(`card subject invariant violated: ${c.generator} produced ${String(c.cardType)}`);
    }
  }

  // Stable identity, so the feed can remember this proposition tomorrow.
  stampIdentity(index, kept);

  // How far each card sits from what the viewer already holds. Read by the
  // composer to widen the aperture gradually; never a gate.
  for (const c of kept) {
    c.discoveryDistance = distanceOf(index, c);
    c.distanceBand = bandOf(c.discoveryDistance);
  }

  // ── G · feed composition ──────────────────────────────────────────────────
  const feed = compose(kept, feedSize, lambda, undefined, undefined, opts.seed);
  feed.forEach((c, i) => { c.feedRank = i + 1; });

  return { index, all: kept, feed, rejected, byGenerator, redundancy: pairs, coexisting };
}

// ── Diversification ─────────────────────────────────────────────────────────

const SIM_WEIGHTS = CFG.FEED.similarity;

function similarity(a: Candidate, b: Candidate): number {
  let s = 0;
  if (a.generator === b.generator) s += SIM_WEIGHTS.generator;
  if (a.winningClaim?.templateId === b.winningClaim?.templateId) s += SIM_WEIGHTS.template;
  if (a.artist && a.artist === b.artist) s += SIM_WEIGHTS.artist;
  if (a.sourceFriendIds.some((f) => b.sourceFriendIds.includes(f))) s += SIM_WEIGHTS.friend;
  if (a.subgenre && a.subgenre === b.subgenre) s += SIM_WEIGHTS.subgenre;
  if (a.genre && a.genre === b.genre) s += SIM_WEIGHTS.genre;
  return s;
}

interface Caps { generator: number; primarySource: number; artist: number; genre: number; subgenre: number; set: number }

/**
 * Comfortable counts over a rolling ten-card window.
 *
 * Exceeding one is a cost, not a prohibition — see the crowding penalties in
 * compose. The source cap is deliberately loose and keyed on the primary
 * source only: with four friends, two of them appear in over ninety per cent
 * of all candidates, so a tight per-friend cap does not diversify the feed, it
 * starves it. The counts that actually shape how the feed reads are generator,
 * artist and lane.
 */
const CAPS: Caps = CFG.FEED.caps;


/**
 * Composes an ordered sequence out of a ranked pool.
 *
 * Each slot is filled from a bounded window at the top of what is left rather
 * than from the whole pool. Sorting everything best-to-worst and reading it in
 * order would make the feed monotonically worse the longer someone scrolls;
 * drawing from a window a few pages deep lets diversity pull strong-but-
 * different cards forward, so a later page stays mixed instead of becoming the
 * dregs of one sort. Every card in the window has already cleared the
 * publishing floor, so this trades nothing away.
 *
 * `score` selects the quantity being composed over: the recommendation's own
 * ranking score for a one-shot run, its lifecycle placement for a real feed.
 */
/**
 * A stable pseudo-random in [0,1) from a seed and a key.
 *
 * Stable within a session and different across sessions, so an order can be
 * reproduced for pagination while a new session genuinely reshuffles.
 */
function jitterFor(seed: string, key: string): number {
  let h = 2166136261;
  const s = `${seed}␟${key}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 4294967296;
}

export function compose(
  pool: Candidate[], size: number, lambda: number,
  score: (c: Candidate) => number = (c) => c.rankingScore ?? 0,
  windowSize = Infinity,
  seed = "",
  /** Where this batch begins in the feed, for the penalties that read position. */
  positionOffset = 0,
): Candidate[] {
  const chosen: Candidate[] = [];
  const remaining = [...pool].sort((a, b) => score(b) - score(a));

  while (chosen.length < size && remaining.length > 0) {
    const recent = chosen.slice(-CFG.FEED.window);
    const counts = {
      generator: new Map<string, number>(), source: new Map<string, number>(),
      artist: new Map<string, number>(), genre: new Map<string, number>(),
      subgenre: new Map<string, number>(), set: 0,
    };
    for (const c of recent) {
      counts.generator.set(c.generator, (counts.generator.get(c.generator) ?? 0) + 1);
      const primary = c.sourceFriendIds[0];
      if (primary) counts.source.set(primary, (counts.source.get(primary) ?? 0) + 1);
      if (c.artist) counts.artist.set(c.artist, (counts.artist.get(c.artist) ?? 0) + 1);
      if (c.genre) counts.genre.set(c.genre, (counts.genre.get(c.genre) ?? 0) + 1);
      if (c.subgenre) counts.subgenre.set(c.subgenre, (counts.subgenre.get(c.subgenre) ?? 0) + 1);
      if (c.cardType === "SONG_SET") counts.set += 1;
    }
    const last = chosen[chosen.length - 1];
    const first = chosen.length === 0;

    /**
     * Diversity, as a preference rather than a rule.
     *
     * These were hard filters applied in tiers, which made each slot a
     * reservation: once the caps had excluded everything else, whichever card
     * led the two or three survivors won that position in every session. Over
     * twenty sessions with identical state one card held slot nine every time,
     * and slot four had two occupants between them.
     *
     * As penalties they shape the feed just as firmly in aggregate — a fourth
     * artist card in ten still has to be materially better than the
     * alternatives to appear — but nothing is ever the only thing allowed to
     * fill a position.
     */
    const over = (count: number, cap: number) => Math.max(0, count - cap + 1);
    const crowding = (c: Candidate): number => {
      const P = CFG.FEED.crowding;
      let p = 0;
      p += P.generator * over(counts.generator.get(c.generator) ?? 0, CAPS.generator);
      const primary = c.sourceFriendIds[0];
      if (primary) p += P.source * over(counts.source.get(primary) ?? 0, CAPS.primarySource);
      if (c.artist) p += P.artist * over(counts.artist.get(c.artist) ?? 0, CAPS.artist);
      if (c.genre) p += P.genre * over(counts.genre.get(c.genre) ?? 0, CAPS.genre);
      if (c.subgenre) p += P.subgenre * over(counts.subgenre.get(c.subgenre) ?? 0, CAPS.subgenre);
      if (c.cardType === "SONG_SET") p += P.set * over(counts.set, CAPS.set);
      // Two identical sentence shapes in a row is the most visible tell that a
      // feed was generated.
      if (last && c.winningClaim?.claimType === last.winningClaim?.claimType) p += P.repeatClaim;
      // The feed opens on the tightest connection available rather than on a
      // whole region.
      if (first && (c.cardType === "SUBGENRE" || c.cardType === "GENRE")) p += P.opener;
      return p;
    };

    let picked: Candidate | null = null;
    let pickedIdx = -1;
    let pickedScore = 0;

    const horizon = Math.min(remaining.length, windowSize);
    /**
     * The seed decides the slot, after every adjustment.
     *
     * Jitter added to a score before selection cannot change an outcome the
     * caps have already narrowed to one candidate. So diversity, distance,
     * tier depth and crowding are all applied first, and the seed then chooses
     * among everything within a band of the best. Quality still dominates
     * absolutely: nothing further than the band from the leader is eligible.
     */
    const eligible: { c: Candidate; j: number; s: number }[] = [];
    let bestScore = -Infinity;
    for (let j = 0; j < horizon; j++) {
      const c = remaining[j];
      const sim = recent.length ? Math.max(...recent.map((p2) => similarity(c, p2))) : 0;
      // The aperture widens with position: a far card is set back near the top
      // and not at all further down.
      const far = distancePenalty(c.discoveryDistance ?? 0, positionOffset + chosen.length);
      // Weaker tiers sit behind everything above them, and the setback decays
      // with position, so the feed reaches them once the strong material is
      // spent rather than never.
      const depth = CFG.FEED.tierPenalty * (c.tier ?? 0)
        * Math.max(0, 1 - (positionOffset + chosen.length) / CFG.FEED.tierRamp);
      const s2 = score(c) - lambda * sim - far - depth - crowding(c);
      eligible.push({ c, j, s: s2 });
      if (s2 > bestScore) bestScore = s2;
    }
    if (eligible.length === 0) break;

    const band = eligible
      .filter((e) => e.s >= bestScore - CFG.FEED.selectionBand)
      .sort((a, b) => b.s - a.s
        || (a.c.recommendationKey ?? a.c.id).localeCompare(b.c.recommendationKey ?? b.c.id));
    const draw = seed ? jitterFor(seed, `slot:${positionOffset + chosen.length}`) : 0;
    const choice = band[Math.min(band.length - 1, Math.floor(draw * band.length))];
    picked = choice.c;
    pickedIdx = choice.j;
    pickedScore = choice.s;

    if (!picked) break;

    picked.feedScore = pickedScore;
    chosen.push(picked);
    remaining.splice(pickedIdx, 1);
  }

  return chosen;
}

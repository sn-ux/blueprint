import { attentionValue, ATTENTION_FLOOR, buildClaims, CLAIM_FLOOR } from "./claims";
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
}

export interface EngineResult {
  index: DiscoveryIndex;
  all: Candidate[];         // survived eligibility, collapsed, ranked
  feed: Candidate[];        // after diversification
  rejected: Rejection[];
  byGenerator: Map<GeneratorId, number>;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

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
  if (es >= 0.80 && av >= 0.90) return "EXCEPTIONAL";
  if ((es >= 0.68 && av >= 0.80) || (es >= 0.55 && av >= 0.95)) return "STRONG";
  return "SOLID";
}

export function runEngine(input: EngineInput, opts: EngineOptions = {}): EngineResult {
  const feedSize = opts.feedSize ?? 100;
  const lambda = opts.lambda ?? 0.35;

  const index = buildIndex(input);
  const rejected: Rejection[] = [];
  const raw: Candidate[] = [];
  const byGenerator = new Map<GeneratorId, number>();

  // ── C · generate ──────────────────────────────────────────────────────────
  for (const g of GENERATORS) {
    const produced = g.run(index);
    byGenerator.set(g.id, produced.length);
    raw.push(...produced);
  }

  // ── Aperture · item or set, never both for one fact ───────────────────────
  //
  // A set and its members are the same discovery fact at two zoom levels, and
  // showing both puts it in the feed twice. Small sets read better as their
  // individual items; large ones read better as the aggregate. Applied to the
  // unanimous pair, which is the only place today where one fact has both.
  const unanimousItems = raw.filter((c) => c.generator === "UNANIMOUS_MISS");
  const APERTURE_ITEM_MAX = 5;
  const dropSet = unanimousItems.length > 0 && unanimousItems.length <= APERTURE_ITEM_MAX;
  const aperture = raw.filter((c) => {
    if (c.generator === "UNANIMOUS_SET" && dropSet) {
      rejected.push({ stage: "aperture", reasonCode: "APERTURE_ITEM_PREFERRED", generator: c.generator, subjectKey: c.subjectKey, detail: `${unanimousItems.length} members` });
      return false;
    }
    if (c.generator === "UNANIMOUS_MISS" && !dropSet) {
      rejected.push({ stage: "aperture", reasonCode: "APERTURE_SET_PREFERRED", generator: c.generator, subjectKey: c.subjectKey });
      return false;
    }
    return true;
  });

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
    // Gate 5 — no named source. Nothing surfaces without a vouch, except
    // genre-level magnitude which names no one by construction and is gated
    // out on attention instead.
    if (c.sourceFriendIds.length === 0 && c.generator !== "GENRE_GAP") {
      rejected.push({ stage: "eligibility", reasonCode: "NO_VOUCH", generator: c.generator, subjectKey: c.subjectKey });
      continue;
    }
    eligible.push(c);
  }

  // ── E · claims, then the attention and explainability gates ───────────────
  const explained: Candidate[] = [];
  for (const c of eligible) {
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
    sorted.forEach((c, i) => { c.tieBreak = n <= 1 ? 0.01 : 0.02 * (i / (n - 1)); });
  }

  // ── Ranking. Base stays in [0,1]; rankingScore may exceed it. ─────────────
  for (const c of explained) {
    c.baseRankingScore = clamp01(0.65 * c.evidenceStrength + 0.35 * c.attentionValue);
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
      winner.corroborationBonus = Math.min(0.10, 0.04 * distinct);
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

  // ── G · feed composition ──────────────────────────────────────────────────
  const feed = compose(all, feedSize, lambda);
  feed.forEach((c, i) => { c.feedRank = i + 1; });

  return { index, all, feed, rejected, byGenerator };
}

// ── Diversification ─────────────────────────────────────────────────────────

const SIM_WEIGHTS = {
  generator: 0.30,
  template: 0.25,
  artist: 0.20,
  friend: 0.15,
  subgenre: 0.10,
  genre: 0.05,
};

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
 * Caps apply over a rolling ten-card window.
 *
 * The source cap is deliberately loose and keyed on the primary source only.
 * With four friends, two of them appear in over ninety per cent of all
 * candidates, so a tight per-friend cap does not diversify the feed — it
 * starves it, and every slot falls through to a relaxation tier. The caps that
 * actually shape how the feed reads are generator, artist and lane.
 */
const CAPS: Caps = { generator: 2, primarySource: 4, artist: 2, genre: 3, subgenre: 2, set: 2 };

const relaxed = (c: Caps, by: number): Caps => ({
  generator: c.generator + by, primarySource: c.primarySource + by, artist: c.artist + by,
  genre: c.genre + by, subgenre: c.subgenre + by, set: c.set + by,
});

function compose(pool: Candidate[], size: number, lambda: number): Candidate[] {
  const chosen: Candidate[] = [];
  const remaining = [...pool];

  while (chosen.length < size && remaining.length > 0) {
    const recent = chosen.slice(-10);
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
      if (c.subject.type !== "Song") counts.set += 1;
    }
    const last = chosen[chosen.length - 1];
    const first = chosen.length === 0;

    const passes = (c: Candidate, caps: Caps | null, strict: boolean): boolean => {
      // Slot one opens on a specific song, never an aggregate. Never relaxed.
      if (first && c.subject.type !== "Song") return false;
      if (strict && last) {
        // Two identical sentence shapes in a row is the most visible tell that
        // a feed was generated, so this relaxes only after the caps have.
        if (c.winningClaim?.claimType === last.winningClaim?.claimType) return false;
        if (c.subject.type !== "Song" && last.subject.type !== "Song") return false;
      }
      if (!caps) return true;
      if ((counts.generator.get(c.generator) ?? 0) >= caps.generator) return false;
      const primary = c.sourceFriendIds[0];
      if (primary && (counts.source.get(primary) ?? 0) >= caps.primarySource) return false;
      if (c.artist && (counts.artist.get(c.artist) ?? 0) >= caps.artist) return false;
      if (c.genre && (counts.genre.get(c.genre) ?? 0) >= caps.genre) return false;
      if (c.subgenre && (counts.subgenre.get(c.subgenre) ?? 0) >= caps.subgenre) return false;
      if (c.subject.type !== "Song" && counts.set >= caps.set) return false;
      return true;
    };

    // Constraints are given up one tier at a time rather than all at once. A
    // blanket fallback silently discards every cap, which is how a single
    // generator can take half the feed.
    const tiers: { caps: Caps | null; strict: boolean; penalty: number }[] = [
      { caps: CAPS, strict: true, penalty: 0 },
      { caps: CAPS, strict: false, penalty: 0.05 },
      { caps: relaxed(CAPS, 2), strict: false, penalty: 0.15 },
      { caps: null, strict: false, penalty: 0.3 },
    ];

    let picked: Candidate | null = null;
    let pickedIdx = -1;
    let pickedScore = 0;

    for (const tier of tiers) {
      let bestScore = -Infinity;
      for (let j = 0; j < remaining.length; j++) {
        const c = remaining[j];
        if (!passes(c, tier.caps, tier.strict)) continue;
        const sim = recent.length ? Math.max(...recent.map((p2) => similarity(c, p2))) : 0;
        const score = (c.rankingScore ?? 0) - lambda * sim - tier.penalty;
        if (score > bestScore) { bestScore = score; picked = c; pickedIdx = j; pickedScore = score; }
      }
      if (picked) break;
    }
    if (!picked) break;

    picked.feedScore = pickedScore;
    chosen.push(picked);
    remaining.splice(pickedIdx, 1);
  }

  return chosen;
}

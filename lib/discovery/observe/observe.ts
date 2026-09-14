/**
 * From every question the data can answer, to an ordered stream.
 *
 * Discover is an infinite feed, and that is a constraint on generation rather
 * than a job for ranking. An engine that only knows how to find the eight
 * statistically exceptional facts in a library cannot fill one, and no amount
 * of ordering afterwards invents inventory that was never generated.
 *
 * So the bar that decides what may be *said* is not the bar that decides what
 * goes *first*. An observation is valid when it is true, materially different
 * from what this listener's own obvious facts predict, and attached to music
 * worth opening. That is a large set. Bits then order it, and the same number
 * sorts it into bands, so the top of the feed is exceptional and the four
 * hundredth card is still a real thing nobody had counted.
 *
 * The earlier design used one statistical threshold for both jobs. It capped a
 * seventeen-thousand-track library at six cards.
 */
import { buildReference, type Reference } from "./reference";
import { buildProfile, type Profile } from "./profile";
import { askAll } from "./questions";
import { capTier } from "./grades";
import type { FamilyId, Observation, Tier } from "./types";
import type { TrackRow } from "../types";

export interface ObserveOptions {
  /**
   * Bits below which nothing is worth saying at all. With the per-family
   * effect floors already applied upstream, this is the "and it is not a
   * coin-flip" clause: three bits is eight to one against the null.
   */
  floor?: number;
  /** How far below a family's expected-chance maximum its floor may sit. */
  searchSlack?: number;
  /** Bits at which an observation becomes strong, and exceptional. */
  highAt?: number;
  topAt?: number;
  /** Least tracks a card must open before it is worth opening. */
  minDiscover?: number;
  /** How much of a card's evidence may already have been spent recently. */
  redundancy?: number;
  /** How many cards back the diversity rules look. */
  window?: number;
  /** Most cards from one family inside that window. */
  familyPerWindow?: number;
  /** Cap on the stream. Infinity returns the whole reservoir. */
  limit?: number;
  /**
   * Most tracks a card hands over. A card that opens nine hundred and seventy
   * recordings is not a discovery, it is a directory; the page shows the
   * best-corroborated of them and says how many there are.
   */
  maxPayload?: number;
  trace?: boolean;
}

export interface ObserveResult {
  /** The reservoir, ordered for reading. */
  observations: Observation[];
  counts: {
    raw: number;
    valid: number;
    distinct: number;
    top: number;
    high: number;
    tierValid: number;
  };
  trace?: {
    perFamily: Record<string, { raw: number; valid: number; distinct: number }>;
    dropped: Record<string, number>;
  };
}

const DEFAULTS = {
  floor: 3, searchSlack: 4, highAt: 12, topAt: 24, minDiscover: 4, maxPayload: 40,
  redundancy: 0.4, window: 10, familyPerWindow: 2, limit: Infinity,
};

const tierOf = (ob: Observation, highAt: number, topAt: number): Tier => {
  // A finding that collapses when its largest contributor is removed can still
  // be worth saying; it cannot be worth saying first.
  const stable = ob.bitsJackknife >= Math.min(highAt, ob.bits * 0.4);
  if (ob.bits >= topAt && stable) return "TOP";
  if (ob.bits >= highAt && ob.bitsJackknife > 0) return "HIGH";
  return "VALID";
};

export function observe(
  ref: Reference, profile: Profile, opts: ObserveOptions = {},
): ObserveResult {
  const o = { ...DEFAULTS, ...opts };
  const raw = askAll(ref, profile);
  // How many questions each family asked, which is what its floor depends on.
  const asked = new Map<FamilyId, number>();
  for (const ob of raw) asked.set(ob.family, (asked.get(ob.family) ?? 0) + 1);
  /**
   * The floor, aware of how hard its family searched.
   *
   * Ask a library two thousand questions and the best answer carries about
   * eleven bits with nothing going on, so a flat three-bit floor lets a
   * high-instance family fill the feed with coincidences — measurably: against
   * a degree-preserving permutation, ALBUM_POSITION fired three times more
   * often on shuffled libraries than on real ones.
   *
   * Setting the floor *at* the expected maximum is what starved the engine
   * before. Setting it four bits below — accepting findings up to sixteen
   * times commoner than chance's best effort — keeps the inventory and drops
   * the coincidences, and it costs a small family nothing because the global
   * floor still governs there.
   */
  const floorFor = (f: FamilyId) =>
    Math.max(o.floor, Math.log2(Math.max(1, asked.get(f) ?? 1)) - o.searchSlack);
  const dropped: Record<string, number> = {};
  const perFamily: Record<string, { raw: number; valid: number; distinct: number }> = {};
  const bump = (k: string) => { dropped[k] = (dropped[k] ?? 0) + 1; };
  const fam = (f: FamilyId) =>
    (perFamily[f] ??= { raw: 0, valid: 0, distinct: 0 });

  // ── Validity. Absolute, not relative to how many questions were asked.
  const valid: Observation[] = [];
  for (const ob of raw) {
    fam(ob.family).raw++;
    if (!(ob.bits >= floorFor(ob.family))) { bump("below floor"); continue; }
    if (ob.payload.kind === "DISCOVER" && ob.payload.works.length < o.minDiscover) {
      bump("too little to open"); continue;
    }
    if (ob.payload.works.length === 0) { bump("nothing to open"); continue; }
    ob.tier = capTier(ob.family, tierOf(ob, o.highAt, o.topAt));
    if (ob.payload.works.length > o.maxPayload) {
      ob.facts.payloadTotal = ob.payload.works.length;
      ob.payload = { kind: ob.payload.kind, works: ob.payload.works.slice(0, o.maxPayload) };
    }
    fam(ob.family).valid++;
    valid.push(ob);
  }

  // ── Consolidation: one card per underlying fact.
  // Two observations are the same discovery when they were computed from the
  // same evidence and make the same shape of claim. Where they are, the one
  // whose subject is the tightest set containing that evidence survives — an
  // album gap, the artist gap it causes and the lane gap around it are one
  // thing seen at three magnifications.
  const rank = { TOP: 2, HIGH: 1, VALID: 0 } as const;
  valid.sort((a, b) =>
    rank[b.tier ?? "VALID"] - rank[a.tier ?? "VALID"] || b.bits - a.bits);
  const distinct: Observation[] = [];
  const bySubject = new Set<string>();
  const signatures: { sig: Set<string>; family: FamilyId }[] = [];
  for (const ob of valid) {
    const sk = `${ob.subject.kind}:${ob.subject.key}:${ob.family}`;
    if (bySubject.has(sk)) { bump("duplicate subject"); continue; }
    const sig = new Set(ob.evidence);
    let dup = false;
    if (sig.size > 0) {
      for (const prev of signatures) {
        if (prev.family !== ob.family) continue;
        let shared = 0;
        for (const wk of sig) if (prev.sig.has(wk)) shared++;
        if (shared / sig.size > 0.9 && shared / prev.sig.size > 0.9) { dup = true; break; }
      }
    }
    if (dup) { bump("same evidence"); continue; }
    bySubject.add(sk);
    if (sig.size > 0 && signatures.length < 4000) signatures.push({ sig, family: ob.family });
    fam(ob.family).distinct++;
    distinct.push(ob);
  }

  // ── Ordering. A gradient globally, variety locally.
  // Diversity is enforced over a rolling window rather than as a global cap:
  // a global cap of four per family would throw away nine hundred perfectly
  // good album observations to avoid a run of them, when all that is actually
  // required is that a run not happen.
  const stream: Observation[] = [];
  const taken = new Set<Observation>();
  const recentSpend: string[][] = [];
  const spent = new Map<string, number>();
  const recentFamily: FamilyId[] = [];
  const recentSubject: string[] = [];

  const push = (ob: Observation) => {
    stream.push(ob); taken.add(ob);
    recentFamily.push(ob.family);
    recentSubject.push(`${ob.subject.kind}:${ob.subject.key}`);
    const fp = ob.footprint.slice(0, 120);
    recentSpend.push(fp);
    for (const wk of fp) spent.set(wk, (spent.get(wk) ?? 0) + 1);
    if (recentSpend.length > o.window) {
      const old = recentSpend.shift()!;
      for (const wk of old) {
        const n = (spent.get(wk) ?? 1) - 1;
        if (n <= 0) spent.delete(wk); else spent.set(wk, n);
      }
      recentFamily.shift(); recentSubject.shift();
    }
  };

  const fits = (ob: Observation, relax: number) => {
    if (recentSubject.includes(`${ob.subject.kind}:${ob.subject.key}`)) return false;
    if (relax < 2) {
      let n = 0;
      for (const f of recentFamily) if (f === ob.family) n++;
      if (n >= o.familyPerWindow + relax) return false;
    }
    if (relax < 1) {
      const fp = ob.footprint;
      if (fp.length) {
        let seen = 0;
        for (const wk of fp) if (spent.has(wk)) seen++;
        if (seen / fp.length > o.redundancy) return false;
      }
    }
    return true;
  };

  while (stream.length < o.limit) {
    let chosen: Observation | null = null;
    for (let relax = 0; relax <= 2 && !chosen; relax++) {
      for (const ob of distinct) {
        if (taken.has(ob)) continue;
        if (!fits(ob, relax)) continue;
        chosen = ob; break;
      }
    }
    if (!chosen) break;
    push(chosen);
  }

  const counts = {
    raw: raw.length, valid: valid.length, distinct: distinct.length,
    top: stream.filter((x) => x.tier === "TOP").length,
    high: stream.filter((x) => x.tier === "HIGH").length,
    tierValid: stream.filter((x) => x.tier === "VALID").length,
  };
  return { observations: stream, counts, trace: opts.trace ? { perFamily, dropped } : undefined };
}

/** Convenience for harnesses and the route: build both indexes and run. */
export function observeFor(
  viewerId: string, tracks: TrackRow[], opts: ObserveOptions = {},
): ObserveResult & { ref: Reference; profile: Profile } {
  const ref = buildReference(tracks);
  const profile = buildProfile(viewerId, tracks, ref);
  return { ...observe(ref, profile, opts), ref, profile };
}

export { buildReference, buildProfile };
export type { Reference, Profile, Observation };

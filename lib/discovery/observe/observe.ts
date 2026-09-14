/**
 * From every group of friend music to an ordered feed.
 *
 * Generation has already guaranteed the only thing that matters — every
 * candidate is recordings the viewer's friends hold and they do not. What is
 * left is choosing which of the several thousand such groups to show, in what
 * order, without saying the same thing twice.
 *
 * Ordering is by strength of reason, not by statistical surprise. The rest of
 * a record somebody has already started beats an artist they have never heard
 * of, whatever the arithmetic says, because the first is a better answer to
 * "why am I being shown this". Within that, more friends and more
 * corroboration wins.
 *
 * Discover is infinite, so this returns the whole reservoir rather than a
 * handful. Diversity is enforced over a rolling window rather than as a global
 * cap: the requirement is that a run of near-identical cards not happen, not
 * that a family be rationed.
 */
import { findAll, specificityOf, type Candidate, type FamilyId } from "./candidates";
import { artistKeyOf } from "./reference";
import { buildProfile, type Profile } from "./profile";
import { buildReference, type Reference } from "./reference";
import type { TrackRow } from "../types";

export type Band = "EXCEPTIONAL" | "STRONG" | "SOLID";

export interface ObserveOptions {
  /** Least friend tracks a card must hand over. */
  minTracks?: number;
  /** How much of a card's music may already have been spent recently. */
  redundancy?: number;
  /** How many cards back the diversity rules look. */
  window?: number;
  /** Most cards from one family inside that window. */
  familyPerWindow?: number;
  limit?: number;
  trace?: boolean;
}

export interface ObserveResult {
  candidates: (Candidate & { band: Band })[];
  counts: {
    raw: number; distinct: number;
    exceptional: number; strong: number; solid: number;
    friendTracks: number;
  };
  trace?: { perFamily: Record<string, { raw: number; kept: number }>; dropped: Record<string, number> };
}

const DEFAULTS = {
  minTracks: 4, redundancy: 0.35, window: 8, familyPerWindow: 2, limit: Infinity,
};

/**
 * How strong the reason is, said in three words rather than a number.
 *
 * Several people independently keeping something, plus a connection as tight
 * as a record or an artist already in the library, is the best case Blueprint
 * can make. One friend and a whole lane between you is the weakest thing still
 * worth showing.
 */
function bandOf(c: Candidate): Band {
  const friends = c.holders.length;
  const tight = c.connection.kind === "ALBUM_STARTED" || c.connection.kind === "ARTIST_HELD";
  if (friends >= 2 && tight && c.tracks.length >= 8) return "EXCEPTIONAL";
  if (friends >= 3 && c.tracks.length >= 6) return "EXCEPTIONAL";
  if (friends >= 2 || (tight && c.tracks.length >= 6)) return "STRONG";
  return "SOLID";
}

/**
 * One key per act, whatever kind of card names them.
 *
 * An artist card carries the artist key and an album card the display name, so
 * comparing them raw let The Beatles open a feed twice in a row.
 */
const anchorOf = (c: Candidate): string =>
  c.subject.kind === "artist" ? c.subject.key
    : c.subject.artist ? artistKeyOf(c.subject.artist)
    : c.connection.key;

export function observe(
  ref: Reference, profile: Profile, opts: ObserveOptions = {},
): ObserveResult {
  const o = { ...DEFAULTS, ...opts };
  const raw = findAll(ref, profile);
  const dropped: Record<string, number> = {};
  const perFamily: Record<string, { raw: number; kept: number }> = {};
  const bump = (k: string) => { dropped[k] = (dropped[k] ?? 0) + 1; };
  const fam = (f: FamilyId) => (perFamily[f] ??= { raw: 0, kept: 0 });
  for (const c of raw) fam(c.family).raw++;

  // ── One card per underlying group of music.
  // The same record can arrive as both a remainder and a whole; the same
  // artist as both depth and a skipped record. Where two candidates hand over
  // substantially the same recordings, the stronger reason survives.
  // Score first; where two cards are the same music they tie exactly, and the
  // sharper reason takes it.
  const sorted = [...raw].sort((a, b) =>
    b.score - a.score || specificityOf(b.family) - specificityOf(a.family));
  const kept: (Candidate & { band: Band })[] = [];
  const seenSubject = new Set<string>();
  const seenTracks: Set<string>[] = [];

  for (const c of sorted) {
    if (c.tracks.length < o.minTracks) { bump("too little to open"); continue; }
    const sk = `${c.subject.kind}:${c.subject.key}`;
    if (seenSubject.has(sk)) { bump("duplicate subject"); continue; }
    const mine = new Set(c.tracks);
    let dup = false;
    for (const prev of seenTracks) {
      let shared = 0;
      for (const wk of mine) if (prev.has(wk)) shared++;
      if (shared / mine.size > 0.8) { dup = true; break; }
    }
    if (dup) { bump("same music"); continue; }
    seenSubject.add(sk);
    if (seenTracks.length < 6000) seenTracks.push(mine);
    fam(c.family).kept++;
    kept.push({ ...c, band: bandOf(c) });
  }

  // ── Ordering: strongest reason first, variety locally.
  const stream: (Candidate & { band: Band })[] = [];
  const taken = new Set<Candidate>();
  const recentFamily: FamilyId[] = [];
  const recentAnchor: string[] = [];
  const spend: string[][] = [];
  const spent = new Map<string, number>();

  const push = (c: Candidate & { band: Band }) => {
    stream.push(c); taken.add(c);
    recentFamily.push(c.family);
    recentAnchor.push(anchorOf(c));
    const fp = c.footprint.slice(0, 80);
    spend.push(fp);
    for (const wk of fp) spent.set(wk, (spent.get(wk) ?? 0) + 1);
    if (spend.length > o.window) {
      for (const wk of spend.shift()!) {
        const n = (spent.get(wk) ?? 1) - 1;
        if (n <= 0) spent.delete(wk); else spent.set(wk, n);
      }
      recentFamily.shift(); recentAnchor.shift();
    }
  };

  const fits = (c: Candidate, relax: number) => {
    const anchor = anchorOf(c);
    if (relax < 2 && recentAnchor.includes(anchor)) return false;
    if (relax < 2) {
      let n = 0; for (const f of recentFamily) if (f === c.family) n++;
      if (n >= o.familyPerWindow + relax) return false;
    }
    if (relax < 1 && c.tracks.length) {
      let seen = 0;
      for (const wk of c.tracks) if (spent.has(wk)) seen++;
      if (seen / c.tracks.length > o.redundancy) return false;
    }
    return true;
  };

  while (stream.length < o.limit) {
    let chosen: (Candidate & { band: Band }) | null = null;
    for (let relax = 0; relax <= 2 && !chosen; relax++) {
      for (const c of kept) {
        if (taken.has(c)) continue;
        if (!fits(c, relax)) continue;
        chosen = c; break;
      }
    }
    if (!chosen) break;
    push(chosen);
  }

  let friendTracks = 0;
  for (const c of stream) friendTracks += c.tracks.length;
  return {
    candidates: stream,
    counts: {
      raw: raw.length, distinct: stream.length,
      exceptional: stream.filter((c) => c.band === "EXCEPTIONAL").length,
      strong: stream.filter((c) => c.band === "STRONG").length,
      solid: stream.filter((c) => c.band === "SOLID").length,
      friendTracks,
    },
    trace: opts.trace ? { perFamily, dropped } : undefined,
  };
}

export function observeFor(
  viewerId: string, tracks: TrackRow[], opts: ObserveOptions = {},
): ObserveResult & { ref: Reference; profile: Profile } {
  const ref = buildReference(tracks);
  const profile = buildProfile(viewerId, tracks, ref);
  return { ...observe(ref, profile, opts), ref, profile };
}

export { buildReference, buildProfile };
export { workKeyOf } from "./reference";
export type { Reference, Profile, Candidate };

import { REDUNDANCY } from "./config";
import type { Candidate, CardSubjectType } from "./types";

/**
 * Cross-card redundancy — one proposition, one card.
 *
 * Sharing tracks is not the same as saying the same thing. A curated
 * fifteen-track set is meant to sit inside the area it was drawn from; that is
 * what an entry point is, and removing it because it is contained would delete
 * the primitive. Equally, an album card's tracks all belong to the artist
 * whose card sits elsewhere on the feed, and both are worth having.
 *
 * So overlap only opens the question. The answer comes from comparing what the
 * two cards actually assert: what kind of thing each is about, whether either
 * applied a selection rule, what claim its caption makes, how much each
 * delivers, which sources vouch for it, and what ties it to the viewer's own
 * library. Cards differing on at least two of those are answering different
 * questions and both stay. Cards differing on fewer are the same
 * recommendation written twice, and the one whose aperture explains the
 * material least precisely goes.
 */

/** Most specific first. The tiebreak is ranking score. */
const APERTURE_ORDER: Record<CardSubjectType, number> = {
  ALBUM: 0, ARTIST: 1, SUBGENRE: 2, GENRE: 3, SONG_SET: 4,
};
export interface RedundancyPair {
  keptSubject: string;
  keptType: CardSubjectType;
  droppedSubject: string;
  droppedType: CardSubjectType;
  shared: number;
  containment: number;
  resolvedBy: "aperture" | "score";
}

/** Two overlapping cards that were both kept, and why. */
export interface CoexistingPair {
  a: string;
  b: string;
  shared: number;
  containment: number;
  distinct: string[];
}

export interface RedundancyResult {
  kept: Candidate[];
  dropped: { candidate: Candidate; against: Candidate; shared: number; containment: number }[];
  pairs: RedundancyPair[];
  coexisting: CoexistingPair[];
}

const subjectLabel = (c: Candidate): string => {
  const s = c.subject;
  return s.type === "Album" ? `${s.album} — ${s.artist}`
    : s.type === "Artist" ? s.artist
    : s.type === "Subgenre" ? s.subgenre
    : s.type === "Genre" ? s.genre
    : s.type === "Songs" ? s.title
    : "";
};

const selectionRuleOf = (c: Candidate) =>
  (c.groupingReason.kind === "SELECTED"
    ? `${c.groupingReason.rule.id}:${c.groupingReason.rule.threshold}`
    : null);

/**
 * What two overlapping cards genuinely say differently.
 *
 * Each facet is one thing a reader would notice as a different reason to look.
 * Card type alone is never enough — a SONG_SET that is only a truncation of
 * the lane card differs in type and in nothing else, which is exactly the pair
 * that has to collapse.
 */
function distinctFacets(a: Candidate, b: Candidate): string[] {
  const facets: string[] = [];
  if (a.cardType !== b.cardType) facets.push("subject type");

  const ruleA = selectionRuleOf(a);
  const ruleB = selectionRuleOf(b);
  if (ruleA !== ruleB) facets.push(ruleA && ruleB ? "selection rule" : "one selects, one does not");

  if (a.winningClaim?.claimType !== b.winningClaim?.claimType) facets.push("claim");

  const hi = Math.max(a.deliverableCount, b.deliverableCount);
  const lo = Math.max(1, Math.min(a.deliverableCount, b.deliverableCount));
  if (hi / lo >= REDUNDANCY.materialCountRatio) facets.push("how much it delivers");

  if (a.anchor?.type !== b.anchor?.type || a.anchor?.entityId !== b.anchor?.entityId) {
    facets.push("recipient anchor");
  }

  const sa = new Set(a.sourceFriendIds);
  const sb = new Set(b.sourceFriendIds);
  if (sa.size !== sb.size || [...sa].some((x) => !sb.has(x))) facets.push("source evidence");

  return facets;
}

/**
 * Which of two colliding cards explains the material better.
 *
 * Negative means `a` wins. Aperture specificity decides first, so a weaker
 * album card still beats a stronger lane card over the same tracks: the album
 * is what the tracks actually are. Score only breaks ties within one aperture.
 */
function prefer(a: Candidate, b: Candidate): number {
  const byAperture = APERTURE_ORDER[a.cardType as CardSubjectType] - APERTURE_ORDER[b.cardType as CardSubjectType];
  if (byAperture !== 0) return byAperture;
  return (b.rankingScore ?? 0) - (a.rankingScore ?? 0);
}

/**
 * Resolves redundancy over a ranked candidate list.
 *
 * Comparisons run through an inverted track index rather than over every pair,
 * so the cost tracks the number of cards that actually share material. At four
 * sources that is a handful of comparisons; at four hundred it is still a
 * handful per card, because a card that shares no track with another can never
 * be redundant with it.
 */
export function resolveRedundancy(ranked: Candidate[]): RedundancyResult {
  const byTrack = new Map<string, number[]>();
  const kept: Candidate[] = [];
  const keptIdx: number[] = [];
  const dropped: RedundancyResult["dropped"] = [];
  const pairs: RedundancyPair[] = [];
  const coexisting: CoexistingPair[] = [];
  const alive: boolean[] = ranked.map(() => true);
  const deliverables = ranked.map((c) => new Set(c.deliverableIds ?? []));

  const indexOfKept = new Map<number, number>();

  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    const mine = deliverables[i];
    if (mine.size === 0) { kept.push(c); keptIdx.push(i); indexOfKept.set(i, kept.length - 1); continue; }

    // Only cards sharing at least one track can be redundant with this one.
    const overlapCount = new Map<number, number>();
    for (const id of mine) {
      for (const j of byTrack.get(id) ?? []) {
        if (!alive[j]) continue;
        overlapCount.set(j, (overlapCount.get(j) ?? 0) + 1);
      }
    }

    let loses = false;
    for (const [j, shared] of overlapCount) {
      const containment = shared / Math.min(mine.size, deliverables[j].size);
      if (shared < REDUNDANCY.minShared || containment < REDUNDANCY.containment) continue;
      const other = ranked[j];

      // Overlap opened the question; the propositions answer it.
      const facets = distinctFacets(c, other);
      if (facets.length >= REDUNDANCY.minDistinctFacets) {
        coexisting.push({
          a: `${c.cardType} ${subjectLabel(c)}`,
          b: `${other.cardType} ${subjectLabel(other)}`,
          shared, containment, distinct: facets,
        });
        continue;
      }

      const pref = prefer(c, other);
      const record: RedundancyPair = {
        keptSubject: "", keptType: "ALBUM", droppedSubject: "", droppedType: "ALBUM",
        shared, containment,
        resolvedBy: c.cardType === other.cardType ? "score" : "aperture",
      };
      if (pref < 0) {
        // This card explains the material better; the one already kept goes.
        alive[j] = false;
        dropped.push({ candidate: other, against: c, shared, containment });
        Object.assign(record, {
          keptSubject: subjectLabel(c), keptType: c.cardType,
          droppedSubject: subjectLabel(other), droppedType: other.cardType,
        });
        pairs.push(record);
      } else {
        loses = true;
        dropped.push({ candidate: c, against: other, shared, containment });
        Object.assign(record, {
          keptSubject: subjectLabel(other), keptType: other.cardType,
          droppedSubject: subjectLabel(c), droppedType: c.cardType,
        });
        pairs.push(record);
        break;
      }
    }

    if (loses) { alive[i] = false; continue; }
    for (const id of mine) {
      const list = byTrack.get(id);
      if (list) list.push(i); else byTrack.set(id, [i]);
    }
    kept.push(c);
    keptIdx.push(i);
  }

  return { kept: kept.filter((c, n) => alive[keptIdx[n]]), dropped, pairs, coexisting };
}

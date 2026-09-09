import { REDUNDANCY } from "./config";
import type { Candidate, CardSubjectType } from "./types";

/**
 * Cross-card redundancy — one fact, one card.
 *
 * The aperture stage stops a single candidate being shown at the wrong zoom
 * level. It cannot stop two different candidates describing the same discovery
 * material: an artist card and a lane card can hold the same fifteen tracks
 * and read, to anyone scrolling, as the same recommendation written twice.
 *
 * So redundancy is measured on the only thing that is actually the same — the
 * tracks each card would hand over. Containment rather than Jaccard, because a
 * fifteen-track set sitting entirely inside a lane card is redundant with it
 * even though the two sets are nothing alike in size.
 *
 * When two cards collide, the one that survives is the one whose aperture
 * explains the material most precisely. An album says more than the artist who
 * made it; an artist says more than the lane they sit in; anything singular
 * says more than a pile of songs.
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

export interface RedundancyResult {
  kept: Candidate[];
  dropped: { candidate: Candidate; against: Candidate; shared: number; containment: number }[];
  pairs: RedundancyPair[];
}

const subjectLabel = (c: Candidate): string => {
  const s = c.subject;
  return s.type === "Album" ? `${s.album} — ${s.artist}`
    : s.type === "Artist" ? s.artist
    : s.type === "Subgenre" ? s.subgenre
    : s.type === "Genre" ? s.genre
    : s.type === "Songs" ? s.label
    : "";
};

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

  return { kept: kept.filter((c, n) => alive[keptIdx[n]]), dropped, pairs };
}

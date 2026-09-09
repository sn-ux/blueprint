import type { DiscoveryIndex } from "./sets";
import type { Candidate } from "./types";

/**
 * New ground, or ground next to something already held.
 *
 * One question, asked of the card's own subject: does the viewer's library
 * contain anything inside it? Nothing by that artist, none of that record,
 * nothing in that lane — the card is NEW. Some of it already there — the card
 * is ADJACENT, and it is a card about extending something rather than about
 * arriving somewhere.
 *
 * That is set containment and nothing else. It does not consider what anyone
 * likes, what anyone else holds, or how similar two things are; two viewers
 * with the same library get the same answer for the same card, and a viewer
 * whose library is empty gets NEW for everything, which is correct.
 *
 * The feed reads this to pace a reading between the two. It is never a gate:
 * no card is excluded for being either, and none is invented to be one.
 */
export type NoveltyClass = "NEW" | "ADJACENT";

/** How much of the card's own subject the viewer already holds. */
export function subjectHeld(index: DiscoveryIndex, c: Candidate): number {
  const s = c.subject;
  switch (s.type) {
    case "Album": return index.viewerByAlbumId.get(c.albumId ?? "") ?? 0;
    case "Artist": return index.viewerByArtist.get(s.artist) ?? 0;
    case "Subgenre": return index.viewerByLane.get(s.subgenre) ?? 0;
    case "Genre": return index.viewerByWorld.get(s.genre) ?? 0;
    // A set's subject is the scope it was drawn from, which is a lane or a
    // genre depending on which one named it.
    case "Songs": return index.viewerByLane.get(s.scope) ?? index.viewerByWorld.get(s.scope) ?? 0;
    default: return 0;
  }
}

export function noveltyOf(index: DiscoveryIndex, c: Candidate): NoveltyClass {
  return subjectHeld(index, c) > 0 ? "ADJACENT" : "NEW";
}

/**
 * The class a slot is asking for, and how firmly.
 *
 * The opening slots follow the pattern exactly. Past it the reading holds the
 * same proportion, so the target is whatever restores the running share —
 * which means a run of one class pulls the other forward and a balanced
 * reading asks for nothing at all.
 */
export function wantedAt(
  position: number,
  newSoFar: number,
  chosenSoFar: number,
  cfg: { pattern: readonly string[]; target: number; tolerance: number },
): NoveltyClass | null {
  if (position < cfg.pattern.length) return cfg.pattern[position] as NoveltyClass;
  if (chosenSoFar === 0) return null;
  const share = newSoFar / chosenSoFar;
  if (share < cfg.target - cfg.tolerance) return "NEW";
  if (share > cfg.target + cfg.tolerance) return "ADJACENT";
  return null;
}

import * as CFG from "./config";
import type { DiscoveryIndex } from "./sets";
import type { Candidate } from "./types";

/**
 * Discovery distance — how far a recommendation sits from what the viewer
 * already holds.
 *
 * The feed should open on ground the reader recognises and widen as they go:
 * "I understand why Blueprint is showing me this", then "this is adjacent but
 * interesting", then "I wouldn't have found this myself". Opening on five
 * genres they have never touched gets the order backwards, however good the
 * cards are.
 *
 * Distance is measured structurally, from one question: what is the tightest
 * set containing this recommendation that the viewer already occupies? Holding
 * part of the subject itself is as near as it gets. Holding the artist but not
 * the record is a step out. Holding the lane but not the artist, another. When
 * nothing containing it is held at all, the only thing left is a bridge — a
 * named artist in their library who works there — and how much of that artist
 * they hold decides how far the jump really is.
 *
 * Nothing here is a genre list, and nothing is a preference. It is set
 * containment and set size, so it means the same for any viewer.
 */

export type DistanceBand = "NEAR" | "MID" | "FAR";

/** Anchored, like evidence strength: the numbers mean the same everywhere. */
const D = {
  /** The viewer already holds part of this very subject. */
  INSIDE_SUBJECT: 0.0,
  /** A record they have none of, by an artist they hold. */
  ALBUM_OF_HELD_ARTIST: 0.15,
  /** An artist they have none of, inside a lane they occupy. */
  ARTIST_IN_HELD_LANE: 0.28,
  /**
   * A lane they have none of, where the sources agree track by track.
   *
   * Agreement is itself a kind of nearness: the material has been independently
   * kept more than once, so the jump is into something settled rather than into
   * one person's collection.
   */
  UNHELD_LANE_AGREED: 0.55,
  /** A lane they have none of, vouched for only by how much others keep. */
  UNHELD_LANE_DEPTH_ONLY: 0.8,
  /** ...and outside any genre they occupy at all. */
  OUTSIDE_HELD_GENRE: 0.1,
};

/**
 * How wide an aperture each card type is.
 *
 * Distance is not only about what the viewer holds; it is also about how much
 * ground the card covers. A record is a specific thing to go and listen to. A
 * whole genre is a region. Both can be well anchored, but the genre asks more
 * of the reader, so it belongs further down the same widening.
 */
const WIDTH: Record<string, number> = {
  ALBUM: 0, ARTIST: 0.05, SONG_SET: 0.12, SUBGENRE: 0.18, GENRE: 0.4,
};

export function bandOf(d: number): DistanceBand {
  if (d < CFG.FEED.distance.nearBelow) return "NEAR";
  if (d < CFG.FEED.distance.farAtOrAbove) return "MID";
  return "FAR";
}

/** How much of the subject's own set the viewer already holds. */
function subjectOwned(index: DiscoveryIndex, c: Candidate): number {
  const s = c.subject;
  switch (s.type) {
    case "Album": return index.viewerByAlbumId.get(c.albumId ?? "") ?? 0;
    case "Artist": return index.viewerByArtist.get(s.artist) ?? 0;
    case "Subgenre": return index.viewerByLane.get(s.subgenre) ?? 0;
    case "Genre": return index.viewerByWorld.get(s.genre) ?? 0;
    case "Songs": return index.viewerByLane.get(s.scope) ?? index.viewerByWorld.get(s.scope) ?? 0;
    default: return 0;
  }
}

/**
 * The distance for one candidate.
 *
 * For a stacked proposition the bridge pulls it closer, because the bridge is
 * exactly what makes the jump smaller: a lane the viewer has never entered
 * where forty tracks' worth of an artist they already hold turns out to live
 * is nearer than the same lane vouched for by friend activity alone.
 */
export function distanceOf(index: DiscoveryIndex, c: Candidate): number {
  const width = WIDTH[c.cardType ?? ""] ?? 0;
  if (subjectOwned(index, c) > 0) return D.INSIDE_SUBJECT + width;

  const lane = c.subgenre;
  const world = c.genre;
  const inHeldLane = !!lane && (index.viewerByLane.get(lane) ?? 0) > 0;
  const inHeldGenre = !!world && (index.viewerByWorld.get(world) ?? 0) > 0;

  let base: number;
  if (c.subject.type === "Album" && (index.viewerByArtist.get(c.artist ?? "") ?? 0) > 0) {
    base = D.ALBUM_OF_HELD_ARTIST;
  } else if (c.subject.type === "Artist" && inHeldLane) {
    base = D.ARTIST_IN_HELD_LANE;
  } else {
    // Territory the viewer does not occupy. What separates a step out from a
    // leap is what vouches for it: material several people independently kept
    // is settled ground, material that only exists in one collection is not.
    const ids = c.deliverableIds ?? [];
    const agreed = ids.length > 0
      && ids.every((id) => (index.holders.get(id)?.length ?? 0) >= CFG.MIN_SOURCES_PER_TRACK);
    base = agreed ? D.UNHELD_LANE_AGREED : D.UNHELD_LANE_DEPTH_ONLY;
    if (!inHeldGenre) base += D.OUTSIDE_HELD_GENRE;
  }

  // A bridge shortens the jump, in proportion to how much of those artists the
  // viewer already holds — one artist they have forty tracks of is a firmer
  // footing than four they have one track of each.
  const anchor = c.anchor;
  const owned = c.componentScores.ownedByBridge
    ?? (anchor?.type === "ARTIST_PRESENT" ? anchor.ownedCount : 0);
  if (owned > 0 && base > D.ARTIST_IN_HELD_LANE) {
    const strength = Math.min(1, owned / CFG.FEED.distance.bridgeSaturation);
    base -= CFG.FEED.distance.bridgeCredit * strength;
  }

  return Math.max(0, Math.min(1, base + (WIDTH[c.cardType ?? ""] ?? 0)));
}

/**
 * How much distance a slot will tolerate.
 *
 * Zero at the top and one by the end of the ramp, so the aperture widens
 * smoothly rather than in blocks. Nothing is banned from any position: a far
 * card that is enough better than the alternatives still wins its slot, which
 * is why this is a penalty on the composer's score rather than a filter.
 */
export function allowanceAt(position: number): number {
  return Math.min(1, position / CFG.FEED.distance.ramp);
}

export function distancePenalty(d: number, position: number): number {
  return CFG.FEED.distance.weight * Math.max(0, d - allowanceAt(position));
}

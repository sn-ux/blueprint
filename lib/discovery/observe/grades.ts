/**
 * What each family has actually earned, measured rather than assumed.
 *
 * scripts/lab/permtest.mjs shuffles the corpus with a degree-preserving
 * permutation — every library keeps its exact size, every recording its exact
 * number of holders, and nothing else survives — and counts how often each
 * family still fires. A family that fires as readily on shuffled libraries as
 * on real ones has not shown that it is reading the data rather than the
 * margins, and it does not get to open anybody's feed.
 *
 * That is the whole of how the top of the feed is protected: not by a higher
 * threshold, which starves inventory, but by a measured claim about which
 * questions have been shown to depend on real structure. Unverified families
 * keep supplying the reservoir, where a reader arrives having already been
 * shown the strong things.
 *
 * SELF-referenced families are a separate case. Their null is fitted to the
 * listener's own library, and a permutation changes that distribution, so the
 * test says nothing about them either way. They are capped at HIGH — real
 * observations about a person, not validated discoveries about the world.
 *
 * These grades are an empirical result on a six-library corpus and must be
 * re-measured as it grows. Several families are expected to move: the scale
 * simulation shows PAIR_ALIGNMENT going from nine cards to four hundred and
 * thirty-eight between zero and four hundred added listeners, and a family
 * that rare cannot be graded reliably yet.
 */
import type { FamilyId, Tier } from "./types";

export type Grade = "VERIFIED" | "SUPPORTED" | "SELF" | "UNVERIFIED";

/** Measured suppression against the permutation null, 2026-09-14, 6 libraries. */
export const FAMILY_GRADE: Record<FamilyId, Grade> = {
  LANE_SIGNATURE: "VERIFIED",        //  99%
  ERA_DISPLACEMENT: "VERIFIED",      //  94%
  LIBRARY_ERA: "VERIFIED",           // 100%
  ARTIST_SIGNATURE: "VERIFIED",      // 100%
  PAIR_ALIGNMENT: "VERIFIED",        // 100%
  ARTIST_TRUNCATION: "SUPPORTED",    //  60%

  ALBUM_DEVOTION: "SELF",            // null is fitted to the listener
  ARTIST_CONCENTRATION: "SELF",
  ALBUM_POSITION: "SELF",
  LIBRARY_SHAPE: "SELF",
  LANE_BREADTH: "SELF",

  PAIR_DIVERGENCE: "UNVERIFIED",     // fires more on shuffled libraries
  ARTIST_SPREAD: "UNVERIFIED",
  ONE_ALBUM_ARTIST: "UNVERIFIED",
  ARTIST_INTERIOR_GAP: "UNVERIFIED",
  ALBUM_ODD_CHOICE: "UNVERIFIED",
  ARTIST_LOYALTY: "UNVERIFIED",
  DEEP_CUTS: "UNVERIFIED",           // too rare here to grade
  CONVERGENCE: "UNVERIFIED",         // dormant at this corpus size
};

const CAP: Record<Grade, Tier> = {
  VERIFIED: "TOP", SUPPORTED: "TOP", SELF: "HIGH", UNVERIFIED: "VALID",
};

const ORDER: Record<Tier, number> = { VALID: 0, HIGH: 1, TOP: 2 };

/** The tier a family is allowed to reach, whatever its bits say. */
export function capTier(family: FamilyId, tier: Tier): Tier {
  const cap = CAP[FAMILY_GRADE[family] ?? "UNVERIFIED"];
  return ORDER[tier] <= ORDER[cap] ? tier : cap;
}

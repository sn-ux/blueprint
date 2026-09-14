/**
 * What an observation is.
 *
 * A statement about one listener's library, the evidence it was computed from,
 * how many bits of surprise it carries against a null that already knows the
 * obvious things about them, and the music it legitimately opens. The bits are
 * the only measure of interest in the system; there is no weighted blend and
 * nowhere to put an inferred preference.
 */

export type FamilyId =
  | "ALBUM_DEVOTION"
  | "ARTIST_SIGNATURE"
  | "ARTIST_TRUNCATION"
  | "ONE_ALBUM_ARTIST"
  | "LANE_SIGNATURE"
  | "ERA_DISPLACEMENT"
  | "CONVERGENCE"
  | "LIBRARY_SHAPE"
  | "PAIR_ALIGNMENT"
  | "LIBRARY_ERA"
  | "DEEP_CUTS"
  | "LANE_BREADTH"
  | "ARTIST_LOYALTY"
  | "ALBUM_POSITION"
  | "ARTIST_SPREAD"
  | "ARTIST_INTERIOR_GAP"
  | "PAIR_DIVERGENCE"
  | "ARTIST_CONCENTRATION"
  | "ALBUM_ODD_CHOICE";

export type SubjectKind = "album" | "artist" | "subgenre" | "library" | "person";

/** Whether the null this was scored against came from the listener or the corpus. */
export type RefQuality = "self" | "corpus";

/**
 * How strong an opportunity this is — a band on the bits, not a second
 * measure. VALID is a real, specific, defensible observation with somewhere to
 * go; HIGH is a notably strong one; TOP is fit to open the feed. The feed is
 * infinite, so most of the reservoir is VALID and that is the intended shape.
 */
export type Tier = "TOP" | "HIGH" | "VALID";

export interface Observation {
  family: FamilyId;
  /** Stable identity of the underlying fact. */
  key: string;
  subject: { kind: SubjectKind; key: string; label: string; artist?: string };
  /** Bits of evidence against the null. The only interest score in the engine. */
  bits: number;
  /**
   * The same statistic recomputed with its single largest contributor removed.
   * An observation that collapses here was one album, one artist or one peer
   * wearing a costume.
   */
  bitsJackknife: number;
  /** Plain numbers a caption may use. Every one traces to a count. */
  facts: Record<string, number | string>;
  /** The viewer's own recordings the statistic was computed on. */
  evidence: string[];
  payload: { kind: "DISCOVER" | "REFLECT"; works: string[] };
  /** Recordings touched, for redundancy. */
  footprint: string[];
  refQuality: RefQuality;
  /** Assigned by the engine once the bands are known. */
  tier?: Tier;
}

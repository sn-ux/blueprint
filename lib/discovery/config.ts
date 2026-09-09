/**
 * Calibration parameters.
 *
 * Everything here is a tunable number, not a rule about what Blueprint means.
 * Three kinds of constant live in this codebase and only one of them belongs
 * in this file:
 *
 *   PRODUCT SEMANTICS   what a card is, what may be claimed, what must be
 *                       deliverable. In types.ts, aperture.ts and the engine's
 *                       invariants. Never here.
 *   GENERATOR SEMANTICS the shape of a mechanism — that completion squares
 *                       ownership, that magnitude saturates logarithmically,
 *                       that unanimity means everyone. In the generators.
 *                       Never here.
 *   CALIBRATION         where a line is drawn on a scale whose shape is
 *                       already decided. All of it here.
 *
 * The point is that after a grading pass, tuning happens in this file and
 * nowhere else.
 */

// ── Source universe ─────────────────────────────────────────────────────────

/** A source needs this many tracks before it can anchor a claim alone. */
export const MIN_ANCHOR_LIBRARY = 300;

/**
 * Independent sources required before agreement means anything at all.
 *
 * Proportional coverage on its own is not evidence: one source out of one is
 * unanimous and says nothing. Every consensus generator carries both a
 * coverage requirement and this absolute floor.
 */
export const MIN_INDEPENDENT_SOURCES = 3;

/** Coverage bands for the consensus family. Fractions of the eligible universe. */
export const SUPERMAJORITY_COVERAGE = 2 / 3;
export const MAJORITY_COVERAGE = 1 / 2;

// ── Score floors and gates ──────────────────────────────────────────────────

export const ES_FLOOR = 0.3;
export const ATTENTION_FLOOR = 0.4;
export const CLAIM_FLOOR = 0.35;

// ── Quality bands ───────────────────────────────────────────────────────────

export const BANDS = {
  exceptionalEs: 0.80,
  exceptionalAv: 0.90,
  strongEs: 0.68,
  strongAv: 0.80,
  strongEsAlt: 0.55,
  strongAvAlt: 0.95,
};

// ── Ranking ─────────────────────────────────────────────────────────────────

export const RANK_WEIGHTS = { evidence: 0.65, attention: 0.35 };
export const TIE_BREAK_MAX = 0.02;
export const TIE_BREAK_SINGLETON = 0.01;
export const CORROBORATION_PER_GENERATOR = 0.04;
export const CORROBORATION_MAX = 0.10;

// ── Claim scoring ───────────────────────────────────────────────────────────

export const CLAIM_WEIGHTS = {
  exceptionalness: 0.30,
  specificity: 0.25,
  socialMeaning: 0.15,
  simplicity: 0.15,
  confidence: 0.15,
};

/** Confidence applied to claims made over an observed rather than real catalogue. */
export const OBSERVED_CATALOG_CONFIDENCE = 0.7;

// ── Attention ───────────────────────────────────────────────────────────────

export const ATTENTION_MODIFIERS = {
  namedSource: 0.15,
  actionableSingleTrack: 0.10,
  magnitudeOnly: -0.25,
  unactionableSize: -0.15,
  unactionableAbove: 500,
};

// ── Generator thresholds ────────────────────────────────────────────────────

export const ALBUM_OBSERVED = {
  minObserved: 6,
  soleMinOwnership: 0.85,
  residueMinOwnership: 0.6,
  residueMax: 4,
};

export const ARTIST_OBSERVED = {
  minOwned: 8,
  soleMinOwnership: 0.85,
  residueMinOwnership: 0.75,
  residueMax: 5,
};

export const ALBUM_AUTHORITATIVE = {
  minTotalTracks: 5,
  minOwnedPositions: 4,
  nearCompleteResidueMax: 4,
  heldSaturation: 8,
  scaleSaturation: 20,
  ceiling: 0.92,
};

export const ALBUM_AS_UNIT = {
  minObserved: 6,
  minHolders: 2,
  minTracksPerHolder: 3,
  depthSaturation: 6,
};

export const ARTIST_ABSENT = {
  minCatalog: 5,
  minHolders: 2,
  catalogSaturation: 60,
};

export const LANE = {
  minGap: 15,
  minDeepHolder: 10,
  magnitudeSaturation: 300,
};

export const SOURCE_LANE_DEPTH = {
  minHeld: 30,
  minShareOfLane: 0.5,
  minOfferable: 15,
  countSaturation: 120,
};

export const GENRE_GAP = { minGap: 100, magnitudeSaturation: 13 };

export const MULTI_SOURCE_SET = {
  /** Distinct sources that must share the group. */
  minSources: 3,
  /** Tracks the shared group must contain to be worth examining. */
  minMembers: 3,
  sizeSaturation: 25,
};

// ── Aperture ────────────────────────────────────────────────────────────────

export const APERTURE = {
  dominantShare: 0.6,
  minAlbumTracks: 4,
  minArtistTracks: 4,
  minLaneTracks: 8,
};

// ── Feed composition ────────────────────────────────────────────────────────

export const FEED = {
  lambda: 0.35,
  window: 10,
  caps: { generator: 2, primarySource: 4, artist: 2, genre: 3, subgenre: 2, set: 2 },
  relaxBy: 2,
  penalties: [0, 0.05, 0.15, 0.3],
  similarity: {
    generator: 0.30,
    template: 0.25,
    artist: 0.20,
    friend: 0.15,
    subgenre: 0.10,
    genre: 0.05,
  },
};

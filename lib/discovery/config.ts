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

/** A track needs this many independent holders to count as corroborated. */
export const MIN_SOURCES_PER_TRACK = 2;

/** Independent sources a card needs across its whole deliverable set. */
export const MIN_SOURCES_PER_CARD = 2;

/** Upper bound on tracks a single recommendation delivers. */
export const DELIVERABLE_MAX = 15;

export const ARTIST_GAP = {
  minOwned: 3,
  minMissing: 2,
  ownedSaturation: 20,
  missingSaturation: 15,
};

/**
 * The curated-set primitive.
 *
 * A SONG_SET is a scope plus a selection rule. The rule here is the strongest
 * consensus the evidence will support: the highest number of independent
 * holders for which the scope still contains a full set. The floor is the
 * absolute one — agreement between fewer than three people is not agreement —
 * and it is always strictly above MIN_SOURCES_PER_TRACK, so a selected set can
 * never be the same material as the area card it sits inside.
 *
 * Deriving the threshold rather than fixing it is what makes this mean the
 * same thing at any scale. With four sources it lands at three; with four
 * hundred it lands wherever a dozen tracks still clear it. The rule does not
 * change, only the amount of evidence available to it.
 */
export const CONSENSUS_SET = {
  /** Never below this, whatever the scale. */
  minHolders: MIN_INDEPENDENT_SOURCES,
  /**
   * A selection has to select. Above this share of its scope's corroborated
   * inventory the set is not an entry point into an area — it is the area,
   * and the taxonomy card already says so. Observed sets land at 0.03-0.04,
   * so the line sits nowhere near live data.
   */
  maxShareOfScope: 0.5,
  /** Tracks the viewer must already hold for a scope to anchor a set. */
  minOwnedInLane: 3,
  minOwnedInGenre: 20,
};

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
  minOwnedByArtist: 3,
  minDeliverable: 4,
};

export const ARTIST_ABSENT = {
  minCatalog: 3,
  minOwnedInLane: 5,
  catalogSaturation: 40,
};

export const LANE = {
  /** Tracks the viewer must already hold for a lane to count as occupied. */
  minOwnedForPresent: 3,
  /** Tracks the viewer must hold in the parent for a child void to anchor. */
  minOwnedInParent: 20,
  /** Corroborated tracks a lane card must be able to deliver. */
  minDeliverable: 6,
  ownedSaturation: 60,
  magnitudeSaturation: 40,
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

/**
 * When one singular entity explains a set well enough to become the card.
 *
 * Measured over the corpus rather than guessed. Taxonomy-defined sets sit at
 * 1.00 by album, artist, subgenre or genre; the one non-taxonomic grouping
 * available lands at 0.07-0.33 by album and artist and 0.07-0.67 by subgenre.
 * Nothing observed falls between 0.40 and 0.60, so the line is stable anywhere
 * in that band. Genre is a coarse partition — eight worlds — where a random
 * fifteen-track set already lands 0.40-0.67 in one of them, so only near-total
 * concentration counts as explained.
 */
export const APERTURE = {
  /**
   * When one album or artist explains a selected set well enough to become
   * the card instead.
   *
   * Subgenre and genre are deliberately absent. A curated set drawn from one
   * lane is not the lane's card — that was the overcorrection that deleted the
   * primitive. Album and artist stay because they are more specific apertures
   * than a set of songs, not less: fifteen tracks that are all one record are
   * that record.
   */
  dominantShare: 0.6,
  minAlbumTracks: 4,
  minArtistTracks: 4,
};

// ── Cross-card redundancy ───────────────────────────────────────────────────

/**
 * Two cards are the same recommendation when they would hand the reader
 * substantially the same tracks.
 *
 * Measured by containment — the overlap as a fraction of the smaller card's
 * deliverable set — rather than by Jaccard, because a fifteen-track set
 * entirely contained in a three-hundred-track lane is redundant with it even
 * though the two sets are nothing alike in size.
 */
/**
 * Two cards are the same recommendation when they make the same claim about
 * the same material — not merely when they share tracks.
 *
 * Containment is the trigger, never the verdict. A curated fifteen-track set
 * is expected to sit inside the area it was drawn from; that is what an entry
 * point is. So overlap only opens the question, and the answer comes from
 * comparing the propositions: subject type, selection rule, claim, how much
 * each delivers, which sources vouch, and what anchors it to the viewer. Cards
 * differing in at least two of those are answering different questions and
 * both stay.
 */
export const REDUNDANCY = {
  /** Overlap, as a share of the smaller card, that opens the question. */
  containment: 0.6,
  /** Below this many shared tracks, overlap is coincidence rather than a fact. */
  minShared: 4,
  /** Facets that must differ for two overlapping cards to both survive. */
  minDistinctFacets: 2,
  /** Deliverable counts differ materially at this ratio or beyond. */
  materialCountRatio: 2,
};

// ── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Should this valid recommendation appear now?
 *
 * Deliberately a separate scale from recommendation quality. evidenceStrength,
 * attentionValue and anchor specificity say how good a recommendation is;
 * nothing here touches them. These numbers only decide placement in time, and
 * every card they place has already cleared the publishing floor.
 */
export const LIFECYCLE = {
  /** Never shown to this viewer before. */
  unseenBoost: 0.12,
  /** The material behind a previously-seen proposition genuinely changed. */
  materialChangeBoost: 0.10,
  /** Per impression, up to the cap. Seeing is not disliking. */
  impressionPenalty: 0.04,
  impressionPenaltyMax: 0.20,
  /** Opening is evidence the viewer already investigated it. */
  openPenalty: 0.10,
  openPenaltyMax: 0.30,
  /** How long a card rests after being seen, and after being opened. */
  impressionCooldownHours: 20,
  openCooldownHours: 96,
  /** A dismissal stands until the proposition itself changes. */
  dismissCooldownDays: 180,
  /** A cooled-down card comes back early only if its material changed. */
  materialChangeClearsCooldown: true,
  /** Feed pages. */
  pageSize: 24,
  maxPageSize: 40,
  /**
   * How far below the top of the remaining pool a page may draw.
   *
   * A pure best-first order makes the feed monotonically worse as it is read.
   * Composing each page from a window several pages deep lets diversity pull
   * strong-but-different cards forward, so later pages stay mixed instead of
   * becoming the dregs of a single sort.
   */
  pageWindowMultiple: 3,
  /** A feed session's ordering is fixed for this long. */
  sessionTtlMinutes: 90,
  /** Sessions kept per viewer, so a detail page opened later still resolves. */
  sessionsRetained: 4,
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

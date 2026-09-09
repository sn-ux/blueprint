/**
 * Blueprint's missed-information engine — shared types.
 *
 * The engine reveals what is absent from explicit sets. It does not model,
 * infer or characterise the people those sets belong to. Every candidate is a
 * subject plus an objective reason it was missed plus the evidence for that
 * reason, and every number a caption renders traces to an Evidence entry.
 *
 * There is deliberately nowhere to put a predicted-affinity score.
 */

// ── Input ───────────────────────────────────────────────────────────────────

export interface TrackRow {
  userId: string;
  spotifyId: string;
  name: string;
  artist: string;
  album: string | null;
  imageUrl?: string | null;
  artistId?: string | null;
  artistImageUrl?: string | null;
  blueprintWorld: string;
  blueprintSubgenre: string;
  /** Album structure. Null on rows imported before it was captured. */
  albumId?: string | null;
  albumTotalTracks?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  albumType?: string | null;
}

export interface PersonRow {
  id: string;
  name: string | null;
  image: string | null;
}

export interface EngineInput {
  viewerId: string;
  people: PersonRow[];
  tracks: TrackRow[];
}

// ── Sets ────────────────────────────────────────────────────────────────────

export type SetRef =
  | { kind: "user"; userId: string }
  | { kind: "friend"; userId: string }
  | { kind: "friendsAll" }
  | { kind: "genre"; genre: string }
  | { kind: "subgenre"; subgenre: string }
  | { kind: "artist"; artist: string }
  | { kind: "album"; artist: string; album: string };

export type DiscoverySetType =
  | "unanimous"
  | "kOfN"
  | "pair"
  | "tripleIntersection"
  | "albumGap"
  | "albumGapTrue"
  | "albumUnit"
  | "artistGap"
  | "artistAbsent"
  | "laneVoid"
  | "childVoid"
  | "laneDepth"
  | "genreGap";

export interface DiscoverySet {
  /** Stable hash of the expression. The duplicate-fact key. */
  id: string;
  type: DiscoverySetType;
  /** Rendered expression, for debugging: '(F_chris ∩ F_manish) − U'. */
  expression: string;
  /** Always ⊆ D. Never contains anything in U — enforced at construction. */
  members: string[];
  sourceSets: SetRef[];
  exclusionSet: SetRef;
  rawMetrics: Record<string, number>;
}

// ── Evidence ────────────────────────────────────────────────────────────────

export type Evidence =
  | { kind: "friendHolds"; userId: string; name: string; image: string | null }
  | { kind: "setCardinality"; setRef: SetRef; value: number }
  | { kind: "observedOwnership"; setRef: SetRef; owned: number; observed: number }
  | { kind: "membership"; spotifyId: string; setRef: SetRef }
  | { kind: "absence"; setRef: SetRef }
  | { kind: "holderDepth"; userId: string; name: string; count: number };

// ── Claims ──────────────────────────────────────────────────────────────────

/**
 * Every proposition carries both sides: what the viewer already holds, and
 * what is missing from it. A claim that only says "your friends have this"
 * cannot be expressed, because no proposition has that shape.
 */
export type StructuredProposition =
  | { type: "ALBUM_COMPLETION"; album: string; artist: string; owned: number; total: number; residue: number }
  | { type: "ALBUM_VIA_ARTIST"; album: string; artist: string; ownedByArtist: number; deliverable: number; names: string[] }
  | { type: "ARTIST_MORE"; artist: string; owned: number; deliverable: number; names: string[] }
  | { type: "ARTIST_VIA_LANE"; artist: string; lane: string; ownedInLane: number; deliverable: number; names: string[] }
  | { type: "LANE_MORE"; lane: string; owned: number; deliverable: number; names: string[] }
  | { type: "LANE_VIA_PARENT"; parent: string; lane: string; ownedInParent: number; deliverable: number }
  /**
   * A curated set: the area, the rule that picked these tracks out of it, and
   * the evidence. All three are required — the middle one is what separates
   * this from the area's own card.
   */
  | {
      type: "SET_CONSENSUS"; scope: string; scopeIsGenre: boolean;
      owned: number; deliverable: number; minHolders: number;
      qualifying: number; names: string[];
    };

export type ClaimType = StructuredProposition["type"];

export interface CaptionClaim {
  claimType: ClaimType;
  proposition: StructuredProposition;
  evidence: Evidence[];

  exceptionalness: number;
  specificity: number;
  socialMeaning: number;
  simplicity: number;
  confidence: number;

  score: number;
  /** Rendered sentence, chosen deterministically from the template family. */
  text: string;
  templateId: string;
}

/**
 * Why this missed material belongs in front of this particular viewer.
 *
 * Every anchor is an explicit set relationship against the viewer's own
 * library — tracks by this artist, tracks on this album, membership in this
 * lane. None of it infers a preference, and there is deliberately no field for
 * one. A recommendation carries three things: what was missed, why it connects
 * to what the viewer already holds, and what vouches for it.
 */
export type RecipientAnchorType =
  | "ARTIST_PRESENT"
  | "ALBUM_PARTIAL"
  | "SUBGENRE_PRESENT"
  | "PARENT_GENRE_PRESENT";

export interface RecipientAnchor {
  type: RecipientAnchorType;
  entityId: string;
  entityName: string;
  /** How many tracks the viewer already holds in that set. */
  ownedCount: number;
  /** The size of the relevant set, where one exists — an album's tracklist. */
  relevantSetSize?: number;
  /**
   * How tightly the anchor ties to the recommendation. Structural, not
   * psychological: an album is a narrower connection than an artist, an artist
   * than a lane, a lane than a whole genre.
   */
  specificity: number;
}

export const ANCHOR_SPECIFICITY: Record<RecipientAnchorType, number> = {
  ALBUM_PARTIAL: 1.0,
  ARTIST_PRESENT: 0.85,
  SUBGENRE_PRESENT: 0.6,
  PARENT_GENRE_PRESENT: 0.35,
};

// ── Candidates ──────────────────────────────────────────────────────────────

/**
 * The only six presentation units a card may have.
 *
 * DiscoverySets stay as complex as the evidence requires. Cards do not: every
 * card has to answer "what am I looking at?" immediately, and the answer is
 * always exactly one song, one small coherent set of songs, one album, one
 * artist, one subgenre or one genre. Multiple entities can be evidence for a
 * card; they can never be its subject.
 */
export type CardSubjectType =
  | "SONG_SET"
  | "ALBUM"
  | "ARTIST"
  | "SUBGENRE"
  | "GENRE";

export type SubjectType = "Song" | "Songs" | "Album" | "Artist" | "Subgenre" | "Genre";

/** The internal subject shape maps one-to-one onto an allowed card type. */
export const CARD_TYPE_OF: Partial<Record<SubjectType, CardSubjectType>> = {
  Songs: "SONG_SET", Album: "ALBUM",
  Artist: "ARTIST", Subgenre: "SUBGENRE", Genre: "GENRE",
  // Song is deliberately absent. A single track is never a card: a track
  // appears inside a set, an album, an artist or a lane, never as the
  // recommendation itself.
};

/**
 * Bounds for the one card type allowed to hold multiple independent items.
 *
 * A dozen is the floor for a multi-song recommendation to be worth opening.
 * Below it the set is not a discovery unit, and padding one to reach twelve
 * would be manufacturing the thing the bound exists to guarantee.
 */
export const SONG_SET_MIN = 12;
export const SONG_SET_TARGET = 12;
export const SONG_SET_MAX = 15;

/**
 * Why a set of tracks is one set.
 *
 * There are two different product jobs here and conflating them is what put
 * "Hip Hop songs" next to "Hip Hop" on the feed.
 *
 * An AREA card answers "what am I missing?" — its whole proposition is that a
 * region of music exists and the viewer is short of it. The subject is the
 * region itself: an album, an artist, a lane, a genre.
 *
 * A SELECTED set answers a different question: "which twelve to fifteen
 * tracks should I start with, and why these?" Sharing a genre is not what
 * makes such a set; a scope plus a further selection rule is. The rule has to
 * be factual and auditable — held by at least this many independent sources,
 * the intersection of these named libraries — and it has to actually select,
 * which is why the qualifying set is measured against the inventory of the
 * scope it was drawn from. It is never a mood, a theme or a cluster.
 *
 * Both may exist over the same taxonomy. Taxonomic concentration disqualifies
 * nothing: a landscape and an entry point into it are different cards.
 */
export type SelectionRuleId = "MIN_INDEPENDENT_HOLDERS";

export type ScopeEntity = "ALBUM" | "ARTIST" | "SUBGENRE" | "GENRE";

export interface SelectionRule {
  id: SelectionRuleId;
  /** The bar itself — how many independent sources a track needed. */
  threshold: number;
  /** How many tracks in the scope clear it. */
  qualifying: number;
  /** The scope's own corroborated inventory, so selectivity is measurable. */
  scopeInventory: number;
  /** Rendered for captions: "saved by at least three of your friends". */
  description: string;
}

export type GroupingReason =
  | { kind: "AREA"; entity: ScopeEntity; key: string }
  | {
      kind: "SELECTED";
      scope: { entity: ScopeEntity; key: string };
      rule: SelectionRule;
      /** Stable identity of the set, independent of the current threshold. */
      key: string;
    };

export type Subject =
  | { type: "Song"; spotifyId: string; name: string; artist: string; album: string | null }
  | { type: "Songs"; title: string; scope: string; discoverySetId: string }
  | { type: "Album"; artist: string; album: string }
  | { type: "Artist"; artist: string }
  | { type: "Subgenre"; subgenre: string }
  | { type: "Genre"; genre: string };

export type GeneratorId =
  | "ALBUM_GAP_TRUE"
  | "ALBUM_AS_UNIT"
  | "ARTIST_GAP"
  | "ARTIST_ABSENT_IN_LANE"
  | "SUBGENRE_GAP"
  | "MISSING_CHILD"
  | "CONSENSUS_SET";

export interface Candidate {
  id: string;
  subject: Subject;
  subjectKey: string;
  generator: GeneratorId;
  discoverySetId: string;
  discoveryExpression: string;

  evidence: Evidence[];
  reasonCodes: string[];

  /** Anchored, absolute, comparable across generators. Never rescaled. */
  evidenceStrength: number;
  /** Does knowing this make the user more likely to care about the music. */
  attentionValue: number;
  componentScores: Record<string, number>;

  /**
   * DELIVERABILITY.
   *
   * How many tracks the resulting page can actually show. Any claim that
   * enumerates or implies a finite set must be able to materialise all of it,
   * so this is checked against the number the caption promises. A claim that
   * describes a structural fact without promising an enumeration promises 0.
   */
  deliverableCount: number;
  /** The exact tracks the detail page would contain. */
  deliverableIds?: string[];
  /**
   * What makes these tracks one set. Declared by the generator, never
   * inferred: a SONG_SET may only exist over a STRUCTURAL reason.
   */
  groupingReason: GroupingReason;
  /** Set by the aperture stage; validated before feed composition. */
  cardType?: CardSubjectType;
  apertureNote?: string;
  /** Concentration of the set by each singular entity, for the report. */
  concentration?: Record<"album" | "artist" | "subgenre" | "genre", number>;

  /** Context the harness and diversifier read. */
  sourceFriendIds: string[];
  sourceFriendNames: string[];
  genre: string | null;
  subgenre: string | null;
  artist: string | null;
  album: string | null;
  /** Authoritative album identity for ALBUM cards. Never a title. */
  albumId?: string | null;

  claims?: CaptionClaim[];
  winningClaim?: CaptionClaim;
  losingClaims?: CaptionClaim[];
  caption?: string;

  /** 0.65·evidenceStrength + 0.35·attentionValue. Stays in [0,1]. */
  baseRankingScore?: number;
  tieBreak?: number;
  corroborationBonus?: number;
  /** base + tieBreak + corroboration. May exceed 1 — deliberately. */
  rankingScore?: number;
  /**
   * The recipient side of the recommendation. Required for a card to ship —
   * "your friends have this" on its own is not a reason to look.
   */
  anchor?: RecipientAnchor;
  /** Card-level quality. Requires strong evidence AND a reason to look. */
  qualityBand?: "EXCEPTIONAL" | "STRONG" | "SOLID";

  /**
   * Stable semantic identity of the proposition, and a hash of the facts
   * behind it. Feed rank is never identity: the same missed material stays
   * the same recommendation across runs, and only a change to what it
   * delivers makes it new again.
   */
  recommendationKey?: string;
  underlyingVersion?: string;
  /** Lifecycle placement, kept strictly apart from recommendation quality. */
  lifecycleScore?: number;
  lifecycleParts?: Record<string, number>;

  secondaryRationales?: { generator: GeneratorId; evidenceStrength: number; caption?: string }[];
  feedScore?: number;
  feedRank?: number;
}

export interface Rejection {
  stage: string;
  reasonCode: string;
  generator?: GeneratorId;
  subjectKey?: string;
  detail?: string;
}

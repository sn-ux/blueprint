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

export type StructuredProposition =
  | { type: "ALL_SOURCES_HAVE"; friendCount: number; names: string[] }
  | { type: "ALL_SOURCES_HAVE_SET"; friendCount: number; size: number }
  | { type: "K_OF_N_HAVE"; k: number; n: number; names: string[] }
  | { type: "NAMED_PAIR_HAVE"; names: [string, string] }
  | { type: "K_SHARE_SET"; k: number; size: number; names: string[] }
  /** Observed-set phrasing only. Never asserts a real tracklist length. */
  | { type: "SOLE_GAP_OBSERVED"; unit: "album" | "artist"; label: string; artist?: string }
  | { type: "RESIDUE_OBSERVED"; unit: "album" | "artist"; label: string; residue: number }
  /** Authoritative. Only ever built from a verified album tracklist length. */
  | { type: "SOLE_GAP_TRUE"; label: string; artist: string; totalTracks: number }
  | { type: "RESIDUE_TRUE"; label: string; artist: string; totalTracks: number; residue: number }
  | { type: "ALBUM_AS_UNIT"; label: string; artist: string; holders: number; depth: number }
  | { type: "ARTIST_ABSENT"; artist: string; lane: string; catalogSize: number; holders: number }
  | { type: "LANE_VOID"; lane: string; gapSize: number }
  | { type: "CHILD_VOID"; parent: string; child: string; gapSize: number }
  | { type: "LANE_GAP"; lane: string; gapSize: number }
  | { type: "SOURCE_LANE_DEPTH"; name: string; lane: string; count: number };

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

// ── Candidates ──────────────────────────────────────────────────────────────

export type SubjectType = "Song" | "Songs" | "Album" | "Artist" | "Subgenre" | "Genre";

export type Subject =
  | { type: "Song"; spotifyId: string; name: string; artist: string; album: string | null }
  | { type: "Songs"; label: string; discoverySetId: string }
  | { type: "Album"; artist: string; album: string }
  | { type: "Artist"; artist: string }
  | { type: "Subgenre"; subgenre: string }
  | { type: "Genre"; genre: string };

export type GeneratorId =
  | "UNANIMOUS_MISS"
  | "UNANIMOUS_SET"
  | "SUPERMAJORITY_MISS"
  | "PAIR_CONSENSUS"
  | "MULTI_INTERSECTION_SET"
  | "ALBUM_SOLE_GAP_TRUE"
  | "ALBUM_NEAR_COMPLETE_TRUE"
  | "ALBUM_SOLE_GAP_OBSERVED"
  | "ALBUM_RESIDUE_OBSERVED"
  | "ALBUM_AS_UNIT"
  | "ARTIST_SOLE_GAP_OBSERVED"
  | "ARTIST_RESIDUE_OBSERVED"
  | "ARTIST_ABSENT_IN_LANE"
  | "SUBGENRE_VOID"
  | "MISSING_CHILD"
  | "SOURCE_LANE_DEPTH"
  | "GENRE_GAP";

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

  /** Context the harness and diversifier read. */
  sourceFriendIds: string[];
  sourceFriendNames: string[];
  genre: string | null;
  subgenre: string | null;
  artist: string | null;
  album: string | null;

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
  /** Card-level quality. Requires strong evidence AND a reason to look. */
  qualityBand?: "EXCEPTIONAL" | "STRONG" | "SOLID";

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

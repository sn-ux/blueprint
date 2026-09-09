import * as CFG from "./config";
import {
  assertMissing, coverageOf, friendRef, setId, UNKNOWN_LANE,
  type DiscoveryIndex,
} from "./sets";
import {
  ANCHOR_SPECIFICITY, SONG_SET_MAX, SONG_SET_MIN,
  type Candidate, type DiscoverySet, type Evidence, type GeneratorId,
  type GroupingReason, type RecipientAnchor, type Subject,
} from "./types";

/**
 * Steps C and D — the generators.
 *
 * A recommendation is three things: material the viewer missed, a factual
 * reason it connects to what they already hold, and evidence the miss is worth
 * surfacing. The first on-device feed had only the third, and read as a list
 * of things other people own. Every generator here carries a RecipientAnchor,
 * and a candidate without one does not ship.
 *
 * evidenceStrength stays an absolute measure on one shared scale:
 *
 *   1.00  categorical      the fact admits no stronger form
 *   0.85  near-categorical one step from the maximum
 *   0.70  strong           a tight, named structural gap
 *   0.50  solid            real, unremarkable
 *   0.30  weak             true but common — the floor
 *
 * No single track is ever a card. A track appears inside a set, an album, an
 * artist or a lane, never as the recommendation itself.
 */

export const ES_FLOOR = CFG.ES_FLOOR;

export interface GeneratorSpec {
  id: GeneratorId;
  mechanism: string;
  run: (index: DiscoveryIndex) => Candidate[];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const log2 = (n: number) => Math.log(Math.max(1, n)) / Math.LN2;

let seq = 0;
const nextId = (g: string) => `${g}-${(seq++).toString(36)}`;

const holderEvidence = (index: DiscoveryIndex, ids: string[]): Evidence[] =>
  ids.map((id) => {
    const p = index.personOf.get(id);
    return { kind: "friendHolds", userId: id, name: p?.name ?? "Someone", image: p?.image ?? null } as Evidence;
  });

/** Distinct sources across a set of tracks. The external-evidence measure. */
function sourcesOf(index: DiscoveryIndex, ids: string[]): string[] {
  const s = new Set<string>();
  for (const id of ids) for (const h of index.holders.get(id) ?? []) s.add(h);
  return [...s];
}

/**
 * The tracks in a set that more than one source independently holds.
 *
 * One person owning something is not evidence that anyone missed it. This is
 * the subset a recommendation is built from, and it is also what stops a lane
 * of three hundred becoming a card that promises three hundred.
 */
function corroborated(index: DiscoveryIndex, ids: string[]): string[] {
  return ids
    .filter((id) => (index.holders.get(id)?.length ?? 0) >= CFG.MIN_SOURCES_PER_TRACK)
    .sort((a, b) => (index.holders.get(b)?.length ?? 0) - (index.holders.get(a)?.length ?? 0)
      || (index.meta.get(a)?.name ?? "").localeCompare(index.meta.get(b)?.name ?? ""));
}

const anchorOf = (
  type: RecipientAnchor["type"], entityId: string, entityName: string,
  ownedCount: number, relevantSetSize?: number,
): RecipientAnchor => ({
  type, entityId, entityName, ownedCount, relevantSetSize,
  specificity: ANCHOR_SPECIFICITY[type],
});

interface Built {
  generator: GeneratorId;
  subject: Subject;
  subjectKey: string;
  /** What makes these tracks one set. Declared, never inferred downstream. */
  groupingReason: GroupingReason;
  setType: DiscoverySet["type"];
  setKey: string;
  expression: string;
  members: string[];
  anchor: RecipientAnchor;
  evidenceStrength: number;
  componentScores: Record<string, number>;
  reasonCodes: string[];
  genre: string | null;
  subgenre: string | null;
  artist: string | null;
  album: string | null;
  albumId?: string | null;
}

/** Assembles a candidate and re-asserts the invariant over its deliverables. */
function build(index: DiscoveryIndex, b: Built): Candidate {
  assertMissing(index, b.members, b.generator);
  const sources = sourcesOf(index, b.members);
  const set: DiscoverySet = {
    id: setId(`${b.setType}:${b.setKey}`), type: b.setType, expression: b.expression,
    members: b.members, sourceSets: sources.map(friendRef),
    exclusionSet: { kind: "user", userId: index.viewerId },
    rawMetrics: { size: b.members.length, sources: sources.length },
  };
  return {
    id: nextId(b.generator),
    subject: b.subject,
    subjectKey: b.subjectKey,
    groupingReason: b.groupingReason,
    generator: b.generator,
    discoverySetId: set.id,
    discoveryExpression: b.expression,
    evidence: [
      { kind: "setCardinality", setRef: { kind: "friendsAll" }, value: b.members.length },
      ...holderEvidence(index, sources),
    ],
    reasonCodes: [...b.reasonCodes, `SOURCES=${sources.length}`, `DELIVERABLE=${b.members.length}`],
    evidenceStrength: b.evidenceStrength,
    attentionValue: 0,
    componentScores: {
      ...b.componentScores, sources: sources.length,
      anchorSpecificity: b.anchor.specificity,
    },
    anchor: b.anchor,
    deliverableCount: b.members.length,
    deliverableIds: b.members,
    sourceFriendIds: sources,
    sourceFriendNames: sources.map((h) => index.nameOf.get(h) ?? "Someone"),
    genre: b.genre, subgenre: b.subgenre, artist: b.artist, album: b.album,
    albumId: b.albumId ?? null,
  };
}

// ── ARTIST ──────────────────────────────────────────────────────────────────

const artistGap: GeneratorSpec = {
  id: "ARTIST_GAP",
  mechanism: "The viewer already holds this artist; corroborated tracks by them are missing.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const u of index.artists.values()) {
      const owned = index.viewerByArtist.get(u.artist) ?? 0;
      if (owned < CFG.ARTIST_GAP.minOwned) continue;
      const members = corroborated(index, u.missing);
      if (members.length < CFG.ARTIST_GAP.minMissing) continue;
      const bounded = members.slice(0, CFG.DELIVERABLE_MAX);
      out.push(build(index, {
        generator: "ARTIST_GAP",
        subject: { type: "Artist", artist: u.artist },
        subjectKey: `Artist:${u.artist}`,
        groupingReason: { kind: "TAXONOMIC", entity: "ARTIST", key: u.artist },
        setType: "artistGap", setKey: u.artist,
        expression: `(A_${u.artist} ∩ F_all) − U, |A ∩ U| = ${owned}`,
        members: bounded,
        anchor: anchorOf("ARTIST_PRESENT", u.artist, u.artist, owned),
        // Depth of the viewer's own holding is what separates a real gap from
        // an artist they brushed past once.
        evidenceStrength: clamp01(
          0.55 + 0.20 * Math.min(1, owned / CFG.ARTIST_GAP.ownedSaturation)
          + 0.15 * Math.min(1, log2(bounded.length) / log2(CFG.ARTIST_GAP.missingSaturation)),
        ),
        componentScores: { ownedByViewer: owned, missing: bounded.length },
        reasonCodes: ["ANCHOR=ARTIST_PRESENT", `OWNED=${owned}`],
        genre: index.meta.get(bounded[0])?.world ?? null,
        subgenre: null, artist: u.artist, album: null,
      }));
    }
    return out;
  },
};

const artistAbsentInLane: GeneratorSpec = {
  id: "ARTIST_ABSENT_IN_LANE",
  mechanism: "An artist absent from the viewer's set, inside a lane their set occupies.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const u of index.artists.values()) {
      if ((index.viewerByArtist.get(u.artist) ?? 0) !== 0) continue;
      const members = corroborated(index, u.missing);
      if (members.length < CFG.ARTIST_ABSENT.minCatalog) continue;

      const counts = new Map<string, number>();
      for (const id of members) {
        const s = index.meta.get(id)?.subgenre;
        if (s && s !== UNKNOWN_LANE) counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!dominant) continue;
      const ownedInLane = index.viewerByLane.get(dominant[0]) ?? 0;
      if (ownedInLane < CFG.ARTIST_ABSENT.minOwnedInLane) continue;

      const universe = new Set<string>(index.sourcesInLane.get(dominant[0]) ?? []);
      for (const h of sourcesOf(index, members)) universe.add(h);
      const cov = coverageOf(sourcesOf(index, members).length, universe.size);
      const bounded = members.slice(0, CFG.DELIVERABLE_MAX);

      out.push(build(index, {
        generator: "ARTIST_ABSENT_IN_LANE",
        subject: { type: "Artist", artist: u.artist },
        subjectKey: `Artist:${u.artist}`,
        groupingReason: { kind: "TAXONOMIC", entity: "ARTIST", key: u.artist },
        setType: "artistAbsent", setKey: u.artist,
        expression: `A_${u.artist} ∩ F_all, A ∩ U = ∅, |S_${dominant[0]} ∩ U| = ${ownedInLane}`,
        members: bounded,
        anchor: anchorOf("SUBGENRE_PRESENT", dominant[0], dominant[0], ownedInLane),
        evidenceStrength: clamp01(
          0.35 + 0.20 * cov.sourceCoverage
          + 0.15 * Math.min(1, log2(bounded.length) / log2(CFG.ARTIST_ABSENT.catalogSaturation)),
        ),
        componentScores: {
          catalogSize: bounded.length, ownedInLane,
          eligibleSourceCount: universe.size, sourceCoverage: cov.sourceCoverage,
        },
        reasonCodes: ["ANCHOR=SUBGENRE_PRESENT", "VIEWER_ABSENT", `OWNED_IN_LANE=${ownedInLane}`],
        genre: index.lanes.get(dominant[0])?.world ?? null,
        subgenre: dominant[0], artist: u.artist, album: null,
      }));
    }
    return out;
  },
};

// ── ALBUM ───────────────────────────────────────────────────────────────────

function authoritativeScore(totalTracks: number, ownedPositions: number, residue: number): number {
  const exactness = 1 / residue;
  const held = Math.min(1, ownedPositions / CFG.ALBUM_AUTHORITATIVE.heldSaturation);
  const scale = Math.min(1, log2(totalTracks) / log2(CFG.ALBUM_AUTHORITATIVE.scaleSaturation));
  return Math.min(CFG.ALBUM_AUTHORITATIVE.ceiling,
    clamp01(0.60 + 0.24 * exactness * held + 0.08 * scale));
}

const albumGapTrue: GeneratorSpec = {
  id: "ALBUM_GAP_TRUE",
  mechanism: "The viewer holds part of a verified album; the exact remainder is deliverable.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const a of index.authAlbums.values()) {
      if (!a.consistent) continue;
      const residue = a.totalTracks - a.ownedPositions;
      if (residue < 1 || residue > CFG.ALBUM_AUTHORITATIVE.nearCompleteResidueMax) continue;
      if (a.ownedPositions < CFG.ALBUM_AUTHORITATIVE.minOwnedPositions) continue;
      // Deliverability: the whole residue must exist in a source library.
      if (a.missing.length !== residue) continue;

      out.push(build(index, {
        generator: "ALBUM_GAP_TRUE",
        subject: { type: "Album", artist: a.artist, album: a.title },
        subjectKey: `Album:${a.albumId}`,
        groupingReason: { kind: "TAXONOMIC", entity: "ALBUM", key: a.albumId },
        setType: "albumGapTrue", setKey: a.albumId,
        expression: `AL_${a.albumId} − U   (${a.ownedPositions}/${a.totalTracks} held)`,
        members: a.missing,
        anchor: anchorOf("ALBUM_PARTIAL", a.albumId, a.title, a.ownedPositions, a.totalTracks),
        evidenceStrength: authoritativeScore(a.totalTracks, a.ownedPositions, residue),
        componentScores: { totalTracks: a.totalTracks, ownedPositions: a.ownedPositions, residue },
        reasonCodes: [
          "ANCHOR=ALBUM_PARTIAL", "AUTHORITATIVE_CATALOG",
          `ALBUM_ID=${a.albumId}`, `TOTAL=${a.totalTracks}`, `OWNED=${a.ownedPositions}`,
        ],
        genre: null, subgenre: null, artist: a.artist, album: a.title, albumId: a.albumId,
      }));
    }
    return out;
  },
};

const albumAsUnit: GeneratorSpec = {
  id: "ALBUM_AS_UNIT",
  mechanism: "A record the viewer has none of, by an artist they hold, kept in depth by several sources.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const a of index.authAlbums.values()) {
      if (!a.consistent) continue;
      if (a.ownedPositions !== 0) continue;
      const ownedByArtist = index.viewerByArtist.get(a.artist) ?? 0;
      if (ownedByArtist < CFG.ALBUM_AS_UNIT.minOwnedByArtist) continue;
      const members = corroborated(index, a.missing);
      if (members.length < CFG.ALBUM_AS_UNIT.minDeliverable) continue;

      out.push(build(index, {
        generator: "ALBUM_AS_UNIT",
        subject: { type: "Album", artist: a.artist, album: a.title },
        subjectKey: `Album:${a.albumId}`,
        groupingReason: { kind: "TAXONOMIC", entity: "ALBUM", key: a.albumId },
        setType: "albumUnit", setKey: a.albumId,
        expression: `AL_${a.albumId} ∩ F_all, AL ∩ U = ∅, |A_${a.artist} ∩ U| = ${ownedByArtist}`,
        members: members.slice(0, CFG.DELIVERABLE_MAX),
        anchor: anchorOf("ARTIST_PRESENT", a.artist, a.artist, ownedByArtist),
        evidenceStrength: clamp01(
          0.50 + 0.20 * Math.min(1, ownedByArtist / CFG.ARTIST_GAP.ownedSaturation)
          + 0.15 * Math.min(1, members.length / Math.max(1, a.totalTracks)),
        ),
        componentScores: { ownedByArtist, totalTracks: a.totalTracks, deliverable: members.length },
        reasonCodes: ["ANCHOR=ARTIST_PRESENT", "VIEWER_ABSENT_FROM_ALBUM", `ALBUM_ID=${a.albumId}`],
        genre: null, subgenre: null, artist: a.artist, album: a.title, albumId: a.albumId,
      }));
    }
    return out;
  },
};

// ── LANES ───────────────────────────────────────────────────────────────────

const subgenreGap: GeneratorSpec = {
  id: "SUBGENRE_GAP",
  mechanism: "A lane the viewer is present in, with corroborated tracks missing.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const lane of index.lanes.values()) {
      const owned = index.viewerByLane.get(lane.subgenre) ?? 0;
      if (owned < CFG.LANE.minOwnedForPresent) continue;
      const members = corroborated(index, lane.gap);
      if (members.length < CFG.LANE.minDeliverable) continue;
      const bounded = members.slice(0, CFG.DELIVERABLE_MAX);

      const eligible = index.sourcesInWorld.get(lane.world)?.size ?? 0;
      const cov = coverageOf([...lane.byFriend.keys()].length, eligible);

      out.push(build(index, {
        generator: "SUBGENRE_GAP",
        subject: { type: "Subgenre", subgenre: lane.subgenre },
        subjectKey: `Subgenre:${lane.subgenre}`,
        groupingReason: { kind: "TAXONOMIC", entity: "SUBGENRE", key: lane.subgenre },
        setType: "laneVoid", setKey: `gap:${lane.subgenre}`,
        expression: `(F_all ∩ S_${lane.subgenre}) − U, |S ∩ U| = ${owned}`,
        members: bounded,
        anchor: anchorOf("SUBGENRE_PRESENT", lane.subgenre, lane.subgenre, owned),
        evidenceStrength: clamp01(
          0.40 + 0.22 * cov.sourceCoverage
          + 0.13 * Math.min(1, log2(bounded.length) / log2(CFG.LANE.magnitudeSaturation)),
        ),
        componentScores: {
          ownedInLane: owned, deliverable: bounded.length,
          eligibleSourceCount: eligible, sourceCoverage: cov.sourceCoverage,
        },
        reasonCodes: ["ANCHOR=SUBGENRE_PRESENT", `OWNED_IN_LANE=${owned}`],
        genre: lane.world, subgenre: lane.subgenre, artist: null, album: null,
      }));
    }
    return out;
  },
};

const missingChild: GeneratorSpec = {
  id: "MISSING_CHILD",
  mechanism: "A child lane absent from the viewer's set, inside a parent genre it occupies.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const lane of index.lanes.values()) {
      if ((index.viewerByLane.get(lane.subgenre) ?? 0) !== 0) continue;
      const ownedInParent = index.viewerByWorld.get(lane.world) ?? 0;
      if (ownedInParent < CFG.LANE.minOwnedInParent) continue;
      const members = corroborated(index, lane.gap);
      if (members.length < CFG.LANE.minDeliverable) continue;
      const bounded = members.slice(0, CFG.DELIVERABLE_MAX);

      const eligible = index.sourcesInWorld.get(lane.world)?.size ?? 0;
      const cov = coverageOf([...lane.byFriend.keys()].length, eligible);

      out.push(build(index, {
        generator: "MISSING_CHILD",
        subject: { type: "Subgenre", subgenre: lane.subgenre },
        subjectKey: `Subgenre:${lane.subgenre}`,
        groupingReason: { kind: "TAXONOMIC", entity: "SUBGENRE", key: lane.subgenre },
        setType: "childVoid", setKey: `child:${lane.subgenre}`,
        expression: `(F_all ∩ S_${lane.subgenre}) − U, S ∩ U = ∅, |G_${lane.world} ∩ U| = ${ownedInParent}`,
        members: bounded,
        anchor: anchorOf("PARENT_GENRE_PRESENT", lane.world, lane.world, ownedInParent),
        evidenceStrength: clamp01(
          0.35 + 0.22 * cov.sourceCoverage
          + 0.13 * Math.min(1, log2(bounded.length) / log2(CFG.LANE.magnitudeSaturation)),
        ),
        componentScores: {
          ownedInParent, deliverable: bounded.length,
          eligibleSourceCount: eligible, sourceCoverage: cov.sourceCoverage,
        },
        reasonCodes: ["ANCHOR=PARENT_GENRE_PRESENT", "VIEWER_ABSENT", `OWNED_IN_PARENT=${ownedInParent}`],
        genre: lane.world, subgenre: lane.subgenre, artist: null, album: null,
      }));
    }
    return out;
  },
};

// ── SONG_SET ────────────────────────────────────────────────────────────────

/**
 * Consensus delivered as a set rather than as single tracks.
 *
 * Tracks several sources agree on, grouped by a lane the viewer already
 * occupies so the set has a reason to be in front of them. This is what
 * replaces the per-track consensus cards: the same evidence, at an aperture a
 * reader can act on.
 */
const consensusInLane: GeneratorSpec = {
  id: "CONSENSUS_IN_LANE",
  mechanism: "Tracks several sources agree on, inside a lane the viewer occupies.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const lane of index.lanes.values()) {
      const owned = index.viewerByLane.get(lane.subgenre) ?? 0;
      if (owned < CFG.LANE.minOwnedForPresent) continue;
      const strong = lane.gap
        .filter((id) => (index.holders.get(id)?.length ?? 0) >= CFG.CONSENSUS_SET.minSourcesPerTrack)
        .sort((a, b) => (index.holders.get(b)?.length ?? 0) - (index.holders.get(a)?.length ?? 0)
          || (index.meta.get(a)?.name ?? "").localeCompare(index.meta.get(b)?.name ?? ""));
      if (strong.length < SONG_SET_MIN) continue;
      const members = strong.slice(0, SONG_SET_MAX);

      out.push(build(index, {
        generator: "CONSENSUS_IN_LANE",
        subject: { type: "Songs", label: lane.subgenre, discoverySetId: "" },
        subjectKey: `Songs:consensus:${lane.subgenre}`,
        // Every track here shares one lane. That is a taxonomic reason, so the
        // aperture stage turns this into the lane's own card rather than a
        // second card called "<lane> songs" standing beside it.
        groupingReason: { kind: "TAXONOMIC", entity: "SUBGENRE", key: lane.subgenre },
        setType: "kOfN", setKey: `consensus:${lane.subgenre}`,
        expression: `{ t ∈ (F_all ∩ S_${lane.subgenre}) − U : |holders(t)| ≥ ${CFG.CONSENSUS_SET.minSourcesPerTrack} }`,
        members,
        anchor: anchorOf("SUBGENRE_PRESENT", lane.subgenre, lane.subgenre, owned),
        evidenceStrength: clamp01(
          0.55 + 0.25 * Math.min(1, members.length / SONG_SET_MAX)
          + 0.10 * Math.min(1, owned / CFG.LANE.ownedSaturation),
        ),
        componentScores: { ownedInLane: owned, deliverable: members.length },
        reasonCodes: ["ANCHOR=SUBGENRE_PRESENT", `MIN_HOLDERS=${CFG.CONSENSUS_SET.minSourcesPerTrack}`],
        genre: lane.world, subgenre: lane.subgenre, artist: null, album: null,
      }));
    }
    return out;
  },
};

export const GENERATORS: GeneratorSpec[] = [
  albumGapTrue, albumAsUnit,
  artistGap, artistAbsentInLane,
  subgenreGap, missingChild,
  consensusInLane,
];

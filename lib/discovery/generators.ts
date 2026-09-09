import * as CFG from "./config";
import { label } from "./display";
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
  bridgeArtists?: string[];
  deepSourceNames?: string[];
  deepSourceCounts?: number[];
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
    bridgeArtists: b.bridgeArtists,
    deepSourceNames: b.deepSourceNames,
    deepSourceCounts: b.deepSourceCounts,
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
        groupingReason: { kind: "AREA", entity: "ARTIST", key: u.artist },
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
        groupingReason: { kind: "AREA", entity: "ARTIST", key: u.artist },
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
        groupingReason: { kind: "AREA", entity: "ALBUM", key: a.albumId },
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
        groupingReason: { kind: "AREA", entity: "ALBUM", key: a.albumId },
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
        groupingReason: { kind: "AREA", entity: "SUBGENRE", key: lane.subgenre },
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
        groupingReason: { kind: "AREA", entity: "SUBGENRE", key: lane.subgenre },
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

const spellOut = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const spell = (n: number) => (n <= 10 ? spellOut[n] : String(n));

/**
 * The strongest consensus a scope will support.
 *
 * Not a fixed number of holders. The rule is "the most agreement available
 * here that still fills a set", so the threshold is the highest holder count
 * for which the scope still contains at least a full set's worth of tracks.
 * That is the same rule at four sources and at four hundred; only the number
 * it resolves to changes, which is exactly the property a threshold hardcoded
 * at three would lose.
 *
 * It never drops to the generic corroboration floor. A set selected at the
 * same bar every other card already clears would not be a selection — it would
 * be the top of the area, which is the card the area already has.
 */
function strongestThreshold(
  index: DiscoveryIndex, pool: string[], universe: number,
): { k: number; qualifying: string[] } | null {
  const holdersOf = (id: string) => index.holders.get(id)?.length ?? 0;
  let best: { k: number; qualifying: string[] } | null = null;
  for (let k = CFG.CONSENSUS_SET.minHolders; k <= universe; k++) {
    const qualifying = pool.filter((id) => holdersOf(id) >= k);
    if (qualifying.length < SONG_SET_MIN) break;
    best = { k, qualifying };
  }
  return best;
}

/**
 * A curated entry point into an area the viewer is already in.
 *
 * The area card answers "what am I missing?" — a whole lane or genre of it.
 * This answers the next question: of everything in there, which dozen should
 * you start with, and why those. The reason is external and auditable — this
 * many independent people kept each one — and it is strictly stronger than the
 * bar every other card clears, so the set is never a truncation of the area.
 *
 * The scope is the most specific one that supports the rule. A lane where the
 * evidence is dense enough, a genre where it is not. At four sources no single
 * lane holds a dozen tracks that three people independently kept, so these
 * come out genre-scoped and span many lanes and artists; as sources are added
 * the same rule tightens onto lanes without changing meaning.
 */
const consensusSet: GeneratorSpec = {
  id: "CONSENSUS_SET",
  mechanism: "The tracks in an area the viewer occupies that the most sources independently kept.",
  run: (index) => {
    const out: Candidate[] = [];
    const universe = Math.max(index.eligibleSourceUniverse, index.friends.length);

    interface Scope {
      entity: "SUBGENRE" | "GENRE";
      key: string;
      world: string;
      gap: string[];
      owned: number;
      anchor: RecipientAnchor;
    }
    const scopes: Scope[] = [];

    // Most specific first: a lane the viewer is in, then the genre around it.
    for (const lane of index.lanes.values()) {
      const owned = index.viewerByLane.get(lane.subgenre) ?? 0;
      if (owned < CFG.CONSENSUS_SET.minOwnedInLane) continue;
      scopes.push({
        entity: "SUBGENRE", key: lane.subgenre, world: lane.world, gap: lane.gap, owned,
        anchor: anchorOf("SUBGENRE_PRESENT", lane.subgenre, lane.subgenre, owned),
      });
    }
    for (const w of index.worlds.values()) {
      const owned = index.viewerByWorld.get(w.world) ?? 0;
      if (owned < CFG.CONSENSUS_SET.minOwnedInGenre) continue;
      scopes.push({
        entity: "GENRE", key: w.world, world: w.world, gap: w.gap, owned,
        anchor: anchorOf("PARENT_GENRE_PRESENT", w.world, w.world, owned),
      });
    }

    for (const scope of scopes) {
      // The area's own inventory, at the bar every card clears. The
      // denominator the selection has to be materially smaller than.
      const inventory = corroborated(index, scope.gap);
      if (inventory.length < SONG_SET_MIN) continue;

      const found = strongestThreshold(index, scope.gap, universe);
      if (!found) continue;
      const share = found.qualifying.length / inventory.length;
      if (share > CFG.CONSENSUS_SET.maxShareOfScope) continue;

      const members = found.qualifying
        .slice()
        .sort((a, b) => (index.holders.get(b)?.length ?? 0) - (index.holders.get(a)?.length ?? 0)
          || (index.meta.get(a)?.name ?? "").localeCompare(index.meta.get(b)?.name ?? ""))
        .slice(0, SONG_SET_MAX);

      const scopeLabel = label(scope.key);
      const setKey = `consensus:${scope.entity}:${scope.key}`;
      // Scope plus rule, so the card cannot be read as the area's own card.
      const title = `${scopeLabel} — Held by ${found.k}+ Friends`;
      const description = `saved by at least ${spell(found.k)} of your friends independently`;

      out.push(build(index, {
        generator: "CONSENSUS_SET",
        subject: { type: "Songs", title, scope: scope.key, discoverySetId: "" },
        subjectKey: `Songs:${setKey}`,
        groupingReason: {
          kind: "SELECTED",
          scope: { entity: scope.entity, key: scope.key },
          rule: {
            id: "MIN_INDEPENDENT_HOLDERS",
            threshold: found.k,
            qualifying: found.qualifying.length,
            scopeInventory: inventory.length,
            description,
          },
          key: setKey,
        },
        setType: "kOfN", setKey,
        expression: `{ t ∈ (F_all ∩ ${scope.entity === "GENRE" ? "G" : "S"}_${scope.key}) − U : |holders(t)| ≥ ${found.k} }`,
        members,
        anchor: scope.anchor,
        // How far above the generic corroboration floor the rule sits is what
        // this card is actually about; size and the viewer's own depth follow.
        evidenceStrength: clamp01(
          0.55
          + 0.20 * Math.min(1, (found.k - CFG.MIN_SOURCES_PER_TRACK)
            / Math.max(1, universe - CFG.MIN_SOURCES_PER_TRACK))
          + 0.15 * Math.min(1, members.length / SONG_SET_MAX)
          + 0.10 * Math.min(1, scope.owned / CFG.LANE.ownedSaturation),
        ),
        componentScores: {
          minHolders: found.k, qualifying: found.qualifying.length,
          scopeInventory: inventory.length, deliverable: members.length,
          ownedInScope: scope.owned,
        },
        reasonCodes: [
          `ANCHOR=${scope.anchor.type}`, "SELECTED_SET",
          `MIN_HOLDERS=${found.k}`, `QUALIFYING=${found.qualifying.length}`,
          `SCOPE_INVENTORY=${inventory.length}`,
        ],
        genre: scope.world,
        subgenre: scope.entity === "SUBGENRE" ? scope.key : null,
        artist: null, album: null,
      }));
    }
    return out;
  },
};

// ── Stacked propositions ────────────────────────────────────────────────────

/**
 * Artists already in the viewer's library who also work in a lane.
 *
 * Purely structural: the artist has tracks classified in this lane, and the
 * viewer holds tracks by that artist. Nothing here says the viewer likes
 * anyone; it says their library and this lane overlap at a named point.
 */
function bridgeOf(index: DiscoveryIndex, gap: string[]) {
  const owned = new Map<string, number>();
  for (const id of gap) {
    const a = index.meta.get(id)?.artist;
    if (!a) continue;
    const n = index.viewerByArtist.get(a) ?? 0;
    if (n > 0) owned.set(a, n);
  }
  const ranked = [...owned.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    artists: ranked.map(([a]) => a),
    ranked,
    totalOwned: ranked.reduce((s, [, n]) => s + n, 0),
    tracks: gap.filter((id) => owned.has(index.meta.get(id)?.artist ?? "")),
  };
}

/** Most-held first, then alphabetical, so a set is the same set every run. */
const byStrength = (index: DiscoveryIndex) => (a: string, b: string) =>
  (index.holders.get(b)?.length ?? 0) - (index.holders.get(a)?.length ?? 0)
  || (index.meta.get(a)?.name ?? "").localeCompare(index.meta.get(b)?.name ?? "");

/**
 * A lane the viewer has never entered, reached over artists they already have.
 *
 * Three facts stacked: the lane is absent from their library, several sources
 * keep material in it, and named artists already in their library work there.
 * The third is what turns "your friends have things you don't" into a reason.
 */
const bridgedLane: GeneratorSpec = {
  id: "BRIDGED_LANE",
  mechanism: "A lane absent from the viewer's library, where artists they already hold also work.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const lane of index.lanes.values()) {
      if (lane.subgenre === UNKNOWN_LANE) continue;
      if ((index.viewerByLane.get(lane.subgenre) ?? 0) !== 0) continue;

      const bridge = bridgeOf(index, lane.gap);
      if (bridge.artists.length < CFG.BRIDGE.minArtists) continue;
      if (bridge.totalOwned < CFG.BRIDGE.minOwnedByBridge) continue;

      const members = lane.gap.slice().sort(byStrength(index)).slice(0, CFG.DELIVERABLE_MAX);
      if (members.length < CFG.BRIDGE.minDeliverable) continue;
      if (sourcesOf(index, members).length < CFG.MIN_SOURCES_PER_CARD) continue;

      const [topArtist, topOwned] = bridge.ranked[0];
      const eligible = index.sourcesInWorld.get(lane.world)?.size ?? 0;
      const cov = coverageOf([...lane.byFriend.keys()].length, eligible);

      out.push(build(index, {
        generator: "BRIDGED_LANE",
        subject: { type: "Subgenre", subgenre: lane.subgenre },
        subjectKey: `Subgenre:${lane.subgenre}`,
        groupingReason: { kind: "AREA", entity: "SUBGENRE", key: lane.subgenre },
        setType: "laneVoid", setKey: `bridge:${lane.subgenre}`,
        expression: `(F_all ∩ S_${lane.subgenre}) − U, S ∩ U = ∅, bridge = {${bridge.artists.slice(0, 3).join(", ")}}`,
        members,
        // The bridging artist is the tightest true connection to territory the
        // viewer does not occupy — tighter than naming the parent genre.
        anchor: anchorOf("ARTIST_PRESENT", topArtist, topArtist, topOwned),
        evidenceStrength: clamp01(
          0.50
          + 0.22 * Math.min(1, log2(bridge.totalOwned) / log2(CFG.ARTIST_GAP.ownedSaturation))
          + 0.13 * Math.min(1, bridge.artists.length / 4)
          + 0.10 * cov.sourceCoverage,
        ),
        componentScores: {
          bridgeArtists: bridge.artists.length, ownedByBridge: bridge.totalOwned,
          deliverable: members.length, sourceCoverage: cov.sourceCoverage,
        },
        reasonCodes: [
          "ANCHOR=ARTIST_PRESENT", "STACKED", "VIEWER_ABSENT_FROM_LANE",
          `BRIDGE_ARTISTS=${bridge.artists.length}`, `OWNED_BY_BRIDGE=${bridge.totalOwned}`,
        ],
        bridgeArtists: bridge.artists,
        genre: lane.world, subgenre: lane.subgenre, artist: null, album: null,
      }));
    }
    return out;
  },
};

/**
 * New territory handed over as a dozen concrete tracks.
 *
 * Telling someone a lane exists is weaker than giving them the tracks to start
 * with. The vouch here is depth rather than agreement: several sources each
 * independently keep at least as much of this lane as the set being handed
 * over. That is the axis that survives in thin territory, where no two people
 * happen to have kept the same song.
 */
const newTerritorySet: GeneratorSpec = {
  id: "NEW_TERRITORY_SET",
  mechanism: "A dozen tracks from a lane the viewer has none of, where several sources each keep a lane's worth.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const lane of index.lanes.values()) {
      if (lane.subgenre === UNKNOWN_LANE) continue;
      if ((index.viewerByLane.get(lane.subgenre) ?? 0) !== 0) continue;
      if (lane.gap.length < SONG_SET_MIN) continue;

      // Several sources each occupying the lane in their own right, by the
      // same bar Blueprint uses for the viewer's own presence — and at least
      // one of them holding a full set's worth, so the starter set comes out
      // of somebody's real collection rather than everyone's stray tracks.
      const deep = [...lane.byFriend.entries()]
        .filter(([, set]) => set.size >= CFG.LANE.minOwnedForPresent)
        .sort((a, b) => b[1].size - a[1].size);
      if (deep.length < CFG.NEW_TERRITORY.minSources) continue;
      if (deep[0][1].size < SONG_SET_MIN) continue;

      const members = lane.gap.slice().sort(byStrength(index)).slice(0, SONG_SET_MAX);
      if (members.length < SONG_SET_MIN) continue;

      const bridge = bridgeOf(index, lane.gap);
      const ownedInParent = index.viewerByWorld.get(lane.world) ?? 0;
      // Most specific anchor the viewer's library actually supports.
      const useBridge = bridge.artists.length > 0 && bridge.totalOwned >= CFG.BRIDGE.minOwnedByBridge;
      if (!useBridge && ownedInParent < CFG.LANE.minOwnedInParent) continue;
      const anchor = useBridge
        ? anchorOf("ARTIST_PRESENT", bridge.ranked[0][0], bridge.ranked[0][0], bridge.ranked[0][1])
        : anchorOf("PARENT_GENRE_PRESENT", lane.world, lane.world, ownedInParent);

      const setKey = `newterritory:${lane.subgenre}`;
      out.push(build(index, {
        generator: "NEW_TERRITORY_SET",
        subject: {
          type: "Songs",
          title: `${label(lane.subgenre)} — Where To Start`,
          scope: lane.subgenre, discoverySetId: "",
        },
        subjectKey: `Songs:${setKey}`,
        groupingReason: {
          kind: "SELECTED",
          scope: { entity: "SUBGENRE", key: lane.subgenre },
          rule: {
            id: "MULTI_SOURCE_DEPTH",
            threshold: deep.length,
            qualifying: members.length,
            scopeInventory: lane.gap.length,
            description: `kept by ${deep.length} of your friends who each have a collection here`,
          },
          key: setKey,
        },
        setType: "kOfN", setKey,
        expression: `(F_all ∩ S_${lane.subgenre}) − U, S ∩ U = ∅, |F_i ∩ S| ≥ ${SONG_SET_MIN} for ${deep.length} sources`,
        members,
        anchor,
        evidenceStrength: clamp01(
          0.50
          + 0.20 * Math.min(1, deep.length / Math.max(2, index.friends.length))
          + 0.15 * Math.min(1, log2(deep[0][1].size) / log2(CFG.LANE.magnitudeSaturation))
          + 0.10 * (useBridge ? Math.min(1, bridge.totalOwned / CFG.ARTIST_GAP.ownedSaturation) : 0),
        ),
        componentScores: {
          deepSources: deep.length, deepest: deep[0][1].size,
          laneInventory: lane.gap.length, deliverable: members.length,
          bridgeArtists: bridge.artists.length, ownedByBridge: bridge.totalOwned,
          ownedInParent,
        },
        reasonCodes: [
          `ANCHOR=${anchor.type}`, "STACKED", "NEW_TERRITORY",
          `DEEP_SOURCES=${deep.length}`, `LANE_INVENTORY=${lane.gap.length}`,
        ],
        bridgeArtists: bridge.artists,
        deepSourceNames: deep.map(([f]) => index.nameOf.get(f) ?? "Someone"),
        deepSourceCounts: deep.map(([, set]) => set.size),
        genre: lane.world, subgenre: lane.subgenre, artist: null, album: null,
      }));
    }
    return out;
  },
};

/**
 * A record that is the hole in a catalogue otherwise covered.
 *
 * "An album you don't have by an artist you do" is a fact about one record.
 * How much of the rest of that catalogue is already in the library is what
 * turns it into a gap worth closing, and it is the stacked version of the
 * same missed material.
 */
const albumCatalogGap: GeneratorSpec = {
  id: "ALBUM_CATALOG_GAP",
  mechanism: "A record the viewer has none of, by an artist whose other albums they hold.",
  run: (index) => {
    const out: Candidate[] = [];
    // How many distinct albums of each artist the viewer already holds part of.
    const heldAlbumsByArtist = new Map<string, Set<string>>();
    for (const a of index.authAlbums.values()) {
      if ((index.viewerByAlbumId.get(a.albumId) ?? 0) === 0) continue;
      const set = heldAlbumsByArtist.get(a.artist) ?? new Set<string>();
      set.add(a.albumId);
      heldAlbumsByArtist.set(a.artist, set);
    }

    for (const a of index.authAlbums.values()) {
      if (!a.consistent || a.ownedPositions !== 0) continue;
      const held = heldAlbumsByArtist.get(a.artist)?.size ?? 0;
      if (held < CFG.ALBUM_CATALOG_GAP.minAlbumsHeld) continue;
      const ownedByArtist = index.viewerByArtist.get(a.artist) ?? 0;
      const members = corroborated(index, a.missing);
      if (members.length < CFG.ALBUM_CATALOG_GAP.minDeliverable) continue;
      const bounded = members.slice(0, CFG.DELIVERABLE_MAX);

      out.push(build(index, {
        generator: "ALBUM_CATALOG_GAP",
        subject: { type: "Album", artist: a.artist, album: a.title },
        subjectKey: `Album:${a.albumId}`,
        groupingReason: { kind: "AREA", entity: "ALBUM", key: a.albumId },
        setType: "albumUnit", setKey: `catalog:${a.albumId}`,
        expression: `AL_${a.albumId} ∩ F_all, AL ∩ U = ∅, |{albums of ${a.artist} ∩ U}| = ${held}`,
        members: bounded,
        anchor: anchorOf("ARTIST_PRESENT", a.artist, a.artist, ownedByArtist),
        evidenceStrength: clamp01(
          0.58
          + 0.18 * Math.min(1, log2(held) / log2(6))
          + 0.14 * Math.min(1, ownedByArtist / CFG.ARTIST_GAP.ownedSaturation)
          + 0.08 * Math.min(1, bounded.length / Math.max(1, a.totalTracks)),
        ),
        componentScores: { albumsHeld: held, ownedByArtist, deliverable: bounded.length },
        reasonCodes: ["ANCHOR=ARTIST_PRESENT", "STACKED", `ALBUMS_HELD=${held}`, `ALBUM_ID=${a.albumId}`],
        genre: null, subgenre: null, artist: a.artist, album: a.title, albumId: a.albumId,
      }));
    }
    return out;
  },
};

/**
 * A whole genre the viewer is on the edge of.
 *
 * Not a lane and not a void: a region they have a foothold in, small against
 * everything the sources keep there. It is the one aperture wide enough to say
 * "this entire area is mostly absent from your library", which no subgenre
 * card can say.
 */
const genreGap: GeneratorSpec = {
  id: "GENRE_GAP",
  mechanism: "A genre the viewer holds a little of, where the sources hold a great deal.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const w of index.worlds.values()) {
      const owned = index.viewerByWorld.get(w.world) ?? 0;
      if (owned < CFG.GENRE_GAP.minOwned) continue;
      const members = corroborated(index, w.gap);
      if (members.length < CFG.GENRE_GAP.minDeliverable) continue;
      // A foothold, not a home: if they already hold much of what is available
      // here, the genre is theirs and this is not the card for it.
      if (owned / (owned + w.gap.length) > CFG.GENRE_GAP.maxOwnedShare) continue;
      const lanes = new Set(w.gap.map((id) => index.meta.get(id)?.subgenre)
        .filter((l) => l && l !== UNKNOWN_LANE));
      if (lanes.size < CFG.GENRE_GAP.minLanes) continue;

      const bounded = members.slice(0, CFG.DELIVERABLE_MAX);
      out.push(build(index, {
        generator: "GENRE_GAP",
        subject: { type: "Genre", genre: w.world },
        subjectKey: `Genre:${w.world}`,
        groupingReason: { kind: "AREA", entity: "GENRE", key: w.world },
        setType: "genreGap", setKey: `genre:${w.world}`,
        expression: `(F_all ∩ G_${w.world}) − U, |G ∩ U| = ${owned}, lanes = ${lanes.size}`,
        members: bounded,
        anchor: anchorOf("PARENT_GENRE_PRESENT", w.world, w.world, owned),
        evidenceStrength: clamp01(
          0.45
          + 0.20 * Math.min(1, log2(w.gap.length) / log2(CFG.GENRE_GAP.magnitudeSaturation))
          + 0.15 * Math.min(1, lanes.size / 20),
        ),
        componentScores: {
          ownedInGenre: owned, genreGap: w.gap.length, laneCount: lanes.size,
          deliverable: bounded.length,
        },
        reasonCodes: ["ANCHOR=PARENT_GENRE_PRESENT", `LANES=${lanes.size}`, `GAP=${w.gap.length}`],
        genre: w.world, subgenre: null, artist: null, album: null,
      }));
    }
    return out;
  },
};

/**
 * A dozen tracks, every one by an artist already in the library.
 *
 * A cross-artist way into a lane the viewer occupies: not the lane's whole
 * inventory and not one artist's catalogue, but the material they are missing
 * from people they already keep. The selection rule is the strictest one
 * available — every track is by a named artist in their own library.
 */
const bridgeSet: GeneratorSpec = {
  id: "BRIDGE_SET",
  mechanism: "Missed tracks inside a lane the viewer occupies, all by artists they already hold.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const lane of index.lanes.values()) {
      if (lane.subgenre === UNKNOWN_LANE) continue;
      const owned = index.viewerByLane.get(lane.subgenre) ?? 0;
      if (owned < CFG.LANE.minOwnedForPresent) continue;

      const bridge = bridgeOf(index, lane.gap);
      if (bridge.artists.length < CFG.BRIDGE_SET.minArtists) continue;
      if (bridge.totalOwned < CFG.BRIDGE_SET.minOwnedByThem) continue;
      if (bridge.tracks.length < SONG_SET_MIN) continue;

      const members = bridge.tracks.slice().sort(byStrength(index)).slice(0, SONG_SET_MAX);
      if (sourcesOf(index, members).length < CFG.MIN_SOURCES_PER_CARD) continue;
      const spread = new Set(members.map((id) => index.meta.get(id)?.artist));
      if (spread.size < CFG.BRIDGE_SET.minArtists) continue;

      const setKey = `owned-artists:${lane.subgenre}`;
      const [topArtist, topOwned] = bridge.ranked[0];
      out.push(build(index, {
        generator: "BRIDGE_SET",
        subject: {
          type: "Songs",
          title: `${label(lane.subgenre)} — From Artists You Have`,
          scope: lane.subgenre, discoverySetId: "",
        },
        subjectKey: `Songs:${setKey}`,
        groupingReason: {
          kind: "SELECTED",
          scope: { entity: "SUBGENRE", key: lane.subgenre },
          rule: {
            id: "OWNED_ARTISTS_ONLY",
            threshold: spread.size,
            qualifying: bridge.tracks.length,
            scopeInventory: lane.gap.length,
            description: `all by artists already in your library`,
          },
          key: setKey,
        },
        setType: "kOfN", setKey,
        expression: `{ t ∈ (F_all ∩ S_${lane.subgenre}) − U : artist(t) ∈ artists(U) }`,
        members,
        anchor: anchorOf("ARTIST_PRESENT", topArtist, topArtist, topOwned),
        evidenceStrength: clamp01(
          0.55
          + 0.20 * Math.min(1, log2(bridge.totalOwned) / log2(CFG.ARTIST_GAP.ownedSaturation))
          + 0.15 * Math.min(1, spread.size / 6)
          + 0.08 * Math.min(1, members.length / SONG_SET_MAX),
        ),
        componentScores: {
          bridgeArtists: spread.size, ownedByBridge: bridge.totalOwned,
          deliverable: members.length, ownedInLane: owned,
        },
        reasonCodes: [
          "ANCHOR=ARTIST_PRESENT", "STACKED", "OWNED_ARTISTS_ONLY",
          `ARTISTS=${spread.size}`, `OWNED_BY_THEM=${bridge.totalOwned}`,
        ],
        bridgeArtists: [...spread].filter((a): a is string => !!a),
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
  consensusSet,
  bridgedLane, newTerritorySet,
  albumCatalogGap, genreGap, bridgeSet,
];

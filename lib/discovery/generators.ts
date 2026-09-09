import {
  assertMissing, friendRef, setId, UNKNOWN_LANE, type DiscoveryIndex,
} from "./sets";
import type {
  Candidate, DiscoverySet, Evidence, GeneratorId, Subject,
} from "./types";

/**
 * Steps C and D — the generators, each with its own anchored evidence score.
 *
 * evidenceStrength is an absolute measure on one shared scale, and every
 * generator declares which of its concrete situations sit on which anchor:
 *
 *   1.00  categorical      the fact admits no stronger form
 *   0.85  near-categorical one step from the maximum
 *   0.70  strong           clear majority, or a tight named structural gap
 *   0.50  solid            real, unremarkable
 *   0.30  weak             true but common — the floor
 *
 * A score means the same thing in every generator, so a 4-of-4 consensus is
 * near the top of the scale whether three such tracks exist or three thousand.
 * Sample size never enters this number.
 */

export const ES_FLOOR = 0.3;

export interface GeneratorSpec {
  id: GeneratorId;
  /** What the fact is, in one line — carried into the harness output. */
  mechanism: string;
  run: (index: DiscoveryIndex) => Candidate[];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const log2 = (n: number) => Math.log(Math.max(1, n)) / Math.LN2;

let seq = 0;
const nextId = (g: string) => `${g}-${(seq++).toString(36)}`;

function songSubject(index: DiscoveryIndex, spotifyId: string): Subject | null {
  const m = index.meta.get(spotifyId);
  if (!m || !m.name || !m.artist) return null;    // unrenderable — gate 2
  return { type: "Song", spotifyId, name: m.name, artist: m.artist, album: m.album };
}

function holderEvidence(index: DiscoveryIndex, ids: string[]): Evidence[] {
  return ids.map((id) => {
    const p = index.personOf.get(id);
    return { kind: "friendHolds", userId: id, name: p?.name ?? "Someone", image: p?.image ?? null } as Evidence;
  });
}

function baseSongCandidate(
  index: DiscoveryIndex, spotifyId: string, generator: GeneratorId,
  set: DiscoverySet, holderIds: string[],
): Candidate | null {
  const subject = songSubject(index, spotifyId);
  if (!subject) return null;
  const m = index.meta.get(spotifyId)!;
  return {
    id: nextId(generator),
    subject,
    subjectKey: `Song:${spotifyId}`,
    generator,
    discoverySetId: set.id,
    discoveryExpression: set.expression,
    evidence: holderEvidence(index, holderIds),
    reasonCodes: [],
    evidenceStrength: 0,
    attentionValue: 0,
    componentScores: {},
    sourceFriendIds: holderIds,
    sourceFriendNames: holderIds.map((h) => index.nameOf.get(h) ?? "Someone"),
    genre: m.world,
    subgenre: m.subgenre && m.subgenre !== UNKNOWN_LANE ? m.subgenre : null,
    artist: m.artist,
    album: m.album,
  };
}

// ── Family A · source agreement ─────────────────────────────────────────────

const unanimousMiss: GeneratorSpec = {
  id: "UNANIMOUS_MISS",
  mechanism: "Every source holds it. The viewer is the sole exception.",
  run: (index) => {
    const n = index.friends.length;
    if (n < 3) return [];
    const out: Candidate[] = [];
    for (const [id, hs] of index.holders) {
      if (hs.length !== n) continue;
      const expression = `(⋂ F_i) − U · ${id}`;
      const set: DiscoverySet = {
        id: setId(`unanimous:${id}`), type: "unanimous", expression,
        members: [id], sourceSets: hs.map(friendRef), exclusionSet: { kind: "user", userId: index.viewerId },
        rawMetrics: { holders: hs.length, friends: n },
      };
      assertMissing(index, set.members, "UNANIMOUS_MISS");
      const c = baseSongCandidate(index, id, "UNANIMOUS_MISS", set, hs);
      if (!c) continue;
      // Anchor: categorical. No stronger version of this fact exists.
      c.evidenceStrength = 0.95;
      c.componentScores = { anchor: 0.95, holders: hs.length, friends: n };
      c.reasonCodes = [`K_OF_N=${hs.length}`, `N=${n}`, "CATEGORICAL"];
      out.push(c);
    }
    return out;
  },
};

const unanimousSet: GeneratorSpec = {
  id: "UNANIMOUS_SET",
  mechanism: "The whole set of tracks every source holds and the viewer does not.",
  run: (index) => {
    const n = index.friends.length;
    if (n < 3) return [];
    const members = [...index.holders].filter(([, hs]) => hs.length === n).map(([id]) => id);
    if (members.length < 2) return [];
    const expression = `(⋂ F_i) − U`;
    const set: DiscoverySet = {
      id: setId("unanimousSet"), type: "unanimous", expression,
      members, sourceSets: index.friends.map((f) => friendRef(f.id)),
      exclusionSet: { kind: "user", userId: index.viewerId },
      rawMetrics: { size: members.length, friends: n },
    };
    assertMissing(index, members, "UNANIMOUS_SET");
    const holderIds = index.friends.map((f) => f.id);
    return [{
      id: nextId("UNANIMOUS_SET"),
      subject: { type: "Songs", label: `every friend has these`, discoverySetId: set.id },
      subjectKey: `Songs:${set.id}`,
      generator: "UNANIMOUS_SET", discoverySetId: set.id, discoveryExpression: expression,
      evidence: [
        ...holderEvidence(index, holderIds),
        { kind: "setCardinality", setRef: { kind: "friendsAll" }, value: members.length },
      ],
      reasonCodes: [`SET_SIZE=${members.length}`, `N=${n}`],
      evidenceStrength: 0.9,
      attentionValue: 0,
      componentScores: { anchor: 0.9, size: members.length },
      sourceFriendIds: holderIds,
      sourceFriendNames: holderIds.map((h) => index.nameOf.get(h) ?? "Someone"),
      genre: null, subgenre: null, artist: null, album: null,
    }];
  },
};

const supermajorityMiss: GeneratorSpec = {
  id: "SUPERMAJORITY_MISS",
  mechanism: "A strict majority of sources hold it; the viewer does not.",
  run: (index) => {
    const n = index.friends.length;
    if (n < 4) return [];
    const out: Candidate[] = [];
    for (const [id, hs] of index.holders) {
      const k = hs.length;
      if (k < 3 || k >= n) continue;
      const expression = `|holders| = ${k} of ${n} · ${id}`;
      const set: DiscoverySet = {
        id: setId(`kofn:${id}`), type: "kOfN", expression,
        members: [id], sourceSets: hs.map(friendRef), exclusionSet: { kind: "user", userId: index.viewerId },
        rawMetrics: { k, n },
      };
      assertMissing(index, set.members, "SUPERMAJORITY_MISS");
      const c = baseSongCandidate(index, id, "SUPERMAJORITY_MISS", set, hs);
      if (!c) continue;
      // Anchors: k = n−1 → 0.85 (near-categorical); k = 3 of many → 0.55.
      c.evidenceStrength = clamp01(0.55 + 0.3 * ((k - 2) / Math.max(1, n - 2)));
      c.componentScores = { k, n, coverage: k / n };
      c.reasonCodes = [`K_OF_N=${k}`, `N=${n}`];
      out.push(c);
    }
    return out;
  },
};

const pairConsensus: GeneratorSpec = {
  id: "PAIR_CONSENSUS",
  mechanism: "Two named sources hold it; the viewer does not.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const [id, hs] of index.holders) {
      if (hs.length !== 2) continue;
      const expression = `(F_${hs[0]} ∩ F_${hs[1]}) − U · ${id}`;
      const set: DiscoverySet = {
        id: setId(`pair:${id}`), type: "pair", expression,
        members: [id], sourceSets: hs.map(friendRef), exclusionSet: { kind: "user", userId: index.viewerId },
        rawMetrics: { holders: 2 },
      };
      assertMissing(index, set.members, "PAIR_CONSENSUS");
      const c = baseSongCandidate(index, id, "PAIR_CONSENSUS", set, hs);
      if (!c) continue;
      // Anchor: solid. Two independent holders is real evidence and nothing more.
      c.evidenceStrength = 0.5;
      c.componentScores = { anchor: 0.5, holders: 2 };
      c.reasonCodes = ["K_OF_N=2"];
      out.push(c);
    }
    return out;
  },
};

const multiIntersectionSet: GeneratorSpec = {
  id: "MULTI_INTERSECTION_SET",
  mechanism: "Three sources coincide on a set the viewer is entirely outside of.",
  run: (index) => {
    const anchors = index.anchorFriends;
    const out: Candidate[] = [];
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        for (let k = j + 1; k < anchors.length; k++) {
          const trio = [anchors[i], anchors[j], anchors[k]];
          const [A, B, C] = trio.map((f) => index.byFriend.get(f.id)!);
          const members = [...A].filter((x) => B.has(x) && C.has(x) && !index.U.has(x));
          if (members.length < 3) continue;
          const ids = trio.map((f) => f.id);
          const expression = `(F_${ids.join(" ∩ F_")}) − U`;
          const set: DiscoverySet = {
            id: setId(`triple:${ids.sort().join(",")}`), type: "tripleIntersection", expression,
            members, sourceSets: ids.map(friendRef), exclusionSet: { kind: "user", userId: index.viewerId },
            rawMetrics: { size: members.length, sources: 3 },
          };
          assertMissing(index, members, "MULTI_INTERSECTION_SET");
          out.push({
            id: nextId("MULTI_INTERSECTION_SET"),
            subject: { type: "Songs", label: `${trio.map((f) => f.name ?? "Someone").join(", ")} all have these`, discoverySetId: set.id },
            subjectKey: `Songs:${set.id}`,
            generator: "MULTI_INTERSECTION_SET", discoverySetId: set.id, discoveryExpression: expression,
            evidence: [
              ...holderEvidence(index, ids),
              { kind: "setCardinality", setRef: { kind: "friendsAll" }, value: members.length },
            ],
            reasonCodes: [`SOURCES=3`, `SET_SIZE=${members.length}`],
            // Anchor: strong. Three independent holders, but a set rather than an item.
            evidenceStrength: clamp01(0.6 + 0.25 * Math.min(1, members.length / 25)),
            attentionValue: 0,
            componentScores: { sources: 3, size: members.length },
            sourceFriendIds: ids,
            sourceFriendNames: trio.map((f) => f.name ?? "Someone"),
            genre: null, subgenre: null, artist: null, album: null,
          });
        }
      }
    }
    return out;
  },
};

// ── Family B · catalog structure, observed only ─────────────────────────────
//
// Every claim here is phrased over what these libraries are observed to
// contain. None of them asserts a real tracklist length, because we do not
// have one. The confidence term in claim scoring carries that hedge, and the
// authoritative versions stay unbuilt until albumTotalTracks exists.

function unitCandidates(
  index: DiscoveryIndex, kind: "album" | "artist", generator: GeneratorId,
  opts: {
    minObserved: number; minOwned: number; minOwnership: number;
    residueMin: number; residueMax: number;
    score: (ownership: number, residue: number, observed: number, owned: number) => number;
    soleOnly: boolean;
  },
): Candidate[] {
  const units = kind === "album" ? index.albums : index.artists;
  const out: Candidate[] = [];
  for (const u of units.values()) {
    const observed = u.observed.size;
    const residue = u.missing.length;
    if (observed < opts.minObserved) continue;
    if (u.ownedCount < opts.minOwned) continue;
    if (residue < opts.residueMin || residue > opts.residueMax) continue;
    const ownership = u.ownedCount / observed;
    if (ownership < opts.minOwnership) continue;

    assertMissing(index, u.missing, generator);
    const setRef = kind === "album"
      ? { kind: "album" as const, artist: u.artist, album: u.album as string }
      : { kind: "artist" as const, artist: u.artist };
    const label = kind === "album" ? (u.album as string) : u.artist;
    const expression = `(${kind === "album" ? "AL" : "A"}_${label} ∩ F_all) − U`;
    const set: DiscoverySet = {
      id: setId(`${kind}gap:${u.key}`), type: kind === "album" ? "albumGap" : "artistGap",
      expression, members: u.missing, sourceSets: [{ kind: "friendsAll" }],
      exclusionSet: { kind: "user", userId: index.viewerId },
      rawMetrics: { observed, owned: u.ownedCount, residue, ownership },
    };

    const holderIds = [...new Set(u.missing.flatMap((id) => index.holders.get(id) ?? []))];
    const evidence: Evidence[] = [
      { kind: "observedOwnership", setRef, owned: u.ownedCount, observed },
      ...holderEvidence(index, holderIds),
    ];

    const es = clamp01(opts.score(ownership, residue, observed, u.ownedCount));
    const common = {
      generator, discoverySetId: set.id, discoveryExpression: expression,
      evidence,
      reasonCodes: [
        `OBSERVED_ONLY`, `OWNED=${u.ownedCount}`, `OBSERVED=${observed}`, `RESIDUE=${residue}`,
      ],
      evidenceStrength: es,
      attentionValue: 0,
      componentScores: { ownership, residue, observed, owned: u.ownedCount },
      sourceFriendIds: holderIds,
      sourceFriendNames: holderIds.map((h) => index.nameOf.get(h) ?? "Someone"),
    };

    if (opts.soleOnly) {
      const only = u.missing[0];
      const subject = songSubject(index, only);
      if (!subject) continue;
      const m = index.meta.get(only)!;
      out.push({
        id: nextId(generator), subject, subjectKey: `Song:${only}`,
        ...common,
        genre: m.world,
        subgenre: m.subgenre && m.subgenre !== UNKNOWN_LANE ? m.subgenre : null,
        artist: u.artist, album: kind === "album" ? (u.album as string) : m.album,
      });
    } else {
      out.push({
        id: nextId(generator),
        subject: kind === "album"
          ? { type: "Album", artist: u.artist, album: u.album as string }
          : { type: "Artist", artist: u.artist },
        subjectKey: kind === "album" ? `Album:${u.key}` : `Artist:${u.artist}`,
        ...common,
        genre: null, subgenre: null,
        artist: u.artist, album: kind === "album" ? (u.album as string) : null,
      });
    }
  }
  return out;
}

const albumSoleGap: GeneratorSpec = {
  id: "ALBUM_SOLE_GAP_OBSERVED",
  mechanism: "Of everything anyone here holds from one record, the viewer holds all but one track.",
  run: (index) => unitCandidates(index, "album", "ALBUM_SOLE_GAP_OBSERVED", {
    minObserved: 6, minOwned: 1, minOwnership: 0.85, residueMin: 1, residueMax: 1,
    // Anchor: near-categorical at ownership 1.0 — one item short of the whole
    // observed set. Squared so the curve is steep only at the very top.
    score: (ownership) => 0.85 * ownership * ownership,
    soleOnly: true,
  }),
};

const albumResidue: GeneratorSpec = {
  id: "ALBUM_RESIDUE_OBSERVED",
  mechanism: "The viewer holds most of an observed record and misses a small remainder.",
  run: (index) => unitCandidates(index, "album", "ALBUM_RESIDUE_OBSERVED", {
    minObserved: 6, minOwned: 1, minOwnership: 0.6, residueMin: 2, residueMax: 4,
    score: (ownership, residue) => 0.7 * ownership * ownership * (2 / residue),
    soleOnly: false,
  }),
};

const artistSoleGap: GeneratorSpec = {
  id: "ARTIST_SOLE_GAP_OBSERVED",
  mechanism: "One track short of everything anyone here holds by this artist.",
  run: (index) => unitCandidates(index, "artist", "ARTIST_SOLE_GAP_OBSERVED", {
    minObserved: 1, minOwned: 8, minOwnership: 0.85, residueMin: 1, residueMax: 1,
    score: (ownership) => 0.85 * ownership * ownership,
    soleOnly: true,
  }),
};

const artistResidue: GeneratorSpec = {
  id: "ARTIST_RESIDUE_OBSERVED",
  mechanism: "A deep artist holding with a small remainder others here keep.",
  run: (index) => unitCandidates(index, "artist", "ARTIST_RESIDUE_OBSERVED", {
    minObserved: 1, minOwned: 8, minOwnership: 0.75, residueMin: 2, residueMax: 5,
    score: (ownership, residue) => 0.65 * ownership * ownership * (2 / residue),
    soleOnly: false,
  }),
};

const albumAsUnit: GeneratorSpec = {
  id: "ALBUM_AS_UNIT",
  mechanism: "Several sources independently keep multiple tracks from a record the viewer has none of.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const u of index.albums.values()) {
      if (u.ownedCount !== 0) continue;
      if (u.observed.size < 6) continue;
      const deep = [...u.byFriend.entries()].filter(([, s]) => s.size >= 3);
      if (deep.length < 2) continue;
      const depth = Math.min(...deep.map(([, s]) => s.size));
      const missing = u.missing;
      if (missing.length === 0) continue;
      assertMissing(index, missing, "ALBUM_AS_UNIT");

      const expression = `AL_${u.album} ∩ F_all, AL ∩ U = ∅`;
      const set: DiscoverySet = {
        id: setId(`albumunit:${u.key}`), type: "albumUnit", expression,
        members: missing, sourceSets: deep.map(([id]) => friendRef(id)),
        exclusionSet: { kind: "user", userId: index.viewerId },
        rawMetrics: { observed: u.observed.size, holders: deep.length, depth },
      };
      const holderIds = deep.map(([id]) => id);
      out.push({
        id: nextId("ALBUM_AS_UNIT"),
        subject: { type: "Album", artist: u.artist, album: u.album as string },
        subjectKey: `Album:${u.key}`,
        generator: "ALBUM_AS_UNIT", discoverySetId: set.id, discoveryExpression: expression,
        evidence: [
          { kind: "absence", setRef: { kind: "album", artist: u.artist, album: u.album as string } },
          ...deep.map(([id, s]) => ({
            kind: "holderDepth", userId: id, name: index.nameOf.get(id) ?? "Someone", count: s.size,
          } as Evidence)),
        ],
        reasonCodes: [`HOLDERS=${deep.length}`, `MIN_DEPTH=${depth}`, "VIEWER_ABSENT"],
        // Anchor: solid to strong. Independent multi-track holding is the fact.
        evidenceStrength: clamp01(0.5 + 0.25 * Math.min(1, depth / 6)),
        attentionValue: 0,
        componentScores: { holders: deep.length, depth, observed: u.observed.size },
        sourceFriendIds: holderIds,
        sourceFriendNames: holderIds.map((h) => index.nameOf.get(h) ?? "Someone"),
        genre: null, subgenre: null, artist: u.artist, album: u.album as string,
      });
    }
    return out;
  },
};

const artistAbsentInLane: GeneratorSpec = {
  id: "ARTIST_ABSENT_IN_LANE",
  mechanism: "An artist absent from the viewer's set, inside a named lane their set is present in.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const u of index.artists.values()) {
      if (u.ownedCount !== 0) continue;
      const inFriends = u.missing;
      if (inFriends.length < 5) continue;
      const holderIds = [...new Set(inFriends.flatMap((id) => index.holders.get(id) ?? []))];
      if (holderIds.length < 2) continue;

      // Dominant named lane for this artist's observed tracks.
      const counts = new Map<string, number>();
      for (const id of inFriends) {
        const s = index.meta.get(id)?.subgenre;
        if (!s || s === UNKNOWN_LANE) continue;
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!dominant) continue;
      const lane = index.lanes.get(dominant[0]);
      // Binary membership: the lane is represented in the viewer's set at all.
      if (!lane?.viewerPresent) continue;

      assertMissing(index, inFriends, "ARTIST_ABSENT_IN_LANE");
      const expression = `A_${u.artist} ∩ F_all, A ∩ U = ∅, S_${dominant[0]} ∩ U ≠ ∅`;
      const set: DiscoverySet = {
        id: setId(`artistabsent:${u.artist}`), type: "artistAbsent", expression,
        members: inFriends, sourceSets: holderIds.map(friendRef),
        exclusionSet: { kind: "user", userId: index.viewerId },
        rawMetrics: { catalogSize: inFriends.length, holders: holderIds.length },
      };
      out.push({
        id: nextId("ARTIST_ABSENT_IN_LANE"),
        subject: { type: "Artist", artist: u.artist },
        subjectKey: `Artist:${u.artist}`,
        generator: "ARTIST_ABSENT_IN_LANE", discoverySetId: set.id, discoveryExpression: expression,
        evidence: [
          { kind: "absence", setRef: { kind: "artist", artist: u.artist } },
          { kind: "membership", spotifyId: "", setRef: { kind: "subgenre", subgenre: dominant[0] } },
          { kind: "setCardinality", setRef: { kind: "artist", artist: u.artist }, value: inFriends.length },
          ...holderEvidence(index, holderIds),
        ],
        reasonCodes: ["VIEWER_ABSENT", `CATALOG=${inFriends.length}`, `HOLDERS=${holderIds.length}`, "LANE_PRESENT"],
        // Same shape as a lane void: broad inventory. Catalogue size alone
        // saturated the old term at 0.75 for a third of these, so breadth of
        // independent sources leads and size saturates well below the ceiling.
        evidenceStrength: clamp01(
          0.35
          + 0.20 * (holderIds.length / Math.max(1, index.friends.length))
          + 0.15 * Math.min(1, log2(inFriends.length) / log2(60)),
        ),                                                            // ceiling 0.70
        attentionValue: 0,
        componentScores: { catalogSize: inFriends.length, holders: holderIds.length },
        sourceFriendIds: holderIds,
        sourceFriendNames: holderIds.map((h) => index.nameOf.get(h) ?? "Someone"),
        genre: lane.world, subgenre: dominant[0], artist: u.artist, album: null,
      });
    }
    return out;
  },
};

// ── Family C · lane gaps ────────────────────────────────────────────────────
//
// Absence only. There is no ownership-ratio generator: a lane the viewer has
// never entered is a cleaner and stronger missed-information primitive than a
// lane they cover thinly, and thinness would mean measuring how much of their
// own library sits where.

function laneCandidate(
  index: DiscoveryIndex, generator: GeneratorId, lane: { subgenre: string; world: string; gap: string[]; byFriend: Map<string, Set<string>> },
  es: number, parent: string | null, sources: number,
): Candidate {
  const holderIds = [...lane.byFriend.keys()];
  const expression = `(F_all ∩ S_${lane.subgenre}) − U, S ∩ U = ∅`;
  const set: DiscoverySet = {
    id: setId(`lanevoid:${lane.subgenre}`), type: parent ? "childVoid" : "laneVoid", expression,
    members: lane.gap, sourceSets: [{ kind: "friendsAll" }],
    exclusionSet: { kind: "user", userId: index.viewerId },
    rawMetrics: { gapSize: lane.gap.length },
  };
  assertMissing(index, lane.gap, generator);
  return {
    id: nextId(generator),
    subject: { type: "Subgenre", subgenre: lane.subgenre },
    subjectKey: `Subgenre:${lane.subgenre}`,
    generator, discoverySetId: set.id, discoveryExpression: expression,
    evidence: [
      { kind: "absence", setRef: { kind: "subgenre", subgenre: lane.subgenre } },
      { kind: "setCardinality", setRef: { kind: "subgenre", subgenre: lane.subgenre }, value: lane.gap.length },
      ...holderEvidence(index, holderIds),
    ],
    reasonCodes: ["VIEWER_ABSENT", `GAP=${lane.gap.length}`, ...(parent ? [`PARENT_PRESENT=${parent}`] : [])],
    evidenceStrength: es,
    attentionValue: 0,
    componentScores: { gapSize: lane.gap.length, sources },
    sourceFriendIds: holderIds,
    sourceFriendNames: holderIds.map((h) => index.nameOf.get(h) ?? "Someone"),
    genre: lane.world, subgenre: lane.subgenre, artist: null, album: null,
  };
}

/**
 * MISSING_CHILD and SUBGENRE_VOID are mutually exclusive by construction.
 * A void lane whose parent genre the viewer is present in is the sharper
 * structural fact — an adjacent named area — and is emitted as MISSING_CHILD.
 * The same lane must never produce both, or the feed carries one fact twice.
 */
function voidLanes(index: DiscoveryIndex, wantParentPresent: boolean): Candidate[] {
  const out: Candidate[] = [];
  for (const lane of index.lanes.values()) {
    if (lane.viewerPresent) continue;
    if (lane.gap.length < 15) continue;
    const deepEnough = [...lane.byFriend.values()].some((s) => s.size >= 10);
    if (!deepEnough) continue;
    const parentPresent = index.worlds.get(lane.world)?.viewerPresent ?? false;
    if (parentPresent !== wantParentPresent) continue;

    // A lane void is broad inventory, not a sharp exception around one
    // actionable subject, so it is anchored in solid-to-strong territory and
    // cannot reach near-categorical however large it grows. What separates an
    // ordinary void from an unusual one is how many independent sources hold
    // material there — one person's shelf is one person's shelf at any size —
    // so breadth carries more weight than magnitude, and magnitude saturates.
    const sources = [...lane.byFriend.values()].filter((s2) => s2.size >= 1).length;
    const breadth = sources / Math.max(1, index.friends.length);
    const magnitude = Math.min(1, log2(lane.gap.length) / log2(300));
    const es = clamp01(0.35 + 0.22 * breadth + 0.13 * magnitude);   // ceiling 0.70
    if (wantParentPresent) {
      out.push(laneCandidate(index, "MISSING_CHILD", lane, es, lane.world, sources));
    } else {
      out.push(laneCandidate(index, "SUBGENRE_VOID", lane, es, null, sources));
    }
  }
  return out;
}

const subgenreVoid: GeneratorSpec = {
  id: "SUBGENRE_VOID",
  mechanism: "A named lane the viewer has never entered, where sources have depth.",
  run: (index) => voidLanes(index, false),
};

const missingChild: GeneratorSpec = {
  id: "MISSING_CHILD",
  mechanism: "A named child lane absent from the viewer's set, inside a parent genre their set is present in.",
  run: (index) => voidLanes(index, true),
};

const sourceLaneDepth: GeneratorSpec = {
  id: "SOURCE_LANE_DEPTH",
  mechanism: "One source's body of work in a lane, stated as set membership.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const lane of index.lanes.values()) {
      for (const f of index.anchorFriends) {
        const held = lane.byFriend.get(f.id);
        if (!held || held.size < 30) continue;
        const share = held.size / lane.friendAll.size;
        if (share < 0.5) continue;
        const members = [...held].filter((id) => !index.U.has(id));
        if (members.length < 15) continue;
        assertMissing(index, members, "SOURCE_LANE_DEPTH");

        const expression = `(F_${f.id} ∩ S_${lane.subgenre}) − U`;
        const set: DiscoverySet = {
          id: setId(`lanedepth:${f.id}:${lane.subgenre}`), type: "laneDepth", expression,
          members, sourceSets: [friendRef(f.id)],
          exclusionSet: { kind: "user", userId: index.viewerId },
          rawMetrics: { count: members.length, share },
        };
        out.push({
          id: nextId("SOURCE_LANE_DEPTH"),
          subject: { type: "Songs", label: `${f.name ?? "Someone"} in ${lane.subgenre}`, discoverySetId: set.id },
          subjectKey: `Songs:${set.id}`,
          generator: "SOURCE_LANE_DEPTH", discoverySetId: set.id, discoveryExpression: expression,
          evidence: [
            { kind: "holderDepth", userId: f.id, name: f.name ?? "Someone", count: members.length },
            { kind: "setCardinality", setRef: { kind: "subgenre", subgenre: lane.subgenre }, value: members.length },
            ...(lane.viewerPresent ? [] : [{ kind: "absence", setRef: { kind: "subgenre", subgenre: lane.subgenre } } as Evidence]),
          ],
          reasonCodes: [`COUNT=${members.length}`, lane.viewerPresent ? "LANE_PRESENT" : "LANE_ABSENT"],
          // One source by construction, so this tops out below anything with
          // independent corroboration however deep that one shelf runs.
          evidenceStrength: clamp01(
            0.35 + 0.20 * share + 0.10 * Math.min(1, log2(members.length) / log2(120)),
          ),                                                          // ceiling 0.65
          attentionValue: 0,
          componentScores: { count: members.length, share },
          sourceFriendIds: [f.id],
          sourceFriendNames: [f.name ?? "Someone"],
          genre: lane.world, subgenre: lane.subgenre, artist: null, album: null,
        });
      }
    }
    return out;
  },
};

const genreGap: GeneratorSpec = {
  id: "GENRE_GAP",
  mechanism: "Genre-level magnitude. Coarse; usually fails the attention gate.",
  run: (index) => {
    const out: Candidate[] = [];
    for (const w of index.worlds.values()) {
      if (w.gap.length < 100) continue;
      assertMissing(index, w.gap, "GENRE_GAP");
      const expression = `(F_all ∩ G_${w.world}) − U`;
      const set: DiscoverySet = {
        id: setId(`genregap:${w.world}`), type: "genreGap", expression,
        members: w.gap, sourceSets: [{ kind: "friendsAll" }],
        exclusionSet: { kind: "user", userId: index.viewerId },
        rawMetrics: { gapSize: w.gap.length },
      };
      out.push({
        id: nextId("GENRE_GAP"),
        subject: { type: "Genre", genre: w.world },
        subjectKey: `Genre:${w.world}`,
        generator: "GENRE_GAP", discoverySetId: set.id, discoveryExpression: expression,
        evidence: [{ kind: "setCardinality", setRef: { kind: "genre", genre: w.world }, value: w.gap.length }],
        reasonCodes: [`GAP=${w.gap.length}`],
        evidenceStrength: clamp01(0.35 + 0.2 * Math.min(1, log2(w.gap.length) / 13)),
        attentionValue: 0,
        componentScores: { gapSize: w.gap.length },
        sourceFriendIds: [], sourceFriendNames: [],
        genre: w.world, subgenre: null, artist: null, album: null,
      });
    }
    return out;
  },
};

export const GENERATORS: GeneratorSpec[] = [
  unanimousMiss, unanimousSet, supermajorityMiss, pairConsensus, multiIntersectionSet,
  albumSoleGap, albumResidue, artistSoleGap, artistResidue, albumAsUnit, artistAbsentInLane,
  subgenreVoid, missingChild, sourceLaneDepth, genreGap,
];

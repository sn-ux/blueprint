import * as CFG from "./config";
import {
  assertMissing, coverageOf, friendRef, setId, UNKNOWN_LANE,
  type Coverage, type DiscoveryIndex,
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

export const ES_FLOOR = CFG.ES_FLOOR;

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
    deliverableCount: 1,
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
    const n = index.eligibleSourceUniverse;
    if (n < CFG.MIN_INDEPENDENT_SOURCES) return [];
    const out: Candidate[] = [];
    for (const [id, hs] of index.holders) {
      // Literal unanimity: coverage of exactly 1.0. Left strict on purpose —
      // if it becomes vanishingly rare in a large circle, that is what the
      // sentence means, and relaxing it to keep the generator productive
      // would make the caption false.
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
    const n = index.eligibleSourceUniverse;
    if (n < CFG.MIN_INDEPENDENT_SOURCES) return [];
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
      deliverableCount: members.length,
      deliverableIds: members,
      sourceFriendIds: holderIds,
      sourceFriendNames: holderIds.map((h) => index.nameOf.get(h) ?? "Someone"),
      genre: null, subgenre: null, artist: null, album: null,
    }];
  },
};

/**
 * The consensus family, expressed as coverage of the source universe.
 *
 * A song could in principle be held by anyone, so the denominator here is the
 * whole circle rather than a neighbourhood of it: "everyone has this except
 * you" is a claim about the circle. Three holders is a supermajority out of
 * four and noise out of four hundred, so no tier is defined by a count — each
 * carries a proportional requirement and the same absolute floor of
 * independent sources, because one-of-one is unanimous and means nothing.
 */
const supermajorityMiss: GeneratorSpec = {
  id: "SUPERMAJORITY_MISS",
  mechanism: "At least two thirds of the source universe holds it; the viewer does not.",
  run: (index) => {
    const n = index.eligibleSourceUniverse;
    if (n < CFG.MIN_INDEPENDENT_SOURCES) return [];
    // Smallest holder count that is genuinely a supermajority at this size.
    const kMin = Math.max(CFG.MIN_INDEPENDENT_SOURCES, Math.ceil(CFG.SUPERMAJORITY_COVERAGE * n));
    const out: Candidate[] = [];
    for (const [id, hs] of index.holders) {
      const k = hs.length;
      if (k < kMin || k >= n) continue;
      const cov = coverageOf(k, n);
      const expression = `|holders| = ${k} of ${n} eligible sources · ${id}`;
      const set: DiscoverySet = {
        id: setId(`kofn:${id}`), type: "kOfN", expression,
        members: [id], sourceSets: hs.map(friendRef), exclusionSet: { kind: "user", userId: index.viewerId },
        rawMetrics: { k, n, coverage: cov.sourceCoverage },
      };
      assertMissing(index, set.members, "SUPERMAJORITY_MISS");
      const c = baseSongCandidate(index, id, "SUPERMAJORITY_MISS", set, hs);
      if (!c) continue;
      // Anchored on distance from unanimity, which is what the scale already
      // says: 0.85 is "one step from the maximum", and one short of everyone
      // is exactly that at any cohort size. The span runs from the smallest
      // genuine supermajority up to n−1.
      const span = Math.max(0, (n - 1) - kMin);
      const f = span === 0 ? 1 : (k - kMin) / span;
      c.evidenceStrength = clamp01(0.55 + 0.30 * f);
      c.componentScores = { holders: k, eligibleSourceCount: n, sourceCoverage: cov.sourceCoverage };
      c.reasonCodes = [`HOLDERS=${k}`, `ELIGIBLE=${n}`, `COVERAGE=${cov.sourceCoverage.toFixed(3)}`];
      out.push(c);
    }
    return out;
  },
};

/**
 * Renamed from PAIR_CONSENSUS.
 *
 * "Two of your friends have this" is consensus among four people and
 * coincidence among four hundred, so the mechanism was never really about
 * pairs — it is about a majority of the circle, which happens to be two when
 * the circle is four. Naming it for the pair baked today's cohort into the
 * concept.
 */
const majorityMiss: GeneratorSpec = {
  id: "MAJORITY_MISS",
  mechanism: "At least half the source universe holds it, short of a supermajority.",
  run: (index) => {
    const n = index.eligibleSourceUniverse;
    if (n < 2) return [];
    const kMin = Math.max(2, Math.ceil(CFG.MAJORITY_COVERAGE * n));
    const kMax = Math.max(CFG.MIN_INDEPENDENT_SOURCES, Math.ceil(CFG.SUPERMAJORITY_COVERAGE * n));
    const out: Candidate[] = [];
    for (const [id, hs] of index.holders) {
      const k = hs.length;
      if (k < kMin || k >= kMax || k >= n) continue;
      const cov = coverageOf(k, n);
      const expression = `|holders| = ${k} of ${n} eligible sources · ${id}`;
      const set: DiscoverySet = {
        id: setId(`majority:${id}`), type: "pair", expression,
        members: [id], sourceSets: hs.map(friendRef), exclusionSet: { kind: "user", userId: index.viewerId },
        rawMetrics: { holders: k, n, coverage: cov.sourceCoverage },
      };
      assertMissing(index, set.members, "MAJORITY_MISS");
      const c = baseSongCandidate(index, id, "MAJORITY_MISS", set, hs);
      if (!c) continue;
      // Anchor: solid. A majority is real evidence and nothing more.
      c.evidenceStrength = 0.5;
      c.componentScores = { anchor: 0.5, holders: k, eligibleSourceCount: n, sourceCoverage: cov.sourceCoverage };
      c.reasonCodes = [`HOLDERS=${k}`, `ELIGIBLE=${n}`, `COVERAGE=${cov.sourceCoverage.toFixed(3)}`];
      out.push(c);
    }
    return out;
  },
};

/**
 * Tracks shared by the same group of three or more sources.
 *
 * Previously this enumerated every triple of sources and intersected their
 * libraries — four combinations at four friends, but ten million at four
 * hundred, and ten billion at four thousand. It only survived the scaling
 * probe because the anchor-library filter happened to disqualify every
 * synthetic source, which is luck rather than a guard.
 *
 * Inverted: each discoverable track already knows its holders, so grouping
 * tracks by their holder set produces the same sets in one pass over D. Cost
 * scales with discoverable tracks, not with combinations of people.
 */
const multiSourceSet: GeneratorSpec = {
  id: "MULTI_INTERSECTION_SET",
  mechanism: "One group of three or more sources shares a set the viewer is entirely outside of.",
  run: (index) => {
    const anchors = new Set(index.anchorFriends.map((f) => f.id));
    const groups = new Map<string, { holders: string[]; members: string[] }>();

    for (const [spotifyId, hs] of index.holders) {
      const eligible = hs.filter((h) => anchors.has(h)).sort();
      if (eligible.length < CFG.MULTI_SOURCE_SET.minSources) continue;
      const key = eligible.join(",");
      const g = groups.get(key);
      if (g) g.members.push(spotifyId);
      else groups.set(key, { holders: eligible, members: [spotifyId] });
    }

    const out: Candidate[] = [];
    for (const [key, g] of groups) {
      if (g.members.length < CFG.MULTI_SOURCE_SET.minMembers) continue;
      assertMissing(index, g.members, "MULTI_INTERSECTION_SET");
      const names = g.holders.map((h) => index.nameOf.get(h) ?? "Someone");
      const expression = `(⋂ F_i over ${g.holders.length} sources) − U`;
      const set: DiscoverySet = {
        id: setId(`sharedgroup:${key}`), type: "tripleIntersection", expression,
        members: g.members, sourceSets: g.holders.map(friendRef),
        exclusionSet: { kind: "user", userId: index.viewerId },
        rawMetrics: { size: g.members.length, sources: g.holders.length },
      };
      out.push({
        id: nextId("MULTI_INTERSECTION_SET"),
        subject: { type: "Songs", label: `${names.join(", ")} all have these`, discoverySetId: set.id },
        subjectKey: `Songs:${set.id}`,
        generator: "MULTI_INTERSECTION_SET", discoverySetId: set.id, discoveryExpression: expression,
        evidence: [
          ...holderEvidence(index, g.holders),
          { kind: "setCardinality", setRef: { kind: "friendsAll" }, value: g.members.length },
        ],
        reasonCodes: [`SOURCES=${g.holders.length}`, `SET_SIZE=${g.members.length}`],
        evidenceStrength: clamp01(
          0.6 + 0.25 * Math.min(1, g.members.length / CFG.MULTI_SOURCE_SET.sizeSaturation),
        ),
        attentionValue: 0,
        componentScores: { sources: g.holders.length, size: g.members.length },
        deliverableCount: g.members.length,
        deliverableIds: g.members,
        sourceFriendIds: g.holders,
        sourceFriendNames: names,
        genre: null, subgenre: null, artist: null, album: null,
      });
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
    // Superseded by an authoritative record — the stronger, truer form of the
    // same fact is generated above.
    if (kind === "album" && index.authCoveredTitleKeys.has(u.key)) continue;
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
      deliverableCount: u.missing.length,
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

// ── Family B(i) · authoritative catalogue ───────────────────────────────────
//
// These are the only generators permitted to assert completion, because they
// are the only ones that know how long the record actually is. Everything
// about them is gated on structural consistency: the wrong tracklist length
// turns the strongest sentence in the product into a false one.

/**
 * Anchored so an exact single residue on a real album lands at 0.88–0.92.
 *
 * The three terms are the three things that make a completion fact strong:
 * how exact the residue is, how much of the record the viewer actually holds,
 * and how substantial the record is — one missing track from a twenty-track
 * album says more than one from a six-track EP. Nothing is a constant: a
 * two-track residue falls to the high 0.70s and a four-track residue to the
 * low 0.70s, which is where near-complete belongs.
 */
function authoritativeScore(totalTracks: number, ownedPositions: number, residue: number): number {
  const exactness = 1 / residue;
  const held = Math.min(1, ownedPositions / CFG.ALBUM_AUTHORITATIVE.heldSaturation);
  const scale = Math.min(1, log2(totalTracks) / log2(CFG.ALBUM_AUTHORITATIVE.scaleSaturation));
  return Math.min(CFG.ALBUM_AUTHORITATIVE.ceiling, clamp01(0.60 + 0.24 * exactness * held + 0.08 * scale));
}

function authoritativeAlbums(
  index: DiscoveryIndex, generator: GeneratorId, residueMin: number, residueMax: number,
): Candidate[] {
  const out: Candidate[] = [];
  for (const a of index.authAlbums.values()) {
    if (!a.consistent) continue;
    const residue = a.totalTracks - a.ownedPositions;
    if (residue < residueMin || residue > residueMax) continue;
    if (a.ownedPositions < CFG.ALBUM_AUTHORITATIVE.minOwnedPositions) continue;           // barely-held records prove nothing

    // DELIVERABILITY. Every authoritative missing position must exist in
    // F_all, so the number the caption implies is the number the page can
    // show. Ctrl is four short and only one of those four is held by anyone
    // here — "four tracks short of Ctrl" over a page containing one track is
    // the kind of promise that costs trust in every other card. An album that
    // fails this is not a weaker completion card; it is a different fact, and
    // the observed source-set generators are where it belongs.
    if (a.missing.length !== residue) continue;

    assertMissing(index, a.missing, generator);
    const setRef = { kind: "album" as const, artist: a.artist, album: a.title };
    const expression = `AL_${a.albumId} − U   (${a.ownedPositions}/${a.totalTracks} positions held)`;
    const set: DiscoverySet = {
      id: setId(`authalbum:${a.albumId}:${residue}`), type: "albumGapTrue", expression,
      members: a.missing, sourceSets: [{ kind: "friendsAll" }],
      exclusionSet: { kind: "user", userId: index.viewerId },
      rawMetrics: { totalTracks: a.totalTracks, owned: a.ownedPositions, residue },
    };
    const holderIds = [...new Set(a.missing.flatMap((id) => index.holders.get(id) ?? []))];
    const es = authoritativeScore(a.totalTracks, a.ownedPositions, residue);
    const common = {
      generator, discoverySetId: set.id, discoveryExpression: expression,
      evidence: [
        { kind: "observedOwnership", setRef, owned: a.ownedPositions, observed: a.totalTracks } as Evidence,
        ...holderEvidence(index, holderIds),
      ],
      reasonCodes: [
        "AUTHORITATIVE_CATALOG", `ALBUM_ID=${a.albumId}`, `TOTAL=${a.totalTracks}`,
        `OWNED=${a.ownedPositions}`, `RESIDUE=${residue}`, `TYPE=${a.albumType}`,
      ],
      evidenceStrength: es,
      attentionValue: 0,
      componentScores: {
        totalTracks: a.totalTracks, ownedPositions: a.ownedPositions, residue,
        offerable: a.missing.length,
      },
      deliverableCount: a.missing.length,
      sourceFriendIds: holderIds,
      sourceFriendNames: holderIds.map((h) => index.nameOf.get(h) ?? "Someone"),
    };

    if (residueMax === 1) {
      const only = a.missing[0];
      const subject = songSubject(index, only);
      if (!subject) continue;
      const m = index.meta.get(only)!;
      out.push({
        id: nextId(generator), subject, subjectKey: `Song:${only}`, ...common,
        genre: m.world,
        subgenre: m.subgenre && m.subgenre !== UNKNOWN_LANE ? m.subgenre : null,
        artist: a.artist, album: a.title,
      });
    } else {
      out.push({
        id: nextId(generator),
        subject: { type: "Album", artist: a.artist, album: a.title },
        subjectKey: `Album:auth:${a.albumId}`, ...common,
        genre: null, subgenre: null, artist: a.artist, album: a.title,
      });
    }
  }
  return out;
}

const albumSoleGapTrue: GeneratorSpec = {
  id: "ALBUM_SOLE_GAP_TRUE",
  mechanism: "The viewer holds every position on a verified album but one, and a friend has it.",
  run: (index) => authoritativeAlbums(index, "ALBUM_SOLE_GAP_TRUE", 1, 1),
};

const albumNearCompleteTrue: GeneratorSpec = {
  id: "ALBUM_NEAR_COMPLETE_TRUE",
  mechanism: "The viewer is a small, exact number of tracks short of a verified album.",
  run: (index) => authoritativeAlbums(index, "ALBUM_NEAR_COMPLETE_TRUE", 2, 4),
};

const albumSoleGap: GeneratorSpec = {
  id: "ALBUM_SOLE_GAP_OBSERVED",
  mechanism: "Of everything anyone here holds from one record, the viewer holds all but one track.",
  run: (index) => unitCandidates(index, "album", "ALBUM_SOLE_GAP_OBSERVED", {
    minObserved: CFG.ALBUM_OBSERVED.minObserved, minOwned: 1, minOwnership: CFG.ALBUM_OBSERVED.soleMinOwnership, residueMin: 1, residueMax: 1,
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
    minObserved: CFG.ALBUM_OBSERVED.minObserved, minOwned: 1, minOwnership: CFG.ALBUM_OBSERVED.residueMinOwnership, residueMin: 2, residueMax: CFG.ALBUM_OBSERVED.residueMax,
    score: (ownership, residue) => 0.7 * ownership * ownership * (2 / residue),
    soleOnly: false,
  }),
};

const artistSoleGap: GeneratorSpec = {
  id: "ARTIST_SOLE_GAP_OBSERVED",
  mechanism: "One track short of everything anyone here holds by this artist.",
  run: (index) => unitCandidates(index, "artist", "ARTIST_SOLE_GAP_OBSERVED", {
    minObserved: 1, minOwned: CFG.ARTIST_OBSERVED.minOwned, minOwnership: CFG.ARTIST_OBSERVED.soleMinOwnership, residueMin: 1, residueMax: 1,
    score: (ownership) => 0.85 * ownership * ownership,
    soleOnly: true,
  }),
};

const artistResidue: GeneratorSpec = {
  id: "ARTIST_RESIDUE_OBSERVED",
  mechanism: "A deep artist holding with a small remainder others here keep.",
  run: (index) => unitCandidates(index, "artist", "ARTIST_RESIDUE_OBSERVED", {
    minObserved: 1, minOwned: CFG.ARTIST_OBSERVED.minOwned, minOwnership: CFG.ARTIST_OBSERVED.residueMinOwnership, residueMin: 2, residueMax: CFG.ARTIST_OBSERVED.residueMax,
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
      if (u.observed.size < CFG.ALBUM_AS_UNIT.minObserved) continue;
      const deep = [...u.byFriend.entries()].filter(([, s]) => s.size >= CFG.ALBUM_AS_UNIT.minTracksPerHolder);
      if (deep.length < CFG.ALBUM_AS_UNIT.minHolders) continue;
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
        evidenceStrength: clamp01(0.5 + 0.25 * Math.min(1, depth / CFG.ALBUM_AS_UNIT.depthSaturation)),
        attentionValue: 0,
        componentScores: { holders: deep.length, depth, observed: u.observed.size },
        deliverableCount: missing.length,
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
      if (inFriends.length < CFG.ARTIST_ABSENT.minCatalog) continue;
      const holderIds = [...new Set(inFriends.flatMap((id) => index.holders.get(id) ?? []))];
      if (holderIds.length < CFG.ARTIST_ABSENT.minHolders) continue;

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

      // Sources with any material in this artist's lane — not the whole
      // circle. A source with no jazz never declined to hold this jazz artist.
      //
      // Holding the artist is itself material in the neighbourhood, so the
      // universe is the union of the two. Without that, a holder whose rows
      // are classified into a neighbouring lane falls outside the denominator
      // and coverage exceeds 1, which is not a thing coverage can be.
      const laneSources = index.sourcesInLane.get(dominant[0]) ?? new Set<string>();
      const universe = new Set<string>(laneSources);
      for (const h of holderIds) universe.add(h);
      const eligible = universe.size;
      const cov = coverageOf(holderIds.length, eligible);

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
        reasonCodes: [
          "VIEWER_ABSENT", `CATALOG=${inFriends.length}`, `HOLDERS=${holderIds.length}`,
          `ELIGIBLE=${eligible}`, `COVERAGE=${cov.sourceCoverage.toFixed(3)}`, "LANE_PRESENT",
        ],
        // Same shape as a lane void: broad inventory. Catalogue size alone
        // saturated the old term at 0.75 for a third of these, so breadth of
        // independent sources leads and size saturates well below the ceiling.
        evidenceStrength: clamp01(
          0.35
          + 0.20 * cov.sourceCoverage
          + 0.15 * Math.min(1, log2(inFriends.length) / log2(CFG.ARTIST_ABSENT.catalogSaturation)),
        ),                                                            // ceiling 0.70
        attentionValue: 0,
        componentScores: {
          catalogSize: inFriends.length, holders: holderIds.length,
          eligibleSourceCount: eligible, sourceCoverage: cov.sourceCoverage,
        },
        deliverableCount: inFriends.length,
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
  es: number, parent: string | null, cov: Coverage,
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
    reasonCodes: [
      "VIEWER_ABSENT", `GAP=${lane.gap.length}`,
      `HOLDERS=${cov.holders}`, `ELIGIBLE=${cov.eligibleSourceCount}`,
      `COVERAGE=${cov.sourceCoverage.toFixed(3)}`,
      ...(parent ? [`PARENT_PRESENT=${parent}`] : []),
    ],
    evidenceStrength: es,
    attentionValue: 0,
    componentScores: {
      gapSize: lane.gap.length, holders: cov.holders,
      eligibleSourceCount: cov.eligibleSourceCount, sourceCoverage: cov.sourceCoverage,
    },
    deliverableCount: lane.gap.length,
    deliverableIds: lane.gap,
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
    if (lane.gap.length < CFG.LANE.minGap) continue;
    const deepEnough = [...lane.byFriend.values()].some((s) => s.size >= CFG.LANE.minDeepHolder);
    if (!deepEnough) continue;
    const parentPresent = index.worlds.get(lane.world)?.viewerPresent ?? false;
    if (parentPresent !== wantParentPresent) continue;

    // A lane void is broad inventory, not a sharp exception around one
    // actionable subject, so it is anchored in solid-to-strong territory and
    // cannot reach near-categorical however large it grows. What separates an
    // ordinary void from an unusual one is how many independent sources hold
    // material there — one person's shelf is one person's shelf at any size —
    // so breadth carries more weight than magnitude, and magnitude saturates.
    // Sources holding this lane, over sources holding anything in its parent
    // genre. Dividing by the whole circle understated breadth in a large
    // cohort and overstated it in a tiny one — at a single source it was
    // always 1.0, handing maximum corroboration credit to one person.
    const sources = [...lane.byFriend.values()].filter((s2) => s2.size >= 1).length;
    const eligible = index.sourcesInWorld.get(lane.world)?.size ?? 0;
    const cov = coverageOf(sources, eligible);
    const breadth = cov.sourceCoverage;
    const magnitude = Math.min(1, log2(lane.gap.length) / log2(CFG.LANE.magnitudeSaturation));
    const es = clamp01(0.35 + 0.22 * breadth + 0.13 * magnitude);   // ceiling 0.70
    if (wantParentPresent) {
      out.push(laneCandidate(index, "MISSING_CHILD", lane, es, lane.world, cov));
    } else {
      out.push(laneCandidate(index, "SUBGENRE_VOID", lane, es, null, cov));
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
        if (!held || held.size < CFG.SOURCE_LANE_DEPTH.minHeld) continue;
        const share = held.size / lane.friendAll.size;
        if (share < CFG.SOURCE_LANE_DEPTH.minShareOfLane) continue;
        const members = [...held].filter((id) => !index.U.has(id));
        if (members.length < CFG.SOURCE_LANE_DEPTH.minOfferable) continue;
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
            0.35 + 0.20 * share + 0.10 * Math.min(1, log2(members.length) / log2(CFG.SOURCE_LANE_DEPTH.countSaturation)),
          ),                                                          // ceiling 0.65
          attentionValue: 0,
          componentScores: { count: members.length, share },
          deliverableCount: members.length,
          deliverableIds: members,
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
      if (w.gap.length < CFG.GENRE_GAP.minGap) continue;
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
        evidenceStrength: clamp01(0.35 + 0.2 * Math.min(1, log2(w.gap.length) / CFG.GENRE_GAP.magnitudeSaturation)),
        attentionValue: 0,
        componentScores: { gapSize: w.gap.length },
        deliverableCount: w.gap.length,
        sourceFriendIds: [], sourceFriendNames: [],
        genre: w.world, subgenre: null, artist: null, album: null,
      });
    }
    return out;
  },
};

export const GENERATORS: GeneratorSpec[] = [
  unanimousMiss, unanimousSet, supermajorityMiss, majorityMiss, multiSourceSet,
  albumSoleGapTrue, albumNearCompleteTrue,
  albumSoleGap, albumResidue, artistSoleGap, artistResidue, albumAsUnit, artistAbsentInLane,
  subgenreVoid, missingChild, sourceLaneDepth, genreGap,
];

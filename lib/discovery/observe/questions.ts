/**
 * The questions.
 *
 * Product judgment lives here and only here: a person decided that these are
 * the things about a library which are worth knowing if they turn out to be
 * true. Mathematics decides which answers are worth showing. Keeping that line
 * sharp is what stops the engine either inventing patterns nobody cares about
 * or needing a bespoke generator per sentence — a family is a question plus
 * its null, and adding one means naming a set and a statistic.
 *
 * Every family states its null explicitly. If you cannot say what would be
 * unremarkable, you cannot say what is surprising, and the number you print
 * will be measuring the size of the library instead.
 */
import { logGamma as lgamma } from "./stats";
import {
  binomUpperBits, binomLowerBits, poissonUpperBits, betaBinomUpperBits, fitBeta,
  tailOutlierBits, hyperUpperBits, hyperLowerBits, normalUpperBits,
  distinctCategoriesBits, residualOutlierBits,
} from "./stats";
import {
  artistKeyOf, rateWithout, without, yearOf, type Reference,
} from "./reference";
import type { Profile } from "./profile";
import type { Observation } from "./types";

/**
 * Effect-size margins.
 *
 * Significance alone is not enough and a large library makes that obvious: a
 * lane running at 1.6x the shelf average across four thousand tracks is
 * overwhelmingly significant and completely uninteresting. So each family
 * tests against a null that has already been moved in the direction of the
 * finding — "at least twice everyone else's rate", not "more than it" — which
 * puts the product judgment about how big a difference is worth mentioning
 * inside the hypothesis instead of bolting a second filter onto the outside.
 */
const LANE_MARGIN = 2.0;
const ARTIST_MARGIN = 3.0;
const ERA_MARGIN = 1.75;
const PAIR_MARGIN = 1.5;
const CONVERGENCE_MARGIN = 1.5;

/**
 * Materiality: the smallest share of a library an artist can be and still be
 * worth a sentence. Six tracks nobody else has is a true statistic and a
 * forgettable card.
 */
const ARTIST_MIN_SHARE = 0.02;
/** And an absolute floor, so a tiny library cannot clear the share alone. */
const ARTIST_MIN_WORKS = 20;
/** How far clear of the next artist down. A leader by a nose is not a signature. */
const ARTIST_MIN_LEAD = 2.0;
/**
 * A lane has to be a real part of the world it sits in. "Zero point seven per
 * cent of your rock is hardcore punk" is thirty-five tracks and a rounding
 * error, and it only scored at all because nobody else in a seven-library
 * corpus happens to hold any — which is a fact about the corpus.
 */
const LANE_MIN_SHARE = 0.04;
const LANE_MIN_ARTISTS = 3;
/**
 * Overlap is only measurable against a shelf neither party dominates. Where
 * two listeners *are* the lane, there is no independent universe left to
 * compare them to and the honest answer is to say nothing.
 */
const PAIR_MAX_DOMINANCE = 0.7;
/**
 * How far the corroboration of someone's picks has to sit from the shelf's
 * before it is worth a sentence. With five hundred tracks in the sample, a
 * mean of 1.43 holders against 1.34 is overwhelmingly significant and means
 * nothing whatever; this asks for a quarter's difference, not a detectable one.
 */
const CUTS_MIN_RATIO = 1.25;
/** Breadth has to be visible, not merely detectable: 76 artists where 62 were
 *  predicted is a significant nothing once there are six hundred tracks. */
const BREADTH_MIN_RATIO = 1.6;
/** Following an artist across more years than chance allows, by a margin. */
const LOYALTY_MIN_RATIO = 1.3;
/** A catalogue is only truncated if a real part of it sits past the cut. */
const TRUNCATION_MAX_COVERED = 0.85;
/** Keeping records at half the shelf's rate, or half again as often. */
const SHAPE_MIN_RATIO = 2.0;
/** How far into a record a front- or back-loaded holding may reach. */
const POSITION_MAX_REACH = 0.45;
/** Spread across records, by a visible margin rather than a detectable one. */
const SPREAD_MIN_RATIO = 1.35;
/** A hole worth mentioning holds a real part of the catalogue. */
const GAP_MIN_SHARE = 0.15;
/** Overlap has to be well under what chance forces before it means anything. */
const PAIR_DIVERGE_MAX = 0.5;
/** Both libraries deep enough in the lane for agreement to have been likely. */
const PAIR_MIN_DEPTH = 10;
const PAIR_MIN_EXPECTED = 5;
/** Most of an artist sitting on one record, rather than merely more than even. */
const CONCENTRATION_MIN_SHARE = 0.5;
/** How far down a record's popularity order the kept track has to sit. */
const ODD_MAX_RANK = 0.4;
const ERA_MIN_SHARE = 0.15;

/**
 * A fifth of the corpus carries the subgenre "unknown", and it is the only
 * member of the world called "Other". That is an absent classification, not a
 * kind of music, and a statement about it is a statement about the importer.
 */
const UNCLASSIFIED_LANES = new Set(["unknown", "other", "", "n/a", "misc"]);
const UNCLASSIFIED_WORLDS = new Set(["Other"]);
const classified = (lane: string, world?: string) =>
  !UNCLASSIFIED_LANES.has(lane.toLowerCase().trim()) &&
  (world === undefined || !UNCLASSIFIED_WORLDS.has(world));

/**
 * A lane that is just its world's own name back again.
 *
 * "Fifty-six per cent of your R&B / Soul / Funk is r&b" is arithmetic, not an
 * observation, and the same goes for rap inside Rap / Hip-Hop. These are the
 * default bucket for anything in the world that was not classified further, so
 * they carry no information about the listener however extreme they look.
 */
function isDefaultLane(lane: string, world: string): boolean {
  const l = lane.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!l) return true;
  return world.toLowerCase().split("/").some((part) => {
    const w = part.replace(/[^a-z0-9]/g, "");
    return w.length > 1 && (w === l || w.startsWith(l) || l.startsWith(w));
  });
}

/** Gates that exist to keep a statistic meaningful, not to express taste. */
const MIN_ALBUM_TRACKS = 4;
const MIN_ALBUM_HELD = 3;
/**
 * Devotion means holding a real part of a record. Without this, a library
 * whose average coverage is near zero makes three tracks of twelve look
 * extraordinary — which it duly did on randomly resampled libraries.
 */
const ALBUM_MIN_COVERAGE = 0.3;
/** Enough records kept whole that the rate is a habit rather than an accident. */
const SHAPE_MIN_DEEP = 5;
const SHAPE_MIN_ALBUMS_FOR_LOW = 250;
const MIN_ARTIST_WORKS = 6;
const MIN_TRUNCATION_WORKS = 3;
const MIN_TRUNCATION_GAP_YEARS = 3;
const MIN_LANE_WORKS = 8;
const MIN_WORLD_WORKS = 20;
const MIN_ERA_WORKS = 15;
const MIN_CONVERGENCE_STAKE = 10;
const MIN_ONE_ALBUM_WORKS = 3;

const decadeOf = (y: number) => Math.floor(y / 10) * 10;

/** Recordings in a set the viewer does not hold, preferring corroborated ones. */
function openable(ref: Reference, p: Profile, works: Iterable<string>, minHolders = 1): string[] {
  const out: string[] = [];
  for (const wk of works) {
    if (p.works.has(wk)) continue;
    const w = ref.works.get(wk);
    if (!w) continue;
    let others = 0;
    for (const h of w.holders) if (h !== p.userId) others++;
    if (others >= minHolders) out.push(wk);
  }
  return out;
}

/** Rank openable recordings by how many independent people kept them. */
function byCorroboration(ref: Reference, uid: string, works: string[]): string[] {
  return [...new Set(works)]
    .map((wk) => {
      const w = ref.works.get(wk)!;
      let n = 0; for (const h of w.holders) if (h !== uid) n++;
      return { wk, n };
    })
    .sort((a, b) => b.n - a.n || a.wk.localeCompare(b.wk))
    .map((x) => x.wk);
}

// ── 1. ALBUM_DEVOTION ───────────────────────────────────────────────────────
/**
 * NULL: this person's own album-keeping, as a fitted Beta-Binomial.
 *
 * Holding nine tracks of eleven means nothing in the abstract. Measured
 * libraries run from a listener whose ninetieth percentile album is a single
 * track to one whose ninetieth percentile album is the whole record; the same
 * nine-of-eleven is routine for the second and a once-in-a-library event for
 * the first. So the reference is the listener, fitted leaving the album in
 * question out so a complete record cannot help set the bar it is judged by.
 */
function albumDevotion(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  if (p.coverage.n < 6) return out;
  for (const [aid, cov] of p.albumCoverage) {
    if (cov.held < MIN_ALBUM_HELD || cov.total < MIN_ALBUM_TRACKS) continue;
    if (cov.held / cov.total < ALBUM_MIN_COVERAGE) continue;
    const alb = ref.albums.get(aid)!;
    const x = Math.min(1, cov.held / cov.total);
    const { alpha, beta } = fitBeta(p.coverage.sumX, p.coverage.sumX2, p.coverage.n, { x });
    const bits = betaBinomUpperBits(cov.held, cov.total, alpha, beta);
    if (bits <= 0) continue;
    const held = p.byAlbum.get(aid)!;
    let residue = byCorroboration(ref, p.userId, openable(ref, p, alb.works, 0));
    // A record held whole opens the rest of its maker's work rather than
    // nothing: the subject named on the card is what licenses that, and it is
    // the same artist rather than a resemblance to one.
    let openedElsewhere = false;
    if (residue.length === 0) {
      const a = ref.artists.get(alb.artistKey);
      if (a) {
        const rest: string[] = [];
        for (const [otherId, wks] of a.albums) {
          if (otherId === aid) continue;
          for (const wk of wks) if (!p.works.has(wk)) rest.push(wk);
        }
        if (rest.length >= 4) { residue = byCorroboration(ref, p.userId, rest); openedElsewhere = true; }
      }
    }
    out.push({
      family: "ALBUM_DEVOTION",
      key: `album:${aid}`,
      subject: { kind: "album", key: aid, label: alb.name, artist: alb.artist },
      bits, bitsJackknife: bits,
      facts: { held: cov.held, total: cov.total, missing: cov.total - cov.held,
               medianCoverage: +(p.coverage.sumX / p.coverage.n).toFixed(3),
               albumsHeld: p.coverage.n, artist: alb.artist, album: alb.name,
               opens: openedElsewhere ? "catalogue" : "residue" },
      evidence: [...held],
      payload: residue.length
        ? { kind: "DISCOVER", works: residue }
        : { kind: "REFLECT", works: [...held] },
      footprint: [...held, ...residue],
      refQuality: "self",
    });
  }
  return out;
}

// ── 2. ARTIST_SIGNATURE ─────────────────────────────────────────────────────
/**
 * NULL: the shape of this listener's own long tail.
 *
 * The first version of this asked how much of the corpus an artist was outside
 * the viewer, and it was wrong in a way worth recording. With seven libraries,
 * an artist nobody else happens to hold gets a reference rate of one row in
 * twenty thousand, so sixteen tracks by a French pop singer scored a hundred
 * and nine bits — a number about the size of the corpus, not about the
 * listener. Every artist only one person holds looked like a revelation.
 *
 * So the score comes from the only distribution we have a great deal of: their
 * own. Artists in a library follow a long tail, and the question is whether
 * this one sits above the tail its owner's other artists trace out. A thousand
 * Grateful Dead tracks where the fitted line predicts two hundred is a fact
 * about the listener and stays true at any corpus size. That nobody else here
 * holds them is kept as colour on the card, never as the reason it was chosen.
 */
function artistSignature(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  const ranked = [...p.byArtist.entries()]
    .map(([ak, works]) => ({ ak, k: works.size, works }))
    .sort((a, b) => b.k - a.k);
  if (ranked.length < 20) return out;

  for (let i = 0; i < Math.min(12, ranked.length); i++) {
    const { ak, k, works } = ranked[i];
    const share = k / p.distinctWorks;
    const next = ranked[i + 1]?.k ?? 0;
    // Materiality first, and it is strict. This is the one card that says
    // "this is who you are", so a sixteen-track French pop singer in a
    // sixteen-hundred-track library does not qualify however unusual she is
    // among seven people. Both conditions are scale-free.
    if (share < ARTIST_MIN_SHARE || k < ARTIST_MIN_WORKS) continue;
    if (next > 0 && k / next < ARTIST_MIN_LEAD) continue;
    const a = ref.artists.get(ak)!;
    const pRate = rateWithout(a.rows, ref.size, p.userId);
    if (pRate >= 1) continue;
    const bits = binomUpperBits(k, p.distinctWorks, Math.min(0.95, pRate * ARTIST_MARGIN));
    if (bits <= 0) continue;
    let heldElsewhere = 0, holders = 0;
    for (const [uid, st] of a.worksByUser) {
      if (uid === p.userId) continue;
      holders++; heldElsewhere = Math.max(heldElsewhere, st.size);
    }
    const residue = byCorroboration(ref, p.userId, openable(ref, p, a.works, 1));
    let biggest = 0;
    for (const [, wks] of a.albums) {
      let n = 0; for (const wk of wks) if (works.has(wk)) n++;
      biggest = Math.max(biggest, n);
    }
    const jk = binomUpperBits(Math.max(0, k - biggest), p.distinctWorks,
                              Math.min(0.95, pRate * ARTIST_MARGIN));
    out.push({
      family: "ARTIST_SIGNATURE",
      key: `artist:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      bits, bitsJackknife: jk,
      facts: { yours: k, rank: i + 1,
               libraryShare: +(100 * share).toFixed(2), nextDown: next,
               othersShare: +(100 * pRate).toFixed(3),
               otherHolders: holders, deepestOther: heldElsewhere,
               albumSpread: a.albums.size, artist: a.name },
      evidence: [...works],
      payload: residue.length >= 3
        ? { kind: "DISCOVER", works: residue }
        : { kind: "REFLECT", works: [...works] },
      footprint: [...works, ...residue],
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 3. ARTIST_TRUNCATION ────────────────────────────────────────────────────
/**
 * NULL: the viewer's holdings are a uniform sample of the artist's catalogue.
 *
 * Under that null, the chance that every one of k saves lands at or before a
 * given year is the catalogue fraction up to that year raised to k — so a deep
 * following that stops dead is exactly an order statistic, and it gets more
 * surprising the deeper the following is. Release dates, not save dates: a
 * reissue carries its reissue year and can fake this, which is a known and
 * unfixed weakness rather than a solved one.
 */
function artistTruncation(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [ak, works] of p.byArtist) {
    if (works.size < MIN_TRUNCATION_WORKS) continue;
    const years = p.yearsOfArtist.get(ak);
    if (!years || years.length < MIN_TRUNCATION_WORKS) continue;
    const a = ref.artists.get(ak)!;
    const yMax = Math.max(...years);
    let atOrBefore = 0, after = 0, latest = yMax;
    const laterWorks: string[] = [];
    for (const [y, wks] of a.years) {
      if (y <= yMax) atOrBefore += wks.size;
      else {
        after += wks.size; latest = Math.max(latest, y);
        for (const wk of wks) if (!p.works.has(wk)) laterWorks.push(wk);
      }
    }
    const total = atOrBefore + after;
    if (after === 0 || total === 0) continue;
    if (latest - yMax < MIN_TRUNCATION_GAP_YEARS) continue;
    const openableLater = byCorroboration(ref, p.userId, openable(ref, p, laterWorks, 0));
    if (openableLater.length < 2) continue;
    const f = atOrBefore / total;
    if (f > TRUNCATION_MAX_COVERED) continue;
    const bits = -works.size * Math.log2(Math.max(1e-12, f));
    if (bits <= 0) continue;
    out.push({
      family: "ARTIST_TRUNCATION",
      key: `trunc:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      bits, bitsJackknife: bits,
      facts: { yours: works.size, lastYear: yMax, latestYear: latest,
               sinceThen: after, artist: a.name },
      evidence: [...works],
      payload: { kind: "DISCOVER", works: openableLater },
      footprint: [...works, ...openableLater],
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 4. ONE_ALBUM_ARTIST ─────────────────────────────────────────────────────
/**
 * NULL: saves are spread across the artist's catalogue in proportion to it.
 * Landing all of them on one record is then a probability raised to the k.
 */
function oneAlbumArtist(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [ak, works] of p.byArtist) {
    if (works.size < MIN_ONE_ALBUM_WORKS) continue;
    const a = ref.artists.get(ak)!;
    if (a.albums.size < 3) continue;
    let home: string | null = null, homeN = 0, spread = 0;
    for (const [aid, wks] of a.albums) {
      let n = 0; for (const wk of wks) if (works.has(wk)) n++;
      if (n > 0) spread++;
      if (n > homeN) { homeN = n; home = aid; }
    }
    if (spread !== 1 || !home) continue;
    const M = a.works.size;
    const mb = a.albums.get(home)!.size;
    if (M <= mb) continue;
    const bits = -works.size * Math.log2(Math.max(1e-12, mb / M));
    if (bits <= 0) continue;
    const elsewhere: string[] = [];
    for (const [aid, wks] of a.albums) if (aid !== home) for (const wk of wks) if (!p.works.has(wk)) elsewhere.push(wk);
    const open = byCorroboration(ref, p.userId, elsewhere);
    if (open.length < 3) continue;
    out.push({
      family: "ONE_ALBUM_ARTIST",
      key: `onealbum:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      bits, bitsJackknife: bits,
      facts: { yours: works.size, album: ref.albums.get(home)?.name ?? "", 
               otherAlbums: a.albums.size - 1, artist: a.name },
      evidence: [...works],
      payload: { kind: "DISCOVER", works: open },
      footprint: [...works, ...open],
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 5. LANE_SIGNATURE ───────────────────────────────────────────────────────
/**
 * NULL: within a world this person obviously listens to, the lanes divide the
 * way they divide for everyone else.
 *
 * Conditioning on the world is what makes the answer news. That someone likes
 * hip-hop is not news to them; that nearly a tenth of their hip-hop is one
 * regional lane, when it is a fortieth of everyone else's, is. The jackknife
 * drops the lane's largest artist, because a lane carried by one act is a fact
 * about that act.
 */
function laneSignature(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [sg, works] of p.bySubgenre) {
    if (works.size < MIN_LANE_WORKS) continue;
    const world = ref.subgenreWorld.get(sg);
    if (!world || !classified(sg, world) || isDefaultLane(sg, world)) continue;
    const worldWorks = p.byWorld.get(world);
    if (!worldWorks || worldWorks.size < MIN_WORLD_WORKS) continue;
    const sub = ref.worldSubRows.get(world)?.get(sg);
    const whole = ref.worldRows.get(world);
    if (!whole) continue;
    const pRate = rateWithout(sub, whole, p.userId);
    if (pRate >= 1) continue;
    if (works.size / worldWorks.size < LANE_MIN_SHARE) continue;
    const nullRate = Math.min(0.95, pRate * LANE_MARGIN);
    const bits = binomUpperBits(works.size, worldWorks.size, nullRate);
    if (bits <= 0) continue;
    const byArtist = new Map<string, number>();
    for (const wk of works) {
      const w = ref.works.get(wk); if (!w) continue;
      byArtist.set(w.artistKey, (byArtist.get(w.artistKey) ?? 0) + 1);
    }
    if (byArtist.size < LANE_MIN_ARTISTS) continue;     // a lane, not one act
    let top = 0, topKey = "";
    for (const [k, n] of byArtist) if (n > top) { top = n; topKey = k; }
    const jk = binomUpperBits(works.size - top, worldWorks.size - top, nullRate);
    const pool = ref.subgenreWorks.get(sg) ?? new Set<string>();
    const open = byCorroboration(ref, p.userId, openable(ref, p, pool, 1));
    out.push({
      family: "LANE_SIGNATURE",
      key: `lane:${sg}`,
      subject: { kind: "subgenre", key: sg, label: sg },
      bits, bitsJackknife: jk,
      facts: { yours: works.size, inWorld: worldWorks.size,
               yourShare: +(100 * works.size / worldWorks.size).toFixed(1),
               othersShare: +(100 * pRate).toFixed(1), world,
               artists: byArtist.size, topArtist: ref.artists.get(topKey)?.name ?? "",
               lane: sg },
      evidence: [...works],
      payload: open.length >= 5 ? { kind: "DISCOVER", works: open }
                                : { kind: "REFLECT", works: [...works] },
      footprint: [...works, ...open.slice(0, 40)],
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 6. ERA_DISPLACEMENT ─────────────────────────────────────────────────────
/**
 * NULL: within a lane, this person's decades fall the way the lane's own
 * surviving material falls.
 *
 * Referencing the lane's availability rather than a flat spread is what stops
 * the engine announcing that someone's bossa nova is concentrated in the
 * sixties, which is when bossa nova happened. Scored one decade at a time as a
 * binomial rather than as a goodness-of-fit across all of them: a G-test over
 * four thousand tracks returns a triumphant number for a lane running at 1.6x,
 * and a single decade with a margin returns something a person can read.
 */
function eraDisplacement(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [sg, works] of p.bySubgenre) {
    if (works.size < MIN_ERA_WORKS || !classified(sg)) continue;
    const pool = ref.subgenreWorks.get(sg);
    if (!pool) continue;
    const mine = new Map<number, number>();
    let mineN = 0;
    for (const wk of works) {
      const w = ref.works.get(wk); if (!w?.year) continue;
      const d = decadeOf(w.year); mine.set(d, (mine.get(d) ?? 0) + 1); mineN++;
    }
    const theirs = new Map<number, number>();
    let theirN = 0;
    for (const wk of pool) {
      if (p.works.has(wk)) continue;                       // leave the viewer out
      const w = ref.works.get(wk); if (!w?.year) continue;
      const d = decadeOf(w.year); theirs.set(d, (theirs.get(d) ?? 0) + 1); theirN++;
    }
    if (mineN < MIN_ERA_WORKS || theirN < 50) continue;

    // Every decade that clears the floors, not only the strongest. A lane can
    // genuinely be displaced in two directions at once, and emitting one
    // observation per lane threw away most of the instances a thin library has
    // — which is exactly where thin libraries need them.
    const hits: { d: number; bits: number; o: number; q: number }[] = [];
    for (const [d, o] of mine) {
      if (o / mineN < ERA_MIN_SHARE) continue;             // a decade, not a footnote
      const q = ((theirs.get(d) ?? 0) + 0.5) / (theirN + 0.5);
      const bits = binomUpperBits(o, mineN, Math.min(0.95, q * ERA_MARGIN));
      if (bits > 0) hits.push({ d, bits, o, q });
    }
    for (const best of hits) {

    // Dropping the artist who supplies most of that decade.
    const byArtist = new Map<string, number>();
    for (const wk of works) {
      const w = ref.works.get(wk);
      if (!w?.year || decadeOf(w.year) !== best.d) continue;
      byArtist.set(w.artistKey, (byArtist.get(w.artistKey) ?? 0) + 1);
    }
    let top = 0; for (const n of byArtist.values()) top = Math.max(top, n);
    const jk = binomUpperBits(best.o - top, mineN - top, Math.min(0.95, best.q * ERA_MARGIN));

    const inEra: string[] = [];
    for (const wk of pool) {
      if (p.works.has(wk)) continue;
      const w = ref.works.get(wk); if (!w?.year || decadeOf(w.year) !== best.d) continue;
      inEra.push(wk);
    }
    const open = byCorroboration(ref, p.userId, inEra);
    out.push({
      family: "ERA_DISPLACEMENT",
      key: `era:${sg}:${best.d}`,
      subject: { kind: "subgenre", key: sg, label: sg },
      bits: best.bits, bitsJackknife: jk,
      facts: { yours: mineN, decade: best.d, inDecade: best.o,
               yourShare: +(100 * best.o / mineN).toFixed(1),
               othersShare: +(100 * best.q).toFixed(1),
               lift: +((best.o / mineN) / best.q).toFixed(1),
               artists: byArtist.size, lane: sg },
      evidence: [...works],
      payload: open.length >= 5 ? { kind: "DISCOVER", works: open }
                                : { kind: "REFLECT", works: [...works] },
      footprint: [...works, ...open.slice(0, 40)],
      refQuality: "corpus",
    });
    }
  }
  return out;
}

// ── 7. CONVERGENCE ──────────────────────────────────────────────────────────
/**
 * NULL: a Poisson-binomial over everyone else.
 *
 * Each eligible person carries their own probability of having run into this
 * artist, derived from how much of that lane they hold and how much of the
 * lane the artist is. The sum is what we should expect to see. This is what
 * keeps a famous name from ever being a discovery: five people holding Drake
 * is precisely what the null predicts, so it carries no bits, while four
 * people independently holding something obscure carries many. It also means
 * a single enormous library cannot manufacture consensus on its own.
 */
function convergence(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  const others = ref.users.filter((u) => u !== p.userId);
  if (others.length < 3) return out;
  for (const [ak, a] of ref.artists) {
    if (p.byArtist.has(ak)) continue;
    let holders = 0;
    for (const [uid, s] of a.worksByUser) if (uid !== p.userId && s.size >= 2) holders++;
    if (holders < 2) continue;

    let lane = "", laneN = 0;
    for (const [sg, n] of a.subgenres) if (n > laneN) { laneN = n; lane = sg; }
    if (!classified(lane)) continue;
    const stake = p.bySubgenre.get(lane)?.size ?? 0;
    if (stake < MIN_CONVERGENCE_STAKE) continue;         // not their territory

    const laneWorks = ref.subgenreWorks.get(lane)?.size ?? 0;
    if (laneWorks < 50) continue;
    const mA = a.works.size;
    const perWork = Math.min(0.9, mA / laneWorks);
    let lambda = 0;
    const contrib: { uid: string; q: number }[] = [];
    for (const uid of others) {
      const n = ref.subgenreWorksByUser.get(lane)?.get(uid) ?? 0;
      const q = n > 0 ? 1 - Math.pow(1 - perWork, n) : 0;
      lambda += q; contrib.push({ uid, q });
    }
    const bits = poissonUpperBits(holders, lambda * CONVERGENCE_MARGIN);
    if (bits <= 0) continue;
    // Drop the person who was most likely to have it anyway.
    contrib.sort((x, y) => y.q - x.q);
    const jk = poissonUpperBits(holders - 1, Math.max(1e-6, (lambda - contrib[0].q) * CONVERGENCE_MARGIN));
    const open = byCorroboration(ref, p.userId, openable(ref, p, a.works, 2));
    if (open.length < 3) continue;
    out.push({
      family: "CONVERGENCE",
      key: `converge:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      bits, bitsJackknife: jk,
      facts: { holders, expected: +lambda.toFixed(2), corpusWorks: mA,
               yourLaneWorks: stake, lane, artist: a.name },
      evidence: [...(p.bySubgenre.get(lane) ?? [])],
      payload: { kind: "DISCOVER", works: open },
      footprint: open,
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 8. LIBRARY_SHAPE ────────────────────────────────────────────────────────
/**
 * NULL: everyone else's album-keeping habit.
 *
 * One instance per person, in both directions: someone who almost never keeps
 * half a record and someone who almost always does are each unusual, and each
 * is a thing about their own library they have probably never counted.
 */
function libraryShape(ref: Reference, p: Profile): Observation[] {
  const mine = ref.albumHabit.get(p.userId);
  if (!mine || mine.albums < 30) return [];
  let deep = 0, albums = 0;
  for (const [uid, h] of ref.albumHabit) {
    if (uid === p.userId) continue;
    deep += h.deep; albums += h.albums;
  }
  if (albums < 100) return [];
  const pRate = deep / albums;
  if (mine.deep < SHAPE_MIN_DEEP && mine.albums < SHAPE_MIN_ALBUMS_FOR_LOW) return [];
  const mineRate = mine.deep / mine.albums;
  const ratio = mineRate >= pRate ? mineRate / Math.max(1e-9, pRate)
                                  : pRate / Math.max(1e-9, mineRate);
  if (ratio < SHAPE_MIN_RATIO) return [];
  const up = binomUpperBits(mine.deep, mine.albums, pRate);
  const down = binomLowerBits(mine.deep, mine.albums, pRate);
  const bits = Math.max(up, down);
  if (bits <= 0) return [];
  const near = [...p.albumCoverage.entries()]
    .filter(([, c]) => c.held < c.total)
    .sort((a, b) => b[1].held / b[1].total - a[1].held / a[1].total)
    .slice(0, 20);
  const open: string[] = [];
  for (const [aid] of near) {
    const alb = ref.albums.get(aid); if (!alb) continue;
    for (const wk of alb.works) if (!p.works.has(wk)) open.push(wk);
  }
  return [{
    family: "LIBRARY_SHAPE",
    key: `shape:${p.userId}`,
    subject: { kind: "library", key: p.userId, label: "your library" },
    bits, bitsJackknife: bits,
    facts: { deep: mine.deep, albums: mine.albums,
             yourRate: +(100 * mine.deep / mine.albums).toFixed(1),
             othersRate: +(100 * pRate).toFixed(1),
             direction: up >= down ? "more" : "fewer" },
    evidence: [],
    payload: { kind: "DISCOVER", works: byCorroboration(ref, p.userId, open) },
    footprint: open.slice(0, 40),
    refQuality: "corpus",
  }];
}

// ── 9. PAIR_ALIGNMENT ───────────────────────────────────────────────────────
/**
 * NULL: two people drawing independently from the same lane.
 *
 * Expected overlap is then the product of the two sampling rates, which is why
 * this cannot be impressed by two large libraries or by a lane everybody
 * holds. The named person and the measured overlap stay on the card: the
 * evidence is one human being's actual saves, not a latent similarity.
 */
/**
 * The part of a lane two people could possibly agree on.
 *
 * A recording only one person in the whole corpus holds cannot be shared by
 * two of them, however alike their taste. Counting it in the universe makes
 * the hypergeometric expect an agreement that is arithmetically impossible,
 * and the shortfall then reads as divergence — which is why PAIR_DIVERGENCE
 * fired more often on degree-preserving permutations than on real libraries.
 * The identifiable universe is the recordings at least two people hold.
 */
function shareableLane(ref: Reference, sg: string): string[] {
  const works: string[] = [];
  for (const wk of ref.subgenreWorks.get(sg) ?? []) {
    if ((ref.works.get(wk)?.holders.size ?? 0) >= 2) works.push(wk);
  }
  return works;
}

function pairAlignment(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [sg, works] of p.bySubgenre) {
    if (works.size < PAIR_MIN_DEPTH || !classified(sg)) continue;
    const share = shareableLane(ref, sg);
    const M = share.length;
    if (M < 40) continue;
    const mine = share.filter((wk) => works.has(wk));
    if (mine.length < PAIR_MIN_DEPTH) continue;
    for (const uid of ref.users) {
      if (uid === p.userId) continue;
      const theirs = share.filter((wk) => ref.works.get(wk)!.holders.has(uid));
      if (theirs.length < PAIR_MIN_DEPTH) continue;
      if (Math.max(mine.length, theirs.length) / M > PAIR_MAX_DOMINANCE) continue;
      const theirSet = new Set(theirs);
      let shared = 0;
      for (const wk of mine) if (theirSet.has(wk)) shared++;
      const expected = (mine.length * theirs.length) / M;
      if (expected < PAIR_MIN_EXPECTED) continue;
      const bits = hyperUpperBits(
        shared, M, mine.length, Math.min(M, Math.round(theirs.length * PAIR_MARGIN)));
      if (bits <= 0) continue;
      const open: string[] = [];
      for (const wk of ref.subgenreWorks.get(sg)!) {
        if (p.works.has(wk)) continue;
        if (ref.works.get(wk)?.holders.has(uid)) open.push(wk);
      }
      if (open.length < 5) continue;
      out.push({
        family: "PAIR_ALIGNMENT",
        key: `pair:${sg}:${uid}`,
        subject: { kind: "person", key: `${uid}:${sg}`, label: sg },
        bits, bitsJackknife: bits,
        facts: { shared, yours: mine.length, theirs: theirs.length, laneWorks: M,
                 expected: +expected.toFixed(1), lane: sg, other: uid },
        evidence: mine.filter((wk) => theirSet.has(wk)),
        payload: { kind: "DISCOVER", works: byCorroboration(ref, p.userId, open) },
        footprint: open.slice(0, 60),
        refQuality: "corpus",
      });
    }
  }
  return out;
}

// ── 10. LIBRARY_ERA ─────────────────────────────────────────────────────────
/**
 * NULL: everyone else's decades.
 *
 * The lane-level version needs twenty-five tracks in a single lane before it
 * can speak, which silences it for exactly the listeners whose libraries are
 * spread thin. This one asks the same thing of the whole library, where even a
 * modest collection has enough to answer, and it is the kind of fact people
 * reliably have not counted: a fifth of what you keep is from one decade, and
 * for the shelf around you it is a twentieth.
 */
function libraryEra(ref: Reference, p: Profile): Observation[] {
  const mine = new Map<number, number>();
  let mineN = 0;
  for (const wk of p.works) {
    const w = ref.works.get(wk); if (!w?.year) continue;
    const d = decadeOf(w.year); mine.set(d, (mine.get(d) ?? 0) + 1); mineN++;
  }
  if (mineN < 120) return [];
  let othersTotal = 0;
  for (const [, t] of ref.decadeRows) othersTotal += without(t, p.userId);
  if (othersTotal < 500) return [];

  const out: Observation[] = [];
  for (const [d, o] of mine) {
    if (o / mineN < ERA_MIN_SHARE) continue;
    const q = Math.max(0.0005, without(ref.decadeRows.get(d), p.userId) / othersTotal);
    const bits = binomUpperBits(o, mineN, Math.min(0.95, q * ERA_MARGIN));
    if (bits <= 0) continue;
    // A decade carried by one lane is a fact about that lane.
    const byLane = new Map<string, number>();
    const evid: string[] = [];
    for (const wk of p.works) {
      const w = ref.works.get(wk);
      if (!w?.year || decadeOf(w.year) !== d) continue;
      evid.push(wk);
      if (classified(w.subgenre)) byLane.set(w.subgenre, (byLane.get(w.subgenre) ?? 0) + 1);
    }
    let top = 0, topLane = "";
    for (const [k, n] of byLane) if (n > top) { top = n; topLane = k; }
    const jk = binomUpperBits(o - top, mineN - top, Math.min(0.95, q * ERA_MARGIN));
    const open: string[] = [];
    for (const [wk, w] of ref.works) {
      if (p.works.has(wk) || !w.year || decadeOf(w.year) !== d) continue;
      if (!classified(w.subgenre)) continue;
      open.push(wk);
    }
    out.push({
      family: "LIBRARY_ERA",
      key: `libera:${d}`,
      subject: { kind: "library", key: `decade:${d}`, label: `the ${d}s` },
      bits, bitsJackknife: jk,
      facts: { decade: d, yours: o, total: mineN,
               yourShare: +(100 * o / mineN).toFixed(1),
               othersShare: +(100 * q).toFixed(1),
               lift: +((o / mineN) / q).toFixed(1),
               lanes: byLane.size, topLane, topLaneCount: top },
      evidence: evid,
      payload: { kind: "DISCOVER", works: byCorroboration(ref, p.userId, open).slice(0, 60) },
      footprint: evid.slice(0, 60),
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 11. DEEP_CUTS ───────────────────────────────────────────────────────────
/**
 * NULL: a random handful from the same shelf.
 *
 * Within one lane, take only the recordings somebody other than the viewer
 * keeps — so the universe exists independently of them — and ask whether the
 * ones they hold are the widely-kept or the barely-kept end of it. Sampling
 * without replacement gives the mean and variance exactly, so this is a
 * permutation test with a finite-population correction rather than an
 * impression, and it answers a question about a person that no amount of
 * looking at their own library would settle.
 */
function deepCuts(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [sg, works] of p.bySubgenre) {
    if (!classified(sg)) continue;
    const pool = ref.subgenreWorks.get(sg);
    if (!pool) continue;
    // Popularity is TOTAL holders, counted the same way for every recording.
    //
    // The first version of this counted holders-other-than-the-viewer, which
    // silently subtracted one from every track the viewer held and from none
    // of the rest. Against a degree-preserving permutation it fired seventeen
    // times where the real data fired once: it was measuring its own
    // arithmetic. Using the total removes the asymmetry, and it makes the
    // surviving claim stronger — a permutation that fixes holder counts makes
    // popular tracks *more* likely to be held, so finding the quiet end
    // despite that is a real result rather than a bookkeeping artefact.
    const universe: { wk: string; x: number; mine: boolean }[] = [];
    for (const wk of pool) {
      const w = ref.works.get(wk); if (!w) continue;
      if (w.holders.size < 2) continue;
      universe.push({ wk, x: w.holders.size, mine: works.has(wk) });
    }
    const M = universe.length;
    const mineArr = universe.filter((u) => u.mine);
    const j2 = mineArr.length;
    if (M < 80 || j2 < 15 || j2 > M - 15) continue;
    let mu = 0; for (const u of universe) mu += u.x; mu /= M;
    let v = 0; for (const u of universe) v += (u.x - mu) * (u.x - mu); v /= M;
    if (v <= 1e-9) continue;
    let xbar = 0; for (const u of mineArr) xbar += u.x; xbar /= j2;
    const se = Math.sqrt((v / j2) * ((M - j2) / (M - 1)));
    if (!(se > 1e-9)) continue;
    const z = (xbar - mu) / se;
    // One direction only. That someone holds the widely-kept end of a lane is
    // true, faintly rude, and opens the lane's greatest hits — which is the
    // recommendation this engine exists to avoid making.
    if (z >= 0) continue;
    if (mu / Math.max(1e-9, xbar) < CUTS_MIN_RATIO) continue;
    const bits = normalUpperBits(-z);
    if (bits <= 0) continue;
    const wanted = universe.filter((u) => !u.mine)
      .sort((a, b) => a.x - b.x).slice(0, 40).map((u) => u.wk);
    if (wanted.length < 5) continue;
    out.push({
      family: "DEEP_CUTS",
      key: `cuts:${sg}`,
      subject: { kind: "subgenre", key: sg, label: sg },
      bits, bitsJackknife: bits,
      facts: { lane: sg, yours: j2, universe: M, direction: "deep",
               yourMean: +xbar.toFixed(2), laneMean: +mu.toFixed(2) },
      evidence: mineArr.map((u) => u.wk),
      payload: { kind: "DISCOVER", works: wanted },
      footprint: [...mineArr.map((u) => u.wk), ...wanted],
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 12. LANE_BREADTH ────────────────────────────────────────────────────────
/**
 * NULL: the same number of tracks drawn from the lane as everyone else holds it.
 *
 * Two listeners with three hundred reggae tracks are not the same listener:
 * one has four artists and one has fifty-six, and the count of tracks cannot
 * tell them apart. The expected number of distinct artists behind k draws has
 * a closed form given the lane's artist shares, so the departure from it is
 * the whole observation — and the shares are taken from the lane as it exists
 * without the viewer, so someone who is most of a lane cannot set their own
 * expectation.
 */
function laneBreadth(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  // The reference is how broadly this listener holds their *other* lanes.
  // Drawing at random from the lane was the first null here and it was wrong:
  // random draws are maximally broad, so on a resampled library — where no
  // lane means anything — this family fired exactly as often as on the real
  // one. People cluster on artists. The question is whether this lane is
  // broad *for them*.
  const lanes: { sg: string; works: Set<string>; artists: number }[] = [];
  for (const [sg, works] of p.bySubgenre) {
    if (works.size < 12 || !classified(sg)) continue;
    const arts = new Set<string>();
    for (const wk of works) { const w = ref.works.get(wk); if (w) arts.add(w.artistKey); }
    lanes.push({ sg, works, artists: arts.size });
  }
  if (lanes.length < 10) return out;
  const xs = lanes.map((l) => l.works.size);
  const ys = lanes.map((l) => l.artists);

  for (let i = 0; i < lanes.length; i++) {
    const { sg, works, artists } = lanes[i];
    if (works.size < 30) continue;
    const bits = residualOutlierBits(xs, ys, i);
    if (bits <= 0) continue;

    // What this listener's other lanes predict for a lane of this size.
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (let j = 0; j < lanes.length; j++) {
      if (j === i) continue;
      const x = Math.log(xs[j]), y = Math.log(Math.max(1, ys[j]));
      sx += x; sy += y; sxx += x * x; sxy += x * y; m++;
    }
    const dn = m * sxx - sx * sx;
    const b = dn ? (m * sxy - sx * sy) / dn : 0;
    const a = (sy - b * sx) / m;
    const expected = Math.exp(a + b * Math.log(works.size));
    if (artists / Math.max(1e-9, expected) < BREADTH_MIN_RATIO) continue;

    const pool = ref.subgenreWorks.get(sg);
    if (!pool) continue;
    const otherCounts = new Map<string, number>();
    let otherN = 0;
    for (const wk of pool) {
      if (p.works.has(wk)) continue;
      const w = ref.works.get(wk); if (!w) continue;
      otherCounts.set(w.artistKey, (otherCounts.get(w.artistKey) ?? 0) + 1);
      otherN++;
    }
    if (otherN < 60) continue;
    const mineArtists = new Set<string>();
    for (const wk of works) { const w = ref.works.get(wk); if (w) mineArtists.add(w.artistKey); }
    const unheld = [...otherCounts.entries()]
      .filter(([ak]) => !mineArtists.has(ak))
      .sort((u, v) => v[1] - u[1]).slice(0, 25).map(([ak]) => ak);
    const open: string[] = [];
    for (const ak of unheld) {
      const ar = ref.artists.get(ak); if (!ar) continue;
      for (const wk of ar.works) {
        const w = ref.works.get(wk);
        if (w?.subgenre === sg && !p.works.has(wk)) open.push(wk);
      }
    }
    const opened = byCorroboration(ref, p.userId, open).slice(0, 40);
    out.push({
      family: "LANE_BREADTH",
      key: `breadth:${sg}`,
      subject: { kind: "subgenre", key: sg, label: sg },
      bits, bitsJackknife: bits,
      facts: { lane: sg, yours: works.size, artists,
               expected: +expected.toFixed(1), laneArtists: otherCounts.size,
               lanesCompared: lanes.length },
      evidence: [...works],
      payload: opened.length >= 5 ? { kind: "DISCOVER", works: opened }
                                  : { kind: "REFLECT", works: [...works] },
      footprint: [...works, ...opened],
      refQuality: "self",
    });
  }
  return out;
}

// ── 13. ARTIST_LOYALTY ──────────────────────────────────────────────────────
/**
 * NULL: the same number of tracks drawn from the artist's catalogue at random.
 *
 * The counterpart to truncation, and the happier one. Somebody who has kept
 * picking up the same artist across eleven separate release years has done
 * something a random handful of their catalogue would not do, and it is the
 * kind of thing a person recognises about themselves only once counted. What
 * it opens is the years of that catalogue they went past.
 */
function artistLoyalty(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [ak, works] of p.byArtist) {
    if (works.size < 4) continue;
    const a = ref.artists.get(ak)!;
    if (a.years.size < 4) continue;
    // The catalogue's year shape entire. Taking it from the catalogue minus
    // the viewer put the reference on the complement of the thing being
    // tested, which is anti-correlation rather than caution.
    const looYears = new Map<number, number>();
    let total = 0;
    for (const [y, wks] of a.years) { looYears.set(y, wks.size); total += wks.size; }
    if (total < 12 || looYears.size < 5) continue;
    const mineYears = new Set<number>();
    for (const wk of works) {
      const w = ref.works.get(wk);
      if (w?.year !== null && w?.year !== undefined) mineYears.add(w.year);
    }
    if (mineYears.size < 4) continue;
    const span = Math.max(...mineYears) - Math.min(...mineYears);
    if (span < 6) continue;
    const shares = [...looYears.values()].map((n) => n / total);
    const signed = distinctCategoriesBits(shares, works.size, mineYears.size);
    if (signed <= 0) continue;
    let expected = 0;
    for (const sh of shares) expected += 1 - Math.pow(1 - sh, works.size);
    if (mineYears.size / Math.max(1e-9, expected) < LOYALTY_MIN_RATIO) continue;
    const missing: string[] = [];
    for (const [y, wks] of a.years) {
      if (mineYears.has(y)) continue;
      for (const wk of wks) if (!p.works.has(wk)) missing.push(wk);
    }
    const open = byCorroboration(ref, p.userId, missing);
    if (open.length < 4) continue;
    out.push({
      family: "ARTIST_LOYALTY",
      key: `loyal:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      bits: signed, bitsJackknife: signed,
      facts: { artist: a.name, yours: works.size, years: mineYears.size,
               expected: +expected.toFixed(1), span,
               from: Math.min(...mineYears), to: Math.max(...mineYears),
               catalogueYears: a.years.size },
      evidence: [...works],
      payload: { kind: "DISCOVER", works: open },
      footprint: [...works, ...open],
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 14. ALBUM_POSITION ──────────────────────────────────────────────────────
/**
 * NULL: the tracks kept off a record are a random handful of its positions.
 *
 * Track numbers are complete for every row in the corpus and nothing was using
 * them. Under random selection the chance that all k of someone's picks from a
 * fourteen-track record fall inside the first five is exactly C(5,k)/C(14,k) —
 * an order statistic, no estimation involved — and the pattern it catches is
 * one people recognise immediately: you played the front of the record and
 * stopped. What it opens is precisely the part you never reached.
 */
function albumPosition(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  const lc = (n: number, r: number) => (r < 0 || r > n) ? -Infinity
    : lgamma(n + 1) - lgamma(r + 1) - lgamma(n - r + 1);
  for (const [aid, held] of p.byAlbum) {
    const alb = ref.albums.get(aid);
    if (!alb || alb.albumType !== "album") continue;
    const T = alb.totalTracks;
    if (T < 8) continue;
    const pos: number[] = [];
    for (const wk of held) {
      const tn = ref.works.get(wk)?.row.trackNumber;
      if (tn && tn >= 1 && tn <= T) pos.push(tn);
    }
    const k = pos.length;
    if (k < 4 || k > T - 4) continue;
    pos.sort((a, b) => a - b);
    const hiPos = pos[k - 1], loPos = pos[0];
    const front = (lc(hiPos, k) - lc(T, k)) / -Math.LN2;
    const back = (lc(T - loPos + 1, k) - lc(T, k)) / -Math.LN2;
    const isFront = front >= back;
    const bits = Math.max(front, back);
    if (!Number.isFinite(bits) || bits <= 0) continue;
    if (isFront && hiPos / T > POSITION_MAX_REACH) continue;
    if (!isFront && (T - loPos + 1) / T > POSITION_MAX_REACH) continue;
    const missing: string[] = [];
    for (const [tn, wk] of alb.positions) {
      if (p.works.has(wk)) continue;
      if (isFront ? tn > hiPos : tn < loPos) missing.push(wk);
    }
    const open = byCorroboration(ref, p.userId, missing);
    if (open.length < 3) continue;
    out.push({
      family: "ALBUM_POSITION",
      key: `pos:${aid}`,
      subject: { kind: "album", key: aid, label: alb.name, artist: alb.artist },
      bits, bitsJackknife: bits,
      facts: { album: alb.name, artist: alb.artist, held: k, total: T,
               reach: isFront ? hiPos : loPos, side: isFront ? "front" : "back",
               untouched: open.length },
      evidence: [...held],
      payload: { kind: "DISCOVER", works: open },
      footprint: [...held, ...open],
      refQuality: "self",
    });
  }
  return out;
}

// ── 15. ARTIST_SPREAD ───────────────────────────────────────────────────────
/**
 * NULL: the same number of tracks drawn across the artist's records in
 * proportion to their sizes.
 *
 * The counterpart to ONE_ALBUM_ARTIST at the other end. Someone holding
 * twenty-three tracks by one artist across fourteen separate records has done
 * something a random twenty-three of that catalogue would not, and it is a
 * different fact about them from how many tracks they have.
 */
function artistSpread(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [ak, works] of p.byArtist) {
    if (works.size < 4) continue;
    const a = ref.artists.get(ak)!;
    if (a.albums.size < 3) continue;
    // The catalogue entire, including what this listener holds.
    //
    // An earlier version took the shares from the catalogue *minus* the
    // viewer, meaning to be conservative. It was the opposite: the reference
    // then sits on the complement of the thing being tested, the two are
    // anti-correlated by construction, and against a degree-preserving
    // permutation the family fired slightly more often on shuffled libraries
    // than on real ones. The null is "these k tracks are a draw from the
    // catalogue", and a draw comes from the whole of it.
    const loo = new Map<string, number>();
    let total = 0;
    for (const [aid, wks] of a.albums) { loo.set(aid, wks.size); total += wks.size; }
    if (total < 10 || loo.size < 4) continue;
    const mine = new Set<string>();
    for (const wk of works) {
      const aid = ref.works.get(wk)?.albumId;
      if (aid) mine.add(aid);
    }
    if (mine.size < 3) continue;
    const shares = [...loo.values()].map((n) => n / total);
    const bits = distinctCategoriesBits(shares, works.size, mine.size);
    if (bits <= 0) continue;
    let expected = 0;
    for (const sh of shares) expected += 1 - Math.pow(1 - sh, works.size);
    if (mine.size / Math.max(1e-9, expected) < SPREAD_MIN_RATIO) continue;
    const untouched: string[] = [];
    for (const [aid, wks] of a.albums) {
      if (mine.has(aid)) continue;
      for (const wk of wks) if (!p.works.has(wk)) untouched.push(wk);
    }
    const open = byCorroboration(ref, p.userId, untouched);
    if (open.length < 4) continue;
    out.push({
      family: "ARTIST_SPREAD",
      key: `spread:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      bits, bitsJackknife: bits,
      facts: { artist: a.name, yours: works.size, records: mine.size,
               expected: +expected.toFixed(1), catalogue: a.albums.size },
      evidence: [...works],
      payload: { kind: "DISCOVER", works: open },
      footprint: [...works, ...open],
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 16. ARTIST_INTERIOR_GAP ─────────────────────────────────────────────────
/**
 * NULL: k tracks drawn from the catalogue would land in the window sometimes.
 *
 * Truncation catches a catalogue that stops. This catches one with a hole in
 * the middle — followed before, followed after, nothing from the stretch
 * between — which is a different and often stranger fact. The chance of
 * missing a window holding share w of the catalogue across all k picks is
 * (1−w)^k, so a deep following makes a hole progressively harder to explain.
 */
function artistInteriorGap(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [ak, works] of p.byArtist) {
    if (works.size < 5) continue;
    const a = ref.artists.get(ak)!;
    const mineYears = new Set<number>();
    for (const wk of works) {
      const y = ref.works.get(wk)?.year;
      if (y !== null && y !== undefined) mineYears.add(y);
    }
    if (mineYears.size < 3) continue;
    const lo = Math.min(...mineYears), hi = Math.max(...mineYears);
    if (hi - lo < 6) continue;
    let total = 0;
    for (const [, wks] of a.years) total += wks.size;
    if (total < 12) continue;
    // The longest interior stretch of the catalogue they hold nothing from.
    let best: { from: number; to: number; n: number } | null = null;
    let runFrom: number | null = null, runN = 0;
    for (let y = lo + 1; y < hi; y++) {
      const avail = a.years.get(y)?.size ?? 0;
      if (avail > 0 && !mineYears.has(y)) {
        if (runFrom === null) runFrom = y;
        runN += avail;
      } else if (runFrom !== null) {
        if (!best || runN > best.n) best = { from: runFrom, to: y - 1, n: runN };
        runFrom = null; runN = 0;
      }
    }
    if (runFrom !== null && (!best || runN > best.n)) best = { from: runFrom, to: hi - 1, n: runN };
    if (!best || best.to - best.from < 2) continue;
    const w = best.n / total;
    if (w < GAP_MIN_SHARE) continue;
    const bits = -works.size * Math.log2(Math.max(1e-12, 1 - w));
    if (bits <= 0) continue;
    const inside: string[] = [];
    for (let y = best.from; y <= best.to; y++) {
      for (const wk of a.years.get(y) ?? []) if (!p.works.has(wk)) inside.push(wk);
    }
    const open = byCorroboration(ref, p.userId, inside);
    if (open.length < 4) continue;
    out.push({
      family: "ARTIST_INTERIOR_GAP",
      key: `gap:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      bits, bitsJackknife: bits,
      facts: { artist: a.name, yours: works.size, from: best.from, to: best.to,
               inGap: best.n, firstYear: lo, lastYear: hi },
      evidence: [...works],
      payload: { kind: "DISCOVER", works: open },
      footprint: [...works, ...open],
      refQuality: "corpus",
    });
  }
  return out;
}

// ── 17. PAIR_DIVERGENCE ─────────────────────────────────────────────────────
/**
 * NULL: the same two collections drawn independently from one shelf.
 *
 * The other half of PAIR_ALIGNMENT, and often the better card. Two people who
 * both keep a lane deeply and overlap on almost none of it have found
 * different music inside the same territory, which is both a real fact about
 * them and the most legitimate recommendation in the system: everything the
 * other one has is, by construction, in a lane this listener demonstrably
 * occupies and has not met.
 */
function pairDivergence(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const [sg, works] of p.bySubgenre) {
    if (works.size < PAIR_MIN_DEPTH || !classified(sg)) continue;
    const share = shareableLane(ref, sg);
    const M = share.length;
    if (M < 40) continue;
    const mine = share.filter((wk) => works.has(wk));
    if (mine.length < PAIR_MIN_DEPTH) continue;
    for (const uid of ref.users) {
      if (uid === p.userId) continue;
      const theirs = share.filter((wk) => ref.works.get(wk)!.holders.has(uid));
      if (theirs.length < PAIR_MIN_DEPTH) continue;
      if (Math.max(mine.length, theirs.length) / M > PAIR_MAX_DOMINANCE) continue;
      const theirSet = new Set(theirs);
      let shared = 0;
      for (const wk of mine) if (theirSet.has(wk)) shared++;
      const expected = (mine.length * theirs.length) / M;
      if (expected < PAIR_MIN_EXPECTED) continue;
      const bits = hyperLowerBits(shared, M, mine.length, theirs.length);
      if (bits <= 0) continue;
      if (shared / Math.max(1e-9, expected) > PAIR_DIVERGE_MAX) continue;
      const open: string[] = [];
      for (const wk of ref.subgenreWorks.get(sg)!) {
        if (p.works.has(wk)) continue;
        if (ref.works.get(wk)?.holders.has(uid)) open.push(wk);
      }
      if (open.length < 5) continue;
      out.push({
        family: "PAIR_DIVERGENCE",
        key: `diverge:${sg}:${uid}`,
        subject: { kind: "person", key: `${uid}:${sg}`, label: sg },
        bits, bitsJackknife: bits,
        facts: { shared, yours: mine.length, theirs: theirs.length, laneWorks: M,
                 expected: +expected.toFixed(1), lane: sg, other: uid },
        evidence: [...works],
        payload: { kind: "DISCOVER", works: byCorroboration(ref, p.userId, open) },
        footprint: open.slice(0, 60),
        refQuality: "corpus",
      });
    }
  }
  return out;
}

// ── 18. ARTIST_CONCENTRATION ────────────────────────────────────────────────
/**
 * The narrow half of ARTIST_SPREAD, and the more common shape by far.
 *
 * Not "all of your tracks by them are from one record" — that is
 * ONE_ALBUM_ARTIST — but "most of them are", which is what most deep artist
 * relationships actually look like and which nothing else in the engine said.
 * Emitting only the broad direction threw away the larger half of the artist
 * axis, and the artist axis is where a large library's inventory lives.
 */
function artistConcentration(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  // Scored against this listener's own habit of spreading an artist over
  // records, not against the catalogue.
  //
  // The corpus-referenced version starved exactly where inventory was most
  // needed. The largest library here holds about sixty per cent of everything
  // the corpus contains, so for most of his artists there is almost nothing he
  // lacks, every null built from "the catalogue without him" collapses, and
  // his deep feed fell back to the single self-referenced family there was.
  // How many records a person's twenty-three tracks by someone usually sit on
  // is a fact about them, available at any corpus size, and it is what makes
  // the observation mean something.
  const arts: { ak: string; works: Set<string>; albums: number }[] = [];
  for (const [ak, works] of p.byArtist) {
    if (works.size < 4) continue;
    const albums = new Set<string>();
    for (const wk of works) { const aid = ref.works.get(wk)?.albumId; if (aid) albums.add(aid); }
    if (albums.size < 1) continue;
    arts.push({ ak, works, albums: albums.size });
  }
  if (arts.length < 12) return out;
  const xs = arts.map((a) => a.works.size);
  const ys = arts.map((a) => a.albums);

  for (let i = 0; i < arts.length; i++) {
    const { ak, works, albums } = arts[i];
    if (works.size < 5) continue;
    const signed = residualOutlierBits(xs, ys, i);
    if (signed >= 0) continue;                         // concentrated only
    const bits = -signed;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (let j2 = 0; j2 < arts.length; j2++) {
      if (j2 === i) continue;
      const x = Math.log(xs[j2]), y = Math.log(Math.max(1, ys[j2]));
      sx += x; sy += y; sxx += x * x; sxy += x * y; m++;
    }
    const dn = m * sxx - sx * sx;
    const b = dn ? (m * sxy - sx * sy) / dn : 0;
    const a0 = (sy - b * sx) / m;
    const expected = Math.exp(a0 + b * Math.log(works.size));
    if (expected / Math.max(1e-9, albums) < SPREAD_MIN_RATIO) continue;

    const a = ref.artists.get(ak)!;
    const mineAlbums = new Set<string>();
    for (const wk of works) { const aid = ref.works.get(wk)?.albumId; if (aid) mineAlbums.add(aid); }
    let homeId = "", homeN = 0;
    for (const aid of mineAlbums) {
      let n = 0; for (const wk of works) if (ref.works.get(wk)?.albumId === aid) n++;
      if (n > homeN) { homeN = n; homeId = aid; }
    }
    const elsewhere: string[] = [];
    for (const [aid, wks] of a.albums) {
      if (mineAlbums.has(aid)) continue;
      for (const wk of wks) if (!p.works.has(wk)) elsewhere.push(wk);
    }
    const open = byCorroboration(ref, p.userId, elsewhere);
    if (open.length < 4) continue;                     // it still has to open something
    out.push({
      family: "ARTIST_CONCENTRATION",
      key: `conc:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      bits, bitsJackknife: bits,
      facts: { artist: a.name, yours: works.size, onHome: homeN,
               album: ref.albums.get(homeId)?.name ?? "", records: albums,
               expected: +expected.toFixed(1), catalogue: a.albums.size,
               artistsCompared: arts.length },
      evidence: [...works],
      payload: { kind: "DISCOVER", works: open },
      footprint: [...works, ...open],
      refQuality: "self",
    });
  }
  return out;
}

// ── 19. ALBUM_ODD_CHOICE ────────────────────────────────────────────────────
/**
 * NULL: the one track you kept off a record is a random one of its tracks.
 *
 * Nearly every record in these libraries is represented by a single song —
 * median coverage across all seven listeners is about one track in ten — and
 * nothing was saying anything about the overwhelmingly commonest shape in the
 * data. The question that shape supports is *which* song, and the answer is
 * often the whole story: the one track someone keeps from a famous record
 * being the one almost nobody else takes is both a real order statistic and
 * the most human fact the engine can find.
 *
 * Popularity is counted as total holders, identically for every track, so the
 * asymmetry that wrecked the first DEEP_CUTS cannot arise here. A permutation
 * that fixes holder counts makes popular tracks *more* likely to be held, so
 * finding the quiet one is a result against the grain of the null.
 */
function albumOddChoice(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  const lc = (n: number, r: number) => (r < 0 || r > n) ? -Infinity
    : lgamma(n + 1) - lgamma(r + 1) - lgamma(n - r + 1);
  for (const [aid, held] of p.byAlbum) {
    const alb = ref.albums.get(aid);
    if (!alb || alb.albumType === "single") continue;
    // The record as the corpus knows it, with its tracks ranked by how many
    // people keep them. Needs real variation or there is nothing to rank.
    const known: { wk: string; h: number }[] = [];
    for (const wk of alb.works) {
      const w = ref.works.get(wk); if (!w) continue;
      known.push({ wk, h: w.holders.size });
    }
    const T = known.length;
    if (T < 5) continue;
    const k = held.size;
    if (k < 1 || k > Math.min(3, T - 3)) continue;
    const spread = new Set(known.map((x) => x.h)).size;
    if (spread < 2) continue;                          // no popularity signal
    known.sort((a, b) => a.h - b.h || a.wk.localeCompare(b.wk));
    let worstRank = 0;
    for (let i = 0; i < T; i++) if (held.has(known[i].wk)) worstRank = i + 1;
    if (worstRank / T > ODD_MAX_RANK) continue;
    const bits = (lc(worstRank, k) - lc(T, k)) / -Math.LN2;
    if (!Number.isFinite(bits) || bits <= 0) continue;
    const popular = known.slice().reverse()
      .filter((x) => !p.works.has(x.wk)).map((x) => x.wk);
    if (popular.length < 4) continue;
    const mineNames = [...held].map((wk) => ref.works.get(wk)?.name ?? "").filter(Boolean);
    out.push({
      family: "ALBUM_ODD_CHOICE",
      key: `odd:${aid}`,
      subject: { kind: "album", key: aid, label: alb.name, artist: alb.artist },
      bits, bitsJackknife: bits,
      facts: { album: alb.name, artist: alb.artist, held: k, total: T,
               rank: worstRank, yourTrack: mineNames[0] ?? "",
               topHolders: known[T - 1].h, yourHolders: known[worstRank - 1].h },
      evidence: [...held],
      payload: { kind: "DISCOVER", works: popular },
      footprint: [...held, ...popular],
      refQuality: "corpus",
    });
  }
  return out;
}

export const FAMILIES = [
  albumDevotion, artistSignature, artistTruncation, oneAlbumArtist,
  laneSignature, eraDisplacement, convergence, libraryShape, pairAlignment,
  libraryEra, deepCuts, laneBreadth, artistLoyalty,
  albumPosition, artistSpread, artistInteriorGap, pairDivergence,
  artistConcentration, albumOddChoice,
];

export function askAll(ref: Reference, p: Profile): Observation[] {
  const out: Observation[] = [];
  for (const f of FAMILIES) out.push(...f(ref, p));
  return out;
}

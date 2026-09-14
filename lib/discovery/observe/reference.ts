/**
 * What the corpus knows, indexed so that any of it can be asked again with one
 * person removed.
 *
 * Every null model in this engine compares a listener against everyone else,
 * and "everyone else" has to genuinely exclude them. With seven libraries and
 * one of them carrying a thousand Grateful Dead tracks, a reference that
 * included the person being measured would quietly conclude that a Deadhead is
 * unremarkable, because he is most of the evidence for what is normal. So
 * every aggregate here keeps its per-user breakdown and every read subtracts
 * the viewer. That is also what stops the engine flattering the largest
 * library as the corpus grows: at ten million users the subtraction costs the
 * same and matters less, which is the right direction for it to matter in.
 */
import type { TrackRow } from "../types";

/**
 * A recording's name, stripped to what makes it that recording.
 *
 * Parentheses and brackets go, and so does everything from a featuring credit
 * or a remaster note onwards. Without the second part, "LOVE." and "LOVE.
 * FEAT. ZACARI." are two different songs, and a collector's edition of a
 * record somebody already owns comes back as ten discoveries.
 */
export const normText = (s: string) =>
  s.toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .split(/\s+-\s+|\bfeat\.?\b|\bft\.?\b|\bwith\b/)[0]
    .replace(/[^a-z0-9]+/g, "").trim();

/** Recording identity. A Spotify id names a pressing; this names the song. */
export const workKeyOf = (name: string, artist: string) =>
  `${normText(name)}|${normText(artist)}`;

export const artistKeyOf = (artist: string) => normText(artist);

export const yearOf = (t: { releaseDate?: string | null }): number | null => {
  const m = /^(\d{4})/.exec(t.releaseDate ?? "");
  if (!m) return null;
  const y = +m[1];
  return y >= 1900 && y <= 2100 ? y : null;
};

/** A count that can always be re-read with one contributor taken out. */
export interface Tally {
  total: number;
  byUser: Map<string, number>;
}
const tally = (): Tally => ({ total: 0, byUser: new Map() });
const bump = (t: Tally, uid: string, n = 1) => {
  t.total += n;
  t.byUser.set(uid, (t.byUser.get(uid) ?? 0) + n);
};
/** The tally as it looks to someone who is not allowed to count themselves. */
export const without = (t: Tally | undefined, uid: string): number =>
  t ? t.total - (t.byUser.get(uid) ?? 0) : 0;

export interface ArtistRef {
  key: string;
  name: string;
  /** Distinct recordings the corpus has ever seen by this artist. */
  works: Set<string>;
  /** Rows, per user — how much of them each person holds. */
  rows: Tally;
  /** Distinct recordings per user, which is what depth comparisons want. */
  worksByUser: Map<string, Set<string>>;
  years: Map<number, Set<string>>;      // year -> workKeys
  albums: Map<string, Set<string>>;     // albumId -> workKeys
  subgenres: Map<string, number>;
}

export interface AlbumRef {
  albumId: string;
  name: string;
  artist: string;
  artistKey: string;
  totalTracks: number;
  albumType: string;
  year: number | null;
  /** trackNumber -> workKey, for the tracks anyone has actually seen. */
  positions: Map<number, string>;
  works: Set<string>;
  rows: Tally;
}

export interface Reference {
  users: string[];
  /** Rows per user, and the corpus total. */
  size: Tally;
  works: Map<string, { name: string; artist: string; artistKey: string; subgenre: string; world: string; albumId: string | null; year: number | null; holders: Set<string>; row: TrackRow }>;
  artists: Map<string, ArtistRef>;
  albums: Map<string, AlbumRef>;
  /** Corpus rows per subgenre, and which world it sits in. */
  subgenreRows: Map<string, Tally>;
  subgenreWorld: Map<string, string>;
  subgenreWorks: Map<string, Set<string>>;
  worldRows: Map<string, Tally>;
  /** Rows in (world, subgenre), for the conditional composition null. */
  worldSubRows: Map<string, Map<string, Tally>>;
  /** Distinct recordings in a subgenre, per user — the social sampling base. */
  subgenreWorksByUser: Map<string, Map<string, number>>;
  /** How many albums each user holds at ≥ half, and how many they hold at all. */
  albumHabit: Map<string, { deep: number; albums: number }>;
  /** Corpus rows per decade, per user, for the library-level era null. */
  decadeRows: Map<number, Tally>;
  /** Recordings of each album held by each user. Needed to measure holding rates. */
  albumWorksByUser: Map<string, Map<string, number>>;
}

export function buildReference(input: TrackRow[]): Reference {
  /**
   * Read the rows in a fixed order.
   *
   * The corpus query has no ORDER BY, so Postgres returns rows in whatever
   * order it likes, and several values here are first-seen-wins: a recording's
   * world, its album, an album's title and track count. That made the engine
   * quietly non-deterministic — the same listener's card reported sharing 406
   * tracks on one run and 240 on the next. Sorting costs one pass over forty
   * thousand rows and makes every number reproducible.
   */
  const tracks = [...input].sort((a, b) =>
    a.spotifyId.localeCompare(b.spotifyId) || a.userId.localeCompare(b.userId));
  const ref: Reference = {
    users: [], size: tally(), works: new Map(), artists: new Map(), albums: new Map(),
    subgenreRows: new Map(), subgenreWorld: new Map(), subgenreWorks: new Map(),
    decadeRows: new Map(), albumWorksByUser: new Map(),
    worldRows: new Map(), worldSubRows: new Map(), subgenreWorksByUser: new Map(),
    albumHabit: new Map(),
  };
  const seenUsers = new Set<string>();
  /** Every row's opinion of which lane a recording belongs to. */
  const votes = new Map<string, Map<string, number>>();

  for (const t of tracks) {
    const uid = t.userId;
    if (!seenUsers.has(uid)) { seenUsers.add(uid); ref.users.push(uid); }
    bump(ref.size, uid);

    const ak = artistKeyOf(t.artist);
    const wk = workKeyOf(t.name, t.artist);
    const y = yearOf(t);
    const sg = t.blueprintSubgenre;
    const world = t.blueprintWorld;

    let w = ref.works.get(wk);
    if (!w) {
      w = { name: t.name, artist: t.artist, artistKey: ak, subgenre: sg, world,
            albumId: t.albumId ?? null, year: y, holders: new Set(), row: t };
      ref.works.set(wk, w);
    }
    w.holders.add(uid);

    let a = ref.artists.get(ak);
    if (!a) {
      a = { key: ak, name: t.artist, works: new Set(), rows: tally(),
            worksByUser: new Map(), years: new Map(), albums: new Map(), subgenres: new Map() };
      ref.artists.set(ak, a);
    }
    a.works.add(wk);
    bump(a.rows, uid);
    let wbu = a.worksByUser.get(uid);
    if (!wbu) { wbu = new Set(); a.worksByUser.set(uid, wbu); }
    wbu.add(wk);
    if (y !== null) {
      let ys = a.years.get(y); if (!ys) { ys = new Set(); a.years.set(y, ys); }
      ys.add(wk);
    }
    a.subgenres.set(sg, (a.subgenres.get(sg) ?? 0) + 1);

    if (t.albumId) {
      let alb = ref.albums.get(t.albumId);
      if (!alb) {
        alb = { albumId: t.albumId, name: t.album ?? "", artist: t.artist, artistKey: ak,
                totalTracks: t.albumTotalTracks ?? 0, albumType: t.albumType ?? "album",
                year: y, positions: new Map(), works: new Set(), rows: tally() };
        ref.albums.set(t.albumId, alb);
      }
      alb.works.add(wk);
      bump(alb.rows, uid);
      if (t.trackNumber) alb.positions.set(t.trackNumber, wk);
      let ab = a.albums.get(t.albumId); if (!ab) { ab = new Set(); a.albums.set(t.albumId, ab); }
      ab.add(wk);
    }

    // Lane membership is decided once, after every row has voted — see below.
    let v = votes.get(wk);
    if (!v) { v = new Map(); votes.set(wk, v); }
    v.set(sg, (v.get(sg) ?? 0) + 1);

    if (y !== null) {
      const d = Math.floor(y / 10) * 10;
      let dr = ref.decadeRows.get(d); if (!dr) { dr = tally(); ref.decadeRows.set(d, dr); }
      bump(dr, uid);
    }

  }

  /**
   * One lane per recording, decided by majority vote across every row of it.
   *
   * Two people can have the same song classified differently — the importer
   * tags each row from the artist's genres at the time, and those move. Left
   * alone it produced two disagreeing definitions of "the works in this lane":
   * one that admitted a recording if any row named the lane, and one that went
   * by whichever row happened to be indexed first. A card duly reported that a
   * listener shared forty-four of somebody's forty tracks.
   *
   * The vote is the commonest tag, ties broken alphabetically so the answer
   * does not depend on the order rows came back from the database. Everything
   * downstream — lane sizes, per-person depth, the profile — reads this one
   * value, so the counts on a card cannot disagree with each other.
   */
  for (const [wk, w] of ref.works) {
    const v = votes.get(wk);
    if (!v) continue;
    let best = w.subgenre, bestN = -1;
    for (const [sg, n] of [...v.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (n > bestN) { bestN = n; best = sg; }
    }
    w.subgenre = best;
  }

  for (const [wk, w] of ref.works) {
    if (!w.albumId) continue;
    let m = ref.albumWorksByUser.get(w.albumId);
    if (!m) { m = new Map(); ref.albumWorksByUser.set(w.albumId, m); }
    for (const uid of w.holders) m.set(uid, (m.get(uid) ?? 0) + 1);
  }

  // Lane and world indexes, all from that one canonical value. Counted in
  // distinct recordings rather than rows, so two pressings of a song are one
  // thing everywhere.
  for (const [wk, w] of ref.works) {
    const sg = w.subgenre;
    ref.subgenreWorld.set(sg, w.world);
    let sw = ref.subgenreWorks.get(sg); if (!sw) { sw = new Set(); ref.subgenreWorks.set(sg, sw); }
    sw.add(wk);
    let m = ref.subgenreWorksByUser.get(sg);
    if (!m) { m = new Map(); ref.subgenreWorksByUser.set(sg, m); }

    let sr = ref.subgenreRows.get(sg); if (!sr) { sr = tally(); ref.subgenreRows.set(sg, sr); }
    let wr = ref.worldRows.get(w.world); if (!wr) { wr = tally(); ref.worldRows.set(w.world, wr); }
    let ws = ref.worldSubRows.get(w.world); if (!ws) { ws = new Map(); ref.worldSubRows.set(w.world, ws); }
    let wss = ws.get(sg); if (!wss) { wss = tally(); ws.set(sg, wss); }

    for (const uid of w.holders) {
      m.set(uid, (m.get(uid) ?? 0) + 1);
      bump(sr, uid); bump(wr, uid); bump(wss, uid);
    }
  }

  // Album-keeping habit, per user: how often do they hold half a record or more.
  const perUserAlbum = new Map<string, Map<string, number>>();
  for (const t of tracks) {
    if (!t.albumId || t.albumType !== "album" || !t.albumTotalTracks || t.albumTotalTracks < 5) continue;
    let m = perUserAlbum.get(t.userId);
    if (!m) { m = new Map(); perUserAlbum.set(t.userId, m); }
    m.set(t.albumId, (m.get(t.albumId) ?? 0) + 1);
  }
  for (const [uid, m] of perUserAlbum) {
    let deep = 0;
    for (const [aid, n] of m) {
      const tot = ref.albums.get(aid)?.totalTracks ?? 0;
      if (tot >= 5 && n / tot >= 0.5) deep++;
    }
    ref.albumHabit.set(uid, { deep, albums: m.size });
  }
  return ref;
}

/**
 * A corpus rate as it looks with the viewer removed, floored so that a thing
 * nobody else holds still has a finite expectation rather than an infinite
 * surprise. The floor is one unobserved row in a corpus of this size, which is
 * the smallest honest claim available — and it tightens automatically as the
 * corpus grows.
 */
export function rateWithout(part: Tally | undefined, whole: Tally, uid: string): number {
  const w = without(whole, uid);
  if (w <= 0) return 0.5;
  const pnum = without(part, uid);
  return Math.max(pnum, 0.5) / (w + 0.5);
}

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
 * Markers that mean a different performance, not a different pressing.
 *
 * A remaster, a mono mix and a single version are the same recording reissued;
 * a live take, a remix and an acoustic version are not. Stripping all of them
 * alike merged "Aerodynamic" with "Aerodynamic - Daft Punk Remix" and three
 * separate live performances of the Grateful Dead's "Jam" into one recording,
 * and then credited two people with sharing a track neither had — a hundred
 * and seventy-six times.
 */
const PERFORMANCE = /\b(live|remix|acoustic|demo|instrumental|cover|reprise|unplugged|session|rehearsal|karaoke)\b/gi;

/** Reduce to letters and digits; empty means the name had none. */
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * A recording's name, stripped to what makes it that recording.
 *
 * Parentheses, brackets, featured credits and trailing reissue notes go, since
 * none of them changes which performance this is. What does change it is kept
 * and folded into the key, so a live take and the studio version stay two
 * things.
 */
export const normText = (raw: string): string => {
  const markers = [...new Set((raw.match(PERFORMANCE) ?? []).map((m) => m.toLowerCase()))].sort();
  const base = raw
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .split(/\s+-\s+|\bfeat\.?\b|\bft\.?\b|\bwith\b/)[0];
  const core = alnum(base);
  /**
   * A name written entirely outside the Latin alphabet reduces to nothing, and
   * every such name then shares one identity. Seventeen artists — Japanese,
   * Cyrillic, Arabic, Thai — were being treated as a single artist with
   * forty-seven tracks. Where there is nothing left, keep the original.
   */
  const stem = core || raw.toLowerCase().replace(/\s+/g, "") || "unnamed";
  return markers.length ? `${stem}#${markers.join(",")}` : stem;
};

/**
 * Artist identity. Performance markers are meaningless in a name, so this uses
 * the plain reduction with the same fallback for names that carry no Latin
 * characters at all.
 */
export const artistKeyOf = (artist: string): string =>
  alnum(artist) || artist.toLowerCase().replace(/\s+/g, "") || "unnamed";

/**
 * Recording identity. A Spotify id names a pressing; this names the song —
 * the same performance by the same artist, however it was later packaged.
 */
export const workKeyOf = (name: string, artist: string) =>
  `${normText(name)}\u0001${artistKeyOf(artist)}`;

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
  works: Map<string, {
    name: string; artist: string; artistKey: string; subgenre: string; world: string;
    albumId: string | null;
    /** The date on the pressing this recording was first read from. */
    year: number | null;
    /**
     * The earliest year any pressing of this recording carries.
     *
     * A recording is one thing across many pressings, and they do not agree
     * about when it came out: 1,220 recordings here carry more than one year
     * and 873 of those disagree by five years or more, because a remaster is
     * dated to its reissue. Reading whichever row arrived first dated Link
     * Wray's "Rumble" to 2024 and Martin Denny's "Tune from Rangoon" to 2021 —
     * 669 recordings later than their own rows allow. Anything placing music
     * in time wants this one rather than `year`.
     */
    firstYear: number | null;
    holders: Set<string>; row: TrackRow;
  }>;
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
            albumId: t.albumId ?? null, year: y, firstYear: y, holders: new Set(), row: t };
      ref.works.set(wk, w);
    }
    if (y !== null && (w.firstYear === null || y < w.firstYear)) w.firstYear = y;
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
   * The vote is the commonest tag. A tie goes to whichever lane is larger
   * across the whole corpus, then alphabetically — because with two rows and
   * one vote each, "alphabetically" meant a recording tagged uk r&b by one
   * person and french rap by another became french rap on the strength of the
   * letter f. Everything downstream — lane sizes, per-person depth, the
   * profile, and after the backfill the sphere and search too — reads this one
   * value, so no two screens can disagree about where a track lives.
   */
  /**
   * An absent classification never outvotes a real one. The importer writes
   * "unknown" when it could not place a track, and it is the largest bucket in
   * the corpus — so a size tie-break handed it the win and moved City Of Stars
   * out of musicals and into nothing.
   */
  const unclassified = (sg: string) =>
    ["unknown", "other", "", "n/a", "misc"].includes(sg.toLowerCase().trim());

  const laneSize = new Map<string, number>();
  for (const v of votes.values()) for (const [sg, n] of v) laneSize.set(sg, (laneSize.get(sg) ?? 0) + n);
  for (const [wk, w] of ref.works) {
    const v = votes.get(wk);
    if (!v) continue;
    const named = [...v.entries()].filter(([sg]) => !unclassified(sg));
    const ballot = named.length ? named : [...v.entries()];
    let best = w.subgenre, bestN = -1, bestSize = -1;
    for (const [sg, n] of ballot) {
      const size = laneSize.get(sg) ?? 0;
      if (n > bestN
        || (n === bestN && size > bestSize)
        || (n === bestN && size === bestSize && sg.localeCompare(best) < 0)) {
        bestN = n; bestSize = size; best = sg;
      }
    }
    w.subgenre = best;
    // The world follows the lane, so the two can never point apart.
    const world = ref.subgenreWorld.get(best);
    if (world) w.world = world;
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

/**
 * An artist's albums, one entry per record, at the earliest year it carries.
 *
 * The single definition of "their albums", because two of them disagreeing is
 * a card that lies. Generation read the raw album rows and the drawing folded
 * them, so a 2026 deluxe edition of a 2024 record produced a card reading
 * "your Freddie Gibbs albums stop at 2025, this one came out in 2026" over a
 * drawing with 2024 written on it. Both read this now.
 *
 * A catalogue holds the same record several times over: an explicit and a
 * clean, a standard and an expanded, a remaster twenty years later. Three
 * tests fold them, one per case the data actually contains — the same year, an
 * edition suffix on the name, or the same songs — and what survives all three
 * is the namesake: Weezer's Blue and Green albums, one name, one artist,
 * different years, different songs, two records.
 */
export interface AlbumRecord {
  /** Every edition of this record, the fullest first. */
  ids: string[];
  name: string;
  /** The earliest year any edition of it carries. */
  year: number;
  /** Recordings the corpus has from any edition. */
  works: Set<string>;
  totalTracks: number;
}

export function albumRun(ref: Reference, artistKey: string): AlbumRecord[] {
  const a = ref.artists.get(artistKey);
  if (!a) return [];
  const own = [...a.albums.keys()].filter((aid) => {
    const alb = ref.albums.get(aid);
    return !!alb && alb.artistKey === artistKey
      && alb.albumType === "album" && alb.year !== null;
  }).sort((x, y) =>
    (ref.albums.get(y)?.works.size ?? 0) - (ref.albums.get(x)?.works.size ?? 0)
    || x.localeCompare(y));

  const out: AlbumRecord[] = [];
  for (const aid of own) {
    const alb = ref.albums.get(aid)!;
    const name = normText(alb.name);
    const raw = alb.name.trim().toLowerCase();
    const hit = out.find((r) => {
      if (normText(r.name) !== name) return false;
      if (r.year === alb.year) return true;
      if (r.name.trim().toLowerCase() !== raw) return true;
      const smaller = alb.works.size <= r.works.size ? alb.works : r.works;
      const larger = alb.works.size <= r.works.size ? r.works : alb.works;
      if (smaller.size === 0) return false;
      let shared = 0;
      for (const wk of smaller) if (larger.has(wk)) shared++;
      return shared * 2 >= smaller.size;
    });
    if (!hit) {
      out.push({
        ids: [aid], name: alb.name, year: alb.year as number,
        works: new Set(alb.works), totalTracks: alb.totalTracks,
      });
      continue;
    }
    hit.ids.push(aid);
    hit.year = Math.min(hit.year, alb.year as number);
    hit.totalTracks = Math.max(hit.totalTracks, alb.totalTracks);
    for (const wk of alb.works) hit.works.add(wk);
  }
  return out.sort((x, y) => x.year - y.year || x.name.localeCompare(y.name));
}

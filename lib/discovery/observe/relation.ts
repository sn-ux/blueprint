/**
 * The drawing at the foot of a card: this music, among the music you have.
 *
 * One language, drawn from one of two things the corpus actually holds:
 *
 *   records   covers on a dated line - the records of theirs on your shelf,
 *             and the one this card is about, sitting where it belongs
 *   artists   the artists you already keep in a scene, and the one being
 *             introduced, placed by the era of what you hold
 *
 * What the drawing contains is chosen per family, so it explains that card's
 * own sentence rather than a general fact. A card saying you have nothing by
 * J. Cole after 2021 draws his records with yours stopping and the rest
 * carrying on; a card saying somebody is on two records you own draws those
 * two records; a card about a scene draws the artists you keep in it.
 *
 * Nothing is invented. A year is the earliest year the rows give that music,
 * an item is either something the viewer holds or something this card opens,
 * and every item is a real record or a real artist with its own artwork.
 */
import { laneTitle } from "../display";
import type { Candidate } from "./candidates";
import { normText, type Reference } from "./reference";

export interface RelationItem {
  id: string;
  name: string;
  imageUrl: string | null;
  /** A record is a square, an artist is a circle. */
  shape: "square" | "circle";
  /**
   * What the viewer already has, what this card opens, and what is neither.
   *
   * "other" is the rest of the catalogue: a record by the same artist that
   * neither side holds. It is what makes a record legible as coming before or
   * after the ones you know, and without it an album card from somebody you
   * own a single track by had nothing to be placed against at all.
   */
  state: "yours" | "offered" | "other";
  year: number | null;
}

export interface Relation {
  /** What the items are. */
  /**
   * What the items are, and which of them is emphasised.
   *
   * "records" and "artists" place one thing the card is opening among things
   * the reader has. "scene" is the other way round: the roster of a subgenre,
   * with the reader's own ringed inside it, which is what a card about a
   * subgenre is actually claiming.
   */
  of: "records" | "artists" | "scene";
  /** The scene this is drawn inside, where there is one. */
  scope: string | null;
  axis: { from: number; to: number } | null;
  items: RelationItem[];
}

/**
 * Six, because the artwork has to be recognisable.
 *
 * Nine covers across a card's width leaves each of them twenty-six points,
 * which is a coloured square rather than a record you know.
 */
const MAX_ITEMS = 6;
/**
 * Five on a scene line, because each face carries a name under it.
 *
 * A name needs about as much width again as the picture it sits under, so a
 * sixth face would either clip its own label or push it into its neighbour's.
 */
const MAX_ARTISTS = 5;
/**
 * Company, rather than one neighbour.
 *
 * Two of the reader's own artists is the least that reads as a scene; below
 * that the line is a pair of faces and a gap.
 */
const MIN_PEERS = 2;
/** How much of an artist's filed work a lane must be to count as their scene. */
const MIN_SHARE = 0.3;
/** How many of the reader's own to ring on a scene roster. */
const ROSTER_YOURS = 2;
/**
 * Two marks, or there is nothing to read a position against.
 *
 * Two is enough: this record, and the one of theirs you already have, is a
 * before and an after. Below that the drawing is a single cover stating what
 * the title beside it already states.
 */
const MIN_ITEMS = 2;

/**
 * The untaxonomised part of the corpus is not a scene.
 *
 * A fifth of the rows here carry the subgenre "unknown" under the world
 * "Other" — 7,786 of them. Artists in that bucket are not peers in anything,
 * and "UNKNOWN" printed over a drawing names nothing. A card whose music lands
 * there draws its catalogue instead.
 */
const UNNAMED = /^(unknown|other|n\/a|none)$/i;

// -- shared reads -----------------------------------------------------------

const holds = (ref: Reference, wk: string, uid: string) =>
  ref.works.get(wk)?.holders.has(uid) ?? false;

/** The earliest year the rows give this recording, never a reissue's. */
const yearOfWork = (ref: Reference, wk: string) =>
  ref.works.get(wk)?.firstYear ?? null;

function coverOf(ref: Reference, works: Iterable<string>): string | null {
  for (const wk of [...works].sort()) {
    const u = ref.works.get(wk)?.row.imageUrl;
    if (u) return u;
  }
  return null;
}

function faceOf(ref: Reference, works: Iterable<string>): string | null {
  for (const wk of [...works].sort()) {
    const u = ref.works.get(wk)?.row.artistImageUrl;
    if (u) return u;
  }
  return coverOf(ref, works);
}

function median(years: number[]): number | null {
  if (years.length === 0) return null;
  const s = [...years].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

function laneOf(c: Candidate): string | null {
  const k = c.connection.kind;
  return k === "LANE_DEPTH" || k === "PERSON" ? c.connection.label : null;
}

/**
 * The scene this card's music sits in, for cards whose claim is not about one.
 *
 * An album card hangs off a record rather than a scene, so it has no lane to
 * fall back on, and an artist with one record in the corpus has no catalogue
 * to draw either. The music itself still belongs somewhere: the lane most of
 * the card's own recordings were placed in.
 */
function laneOfTracks(ref: Reference, c: Candidate): string | null {
  const n = new Map<string, number>();
  for (const wk of c.tracks) {
    const sg = ref.works.get(wk)?.subgenre;
    if (sg && !UNNAMED.test(sg)) n.set(sg, (n.get(sg) ?? 0) + 1);
  }
  const best = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : null;
}

/**
 * The scenes an artist works in, narrowest first.
 *
 * An artist's most-used tag is usually their broadest one: Playboi Carti is
 * filed under rap far more often than under rage rap, so picking the commonest
 * put him on a line with whoever else the reader keeps in rap — true, and too
 * loose to feel like a connection. The narrower the scene, the more the artists
 * either side of him actually resemble him, so his scenes are tried in order of
 * how much music the corpus has in them and the first with enough company wins.
 *
 * Read off the whole catalogue rather than off one card's payload, because a
 * fifth of the corpus is untaxonomised and the majority over a dozen
 * recordings is often "unknown" for an artist plainly filed somewhere.
 *
 * A lane has to be a real share of the artist's own filed work, not merely
 * present in it. Counting any lane with a couple of recordings put The Weeknd
 * in rage rap on the strength of three of his hundred and six, and 21 Savage
 * in afrobeats on three of a hundred and thirty. A third of what is filed is
 * the line that separates those from Playboi Carti, every one of whose fifty-two
 * recordings is rage rap — and it keeps Rapsody in neo soul at two fifths while
 * dropping the four-per-cent tails underneath it.
 *
 * The share is taken over the artist's named lanes only. Four fifths of some
 * catalogues here are untaxonomised, and measuring against that denominator
 * would leave nothing qualifying at all.
 */
function lanesOfArtist(ref: Reference, artistKey: string): string[] {
  const a = ref.artists.get(artistKey);
  if (!a) return [];
  const mine = [...a.subgenres].filter(([sg]) => !UNNAMED.test(sg));
  if (mine.length === 0) return [];
  const filed = mine.reduce((n, [, v]) => n + v, 0);
  const most = Math.max(...mine.map(([, n]) => n));
  return mine
    .filter(([, n]) => n === most || n / filed >= MIN_SHARE)
    .map(([sg]) => sg)
    .sort((x, y) =>
      (ref.subgenreWorks.get(x)?.size ?? 0) - (ref.subgenreWorks.get(y)?.size ?? 0)
      || x.localeCompare(y));
}

function artistOf(ref: Reference, c: Candidate): string | null {
  if (c.subject.kind === "artist") return c.subject.key;
  if (c.subject.kind === "album") return ref.albums.get(c.subject.key)?.artistKey ?? null;
  return null;
}

/**
 * Finish a drawing, or refuse it.
 *
 * Both sides have to be on it: something of the viewer's for the new thing to
 * be placed against, and the new thing itself. Where there are more than fit,
 * what survives is what sits nearest in time to what is being offered, because
 * the neighbours are what answer "where does this go".
 */
function settle(
  of: Relation["of"], scope: string | null, raw: RelationItem[],
): Relation | null {
  /**
   * An undated item still belongs on the drawing.
   *
   * Filtering them out took the lit item off thirty-eight scene cards and left
   * the drawing with nothing to explain. What an undated item costs is the
   * dated line, not its place: where anything lacks a year the items are
   * ordered and evenly spaced instead.
   */
  /**
   * One record, once.
   *
   * Every builder can meet the same record under two album ids, and a line
   * carrying the same cover twice reads as the artist having released it
   * twice. Same name and same year is the same record, whichever builder
   * found it; the strongest state wins, because a record the card opens is
   * what the drawing is for.
   */
  const rank = { offered: 0, yours: 1, other: 2 } as const;
  const once = new Map<string, RelationItem>();
  for (const i of raw) {
    const key = `${normText(i.name)}:${i.year ?? "?"}`;
    const hit = once.get(key);
    if (!hit || rank[i.state] < rank[hit.state]) once.set(key, i);
  }
  const items = [...once.values()].sort(
    (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.id.localeCompare(b.id));
  if (items.length === 0) return null;

  let kept = items;
  if (items.length > MAX_ITEMS) {
    const anchors = items
      .filter((i) => i.state === (of === "scene" ? "yours" : "offered"))
      .map((i) => i.year ?? 0);
    const near = (i: RelationItem) =>
      anchors.length ? Math.min(...anchors.map((y) => Math.abs((i.year ?? 0) - y))) : 0;
    const lit = of === "scene"
      ? items.filter((i) => i.state === "yours").slice(0, ROSTER_YOURS)
      : items.filter((i) => i.state === "offered").slice(0, 2);
    const rank = (i: RelationItem) => (i.state === (of === "scene" ? "other" : "yours") ? 0 : 1);
    const rest = items
      .filter((i) => !lit.includes(i))
      .sort((a, b) => rank(a) - rank(b) || near(a) - near(b) || (a.year ?? 0) - (b.year ?? 0))
      .slice(0, MAX_ITEMS - lit.length);
    kept = [...lit, ...rest].sort(
      (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.id.localeCompare(b.id));
  }

  /**
   * A drawing needs the new thing and something to place it against. What it
   * is placed against is the viewer's own where there is any, and the rest of
   * the same catalogue or scene where there is not.
   */
  /**
   * A placement needs the new thing on it; a roster has no single new thing,
   * only the reader's own ringed among the rest.
   */
  if (of !== "scene" && !kept.some((i) => i.state === "offered")) return null;
  if (of === "scene" && !kept.some((i) => i.state === "yours")) return null;
  if (kept.length < MIN_ITEMS) return null;

  const ys = kept.map((i) => i.year).filter((y): y is number => y !== null);
  const axis = ys.length === kept.length && Math.max(...ys) > Math.min(...ys)
    ? { from: Math.min(...ys), to: Math.max(...ys) } : null;
  return { of, scope, axis, items: kept };
}

// -- records ----------------------------------------------------------------

/**
 * One position per record, across every edition of it.
 *
 * A catalogue carries the same album several times: an explicit and a clean, a
 * standard and an expanded, a remaster twenty years later. Placed separately
 * they stack as two identical covers; dated separately the remaster drags the
 * record two decades forward. So editions merge on the name, and the record
 * sits at the earliest year any of them carries.
 */
interface Record {
  ids: { any: string; yours: string | null; offered: string | null };
  name: string; year: number; works: Set<string>;
  isYours: boolean; isOffered: boolean; size: number;
}

function foldEditions(
  ref: Reference, uid: string, albums: Iterable<string>,
  offeredAlbums: Set<string>, subject: string | null, own: (aid: string) => boolean,
): Record[] {
  const ids = [...albums].filter(own).sort();
  /**
   * An edition, not a namesake, told apart by what is on the record.
   *
   * Two albums whose names reduce to the same thing are sometimes one record
   * and sometimes not, and the name cannot say which. Weezer's Blue, Green and
   * White albums are all called exactly "Weezer" and are three records;
   * "The Come Up Mixtape Vol. 1" released in 2007 and re-released in 2024 is
   * one, and drawing it twice put the same cover on the line at two dates.
   *
   * What separates them is the recordings: a re-release carries the same
   * songs, a namesake carries different ones. So same-named albums fold only
   * where the smaller one's recordings are mostly on the larger.
   */
  const sameName = new Map<string, string[]>();
  for (const aid of ids) {
    const alb = ref.albums.get(aid);
    if (!alb) continue;
    const k = normText(alb.name);
    let group = sameName.get(k);
    if (!group) { group = []; sameName.set(k, group); }
    group.push(aid);
  }

  /** The group this record folds into: itself, plus any re-release of it. */
  const foldKey = new Map<string, string>();
  for (const [k, group] of sameName) {
    const sorted = [...group].sort((a, b) =>
      (ref.albums.get(b)?.works.size ?? 0) - (ref.albums.get(a)?.works.size ?? 0)
      || a.localeCompare(b));
    const roots: string[] = [];
    for (const aid of sorted) {
      const alb0 = ref.albums.get(aid);
      if (!alb0) continue;
      const mine = alb0.works;
      const myName = alb0.name.trim().toLowerCase();
      const root = roots.find((r) => {
        const alb = ref.albums.get(r);
        const theirs = alb?.works ?? new Set<string>();
        /**
         * The same year, written as an edition of it, or the same songs.
         *
         * Three tests because there are three cases, and the year settles most
         * of them: "The Recession" and "Elephant" each sit in the corpus as
         * two and three album ids with one name, one artist and one year,
         * which is one record catalogued twice. "Revolver (Super Deluxe)" is
         * plainly an edition of "Revolver" though the corpus holds different
         * tracks from each. "The Come Up Mixtape Vol. 1" re-released under the
         * identical title carries the same songs.
         *
         * What survives all three is the namesake: Weezer's Blue and Green
         * albums, one name, one artist, different years, different songs.
         */
        if ((alb?.year ?? null) === alb0.year) return true;
        if ((alb?.name.trim().toLowerCase() ?? "") !== myName) return true;
        const smaller = mine.size <= theirs.size ? mine : theirs;
        const larger = mine.size <= theirs.size ? theirs : mine;
        if (smaller.size === 0) return false;
        let shared = 0;
        for (const wk of smaller) if (larger.has(wk)) shared++;
        return shared * 2 >= smaller.size;
      });
      if (root) foldKey.set(aid, `${k}:${root}`);
      else { roots.push(aid); foldKey.set(aid, `${k}:${aid}`); }
    }
  }

  const out = new Map<string, Record>();
  for (const aid of ids) {
    const alb = ref.albums.get(aid);
    if (!alb || alb.year === null || alb.albumType !== "album") continue;
    const works = alb.works;
    const isOffered = aid === subject || offeredAlbums.has(aid);
    const isYours = [...works].some((wk) => holds(ref, wk, uid));

    const key = foldKey.get(aid) ?? `${normText(alb.name)}:${aid}`;
    const year = alb.year;
    const hit = out.get(key);
    if (!hit) {
      out.set(key, {
        ids: { any: aid, yours: isYours ? aid : null, offered: isOffered ? aid : null },
        name: alb.name, year, works: new Set(works), isYours, isOffered, size: works.size,
      });
      continue;
    }
    hit.isYours ||= isYours;
    hit.isOffered ||= isOffered;
    if (isYours && !hit.ids.yours) hit.ids.yours = aid;
    if (isOffered && !hit.ids.offered) hit.ids.offered = aid;
    for (const wk of works) hit.works.add(wk);
    /** A folded record sits at the earliest year any edition of it carries. */
    hit.year = Math.min(hit.year, year);
    if (works.size > hit.size || (works.size === hit.size && aid < hit.ids.any)) {
      hit.ids.any = aid; hit.name = alb.name; hit.size = works.size;
    }
  }
  return [...out.values()];
}

/**
 * A record you already own part of reads as yours, even when the card opens
 * more of it.
 *
 * On a "more of them" card the viewer's own tracks usually sit on the same
 * records the card is handing over, so lighting every one of them left an
 * Offset drawing with three new records and nothing of his the viewer had.
 * The exception is the record the card is *about*, which must stay lit however
 * much of it is already on the shelf — that is the whole claim of an album
 * card.
 */
const asItem = (ref: Reference, r: Record, subject: string | null): RelationItem => {
  const isSubject = subject !== null && (r.ids.offered === subject || r.ids.any === subject);
  const state: RelationItem["state"] =
    isSubject ? "offered" : r.isYours ? "yours" : r.isOffered ? "offered" : "other";
  return {
    id: (state === "offered" ? r.ids.offered : r.ids.yours) ?? r.ids.any,
    name: r.name, year: r.year, imageUrl: coverOf(ref, r.works),
    shape: "square", state,
  };
};

/**
 * An artist's records: the ones on your shelf, and the one this card is about.
 *
 * Only records they released themselves. An artist's album map is filled a row
 * at a time, so a guest verse puts the host's record into the guest's
 * catalogue, and a catalogue is what somebody released.
 */
function catalogue(
  ref: Reference, c: Candidate, uid: string, artistKey: string,
): Relation | null {
  const a = ref.artists.get(artistKey);
  if (!a) return null;
  const offeredAlbums = new Set<string>();
  for (const wk of c.tracks) {
    const aid = ref.works.get(wk)?.albumId;
    if (aid) offeredAlbums.add(aid);
  }
  const records = foldEditions(
    ref, uid, a.albums.keys(), offeredAlbums,
    c.subject.kind === "album" ? c.subject.key : null,
    (aid) => ref.albums.get(aid)?.artistKey === artistKey,
  );

  /** One cover per year per side: two records at one point is not a position. */
  const perYear = new Map<string, RelationItem & { size: number }>();
  const subject = c.subject.kind === "album" ? c.subject.key : null;
  for (const r of records) {
    const item = asItem(ref, r, subject);
    const at = `${r.year}:${item.state}`;
    const hit = perYear.get(at);
    if (hit && hit.size >= r.works.size) continue;
    perYear.set(at, { ...item, size: r.works.size });
  }
  return settle("records", null,
    [...perYear.values()].map(({ size: _s, ...i }) => i));
}

/**
 * The same shelf, drawn from recordings rather than from full-length records.
 *
 * Half of the "more of them" cards could not draw a catalogue: the viewer's
 * copies of that artist are singles, compilations and soundtrack entries, none
 * of which is a record with a release of its own. Those still have covers and
 * dates, and they are still the artist's music on this person's shelf.
 */
function shelfOfRecordings(
  ref: Reference, c: Candidate, uid: string, artistKey: string,
): Relation | null {
  const a = ref.artists.get(artistKey);
  if (!a) return null;
  const offered = new Set(c.tracks);
  const seen = new Map<string, RelationItem & { n: number }>();

  for (const wk of [...a.works].sort()) {
    const w = ref.works.get(wk);
    if (!w) continue;
    const mine = w.holders.has(uid);
    const lit = offered.has(wk);
    if (!mine && !lit) continue;
    const id = w.albumId ?? wk;
    const alb = w.albumId ? ref.albums.get(w.albumId) : null;
    const hit = seen.get(id);
    if (hit) {
      hit.n++;
      if (lit && hit.state === "yours") hit.state = "offered";
      continue;
    }
    seen.set(id, {
      id, name: alb?.name ?? w.name,
      year: alb?.year ?? yearOfWork(ref, wk),
      imageUrl: coverOf(ref, alb?.works ?? [wk]),
      shape: "square", state: lit && !mine ? "offered" : "yours", n: 1,
    });
  }
  /** The records each side has most of read as the shelf. */
  const ranked = [...seen.values()].sort((x, y) => y.n - x.n);
  const lit = ranked.filter((i) => i.state === "offered").slice(0, 2);
  const mine = ranked.filter((i) => i.state === "yours").slice(0, MAX_ITEMS - lit.length);
  return settle("records", null, [...lit, ...mine].map(({ n: _n, ...i }) => i));
}

/**
 * The records of yours this person is already on, and the records of theirs.
 *
 * A guest credit has no position in a catalogue of the viewer's, so the
 * drawing is the two shelves side by side in time: what they are already on,
 * and what of their own this card opens.
 */
function appearances(ref: Reference, c: Candidate, uid: string): Relation | null {
  const offered = new Set(c.tracks);
  const hosts = c.footprint.filter((wk) => !offered.has(wk) && holds(ref, wk, uid));
  if (hosts.length === 0) return null;

  const items = new Map<string, RelationItem>();
  for (const wk of hosts) {
    const w = ref.works.get(wk);
    if (!w) continue;
    const aid = w.albumId;
    const alb = aid ? ref.albums.get(aid) : null;
    const id = aid ?? wk;
    items.set(id, {
      id, name: alb?.name ?? w.name, year: alb?.year ?? yearOfWork(ref, wk),
      imageUrl: coverOf(ref, alb?.works ?? [wk]), shape: "square", state: "yours",
    });
  }
  for (const wk of c.tracks) {
    const w = ref.works.get(wk);
    if (!w) continue;
    const aid = w.albumId;
    const alb = aid ? ref.albums.get(aid) : null;
    const id = aid ?? wk;
    if (items.has(id)) continue;
    items.set(id, {
      id, name: alb?.name ?? w.name, year: alb?.year ?? yearOfWork(ref, wk),
      imageUrl: coverOf(ref, alb?.works ?? [wk]), shape: "square", state: "offered",
    });
  }
  return settle("records", null, [...items.values()]);
}

/**
 * Your records in a scene, and the ones this card opens inside it.
 *
 * What a card about a year of a scene is claiming: here is the run of it you
 * keep, and here is the part of it that passed you by.
 */
function sceneRecords(
  ref: Reference, c: Candidate, uid: string, lane: string,
): Relation | null {
  const works = ref.subgenreWorks.get(lane);
  if (!works) return null;

  const mine = new Map<string, { works: Set<string>; year: number | null; name: string }>();
  for (const wk of [...works].sort()) {
    const w = ref.works.get(wk);
    if (!w || !w.holders.has(uid)) continue;
    const aid = w.albumId;
    const id = aid ?? wk;
    const alb = aid ? ref.albums.get(aid) : null;
    const hit = mine.get(id);
    if (hit) { hit.works.add(wk); continue; }
    mine.set(id, {
      works: new Set([wk]), name: alb?.name ?? w.name,
      year: alb?.year ?? yearOfWork(ref, wk),
    });
  }

  const offered = new Map<string, { works: Set<string>; year: number | null; name: string }>();
  for (const wk of c.tracks) {
    const w = ref.works.get(wk);
    if (!w) continue;
    const aid = w.albumId;
    const id = aid ?? wk;
    const alb = aid ? ref.albums.get(aid) : null;
    const hit = offered.get(id);
    if (hit) { hit.works.add(wk); continue; }
    offered.set(id, {
      works: new Set([wk]), name: alb?.name ?? w.name,
      year: alb?.year ?? yearOfWork(ref, wk),
    });
  }

  /** The records of theirs the viewer keeps most of read as their own shelf. */
  const yours = [...mine]
    .filter(([id]) => !offered.has(id))
    .sort((a, b) => b[1].works.size - a[1].works.size || a[0].localeCompare(b[0]))
    .slice(0, MAX_ITEMS);
  const lit = [...offered]
    .sort((a, b) => b[1].works.size - a[1].works.size || a[0].localeCompare(b[0]))
    .slice(0, 2);

  const items: RelationItem[] = [
    ...yours.map(([id, v]) => ({
      id, name: v.name, year: v.year, imageUrl: coverOf(ref, v.works),
      shape: "square" as const, state: "yours" as const,
    })),
    ...lit.map(([id, v]) => ({
      id, name: v.name, year: v.year, imageUrl: coverOf(ref, v.works),
      shape: "square" as const, state: "offered" as const,
    })),
  ];
  return settle("records", laneTitle(lane), items);
}

// -- artists ----------------------------------------------------------------

/**
 * Every recording in a genre, as one set.
 *
 * A subgenre can be too narrow to place anybody in: 47 artist cards had a
 * reader holding the card's artist and not one other artist in their
 * subgenre — Tame Impala with no other neo-psychedelic act on the shelf. The
 * genre above it is where their peers actually are, so the drawing widens to
 * it rather than falling back to a row of the artist's own covers.
 *
 * Built once per corpus and per genre, because unioning a genre's subgenres
 * is a pass over thousands of recordings and several hundred cards may ask.
 */
const WORLDS = new WeakMap<Reference, Map<string, Set<string>>>();

function worldWorks(ref: Reference, world: string): Set<string> {
  let per = WORLDS.get(ref);
  if (!per) { per = new Map(); WORLDS.set(ref, per); }
  const hit = per.get(world);
  if (hit) return hit;
  const out = new Set<string>();
  for (const [lane, w] of ref.subgenreWorld) {
    if (w !== world) continue;
    for (const wk of ref.subgenreWorks.get(lane) ?? []) out.add(wk);
  }
  per.set(world, out);
  return out;
}

/**
 * The artists you already keep in a scene, and the one being introduced.
 *
 * Placed by the era of the music rather than by how much of each you have,
 * because a scene reads as a period as much as a sound. An artist already on
 * the shelf is not an introduction, so only somebody the viewer keeps nothing
 * of here can be the lit one.
 */
function sceneArtists(
  ref: Reference, c: Candidate, uid: string, lane: string,
  pool?: Set<string>, label?: string,
): Relation | null {
  const works = pool ?? ref.subgenreWorks.get(lane);
  if (!works) return null;

  const mine = new Map<string, { works: Set<string>; years: number[] }>();
  const laneYears = new Map<string, number[]>();
  for (const wk of [...works].sort()) {
    const w = ref.works.get(wk);
    if (!w) continue;
    const y = yearOfWork(ref, wk);
    if (y !== null) (laneYears.get(w.artistKey) ?? laneYears.set(w.artistKey, []).get(w.artistKey))!.push(y);
    if (!w.holders.has(uid)) continue;
    const hit = mine.get(w.artistKey);
    if (hit) { hit.works.add(wk); if (y !== null) hit.years.push(y); continue; }
    mine.set(w.artistKey, { works: new Set([wk]), years: y !== null ? [y] : [] });
  }

  const offered = new Map<string, number>();
  for (const wk of c.tracks) {
    const ak = ref.works.get(wk)?.artistKey;
    if (ak) offered.set(ak, (offered.get(ak) ?? 0) + 1);
  }
  /**
   * What the drawing lights, which is not the same question on both kinds of card.
   *
   * An artist card is about one artist, so that artist is lit whether or not
   * the reader already holds some of them: "you have three of theirs and there
   * are thirty more" is a card about that artist, and the drawing has to say
   * which one.
   *
   * A scene card is about a scene, and its lead is drawn from whatever it
   * happens to be handing over. There, an artist already on the shelf is not
   * an introduction — this marked Drake as new to somebody holding thirty-six
   * of his tracks — so only an artist the reader keeps nothing of here can be
   * the lit one.
   */
  const lead = c.subject.kind === "artist"
    ? [c.subject.key]
    : [...offered]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([ak]) => ak)
        .filter((ak) => !mine.has(ak))
        .slice(0, 2);
  if (lead.length === 0) return null;

  const items: RelationItem[] = [];
  for (const ak of lead) {
    const a = ref.artists.get(ak);
    if (!a) continue;
    items.push({
      id: ak, name: a.name, shape: "circle", state: "offered",
      imageUrl: faceOf(ref, a.works), year: median(laneYears.get(ak) ?? []),
    });
  }
  /**
   * Peers either side of the lit artist, nearest in time first.
   *
   * Taking the peers the reader holds most of put them all on one side: a
   * Playboi Carti line ran one artist before him and four after, which reads
   * as the end of a scene rather than a place in it. Drawing alternately from
   * before and after puts him between them, and where a side is genuinely
   * empty — the earliest artist in a scene has nobody before them — the other
   * side fills the space rather than a gap being invented.
   */
  const anchor = items[0]?.year ?? null;
  const peers = [...mine]
    .filter(([ak]) => !lead.includes(ak))
    .map(([ak, v]) => ({
      id: ak, name: ref.artists.get(ak)?.name ?? ak, shape: "circle" as const,
      state: "yours" as const,
      imageUrl: faceOf(ref, ref.artists.get(ak)?.works ?? v.works),
      /**
       * Every face on the line is dated the same way: the middle year of that
       * artist's work in this scene, across the corpus.
       *
       * Dating the peers by the reader's own copies and the lit artist by the
       * whole corpus put two measures on one axis, and it showed — the lit
       * artist landed systematically early, so 476 of 778 lines had every peer
       * on one side of them.
       */
      year: median(laneYears.get(ak) ?? v.years),
      /** Ties break on how much of them the reader keeps. */
      held: v.works.size,
    }));

  const gap = (p: { year: number | null }) =>
    p.year === null || anchor === null ? Number.MAX_SAFE_INTEGER : Math.abs(p.year - anchor);
  const byNearest = (a: typeof peers[number], b: typeof peers[number]) =>
    gap(a) - gap(b) || b.held - a.held || a.id.localeCompare(b.id);
  const dated = (p: { year: number | null }) => p.year !== null && anchor !== null;
  const before = peers.filter((p) => dated(p) && p.year! < anchor!).sort(byNearest);
  const after = peers.filter((p) => dated(p) && p.year! > anchor!).sort(byNearest);
  /** Same year as the lit artist, or undated: neither side, so they fill. */
  const level = peers
    .filter((p) => !dated(p) || p.year === anchor).sort(byNearest);

  const room = MAX_ARTISTS - items.length;
  const picked: typeof peers = [];
  while (picked.length < room && (before.length || after.length)) {
    if (before.length) picked.push(before.shift()!);
    if (picked.length < room && after.length) picked.push(after.shift()!);
  }
  for (const p of level) { if (picked.length >= room) break; picked.push(p); }
  for (const { held: _held, ...item } of picked) items.push(item);
  return settle("artists", label ?? laneTitle(lane), items);
}

/**
 * The roster of a scene, with the reader's own ringed inside it.
 *
 * A subgenre card is not about one artist, so nothing on it should be lit as
 * though it were. What it is about is a body of music and how much of it this
 * reader has: the artists people here keep in that scene, laid out by era, and
 * the reader's own circled among them.
 *
 * "People here keep" is counted in libraries rather than in recordings, so the
 * roster is who the corpus actually likes rather than who happens to have the
 * most tracks in it.
 */
function sceneRoster(
  ref: Reference, c: Candidate, uid: string, lane: string,
): Relation | null {
  const works = ref.subgenreWorks.get(lane);
  if (!works) return null;

  const who = new Map<string, {
    works: Set<string>; years: number[]; holders: Set<string>; mine: boolean;
  }>();
  for (const wk of [...works].sort()) {
    const w = ref.works.get(wk);
    if (!w) continue;
    let a = who.get(w.artistKey);
    if (!a) {
      a = { works: new Set(), years: [], holders: new Set(), mine: false };
      who.set(w.artistKey, a);
    }
    a.works.add(wk);
    const y = yearOfWork(ref, wk);
    if (y !== null) a.years.push(y);
    for (const h of w.holders) a.holders.add(h);
    if (w.holders.has(uid)) a.mine = true;
  }

  const liked = (x: [string, { holders: Set<string>; works: Set<string> }],
                 y: [string, { holders: Set<string>; works: Set<string> }]) =>
    y[1].holders.size - x[1].holders.size
    || y[1].works.size - x[1].works.size
    || x[0].localeCompare(y[0]);

  const all = [...who];
  const ringed = all.filter(([, a]) => a.mine).sort(liked).slice(0, ROSTER_YOURS);
  const rest = all.filter(([, a]) => !a.mine).sort(liked)
    .slice(0, MAX_ARTISTS - ringed.length);
  if (ringed.length === 0 || rest.length === 0) return null;

  const items: RelationItem[] = [...ringed, ...rest].map(([ak, a]) => ({
    id: ak,
    name: ref.artists.get(ak)?.name ?? ak,
    shape: "circle" as const,
    /** Ringed for the reader's own; the rest of the roster is context. */
    state: a.mine ? ("yours" as const) : ("other" as const),
    imageUrl: faceOf(ref, ref.artists.get(ak)?.works ?? a.works),
    year: median(a.years),
  }));
  return settle("scene", laneTitle(lane), items);
}

// -- what each card draws ---------------------------------------------------

/**
 * The drawing this card's own sentence needs, then what to fall back to.
 *
 * Read in order, first the data supports wins. A card whose claim is about a
 * catalogue draws that catalogue; one whose claim is about a scene draws the
 * scene; one about somebody already on your records draws those records.
 */
export function buildRelation(
  ref: Reference, c: Candidate, uid: string,
): Relation | null {
  const artistKey = artistOf(ref, c);
  /**
   * An artist card is placed in the artist's own scene; anything else is
   * placed in the scene of the music it is handing over.
   */
  const lanes = artistKey ? lanesOfArtist(ref, artistKey) : [];
  const lane = laneOf(c) ?? lanes[0] ?? laneOfTracks(ref, c);

  const shelf = () => artistKey ? catalogue(ref, c, uid, artistKey) : null;
  const shelfAll = () => artistKey ? shelfOfRecordings(ref, c, uid, artistKey) : null;
  const guest = () => appearances(ref, c, uid);
  const named = lane !== null && !UNNAMED.test(lane);
  const inLane = () => named ? sceneArtists(ref, c, uid, lane!) : null;

  /**
   * Somebody either side, which is what makes it a place rather than an end.
   *
   * A scene can be too narrow to have both: the reader keeps no
   * neo-psychedelic act earlier than Tame Impala and no alternative R&B act
   * later than KAYTRANADA, so a quarter of these lines ran off one edge. The
   * genre above usually has both, so where the subgenre cannot put anybody on
   * one side the whole drawing moves up a scope rather than borrowing a face
   * from a scene the label does not name.
   */
  const twoSided = (r: Relation | null): boolean => {
    if (!r) return false;
    const lit = r.items.find((i) => i.state === "offered");
    if (!lit || lit.year === null) return false;
    const side = (f: (y: number) => boolean) =>
      r.items.some((i) => i.state === "yours" && i.year !== null && f(i.year));
    return side((y) => y < lit.year!) && side((y) => y > lit.year!);
  };

  const wider = () => {
    const world = lane ? ref.subgenreWorld.get(lane) : null;
    if (!world || !lane || UNNAMED.test(world)) return null;
    return sceneArtists(ref, c, uid, lane, worldWorks(ref, world), laneTitle(world));
  };
  /** How many of the reader's own artists a drawing managed to put up. */
  const peers = (r: Relation | null) =>
    r ? r.items.filter((i) => i.state === "yours").length : 0;

  /**
   * The narrowest scene with enough company in it.
   *
   * Tried smallest first: the first scene that puts somebody either side of the
   * artist, with a couple of the reader's own around them, is the one drawn. A
   * scene too thin for this particular reader is passed over however apt its
   * name, and the search widens through the artist's broader tags and then to
   * the genre above them.
   */
  const scene = () => {
    let best: Relation | null = null;
    for (const l of lanes.length ? lanes : named ? [lane!] : []) {
      const r = sceneArtists(ref, c, uid, l);
      if (twoSided(r) && peers(r) >= MIN_PEERS) return r;
      if (!best && r) best = r;
    }
    const above = wider();
    if (twoSided(above) && peers(above) >= MIN_PEERS) return above;
    return best ?? inLane() ?? above;
  };
  /** The genre above the subgenre, where a subgenre holds no peers at all. */
  const roster = () => named ? sceneRoster(ref, c, uid, lane!) : null;
  const inScene = () => named ? sceneRecords(ref, c, uid, lane!) : null;

  const chain: (() => Relation | null)[] =
    // a record, placed among the records of theirs you keep
    c.family === "FINISH_THE_RECORD" || c.family === "YOU_HAVE_THE_HITS"
    || c.family === "THE_RECORD_YOU_SKIPPED" || c.family === "ONE_RECORD_LEFT"
      ? [shelf, shelfAll, scene, inScene]
    /**
     * An artist card draws the scene it sits in, among the artists the reader
     * keeps there, with the one the card is about lit between them.
     *
     * Not its discography. A row of that artist's own covers says what the
     * title beside it already says; where they fall among the artists this
     * reader already likes is the thing the card cannot state in a sentence.
     * The catalogue stays the drawing for a card about a record.
     */
    : c.family === "DEEPER_ON_AN_ARTIST" || c.family === "SINCE_YOU_STOPPED"
    || c.family === "BEFORE_YOU_ARRIVED" || c.family === "GUEST_ON_YOUR_RECORDS"
      ? [scene, wider, shelf, shelfAll, inScene]
    // a year of a scene that passed you by
    : c.family === "A_YEAR_IN_YOUR_LANE" ? [inScene, scene, shelf]
    /**
     * A subgenre card draws the scene's roster: the artists people here keep
     * in it, by era, with the reader's own ringed inside it. Neither its
     * records nor one lit newcomer — the card is about the body of music.
     */
    : c.family === "A_SCENE_YOU_TOUCHED" ? [roster, inScene, scene]
    : c.family === "WHAT_THEY_HAVE" ? [roster, scene, inScene]
    // an artist inside a scene you already keep
    : [scene, wider, shelf, shelfAll, inScene];

  for (const attempt of chain) {
    const r = attempt();
    if (r) return r;
  }
  return null;
}

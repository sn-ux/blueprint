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
  of: "records" | "artists";
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
 * Two marks, or there is nothing to read a position against.
 *
 * Two is enough: this record, and the one of theirs you already have, is a
 * before and an after. Below that the drawing is a single cover stating what
 * the title beside it already states.
 */
const MIN_ITEMS = 2;

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
    if (sg) n.set(sg, (n.get(sg) ?? 0) + 1);
  }
  const best = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : null;
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
  const items = [...raw].sort(
    (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.id.localeCompare(b.id));
  if (items.length === 0) return null;

  let kept = items;
  if (items.length > MAX_ITEMS) {
    const anchors = items.filter((i) => i.state === "offered").map((i) => i.year ?? 0);
    const near = (i: RelationItem) =>
      anchors.length ? Math.min(...anchors.map((y) => Math.abs((i.year ?? 0) - y))) : 0;
    const lit = items.filter((i) => i.state === "offered").slice(0, 2);
    const rank = (i: RelationItem) => (i.state === "yours" ? 0 : 1);
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
  if (!kept.some((i) => i.state === "offered")) return null;
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
  const firstYear = new Map<string, number>();
  for (const aid of ids) {
    const alb = ref.albums.get(aid);
    if (!alb || alb.year === null || alb.albumType !== "album") continue;
    const k = normText(alb.name);
    const at = firstYear.get(k);
    if (at === undefined || alb.year < at) firstYear.set(k, alb.year);
  }


  /**
   * An edition, not a namesake.
   *
   * Two albums whose names reduce to the same thing are the same record only
   * when one of them is written as an edition of it: "Smoke + Mirrors" and
   * "Smoke + Mirrors (Deluxe)" are one record, and folding them stops a
   * remaster dragging it twenty years forward. Weezer's Blue, Green and White
   * albums are all called exactly "Weezer" and are three records; folding
   * those put 1994, 2001 and 2016 under one cover dated 1994.
   *
   * So a fold needs the raw names to differ, or the years to agree — which is
   * the duplicate-pressing case it also has to catch.
   */
  const bare = new Map<string, Set<string>>();
  for (const aid of ids) {
    const alb = ref.albums.get(aid);
    if (!alb) continue;
    const k = normText(alb.name);
    let names = bare.get(k);
    if (!names) { names = new Set(); bare.set(k, names); }
    names.add(alb.name.trim().toLowerCase());
  }
  const namesakes = (k: string) => (bare.get(k)?.size ?? 0) === 1;

  const out = new Map<string, Record>();
  for (const aid of ids) {
    const alb = ref.albums.get(aid);
    if (!alb || alb.year === null || alb.albumType !== "album") continue;
    const works = alb.works;
    const isOffered = aid === subject || offeredAlbums.has(aid);
    const isYours = [...works].some((wk) => holds(ref, wk, uid));

    const name = normText(alb.name);
    const folds = !namesakes(name);
    const key = folds ? name : `${name}:${alb.year}`;
    const year = folds ? (firstYear.get(name) ?? alb.year) : alb.year;
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
 * The artists you already keep in a scene, and the one being introduced.
 *
 * Placed by the era of the music rather than by how much of each you have,
 * because a scene reads as a period as much as a sound. An artist already on
 * the shelf is not an introduction, so only somebody the viewer keeps nothing
 * of here can be the lit one.
 */
function sceneArtists(
  ref: Reference, c: Candidate, uid: string, lane: string,
): Relation | null {
  const works = ref.subgenreWorks.get(lane);
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
  const lead = (c.subject.kind === "artist" ? [c.subject.key]
    : [...offered].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([ak]) => ak))
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
  for (const [ak, v] of [...mine]
    .sort((a, b) => b[1].works.size - a[1].works.size || a[0].localeCompare(b[0]))
    .slice(0, MAX_ITEMS)) {
    items.push({
      id: ak, name: ref.artists.get(ak)?.name ?? ak, shape: "circle", state: "yours",
      imageUrl: faceOf(ref, ref.artists.get(ak)?.works ?? v.works), year: median(v.years),
    });
  }
  return settle("artists", laneTitle(lane), items);
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
  const lane = laneOf(c) ?? laneOfTracks(ref, c);

  const shelf = () => artistKey ? catalogue(ref, c, uid, artistKey) : null;
  const shelfAll = () => artistKey ? shelfOfRecordings(ref, c, uid, artistKey) : null;
  const guest = () => appearances(ref, c, uid);
  const scene = () => lane ? sceneArtists(ref, c, uid, lane) : null;
  const inScene = () => lane ? sceneRecords(ref, c, uid, lane) : null;

  const chain: (() => Relation | null)[] =
    // a record, placed among the records of theirs you keep
    c.family === "FINISH_THE_RECORD" || c.family === "YOU_HAVE_THE_HITS"
    || c.family === "THE_RECORD_YOU_SKIPPED" || c.family === "ONE_RECORD_LEFT"
      ? [shelf, shelfAll, scene, inScene]
    // a catalogue you are already into, and where yours stops or starts
    : c.family === "DEEPER_ON_AN_ARTIST" || c.family === "SINCE_YOU_STOPPED"
    || c.family === "BEFORE_YOU_ARRIVED"
      ? [shelf, shelfAll, scene, inScene]
    // somebody already on records you own
    : c.family === "GUEST_ON_YOUR_RECORDS" ? [guest, shelfAll, scene]
    // a year of a scene that passed you by
    : c.family === "A_YEAR_IN_YOUR_LANE" ? [inScene, scene, shelf]
    // a scene you have barely entered: your few records in it are the anchor
    : c.family === "A_SCENE_YOU_TOUCHED" ? [inScene, scene]
    // an artist inside a scene you already keep
    : [scene, shelf, shelfAll, inScene];

  for (const attempt of chain) {
    const r = attempt();
    if (r) return r;
  }
  return null;
}

/**
 * The drawing at the foot of a card: how this music touches the library.
 *
 * A card's sentence says what is being offered. The drawing says why it is in
 * front of you and where it sits, in artwork you already recognise: the
 * records of theirs on your shelf, the part of this one you have, the records
 * of yours this person is already singing on, your corner of a scene.
 *
 * A relation has a shape, and the shape is not always a line in time. Four
 * drawings cover what the data supports:
 *
 *   chronology  records or years on a dated line, yours and the new one
 *   fill        a set, the share of it you hold, and the share this opens
 *   hub         one subject, and the records of yours it is already on
 *   neighbours  the artists you keep in a scene, and the one being introduced
 *
 * Every family names the drawing its relation actually has, with a fallback,
 * so every card carries one. Nothing is invented: a year is a year the rows
 * carry, a count is a count of real recordings, and an item is either music
 * the viewer holds or music this card hands over.
 *
 * The one date this cannot fix is a reissue's. A record is placed at the
 * earliest year any edition of it carries, which puts a remaster back on its
 * own release; a recording whose only copy here is a remastered pressing still
 * carries that pressing's date.
 */
import type { PersonRow } from "../types";
import { laneTitle } from "../display";
import type { Candidate } from "./candidates";
import { normText, type Reference } from "./reference";

export type RelationKind = "chronology" | "fill" | "hub" | "neighbours";

export interface RelationItem {
  id: string;
  name: string;
  imageUrl: string | null;
  /** A record is a square, a person is a circle. */
  shape: "square" | "circle";
  /** What the viewer already has, against what this card opens. */
  state: "yours" | "offered";
  /** Drawn under the item where the drawing is dated. */
  year: number | null;
}

export interface Relation {
  kind: RelationKind;
  /** The relation in words, under the drawing. */
  caption: string;
  /** A dated drawing's span. */
  axis: { from: number; to: number } | null;
  /** A fill drawing's set: recordings, not items. */
  share: { yours: number; offered: number; total: number } | null;
  items: RelationItem[];
}

/** Past this the artwork is too small to recognise at a card's width. */
const MAX_ITEMS = 9;
/** A drawing of the viewer's own things needs at least this many to read. */
const MIN_YOURS = 2;
/** Covers shown beside a fill bar, so the set is a thing and not a number. */
const MAX_FACES = 4;

// -- shared reads -----------------------------------------------------------

const holds = (ref: Reference, wk: string, uid: string) =>
  ref.works.get(wk)?.holders.has(uid) ?? false;

/** First cover in a fixed order, so the same set always shows the same one. */
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

const plural = (n: number, one: string, many = `${one}s`) => n === 1 ? one : many;

/** The lane a card hangs off, when it hangs off one. */
function laneOf(c: Candidate): string | null {
  const k = c.connection.kind;
  return k === "LANE_DEPTH" || k === "PERSON" ? c.connection.label : null;
}

/** The artist whose catalogue this card sits inside, if any. */
function artistOf(ref: Reference, c: Candidate): string | null {
  if (c.subject.kind === "artist") return c.subject.key;
  if (c.subject.kind === "album") return ref.albums.get(c.subject.key)?.artistKey ?? null;
  return null;
}

// -- chronology -------------------------------------------------------------

/**
 * An artist's records, in release order.
 *
 * Only full-length records they released themselves. An artist's album map is
 * filled a row at a time, so one guest verse puts the host's record into the
 * guest's catalogue, and a catalogue is what somebody released rather than
 * what they turned up on.
 */
function artistChronology(
  ref: Reference, c: Candidate, uid: string, artistKey: string,
): Relation | null {
  const a = ref.artists.get(artistKey);
  if (!a) return null;
  const own = (aid: string) => ref.albums.get(aid)?.artistKey === artistKey;
  const offered = new Set<string>();
  for (const wk of c.tracks) {
    const aid = ref.works.get(wk)?.albumId;
    if (aid) offered.add(aid);
  }
  const subject = c.subject.kind === "album" ? c.subject.key : null;

  /**
   * When a record came out, across every edition of it the corpus has, read
   * before anything is filtered: the edition carrying the original date is
   * often one neither side holds.
   */
  const firstYear = new Map<string, number>();
  for (const aid of a.albums.keys()) {
    if (!own(aid)) continue;
    const alb = ref.albums.get(aid);
    if (!alb || alb.year === null || alb.albumType !== "album") continue;
    const k = normText(alb.name);
    const at = firstYear.get(k);
    if (at === undefined || alb.year < at) firstYear.set(k, alb.year);
  }

  const records = new Map<string, {
    ids: { any: string; yours: string | null; offered: string | null };
    name: string; year: number; works: Set<string>;
    isOffered: boolean; isYours: boolean; size: number;
  }>();

  for (const aid of [...a.albums.keys()].sort()) {
    if (!own(aid)) continue;
    const alb = ref.albums.get(aid);
    if (!alb || alb.year === null || alb.albumType !== "album") continue;
    const works = a.albums.get(aid) ?? new Set<string>();
    const isOffered = aid === subject || offered.has(aid);
    const isYours = [...works].some((wk) => holds(ref, wk, uid));
    if (!isOffered && !isYours) continue;

    const key = normText(alb.name);
    const year = firstYear.get(key) ?? alb.year;
    const hit = records.get(key);
    if (!hit) {
      records.set(key, {
        ids: { any: aid, yours: isYours ? aid : null, offered: isOffered ? aid : null },
        name: alb.name, year, works: new Set(works),
        isOffered, isYours, size: works.size,
      });
      continue;
    }
    hit.isOffered ||= isOffered;
    hit.isYours ||= isYours;
    /** An id has to name a pressing that is doing what the item claims. */
    if (isYours && !hit.ids.yours) hit.ids.yours = aid;
    if (isOffered && !hit.ids.offered) hit.ids.offered = aid;
    for (const wk of works) hit.works.add(wk);
    hit.year = Math.min(hit.year, year);
    if (works.size > hit.size || (works.size === hit.size && aid < hit.ids.any)) {
      hit.ids.any = aid; hit.name = alb.name; hit.size = works.size;
    }
  }

  /** One cover per year per side: two records at one point is not a position. */
  const perYear = new Map<string, RelationItem & { size: number }>();
  for (const r of records.values()) {
    const state: RelationItem["state"] = r.isOffered ? "offered" : "yours";
    const at = `${r.year}:${state}`;
    const hit = perYear.get(at);
    if (hit && hit.size >= r.works.size) continue;
    perYear.set(at, {
      id: (state === "offered" ? r.ids.offered : r.ids.yours) ?? r.ids.any,
      name: r.name, year: r.year, imageUrl: coverOf(ref, r.works),
      shape: "square", state, size: r.works.size,
    });
  }

  const items = trim([...perYear.values()].map(({ size: _s, ...i }) => i));
  const yours = items.filter((i) => i.state === "yours").length;
  if (yours < MIN_YOURS || items.length - yours < 1) return null;
  const years = new Set(items.map((i) => i.year as number));
  if (years.size < 3) return null;
  const from = items[0].year as number;
  const to = items[items.length - 1].year as number;
  if (to - from < 2) return null;

  return {
    kind: "chronology",
    caption: `${yours} ${plural(yours, "record")} of theirs you keep`,
    axis: { from, to }, share: null, items,
  };
}

/** The years of a scene the viewer holds, and the one this card is about. */
function laneChronology(
  ref: Reference, c: Candidate, uid: string, lane: string,
): Relation | null {
  const works = ref.subgenreWorks.get(lane);
  if (!works) return null;
  const cut = c.subject.key.lastIndexOf(":");
  const target = cut < 0 ? NaN : Number(c.subject.key.slice(cut + 1));
  if (!Number.isInteger(target)) return null;

  const mine = new Map<number, Set<string>>();
  for (const wk of [...works].sort()) {
    const w = ref.works.get(wk);
    if (!w || w.year === null || !w.holders.has(uid)) continue;
    const set = mine.get(w.year) ?? new Set<string>();
    set.add(wk); mine.set(w.year, set);
  }

  const items: RelationItem[] = [];
  for (const [year, wks] of [...mine].sort((a, b) => a[0] - b[0])) {
    if (year === target) continue;
    items.push({ id: `y${year}`, name: String(year), year,
      imageUrl: coverOf(ref, wks), shape: "square", state: "yours" });
  }
  items.push({ id: `y${target}`, name: String(target), year: target,
    imageUrl: coverOf(ref, c.tracks), shape: "square", state: "offered" });

  const kept = trim(items.sort((a, b) => (a.year as number) - (b.year as number)));
  const yours = kept.filter((i) => i.state === "yours").length;
  if (yours < MIN_YOURS) return null;
  const from = kept[0].year as number;
  const to = kept[kept.length - 1].year as number;
  if (to - from < 2) return null;

  return {
    kind: "chronology",
    caption: `${yours} ${plural(yours, "year")} of ${laneTitle(lane).toLowerCase()} you keep`,
    axis: { from, to }, share: null, items: kept,
  };
}

// -- fill -------------------------------------------------------------------

/**
 * A set, the part of it the viewer holds, and the part this card opens.
 *
 * The drawing that answers "where does this fit" for a record: four of twelve
 * filled, the other eight being handed over. The counts are recordings rather
 * than drawn items, so a forty-track catalogue states forty.
 */
function fill(ref: Reference, c: Candidate, uid: string): Relation | null {
  let total = 0, yours = 0, of = "";
  let art: Iterable<string> = c.tracks;
  let shape: RelationItem["shape"] = "square";

  if (c.subject.kind === "album") {
    const alb = ref.albums.get(c.subject.key);
    if (!alb) return null;
    const works = alb.works;
    total = Math.max(alb.totalTracks || 0, works.size);
    yours = [...works].filter((wk) => holds(ref, wk, uid)).length;
    of = `its ${total} tracks`;
    art = works;
  } else if (c.subject.kind === "artist") {
    const a = ref.artists.get(c.subject.key);
    if (!a) return null;
    total = a.works.size;
    yours = a.worksByUser.get(uid)?.size ?? 0;
    of = `their ${total} here`;
    art = a.works;
    shape = "circle";
  } else {
    const lane = laneOf(c);
    const works = lane ? ref.subgenreWorks.get(lane) : null;
    if (!works) return null;
    total = works.size;
    yours = [...works].filter((wk) => holds(ref, wk, uid)).length;
    of = `${total} in ${laneTitle(lane!).toLowerCase()}`;
    art = works;
  }

  const offered = Math.min(c.available, Math.max(0, total - yours));
  if (total <= 0 || offered <= 0) return null;

  /** The subject, then a few of the recordings being handed over. */
  const items: RelationItem[] = [{
    id: `subject:${c.subject.key}`, name: c.subject.label,
    imageUrl: shape === "circle" ? faceOf(ref, art) : coverOf(ref, art),
    shape, state: "yours", year: null,
  }];
  const seen = new Set<string>();
  for (const wk of c.tracks) {
    if (items.length > MAX_FACES) break;
    const w = ref.works.get(wk);
    const key = w?.albumId ?? wk;
    if (!w || seen.has(key)) continue;
    seen.add(key);
    items.push({ id: key, name: w.name, imageUrl: w.row.imageUrl ?? null,
      shape: "square", state: "offered", year: w.year });
  }

  return {
    kind: "fill",
    caption: yours > 0 ? `You have ${yours} of ${of}` : `This opens ${offered} of ${of}`,
    axis: null, share: { yours, offered, total }, items,
  };
}

// -- hub --------------------------------------------------------------------

/**
 * One subject, and the records of the viewer's it is already on.
 *
 * A guest credit is the strongest connection in the system that is neither a
 * record nor an artist: this person is literally singing on music the listener
 * chose. A line in time says nothing about that; the records do.
 *
 * The host recordings are the part of the candidate's footprint that is not
 * its own payload, which is where the family put them.
 */
function hub(ref: Reference, c: Candidate, uid: string): Relation | null {
  const offered = new Set(c.tracks);
  const hosts = c.footprint.filter((wk) => !offered.has(wk) && holds(ref, wk, uid));
  if (hosts.length < 1) return null;

  const byAlbum = new Map<string, Set<string>>();
  for (const wk of hosts) {
    const w = ref.works.get(wk);
    if (!w) continue;
    const key = w.albumId ?? wk;
    const set = byAlbum.get(key) ?? new Set<string>();
    set.add(wk); byAlbum.set(key, set);
  }

  const items: RelationItem[] = [{
    id: `subject:${c.subject.key}`, name: c.subject.label,
    imageUrl: faceOf(ref, ref.artists.get(c.subject.key)?.works ?? c.tracks),
    shape: "circle", state: "offered", year: null,
  }];
  for (const [key, wks] of [...byAlbum].sort()) {
    if (items.length > MAX_ITEMS) break;
    const w = ref.works.get([...wks][0]);
    items.push({
      id: key, name: ref.albums.get(key)?.name ?? w?.name ?? "",
      imageUrl: coverOf(ref, wks), shape: "square", state: "yours",
      year: ref.albums.get(key)?.year ?? w?.year ?? null,
    });
  }
  const n = items.length - 1;
  return {
    kind: "hub",
    caption: `On ${n} ${plural(n, "record")} you own`,
    axis: null, share: null, items,
  };
}

/** The people who hold this, when the relation is that everyone here does. */
function peopleHub(
  ref: Reference, c: Candidate, people: Map<string, PersonRow>,
): Relation | null {
  if (c.holders.length < 1) return null;
  const items: RelationItem[] = [{
    id: `subject:${c.subject.key}`, name: c.subject.label,
    imageUrl: faceOf(ref, ref.artists.get(c.subject.key)?.works ?? c.tracks),
    shape: "circle", state: "offered", year: null,
  }];
  for (const h of c.holders.slice(0, MAX_ITEMS)) {
    const p = people.get(h.uid);
    items.push({ id: h.uid, name: p?.name ?? "Someone", imageUrl: p?.image ?? null,
      shape: "circle", state: "yours", year: null });
  }
  const n = items.length - 1;
  return {
    kind: "hub",
    caption: `${n} ${plural(n, "library")} here ${n === 1 ? "has" : "have"} them`,
    axis: null, share: null, items,
  };
}

// -- neighbours -------------------------------------------------------------

/**
 * The artists the viewer keeps in a scene, and the one being introduced.
 *
 * Ordered by how much of each the viewer holds rather than by date, because
 * what this drawing answers is "this is your corner of this music" — the
 * question a scene card raises, which no chronology addresses.
 */
function neighbours(
  ref: Reference, c: Candidate, uid: string, lane: string,
): Relation | null {
  const works = ref.subgenreWorks.get(lane);
  if (!works) return null;

  const mine = new Map<string, Set<string>>();
  for (const wk of [...works].sort()) {
    const w = ref.works.get(wk);
    if (!w || !w.holders.has(uid)) continue;
    const set = mine.get(w.artistKey) ?? new Set<string>();
    set.add(wk); mine.set(w.artistKey, set);
  }

  const offered = new Map<string, number>();
  for (const wk of c.tracks) {
    const ak = ref.works.get(wk)?.artistKey;
    if (ak) offered.set(ak, (offered.get(ak) ?? 0) + 1);
  }
  /**
   * Only an artist the viewer keeps nothing of here is an introduction.
   *
   * A scene card hands over tracks by artists the viewer does not have, but
   * some of those artists are already on their shelf with other records: this
   * drawing marked Drake as new on a rap card to somebody holding thirty-six
   * of his tracks. Where nothing on the card is genuinely new to the scene the
   * relation is a share of it, not an introduction, and the chain falls
   * through to that.
   */
  const fresh = (ak: string) => !mine.has(ak);
  const lead = (c.subject.kind === "artist" ? [c.subject.key]
    : [...offered].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3).map(([ak]) => ak)).filter(fresh);
  if (lead.length === 0) return null;

  const items: RelationItem[] = [];
  for (const ak of lead) {
    const a = ref.artists.get(ak);
    if (!a) continue;
    items.push({ id: ak, name: a.name, imageUrl: faceOf(ref, a.works),
      shape: "circle", state: "offered", year: median([...a.years.keys()]) });
  }
  const yours = [...mine]
    .filter(([ak]) => !lead.includes(ak))
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, MAX_ITEMS - items.length);
  for (const [ak, wks] of yours) {
    items.push({ id: ak, name: ref.artists.get(ak)?.name ?? ak,
      imageUrl: faceOf(ref, ref.artists.get(ak)?.works ?? wks),
      shape: "circle", state: "yours", year: null });
  }

  const n = items.filter((i) => i.state === "yours").length;
  if (n < MIN_YOURS || items.length === n) return null;
  return {
    kind: "neighbours",
    caption: `${n} ${plural(n, "artist")} you keep in ${laneTitle(lane).toLowerCase()}`,
    axis: null, share: null, items,
  };
}

// -- trimming ---------------------------------------------------------------

/** Keep what sits nearest the thing being offered. */
function trim(items: RelationItem[]): RelationItem[] {
  const sorted = [...items].sort(
    (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.id.localeCompare(b.id));
  if (sorted.length <= MAX_ITEMS) return sorted;
  const anchors = sorted.filter((i) => i.state === "offered").map((i) => i.year ?? 0);
  const near = (i: RelationItem) =>
    Math.min(...anchors.map((y) => Math.abs((i.year ?? 0) - y)));
  const kept = sorted.filter((i) => i.state === "offered");
  const rest = sorted
    .filter((i) => i.state === "yours")
    .sort((a, b) => near(a) - near(b) || (a.year ?? 0) - (b.year ?? 0))
    .slice(0, Math.max(0, MAX_ITEMS - kept.length));
  return [...kept, ...rest].sort(
    (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.id.localeCompare(b.id));
}

// -- what each family draws -------------------------------------------------

/**
 * The drawing a family's relation actually is, then what to fall back to.
 *
 * Read in order, first one the data supports wins. Every chain ends in
 * something that cannot fail, because a card without a drawing is a card that
 * never says why it is in front of you.
 */
export function buildRelation(
  ref: Reference, c: Candidate, uid: string, people: Map<string, PersonRow>,
): Relation | null {
  const artistKey = artistOf(ref, c);
  const lane = laneOf(c);

  const chrono = () => artistKey ? artistChronology(ref, c, uid, artistKey) : null;
  const years = () => lane ? laneChronology(ref, c, uid, lane) : null;
  const near = () => lane ? neighbours(ref, c, uid, lane) : null;
  const set = () => fill(ref, c, uid);
  const on = () => hub(ref, c, uid);
  const who = () => peopleHub(ref, c, people);

  const chain: (() => Relation | null)[] =
    c.family === "GUEST_ON_YOUR_RECORDS" ? [on, set, who]
    : c.family === "A_YEAR_IN_YOUR_LANE" ? [years, near, set]
    : c.family === "EVERYONE_BUT_YOU" ? [near, who, set]
    : c.family === "ONLY_ONE_FRIEND_HAS_IT" ? [near, who, set]
    : c.family === "FINISH_THE_RECORD" || c.family === "YOU_HAVE_THE_HITS"
      ? [set, chrono, who]
    : c.family === "DEEPER_ON_AN_ARTIST" ? [set, chrono, who]
    : lane ? [near, set, who]
    : [chrono, set, who];

  for (const attempt of chain) {
    const r = attempt();
    if (r) return r;
  }
  return null;
}

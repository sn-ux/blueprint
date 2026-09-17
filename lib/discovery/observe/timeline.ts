/**
 * Where the card's music sits relative to what the viewer already has.
 *
 * A card says "here is a record of theirs you never got". What it cannot say
 * on its own is whether that record came before the two you own or after them,
 * and that is most of what makes a gap legible: a 2016 album between the 2013
 * and the 2020 you already keep is a different proposition from one that
 * predates both.
 *
 * Every card supplies a context rather than a drawing. A family names the axis
 * its subject belongs on (an artist's records, a lane's artists, a lane's
 * years) and the three builders below do the rest, so a new family declares
 * one line here instead of carrying a timeline of its own.
 *
 * Nothing on the axis is inferred. A release year is a release year the corpus
 * holds, an item is either music the viewer holds or music this card hands
 * over, and a context with too little real data to place anything returns null
 * rather than a thinner timeline.
 *
 * The one date this cannot fix is a reissue's. A record is placed at the
 * earliest year any edition of it carries, which puts a remaster back on its
 * own release; a single recording whose only copy here is a remastered
 * pressing still carries that pressing's date, and the lane-years axis can
 * inherit it. That is a limit of the metadata rather than a choice made here,
 * and no year on an axis is ever one the rows do not give.
 */
import { laneTitle } from "../display";
import type { Candidate } from "./candidates";
import { normText, type Reference } from "./reference";

export type TimelineAxis = "artist-albums" | "lane-artists" | "lane-years";

export interface TimelineItem {
  /** Album id, artist key, or year. Unique within the timeline. */
  id: string;
  name: string;
  year: number;
  imageUrl: string | null;
  /**
   * What the viewer already holds, against what this card is opening.
   *
   * A record the card completes is surfaced, not held: the point of putting it
   * on the axis is that the rest of it is the thing being offered.
   */
  state: "held" | "surfaced";
}

export interface Timeline {
  axis: TimelineAxis;
  /** The axis in words, e.g. "Slowdive, by release". */
  label: string;
  from: number;
  to: number;
  items: TimelineItem[];
}

/** An axis with fewer than this many of the viewer's own items places nothing. */
const MIN_HELD = 2;
/** Three points, or the reader is looking at a line with a dot on it. */
const MIN_POINTS = 3;
/** Two items a year apart are a coincidence, not a chronology. */
const MIN_SPAN = 2;
/** Past this the covers are too small to recognise at the card's width. */
const MAX_ITEMS = 9;
/** A set card can span thirty artists. Only the largest few are its subject. */
const MAX_SURFACED = 3;

// -- the context each family supplies ---------------------------------------

type Context =
  | { axis: "artist-albums"; artistKey: string }
  | { axis: "lane-artists"; lane: string }
  | { axis: "lane-years"; lane: string };

/**
 * The lane a card hangs off, when it hangs off one.
 *
 * A person connection carries the lane in its label and the person in its key,
 * because the claim is about a corner of a lane rather than about a library.
 */
function laneOf(c: Candidate): string | null {
  const k = c.connection.kind;
  return k === "LANE_DEPTH" || k === "PERSON" ? c.connection.label : null;
}

function contextOf(ref: Reference, c: Candidate): Context | null {
  switch (c.family) {
    /** The subject is one record; the axis is the catalogue it belongs to. */
    case "FINISH_THE_RECORD":
    case "YOU_HAVE_THE_HITS":
    case "THE_RECORD_YOU_SKIPPED":
    case "ONE_RECORD_LEFT": {
      if (c.subject.kind !== "album") return null;
      const ak = ref.albums.get(c.subject.key)?.artistKey;
      return ak ? { axis: "artist-albums", artistKey: ak } : null;
    }
    /** The subject is the catalogue, and the claim is about a point in it. */
    case "SINCE_YOU_STOPPED":
    case "BEFORE_YOU_ARRIVED":
    case "DEEPER_ON_AN_ARTIST":
      return c.subject.kind === "artist"
        ? { axis: "artist-albums", artistKey: c.subject.key } : null;
    /** The subject sits in a lane, among the artists the viewer keeps there. */
    case "NEW_IN_YOUR_LANE":
    case "EVERYONE_BUT_YOU":
    case "ONLY_ONE_FRIEND_HAS_IT":
    case "THEY_ALL_KEEP_IT":
    case "WHAT_THEY_HAVE":
    case "A_SCENE_YOU_TOUCHED": {
      const lane = laneOf(c);
      return lane ? { axis: "lane-artists", lane } : null;
    }
    /** The subject is a year, so the axis is the lane's other years. */
    case "A_YEAR_IN_YOUR_LANE": {
      const lane = laneOf(c);
      return lane ? { axis: "lane-years", lane } : null;
    }
    /**
     * A guest the viewer holds nothing by has no catalogue of theirs in the
     * library to be placed against, and the records they appear on are other
     * artists' records. There is no honest axis here, so there is no timeline.
     */
    case "GUEST_ON_YOUR_RECORDS":
      return null;
  }
  return null;
}

// -- shared reads -----------------------------------------------------------

const holds = (ref: Reference, wk: string, viewerId: string) =>
  ref.works.get(wk)?.holders.has(viewerId) ?? false;

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

/** The middle of a set of years. Robust to one reissue sitting far from the rest. */
function median(years: number[]): number | null {
  if (years.length === 0) return null;
  const s = [...years].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/** The albums this card's tracks actually come from. */
function surfacedAlbums(ref: Reference, c: Candidate): Set<string> {
  const out = new Set<string>();
  for (const wk of c.tracks) {
    const aid = ref.works.get(wk)?.albumId;
    if (aid) out.add(aid);
  }
  return out;
}

/**
 * The artists this card is actually about.
 *
 * A lane card can hand over thirty artists, and thirty rings on one axis says
 * nothing. The ones it is about are the ones it carries most of.
 */
function surfacedArtists(ref: Reference, c: Candidate): Set<string> {
  const n = new Map<string, number>();
  for (const wk of c.tracks) {
    const ak = ref.works.get(wk)?.artistKey;
    if (ak) n.set(ak, (n.get(ak) ?? 0) + 1);
  }
  const ranked = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return new Set(ranked.slice(0, MAX_SURFACED).map(([ak]) => ak));
}

// -- one index per lane, built once per run ---------------------------------

interface LaneArtist {
  works: Set<string>;
  heldYears: number[];
  years: number[];
  anyHeld: boolean;
}
interface LaneIndex {
  artists: Map<string, LaneArtist>;
  /** Year -> the viewer's own recordings in this lane from it. */
  heldYears: Map<number, Set<string>>;
}

const LANES = new WeakMap<Reference, Map<string, LaneIndex>>();

function laneIndex(ref: Reference, lane: string, viewerId: string): LaneIndex | null {
  let per = LANES.get(ref);
  if (!per) { per = new Map(); LANES.set(ref, per); }
  const memo = `${viewerId} :: ${lane}`;
  const hit = per.get(memo);
  if (hit) return hit;

  const works = ref.subgenreWorks.get(lane);
  if (!works) return null;

  const idx: LaneIndex = { artists: new Map(), heldYears: new Map() };
  for (const wk of [...works].sort()) {
    const w = ref.works.get(wk);
    if (!w) continue;
    let a = idx.artists.get(w.artistKey);
    if (!a) {
      a = { works: new Set(), heldYears: [], years: [], anyHeld: false };
      idx.artists.set(w.artistKey, a);
    }
    a.works.add(wk);
    if (w.year !== null) a.years.push(w.year);
    if (w.holders.has(viewerId)) {
      a.anyHeld = true;
      if (w.year !== null) {
        a.heldYears.push(w.year);
        let ys = idx.heldYears.get(w.year);
        if (!ys) { ys = new Set(); idx.heldYears.set(w.year, ys); }
        ys.add(wk);
      }
    }
  }
  per.set(memo, idx);
  return idx;
}

// -- the three axes ---------------------------------------------------------

/**
 * An artist's records, in release order.
 *
 * Only full-length records: a chronology that puts three singles and a
 * greatest-hits between two albums is not the shape of a catalogue, and the
 * album builders already refuse to treat those as records.
 */
function artistAlbums(
  ref: Reference, c: Candidate, viewerId: string, artistKey: string,
): { label: string; items: TimelineItem[] } | null {
  const a = ref.artists.get(artistKey);
  if (!a) return null;
  const surfaced = surfacedAlbums(ref, c);
  const subject = c.subject.kind === "album" ? c.subject.key : null;

  /**
   * When a record came out, across every edition of it the corpus has.
   *
   * Read before anything is filtered, because the edition that carries the
   * original date is often one neither side holds: a listener with the 2026
   * deluxe and nothing else would otherwise have that record placed in 2026,
   * two years after it came out.
   */
  /**
   * A record belongs on this axis only if this artist made it.
   *
   * An artist's album map is filled a row at a time, so one guest verse puts
   * the host's record into the guest's catalogue: a Drake axis was carrying
   * Eminem's "Relapse: Refill" because Drake appears on it. A catalogue is
   * what somebody released, not what they turned up on.
   */
  const own = (aid: string) => ref.albums.get(aid)?.artistKey === artistKey;

  const firstYear = new Map<string, number>();
  for (const aid of a.albums.keys()) {
    if (!own(aid)) continue;
    const alb = ref.albums.get(aid);
    if (!alb || alb.year === null || alb.albumType !== "album") continue;
    const key = normText(alb.name);
    const at = firstYear.get(key);
    if (at === undefined || alb.year < at) firstYear.set(key, alb.year);
  }

  /**
   * One position per record, not one per pressing.
   *
   * A catalogue carries the same album several times over: an explicit and a
   * clean, a standard and an expanded edition, a remaster twenty years later,
   * each with its own id and its own cover. Placed separately they stack as
   * two identical covers, which reads as the artist having released it twice.
   *
   * A record is merged on its name alone and sits at the earliest year the
   * corpus gives it, because a 2011 remaster of a 1975 album is that album and
   * placing it in 2011 puts the wrong decade on the axis.
   */
  const records = new Map<string, {
    ids: { any: string; held: string | null; surfaced: string | null };
    name: string; year: number; works: Set<string>;
    surfaced: boolean; held: boolean; size: number;
  }>();

  for (const aid of [...a.albums.keys()].sort()) {
    if (!own(aid)) continue;
    const alb = ref.albums.get(aid);
    if (!alb || alb.year === null || alb.albumType !== "album") continue;
    const works = a.albums.get(aid) ?? new Set<string>();
    const isSurfaced = aid === subject || surfaced.has(aid);
    const isHeld = [...works].some((wk) => holds(ref, wk, viewerId));
    if (!isSurfaced && !isHeld) continue;

    const key = normText(alb.name);
    const year = firstYear.get(key) ?? alb.year;
    const hit = records.get(key);
    if (!hit) {
      records.set(key, {
        ids: { any: aid, held: isHeld ? aid : null, surfaced: isSurfaced ? aid : null },
        name: alb.name, year, works: new Set(works),
        surfaced: isSurfaced, held: isHeld, size: works.size,
      });
      continue;
    }
    hit.surfaced ||= isSurfaced;
    hit.held ||= isHeld;
    hit.year = Math.min(hit.year, year);
    /**
     * Keep an id for each role the merged record plays.
     *
     * The id is what the rest of the system resolves the item by, so it has to
     * name a pressing that is actually doing the thing the item claims: the
     * one the viewer holds when the item is theirs, the one this card opens
     * when the item is the card's. Keeping only the fullest pressing pointed
     * two hundred and thirty-eight held items at an edition nobody owned.
     */
    if (isHeld && !hit.ids.held) hit.ids.held = aid;
    if (isSurfaced && !hit.ids.surfaced) hit.ids.surfaced = aid;
    for (const wk of works) hit.works.add(wk);
    if (works.size > hit.size || (works.size === hit.size && aid < hit.ids.any)) {
      hit.ids.any = aid; hit.name = alb.name; hit.size = works.size;
    }
  }

  /**
   * One cover per year per state.
   *
   * Two records an artist put out in the same year land on the same point of
   * the axis, and a second cover under the first answers nothing about where
   * this one fits. A catalogue that genuinely splits a release in two, as a
   * part one and a part two under separate ids, is the common case here.
   */
  const perYear = new Map<string, TimelineItem & { size: number }>();
  for (const r of records.values()) {
    const state: TimelineItem["state"] = r.surfaced ? "surfaced" : "held";
    const at = `${r.year}:${state}`;
    const hit = perYear.get(at);
    if (hit && hit.size >= r.works.size) continue;
    const id = (state === "surfaced" ? r.ids.surfaced : r.ids.held) ?? r.ids.any;
    perYear.set(at, {
      id, name: r.name, year: r.year,
      imageUrl: coverOf(ref, r.works), state, size: r.works.size,
    });
  }
  const items: TimelineItem[] = [...perYear.values()]
    .map(({ size: _size, ...item }) => item);
  return { label: `${a.name}, by release`, items };
}

/**
 * The artists of a lane, placed by the era of their work in it.
 *
 * An artist's position is the middle release year of their recordings in this
 * lane, because a debut is not in the data and a middle is robust to one
 * reissue sitting far from the rest. Every artist on the axis is measured the
 * same way, including the one being surfaced: two measures on one line is not
 * a chronology, it is two chronologies drawn on top of each other.
 */
function laneArtists(
  ref: Reference, c: Candidate, viewerId: string, lane: string,
): { label: string; items: TimelineItem[] } | null {
  const idx = laneIndex(ref, lane, viewerId);
  if (!idx) return null;
  const surfaced = c.subject.kind === "artist"
    ? new Set([c.subject.key]) : surfacedArtists(ref, c);
  const items: TimelineItem[] = [];

  for (const ak of [...idx.artists.keys()].sort()) {
    const a = idx.artists.get(ak);
    if (!a) continue;
    const isSurfaced = surfaced.has(ak);
    if (!isSurfaced && !a.anyHeld) continue;
    const year = median(a.years);
    if (year === null) continue;
    items.push({
      id: ak, name: ref.artists.get(ak)?.name ?? ak, year,
      imageUrl: faceOf(ref, a.works),
      state: isSurfaced ? "surfaced" : "held",
    });
  }
  return { label: `${laneTitle(lane)}, by release era`, items };
}

/** The years of a lane the viewer holds, and the one this card is about. */
function laneYears(
  ref: Reference, c: Candidate, viewerId: string, lane: string,
): { label: string; items: TimelineItem[] } | null {
  const idx = laneIndex(ref, lane, viewerId);
  if (!idx) return null;

  const cut = c.subject.key.lastIndexOf(":");
  const target = cut < 0 ? NaN : Number(c.subject.key.slice(cut + 1));
  if (!Number.isInteger(target)) return null;

  const items: TimelineItem[] = [];
  for (const [year, works] of [...idx.heldYears].sort((a, b) => a[0] - b[0])) {
    if (year === target) continue;
    items.push({
      id: `y${year}`, name: String(year), year,
      imageUrl: coverOf(ref, works), state: "held",
    });
  }
  items.push({
    id: `y${target}`, name: String(target), year: target,
    imageUrl: coverOf(ref, c.tracks), state: "surfaced",
  });
  return { label: `${laneTitle(lane)}, by year`, items };
}

// -- trimming and the gate --------------------------------------------------

/**
 * Keep what sits nearest the thing being surfaced.
 *
 * A viewer deep in a lane holds forty years of it, and forty covers on one
 * axis is a texture rather than a chronology. What answers "where does this
 * fit" is the neighbours, so distance from the surfaced item decides.
 */
function trim(items: TimelineItem[]): TimelineItem[] {
  if (items.length <= MAX_ITEMS) return items;
  const anchors = items.filter((i) => i.state === "surfaced").map((i) => i.year);
  const near = (i: TimelineItem) =>
    Math.min(...anchors.map((y) => Math.abs(i.year - y)));
  const kept = items.filter((i) => i.state === "surfaced");
  const rest = items
    .filter((i) => i.state === "held")
    .sort((a, b) => near(a) - near(b) || a.year - b.year)
    .slice(0, Math.max(0, MAX_ITEMS - kept.length));
  return [...kept, ...rest].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
}

/**
 * The card's timeline, or nothing.
 *
 * Nothing is the common answer and the correct one: a viewer with one other
 * record by an artist has no chronology to place a second against, and drawing
 * an axis anyway would make the card look like it knows something.
 */
export function buildTimeline(
  ref: Reference, c: Candidate, viewerId: string,
): Timeline | null {
  const ctx = contextOf(ref, c);
  if (!ctx) return null;

  const built =
    ctx.axis === "artist-albums" ? artistAlbums(ref, c, viewerId, ctx.artistKey)
    : ctx.axis === "lane-artists" ? laneArtists(ref, c, viewerId, ctx.lane)
    : laneYears(ref, c, viewerId, ctx.lane);
  if (!built) return null;

  const sorted = built.items.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  const items = trim(sorted);
  const heldCount = items.filter((i) => i.state === "held").length;
  const surfacedCount = items.length - heldCount;
  const years = new Set(items.map((i) => i.year));
  if (heldCount < MIN_HELD || surfacedCount < 1) return null;
  if (years.size < MIN_POINTS) return null;

  const from = items[0].year;
  const to = items[items.length - 1].year;
  if (to - from < MIN_SPAN) return null;

  return { axis: ctx.axis, label: built.label, from, to, items };
}

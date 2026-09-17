/**
 * A TIMELINE MAY ONLY CONTAIN DATES AND RELATIONSHIPS THE DATA ACTUALLY HAS.
 *
 *   node --import ./scripts/register.mjs scripts/validate-card-timelines.mjs
 *
 * Run on the FeedCard the phone receives. A timeline is the one part of a card
 * that makes a claim in a dimension the card's sentence never touches — that
 * this record came before that one — so every position on it is checked back
 * against the rows rather than against the builder that produced it.
 *
 * Dates are read from the raw track rows, not from the reference, so a fault
 * in the reference cannot validate itself.
 */
import { loadCorpus } from "../lib/discovery/corpus.ts";
import { observe, buildReference, buildProfile } from "../lib/discovery/observe/observe.ts";
import { toFeedCard } from "../lib/discovery/observe/cards.ts";
import { prisma } from "../lib/prisma.ts";

const { people, tracks } = await loadCorpus();
const byId = new Map(people.map((p) => [p.id, p]));
const ref = buildReference(tracks);

const fails = {};
const note = (k, e) => { (fails[k] ??= { n: 0, ex: [] }).n++; if (fails[k].ex.length < 3) fails[k].ex.push(e); };

/** The dates and memberships, straight off the rows. */
const albumYears = new Map();   // albumId -> Set<year>
const albumArtist = new Map();  // albumId -> Set<artist name, lowercased>
const artistYears = new Map();  // artist (lowercased) -> Set<year>
const heldAlbums = new Map();   // userId -> Set<albumId>
const heldArtists = new Map();  // userId -> Set<artist lowercased>
const heldYears = new Map();    // `${userId}|${year}` -> Set<subgenre tag, any row's>
const tagsOf = new Map();       // recording -> Set<subgenre tag, across the corpus>
const holdersOf = new Map();    // recording -> Set<userId>
const albumSongs = new Map();   // `${artist}|${record}` -> Set<recording>
const heldSongs = new Map();    // userId -> Set<recording>
const recordYears = new Map();  // `${artist}|${record}` -> Set<year>

/**
 * A recording, keyed independently of the engine.
 *
 * Deliberately written here rather than imported, so a fault in the engine's
 * own identity cannot pass this file. It has to agree with the engine on one
 * thing to be useful: an edition suffix is not a different recording, while a
 * different performance is. So the bracketed and trailing parts of a title are
 * dropped unless they name a performance, which is kept in the key.
 */
const PERF = /\b(live|remix|acoustic|demo|instrumental|cover|reprise|unplugged|session|rehearsal|karaoke)\b/gi;
const plain = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const rec = (name, artist) => {
  const raw = name ?? "";
  const marks = [...new Set((raw.match(PERF) ?? []).map((m) => m.toLowerCase()))].sort();
  const base = raw.replace(/\(.*?\)|\[.*?\]/g, " ").split(/\s+-\s+/)[0];
  return `${plain(base) || plain(raw)}${marks.length ? `#${marks.join(",")}` : ""}|${plain(artist)}`;
};

const record = (name) =>
  (name ?? "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^a-z0-9]+/g, "");

for (const t of tracks) {
  const y = /^(\d{4})/.exec(t.releaseDate ?? "");
  const year = y ? +y[1] : null;
  const artist = (t.artist ?? "").toLowerCase();
  if (t.albumId) {
    if (year !== null) (albumYears.get(t.albumId) ?? albumYears.set(t.albumId, new Set()).get(t.albumId)).add(year);
    (albumArtist.get(t.albumId) ?? albumArtist.set(t.albumId, new Set()).get(t.albumId)).add(artist);
    (heldAlbums.get(t.userId) ?? heldAlbums.set(t.userId, new Set()).get(t.userId)).add(t.albumId);
  }
  if (year !== null) (artistYears.get(artist) ?? artistYears.set(artist, new Set()).get(artist)).add(year);
  (heldArtists.get(t.userId) ?? heldArtists.set(t.userId, new Set()).get(t.userId)).add(artist);
  const r = rec(t.name, t.artist);
  (tagsOf.get(r) ?? tagsOf.set(r, new Set()).get(r)).add(t.blueprintSubgenre);
  (heldSongs.get(t.userId) ?? heldSongs.set(t.userId, new Set()).get(t.userId)).add(r);
  (holdersOf.get(r) ?? holdersOf.set(r, new Set()).get(r)).add(t.userId);
  if (t.albumId) {
    const k = `${artist}|${record(t.album)}`;
    (albumSongs.get(k) ?? albumSongs.set(k, new Set()).get(k)).add(r);
  }
  if (year !== null && t.albumType === "album") {
    const k = `${artist}|${record(t.album)}`;
    (recordYears.get(k) ?? recordYears.set(k, new Set()).get(k)).add(year);
  }
}

/**
 * A lane is decided by majority vote across every copy of a recording, so the
 * tag on the viewer's own row is not the lane the engine placed it in. Reading
 * the tag back off their row would fail 36 true years. What is checked instead
 * is independent of the vote and still catches an invented one: the viewer
 * holds a recording from that year that somebody's row puts in that lane.
 */
for (const t of tracks) {
  const y = /^(\d{4})/.exec(t.releaseDate ?? "");
  if (!y) continue;
  const r = rec(t.name, t.artist);
  for (const holder of holdersOf.get(r) ?? []) {
    const k = `${holder}|${+y[1]}`;
    const set = heldYears.get(k) ?? heldYears.set(k, new Set()).get(k);
    for (const tag of tagsOf.get(r) ?? []) set.add(tag);
  }
}

let total = 0, drawn = 0, items = 0;

for (const uid of [...new Set(tracks.map((t) => t.userId))]) {
  const r = observe(ref, buildProfile(uid, tracks, ref), {});
  r.candidates.forEach((c, i) => {
    total++;
    const card = toFeedCard(ref, c, uid, byId, i + 1);
    const tl = card.timeline;
    if (!tl) return;
    drawn++;
    items += tl.items.length;
    const where = `${c.family} / ${card.title}`;

    // 1. the axis has to be readable: ordered, unique, and bounded by its own items
    const ys = tl.items.map((x) => x.year);
    if (ys.some((y, n) => n > 0 && y < ys[n - 1])) note("items are not in date order", where);
    if (new Set(tl.items.map((x) => x.id)).size !== tl.items.length) note("the same item twice", where);
    if (tl.from !== Math.min(...ys) || tl.to !== Math.max(...ys))
      note("from/to do not bound the items", `${where}: ${tl.from}-${tl.to} vs ${Math.min(...ys)}-${Math.max(...ys)}`);
    if (tl.to - tl.from < 2) note("span too short to place anything", where);
    if (new Set(ys).size < 3) note("fewer than three distinct years", where);

    // 2. both sides are present, or the axis shows no context
    const held = tl.items.filter((x) => x.state === "held");
    const surfaced = tl.items.filter((x) => x.state === "surfaced");
    if (held.length < 2) note("fewer than two of the viewer's own items", where);
    if (surfaced.length < 1) note("nothing surfaced", where);

    // 3. no invented dates: every year is one the rows carry for that item
    const cardAlbums = new Set(c.tracks.map((wk) => ref.works.get(wk)?.albumId).filter(Boolean));
    const cardArtists = new Set(c.tracks.map((wk) => ref.works.get(wk)?.artist?.toLowerCase()).filter(Boolean));

    for (const it of tl.items) {
      if (tl.axis === "artist-albums") {
        const real = albumYears.get(it.id);
        if (!real) { note("album not in the corpus", `${where}: ${it.id}`); continue; }
        /**
         * A record sits at the first year the corpus gives it, so the year
         * checked is the earliest across every edition of it by this artist,
         * not the year on the edition the item happens to name.
         */
        /**
         * A record id carries every credit that appears on it, so a soundtrack
         * or a feature gives it several artist strings. Reading one of them is
         * reading whichever row happened to be first: check the record under
         * every name it is credited to.
         */
        const makers = [...(albumArtist.get(it.id) ?? [])];
        const union = (m) => {
          const out = new Set();
          for (const maker of makers) for (const v of m.get(`${maker}|${record(it.name)}`) ?? []) out.add(v);
          return out;
        };
        const years = union(recordYears);
        const editions = years.size ? years : real;
        if (it.year !== Math.min(...editions))
          note("record placed at a year the rows do not give it", `${where}: ${it.name} at ${it.year}, rows say ${[...editions].sort()}`);
        // 4. no invented relationships: the album belongs to this axis's artist
        const axisArtist = (ref.artists.get(c.subject.kind === "artist" ? c.subject.key : ref.albums.get(c.subject.key)?.artistKey ?? "")?.name ?? "").toLowerCase();
        if (axisArtist && makers.length && !makers.includes(axisArtist))
          note("album on an axis belonging to another artist", `${where}: ${it.name} is by ${makers[0]}`);
        // 5. state is the truth about this viewer
        /**
         * Held means the music is in their library, not that they have this
         * pressing of it. Two people who both own a record commonly hold two
         * different editions, and an axis that called that "not held" would be
         * describing Spotify's catalogue rather than the reader's shelf.
         */
        const on = union(albumSongs);
        const mine = heldSongs.get(uid) ?? new Set();
        if (it.state === "held" && ![...on].some((r) => mine.has(r)))
          note("an album the viewer holds nothing from marked held", `${where}: ${it.name}`);
        if (it.state === "surfaced" && !cardAlbums.has(it.id) && `album:${it.id}` !== card.subjectKey)
          note("an album the card does not open marked surfaced", `${where}: ${it.name}`);
      }

      if (tl.axis === "lane-artists") {
        const name = (ref.artists.get(it.id)?.name ?? "").toLowerCase();
        const real = artistYears.get(name);
        if (!real) { note("artist has no dated rows", `${where}: ${it.name}`); continue; }
        if (!real.has(it.year))
          note("artist placed at a year the rows do not give them", `${where}: ${it.name} at ${it.year}`);
        if (it.state === "held" && !(heldArtists.get(uid) ?? new Set()).has(name))
          note("an artist the viewer does not hold marked held", `${where}: ${it.name}`);
        if (it.state === "surfaced" && !cardArtists.has(name))
          note("an artist the card does not open marked surfaced", `${where}: ${it.name}`);
      }

      if (tl.axis === "lane-years") {
        if (String(it.year) !== it.name) note("year item mislabelled", `${where}: ${it.name} at ${it.year}`);
        const lane = c.connection.label;
        // A recording's date can differ between pressings, so the year is
        // checked against every date the corpus gives the music the viewer
        // holds, not against the one on their own row.
        if (it.state === "held" && !(heldYears.get(`${uid}|${it.year}`) ?? new Set()).has(lane))
          note("a year the viewer holds nothing from marked held", `${where}: ${it.year} in ${lane}`);
        // the year this card is about has to be a year its own tracks come from
        if (it.state === "surfaced"
            && !c.tracks.some((wk) => ref.works.get(wk)?.year === it.year))
          note("surfaced year is not a year the card's tracks carry", `${where}: ${it.year}`);
      }

      // 6. artwork is a real URL or absent; never a placeholder standing in
      if (it.imageUrl !== null && !/^https?:\/\//.test(it.imageUrl))
        note("item artwork is not a real url", `${where}: ${it.imageUrl}`);
    }

    // 7. a card never places music the viewer already holds as if it were new
    for (const it of surfaced) {
      if (tl.axis === "artist-albums" && it.state === "surfaced" && !cardAlbums.has(it.id)
          && `album:${it.id}` !== card.subjectKey)
        note("surfaced item is not this card's material", `${where}: ${it.name}`);
      if (tl.axis === "lane-artists" && it.state === "surfaced"
          && !cardArtists.has((ref.artists.get(it.id)?.name ?? "").toLowerCase()))
        note("surfaced artist is not this card's material", `${where}: ${it.name}`);
    }
  });
}

console.log(`checked ${total} cards, ${drawn} with a timeline (${((drawn / total) * 100).toFixed(1)}%), ${items} placed items\n`);
const ks = Object.keys(fails);
if (!ks.length) console.log("INVARIANT HOLDS — every placed item carries a date and a relationship the rows have");
for (const k of ks) { console.log(`✗ ${fails[k].n}  ${k}`); for (const e of fails[k].ex) console.log(`      ${e}`); }
await prisma.$disconnect();

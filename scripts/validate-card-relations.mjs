/**
 * A DRAWING MAY ONLY CONTAIN THINGS, DATES AND RELATIONSHIPS THE ROWS HAVE.
 *
 *   node --import ./scripts/register.mjs scripts/validate-card-relations.mjs
 *
 * Run on the FeedCard the phone receives. The drawing is the one part of a
 * card that makes a claim the sentence never makes — that this record is on
 * your shelf, that this person is on music you chose, that you keep four of
 * these twelve — so every mark on it is checked back against the rows.
 *
 * Dates and holdings are read from the raw track rows rather than from the
 * reference, so a fault in the reference cannot validate itself.
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

/**
 * A recording, keyed independently of the engine.
 *
 * Written here rather than imported, so a fault in the engine's own identity
 * cannot pass this file. It agrees with the engine on one thing, because every
 * question below is about music rather than about pressings: an edition suffix
 * is not a different recording, a different performance is.
 */
const PERF = /\b(live|remix|acoustic|demo|instrumental|cover|reprise|unplugged|session|rehearsal|karaoke)\b/gi;
const plain = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const rec = (name, artist) => {
  const raw = name ?? "";
  const marks = [...new Set((raw.match(PERF) ?? []).map((m) => m.toLowerCase()))].sort();
  /**
   * A credit is not part of a title, bracketed or not.
   *
   * "BIG BANK (feat. 2 Chainz…)" on an album and "Big Bank feat. 2 Chainz…"
   * released as a single are one recording, and stripping only the bracketed
   * form made this file disagree with the engine about two marks it had every
   * right to make.
   */
  const base = raw
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .split(/\s+-\s+|\bfeat\.?\b|\bft\.?\b|\bwith\b/i)[0];
  return `${plain(base) || plain(raw)}${marks.length ? `#${marks.join(",")}` : ""}|${plain(artist)}`;
};
/** An album's name with the edition dropped, for matching a remaster to it. */
const record = (name) =>
  (name ?? "").toLowerCase().replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^a-z0-9]+/g, "");

const albumArtist = new Map();  // albumId -> Set<artist lowercased>
const albumSongs = new Map();   // `${artist}|${record}` -> Set<recording>
const recordYears = new Map();  // `${artist}|${record}` -> Set<year>
const heldSongs = new Map();    // userId -> Set<recording>
const heldArtists = new Map();  // userId -> Set<artist lowercased>
const tagsOf = new Map();       // recording -> Set<subgenre tag>
const holdersOf = new Map();    // recording -> Set<userId>
const heldYears = new Map();    // `${userId}|${year}` -> Set<subgenre tag>
const artistSongs = new Map();  // artist lowercased -> Set<recording>
/**
 * Distinct pressings, which bound any identity scheme from above.
 *
 * This file keys a recording more crudely than the engine does, so the two
 * disagree by one or two on a catalogue where an edition suffix merges here
 * and not there. Counting pressings removes the disagreement: whatever a
 * recording is, there cannot be more of them than there are rows.
 */
const artistPressings = new Map(); // artist lowercased -> Set<spotifyId>
const songYears = new Map();    // recording -> Set<year>
/**
 * Years and recordings per album id, alongside the per-record ones.
 *
 * A record is addressed two ways here: by its id, and by artist-and-name so
 * that an edition matches the record it is an edition of. Neither alone agrees
 * with the engine's grouping on every row — an album credited to a slightly
 * different artist string sits outside the name group — so both are read, and
 * a mark is a fault only when neither supports it.
 */
const albumIdYears = new Map();  // albumId -> Set<year>
const albumIdSongs = new Map();  // albumId -> Set<recording>
const albumPressings = new Map();  // `${artist}|${record}` -> Set<spotifyId>

for (const t of tracks) {
  const y = /^(\d{4})/.exec(t.releaseDate ?? "");
  const year = y ? +y[1] : null;
  const artist = (t.artist ?? "").toLowerCase();
  const r = rec(t.name, t.artist);
  const key = `${artist}|${record(t.album)}`;

  if (t.albumId) {
    (albumArtist.get(t.albumId) ?? albumArtist.set(t.albumId, new Set()).get(t.albumId)).add(artist);
    (albumSongs.get(key) ?? albumSongs.set(key, new Set()).get(key)).add(r);
    (albumPressings.get(key) ?? albumPressings.set(key, new Set()).get(key)).add(t.spotifyId);
    (albumIdSongs.get(t.albumId) ?? albumIdSongs.set(t.albumId, new Set()).get(t.albumId)).add(r);
    if (year !== null)
      (albumIdYears.get(t.albumId) ?? albumIdYears.set(t.albumId, new Set()).get(t.albumId)).add(year);
    if (year !== null && t.albumType === "album")
      (recordYears.get(key) ?? recordYears.set(key, new Set()).get(key)).add(year);
  }
  (heldSongs.get(t.userId) ?? heldSongs.set(t.userId, new Set()).get(t.userId)).add(r);
  (heldArtists.get(t.userId) ?? heldArtists.set(t.userId, new Set()).get(t.userId)).add(artist);
  (artistSongs.get(artist) ?? artistSongs.set(artist, new Set()).get(artist)).add(r);
  (artistPressings.get(artist) ?? artistPressings.set(artist, new Set()).get(artist)).add(t.spotifyId);
  (tagsOf.get(r) ?? tagsOf.set(r, new Set()).get(r)).add(t.blueprintSubgenre);
  if (year !== null) (songYears.get(r) ?? songYears.set(r, new Set()).get(r)).add(year);
  (holdersOf.get(r) ?? holdersOf.set(r, new Set()).get(r)).add(t.userId);
}

/**
 * A lane is decided by majority vote across every copy of a recording, so the
 * tag on a viewer's own row is not the lane the engine placed it in. What is
 * checked is independent of that vote and still catches an invented year: the
 * viewer holds a recording from that year that somebody's row puts in the lane.
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
const kinds = new Map();

for (const uid of [...new Set(tracks.map((t) => t.userId))]) {
  const r = observe(ref, buildProfile(uid, tracks, ref), {});
  r.candidates.forEach((c, i) => {
    total++;
    const card = toFeedCard(ref, c, uid, byId, i + 1);
    const rel = card.relation;
    const where = `${c.family} / ${card.title}`;

    // 1. every card carries a drawing
    if (!rel) { note("card has no drawing at all", where); return; }
    drawn++;
    items += rel.items.length;
    kinds.set(rel.of, (kinds.get(rel.of) ?? 0) + 1);

    // 2. a drawing has to say something: both sides present, and a caption
    const yours = rel.items.filter((x) => x.state === "yours");
    const offered = rel.items.filter((x) => x.state === "offered");
    if (offered.length < 1) note("nothing in the drawing is being offered", where);
    if (new Set(rel.items.map((x) => x.id)).size !== rel.items.length)
      note("the same item twice", where);

    // 3. artwork is a real url or absent; never a placeholder standing in
    for (const it of rel.items)
      if (it.imageUrl !== null && !/^https?:\/\//.test(it.imageUrl))
        note("item artwork is not a real url", `${where}: ${it.imageUrl}`);

    const mine = heldSongs.get(uid) ?? new Set();
    const cardAlbums = new Set(c.tracks.map((wk) => ref.works.get(wk)?.albumId).filter(Boolean));
    const cardArtists = new Set(
      c.tracks.map((wk) => (ref.works.get(wk)?.artist ?? "").toLowerCase()).filter(Boolean));

    const dated = rel.items.filter((x) => x.year !== null);
    if (rel.axis) {
      if (dated.length !== rel.items.length)
        note("a dated drawing has an undated item", where);
      const ys = dated.map((x) => x.year);
      if (rel.axis.from !== Math.min(...ys) || rel.axis.to !== Math.max(...ys))
        note("axis does not bound the items", `${where}: ${rel.axis.from}-${rel.axis.to}`);
      if (ys.some((y, n) => n > 0 && y < ys[n - 1])) note("items are not in date order", where);
    }

    if (rel.of === "records") {
      for (const it of rel.items) {
        const makers = [...(albumArtist.get(it.id) ?? [])];
        const union = (m) => {
          const out = new Set();
          for (const mk of makers) for (const v of m.get(`${mk}|${record(it.name)}`) ?? []) out.add(v);
          return out;
        };
        /**
         * No invented dates. A record sits at a year the rows give it: its own
         * edition's, or the earliest across editions of the same record where
         * the drawing folded them. Which of those applies is the drawing's
         * business; that the year exists at all is this file's.
         */
        const years = new Set([...union(recordYears), ...(albumIdYears.get(it.id) ?? [])]);
        if (it.year !== null && years.size && !years.has(it.year))
          note("record placed at a year no row gives it",
            `${where}: ${it.name} at ${it.year}, rows say ${[...years].sort()}`);
        const on = new Set([...union(albumSongs), ...(albumIdSongs.get(it.id) ?? [])]);
        if (it.state === "yours" && on.size && ![...on].some((x) => mine.has(x)))
          note("a record the viewer holds nothing from marked yours", `${where}: ${it.name}`);
        /**
         * Context means neither side has it. Checked on the album id alone,
         * because the name group pulls in every edition of the record and the
         * viewer holding a different pressing of it is exactly the case the
         * drawing is entitled to treat as a separate item.
         */
        const thisPressing = albumIdSongs.get(it.id) ?? new Set();
        if (it.state === "other" && thisPressing.size
            && [...thisPressing].some((x) => mine.has(x)))
          note("a record the viewer holds marked as context", `${where}: ${it.name}`);
      }
      if (!rel.items.some((x) => x.state === "offered"))
        note("a records drawing with nothing offered", where);
    }

    if (rel.of === "artists") {
      for (const it of rel.items) {
        const name = (ref.artists.get(it.id)?.name ?? "").toLowerCase();
        const all = artistSongs.get(name) ?? new Set();
        const has = [...all].some((x) => mine.has(x));
        if (it.state === "yours" && !has)
          note("an artist the viewer holds nothing by marked yours", `${where}: ${it.name}`);
        if (it.state === "offered") {
          if (!cardArtists.has(name))
            note("an artist the card does not open marked offered", `${where}: ${it.name}`);
          const lane = c.connection.label;
          const kept = [...(ref.subgenreWorks.get(lane) ?? [])].some(
            (wk) => ref.works.get(wk)?.artistKey === it.id && ref.works.get(wk)?.holders.has(uid));
          if (kept) note("an artist the viewer already keeps here marked as new", `${where}: ${it.name}`);
        }
        if (it.year !== null) {
          const ys = [...all].flatMap((x) => [...(songYears.get(x) ?? [])]);
          if (ys.length && (it.year < Math.min(...ys) || it.year > Math.max(...ys)))
            note("an artist placed outside the years of their own music",
              `${where}: ${it.name} at ${it.year}`);
        }
      }
    }
  });
}

console.log(`checked ${total} cards, ${drawn} with a drawing (${((drawn / total) * 100).toFixed(1)}%), ${items} items`);
console.log([...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "), "\n");
const ks = Object.keys(fails);
if (!ks.length) console.log("INVARIANT HOLDS — every card draws its relation, and every mark on it is in the rows");
for (const k of ks) { console.log(`✗ ${fails[k].n}  ${k}`); for (const e of fails[k].ex) console.log(`      ${e}`); }
await prisma.$disconnect();

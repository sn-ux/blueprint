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
  const base = raw.replace(/\(.*?\)|\[.*?\]/g, " ").split(/\s+-\s+/)[0];
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
    if (year !== null && t.albumType === "album")
      (recordYears.get(key) ?? recordYears.set(key, new Set()).get(key)).add(year);
  }
  (heldSongs.get(t.userId) ?? heldSongs.set(t.userId, new Set()).get(t.userId)).add(r);
  (heldArtists.get(t.userId) ?? heldArtists.set(t.userId, new Set()).get(t.userId)).add(artist);
  (artistSongs.get(artist) ?? artistSongs.set(artist, new Set()).get(artist)).add(r);
  (artistPressings.get(artist) ?? artistPressings.set(artist, new Set()).get(artist)).add(t.spotifyId);
  (tagsOf.get(r) ?? tagsOf.set(r, new Set()).get(r)).add(t.blueprintSubgenre);
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
    kinds.set(rel.kind, (kinds.get(rel.kind) ?? 0) + 1);

    // 2. a drawing has to say something: both sides present, and a caption
    const yours = rel.items.filter((x) => x.state === "yours");
    const offered = rel.items.filter((x) => x.state === "offered");
    if (offered.length < 1) note("nothing in the drawing is being offered", where);
    if (!rel.caption || rel.caption.length < 4) note("drawing has no caption", where);
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

    if (rel.kind === "chronology") {
      const ys = rel.items.map((x) => x.year);
      if (ys.some((y) => y === null)) note("a dated drawing has an undated item", where);
      if (ys.some((y, n) => n > 0 && y < ys[n - 1])) note("items are not in date order", where);
      if (!rel.axis) note("a dated drawing has no axis", where);
      else if (rel.axis.from !== Math.min(...ys) || rel.axis.to !== Math.max(...ys))
        note("axis does not bound the items", `${where}: ${rel.axis.from}-${rel.axis.to}`);
      if (yours.length < 2) note("fewer than two of the viewer's own items", where);

      for (const it of rel.items) {
        if (it.id.startsWith("y")) {
          // a year of a lane
          const year = +it.id.slice(1);
          if (year !== it.year) note("year item mislabelled", `${where}: ${it.name}`);
          const lane = c.connection.label;
          if (it.state === "yours" && !(heldYears.get(`${uid}|${year}`) ?? new Set()).has(lane))
            note("a year the viewer holds nothing from marked yours", `${where}: ${year} in ${lane}`);
          if (it.state === "offered" && !c.tracks.some((wk) => ref.works.get(wk)?.year === year))
            note("offered year is not a year the card's tracks carry", `${where}: ${year}`);
          continue;
        }
        // a record
        const makers = [...(albumArtist.get(it.id) ?? [])];
        const union = (m) => {
          const out = new Set();
          for (const mk of makers) for (const v of m.get(`${mk}|${record(it.name)}`) ?? []) out.add(v);
          return out;
        };
        const years = union(recordYears);
        if (!years.size) { note("record not in the corpus", `${where}: ${it.name}`); continue; }
        if (it.year !== Math.min(...years))
          note("record placed at a year the rows do not give it",
            `${where}: ${it.name} at ${it.year}, rows say ${[...years].sort()}`);

        const axisArtist = (ref.artists.get(
          c.subject.kind === "artist" ? c.subject.key
            : ref.albums.get(c.subject.key)?.artistKey ?? "")?.name ?? "").toLowerCase();
        if (axisArtist && makers.length && !makers.includes(axisArtist))
          note("a record on this axis is by another artist", `${where}: ${it.name} is by ${makers[0]}`);

        const on = union(albumSongs);
        if (it.state === "yours" && ![...on].some((x) => mine.has(x)))
          note("a record the viewer holds nothing from marked yours", `${where}: ${it.name}`);
        if (it.state === "offered" && !cardAlbums.has(it.id) && `album:${it.id}` !== card.subjectKey)
          note("a record the card does not open marked offered", `${where}: ${it.name}`);
      }
    }

    if (rel.kind === "fill") {
      const s = rel.share;
      if (!s) { note("a fill drawing with no share", where); return; }
      if (s.total <= 0 || s.yours < 0 || s.offered <= 0)
        note("fill share is not a real set", `${where}: ${JSON.stringify(s)}`);
      if (s.yours + s.offered > s.total)
        note("fill share exceeds its own set", `${where}: ${JSON.stringify(s)}`);

      // the viewer's share, counted off the rows
      if (c.subject.kind === "album") {
        const makers = [...(albumArtist.get(c.subject.key) ?? [])];
        const on = new Set();
        for (const mk of makers)
          for (const v of albumSongs.get(`${mk}|${record(c.subject.label)}`) ?? []) on.add(v);
        const real = [...on].filter((x) => mine.has(x)).length;
        const cap = makers.reduce((n, mk) =>
          n + (albumPressings.get(`${mk}|${record(c.subject.label)}`)?.size ?? 0), 0);
        if (cap && s.yours > cap)
          note("fill claims more of a record than the rows have", `${where}: ${s.yours} of ${cap}`);
        if (on.size && real === 0 && s.yours > 0)
          note("fill claims holdings on a record the viewer has none of", `${where}: ${s.yours}`);
      }
      if (c.subject.kind === "artist") {
        const name = (ref.artists.get(c.subject.key)?.name ?? "").toLowerCase();
        const all = artistSongs.get(name) ?? new Set();
        const real = [...all].filter((x) => mine.has(x)).length;
        const cap = artistPressings.get(name)?.size ?? 0;
        if (cap && s.total > cap)
          note("fill claims a larger catalogue than the rows have", `${where}: ${s.total} of ${cap}`);
        if (real === 0 && s.yours > 0)
          note("fill claims holdings by an artist the viewer has none of", `${where}: ${s.yours}`);
      }
      for (const it of offered.slice(1))
        if (!cardAlbums.has(it.id) && !c.tracks.includes(it.id))
          note("a fill drawing shows something the card does not open", `${where}: ${it.name}`);
    }

    if (rel.kind === "hub") {
      if (offered.length !== 1) note("a hub without exactly one subject", where);
      if (yours.length < 1) note("a hub with nothing of the viewer's on it", where);
      for (const it of yours) {
        if (byId.has(it.id)) continue;               // a person who holds it
        const makers = [...(albumArtist.get(it.id) ?? [])];
        const on = new Set();
        for (const mk of makers) for (const v of albumSongs.get(`${mk}|${record(it.name)}`) ?? []) on.add(v);
        if (on.size && ![...on].some((x) => mine.has(x)))
          note("a hub shows a record the viewer holds nothing from", `${where}: ${it.name}`);
      }
    }

    if (rel.kind === "neighbours") {
      const lane = c.connection.label;
      for (const it of rel.items) {
        const name = (ref.artists.get(it.id)?.name ?? "").toLowerCase();
        const all = artistSongs.get(name) ?? new Set();
        const holds = [...all].some((x) => mine.has(x));
        if (it.state === "yours" && !holds)
          note("an artist the viewer holds nothing by marked yours", `${where}: ${it.name}`);
        if (it.state === "offered" && !cardArtists.has(name))
          note("an artist the card does not open marked offered", `${where}: ${it.name}`);
        if (it.state === "offered") {
          // and genuinely new to this scene, or it is not an introduction
          const inLane = [...(ref.subgenreWorks.get(lane) ?? [])]
            .some((wk) => ref.works.get(wk)?.artistKey === it.id
              && ref.works.get(wk)?.holders.has(uid));
          if (inLane) note("an artist the viewer already keeps here marked as new", `${where}: ${it.name}`);
        }
      }
      if (yours.length < 2) note("a neighbourhood with fewer than two of the viewer's artists", where);
    }
  });
}

console.log(`checked ${total} cards, ${drawn} with a drawing (${((drawn / total) * 100).toFixed(1)}%), ${items} items`);
console.log([...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "), "\n");
const ks = Object.keys(fails);
if (!ks.length) console.log("INVARIANT HOLDS — every card draws its relation, and every mark on it is in the rows");
for (const k of ks) { console.log(`✗ ${fails[k].n}  ${k}`); for (const e of fails[k].ex) console.log(`      ${e}`); }
await prisma.$disconnect();

/**
 * Everything Blueprint can show you is music your friends have and you do not.
 *
 * That sentence is the product, and it is a constraint on generation rather
 * than a description of it. A card is a group of their recordings you lack;
 * the subject of the card is that music; and the sentence on the front exists
 * to say why this particular handful, out of the twenty thousand tracks your
 * friends hold, is worth your evening.
 *
 * The previous version of this file had it backwards. It searched a listener's
 * own library for statistically unusual facts and then attached music to
 * whichever fact scored highest, which produced cards that opened the
 * listener's *own* tracks — an observation dressed as a recommendation. The
 * statistics were sound and pointed at the wrong subject.
 *
 * So the order is fixed here: find the friend music first, group it into
 * something coherent, then find the reason. A candidate that cannot name
 * recordings the viewer lacks does not exist, and there is deliberately no
 * branch that can emit one.
 *
 * Connections are set membership and never inference. "You hold this artist",
 * "you hold four tracks of this record", "you have three hundred tracks of
 * this lane" are facts about the library. Nothing here models what anyone
 * likes, and there is nowhere to put it if it did.
 */
import { poissonUpperBits } from "./stats";
import { holdRate, measureRates, type Rates } from "./rates";
import { albumRun, artistKeyOf, type Reference } from "./reference";
import type { Profile } from "./profile";

export type FamilyId =
  | "FINISH_THE_RECORD"
  | "YOU_HAVE_THE_HITS"
  | "BEFORE_YOU_ARRIVED"
  | "ONE_RECORD_LEFT"
  | "GUEST_ON_YOUR_RECORDS"
  | "ONLY_ONE_FRIEND_HAS_IT"
  | "EVERYONE_BUT_YOU"
  | "A_SCENE_YOU_TOUCHED"
  | "A_YEAR_IN_YOUR_LANE"
  | "DEEPER_ON_AN_ARTIST"
  | "THE_RECORD_YOU_SKIPPED"
  | "NEW_IN_YOUR_LANE"
  | "WHAT_THEY_HAVE"
  | "THEY_ALL_KEEP_IT"
  | "SINCE_YOU_STOPPED"
  | "RECORD_BEFORE_YOURS"
  | "RECORD_AFTER_YOURS"
  | "RECORD_BETWEEN_YOURS"
  | "ARTIST_BEFORE_YOURS"
  | "ARTIST_AFTER_YOURS"
  | "ARTIST_BETWEEN_YOURS"
  | "GENRE_PART_BEFORE"
  | "GENRE_PART_AFTER"
  | "GENRE_GAP"
  | "RELATED_GENRE"
  | "RELATED_GENRE_CONSENSUS";

/** Why this viewer, stated as something their library contains. */
export type ConnectionKind =
  | "ALBUM_STARTED" | "ARTIST_HELD" | "LANE_DEPTH" | "PERSON" | "GUEST_ON_HELD";



export interface Holder { uid: string; count: number }

export interface Candidate {
  family: FamilyId;
  key: string;
  subject: { kind: "album" | "artist" | "set"; key: string; label: string; artist?: string };
  /** Friend recordings the viewer does not hold. The card is these. */
  tracks: string[];
  /** Which friends supply them, and how much each does. */
  holders: Holder[];
  connection: { kind: ConnectionKind; key: string; label: string; yours: number };
  facts: Record<string, number | string>;
  /** Corroboration carried by the payload, in friend-tracks. */
  evidence: number;
  /**
   * Expected tracks kept, from the measured curves. Evidence that the music is
   * relevant — not, on its own, a reason to show it.
   */
  relevance: number;
  /**
   * The share of its bounded subject this card opens.
   *
   * Every card is about something with a known size: a record has an
   * authoritative track count, an artist has a catalogue, a friend's lane has
   * a size. Sixteen tracks of a nineteen-track record is most of that record.
   * Thirty tracks of an artist with a hundred and sixty-three is a sample of
   * them, and showing it expands nothing — the artist was already visible.
   */
  discovery: number;
  /** How large the bounded subject is, for the discovery share. */
  subjectSize: number;
  /**
   * How many qualifying recordings there are in total, before the card is
   * trimmed to what a page can show.
   *
   * Scoring on the trimmed count was a real defect and not a cosmetic one:
   * every card capped at thirty carried near-identical evidence, so a friend
   * with a thousand rap tracks and a friend with sixty-eight scored the same
   * and the order between them was effectively arbitrary.
   */
  available: number;
  score: number;
  /** Recordings touched, for keeping a feed from repeating itself. */
  footprint: string[];
}

// ── floors ──────────────────────────────────────────────────────────────────
/** Below this a card is not worth opening, whatever else is true of it. */
const MIN_TRACKS = 4;
const MIN_LANE_DEPTH = 15;
const MIN_ARTIST_HELD = 2;
const MIN_ALBUM_HELD = 1;
/** A lane recommendation needs more than one person's enthusiasm. */
const MIN_FRIENDS_FOR_LANE = 2;
/**
 * How much of an artist makes their catalogue a run you have followed.
 *
 * Below this, "before the records you like" is describing one record rather
 * than a shelf.
 */
const DISCOGRAPHY_HELD = 5;
/** Years of a genre on the shelf before its shape is a run you have followed. */
const GENRE_RUN_YEARS = 4;
/** A span worth naming is more than one stray year. */
const GENRE_SPAN_YEARS = 2;
/** A year or two without a release does not break a run. */
const GENRE_GAP_STEP = 3;
/** Artists two genres share before one is a doorway into the other. */
const SHARED_MANY = 3;
/** And below this they are barely the same music at all. */
const SHARED_FEW = 1;
/**
 * And it has to be more agreement than the lane's own base rate predicts.
 *
 * Deliberately low. With four friends the expected number holding any given
 * artist in a lane they all occupy is close to two, so a two-bit bar left this
 * family with nothing at all. Half a bit still excludes the case this gate
 * exists for — the household name everybody has — while letting a genuine
 * shared enthusiasm through. It tightens on its own as the network grows,
 * because the expectation gets sharper.
 */
const LANE_SURPRISE_BITS = 0.5;
const MAX_TRACKS = 30;
/**
 * A record somebody could plausibly finish.
 *
 * "Gold — Burt Bacharach & Friends" is forty-one tracks by twenty artists and
 * "Motown: The Complete No. 1's" is two hundred and two. Spotify marks both
 * compilation, which is the signal this filter was already carrying and not
 * reading — only singles were being excluded. Holding seven tracks off a
 * various-artists hits collection is not the start of anything, and the card
 * built on it implied a relationship with an artist the listener had nothing
 * by: Surya has zero Burt Bacharach recordings. The cap catches the rest, the
 * catalogue dumps that carry an album type of "album".
 */
const MAX_ALBUM_TRACKS = 30;
/** Above this many artists, an album is a collection and has no one maker. */
const VARIOUS_ARTISTS_AT = 4;

/**
 * When two cards describe the same music, which reason survives.
 *
 * Several families can land on one record: "the rest of this album", "the
 * album behind the singles you took" and "the only record of theirs you never
 * got" are the same tracks with different things to say about them. They score
 * identically — same music, same relevance, same discovery — so consolidation
 * was keeping whichever came first, and the vaguest reason won every time.
 * YOU_HAVE_THE_HITS produced a hundred and forty-five candidates and showed
 * none of them.
 *
 * This orders reasons by how much they narrow the "why", and it is used only
 * to break that tie. It never reorders two cards that are about different
 * music, so it is not a thumb on the ranking.
 */
const REASON_SPECIFICITY: Record<FamilyId, number> = {
  ARTIST_BETWEEN_YOURS: 10,
  GENRE_GAP: 10,
  RECORD_BETWEEN_YOURS: 10,
  ARTIST_BEFORE_YOURS: 9,
  ARTIST_AFTER_YOURS: 9,
  GENRE_PART_BEFORE: 9,
  GENRE_PART_AFTER: 9,
  RELATED_GENRE_CONSENSUS: 8,
  RELATED_GENRE: 7,
  RECORD_BEFORE_YOURS: 10,
  RECORD_AFTER_YOURS: 10,
  ONE_RECORD_LEFT: 9,
  YOU_HAVE_THE_HITS: 8,
  BEFORE_YOU_ARRIVED: 7,
  SINCE_YOU_STOPPED: 7,
  GUEST_ON_YOUR_RECORDS: 7,
  ONLY_ONE_FRIEND_HAS_IT: 6,
  EVERYONE_BUT_YOU: 6,
  A_YEAR_IN_YOUR_LANE: 6,
  THE_RECORD_YOU_SKIPPED: 5,
  FINISH_THE_RECORD: 4,
  THEY_ALL_KEEP_IT: 4,
  A_SCENE_YOU_TOUCHED: 3,
  NEW_IN_YOUR_LANE: 3,
  WHAT_THEY_HAVE: 2,
  DEEPER_ON_AN_ARTIST: 1,
};
export const specificityOf = (f: FamilyId) => REASON_SPECIFICITY[f] ?? 0;

/**
 * Which families are offered first, before score is consulted.
 *
 * Not a weight and not a thumb on the scale of relevance: the ordering asks
 * for the tier first and for the score within it, so a card of a prioritised
 * kind comes ahead of a better-scoring card of an older kind without any
 * number about the music being altered. Repetition control still applies
 * afterwards, so a tier cannot fill the whole first screen with one family.
 */
const TIER: Partial<Record<FamilyId, number>> = {
  RECORD_BEFORE_YOURS: 1,
  RECORD_AFTER_YOURS: 1,
  RECORD_BETWEEN_YOURS: 1,
  ARTIST_BEFORE_YOURS: 1,
  ARTIST_AFTER_YOURS: 1,
  ARTIST_BETWEEN_YOURS: 1,
  GENRE_PART_BEFORE: 1,
  GENRE_PART_AFTER: 1,
  GENRE_GAP: 1,
  RELATED_GENRE: 1,
  RELATED_GENRE_CONSENSUS: 1,
};
export const tierOf = (f: FamilyId) => TIER[f] ?? 0;

/** A guest credit in a track title: "(feat. Ab-Soul)", "ft. Nas". */
const GUEST_CREDIT = /\b(?:feat|ft)\.?\s+([^)\]]+)/i;

const UNCLASSIFIED = new Set(["unknown", "other", "", "n/a", "misc"]);
const classified = (lane: string) => !UNCLASSIFIED.has(lane.toLowerCase().trim());

/**
 * Who a record is by, or nobody when it is by twenty people.
 *
 * An album's artist is taken from whichever of its tracks the index saw first,
 * which is arbitrary for a collection and actively misleading on a card.
 */
function albumArtist(ref: Reference, aid: string): string {
  const alb = ref.albums.get(aid);
  if (!alb) return "";
  const arts = new Set<string>();
  for (const wk of alb.works) {
    const k = ref.works.get(wk)?.artistKey;
    if (k) arts.add(k);
  }
  return arts.size >= VARIOUS_ARTISTS_AT ? "Various artists" : alb.artist;
}

/**
 * What a card is worth: relevance, weighted by how much of its subject it opens.
 *
 * Expected-keeps alone makes the mathematically correct move an endless supply
 * of the artists somebody already has most of — thirty more Kanye tracks to a
 * listener with eighty-nine of them scores beautifully and expands nothing.
 * Relevance answers "would I be into this". It cannot also answer "is this
 * worth showing me", and using it for both is what produced that feed.
 *
 * Discovery is the second question, and it is structural rather than tuned:
 * the share of a bounded thing that becomes available. A record has an
 * authoritative track count, an artist has a catalogue, a friend's lane has a
 * size — so "sixteen of this record's nineteen tracks" is 0.84 of it and
 * "thirty of this artist's hundred and sixty-three" is 0.18 of them. No
 * penalty is applied to anybody; large subjects simply cannot be opened by one
 * card, which is the true fact about them.
 *
 * The product rewards both: a card has to be music the listener would keep AND
 * have to meaningfully open the thing it is about.
 */
function worth(relevance: number, shown: number, subjectSize: number): number {
  const size = Math.max(shown, subjectSize);
  return relevance * (shown / size);
}

/**
 * How many actual records an artist made, as far as this corpus knows.
 *
 * `a.albums` is keyed by every album id their tracks appear on, which includes
 * singles and compilations — so a caption reading "across the N records of
 * theirs anyone here owns" printed 29 for Kendrick Lamar where 18 is the
 * number of albums. Four hundred and twenty-three artists were affected.
 */
function recordCount(ref: Reference, a: { albums: Map<string, Set<string>> }): number {
  let n = 0;
  for (const aid of a.albums.keys()) if (ref.albums.get(aid)?.albumType === "album") n++;
  return n;
}

/** Measured once per corpus and reused for every viewer of it. */
const RATES = new WeakMap<Reference, Rates>();
export function ratesFor(ref: Reference): Rates {
  let r = RATES.get(ref);
  if (!r) { r = measureRates(ref); RATES.set(ref, r); }
  return r;
}

/** Friend holders of one recording, viewer excluded. */
function friendsOf(ref: Reference, wk: string, viewerId: string): string[] {
  const w = ref.works.get(wk);
  if (!w) return [];
  const out: string[] = [];
  for (const u of w.holders) if (u !== viewerId) out.push(u);
  return out;
}

/**
 * Rank a payload by how many friends independently keep each recording.
 *
 * This is the only ordering applied inside a card, and it is corroboration
 * rather than quality: Blueprint has no play counts, no popularity and no
 * ratings, so "three of them kept this" is the strongest statement available
 * about a track and it is not pretending to be more than that.
 */
/**
 * Build a payload and the people it came from — one set, not two.
 *
 * `only` names the card's evidence set. When a card's sentence is about one
 * person, the tracks must be that person's and the holders must be that
 * person, or the card ends up describing one set of libraries while the screen
 * renders another. That is exactly what happened: a card claiming Chris was
 * the only person here with Common showed Chris's icon and Sahaj's, because
 * the claim came from one rule and the icons were recomputed from every holder
 * of every track in the payload.
 */
function rank(
  ref: Reference, p: Profile, works: Iterable<string>, only?: Set<string>,
): { tracks: string[]; holders: Holder[]; evidence: number; available: number; relevance: number } {
  const rates = ratesFor(ref);
  const scored: { wk: string; n: number; pr: number }[] = [];
  for (const wk of new Set(works)) {
    // The one invariant the product rests on, enforced in the single place
    // every family passes through rather than seven times over.
    //
    // Two families were filtering by album id instead — "a record you have
    // none of" — and recording identity does not respect pressings. A deluxe
    // edition the viewer has never touched can be mostly songs they already
    // own from the original, and four hundred and eighty-seven of a listener's
    // own tracks were being handed back to them as discoveries.
    if (p.works.has(wk)) continue;
    const all = friendsOf(ref, wk, p.userId);
    const fr = only ? all.filter((u) => only.has(u)) : all;
    if (fr.length === 0) continue;
    const w = ref.works.get(wk)!;
    // What the corpus says about somebody in this listener's position: how
    // much of this record, this artist and this lane they already hold.
    const pr = holdRate(
      rates,
      w.albumId ? (p.byAlbum.get(w.albumId)?.size ?? 0) : 0,
      p.byArtist.get(w.artistKey)?.size ?? 0,
      p.bySubgenre.get(w.subgenre)?.size ?? 0,
    );
    scored.push({ wk, n: fr.length, pr });
  }
  // Best first, so a trimmed card keeps the tracks most likely to land.
  scored.sort((a, b) => b.pr - a.pr || b.n - a.n || a.wk.localeCompare(b.wk));

  // Count the holders over what the card actually hands over, not over
  // everything that qualified before the cap. Counting the wider set put
  // "Chris the most, with forty-five" on a card containing thirty tracks —
  // every number on a card has to describe the same set of recordings.
  const top = scored.slice(0, MAX_TRACKS);
  const kept = top.map((x) => x.wk);
  /** Expected tracks kept, over what the card actually shows. */
  const relevance = top.reduce((a, x) => a + x.pr, 0);
  const per = new Map<string, number>();
  let evidence = 0;
  for (const wk of kept) {
    // The same restriction as above. Applying it only to the scoring pass and
    // not to this one was the whole of the Common bug: the payload was one
    // person's, and the holder list — which becomes the card's sentence, its
    // sources and its avatars — was rebuilt from every holder of every track.
    const all = friendsOf(ref, wk, p.userId);
    const fr = only ? all.filter((u) => only.has(u)) : all;
    evidence += fr.length;
    for (const u of fr) per.set(u, (per.get(u) ?? 0) + 1);
  }
  const holders = [...per.entries()]
    .map(([uid, count]) => ({ uid, count }))
    .sort((a, b) => b.count - a.count || a.uid.localeCompare(b.uid));
  return { tracks: kept, holders, evidence, available: scored.length, relevance };
}


// ── 1. FINISH THE RECORD ────────────────────────────────────────────────────
/**
 * A record the viewer has already started, and the rest of it from friends.
 *
 * The tightest connection there is: they have chosen this record once already,
 * and the tracks handed over are the remainder of that exact object.
 */
function finishTheRecord(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [aid, held] of p.byAlbum) {
    if (held.size < MIN_ALBUM_HELD) continue;
    const alb = ref.albums.get(aid);
    if (!alb || alb.albumType !== "album") continue;
    if (alb.totalTracks > MAX_ALBUM_TRACKS) continue;
    const missing = [...alb.works].filter((wk) => !p.works.has(wk));
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, missing);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "FINISH_THE_RECORD",
      key: `finish:${aid}`,
      subject: { kind: "album", key: aid, label: alb.name, artist: albumArtist(ref, aid) },
      tracks, holders, evidence, available,
      connection: { kind: "ALBUM_STARTED", key: aid, label: alb.name, yours: held.size },
      facts: { album: alb.name, artist: albumArtist(ref, aid), yours: held.size,
               total: alb.totalTracks, available,
               deepest: holders[0]?.count ?? 0 },
      relevance,
      discovery: tracks.length / Math.max(tracks.length, alb.totalTracks),
      subjectSize: alb.totalTracks,
      score: worth(relevance, tracks.length, alb.totalTracks),
      footprint: [...tracks, ...held],
    });
  }
  return out;
}

// ── 2. DEEPER ON AN ARTIST ──────────────────────────────────────────────────
/** An artist already in the library, and how much more of them friends keep. */
function deeperOnAnArtist(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [ak, held] of p.byArtist) {
    if (held.size < MIN_ARTIST_HELD) continue;
    const a = ref.artists.get(ak);
    if (!a) continue;
    const missing = [...a.works].filter((wk) => !p.works.has(wk));
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, missing);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "DEEPER_ON_AN_ARTIST",
      key: `deeper:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      tracks, holders, evidence, available,
      connection: { kind: "ARTIST_HELD", key: ak, label: a.name, yours: held.size },
      facts: { artist: a.name, yours: held.size, available,
               deepest: holders[0]?.count ?? 0, records: recordCount(ref, a) },
      relevance,
      discovery: tracks.length / Math.max(tracks.length, a.works.size),
      subjectSize: a.works.size,
      score: worth(relevance, tracks.length, a.works.size),
      footprint: [...tracks, ...held],
    });
  }
  return out;
}

// ── 3. THE RECORD YOU SKIPPED ───────────────────────────────────────────────
/**
 * An artist the viewer holds, and a whole record of theirs they have none of.
 *
 * Distinct from finishing a record and worth its own card: the connection is
 * the artist, and what it hands over is a complete object rather than a
 * remainder.
 */
function theRecordYouSkipped(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [ak, held] of p.byArtist) {
    if (held.size < MIN_ARTIST_HELD + 1) continue;
    const a = ref.artists.get(ak);
    if (!a || a.albums.size < 2) continue;
    for (const [aid, wks] of a.albums) {
      if (p.byAlbum.has(aid)) continue;                 // untouched records only
      const alb = ref.albums.get(aid);
      if (!alb || alb.albumType !== "album") continue;
      if (alb.totalTracks > MAX_ALBUM_TRACKS) continue;
      // This card's whole claim is "a record by somebody you already listen
      // to". On a seven-artist collection that happens to include them it is
      // simply false, however many of its tracks the friends hold.
      const makers = new Set<string>();
      for (const wk of alb.works) {
        const k = ref.works.get(wk)?.artistKey;
        if (k) makers.add(k);
      }
      if (makers.size >= VARIOUS_ARTISTS_AT) continue;
      const { tracks, holders, evidence, available, relevance } = rank(ref, p, wks);
      if (tracks.length < MIN_TRACKS) continue;
      out.push({
        family: "THE_RECORD_YOU_SKIPPED",
        key: `skipped:${aid}`,
        subject: { kind: "album", key: aid, label: alb.name, artist: albumArtist(ref, aid) },
        tracks, holders, evidence, available,
        connection: { kind: "ARTIST_HELD", key: ak, label: a.name, yours: held.size },
        facts: { album: alb.name, artist: a.name, yoursByArtist: held.size,
                 total: alb.totalTracks, available,
                 deepest: holders[0]?.count ?? 0, year: alb.year ?? 0 },
        relevance,
        discovery: tracks.length / Math.max(tracks.length, alb.totalTracks),
        subjectSize: alb.totalTracks,
        score: worth(relevance, tracks.length, alb.totalTracks),
        footprint: [...tracks, ...held],
      });
    }
  }
  return out;
}

// ── 4. NEW IN YOUR LANE ─────────────────────────────────────────────────────
/**
 * An artist the viewer holds nothing of, inside a lane they live in.
 *
 * The widest connection in the system and the only one that can introduce a
 * name from nowhere, so it carries the extra conditions. More than one friend
 * has to keep them, independently; and the agreement has to exceed what the
 * lane's own base rate predicts, which is what stops the card being a list of
 * whoever is famous. That test is the Poisson tail: each friend's chance of
 * having run into this artist is derived from how much of the lane they keep
 * and how much of the lane the artist is, and five people holding a household
 * name is exactly what the null expects, so it carries nothing.
 */
function newInYourLane(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  const friends = ref.users.filter((u) => u !== p.userId);
  if (friends.length < MIN_FRIENDS_FOR_LANE) return out;

  for (const [ak, a] of ref.artists) {
    if (p.byArtist.has(ak)) continue;                   // nothing of theirs held
    let lane = "", laneN = 0;
    for (const [sg, n] of a.subgenres) if (n > laneN) { laneN = n; lane = sg; }
    if (!classified(lane)) continue;
    const yours = p.bySubgenre.get(lane)?.size ?? 0;
    if (yours < MIN_LANE_DEPTH) continue;

    const { tracks, holders, evidence, available, relevance } = rank(ref, p, a.works);
    if (tracks.length < MIN_TRACKS) continue;
    const deep = holders.filter((h) => h.count >= 2);
    if (deep.length < MIN_FRIENDS_FOR_LANE) continue;

    // Is this more agreement than the lane predicts?
    const laneWorks = ref.subgenreWorks.get(lane)?.size ?? 0;
    if (laneWorks < 40) continue;
    const per = Math.min(0.9, a.works.size / laneWorks);
    let lambda = 0;
    for (const uid of friends) {
      const n = ref.subgenreWorksByUser.get(lane)?.get(uid) ?? 0;
      if (n > 0) lambda += 1 - Math.pow(1 - per, n);
    }
    const bits = poissonUpperBits(deep.length, lambda);
    if (bits < LANE_SURPRISE_BITS) continue;

    out.push({
      family: "NEW_IN_YOUR_LANE",
      key: `lane:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      tracks, holders, evidence, available,
      connection: { kind: "LANE_DEPTH", key: lane, label: lane, yours },
      facts: { artist: a.name, lane, yoursInLane: yours, available,
               friends: deep.length, deepest: holders[0]?.count ?? 0,
               expected: Math.round(lambda), bits: +bits.toFixed(1) },
      relevance,
      discovery: tracks.length / Math.max(tracks.length, a.works.size),
      subjectSize: a.works.size,
      score: worth(relevance, tracks.length, a.works.size),
      footprint: tracks,
    });
  }
  return out;
}

// ── 5. WHAT THEY HAVE ───────────────────────────────────────────────────────
/**
 * One named friend, one lane you both live in, and the part of theirs you
 * have never touched.
 *
 * The evidence is a person and their actual saves, both of which stay on the
 * card. It is not a similarity score and there is nothing latent in it.
 */
function whatTheyHave(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [sg, mine] of p.bySubgenre) {
    if (mine.size < MIN_LANE_DEPTH || !classified(sg)) continue;
    const pool = ref.subgenreWorks.get(sg);
    if (!pool) continue;
    for (const uid of ref.users) {
      if (uid === p.userId) continue;
      const theirN = ref.subgenreWorksByUser.get(sg)?.get(uid) ?? 0;
      if (theirN < MIN_LANE_DEPTH) continue;
      const theirs: string[] = [];
      let shared = 0;
      for (const wk of pool) {
        const w = ref.works.get(wk);
        if (!w?.holders.has(uid)) continue;
        if (p.works.has(wk)) { shared++; continue; }
        theirs.push(wk);
      }
      const { tracks, holders, evidence, available, relevance } =
        rank(ref, p, theirs, new Set([uid]));
      if (tracks.length < MIN_TRACKS || holders.length !== 1) continue;
      out.push({
        family: "WHAT_THEY_HAVE",
        key: `theirs:${sg}:${uid}`,
        subject: { kind: "set", key: `${sg}:${uid}`, label: sg },
        tracks, holders, evidence, available,
        connection: { kind: "PERSON", key: uid, label: sg, yours: mine.size },
        facts: { lane: sg, other: uid, yours: mine.size, theirs: theirN,
                 shared, available },
        relevance,
        discovery: tracks.length / Math.max(tracks.length, theirN),
        subjectSize: theirN,
        score: worth(relevance, tracks.length, theirN),
        footprint: tracks,
      });
    }
  }
  return out;
}

// ── 6. THEY ALL KEEP IT ─────────────────────────────────────────────────────
/**
 * The recordings in a lane the viewer occupies that several friends
 * independently kept and they have none of.
 *
 * Agreement between people who did not consult each other is the strongest
 * thing this data says about a track, and it is the whole of the claim.
 */
function theyAllKeepIt(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  const minFriends = Math.min(3, Math.max(2, ref.users.length - 2));
  for (const [sg, mine] of p.bySubgenre) {
    if (mine.size < MIN_LANE_DEPTH || !classified(sg)) continue;
    const pool = ref.subgenreWorks.get(sg);
    if (!pool) continue;
    const agreed: string[] = [];
    for (const wk of pool) {
      if (p.works.has(wk)) continue;
      if (friendsOf(ref, wk, p.userId).length >= minFriends) agreed.push(wk);
    }
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, agreed);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "THEY_ALL_KEEP_IT",
      key: `agreed:${sg}`,
      subject: { kind: "set", key: `agreed:${sg}`, label: sg },
      tracks, holders, evidence, available,
      connection: { kind: "LANE_DEPTH", key: sg, label: sg, yours: mine.size },
      facts: { lane: sg, yours: mine.size, available,
               minFriends, friends: holders.length },
      relevance,
      discovery: tracks.length / Math.max(tracks.length, available),
      subjectSize: available,
      score: worth(relevance, tracks.length, available),
      footprint: tracks,
    });
  }
  return out;
}

// ── 7. SINCE YOU STOPPED ────────────────────────────────────────────────────
/**
 * An artist followed to a point, and what friends hold from after it.
 *
 * Release dates, not save dates — this says where their catalogue stops in
 * your library, which is a fact, rather than when you stopped listening,
 * which is not observable here.
 */
function sinceYouStopped(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [ak, held] of p.byArtist) {
    if (held.size < 3) continue;
    const years = p.yearsOfArtist.get(ak);
    if (!years || years.length < 3) continue;
    const a = ref.artists.get(ak);
    if (!a) continue;
    const cutoff = Math.max(...years);
    const later: string[] = [];
    let latest = cutoff;
    for (const [y, wks] of a.years) {
      if (y <= cutoff + 1) continue;
      latest = Math.max(latest, y);
      for (const wk of wks) if (!p.works.has(wk)) later.push(wk);
    }
    if (latest - cutoff < 3) continue;
    let sinceSize = 0;
    for (const [y, wks] of a.years) if (y > cutoff + 1) sinceSize += wks.size;
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, later);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "SINCE_YOU_STOPPED",
      key: `since:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      tracks, holders, evidence, available,
      connection: { kind: "ARTIST_HELD", key: ak, label: a.name, yours: held.size },
      facts: { artist: a.name, yours: held.size, lastYear: cutoff,
               latestYear: latest, available,
               deepest: holders[0]?.count ?? 0 },
      relevance,
      discovery: tracks.length / Math.max(tracks.length, sinceSize),
      subjectSize: sinceSize,
      score: worth(relevance, tracks.length, sinceSize),
      footprint: [...tracks, ...held],
    });
  }
  return out;
}

// ── 8. YOU HAVE THE HITS ────────────────────────────────────────────────────
/**
 * Every track somebody keeps from a record is one of the most-kept on it.
 *
 * The commonest way to own a record is not to own it: you take the two songs
 * that reached you and the other nine never do. That is visible in the data —
 * rank a record's tracks by how many people here keep them and look at where
 * this listener's picks sit — and it is the difference between "the rest of
 * this record" and the much better "you have the singles; here is the album".
 */
function youHaveTheHits(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [aid, held] of p.byAlbum) {
    const alb = ref.albums.get(aid);
    if (!alb || alb.albumType !== "album" || alb.totalTracks > MAX_ALBUM_TRACKS) continue;
    const known = [...alb.works]
      .map((wk) => ({ wk, h: ref.works.get(wk)!.holders.size }))
      .sort((a, b) => b.h - a.h || a.wk.localeCompare(b.wk));
    if (known.length < 6) continue;
    const ranks: number[] = [];
    known.forEach((x, i) => { if (held.has(x.wk)) ranks.push(i); });
    if (!ranks.length) continue;
    // Everything they took is in the widely-kept third of the record.
    if (Math.max(...ranks) >= known.length / 3) continue;
    const rest = known.filter((x) => !p.works.has(x.wk)).map((x) => x.wk);
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, rest);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "YOU_HAVE_THE_HITS",
      key: `hits:${aid}`,
      subject: { kind: "album", key: aid, label: alb.name, artist: albumArtist(ref, aid) },
      tracks, holders, evidence, available,
      connection: { kind: "ALBUM_STARTED", key: aid, label: alb.name, yours: held.size },
      facts: { album: alb.name, artist: albumArtist(ref, aid), yours: held.size,
               total: alb.totalTracks, topHolders: known[0].h, available },
      relevance, discovery: tracks.length / Math.max(tracks.length, alb.totalTracks),
      subjectSize: alb.totalTracks,
      score: worth(relevance, tracks.length, alb.totalTracks),
      footprint: [...tracks, ...held],
    });
  }
  return out;
}

// ── 9. BEFORE YOU ARRIVED ───────────────────────────────────────────────────
/**
 * The mirror of a catalogue that stops: one that starts late.
 *
 * Somebody who found an artist through a recent record often has nothing from
 * the decade before it, and that earlier work is the least likely thing in
 * their friends' libraries to have ever reached them.
 */
function beforeYouArrived(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [ak, held] of p.byArtist) {
    if (held.size < 3) continue;
    const years = p.yearsOfArtist.get(ak);
    if (!years || years.length < 3) continue;
    const a = ref.artists.get(ak)!;
    const arrived = Math.min(...years);
    let earliest = arrived, size = 0;
    const before: string[] = [];
    for (const [y, wks] of a.years) {
      if (y >= arrived - 1) continue;
      earliest = Math.min(earliest, y); size += wks.size;
      for (const wk of wks) before.push(wk);
    }
    if (arrived - earliest < 4) continue;
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, before);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "BEFORE_YOU_ARRIVED",
      key: `before:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      tracks, holders, evidence, available,
      connection: { kind: "ARTIST_HELD", key: ak, label: a.name, yours: held.size },
      facts: { artist: a.name, yours: held.size, arrived, earliest, available },
      relevance, discovery: tracks.length / Math.max(tracks.length, size),
      subjectSize: size, score: worth(relevance, tracks.length, size),
      footprint: [...tracks, ...held],
    });
  }
  return out;
}

// ── 10. ONE RECORD LEFT ─────────────────────────────────────────────────────
/** Every record of theirs but one. */
function oneRecordLeft(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [ak, held] of p.byArtist) {
    if (held.size < 5) continue;
    const a = ref.artists.get(ak)!;
    const records = [...a.albums.keys()].filter((aid) => {
      const al = ref.albums.get(aid);
      return al?.albumType === "album" && al.totalTracks <= MAX_ALBUM_TRACKS;
    });
    if (records.length < 3) continue;
    const missing = records.filter((aid) => !p.byAlbum.has(aid));
    if (missing.length !== 1) continue;
    const alb = ref.albums.get(missing[0])!;
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, a.albums.get(missing[0])!);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "ONE_RECORD_LEFT",
      key: `last:${missing[0]}`,
      subject: { kind: "album", key: missing[0], label: alb.name, artist: a.name },
      tracks, holders, evidence, available,
      connection: { kind: "ARTIST_HELD", key: ak, label: a.name, yours: held.size },
      facts: { album: alb.name, artist: a.name, records: records.length,
               yours: held.size, total: alb.totalTracks, year: alb.year ?? 0, available },
      relevance, discovery: tracks.length / Math.max(tracks.length, alb.totalTracks),
      subjectSize: alb.totalTracks,
      score: worth(relevance, tracks.length, alb.totalTracks),
      footprint: [...tracks, ...held],
    });
  }
  return out;
}

// ── 11. GUEST ON YOUR RECORDS ───────────────────────────────────────────────
/**
 * Somebody already singing on records in this library, whose own work is
 * absent from it.
 *
 * Eleven per cent of the corpus carries a guest credit in its title and
 * nothing was reading them. It is the strongest connection in the system that
 * is not a record or an artist: this person is literally on music the listener
 * chose, and the card can say which tracks.
 */
function guestOnYourRecords(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  const guests = new Map<string, string[]>();
  for (const wk of p.works) {
    const w = ref.works.get(wk);
    const m = w ? GUEST_CREDIT.exec(w.row.name) : null;
    if (!m) continue;
    for (const raw of m[1].split(/,|&|\band\b/)) {
      const k = artistKeyOf(raw.trim());
      if (k.length < 3 || p.byArtist.has(k) || !ref.artists.has(k)) continue;
      const list = guests.get(k) ?? [];
      list.push(wk); guests.set(k, list);
    }
  }
  for (const [ak, on] of guests) {
    if (on.length < 2) continue;
    const a = ref.artists.get(ak)!;
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, a.works);
    if (tracks.length < MIN_TRACKS) continue;
    const example = ref.works.get(on[0]);
    out.push({
      family: "GUEST_ON_YOUR_RECORDS",
      key: `guest:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      tracks, holders, evidence, available,
      connection: { kind: "GUEST_ON_HELD", key: ak, label: a.name, yours: on.length },
      facts: { artist: a.name, appearances: on.length, available,
               example: example?.name ?? "", exampleArtist: example?.artist ?? "" },
      relevance, discovery: tracks.length / Math.max(tracks.length, a.works.size),
      subjectSize: a.works.size,
      score: worth(relevance, tracks.length, a.works.size),
      footprint: [...tracks, ...on],
    });
  }
  return out;
}

// ── 12. ONLY ONE FRIEND HAS IT ──────────────────────────────────────────────
/**
 * One person here is the only source of something, and they are deep in it.
 *
 * The opposite evidence to consensus and worth its own card: not what everyone
 * agreed on, but the thing exactly one of them went a long way into. Held to a
 * lane the listener occupies, so it is a corner of their own territory rather
 * than a stranger's enthusiasm.
 */
function onlyOneFriendHasIt(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [ak, a] of ref.artists) {
    if (p.byArtist.has(ak)) continue;
    // Sole means sole. The gate used to ask for exactly one friend holding
    // five or more, which let a second friend hold four and still be called
    // nobody — and then have their icon on the card.
    const anyHolder = [...a.worksByUser.entries()].filter(([u]) => u !== p.userId);
    if (anyHolder.length !== 1 || anyHolder[0][1].size < 5) continue;
    const deep = anyHolder;
    let lane = "", laneN = 0;
    for (const [sg, n] of a.subgenres) if (n > laneN) { laneN = n; lane = sg; }
    if (!classified(lane)) continue;
    const yours = p.bySubgenre.get(lane)?.size ?? 0;
    if (yours < MIN_LANE_DEPTH) continue;
    const { tracks, holders, evidence, available, relevance } =
      rank(ref, p, a.works, new Set([deep[0][0]]));
    if (tracks.length < MIN_TRACKS || holders.length !== 1) continue;
    out.push({
      family: "ONLY_ONE_FRIEND_HAS_IT",
      key: `sole:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      tracks, holders, evidence, available,
      connection: { kind: "PERSON", key: deep[0][0], label: lane, yours },
      facts: { artist: a.name, lane, yoursInLane: yours, other: deep[0][0],
               theirDepth: deep[0][1].size, available },
      relevance, discovery: tracks.length / Math.max(tracks.length, a.works.size),
      subjectSize: a.works.size,
      score: worth(relevance, tracks.length, a.works.size),
      footprint: tracks,
    });
  }
  return out;
}

// ── 13. EVERYONE BUT YOU ────────────────────────────────────────────────────
/** Every other library here holds them. This one does not. */
function everyoneButYou(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  const friends = ref.users.length - 1;
  if (friends < 3) return out;
  for (const [ak, a] of ref.artists) {
    if (p.byArtist.has(ak)) continue;
    const holdersDeep = [...a.worksByUser.entries()].filter(([u, st]) => u !== p.userId && st.size >= 2);
    if (holdersDeep.length < friends) continue;
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, a.works);
    if (tracks.length < MIN_TRACKS) continue;
    // The claim has to be true of the card's own evidence, not of a set
    // computed before ranking. A friend whose tracks all fall outside the
    // thirty this card can show drops out of the holders, and then "every
    // other library here" describes three of four.
    if (holders.length !== friends) continue;
    let lane = "", laneN = 0;
    for (const [sg, n] of a.subgenres) if (n > laneN) { laneN = n; lane = sg; }
    out.push({
      family: "EVERYONE_BUT_YOU",
      key: `all:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      tracks, holders, evidence, available,
      connection: { kind: "LANE_DEPTH", key: lane, label: lane, yours: p.bySubgenre.get(lane)?.size ?? 0 },
      facts: { artist: a.name, friends: holdersDeep.length, lane, available },
      relevance, discovery: tracks.length / Math.max(tracks.length, a.works.size),
      subjectSize: a.works.size,
      score: worth(relevance, tracks.length, a.works.size),
      footprint: tracks,
    });
  }
  return out;
}

// ── 14. A SCENE YOU ONLY TOUCHED ────────────────────────────────────────────
/**
 * A lane this listener has one or two tracks of, that somebody here lives in.
 *
 * Distinct from an introduction inside a lane they already occupy: here the
 * door is already ajar — they have something from it — and nobody has ever
 * shown them the room.
 */
function aSceneYouTouched(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [sg, pool] of ref.subgenreWorks) {
    if (!classified(sg)) continue;
    const mine = p.bySubgenre.get(sg)?.size ?? 0;
    if (mine < 1 || mine > 4) continue;
    let deepest = "", depth = 0;
    for (const uid of ref.users) {
      if (uid === p.userId) continue;
      const n = ref.subgenreWorksByUser.get(sg)?.get(uid) ?? 0;
      if (n > depth) { depth = n; deepest = uid; }
    }
    if (depth < 40) continue;
    const { tracks, holders, evidence, available, relevance } =
      rank(ref, p, pool, new Set([deepest]));
    if (tracks.length < MIN_TRACKS + 2 || holders.length !== 1) continue;
    out.push({
      family: "A_SCENE_YOU_TOUCHED",
      key: `scene:${sg}`,
      subject: { kind: "set", key: `scene:${sg}`, label: sg },
      tracks, holders, evidence, available,
      connection: { kind: "PERSON", key: deepest, label: sg, yours: mine },
      facts: { lane: sg, yours: mine, other: deepest, theirDepth: depth, available },
      relevance, discovery: tracks.length / Math.max(tracks.length, depth),
      subjectSize: depth, score: worth(relevance, tracks.length, depth),
      footprint: tracks,
    });
  }
  return out;
}

// ── 15. A YEAR IN YOUR LANE ─────────────────────────────────────────────────
/** One year of a lane this listener lives in, which passed them by. */
function aYearInYourLane(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  const cells = new Map<string, { lane: string; year: number; mine: number; pool: string[] }>();
  for (const [wk, w] of ref.works) {
    if (!w.year || !classified(w.subgenre)) continue;
    const k = `${w.subgenre}|${w.year}`;
    let c = cells.get(k);
    if (!c) { c = { lane: w.subgenre, year: w.year, mine: 0, pool: [] }; cells.set(k, c); }
    if (p.works.has(wk)) c.mine++; else c.pool.push(wk);
  }
  for (const c of cells.values()) {
    const yours = p.bySubgenre.get(c.lane)?.size ?? 0;
    if (yours < MIN_LANE_DEPTH || c.mine > 1) continue;
    const { tracks, holders, evidence, available, relevance } = rank(ref, p, c.pool);
    if (tracks.length < MIN_TRACKS + 2) continue;
    if (holders.length < 2) continue;
    const size = c.pool.length + c.mine;
    out.push({
      family: "A_YEAR_IN_YOUR_LANE",
      key: `year:${c.lane}:${c.year}`,
      subject: { kind: "set", key: `year:${c.lane}:${c.year}`, label: `${c.lane} in ${c.year}` },
      tracks, holders, evidence, available,
      connection: { kind: "LANE_DEPTH", key: c.lane, label: c.lane, yours },
      facts: { lane: c.lane, year: c.year, yours, mine: c.mine, available },
      relevance, discovery: tracks.length / Math.max(tracks.length, size),
      subjectSize: size, score: worth(relevance, tracks.length, size),
      footprint: tracks,
    });
  }
  return out;
}

/**
 * A record of theirs from before, after, or inside the run you own.
 *
 * Three cards, one mechanic: a catalogue you have followed has a shape, and a
 * record either extends it at one end or fills a hole in the middle. The
 * middle is the sharpest of the three — a gap between two records you keep is
 * not something a listener can easily notice about their own shelf — and all
 * three are placed on the drawing that already exists for a record, which
 * puts the offered one among yours in date order.
 *
 * "The albums you like" is plural on purpose: two dated records of theirs on
 * the shelf is what makes a before, an after or a between meaningful, and one
 * is just a record with another record near it.
 */
function discographyOrder(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [ak, held] of p.byArtist) {
    if (held.size < DISCOGRAPHY_HELD) continue;
    const a = ref.artists.get(ak);
    if (!a) continue;

    /**
     * Their albums, from the one definition of that — so the year in the
     * sentence is the year on the drawing.
     */
    const records = albumRun(ref, ak)
      .filter((r) => r.totalTracks <= MAX_ALBUM_TRACKS)
      .map((r) => ({
        ...r,
        mine: [...r.works].some((wk) => p.works.has(wk)),
      }));

    const mineYears = records.filter((r) => r.mine).map((r) => r.year);
    if (new Set(mineYears).size < 2) continue;
    const first = Math.min(...mineYears);
    const last = Math.max(...mineYears);

    for (const r of records) {
      if (r.mine) continue;
      const family: FamilyId =
        r.year < first ? "RECORD_BEFORE_YOURS"
        : r.year > last ? "RECORD_AFTER_YOURS"
        : "RECORD_BETWEEN_YOURS";
      const { tracks, holders, evidence, available, relevance } =
        rank(ref, p, r.works);
      if (tracks.length < MIN_TRACKS) continue;
      const size = Math.max(r.totalTracks || 0, r.works.size);
      const aid = r.ids[0];
      out.push({
        family,
        key: `${family === "RECORD_BEFORE_YOURS" ? "before"
               : family === "RECORD_AFTER_YOURS" ? "after" : "between"}:${aid}`,
        subject: { kind: "album", key: aid, label: r.name, artist: a.name },
        tracks, holders, evidence, available,
        connection: { kind: "ARTIST_HELD", key: ak, label: a.name, yours: held.size },
        facts: {
          artist: a.name, album: r.name, year: r.year,
          yours: held.size, records: new Set(mineYears).size,
          first, last, available,
        },
        relevance,
        discovery: tracks.length / Math.max(tracks.length, size),
        subjectSize: size,
        score: worth(relevance, tracks.length, size),
        footprint: [...tracks, ...held],
      });
    }
  }
  return out;
}

/** The middle year of a set of years. Robust to one reissue far from the rest. */
function midYear(years: number[]): number | null {
  if (years.length === 0) return null;
  const s = [...years].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/**
 * Every artist in a genre, with the era of their work in it and who holds them.
 *
 * One pass per genre, reused by the artist-order and genre-order families, and
 * dated on the earliest year each recording carries rather than whichever
 * pressing was read first.
 */
function genreArtists(ref: Reference, lane: string) {
  const out = new Map<string, { years: number[]; works: Set<string> }>();
  for (const wk of ref.subgenreWorks.get(lane) ?? []) {
    const w = ref.works.get(wk);
    if (!w) continue;
    let a = out.get(w.artistKey);
    if (!a) { a = { years: [], works: new Set() }; out.set(w.artistKey, a); }
    a.works.add(wk);
    if (w.firstYear !== null) a.years.push(w.firstYear);
  }
  return out;
}

/**
 * An artist from a genre you are in, placed before, after or between the
 * artists of it you already keep.
 *
 * The card introduces the artist; the genre's own timeline is the context that
 * says where they sit. A between is the sharpest of the three, because an
 * artist inside the years you already listen to is one you might reasonably
 * have met and have not.
 */
function artistOrder(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [lane, mine] of p.bySubgenre) {
    if (mine.size < MIN_LANE_DEPTH || !classified(lane)) continue;
    const all = genreArtists(ref, lane);

    const yoursEra: number[] = [];
    for (const [ak, a] of all) {
      if (!p.byArtist.has(ak)) continue;
      const y = midYear(a.years);
      if (y !== null) yoursEra.push(y);
    }
    if (new Set(yoursEra).size < 2) continue;
    const first = Math.min(...yoursEra);
    const last = Math.max(...yoursEra);

    for (const [ak, a] of all) {
      if (p.byArtist.has(ak)) continue;
      const era = midYear(a.years);
      if (era === null) continue;
      const family: FamilyId =
        era < first ? "ARTIST_BEFORE_YOURS"
        : era > last ? "ARTIST_AFTER_YOURS"
        : "ARTIST_BETWEEN_YOURS";
      const artist = ref.artists.get(ak);
      if (!artist) continue;
      const { tracks, holders, evidence, available, relevance } =
        rank(ref, p, artist.works);
      if (tracks.length < MIN_TRACKS || holders.length < MIN_FRIENDS_FOR_LANE) continue;
      out.push({
        family,
        key: `${family === "ARTIST_BEFORE_YOURS" ? "artbefore"
               : family === "ARTIST_AFTER_YOURS" ? "artafter" : "artbetween"}:${lane}:${ak}`,
        subject: { kind: "artist", key: ak, label: artist.name },
        tracks, holders, evidence, available,
        connection: { kind: "LANE_DEPTH", key: lane, label: lane, yours: mine.size },
        facts: {
          artist: artist.name, lane, era, first, last,
          yoursInLane: mine.size, peers: new Set(yoursEra).size, available,
        },
        relevance,
        discovery: tracks.length / Math.max(tracks.length, artist.works.size),
        subjectSize: artist.works.size,
        score: worth(relevance, tracks.length, artist.works.size),
        footprint: [...tracks, ...mine],
      });
    }
  }
  return out;
}

/**
 * The part of a genre you have not been to: before your run, after it, or a
 * hole inside it.
 *
 * This is what the year-slice card was reaching for and could not say. A
 * listener's time in a genre has a shape, and what is missing is a span rather
 * than a single year — everything in it before you arrived, everything since
 * you last looked, or a stretch in the middle you went straight past.
 */
function genreOrder(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const [lane, mine] of p.bySubgenre) {
    if (mine.size < MIN_LANE_DEPTH || !classified(lane)) continue;

    const mineYears: number[] = [];
    const byYear = new Map<number, string[]>();
    for (const wk of ref.subgenreWorks.get(lane) ?? []) {
      const w = ref.works.get(wk);
      if (!w || w.firstYear === null) continue;
      if (p.works.has(wk)) { mineYears.push(w.firstYear); continue; }
      const list = byYear.get(w.firstYear) ?? [];
      list.push(wk); byYear.set(w.firstYear, list);
    }
    if (new Set(mineYears).size < GENRE_RUN_YEARS) continue;
    const first = Math.min(...mineYears);
    const last = Math.max(...mineYears);
    const held = new Set(mineYears);

    /**
     * A gap is one unbroken stretch, not every missing year at once.
     *
     * Taking all of them gave a Motown card reading "nothing from 1970 to
     * 2022" to somebody holding records from 1973, 1977 and 1983 — the ends of
     * a scatter rather than a hole. The longest run with nothing in it is the
     * hole, and it is the only one the sentence can honestly name.
     */
    const inside = [...byYear.keys()]
      .filter((y) => y > first && y < last && !held.has(y))
      .sort((x, y) => x - y);
    let runs: number[][] = [];
    for (const y of inside) {
      const tail = runs[runs.length - 1];
      if (tail && y - tail[tail.length - 1] <= GENRE_GAP_STEP) tail.push(y);
      else runs.push([y]);
    }
    /** The run that leaves the widest stretch of the shelf untouched. */
    runs = runs.sort((a, b) =>
      (b[b.length - 1] - b[0]) - (a[a.length - 1] - a[0]) || b.length - a.length);

    const spans: { family: FamilyId; years: number[] }[] = [
      { family: "GENRE_PART_BEFORE", years: [...byYear.keys()].filter((y) => y < first) },
      { family: "GENRE_PART_AFTER", years: [...byYear.keys()].filter((y) => y > last) },
      { family: "GENRE_GAP", years: runs[0] ?? [] },
    ];

    for (const { family, years } of spans) {
      if (years.length < GENRE_SPAN_YEARS) continue;
      const pool: string[] = [];
      for (const y of years) pool.push(...(byYear.get(y) ?? []));
      const { tracks, holders, evidence, available, relevance } = rank(ref, p, pool);
      if (tracks.length < MIN_TRACKS || holders.length < MIN_FRIENDS_FOR_LANE) continue;
      const lo = Math.min(...years);
      const hi = Math.max(...years);
      out.push({
        family,
        key: `${family === "GENRE_PART_BEFORE" ? "gbefore"
               : family === "GENRE_PART_AFTER" ? "gafter" : "ggap"}:${lane}`,
        subject: { kind: "set", key: `${family}:${lane}`, label: lane },
        tracks, holders, evidence, available,
        connection: { kind: "LANE_DEPTH", key: lane, label: lane, yours: mine.size },
        facts: {
          lane, yours: mine.size, first, last, spanFrom: lo, spanTo: hi,
          years: years.length, available,
        },
        relevance,
        discovery: tracks.length / Math.max(tracks.length, pool.length),
        subjectSize: pool.length,
        score: worth(relevance, tracks.length, pool.length),
        footprint: [...tracks, ...mine],
      });
    }
  }
  return out;
}

/**
 * A genre next to one you are in, told by the artists the two share.
 *
 * Shared artists are a fact about the corpus rather than a judgement about
 * sound: the same people made music filed in both places. Two cards fall out
 * of it, and they are opposites. Many shared artists is a doorway — you are
 * most of the way there already. Few shared artists and several friends
 * agreeing anyway is the other thing entirely, and worth saying so.
 */
function relatedGenre(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  const mineArtists = new Map<string, Set<string>>();
  for (const [lane, works] of p.bySubgenre) {
    if (works.size < MIN_LANE_DEPTH || !classified(lane)) continue;
    const set = new Set<string>();
    for (const wk of works) {
      const ak = ref.works.get(wk)?.artistKey;
      if (ak) set.add(ak);
    }
    mineArtists.set(lane, set);
  }

  for (const [lane, yours] of mineArtists) {
    for (const [other, artists] of ref.subgenreWorks) {
      if (other === lane || !classified(other)) continue;
      /**
       * Not a genre the reader is already in — but sharing four artists with
       * somewhere almost always means holding a song or two there, so
       * demanding none at all meant this card never fired once.
       */
      if ((p.bySubgenre.get(other)?.size ?? 0) >= MIN_LANE_DEPTH) continue;
      if (ref.subgenreWorld.get(other) !== ref.subgenreWorld.get(lane)) continue;

      const theirs = new Set<string>();
      for (const wk of artists) {
        const ak = ref.works.get(wk)?.artistKey;
        if (ak) theirs.add(ak);
      }
      let shared = 0;
      for (const ak of yours) if (theirs.has(ak)) shared++;

      const { tracks, holders, evidence, available, relevance } = rank(ref, p, artists);
      if (tracks.length < MIN_TRACKS) continue;
      const family: FamilyId | null =
        shared >= SHARED_MANY ? "RELATED_GENRE"
        : shared <= SHARED_FEW && holders.length >= MIN_FRIENDS_FOR_LANE + 1
          ? "RELATED_GENRE_CONSENSUS"
        : null;
      if (!family) continue;
      out.push({
        family,
        key: `${family === "RELATED_GENRE" ? "related" : "vouched"}:${lane}:${other}`,
        subject: { kind: "set", key: `genre:${other}`, label: other },
        tracks, holders, evidence, available,
        connection: { kind: "LANE_DEPTH", key: lane, label: lane, yours: yours.size },
        facts: {
          lane, otherLane: other, shared, yoursInLane: p.bySubgenre.get(lane)?.size ?? 0,
          world: ref.subgenreWorld.get(lane) ?? "", available,
        },
        relevance,
        discovery: tracks.length / Math.max(tracks.length, artists.size),
        subjectSize: artists.size,
        score: worth(relevance, tracks.length, artists.size),
        footprint: [...tracks],
      });
    }
  }
  return out;
}

/**
 * Three levels, not five.
 *
 * A song collection was only ever a slice of a genre cut by release date, and
 * saying so as a span is what genreOrder does — so the year slice is retired
 * into it. The set several friends independently kept is retired outright: it
 * is the same selection the quick-listen playlist already makes, and making it
 * twice is not two cards.
 */
export const FAMILIES = [
  finishTheRecord, deeperOnAnArtist, theRecordYouSkipped,
  newInYourLane, whatTheyHave, sinceYouStopped,
  youHaveTheHits, beforeYouArrived, oneRecordLeft, guestOnYourRecords,
  onlyOneFriendHasIt, everyoneButYou, aSceneYouTouched,
  discographyOrder, artistOrder, genreOrder, relatedGenre,
];

export function findAll(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const f of FAMILIES) out.push(...f(ref, p));
  // Nothing without friend music can exist. Belt and braces on an invariant
  // the families already enforce, because it is the whole product.
  return out.filter((c) => c.tracks.length >= MIN_TRACKS);
}

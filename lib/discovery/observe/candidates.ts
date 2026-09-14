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
import { type Reference } from "./reference";
import type { Profile } from "./profile";

export type FamilyId =
  | "FINISH_THE_RECORD"
  | "DEEPER_ON_AN_ARTIST"
  | "THE_RECORD_YOU_SKIPPED"
  | "NEW_IN_YOUR_LANE"
  | "WHAT_THEY_HAVE"
  | "THEY_ALL_KEEP_IT"
  | "SINCE_YOU_STOPPED";

/** Why this viewer, stated as something their library contains. */
export type ConnectionKind = "ALBUM_STARTED" | "ARTIST_HELD" | "LANE_DEPTH" | "PERSON";



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
function rank(
  ref: Reference, p: Profile, works: Iterable<string>,
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
    const fr = friendsOf(ref, wk, p.userId);
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
    const fr = friendsOf(ref, wk, p.userId);
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
               deepest: holders[0]?.count ?? 0, records: a.albums.size },
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
      const { tracks, holders, evidence, available, relevance } = rank(ref, p, theirs);
      if (tracks.length < MIN_TRACKS) continue;
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

export const FAMILIES = [
  finishTheRecord, deeperOnAnArtist, theRecordYouSkipped,
  newInYourLane, whatTheyHave, theyAllKeepIt, sinceYouStopped,
];

export function findAll(ref: Reference, p: Profile): Candidate[] {
  const out: Candidate[] = [];
  for (const f of FAMILIES) out.push(...f(ref, p));
  // Nothing without friend music can exist. Belt and braces on an invariant
  // the families already enforce, because it is the whole product.
  return out.filter((c) => c.tracks.length >= MIN_TRACKS);
}

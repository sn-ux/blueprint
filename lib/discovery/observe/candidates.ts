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

/**
 * How specific a connection is — how much it narrows the world.
 *
 * A record you have already started is the tightest reason to hand you the
 * rest of it; a lane you keep three hundred tracks of is a real relationship
 * but a wide one. Product judgment, stated once, and it orders the feed
 * rather than scoring anybody's taste.
 */
export const CONNECTION_WEIGHT: Record<ConnectionKind, number> = {
  ALBUM_STARTED: 1.0, ARTIST_HELD: 0.85, PERSON: 0.65, LANE_DEPTH: 0.5,
};

/**
 * Agreement between people who did not consult each other is the strongest
 * claim available here, so a consensus card is not scored as the wide lane
 * connection it technically has. Without this it lost consolidation to a
 * generic artist card every time and the family never appeared.
 */
const CONSENSUS_WEIGHT = 0.95;

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

const UNCLASSIFIED = new Set(["unknown", "other", "", "n/a", "misc"]);
const classified = (lane: string) => !UNCLASSIFIED.has(lane.toLowerCase().trim());

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
function rank(ref: Reference, p: Profile, works: Iterable<string>): { tracks: string[]; holders: Holder[]; evidence: number } {
  const scored: { wk: string; n: number }[] = [];
  const per = new Map<string, number>();
  let evidence = 0;
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
    scored.push({ wk, n: fr.length });
    evidence += fr.length;
    for (const u of fr) per.set(u, (per.get(u) ?? 0) + 1);
  }
  scored.sort((a, b) => b.n - a.n || a.wk.localeCompare(b.wk));
  const holders = [...per.entries()]
    .map(([uid, count]) => ({ uid, count }))
    .sort((a, b) => b.count - a.count);
  return { tracks: scored.slice(0, MAX_TRACKS).map((x) => x.wk), holders, evidence };
}

/**
 * How sharp the reason is, beyond how specific the connection is.
 *
 * Several families can describe the same music — the rest of an artist, the
 * record of theirs you skipped, and what they released after you stopped are
 * three readings of one catalogue — and consolidation keeps whichever scores
 * highest. Without this, the vaguest of the three usually won, because it
 * carries the most tracks. The sharpest reason should survive.
 */
const SHARPNESS: Record<FamilyId, number> = {
  FINISH_THE_RECORD: 1.30, THE_RECORD_YOU_SKIPPED: 1.25, SINCE_YOU_STOPPED: 1.20,
  THEY_ALL_KEEP_IT: 1.15, NEW_IN_YOUR_LANE: 1.10, WHAT_THEY_HAVE: 1.05,
  DEEPER_ON_AN_ARTIST: 1.0,
};

const scoreOf = (
  family: FamilyId, conn: ConnectionKind, evidence: number, friends: number,
) => CONNECTION_WEIGHT[conn] * SHARPNESS[family]
   * Math.log2(1 + evidence) * (1 + 0.25 * Math.max(0, friends - 1));

/**
 * Thirty more tracks by somebody you already keep fifty-six of is true, and it
 * is not much of a discovery. An album behaves the opposite way — holding four
 * of a record is a stronger reason for the rest of it than holding one — so
 * this applies to artist depth only.
 */
const saturate = (yours: number) => 1 / (1 + yours / 30);

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
    if (!alb || alb.albumType === "single") continue;
    const missing = [...alb.works].filter((wk) => !p.works.has(wk));
    const { tracks, holders, evidence } = rank(ref, p, missing);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "FINISH_THE_RECORD",
      key: `finish:${aid}`,
      subject: { kind: "album", key: aid, label: alb.name, artist: alb.artist },
      tracks, holders, evidence,
      connection: { kind: "ALBUM_STARTED", key: aid, label: alb.name, yours: held.size },
      facts: { album: alb.name, artist: alb.artist, yours: held.size,
               total: alb.totalTracks, available: tracks.length,
               deepest: holders[0]?.count ?? 0 },
      score: scoreOf("FINISH_THE_RECORD", "ALBUM_STARTED", evidence, holders.length),
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
    const { tracks, holders, evidence } = rank(ref, p, missing);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "DEEPER_ON_AN_ARTIST",
      key: `deeper:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      tracks, holders, evidence,
      connection: { kind: "ARTIST_HELD", key: ak, label: a.name, yours: held.size },
      facts: { artist: a.name, yours: held.size, available: tracks.length,
               deepest: holders[0]?.count ?? 0, records: a.albums.size },
      score: scoreOf("DEEPER_ON_AN_ARTIST", "ARTIST_HELD", evidence, holders.length)
             * saturate(held.size),
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
      const { tracks, holders, evidence } = rank(ref, p, wks);
      if (tracks.length < MIN_TRACKS) continue;
      out.push({
        family: "THE_RECORD_YOU_SKIPPED",
        key: `skipped:${aid}`,
        subject: { kind: "album", key: aid, label: alb.name, artist: alb.artist },
        tracks, holders, evidence,
        connection: { kind: "ARTIST_HELD", key: ak, label: a.name, yours: held.size },
        facts: { album: alb.name, artist: a.name, yoursByArtist: held.size,
                 total: alb.totalTracks, available: tracks.length,
                 deepest: holders[0]?.count ?? 0, year: alb.year ?? 0 },
        score: scoreOf("THE_RECORD_YOU_SKIPPED", "ARTIST_HELD", evidence, holders.length),
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

    const { tracks, holders, evidence } = rank(ref, p, a.works);
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
      tracks, holders, evidence,
      connection: { kind: "LANE_DEPTH", key: lane, label: lane, yours },
      facts: { artist: a.name, lane, yoursInLane: yours, available: tracks.length,
               friends: deep.length, deepest: holders[0]?.count ?? 0,
               expected: +lambda.toFixed(2), bits: +bits.toFixed(1) },
      score: scoreOf("NEW_IN_YOUR_LANE", "LANE_DEPTH", evidence, deep.length) * (1 + Math.min(1, bits / 12)),
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
      const { tracks, holders, evidence } = rank(ref, p, theirs);
      if (tracks.length < MIN_TRACKS) continue;
      out.push({
        family: "WHAT_THEY_HAVE",
        key: `theirs:${sg}:${uid}`,
        subject: { kind: "set", key: `${sg}:${uid}`, label: sg },
        tracks, holders, evidence,
        connection: { kind: "PERSON", key: uid, label: sg, yours: mine.size },
        facts: { lane: sg, other: uid, yours: mine.size, theirs: theirN,
                 shared, available: tracks.length },
        score: scoreOf("WHAT_THEY_HAVE", "PERSON", evidence, 1),
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
    const { tracks, holders, evidence } = rank(ref, p, agreed);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "THEY_ALL_KEEP_IT",
      key: `agreed:${sg}`,
      subject: { kind: "set", key: `agreed:${sg}`, label: sg },
      tracks, holders, evidence,
      connection: { kind: "LANE_DEPTH", key: sg, label: sg, yours: mine.size },
      facts: { lane: sg, yours: mine.size, available: tracks.length,
               minFriends, friends: holders.length },
      score: CONSENSUS_WEIGHT * SHARPNESS.THEY_ALL_KEEP_IT
             * Math.log2(1 + evidence) * (1 + 0.25 * Math.max(0, holders.length - 1)),
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
    const { tracks, holders, evidence } = rank(ref, p, later);
    if (tracks.length < MIN_TRACKS) continue;
    out.push({
      family: "SINCE_YOU_STOPPED",
      key: `since:${ak}`,
      subject: { kind: "artist", key: ak, label: a.name },
      tracks, holders, evidence,
      connection: { kind: "ARTIST_HELD", key: ak, label: a.name, yours: held.size },
      facts: { artist: a.name, yours: held.size, lastYear: cutoff,
               latestYear: latest, available: tracks.length,
               deepest: holders[0]?.count ?? 0 },
      score: scoreOf("SINCE_YOU_STOPPED", "ARTIST_HELD", evidence, holders.length),
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

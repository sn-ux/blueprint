import { MIN_ANCHOR_LIBRARY } from "./config";
import type { EngineInput, PersonRow, SetRef, TrackRow } from "./types";

/**
 * Step A — the set primitives.
 *
 * Everything downstream reads this index and nothing else. The one invariant
 * the whole product rests on is enforced here, at construction: no member of
 * any discovery set is in the viewer's library. Enforcing it once, at the
 * source, is what stops every generator from having to remember it.
 */

/** Subgenre bucket the classifier uses when it could not decide. Not a lane. */
export const UNKNOWN_LANE = "unknown";

/**
 * Identity of a recording, independent of which release it came from.
 *
 * A Spotify id identifies a pressing, not a song. "Doo Wop (That Thing)" and
 * "Doo Wop" are two ids for one recording, and the engine told the viewer his
 * friends had a Lauryn Hill track he was missing when he had been holding it
 * all along. 364 of 16,323 candidates — 2.2% — were the same thing.
 *
 * Stripping a trailing parenthetical or dash suffix collapses remasters, mono
 * and stereo versions, live takes, deluxe rereleases and remixes onto one key.
 * It errs toward treating a variant as already owned, which is the right way
 * to be wrong: presenting something the viewer already has as a discovery
 * costs more than withholding a version of it.
 */
export function workKeyOf(name: string, artist: string): string {
  const base = name
    .toLowerCase()
    .replace(/\s*[([].*$/, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${base}␟${artist.toLowerCase().trim()}`;
}

export interface TrackMeta {
  spotifyId: string;
  name: string;
  artist: string;
  album: string | null;
  /** Album artwork, carried through for card rendering. */
  imageUrl: string | null;
  /** The artist's own picture, hydrated separately from track payloads. */
  artistImageUrl: string | null;
  /** Spotify artist identity, where the backfill reached it. */
  artistId: string | null;
  world: string;
  subgenre: string;
  /**
   * Release year, from Spotify's album release date.
   *
   * That date is "2019", "2019-04" or "2019-04-12" depending on what Spotify
   * knows; every precision still carries a year, so the year is taken and the
   * rest is left alone. Null where the date is missing or unparseable —
   * never substituted, because a guessed year would filter real cards out.
   */
  year: number | null;
}

/** The year in a Spotify release date, whatever its precision. */
export function yearOf(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const y = Number(releaseDate.slice(0, 4));
  return Number.isFinite(y) && y > 1000 ? y : null;
}

export interface LaneIndex {
  subgenre: string;
  world: string;
  /** Friend-held tracks in this lane, deduped. */
  friendAll: Set<string>;
  /** Friend-held minus the viewer's library. */
  gap: string[];
  /** Whether the viewer holds anything at all here. Never a ratio. */
  viewerPresent: boolean;
  byFriend: Map<string, Set<string>>;
}

export interface UnitIndex {
  key: string;
  artist: string;
  album?: string;
  /** Every track anyone here holds for this unit. Not a real catalog. */
  observed: Set<string>;
  ownedCount: number;
  /** Observed, not held by the viewer, and held by at least one friend. */
  missing: string[];
  byFriend: Map<string, Set<string>>;
}

/**
 * An album whose real structure we can vouch for.
 *
 * Identity is albumId, never the title: reissues, deluxe editions and
 * rereleases share names and would otherwise be merged into one phantom
 * record. A position is the pair (disc, track) because track numbers restart
 * on each disc while totalTracks counts the whole album.
 */
export interface AuthoritativeAlbum {
  albumId: string;
  title: string;
  artist: string;
  albumType: string;
  totalTracks: number;
  /** "disc:track" → spotifyId, for every position anyone here holds. */
  positions: Map<string, string>;
  ownedPositions: number;
  /** Observed, unowned, and held by a friend — what can actually be offered. */
  missing: string[];
  /** All structural checks passed. Nothing may assert completion without it. */
  consistent: boolean;
  inconsistentBecause: string | null;
}

/**
 * How many sources could meaningfully have contributed evidence here.
 *
 * Coverage is only interpretable against the right denominator. "Four sources
 * have surf rock" means one thing out of five people and another out of five
 * hundred — but dividing by the whole cohort is wrong too, because most of a
 * large cohort was never in a position to contribute: a source with no rock at
 * all is not a source that declined to hold surf rock.
 *
 * So a contextual claim divides by the sources with material in the
 * surrounding neighbourhood — the parent genre for a lane, the lane for an
 * artist. This is set membership, not eligibility inferred from anyone's
 * taste. Track-level consensus is different and deliberately divides by the
 * whole source universe: "everyone in your circle has this" is a claim about
 * the circle, not about a corner of it.
 */
export interface Coverage {
  holders: number;
  eligibleSourceCount: number;
  /** holders / eligibleSourceCount, or 0 when nothing is eligible. */
  sourceCoverage: number;
}

export function coverageOf(holders: number, eligibleSourceCount: number): Coverage {
  return {
    holders,
    eligibleSourceCount,
    sourceCoverage: eligibleSourceCount > 0 ? holders / eligibleSourceCount : 0,
  };
}

export interface DiscoveryIndex {
  viewerId: string;
  viewer: PersonRow;
  friends: PersonRow[];
  anchorFriends: PersonRow[];
  nameOf: Map<string, string>;
  personOf: Map<string, PersonRow>;

  /** U — the viewer's saved set. The exclusion set. */
  U: Set<string>;
  byFriend: Map<string, Set<string>>;
  /** D = F_all − U. Every candidate subject lives in here. */
  D: string[];
  DSet: Set<string>;
  /** Which friends hold each member of D. Only ever computed over D. */
  holders: Map<string, string[]>;

  meta: Map<string, TrackMeta>;
  lanes: Map<string, LaneIndex>;
  worlds: Map<string, { world: string; gap: string[]; viewerPresent: boolean; children: Set<string> }>;
  albums: Map<string, UnitIndex>;
  artists: Map<string, UnitIndex>;
  /** Keyed by albumId. Only albums that survived every structural check. */
  authAlbums: Map<string, AuthoritativeAlbum>;
  /** Title-keys of observed albums fully covered by an authoritative record. */
  authCoveredTitleKeys: Set<string>;

  /** Sources with any material in a genre. The denominator for lane claims. */
  sourcesInWorld: Map<string, Set<string>>;
  /** Sources with any material in a subgenre. The denominator for artist claims. */
  sourcesInLane: Map<string, Set<string>>;
  /** The whole source universe — the denominator for track-level consensus. */
  eligibleSourceUniverse: number;

  /**
   * What the viewer's own library contains, for recipient anchors.
   *
   * These are membership counts over explicit sets — how many tracks by this
   * artist, on this album, in this lane. They are not a profile: nothing here
   * infers a preference, and nothing outside anchor construction reads them.
   */
  viewerByArtist: Map<string, number>;
  viewerByAlbumId: Map<string, number>;
  viewerByLane: Map<string, number>;
  viewerByWorld: Map<string, number>;
  /** Recordings the viewer holds, by work rather than by pressing. */
  viewerWorks: Set<string>;
  /** Authoritative album identity per track, for the subject/deliverable gate. */
  albumIdOf: Map<string, string>;
}

const albumKey = (artist: string, album: string) => `${artist}␟${album}`;

export function buildIndex(input: EngineInput): DiscoveryIndex {
  const { viewerId, people, tracks } = input;

  const personOf = new Map(people.map((p) => [p.id, p]));
  const nameOf = new Map(people.map((p) => [p.id, p.name ?? "Someone"]));
  const viewer = personOf.get(viewerId);
  if (!viewer) throw new Error(`viewer ${viewerId} not present in people`);

  // ── Per-person membership sets ────────────────────────────────────────────
  const byPerson = new Map<string, Set<string>>();
  for (const p of people) byPerson.set(p.id, new Set());
  for (const t of tracks) byPerson.get(t.userId)?.add(t.spotifyId);

  const U = byPerson.get(viewerId) ?? new Set<string>();
  const friends = people.filter((p) => p.id !== viewerId);
  const byFriend = new Map(friends.map((f) => [f.id, byPerson.get(f.id) ?? new Set<string>()]));
  const anchorFriends = friends.filter((f) => (byFriend.get(f.id)?.size ?? 0) >= MIN_ANCHOR_LIBRARY);

  // ── Metadata, first writer wins ───────────────────────────────────────────
  const albumIdOf = new Map<string, string>();
  for (const t of tracks) if (t.albumId && !albumIdOf.has(t.spotifyId)) albumIdOf.set(t.spotifyId, t.albumId);

  const meta = new Map<string, TrackMeta>();
  for (const t of tracks) {
    const seen = meta.get(t.spotifyId);
    if (seen) {
      // Identity and artwork are properties of the recording, not of whose
      // row was read first. A later row carrying an image the first one
      // lacked fills it in; nothing else is overwritten.
      if (!seen.artistId && t.artistId) seen.artistId = t.artistId;
      if (!seen.artistImageUrl && t.artistImageUrl) seen.artistImageUrl = t.artistImageUrl;
      if (!seen.imageUrl && t.imageUrl) seen.imageUrl = t.imageUrl;
      if (seen.year === null) seen.year = yearOf(t.releaseDate);
      continue;
    }
    meta.set(t.spotifyId, {
      spotifyId: t.spotifyId,
      name: t.name,
      artist: t.artist,
      album: t.album,
      imageUrl: t.imageUrl ?? null,
      artistImageUrl: t.artistImageUrl ?? null,
      artistId: t.artistId ?? null,
      world: t.blueprintWorld,
      subgenre: (t.blueprintSubgenre ?? "").trim(),
      year: yearOf(t.releaseDate),
    });
  }

  // ── What the viewer holds, for anchors and for work-level exclusion ───────
  const viewerByArtist = new Map<string, number>();
  const viewerByAlbumId = new Map<string, number>();
  const viewerByLane = new Map<string, number>();
  const viewerByWorld = new Map<string, number>();
  const viewerWorks = new Set<string>();
  const bump = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const t of tracks) {
    if (t.userId !== viewerId) continue;
    bump(viewerByArtist, t.artist);
    if (t.albumId) bump(viewerByAlbumId, t.albumId);
    bump(viewerByWorld, t.blueprintWorld);
    const sub = (t.blueprintSubgenre ?? "").trim();
    if (sub && sub !== UNKNOWN_LANE) bump(viewerByLane, sub);
    viewerWorks.add(workKeyOf(t.name, t.artist));
  }

  // ── D = F_all − U, and who holds each member ──────────────────────────────
  const holders = new Map<string, string[]>();
  for (const t of tracks) {
    if (t.userId === viewerId) continue;
    if (U.has(t.spotifyId)) continue;          // ← the invariant, enforced once
    // …and again at the level of the recording, not the pressing.
    if (viewerWorks.has(workKeyOf(t.name, t.artist))) continue;
    const list = holders.get(t.spotifyId);
    if (list) { if (!list.includes(t.userId)) list.push(t.userId); }
    else holders.set(t.spotifyId, [t.userId]);
  }
  // Holder order decides the order names appear in a caption, and row order
  // from the database is not stable — a metadata backfill was enough to
  // reshuffle it and silently reword a dozen cards. Sorting by name here makes
  // every downstream caption deterministic for the same input.
  for (const list of holders.values()) {
    list.sort((a, b) => (nameOf.get(a) ?? "").localeCompare(nameOf.get(b) ?? ""));
  }
  const D = [...holders.keys()].sort();
  const DSet = new Set(D);

  // ── Lanes: named subgenres only ───────────────────────────────────────────
  const lanes = new Map<string, LaneIndex>();
  const viewerLanes = new Set<string>();
  const viewerWorlds = new Set<string>();
  for (const t of tracks) {
    const sub = (t.blueprintSubgenre ?? "").trim();
    if (t.userId === viewerId) {
      viewerWorlds.add(t.blueprintWorld);
      if (sub && sub !== UNKNOWN_LANE) viewerLanes.add(sub);
      continue;
    }
    if (!sub || sub === UNKNOWN_LANE) continue;
    let lane = lanes.get(sub);
    if (!lane) {
      lane = { subgenre: sub, world: t.blueprintWorld, friendAll: new Set(), gap: [], viewerPresent: false, byFriend: new Map() };
      lanes.set(sub, lane);
    }
    lane.friendAll.add(t.spotifyId);
    let fs = lane.byFriend.get(t.userId);
    if (!fs) { fs = new Set(); lane.byFriend.set(t.userId, fs); }
    fs.add(t.spotifyId);
  }
  for (const lane of lanes.values()) {
    lane.viewerPresent = viewerLanes.has(lane.subgenre);
    lane.gap = [...lane.friendAll].filter((id) => !U.has(id));
  }

  // ── Contextual source universes ───────────────────────────────────────────
  const sourcesInWorld = new Map<string, Set<string>>();
  const sourcesInLane = new Map<string, Set<string>>();
  for (const t of tracks) {
    if (t.userId === viewerId) continue;
    let w = sourcesInWorld.get(t.blueprintWorld);
    if (!w) { w = new Set(); sourcesInWorld.set(t.blueprintWorld, w); }
    w.add(t.userId);
    const sub = (t.blueprintSubgenre ?? "").trim();
    if (!sub || sub === UNKNOWN_LANE) continue;
    let l = sourcesInLane.get(sub);
    if (!l) { l = new Set(); sourcesInLane.set(sub, l); }
    l.add(t.userId);
  }

  // ── Worlds and their named children ───────────────────────────────────────
  const worlds = new Map<string, { world: string; gap: string[]; viewerPresent: boolean; children: Set<string> }>();
  for (const t of tracks) {
    let w = worlds.get(t.blueprintWorld);
    if (!w) {
      w = { world: t.blueprintWorld, gap: [], viewerPresent: viewerWorlds.has(t.blueprintWorld), children: new Set() };
      worlds.set(t.blueprintWorld, w);
    }
    const sub = (t.blueprintSubgenre ?? "").trim();
    if (sub && sub !== UNKNOWN_LANE) w.children.add(sub);
  }
  for (const id of D) {
    const m = meta.get(id);
    if (m) worlds.get(m.world)?.gap.push(id);
  }

  // ── Observed units: albums and artists ────────────────────────────────────
  // "Observed" is load-bearing. These are the tracks these five libraries
  // happen to contain, never a real catalogue. Nothing downstream may treat
  // observed.size as a tracklist length.
  const albums = new Map<string, UnitIndex>();
  const artists = new Map<string, UnitIndex>();

  const touch = (
    map: Map<string, UnitIndex>, key: string, seed: () => UnitIndex, t: TrackRow,
  ) => {
    let u = map.get(key);
    if (!u) { u = seed(); map.set(key, u); }
    u.observed.add(t.spotifyId);
    if (t.userId !== viewerId) {
      let fs = u.byFriend.get(t.userId);
      if (!fs) { fs = new Set(); u.byFriend.set(t.userId, fs); }
      fs.add(t.spotifyId);
    }
    return u;
  };

  for (const t of tracks) {
    if (t.album) {
      touch(albums, albumKey(t.artist, t.album), () => ({
        key: albumKey(t.artist, t.album as string), artist: t.artist, album: t.album as string,
        observed: new Set(), ownedCount: 0, missing: [], byFriend: new Map(),
      }), t);
    }
    touch(artists, t.artist, () => ({
      key: t.artist, artist: t.artist,
      observed: new Set(), ownedCount: 0, missing: [], byFriend: new Map(),
    }), t);
  }

  for (const u of [...albums.values(), ...artists.values()]) {
    let owned = 0;
    const missing: string[] = [];
    for (const id of u.observed) {
      if (U.has(id)) owned++;
      else if (DSet.has(id)) missing.push(id);
      else owned++;   // held under another pressing — owned, not missing
    }
    u.ownedCount = owned;
    u.missing = missing;
  }

  // ── Authoritative album structure ─────────────────────────────────────────
  //
  // Only an album_type of "album" can support a completion claim. Singles and
  // compilations are excluded outright: a compilation's tracklist is an
  // editorial choice, not a work someone can be "missing" part of.
  const grouped = new Map<string, TrackRow[]>();
  for (const t of tracks) {
    if (!t.albumId) continue;
    const list = grouped.get(t.albumId);
    if (list) list.push(t); else grouped.set(t.albumId, [t]);
  }

  const authAlbums = new Map<string, AuthoritativeAlbum>();
  const authCoveredTitleKeys = new Set<string>();

  for (const [albumId, rows2] of grouped) {
    const first = rows2[0];
    const totalTracks = first.albumTotalTracks ?? 0;
    const albumType = first.albumType ?? "";

    let inconsistentBecause: string | null = null;
    if (albumType !== "album") inconsistentBecause = `album_type=${albumType || "unknown"}`;
    else if (!totalTracks || totalTracks < 5) inconsistentBecause = `totalTracks=${totalTracks}`;
    else if (rows2.some((r) => r.albumTotalTracks !== totalTracks)) inconsistentBecause = "totalTracks disagrees across rows";

    const positions = new Map<string, string>();
    let ownedPositions = 0;
    const missing: string[] = [];
    const seenAtPosition = new Map<string, string>();

    if (!inconsistentBecause) {
      for (const r of rows2) {
        const tn = r.trackNumber, dn = r.discNumber ?? 1;
        if (!tn || tn < 1 || tn > totalTracks) { inconsistentBecause = `trackNumber ${tn} outside 1..${totalTracks}`; break; }
        const key = `${dn}:${tn}`;
        const prior = seenAtPosition.get(key);
        // Two different recordings claiming one slot means the identity is not
        // trustworthy — an alternate master, a regional edit, a bad match.
        if (prior && prior !== r.spotifyId) { inconsistentBecause = `two tracks at position ${key}`; break; }
        seenAtPosition.set(key, r.spotifyId);
        positions.set(key, r.spotifyId);
      }
    }
    if (!inconsistentBecause && positions.size > totalTracks) {
      inconsistentBecause = `${positions.size} positions observed on a ${totalTracks}-track album`;
    }

    if (!inconsistentBecause) {
      for (const [, spotifyId] of positions) {
        if (U.has(spotifyId)) ownedPositions++;
        else if (DSet.has(spotifyId)) missing.push(spotifyId);
      }
    }

    authAlbums.set(albumId, {
      albumId, title: first.album ?? "", artist: first.artist, albumType, totalTracks,
      positions, ownedPositions, missing,
      consistent: !inconsistentBecause, inconsistentBecause,
    });
  }

  // An observed title-key is superseded only when every row under it carries
  // consistent authoritative structure; anything mixed stays conservative.
  const titleRows = new Map<string, TrackRow[]>();
  for (const t of tracks) {
    if (!t.album) continue;
    const k = albumKey(t.artist, t.album);
    const list = titleRows.get(k);
    if (list) list.push(t); else titleRows.set(k, [t]);
  }
  for (const [k, list] of titleRows) {
    if (list.every((r) => r.albumId && authAlbums.get(r.albumId)?.consistent)) authCoveredTitleKeys.add(k);
  }

  return {
    viewerId, viewer, friends, anchorFriends, nameOf, personOf,
    U, byFriend, D, DSet, holders,
    meta, lanes, worlds, albums, artists,
    authAlbums, authCoveredTitleKeys,
    sourcesInWorld, sourcesInLane, eligibleSourceUniverse: friends.length,
    viewerByArtist, viewerByAlbumId, viewerByLane, viewerByWorld, viewerWorks, albumIdOf,
  };
}

// ── Helpers shared by generators ────────────────────────────────────────────

export const friendRef = (userId: string): SetRef => ({ kind: "friend", userId });
export const userRef = (userId: string): SetRef => ({ kind: "user", userId });

/** Deterministic id for a set expression — the duplicate-fact key. */
export function setId(expression: string): string {
  let h = 2166136261;
  for (let i = 0; i < expression.length; i++) {
    h ^= expression.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Guard used by every generator before emitting: the invariant, re-asserted. */
export function assertMissing(index: DiscoveryIndex, ids: string[], where: string) {
  for (const id of ids) {
    if (index.U.has(id)) {
      throw new Error(`invariant violated in ${where}: ${id} is in the viewer's library`);
    }
  }
}

/**
 * Friend music, in the shape the app already reads.
 *
 * The card's tracks are the candidate's tracks — recordings the viewer's
 * friends hold and they do not — and every one of them carries the friends who
 * keep it, so the page can show whose library each song came from. There is no
 * branch here that can put the viewer's own music on a card.
 */
import type { FeedCard, FeedPerson, FeedTrack } from "../feed";
import type { CardSubjectType, PersonRow } from "../types";
import type { Band } from "./observe";
import type { Candidate } from "./candidates";
import { render } from "./claims";
import type { Reference } from "./reference";

const CARD_TYPE: Record<string, CardSubjectType> = {
  album: "ALBUM", artist: "ARTIST", set: "SONG_SET",
};

const spotifyUrl = (id: string | null) =>
  (id ? `https://open.spotify.com/track/${id}` : null);

function trackOf(
  ref: Reference, wk: string, viewerId: string, people: Map<string, PersonRow>,
): FeedTrack | null {
  const w = ref.works.get(wk);
  if (!w) return null;
  const friends: FeedPerson[] = [];
  for (const h of w.holders) {
    if (h === viewerId) continue;
    const p = people.get(h);
    friends.push({ id: h, name: p?.name ?? null, image: p?.image ?? null });
  }
  return {
    id: w.row.spotifyId, spotifyId: w.row.spotifyId,
    name: w.name, artist: w.artist, album: w.row.album ?? null,
    imageUrl: w.row.imageUrl ?? null, spotifyUrl: spotifyUrl(w.row.spotifyId),
    friends,
  };
}

function imageOf(ref: Reference, c: Candidate, tracks: FeedTrack[]): string | null {
  if (c.subject.kind === "album") {
    for (const wk of ref.albums.get(c.subject.key)?.works ?? []) {
      const u = ref.works.get(wk)?.row.imageUrl;
      if (u) return u;
    }
  }
  if (c.subject.kind === "artist") {
    for (const wk of ref.artists.get(c.subject.key)?.works ?? []) {
      const r = ref.works.get(wk)?.row;
      if (r?.artistImageUrl) return r.artistImageUrl;
    }
  }
  return tracks.find((t) => t.imageUrl)?.imageUrl ?? null;
}

/** The card's own "why you're getting this" line. Library membership, always. */
function contextOf(c: Candidate, nameOf: (id: string) => string) {
  const label: Record<Candidate["connection"]["kind"], string> = {
    ALBUM_STARTED: `From ${c.connection.label} in your library`,
    ARTIST_HELD: `From ${c.connection.label} in your library`,
    LANE_DEPTH: `From ${c.connection.label} in your library`,
    PERSON: `From ${nameOf(c.connection.key)}'s library`,
  };
  const anchorType: Record<Candidate["connection"]["kind"], string> = {
    ALBUM_STARTED: "ALBUM_PARTIAL", ARTIST_HELD: "ARTIST_PRESENT",
    LANE_DEPTH: "SUBGENRE_PRESENT", PERSON: "SUBGENRE_PRESENT",
  };
  return {
    anchorType: anchorType[c.connection.kind],
    anchorId: c.connection.key,
    anchorName: c.connection.label,
    ownedCount: c.connection.yours,
    shortLabel: label[c.connection.kind],
  };
}

export function toFeedCard(
  ref: Reference, c: Candidate & { band: Band }, viewerId: string,
  people: Map<string, PersonRow>, rank: number, previewLimit = 4,
): FeedCard {
  const nameOf = (id: string) => people.get(id)?.name ?? "someone here";
  const r = render(c, nameOf);
  const tracks = c.tracks
    .map((wk) => trackOf(ref, wk, viewerId, people))
    .filter((t): t is FeedTrack => t !== null);

  let lo: number | null = null, hi: number | null = null;
  for (const wk of c.tracks) {
    const y = ref.works.get(wk)?.year;
    if (y === null || y === undefined) continue;
    lo = lo === null ? y : Math.min(lo, y);
    hi = hi === null ? y : Math.max(hi, y);
  }

  const w0 = c.tracks[0] ? ref.works.get(c.tracks[0]) : undefined;
  const ctx = contextOf(c, nameOf);

  return {
    id: `fr:${c.family}:${c.key}`,
    version: `${c.tracks.length}:${c.holders.map((h) => h.count).join(",")}`,
    rank,
    cardType: CARD_TYPE[c.subject.kind] ?? "SONG_SET",
    qualityBand: c.band,
    title: r.title,
    byline: r.byline,
    caption: r.caption,
    generator: c.family,
    claimType: c.family,
    evidenceStrength: Math.min(1, c.evidence / 40),
    attentionValue: Math.min(1, c.connection.yours / 50),
    score: c.score,
    genre: w0?.world ?? null,
    subgenre: c.subject.kind === "set" ? c.connection.label : (w0?.subgenre ?? null),
    artist: c.subject.kind === "artist" ? c.subject.label : (c.subject.artist ?? null),
    album: c.subject.kind === "album" ? c.subject.label : null,
    subjectImageUrl: imageOf(ref, c, tracks),
    anchor: {
      type: ctx.anchorType, entityName: ctx.anchorName,
      ownedCount: ctx.ownedCount, specificity: c.score,
    },
    recipientContext: ctx as FeedCard["recipientContext"],
    detailExplanation: r.detail,
    distanceBand: c.connection.kind === "LANE_DEPTH" ? "FAR"
      : c.connection.kind === "PERSON" ? "MID" : "NEAR",
    subjectKey: `${c.subject.kind}:${c.subject.key}`,
    sources: c.holders.map((h) => {
      const p = people.get(h.uid);
      return { id: h.uid, name: p?.name ?? null, image: p?.image ?? null };
    }),
    deliverableCount: tracks.length,
    previewTracks: tracks.slice(0, previewLimit),
    releaseYearMin: lo,
    releaseYearMax: hi,
  };
}

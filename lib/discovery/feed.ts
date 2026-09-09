import { prisma } from "@/lib/prisma";
import { runEngine } from "./engine";
import type { DiscoveryIndex } from "./sets";
import type { Candidate, CardSubjectType } from "./types";

/**
 * The recommendation feed as the app consumes it.
 *
 * The engine's internal rationale — component scores, losing claims, set
 * expressions, reason codes — stays on the server. What crosses the wire is
 * what a card and its detail page need to render, and nothing else.
 */

export interface FeedPerson {
  id: string;
  name: string | null;
  image: string | null;
}

export interface FeedTrack {
  id: string;
  spotifyId: string | null;
  name: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  spotifyUrl: string | null;
  /** Sources holding this track, viewer excluded. */
  friends: FeedPerson[];
}

export interface FeedCard {
  /** Stable across runs: the hash of the discovery expression behind it. */
  id: string;
  rank: number;
  cardType: CardSubjectType;
  qualityBand: "EXCEPTIONAL" | "STRONG" | "SOLID";

  /** What the card is about. */
  title: string;
  byline: string;
  caption: string;

  generator: string;
  claimType: string;
  evidenceStrength: number;
  attentionValue: number;
  score: number;

  genre: string | null;
  subgenre: string | null;
  artist: string | null;
  album: string | null;
  imageUrl: string | null;
  /** Present only on a SONG card — the track the card is about. */
  spotifyId: string | null;
  spotifyUrl: string | null;

  /** Named sources behind the recommendation. Never a count. */
  sources: FeedPerson[];
  /** How many tracks the detail page will contain. */
  deliverableCount: number;
  /** A few tracks for the card itself; the full set comes from the detail route. */
  previewTracks: FeedTrack[];
}

const spotifyUrl = (id: string | null) =>
  (id ? `https://open.spotify.com/track/${id}` : null);

function personOf(index: DiscoveryIndex, id: string): FeedPerson {
  const p = index.personOf.get(id);
  return { id, name: p?.name ?? null, image: p?.image ?? null };
}

export function trackOf(index: DiscoveryIndex, spotifyId: string): FeedTrack | null {
  const m = index.meta.get(spotifyId);
  if (!m) return null;
  return {
    id: spotifyId,
    spotifyId,
    name: m.name,
    artist: m.artist,
    album: m.album,
    imageUrl: m.imageUrl ?? null,
    spotifyUrl: spotifyUrl(spotifyId),
    friends: (index.holders.get(spotifyId) ?? []).map((h) => personOf(index, h)),
  };
}

/** Every track a card's detail page must be able to show. */
export function deliverablesOf(index: DiscoveryIndex, c: Candidate): FeedTrack[] {
  const ids = c.subject.type === "Song"
    ? [c.subject.spotifyId]
    : (c.deliverableIds ?? []);
  return ids.map((id) => trackOf(index, id)).filter((t): t is FeedTrack => t !== null);
}

function titleOf(c: Candidate): { title: string; byline: string } {
  const s = c.subject;
  switch (s.type) {
    case "Song": return { title: s.name, byline: s.artist };
    case "Album": return { title: s.album, byline: s.artist };
    case "Artist": return { title: s.artist, byline: "" };
    case "Subgenre": return { title: s.subgenre, byline: "" };
    case "Genre": return { title: s.genre, byline: "" };
    default: return { title: s.label, byline: "" };
  }
}

/**
 * Artwork for a card.
 *
 * A song or album shows its own cover; anything broader borrows the first
 * deliverable track's, which is the only real image available for it. Nothing
 * is generated.
 */
function imageOf(index: DiscoveryIndex, c: Candidate, tracks: FeedTrack[]): string | null {
  if (c.subject.type === "Song") return index.meta.get(c.subject.spotifyId)?.imageUrl ?? null;
  return tracks.find((t) => t.imageUrl)?.imageUrl ?? null;
}

export function toFeedCard(index: DiscoveryIndex, c: Candidate, previewLimit = 4): FeedCard {
  const all = deliverablesOf(index, c);
  const { title, byline } = titleOf(c);
  return {
    id: c.discoverySetId,
    rank: c.feedRank ?? 0,
    cardType: c.cardType as CardSubjectType,
    qualityBand: c.qualityBand ?? "SOLID",
    title,
    byline,
    caption: c.caption ?? "",
    generator: c.generator,
    claimType: c.winningClaim?.claimType ?? "",
    evidenceStrength: c.evidenceStrength,
    attentionValue: c.attentionValue,
    score: c.feedScore ?? c.rankingScore ?? 0,
    genre: c.genre,
    subgenre: c.subgenre,
    artist: c.artist,
    album: c.album,
    imageUrl: imageOf(index, c, all),
    spotifyId: c.subject.type === "Song" ? c.subject.spotifyId : null,
    spotifyUrl: c.subject.type === "Song" ? spotifyUrl(c.subject.spotifyId) : null,
    sources: c.sourceFriendIds.map((id) => personOf(index, id)),
    deliverableCount: all.length,
    previewTracks: all.slice(0, previewLimit),
  };
}

/** Loads the viewer's world and runs the frozen engine over it. */
export async function buildFeed(viewerId: string, limit = 100) {
  const people = await prisma.user.findMany({
    where: { midvaleHidden: false, tracks: { some: {} } },
    select: { id: true, name: true, image: true },
  });
  if (!people.some((p) => p.id === viewerId)) return null;

  const tracks = await prisma.track.findMany({
    where: { user: { midvaleHidden: false } },
    select: {
      userId: true, spotifyId: true, name: true, artist: true, album: true,
      imageUrl: true, blueprintWorld: true, blueprintSubgenre: true,
      albumId: true, albumTotalTracks: true, trackNumber: true, discNumber: true, albumType: true,
    },
  });

  return runEngine({ viewerId, people, tracks }, { feedSize: limit });
}

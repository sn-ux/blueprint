import { prisma } from "@/lib/prisma";
import { label } from "./display";
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
  /**
   * Stable semantic identity of the proposition.
   *
   * The same missed material is the same card tomorrow, which is what lets the
   * feed remember it was already shown. Not a rank, and not regenerated per
   * run — see lib/discovery/identity.ts.
   */
  id: string;
  /** A hash of the facts behind it; changes only when the material does. */
  version: string;
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
  /** Artwork for the card's subject: the artist's picture, the album's cover. */
  subjectImageUrl: string | null;
  /** Why this belongs in front of this viewer. */
  anchor: { type: string; entityName: string; ownedCount: number; specificity: number } | null;

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
  const ids = c.deliverableIds ?? [];
  return ids.map((id) => trackOf(index, id)).filter((t): t is FeedTrack => t !== null);
}

function titleOf(c: Candidate): { title: string; byline: string } {
  const s = c.subject;
  switch (s.type) {
    case "Album": return { title: s.album, byline: s.artist };
    case "Artist": return { title: s.artist, byline: "" };
    // Taxonomy keys are identity; this is the one place they become readable.
    case "Subgenre": return { title: label(s.subgenre), byline: "" };
    case "Genre": return { title: label(s.genre), byline: "" };
    // Scope plus selection rule, already rendered by the generator: a
    // curated set must not carry the bare taxonomy name, which would read as
    // the area's own card.
    case "Songs": return { title: s.title, byline: "" };
    default: return { title: "", byline: "" };
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
  // An artist card shows the artist, not one of their sleeves. Everything else
  // shows the cover of what it is about; a lane borrows the first record in it,
  // which is the only real image such a card has.
  if (c.subject.type === "Artist") {
    for (const t of tracks) {
      const img = index.meta.get(t.spotifyId ?? "")?.artistImageUrl;
      if (img) return img;
    }
  }
  return tracks.find((t) => t.imageUrl)?.imageUrl ?? null;
}

export function toFeedCard(index: DiscoveryIndex, c: Candidate, previewLimit = 4): FeedCard {
  const all = deliverablesOf(index, c);
  const { title, byline } = titleOf(c);
  return {
    id: c.recommendationKey ?? c.discoverySetId,
    version: c.underlyingVersion ?? "",
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
    genre: label(c.genre),
    subgenre: label(c.subgenre),
    artist: c.artist,
    album: c.album,
    subjectImageUrl: imageOf(index, c, all),
    anchor: c.anchor ? {
      type: c.anchor.type,
      entityName: c.anchor.type === "SUBGENRE_PRESENT" || c.anchor.type === "PARENT_GENRE_PRESENT"
        ? label(c.anchor.entityName) : c.anchor.entityName,
      ownedCount: c.anchor.ownedCount,
      specificity: c.anchor.specificity,
    } : null,
    sources: c.sourceFriendIds.map((id) => personOf(index, id)),
    deliverableCount: all.length,
    previewTracks: all.slice(0, previewLimit),
  };
}

/**
 * Loads the viewer's world and runs the engine over it.
 *
 * `limit` bounds only the composed convenience prefix. `all` is always the
 * complete eligible universe, because the feed paginates over that and there
 * is no product boundary at any particular number.
 */
export async function buildFeed(viewerId: string, limit = Infinity) {
  const people = await prisma.user.findMany({
    where: { midvaleHidden: false, tracks: { some: {} } },
    select: { id: true, name: true, image: true },
  });
  if (!people.some((p) => p.id === viewerId)) return null;

  const tracks = await prisma.track.findMany({
    where: { user: { midvaleHidden: false } },
    select: {
      userId: true, spotifyId: true, name: true, artist: true, album: true,
      imageUrl: true, artistId: true, artistImageUrl: true,
      blueprintWorld: true, blueprintSubgenre: true,
      albumId: true, albumTotalTracks: true, trackNumber: true, discNumber: true, albumType: true,
    },
  });

  return runEngine({ viewerId, people, tracks }, { feedSize: limit });
}

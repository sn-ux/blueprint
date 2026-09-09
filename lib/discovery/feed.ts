import { loadCorpus } from "./corpus";
import { label } from "./display";
import { runEngine } from "./engine";
import type { DiscoveryIndex } from "./sets";
import type { Candidate, CardSubjectType, RecipientContext } from "./types";

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
  /**
   * The card's own "why you're getting this" line, as structure.
   *
   * The client renders from these fields; nothing reverse-engineers it out of
   * the caption. The relationship is always library membership, never an
   * inferred preference.
   */
  recipientContext: RecipientContext | null;
  /**
   * The page's longer telling of the same fact.
   *
   * Rendered from the same proposition as `caption`, by a second function
   * rather than a second author, so the two cannot disagree about the
   * subject, the counts or the sources.
   */
  detailExplanation: string;
  /** How far this sits from what the viewer already holds. */
  distanceBand: "NEAR" | "MID" | "FAR";

  /** Named sources behind the recommendation. Never a count. */
  sources: FeedPerson[];
  /** How many tracks the detail page will contain. */
  deliverableCount: number;
  /** A few tracks for the card itself; the full set comes from the detail route. */
  previewTracks: FeedTrack[];
  /**
   * The years the card's own material spans.
   *
   * Measured over the tracks this card actually hands over, whatever its
   * subject: an album card spans its album's year because that is what its
   * tracks are, and an artist card spans the years of the tracks behind it
   * rather than a career the engine would have to go and guess at. Null when
   * none of its tracks carries a release date, which is how a client can tell
   * "no date" from "some date" and refuse to match either way.
   */
  releaseYearMin: number | null;
  releaseYearMax: number | null;
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

/**
 * The span of release years across a card's deliverable tracks.
 *
 * Derived, never asserted: a track with no release date contributes nothing
 * rather than being counted at some default, and a card whose tracks all lack
 * one comes back null on both ends instead of spanning everything.
 */
function yearSpanOf(
  index: DiscoveryIndex, tracks: FeedTrack[],
): { releaseYearMin: number | null; releaseYearMax: number | null } {
  let lo: number | null = null;
  let hi: number | null = null;
  for (const t of tracks) {
    const y = index.meta.get(t.spotifyId ?? "")?.year ?? null;
    if (y === null) continue;
    if (lo === null || y < lo) lo = y;
    if (hi === null || y > hi) hi = y;
  }
  return { releaseYearMin: lo, releaseYearMax: hi };
}

function titleOf(c: Candidate): { title: string; byline: string } {
  const s = c.subject;
  switch (s.type) {
    // A record named after the act that made it needs the name once.
    case "Album": return { title: s.album, byline: s.artist === s.album ? "" : s.artist };
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

/**
 * The recipient-context line.
 *
 * Built from the anchor, so it always states the actual set relationship the
 * recommendation rests on. An artist card anchored on the artist itself reads
 * "Already in your library"; everything else names the thing the viewer holds
 * that this came out of.
 */
function contextOf(c: Candidate): RecipientContext | null {
  const a = c.anchor;
  if (!a) return null;
  const readable = a.type === "SUBGENRE_PRESENT" || a.type === "PARENT_GENRE_PRESENT"
    ? label(a.entityName) : a.entityName;

  // The subject is the very thing the viewer already holds some of.
  const selfAnchored =
    // A record named after the act that made it is not "from" somewhere else.
    (c.subject.type === "Album" && c.artist === c.subject.album)
    || (c.subject.type === "Artist" && a.type === "ARTIST_PRESENT" && a.entityName === c.subject.artist)
    || (c.subject.type === "Subgenre" && a.type === "SUBGENRE_PRESENT" && a.entityName === c.subject.subgenre)
    || (c.subject.type === "Genre" && a.type === "PARENT_GENRE_PRESENT" && a.entityName === c.subject.genre);

  // A partial album is reached through the artist who made it.
  const name = a.type === "ALBUM_PARTIAL" ? (c.artist ?? readable) : readable;

  return {
    anchorType: a.type,
    anchorId: a.entityId,
    anchorName: name,
    ownedCount: a.ownedCount,
    shortLabel: selfAnchored ? "Already in your library" : `From ${name} in your library`,
  };
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
    recipientContext: contextOf(c),
    detailExplanation: c.winningClaim?.detailText ?? c.caption ?? "",
    distanceBand: c.distanceBand ?? "NEAR",
    sources: c.sourceFriendIds.map((id) => personOf(index, id)),
    deliverableCount: all.length,
    previewTracks: all.slice(0, previewLimit),
    ...yearSpanOf(index, all),
  };
}

/**
 * Loads the viewer's world and runs the engine over it.
 *
 * `limit` bounds only the composed convenience prefix. `all` is always the
 * complete eligible universe, because the feed paginates over that and there
 * is no product boundary at any particular number.
 */
export async function buildFeed(viewerId: string, limit = Infinity, depth = Infinity) {
  const { people, tracks } = await loadCorpus();
  if (!people.some((p) => p.id === viewerId)) return null;

  return runEngine({ viewerId, people, tracks }, { feedSize: limit, depth });
}

import { createHash } from "node:crypto";
import type { DiscoveryIndex } from "./sets";
import type { Candidate } from "./types";

/**
 * Stable semantic identity for a recommendation.
 *
 * A recommendation is a proposition about a viewer and some missed material,
 * and the feed has to be able to recognise the same proposition tomorrow. Feed
 * rank cannot be that identity — it moves every run — and neither can a fresh
 * id per engine execution, which would make every card unseen forever.
 *
 * So identity is the proposition itself: which mechanism found it, what shape
 * of thing it is about, which entity that thing is, and the scope of sources
 * it was computed against. Everything that can change while the proposition
 * stays the same — how many tracks it currently delivers, which particular
 * friends happen to hold them, how the caption is worded — lives in the
 * version instead.
 */

/**
 * The source scope a recommendation was computed against.
 *
 * Today there is exactly one: the viewer's friend pool. It is named rather
 * than derived from the current member list on purpose. Which friends happen
 * to hold a track is content, not identity — a friend adding one Kendrick
 * track must not turn "you already have 73 tracks by Kendrick Lamar" into a
 * different recommendation the viewer has never seen. When communities or
 * human recommendations arrive they will be genuinely different scopes and
 * will carry their own name here.
 */
export const SOURCE_SCOPE = "friends";

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);

/** The entity a card is about, in a form that survives a rename. */
export function subjectIdentity(index: DiscoveryIndex, c: Candidate): string {
  const s = c.subject;
  switch (s.type) {
    case "Album":
      return `album:${c.albumId ?? `${s.artist}␟${s.album}`}`;
    case "Artist": {
      // Spotify's artist id where the import reached it, the name otherwise.
      const withId = (c.deliverableIds ?? [])
        .map((id) => index.meta.get(id)?.artistId)
        .find((a): a is string => !!a);
      return `artist:${withId ?? s.artist}`;
    }
    case "Subgenre": return `subgenre:${s.subgenre}`;
    case "Genre": return `genre:${s.genre}`;
    case "Songs": return `set:${c.groupingReason.key}`;
    default: return `song:${s.spotifyId}`;
  }
}

export function recommendationKeyOf(index: DiscoveryIndex, c: Candidate): string {
  return sha([c.generator, c.cardType ?? "?", subjectIdentity(index, c), SOURCE_SCOPE].join("|"));
}

/**
 * A hash of the facts the recommendation currently rests on.
 *
 * Material change is a change to what the card would hand over or to the
 * viewer's own side of the claim. Punctuation, template choice and rank are
 * deliberately absent: rewording a caption must never make a card new again.
 */
export function underlyingVersionOf(c: Candidate): string {
  const ids = [...(c.deliverableIds ?? [])].sort();
  return sha([
    ids.join(","),
    `n=${c.deliverableCount}`,
    `owned=${c.anchor?.ownedCount ?? 0}`,
    `anchor=${c.anchor?.type ?? "none"}`,
  ].join("|"));
}

/** Attaches both to every candidate. Called once, after aperture resolution. */
export function stampIdentity(index: DiscoveryIndex, candidates: Candidate[]): void {
  for (const c of candidates) {
    c.recommendationKey = recommendationKeyOf(index, c);
    c.underlyingVersion = underlyingVersionOf(c);
  }
}

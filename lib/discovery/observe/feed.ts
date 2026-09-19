/**
 * The observation engine, in the shape the app already reads.
 *
 * The session layer around this is unchanged and worth keeping: it freezes one
 * reading order so infinite scroll cannot reorder under the reader, paginates
 * over the whole reservoir rather than a fixed number, and remembers what has
 * been shown, opened and dismissed. All of that is orthogonal to how cards are
 * found, so none of it was rewritten.
 *
 * What does change is the order's origin. The previous engine ranked with a
 * weighted blend and then had `compose` shuffle a window to keep the feed
 * varied; generation here already orders by strength and already spaces
 * families and subjects over a rolling window, so composing a second time
 * would undo the gradient it was given.
 */
import { loadCorpus } from "../corpus";
import type { FeedCard } from "../feed";
import type { PersonRow } from "../types";
import { toFeedCard } from "./cards";
import { observe, type ObserveOptions } from "./observe";
import { buildProfile } from "./profile";
import { buildReference } from "./reference";
import { tasteOf, plainName, type ArtistFacts } from "./caption";
import { prisma } from "@/lib/prisma";
import type { Candidate } from "./candidates";
import type { Band } from "./observe";

export interface ObservationCard {
  card: FeedCard;
  deliverableIds: string[];
  /** Kept server-side. Never sent to a client. */
  meta: {
    family: string; score: number; band: Band;
    friends: number; connection: string; tracks: number;
  };
}

export async function buildObservationCards(
  viewerId: string, opts: ObserveOptions = {},
): Promise<{ cards: ObservationCard[]; counts: ReturnType<typeof observe>["counts"] } | null> {
  const { people, tracks } = await loadCorpus();
  if (!people.some((p) => p.id === viewerId)) return null;

  const ref = buildReference(tracks);
  const profile = buildProfile(viewerId, tracks, ref);
  const result = observe(ref, profile, opts);

  /**
   * What is known about the artists, and what this reader keeps.
   *
   * One read for the whole feed. Where an artist is absent the caption says
   * less rather than guessing, so a thin fact table degrades the writing
   * without making it wrong.
   */
  const factRows = await prisma.artistFact.findMany({
    select: { name: true, nameKey: true, kind: true, country: true, area: true,
      beginArea: true, activeFrom: true, activeTo: true, memberships: true,
      summary: true, wikidataGenres: true, instruments: true, styles: true,
      pressingYear: true, pressingCountry: true },
  });
  const facts = new Map<string, ArtistFacts>(factRows.map((f) => [f.nameKey, f as ArtistFacts]));
  const taste = tasteOf(ref, viewerId);

  const byId = new Map<string, PersonRow>(people.map((p) => [p.id, p]));
  const cards = result.candidates.map((c: Candidate & { band: Band }, i: number) => ({
    card: toFeedCard(ref, c, viewerId, byId, i + 1, 4, facts, taste),
    deliverableIds: c.tracks
      .map((wk) => ref.works.get(wk)?.row.spotifyId)
      .filter((x): x is string => !!x),
    meta: {
      family: c.family, score: +c.score.toFixed(2), band: c.band,
      friends: c.holders.length, connection: c.connection.kind,
      tracks: c.tracks.length,
    },
  }));
  return { cards, counts: result.counts };
}

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
import type { Observation } from "./types";

export interface ObservationCard {
  card: FeedCard;
  deliverableIds: string[];
  /** Kept server-side: bits, tier, family, jackknife. Never sent to a client. */
  meta: {
    family: string; bits: number; jackknife: number;
    tier: string; refQuality: string; payload: "DISCOVER" | "REFLECT";
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

  const byId = new Map<string, PersonRow>(people.map((p) => [p.id, p]));
  const cards = result.observations.map((ob: Observation, i: number) => ({
    card: toFeedCard(ref, ob, viewerId, byId, i + 1),
    deliverableIds: ob.payload.works
      .map((wk) => ref.works.get(wk)?.row.spotifyId)
      .filter((x): x is string => !!x),
    meta: {
      family: ob.family, bits: +ob.bits.toFixed(2),
      jackknife: +ob.bitsJackknife.toFixed(2), tier: ob.tier ?? "VALID",
      refQuality: ob.refQuality, payload: ob.payload.kind,
    },
  }));
  return { cards, counts: result.counts };
}

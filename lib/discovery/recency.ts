import * as CFG from "./config";
import type { DiscoveryIndex } from "./sets";
import type { Candidate } from "./types";

/**
 * Two facts about the viewer's own library that shape where a card sits.
 *
 * Both are set membership and timestamps — how many tracks by this artist are
 * in the library, and when the library last gained anything in the set a card
 * hangs off. Neither infers a preference, characterises the person, or
 * compares them to anybody else. There is deliberately nowhere here to put a
 * predicted affinity.
 */

/**
 * How live the material a card hangs off is, in [0,1].
 *
 * A card is anchored to something the viewer already holds — an album, an
 * artist, a lane, a genre. This asks when that set last gained a track, and
 * decays by half every `halfLifeDays`. Something saved this week scores near
 * one; something last touched three years ago scores near zero.
 *
 * Returns 0 when there is no date to read, and 0 is the neutral value because
 * the caller only ever adds this: a library with no save dates gets no lift
 * anywhere and its ordering is untouched. Nothing invents a date.
 */
export function anchorRecency(index: DiscoveryIndex, c: Candidate, now = Date.now()): number {
  if (!index.viewerHasSaveDates) return 0;

  // The tightest set the card is anchored to that carries a date. An album is
  // more specific than an artist, an artist than a lane, a lane than a genre —
  // the same ordering the anchor's own specificity uses.
  const at =
    (c.albumId ? index.viewerSavedAtByAlbumId.get(c.albumId) : undefined)
    ?? (c.artist ? index.viewerSavedAtByArtist.get(c.artist) : undefined)
    ?? (c.subgenre ? index.viewerSavedAtByLane.get(c.subgenre) : undefined)
    ?? (c.genre ? index.viewerSavedAtByWorld.get(c.genre) : undefined);

  if (at === undefined) return 0;
  const ageDays = Math.max(0, (now - at) / 86_400_000);
  return Math.pow(0.5, ageDays / CFG.RECENCY.halfLifeDays);
}

/**
 * How much of this card is artists the viewer already holds, in [0,1].
 *
 * A track missing from an artist somebody has twenty tracks of is weak
 * evidence that they missed anything: they have met that catalogue, and these
 * particular tracks are the ones they did not keep. A track by an artist
 * absent from the library entirely is the opposite — nothing about it has been
 * seen and passed over.
 *
 * Measured over the card's own deliverable tracks rather than its title, so a
 * set assembled from artists already in the library pays this in full while a
 * set that merely mentions one does not. `from` is where the setback begins
 * and `saturation` where it is complete, so an artist held once costs nothing.
 */
export function artistFamiliarity(index: DiscoveryIndex, c: Candidate): number {
  const ids = c.deliverableIds ?? [];
  if (ids.length === 0) return 0;

  const { from, saturation } = CFG.FAMILIAR_ARTIST;
  const span = Math.max(1, saturation - from);
  let total = 0;
  for (const id of ids) {
    const artist = index.meta.get(id)?.artist;
    const owned = artist ? (index.viewerByArtist.get(artist) ?? 0) : 0;
    total += Math.max(0, Math.min(1, (owned - from) / span));
  }
  return total / ids.length;
}

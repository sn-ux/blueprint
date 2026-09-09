import { APERTURE } from "./config";
import { UNKNOWN_LANE, type DiscoveryIndex } from "./sets";
import {
  CARD_TYPE_OF, SONG_SET_MAX, SONG_SET_MIN,
  type Candidate, type CardSubjectType,
} from "./types";

/**
 * Presentation resolution — a formal stage between rationale and feed.
 *
 * The engine may reason over intersections, catalogue residue and thousands of
 * tracks. The reader may not. This stage asks one question of every candidate:
 * what is the clearest single thing to look at?
 *
 * The rule is that the singular entity always wins. If the reason a group of
 * tracks belongs together is that they share an album, an artist, a subgenre
 * or a genre, then that entity is the card — a set of fifteen Hip Hop tracks
 * is a Hip Hop card, not a "Hip Hop songs" card sitting next to one. Two cards
 * at slightly different zoom levels over the same fact is one fact presented
 * twice, and it reads as a bug because it is one.
 *
 * SONG_SET is therefore the residual aperture, not a default. It survives only
 * when two things hold at once: the generator declared a STRUCTURAL grouping
 * reason — a relationship no single entity can express — and no singular
 * entity concentrates the set enough to explain it anyway.
 */

/**
 * How concentrated a set has to be before one entity explains it.
 *
 * Measured rather than guessed. Over the current corpus every taxonomy-defined
 * set is 100% one subgenre and 100% one genre, while the only non-taxonomic
 * grouping available — tracks held by the same combination of sources — lands
 * at 7–29% by album, 7–33% by artist and 7–67% by subgenre. Nothing in the
 * corpus falls between 0.40 and 0.60, so the album/artist/subgenre line is
 * robust anywhere in that band.
 *
 * Genre gets a distinctly higher bar because it is a coarse partition: with
 * eight worlds and a library that leans on a few of them, a fifteen-track set
 * drawn at random already lands 40–67% in one genre. Only near-total
 * concentration means the set is genuinely about that genre.
 */
const SHARE = APERTURE.dominantShare;
const GENRE_SHARE = APERTURE.dominantGenreShare;

export interface Concentration {
  album: number;
  artist: number;
  subgenre: number;
  genre: number;
}

export interface ApertureResult {
  cardType: CardSubjectType | null;
  note: string;
  /** Replacement subject, when the aperture differs from what the generator emitted. */
  subject?: Candidate["subject"];
  deliverableIds?: string[];
  concentration?: Concentration;
}

interface Dominant<T> { key: T; count: number; share: number; distinct: number }

function dominant<T>(ids: string[], keyOf: (id: string) => T | null | undefined): Dominant<T> | null {
  if (ids.length === 0) return null;
  const counts = new Map<T, number>();
  for (const id of ids) {
    const k = keyOf(id);
    if (k === null || k === undefined) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  return { key: top[0], count: top[1], share: top[1] / ids.length, distinct: counts.size };
}

const laneOf = (index: DiscoveryIndex, id: string) => {
  const s = index.meta.get(id)?.subgenre;
  return s && s !== UNKNOWN_LANE ? s : null;
};

/** Concentration of a set by each singular entity that could explain it. */
export function concentrationOf(index: DiscoveryIndex, ids: string[]): Concentration {
  return {
    album: dominant(ids, (id) => index.albumIdOf.get(id) ?? null)?.share ?? 0,
    artist: dominant(ids, (id) => index.meta.get(id)?.artist ?? null)?.share ?? 0,
    subgenre: dominant(ids, (id) => laneOf(index, id))?.share ?? 0,
    genre: dominant(ids, (id) => index.meta.get(id)?.world ?? null)?.share ?? 0,
  };
}

/**
 * Resolves one candidate to a card subject.
 *
 * Single-entity subjects already are what they claim to be and pass straight
 * through — an album gap is an album card, an artist gap an artist card. Only
 * multi-track subjects need resolving.
 */
export function resolveAperture(index: DiscoveryIndex, c: Candidate): ApertureResult {
  // A single track is not a card. Nothing generates one any more, and this is
  // the boundary that keeps it that way.
  if (c.subject.type === "Song") {
    return { cardType: null, note: "a single track is not a card" };
  }

  const declared = CARD_TYPE_OF[c.subject.type];
  if (c.subject.type !== "Songs") {
    return { cardType: declared ?? null, note: "single-entity subject" };
  }

  const members = c.deliverableIds ?? [];
  const size = members.length;
  const concentration = concentrationOf(index, members);

  // ── Aperture dominance ──────────────────────────────────────────────────
  //
  // Most specific first, so an album beats the artist that made it and an
  // artist beats the lane they sit in. A generator that declared its set
  // taxonomic names the entity itself; that declaration is authoritative,
  // because the same recording can be classified differently in different
  // libraries and re-deriving the lane per track would disagree with the
  // generator about its own set.
  const reason = c.groupingReason;
  if (reason.kind === "TAXONOMIC") {
    switch (reason.entity) {
      case "SUBGENRE":
        return {
          cardType: "SUBGENRE", concentration,
          note: `defined by one subgenre (${reason.key}); the lane is the clearer aperture`,
          subject: { type: "Subgenre", subgenre: reason.key },
          deliverableIds: members,
        };
      case "GENRE":
        return {
          cardType: "GENRE", concentration,
          note: `defined by one genre (${reason.key}); the genre is the clearer aperture`,
          subject: { type: "Genre", genre: reason.key },
          deliverableIds: members,
        };
      // An album- or artist-defined set arrives as that subject already; a
      // "Songs" subject carrying one is a generator bug, not a card.
      default:
        return {
          cardType: null, concentration,
          note: `declared ${reason.entity}-defined but emitted as a set`,
        };
    }
  }

  // A structural set still loses to a singular entity that happens to explain
  // it anyway. Measured against the set the page will actually show.
  const album = dominant(members, (id) => index.albumIdOf.get(id) ?? null);
  if (album && album.share >= SHARE && album.count >= APERTURE.minAlbumTracks) {
    return {
      cardType: null, concentration,
      note: `${Math.round(album.share * 100)}% of the set is one album — an album card, which this generator cannot justify`,
    };
  }
  const artist = dominant(members, (id) => index.meta.get(id)?.artist ?? null);
  if (artist && artist.share >= SHARE && artist.count >= APERTURE.minArtistTracks) {
    return {
      cardType: null, concentration,
      note: `${Math.round(artist.share * 100)}% of the set is ${String(artist.key)} — an artist card, which this generator cannot justify`,
    };
  }
  const lane = dominant(members, (id) => laneOf(index, id));
  if (lane && lane.share >= SHARE && lane.count >= APERTURE.minLaneTracks) {
    return {
      cardType: "SUBGENRE", concentration,
      note: `${Math.round(lane.share * 100)}% of the set is ${String(lane.key)}`,
      subject: { type: "Subgenre", subgenre: lane.key as string },
      deliverableIds: members.filter((id) => laneOf(index, id) === lane.key),
    };
  }
  const world = dominant(members, (id) => index.meta.get(id)?.world ?? null);
  if (world && world.share >= GENRE_SHARE && world.count >= APERTURE.minGenreTracks) {
    return {
      cardType: "GENRE", concentration,
      note: `${Math.round(world.share * 100)}% of the set is ${String(world.key)}`,
      subject: { type: "Genre", genre: world.key as string },
      deliverableIds: members.filter((id) => index.meta.get(id)?.world === world.key),
    };
  }

  // ── SONG_SET, the residual aperture ─────────────────────────────────────
  //
  // Nothing singular explains the set and the relationship holding it together
  // is structural. A dozen is the floor for that to be worth opening, and
  // padding a smaller set to reach it would manufacture the thing the floor
  // guarantees.
  if (size >= SONG_SET_MIN && size <= SONG_SET_MAX) {
    return {
      cardType: "SONG_SET", concentration,
      note: `${size} tracks, ${reason.description}`,
    };
  }

  return {
    cardType: null, concentration,
    note: size < SONG_SET_MIN
      ? `${size} tracks — below the ${SONG_SET_MIN}-track minimum`
      : `${size} tracks — above the ${SONG_SET_MAX}-track maximum`,
  };
}

/** The hard gate. A card that is not one of the five does not ship. */
export function isAllowedCardType(t: unknown): t is CardSubjectType {
  return t === "SONG_SET" || t === "ALBUM"
    || t === "ARTIST" || t === "SUBGENRE" || t === "GENRE";
}

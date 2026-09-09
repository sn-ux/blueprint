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
 * what is the clearest single thing to look at? The answer is one of six
 * things, or nothing.
 *
 * A DiscoverySet is not a card. Three friends sharing 41 tracks the viewer
 * lacks is a real and useful fact internally, but "these 41 tracks" is not
 * something anyone can look at. If that set has no dominant album, artist or
 * lane inside it — and measured against real data it has none, its strongest
 * concentration being 24% — then it resolves to no card at all. Producing
 * nothing is a correct outcome here; truncating it to a tidy twelve would be
 * inventing a discovery unit that the evidence does not describe.
 */

/** A dominant entity has to actually dominate, not merely lead. */
const DOMINANT_SHARE = 0.6;
const DOMINANT_MIN_ALBUM = 4;
const DOMINANT_MIN_ARTIST = 4;
const DOMINANT_MIN_LANE = 8;

export interface ApertureResult {
  cardType: CardSubjectType | null;
  note: string;
  /** Replacement subject, when the aperture differs from what the generator emitted. */
  subject?: Candidate["subject"];
  deliverableIds?: string[];
}

function dominant<T>(ids: string[], keyOf: (id: string) => T | null | undefined) {
  const counts = new Map<T, number>();
  for (const id of ids) {
    const k = keyOf(id);
    if (k === null || k === undefined) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  return { key: top[0], count: top[1], share: top[1] / ids.length };
}

/**
 * Resolves one candidate to a card subject.
 *
 * Single-entity subjects already are what they claim to be and pass straight
 * through — an album gap is an album card, an artist gap an artist card. Only
 * multi-track subjects need resolving, and they resolve by their own structure
 * rather than by being cut to a target size.
 */
export function resolveAperture(index: DiscoveryIndex, c: Candidate): ApertureResult {
  const declared = CARD_TYPE_OF[c.subject.type];

  if (c.subject.type !== "Songs") {
    return { cardType: declared, note: "single-entity subject" };
  }

  const members = c.deliverableIds ?? [];
  const size = members.length;

  // A lane's worth of tracks is a lane, not a pile of songs. Where the
  // generator built the set from a single lane it says so, and that is the
  // authority — re-deriving the lane per track would disagree with it, because
  // the same recording can be classified differently in different libraries
  // and the metadata index keeps whichever row it saw first.
  if (c.subgenre && size >= DOMINANT_MIN_LANE) {
    return {
      cardType: "SUBGENRE",
      note: `all ${size} tracks are ${c.subgenre}`,
      subject: { type: "Subgenre", subgenre: c.subgenre },
      deliverableIds: members,
    };
  }

  const lane = dominant(members, (id) => {
    const s = index.meta.get(id)?.subgenre;
    return s && s !== UNKNOWN_LANE ? s : null;
  });

  // Otherwise: is one entity carrying the set?
  const album = dominant(members, (id) => index.meta.get(id)?.album ?? null);
  const artist = dominant(members, (id) => index.meta.get(id)?.artist ?? null);
  if (album && album.share >= DOMINANT_SHARE && album.count >= DOMINANT_MIN_ALBUM) {
    return { cardType: null, note: `dominated by album "${album.key}" (${Math.round(album.share * 100)}%) — needs an album-shaped rationale this generator does not supply` };
  }
  if (artist && artist.share >= DOMINANT_SHARE && artist.count >= DOMINANT_MIN_ARTIST) {
    return { cardType: null, note: `dominated by artist "${artist.key}" (${Math.round(artist.share * 100)}%) — needs an artist-shaped rationale this generator does not supply` };
  }
  if (lane && lane.share >= DOMINANT_SHARE && lane.count >= DOMINANT_MIN_LANE) {
    return {
      cardType: "SUBGENRE",
      note: `${Math.round(lane.share * 100)}% of the set is ${lane.key}`,
      subject: { type: "Subgenre", subgenre: lane.key as string },
      deliverableIds: members.filter((id) => index.meta.get(id)?.subgenre === lane.key),
    };
  }

  // No single entity carries it. A bounded set held together by the source
  // relationship itself is still one discovery unit; an unbounded one is not.
  if (size >= SONG_SET_MIN && size <= SONG_SET_MAX) {
    return { cardType: "SONG_SET", note: `${size} tracks, held together by the source relationship` };
  }

  const best = [album, artist, lane]
    .filter(Boolean)
    .map((d) => `${Math.round((d as { share: number }).share * 100)}%`)
    .join("/");
  return {
    cardType: null,
    note: size < SONG_SET_MIN
      ? `${size} tracks — below the ${SONG_SET_MIN}-track minimum, and no dominant entity (${best || "none"})`
      : `${size} tracks — above the ${SONG_SET_MAX}-track maximum, and no dominant entity (${best || "none"})`,
  };
}

/** The hard gate. A card that is not one of the six does not ship. */
export function isAllowedCardType(t: unknown): t is CardSubjectType {
  return t === "SONG" || t === "SONG_SET" || t === "ALBUM"
    || t === "ARTIST" || t === "SUBGENRE" || t === "GENRE";
}

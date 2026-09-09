import { APERTURE, CONSENSUS_SET } from "./config";
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
 * There are two right answers for a group of tracks, and telling them apart is
 * the whole job here.
 *
 * If the card's proposition is simply that a region of music exists and the
 * viewer is short of it, the region is the card: an album, an artist, a lane,
 * a genre. A set of fifteen tracks whose only common property is their lane is
 * that lane's card, and putting both on the feed says one thing twice.
 *
 * If instead the card identifies a particular twelve to fifteen tracks that a
 * further rule picked out of that region, the set is the card. Sharing a genre
 * with a taxonomy card disqualifies nothing — a landscape and an entry point
 * into it are different recommendations, and a reader may reasonably want
 * both. What is checked is that the rule actually selected: the qualifying set
 * has to be materially smaller than the inventory of the scope it came from,
 * or the "selection" is just the area again.
 *
 * Album and artist still win over a selected set, because they are the more
 * specific aperture: fifteen tracks that are all one record are that record.
 */
const SHARE = APERTURE.dominantShare;
const APERTURE_MAX_SCOPE_SHARE = CONSENSUS_SET.maxShareOfScope;

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

  // ── Is the proposition the area, or a selection inside it? ──────────────
  const reason = c.groupingReason;
  if (reason.kind === "AREA") {
    switch (reason.entity) {
      case "SUBGENRE":
        return {
          cardType: "SUBGENRE", concentration,
          note: `the proposition is the lane itself (${reason.key})`,
          subject: { type: "Subgenre", subgenre: reason.key },
          deliverableIds: members,
        };
      case "GENRE":
        return {
          cardType: "GENRE", concentration,
          note: `the proposition is the genre itself (${reason.key})`,
          subject: { type: "Genre", genre: reason.key },
          deliverableIds: members,
        };
      // An album- or artist-defined area arrives as that subject already; a
      // "Songs" subject carrying one is a generator bug, not a card.
      default:
        return {
          cardType: null, concentration,
          note: `declared an ${reason.entity} area but emitted as a set`,
        };
    }
  }

  // A selection has to select. Measured against the scope's own corroborated
  // inventory rather than against the set's internal composition: a set can be
  // wholly inside one lane and still be a real selection within it.
  const { rule } = reason;
  const share = rule.scopeInventory > 0 ? rule.qualifying / rule.scopeInventory : 1;
  // The guard exists to stop a set being the same proposition as the area
  // card that already covers it. Territory the viewer occupies has such a
  // card; territory they have nothing in does not, so a starter set there is
  // not standing in for anything and the test does not apply.
  const viewerOccupies = reason.scope.entity === "SUBGENRE"
    ? (index.viewerByLane.get(reason.scope.key) ?? 0) > 0
    : (index.viewerByWorld.get(reason.scope.key) ?? 0) > 0;
  if (viewerOccupies && share > APERTURE_MAX_SCOPE_SHARE) {
    return {
      cardType: null, concentration,
      note: `${rule.qualifying} of the scope's ${rule.scopeInventory} corroborated tracks clear the rule (${Math.round(share * 100)}%) — that is the area, not a selection within it`,
    };
  }

  // Album and artist are the more specific aperture; subgenre and genre are
  // not, and deliberately do not appear here.
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

  // ── SONG_SET ────────────────────────────────────────────────────────────
  //
  // A dozen is the floor for a curated set to be worth opening, and padding a
  // smaller one to reach it would manufacture the thing the floor guarantees.
  if (size >= SONG_SET_MIN && size <= SONG_SET_MAX) {
    return {
      cardType: "SONG_SET", concentration,
      note: `${size} of ${rule.qualifying} tracks in ${reason.scope.key} ${rule.description}`
        + ` — ${Math.round(share * 100)}% of the scope's ${rule.scopeInventory} corroborated tracks`,
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

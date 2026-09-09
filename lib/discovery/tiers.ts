import * as CFG from "./config";

/**
 * Generation tiers.
 *
 * The feed should not end while there is still something true to say. What
 * runs out first is not truth but strength: the thresholds that decide whether
 * a gap is worth a card — how many tracks by an artist count as holding them,
 * how many missing tracks make a lane worth showing — are preferences about
 * quality, not statements about fact.
 *
 * So they relax by tier, and nothing else does. A tier-three card is a real
 * miss with a real anchor and real independent sources; it is simply a smaller
 * one, and it sits behind everything stronger.
 *
 * These never move, at any tier, because they are what makes a card true:
 *
 *   every deliverable outside the viewer's library, at recording level
 *   at least two independent sources per card
 *   a recipient anchor that is an explicit set relationship
 *   the caption's promise equal to what the page delivers
 *   twelve to fifteen tracks in a song set, never padded
 *   evidence, attention and claim floors — the publishing floor itself
 */
export interface Thresholds {
  artistGapMinOwned: number;
  artistGapMinMissing: number;
  artistAbsentMinCatalog: number;
  artistAbsentMinOwnedInLane: number;
  laneMinDeliverable: number;
  laneMinOwnedForPresent: number;
  laneMinOwnedInParent: number;
  albumAsUnitMinOwnedByArtist: number;
  albumAsUnitMinDeliverable: number;
  albumCatalogMinAlbumsHeld: number;
  albumCatalogMinDeliverable: number;
  genreGapMinDeliverable: number;
  genreGapMinLanes: number;
  bridgeMinOwned: number;
  bridgeMinDeliverable: number;
  bridgeSetMinArtists: number;
  bridgeSetMinOwnedByThem: number;
  newTerritoryMinSources: number;
}

const base: Thresholds = {
  artistGapMinOwned: CFG.ARTIST_GAP.minOwned,
  artistGapMinMissing: CFG.ARTIST_GAP.minMissing,
  artistAbsentMinCatalog: CFG.ARTIST_ABSENT.minCatalog,
  artistAbsentMinOwnedInLane: CFG.ARTIST_ABSENT.minOwnedInLane,
  laneMinDeliverable: CFG.LANE.minDeliverable,
  laneMinOwnedForPresent: CFG.LANE.minOwnedForPresent,
  laneMinOwnedInParent: CFG.LANE.minOwnedInParent,
  albumAsUnitMinOwnedByArtist: CFG.ALBUM_AS_UNIT.minOwnedByArtist,
  albumAsUnitMinDeliverable: CFG.ALBUM_AS_UNIT.minDeliverable,
  albumCatalogMinAlbumsHeld: CFG.ALBUM_CATALOG_GAP.minAlbumsHeld,
  albumCatalogMinDeliverable: CFG.ALBUM_CATALOG_GAP.minDeliverable,
  genreGapMinDeliverable: CFG.GENRE_GAP.minDeliverable,
  genreGapMinLanes: CFG.GENRE_GAP.minLanes,
  bridgeMinOwned: CFG.BRIDGE.minOwnedByBridge,
  bridgeMinDeliverable: CFG.BRIDGE.minDeliverable,
  bridgeSetMinArtists: CFG.BRIDGE_SET.minArtists,
  bridgeSetMinOwnedByThem: CFG.BRIDGE_SET.minOwnedByThem,
  newTerritoryMinSources: CFG.NEW_TERRITORY.minSources,
};

/**
 * Each tier asks less of the recipient side and of magnitude, and nothing of
 * the evidence. Holding two tracks by an artist is a weaker connection than
 * holding twenty, but it is the same kind of fact and the caption still states
 * the real number.
 */
export const TIERS: Thresholds[] = [
  base,
  {
    ...base,
    artistGapMinOwned: 2,
    artistAbsentMinOwnedInLane: 3,
    laneMinDeliverable: 4,
    laneMinOwnedForPresent: 2,
    laneMinOwnedInParent: 10,
    albumAsUnitMinOwnedByArtist: 2,
    albumAsUnitMinDeliverable: 3,
    albumCatalogMinAlbumsHeld: 1,
    albumCatalogMinDeliverable: 3,
    genreGapMinDeliverable: 6,
    genreGapMinLanes: 4,
    bridgeMinOwned: 3,
    bridgeMinDeliverable: 4,
    bridgeSetMinArtists: 2,
    bridgeSetMinOwnedByThem: 5,
  },
  {
    ...base,
    artistGapMinOwned: 1,
    artistAbsentMinCatalog: 2,
    artistAbsentMinOwnedInLane: 1,
    laneMinDeliverable: 3,
    laneMinOwnedForPresent: 1,
    laneMinOwnedInParent: 4,
    albumAsUnitMinOwnedByArtist: 1,
    albumAsUnitMinDeliverable: 2,
    albumCatalogMinAlbumsHeld: 1,
    albumCatalogMinDeliverable: 2,
    genreGapMinDeliverable: 4,
    genreGapMinLanes: 2,
    bridgeMinOwned: 1,
    bridgeMinDeliverable: 3,
    bridgeSetMinArtists: 2,
    bridgeSetMinOwnedByThem: 2,
  },
  // Beyond here the recipient side is as small as it can be while still being
  // a relationship at all: one track held by the artist, one in the lane. The
  // miss shrinks with it. Everything that makes a card true is untouched, so
  // what these produce is small, real and honestly weaker.
  {
    ...base,
    artistGapMinOwned: 1,
    artistGapMinMissing: 2,
    artistAbsentMinCatalog: 2,
    artistAbsentMinOwnedInLane: 1,
    laneMinDeliverable: 2,
    laneMinOwnedForPresent: 1,
    laneMinOwnedInParent: 2,
    albumAsUnitMinOwnedByArtist: 1,
    albumAsUnitMinDeliverable: 2,
    albumCatalogMinAlbumsHeld: 1,
    albumCatalogMinDeliverable: 2,
    genreGapMinDeliverable: 3,
    genreGapMinLanes: 1,
    bridgeMinOwned: 1,
    bridgeMinDeliverable: 2,
    bridgeSetMinArtists: 2,
    bridgeSetMinOwnedByThem: 1,
    newTerritoryMinSources: 2,
  },
];

/** How deep generation can go. Past this, only resurfacing remains. */
export const MAX_DEPTH = TIERS.length - 1;

/** The profile the generators are currently running under. */
export let T: Thresholds = TIERS[0];

export function withTier<R>(tier: number, run: () => R): R {
  const previous = T;
  T = TIERS[Math.min(tier, TIERS.length - 1)];
  try {
    return run();
  } finally {
    T = previous;
  }
}

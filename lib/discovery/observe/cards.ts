/**
 * Observations as the app already understands them.
 *
 * The feed, the detail route, the session snapshot and both clients are built
 * around FeedCard, and none of that needed to change for the observation
 * engine to feed them. What crosses the wire is the statement, the counts
 * behind it and the tracks it opens; the bits, the null it was scored against
 * and the jackknife stay on the server, where they are for debugging rather
 * than for the reader.
 */
import type { FeedCard, FeedPerson, FeedTrack } from "../feed";
import type { CardSubjectType, PersonRow } from "../types";
import { render } from "./claims";
import type { Reference } from "./reference";
import type { Observation } from "./types";

const CARD_TYPE: Record<string, CardSubjectType> = {
  album: "ALBUM", artist: "ARTIST", subgenre: "SUBGENRE",
  library: "SONG_SET", person: "SONG_SET",
};

const spotifyUrl = (id: string | null) =>
  (id ? `https://open.spotify.com/track/${id}` : null);

function trackOf(ref: Reference, wk: string, viewerId: string, people: Map<string, PersonRow>): FeedTrack | null {
  const w = ref.works.get(wk);
  if (!w) return null;
  const friends: FeedPerson[] = [];
  for (const h of w.holders) {
    if (h === viewerId) continue;
    const p = people.get(h);
    friends.push({ id: h, name: p?.name ?? null, image: p?.image ?? null });
  }
  return {
    id: w.row.spotifyId,
    spotifyId: w.row.spotifyId,
    name: w.name,
    artist: w.artist,
    album: w.row.album ?? null,
    imageUrl: w.row.imageUrl ?? null,
    spotifyUrl: spotifyUrl(w.row.spotifyId),
    friends,
  };
}

/** Artwork: the album's cover for an album, otherwise the subject's own picture. */
function imageOf(ref: Reference, ob: Observation, tracks: FeedTrack[]): string | null {
  if (ob.subject.kind === "album") {
    for (const wk of ref.albums.get(ob.subject.key)?.works ?? []) {
      const u = ref.works.get(wk)?.row.imageUrl;
      if (u) return u;
    }
  }
  if (ob.subject.kind === "artist") {
    const a = ref.artists.get(ob.subject.key);
    for (const wk of a?.works ?? []) {
      const r = ref.works.get(wk)?.row;
      if (r?.artistImageUrl) return r.artistImageUrl;
    }
  }
  return tracks.find((t) => t.imageUrl)?.imageUrl ?? null;
}

/**
 * Bits to a band.
 *
 * Deliberately coarse. The bits are a continuous measure and the reader is
 * being shown a card, not a p-value; three bands is as much of the number as
 * belongs on a screen. The boundaries are round: sixteen bits is a
 * sixty-five-thousand-to-one departure from the null, twenty-four is
 * sixteen-million-to-one.
 */
const bandOf = (bits: number): FeedCard["qualityBand"] =>
  bits >= 24 ? "EXCEPTIONAL" : bits >= 16 ? "STRONG" : "SOLID";

export function toFeedCard(
  ref: Reference, ob: Observation, viewerId: string,
  people: Map<string, PersonRow>, rank: number, previewLimit = 4,
): FeedCard {
  const nameOf = (id: string) => people.get(id)?.name ?? "someone here";
  const r = render(ob, nameOf);
  const tracks = ob.payload.works
    .map((wk) => trackOf(ref, wk, viewerId, people))
    .filter((t): t is FeedTrack => t !== null);

  const sources = new Map<string, FeedPerson>();
  for (const t of tracks) for (const f of t.friends) if (!sources.has(f.id)) sources.set(f.id, f);

  const years = tracks
    .map((t) => ref.works.get(`${t.name}`)?.year ?? null)
    .filter((y): y is number => y !== null);
  let lo: number | null = null, hi: number | null = null;
  for (const wk of ob.payload.works) {
    const y = ref.works.get(wk)?.year;
    if (y === null || y === undefined) continue;
    lo = lo === null ? y : Math.min(lo, y);
    hi = hi === null ? y : Math.max(hi, y);
  }
  void years;

  const subj = ob.subject;
  const artistName = subj.kind === "artist" ? subj.label : (subj.artist ?? null);
  const firstWork = ob.payload.works[0] ?? ob.evidence[0];
  const w0 = firstWork ? ref.works.get(firstWork) : undefined;

  return {
    id: `obs:${ob.family}:${ob.key}`,
    version: `${ob.bits.toFixed(1)}:${ob.payload.works.length}`,
    rank,
    cardType: CARD_TYPE[subj.kind] ?? "SONG_SET",
    qualityBand: bandOf(ob.bits),
    title: r.title,
    byline: r.payloadLabel,
    caption: r.caption,
    generator: ob.family,
    claimType: ob.family,
    // Kept for wire compatibility. The engine has one measure of interest and
    // it is `bits`; these two carried a weighted blend that no longer exists,
    // so they report the same number rather than a reconstructed fiction.
    evidenceStrength: Math.min(1, ob.bits / 32),
    attentionValue: Math.min(1, ob.bitsJackknife / 32),
    score: ob.bits,
    genre: w0?.world ?? null,
    subgenre: subj.kind === "subgenre" ? subj.key : (w0?.subgenre ?? null),
    artist: artistName,
    album: subj.kind === "album" ? subj.label : null,
    subjectImageUrl: imageOf(ref, ob, tracks),
    anchor: null,
    recipientContext: null,
    detailExplanation: r.detail,
    distanceBand: ob.payload.kind === "REFLECT" ? "NEAR" : "MID",
    subjectKey: `${subj.kind}:${subj.key}`,
    sources: [...sources.values()],
    deliverableCount: tracks.length,
    previewTracks: tracks.slice(0, previewLimit),
    releaseYearMin: lo,
    releaseYearMax: hi,
  };
}

/**
 * How often people actually hold the next track, measured rather than chosen.
 *
 * Ranking used to be a stack of constants — a connection weight of 0.85, a
 * sharpness of 1.25, a saturation of one over one plus k over thirty — every
 * one of them invented to make some particular card that looked wrong go away.
 * That is curve-fitting to complaints. This replaces all of it with three
 * curves read straight out of the corpus.
 *
 * The estimate is leave-one-out: for every listener and every recording, ask
 * how many OTHERS of the same album, artist and lane that listener holds, then
 * record whether they hold this one. Counting the track itself would make the
 * answer one by construction.
 *
 * What this is not: a taste model. It knows nothing about who anybody is or
 * what they like, and there is nowhere to put that. It answers one structural
 * question — given that somebody holds seven tracks off a record, how often do
 * they hold an eighth — and the answer turns out to be 0.86 while holding none
 * of it is 0.17. Those two numbers are why an album card outranks a lane card,
 * and neither of them was chosen.
 *
 * Measured on this corpus, two things the code previously assumed are simply
 * not there: the number of friends holding a recording barely moves the rate
 * (0.196, 0.199, 0.171 for one, two and three), and how deep the holding
 * friend is in the lane moves it not at all. Both had multipliers. Both are
 * gone. They may well appear as the network grows, at which point they will
 * appear here, in the measurement, rather than in somebody's judgement.
 */
import type { Reference } from "./reference";

/** Observations in one bucket of a curve. */
interface Cell { n: number; y: number }

export interface Rates {
  /** P(holds a recording | holds k others from the same album). */
  album: number[];
  /** P(holds a recording | holds k others by the same artist). */
  artist: number[];
  /** P(holds a recording | holds k others in the same lane). */
  lane: number[];
  /** The rate over everything, which the combination is measured against. */
  base: number;
}

const ALBUM_MAX = 12;
const ARTIST_MAX = 20;
const LANE_MAX = 200;
const LANE_STEP = 10;
/**
 * Laplace smoothing, so a thinly-observed bucket is pulled towards the overall
 * rate instead of asserting 1.0 from nine observations.
 */
const PRIOR = 30;

/**
 * Pool adjacent violators: the least-squares monotone fit to a noisy curve.
 *
 * Holding more of a set cannot make you less likely to hold the rest of it, so
 * the curve is monotone by construction and the wobbles in it — artist depth
 * reading 0.81 at ten and 0.49 at eleven — are sampling noise. This removes
 * them without smoothing away the shape.
 */
function isotonic(cells: Cell[], base: number): number[] {
  const y = cells.map((c) => (c.y + PRIOR * base) / (c.n + PRIOR));
  const w = cells.map((c) => c.n + PRIOR);
  const v: number[] = [], ww: number[] = [], len: number[] = [];
  for (let i = 0; i < y.length; i++) {
    let cv = y[i], cw = w[i], cl = 1;
    while (v.length && v[v.length - 1] > cv) {
      const pv = v.pop()!, pw = ww.pop()!, pl = len.pop()!;
      cv = (pv * pw + cv * cw) / (pw + cw); cw += pw; cl += pl;
    }
    v.push(cv); ww.push(cw); len.push(cl);
  }
  const out: number[] = [];
  for (let i = 0; i < v.length; i++) for (let j = 0; j < len[i]; j++) out.push(v[i]);
  return out;
}

export function measureRates(ref: Reference): Rates {
  const mk = (n: number): Cell[] => Array.from({ length: n }, () => ({ n: 0, y: 0 }));
  const album = mk(ALBUM_MAX + 1);
  const artist = mk(ARTIST_MAX + 1);
  const lane = mk(LANE_MAX / LANE_STEP + 1);
  let n = 0, y = 0;

  for (const [wk, w] of ref.works) {
    const albumHolders = w.albumId ? ref.albumWorksByUser.get(w.albumId) : undefined;
    const artistHolders = ref.artists.get(w.artistKey)?.worksByUser;
    const laneHolders = ref.subgenreWorksByUser.get(w.subgenre);
    for (const uid of ref.users) {
      const held = w.holders.has(uid) ? 1 : 0;
      n++; y += held;
      if (albumHolders) {
        const k = Math.min(ALBUM_MAX, (albumHolders.get(uid) ?? 0) - held);
        if (k >= 0) { album[k].n++; album[k].y += held; }
      }
      const ak = Math.min(ARTIST_MAX, (artistHolders?.get(uid)?.size ?? 0) - held);
      if (ak >= 0) { artist[ak].n++; artist[ak].y += held; }
      const lk = Math.min(LANE_MAX, Math.max(0, (laneHolders?.get(uid) ?? 0) - held));
      const lb = Math.round(lk / LANE_STEP);
      lane[lb].n++; lane[lb].y += held;
    }
  }
  const base = n > 0 ? y / n : 0.01;
  return {
    album: isotonic(album, base),
    artist: isotonic(artist, base),
    lane: isotonic(lane, base),
    base: Math.min(0.5, Math.max(1e-4, base)),
  };
}

/**
 * How likely this listener is to want one recording.
 *
 * Back-off, not naive Bayes. The first version added all three curves on the
 * log-odds scale, and the three are nested — every album track is also an
 * artist track and a lane track — so the same evidence was counted three times
 * and almost every candidate came out near one. Scores bunched between 25 and
 * 30 out of a possible 30 and the ranking stopped discriminating.
 *
 * So condition on the finest partition the listener actually sits in: if they
 * hold part of this record, that is what is known about them and the coarser
 * facts add nothing; failing that, the artist; failing that, the lane. This is
 * the standard remedy for nested evidence and it needs no weights.
 */
export function holdRate(
  r: Rates, albumHeld: number, artistHeld: number, laneHeld: number,
): number {
  if (albumHeld > 0) return r.album[Math.min(ALBUM_MAX, albumHeld)];
  if (artistHeld > 0) return r.artist[Math.min(ARTIST_MAX, artistHeld)];
  return r.lane[Math.round(Math.min(LANE_MAX, Math.max(0, laneHeld)) / LANE_STEP)];
}

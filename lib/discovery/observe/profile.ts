/**
 * One listener, counted every way a question might ask.
 *
 * The profile is deliberately only marginals — how much of each artist, album,
 * lane, world and year they hold. Those are the things a person already knows
 * about themselves, and the whole engine is built on the difference between
 * what those marginals predict and what is actually there. Nothing here is a
 * taste model: there is no inferred preference, no embedding and nowhere to
 * put one.
 */
import type { TrackRow } from "../types";
import { artistKeyOf, workKeyOf, yearOf, type Reference } from "./reference";

export interface Profile {
  userId: string;
  rows: number;
  works: Set<string>;
  byArtist: Map<string, Set<string>>;        // artistKey -> workKeys held
  byAlbum: Map<string, Set<string>>;         // albumId  -> workKeys held
  bySubgenre: Map<string, Set<string>>;
  byWorld: Map<string, Set<string>>;
  yearsOfArtist: Map<string, number[]>;
  /** Moments of this person's album-coverage rates, for the Beta fit. */
  coverage: { sumX: number; sumX2: number; n: number };
  albumCoverage: Map<string, { held: number; total: number }>;
  distinctWorks: number;
}

export function buildProfile(userId: string, tracks: TrackRow[], ref: Reference): Profile {
  const p: Profile = {
    userId, rows: 0, works: new Set(), byArtist: new Map(), byAlbum: new Map(),
    bySubgenre: new Map(), byWorld: new Map(), yearsOfArtist: new Map(),
    coverage: { sumX: 0, sumX2: 0, n: 0 }, albumCoverage: new Map(), distinctWorks: 0,
  };
  const push = (m: Map<string, Set<string>>, k: string, wk: string) => {
    let s = m.get(k); if (!s) { s = new Set(); m.set(k, s); } s.add(wk);
  };
  for (const t of tracks) {
    if (t.userId !== userId) continue;
    p.rows++;
    const wk = workKeyOf(t.name, t.artist);
    const ak = artistKeyOf(t.artist);
    p.works.add(wk);
    push(p.byArtist, ak, wk);
    // The lane a recording belongs to is decided once in the reference, by
    // majority vote across every row of it. Reading this row's own tag instead
    // made a listener's lane depth disagree with the index's view of it.
    const w = ref.works.get(wk);
    push(p.bySubgenre, w?.subgenre ?? t.blueprintSubgenre, wk);
    push(p.byWorld, w?.world ?? t.blueprintWorld, wk);
    if (t.albumId) push(p.byAlbum, t.albumId, wk);
    const y = yearOf(t);
    if (y !== null) {
      let ys = p.yearsOfArtist.get(ak); if (!ys) { ys = []; p.yearsOfArtist.set(ak, ys); }
      ys.push(y);
    }
  }
  p.distinctWorks = p.works.size;
  for (const [aid, held] of p.byAlbum) {
    const alb = ref.albums.get(aid);
    if (!alb || alb.albumType !== "album" || alb.totalTracks < 5) continue;
    const total = alb.totalTracks;
    const x = Math.min(1, held.size / total);
    p.albumCoverage.set(aid, { held: held.size, total });
    p.coverage.sumX += x; p.coverage.sumX2 += x * x; p.coverage.n++;
  }
  return p;
}

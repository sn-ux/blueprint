import { prisma } from "@/lib/prisma";
import type { PersonRow, TrackRow } from "./types";

/**
 * The recommendation corpus, and why it is cached.
 *
 * Generation reads every track of every participating library — 27,723 rows,
 * 14.5 MB, 3.3 seconds — and it read them again on every cursor-less feed
 * request. Each pull to refresh was a full table scan. That is what exhausted
 * a five-gigabyte transfer quota, and it would have kept costing money for
 * data that had not changed between one request and the next.
 *
 * The corpus is deliberately not per viewer. It is the same set of rows for
 * everybody — all tracks of all non-hidden users — and it is buildIndex that
 * turns it into one person's view by subtracting their library from it. So
 * caching the input shares nothing between viewers that was not already
 * shared, and the cache key contains no viewer at all. Every derived set stays
 * per request, per viewer.
 *
 * Freshness comes from a fingerprint rather than from a clock: five rows
 * carrying each library's size and the most recent write to it. An import, a
 * backfill or a single edited row changes it; nothing else does. A short
 * ceiling on age is kept as a backstop in case a write ever escapes it.
 */

export interface Corpus {
  people: PersonRow[];
  tracks: TrackRow[];
}

interface Cached extends Corpus {
  fingerprint: string;
  loadedAt: number;
}

/** Module scope, so it survives between invocations on a warm instance. */
let cached: Cached | null = null;

/** Visible in logs, so an unexpectedly expensive build cannot go unnoticed. */
export const corpusStats = {
  builds: 0,
  reuses: 0,
  rowsRead: 0,
  fingerprintChecks: 0,
};

const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Five rows: how many tracks each library holds and when it last changed.
 *
 * Counts alone would miss an in-place edit, and a timestamp alone would miss a
 * deletion, so it carries both.
 */
async function fingerprint(): Promise<string> {
  corpusStats.fingerprintChecks++;
  const rows = await prisma.track.groupBy({
    by: ["userId"],
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return rows
    .map((r) => `${r.userId}:${r._count._all}:${r._max.updatedAt?.getTime() ?? 0}`)
    .sort()
    .join("|");
}

/**
 * The corpus, from cache when nothing has changed.
 *
 * Correctness never depends on the cache: a miss, a cold start or a different
 * serverless instance simply reads the rows again and produces exactly the
 * same result. The cache is an optimisation, not a source of truth.
 */
export async function loadCorpus(): Promise<Corpus & { reused: boolean }> {
  const t0 = Date.now();
  const fp = await fingerprint();
  const fresh = cached
    && cached.fingerprint === fp
    && Date.now() - cached.loadedAt < MAX_AGE_MS;

  if (fresh && cached) {
    corpusStats.reuses++;
    console.log(`[corpus] reused ${cached.tracks.length} tracks (${Date.now() - t0}ms)`);
    return { people: cached.people, tracks: cached.tracks, reused: true };
  }

  const people = await prisma.user.findMany({
    where: { midvaleHidden: false, tracks: { some: {} } },
    select: { id: true, name: true, image: true },
  });
  const tracks = await prisma.track.findMany({
    where: { user: { midvaleHidden: false } },
    select: {
      userId: true, spotifyId: true, name: true, artist: true, album: true,
      imageUrl: true, artistId: true, artistImageUrl: true,
      blueprintWorld: true, blueprintSubgenre: true,
      albumId: true, albumTotalTracks: true, trackNumber: true, discNumber: true,
      albumType: true,
    },
  });

  cached = { people, tracks, fingerprint: fp, loadedAt: Date.now() };
  corpusStats.builds++;
  corpusStats.rowsRead += tracks.length;
  console.log(
    `[corpus] rebuilt ${tracks.length} tracks from ${people.length} libraries`
    + ` (${Date.now() - t0}ms) — builds ${corpusStats.builds}, reuses ${corpusStats.reuses}`,
  );
  return { people, tracks, reused: false };
}

/** Drops the cache. For scripts that have just written to the corpus. */
export function invalidateCorpus(): void {
  cached = null;
}

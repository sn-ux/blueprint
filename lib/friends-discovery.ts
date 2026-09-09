import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

/**
 * Discovery filtering for the Friends world.
 *
 * The Friends world has two readings. The website's is the whole shared
 * catalogue — everything everyone has, the viewer included — and that is what
 * these routes return by default. The app's is discovery: what the people
 * around you have that you do not, which is the only version that answers
 * "what should I listen to next".
 *
 * `?excludeMine=1` asks for the second. It resolves the caller from their own
 * session rather than taking a user id, so nobody can diff the aggregate to
 * infer what somebody else has saved.
 *
 * Exclusion happens here, before anything is counted — the totals, the genre
 * counts, the subgenre counts and the track lists all come off the same
 * filtered set, so no number can disagree with the list beneath it.
 */
export type TrackFilter = (spotifyId: string) => boolean;

const KEEP_EVERYTHING: TrackFilter = () => true;

export interface DiscoveryFilter {
  /** False when ?excludeMine=1 was asked for without a session. */
  ok: boolean;
  keep: TrackFilter;
  /** How many unique tracks the viewer already has. Logged, not returned. */
  excluded: number;
}

export async function discoveryFilter(req: NextRequest): Promise<DiscoveryFilter> {
  const excludeMine = new URL(req.url).searchParams.get("excludeMine") === "1";
  if (!excludeMine) return { ok: true, keep: KEEP_EVERYTHING, excluded: 0 };

  const viewer = await getCurrentUser();
  if (!viewer) return { ok: false, keep: KEEP_EVERYTHING, excluded: 0 };

  const mine = await prisma.track.findMany({
    where: { userId: viewer.id },
    select: { spotifyId: true },
  });
  const saved = new Set(mine.map((t) => t.spotifyId));

  return {
    ok: true,
    keep: (spotifyId: string) => !saved.has(spotifyId),
    excluded: saved.size,
  };
}

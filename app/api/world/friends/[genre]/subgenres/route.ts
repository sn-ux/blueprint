// GET /api/world/friends/[genre]/subgenres
// Returns deduped subgenre counts for one genre across all Midvale users.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { discoveryFilter } from "@/lib/friends-discovery";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ genre: string }> },
) {
  // ?excludeMine=1 drops everything the caller already has, before counting.
  const filter = await discoveryFilter(req);
  if (!filter.ok) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { genre } = await context.params;
  const blueprintWorld = decodeURIComponent(genre);

  // Only need spotifyId + subgenre — minimal query. Excludes users whose
  // Spotify access is no longer valid (midvaleHidden — see lib/spotify-import.ts).
  const allTracks = await prisma.track.findMany({
    where:  { blueprintWorld, user: { midvaleHidden: false } },
    select: { spotifyId: true, blueprintSubgenre: true },
  });

  // Dedup by spotifyId, then count per subgenre.
  const seen   = new Set<string>();
  const counts: Record<string, number> = {};

  for (const t of allTracks) {
    if (seen.has(t.spotifyId)) continue;
    seen.add(t.spotifyId);
    if (!filter.keep(t.spotifyId)) continue;
    const sub = t.blueprintSubgenre?.trim();
    if (!sub) continue;
    counts[sub] = (counts[sub] ?? 0) + 1;
  }

  const subgenres = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json(
    { world: blueprintWorld, subgenres },
    { headers: { "Cache-Control": "no-store" } },
  );
}

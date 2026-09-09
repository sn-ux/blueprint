// GET /api/world/friends
// Returns genre → unique-track-count for the combined Friends World.
// Aggregates all users who have at least one track; deduplicates by spotifyId.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { discoveryFilter } from "@/lib/friends-discovery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const t0 = Date.now();

  // ?excludeMine=1 drops everything the caller already has, before counting.
  const filter = await discoveryFilter(req);
  if (!filter.ok) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch spotifyId + blueprintWorld for every track across all users.
  // Dedup by spotifyId — one entry per unique track regardless of how many
  // users have saved it. Excludes users whose Spotify access is no longer
  // valid (midvaleHidden — see lib/spotify-import.ts).
  const allTracks = await prisma.track.findMany({
    where:  { user: { midvaleHidden: false } },
    select: { spotifyId: true, blueprintWorld: true },
  });

  const seen   = new Set<string>();
  const worlds: Record<string, number> = {};

  for (const t of allTracks) {
    if (seen.has(t.spotifyId)) continue;
    seen.add(t.spotifyId);
    if (!filter.keep(t.spotifyId)) continue;
    worlds[t.blueprintWorld] = (worlds[t.blueprintWorld] ?? 0) + 1;
  }

  const sorted = Object.fromEntries(
    Object.entries(worlds).sort((a, b) => b[1] - a[1])
  );

  console.log(`[perf] /api/world/friends → ${Object.keys(sorted).length} genres in ${Date.now() - t0}ms`);

  // A filtered world is personal to the caller and must never be shared by a
  // CDN; the unfiltered one is the same for everybody.
  return NextResponse.json(sorted, {
    headers: {
      "Cache-Control": filter.excluded
        ? "no-store"
        : "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

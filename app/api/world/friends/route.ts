// GET /api/world/friends
// Returns genre → unique-track-count for the combined Friends World.
// Aggregates all users who have at least one track; deduplicates by spotifyId.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();

  // Fetch spotifyId + blueprintWorld for every track across all users.
  // Dedup by spotifyId — one entry per unique track regardless of how many
  // users have saved it.
  const allTracks = await prisma.track.findMany({
    select: { spotifyId: true, blueprintWorld: true },
  });

  const seen   = new Set<string>();
  const worlds: Record<string, number> = {};

  for (const t of allTracks) {
    if (seen.has(t.spotifyId)) continue;
    seen.add(t.spotifyId);
    worlds[t.blueprintWorld] = (worlds[t.blueprintWorld] ?? 0) + 1;
  }

  const sorted = Object.fromEntries(
    Object.entries(worlds).sort((a, b) => b[1] - a[1])
  );

  console.log(`[perf] /api/world/friends → ${Object.keys(sorted).length} genres in ${Date.now() - t0}ms`);

  return NextResponse.json(sorted, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}

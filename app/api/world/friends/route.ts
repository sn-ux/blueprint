// GET /api/world/friends
// Returns genre → unique-track-count for the combined Friends World.
// Aggregates all users who have at least one track; deduplicates by spotifyId.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  // Fetch spotifyId + blueprintWorld for every track across all users.
  // Dedup by spotifyId — one entry per unique track regardless of how many
  // users have saved it.
  const allTracks = await prisma.track.findMany({
    select: { spotifyId: true, blueprintWorld: true },
  });

  const seen   = new Set<string>();
  const worlds: Record<string, number> = {};

  for (const t of allTracks) {
    // Use spotifyId as the dedup key (always present — required DB field).
    if (seen.has(t.spotifyId)) continue;
    seen.add(t.spotifyId);
    worlds[t.blueprintWorld] = (worlds[t.blueprintWorld] ?? 0) + 1;
  }

  const sorted = Object.fromEntries(
    Object.entries(worlds).sort((a, b) => b[1] - a[1])
  );

  return NextResponse.json(sorted, {
    headers: { "Cache-Control": "no-store" },
  });
}

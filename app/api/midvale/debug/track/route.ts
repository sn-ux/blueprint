// GET /api/midvale/debug/track?userId=<id>&q=<partial-title>
//
// Searches DB tracks for a specific user by partial title match (case-insensitive).
// Use this after an import to confirm whether a playlist-only song was saved.
//
// Example:
//   /api/midvale/debug/track?userId=clxyz...&q=Blinding+Lights
//
// Returns:
//   matchCount  — how many rows matched
//   matches[]   — spotifyId, name, artist, album, blueprintWorld, source hint
//   totalForUser — total tracks in DB for this user (sanity check)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const q      = searchParams.get("q")?.trim();

  if (!userId) {
    return NextResponse.json({ error: "userId param required" }, { status: 400 });
  }
  if (!q) {
    return NextResponse.json({ error: "q param required (partial track title)" }, { status: 400 });
  }

  const [matches, totalForUser] = await Promise.all([
    prisma.track.findMany({
      where: {
        userId,
        name: { contains: q, mode: "insensitive" },
      },
      select: {
        spotifyId:         true,
        name:              true,
        artist:            true,
        album:             true,
        blueprintWorld:    true,
        blueprintSubgenre: true,
        rawGenre:          true,
      },
      take: 20,
    }),
    prisma.track.count({ where: { userId } }),
  ]);

  return NextResponse.json({
    userId,
    query:        q,
    matchCount:   matches.length,
    totalForUser,
    matches,
  });
}

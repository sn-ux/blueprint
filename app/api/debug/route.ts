import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1. Total tracks
  const totalTracks = await prisma.track.count({ where: { userId: user.id } });

  // 2. Tracks where blueprintWorld is non-empty string
  const tracksWithWorld = await prisma.track.count({
    where: { userId: user.id, blueprintWorld: { not: "" } },
  });

  // 3. Tracks where blueprintSubgenre is non-empty string
  const tracksWithSubgenre = await prisma.track.count({
    where: { userId: user.id, blueprintSubgenre: { not: "" } },
  });

  // 4. Count by blueprintWorld (distribution)
  const worldGroups = await prisma.track.groupBy({
    by: ["blueprintWorld"],
    where: { userId: user.id },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  // 5. Count by blueprintSubgenre (top 40)
  const subgenreGroups = await prisma.track.groupBy({
    by: ["blueprintSubgenre"],
    where: { userId: user.id },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 40,
  });

  // 6. Sample 5 raw tracks so we can see actual field values
  const sample = await prisma.track.findMany({
    where: { userId: user.id },
    select: {
      spotifyId: true,
      name: true,
      artist: true,
      rawGenre: true,
      blueprintWorld: true,
      blueprintSubgenre: true,
    },
    take: 5,
  });

  // 7. Tracks with rawGenre = "unknown" (artist had no Spotify genre data)
  const unknownRawGenre = await prisma.track.count({
    where: { userId: user.id, rawGenre: "unknown" },
  });

  // 8. Tracks classified as "Other" world
  const otherWorld = await prisma.track.count({
    where: { userId: user.id, blueprintWorld: "Other" },
  });

  return NextResponse.json({
    userId: user.id,
    totalTracks,
    tracksWithWorld,
    tracksWithSubgenre,
    unknownRawGenre,
    otherWorld,
    worldDistribution: worldGroups.map((g) => ({
      world: g.blueprintWorld,
      count: g._count.id,
    })),
    topSubgenres: subgenreGroups.map((g) => ({
      subgenre: g.blueprintSubgenre,
      count: g._count.id,
    })),
    sampleTracks: sample,
  });
}

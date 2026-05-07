import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ genre: string }> },
) {
  const { searchParams } = new URL(req.url);
  const queryUserId = searchParams.get("userId");

  let user;
  if (queryUserId) {
    user = await prisma.user.findUnique({ where: { id: queryUserId } });
  } else {
    const authed = await getCurrentUser();
    user =
      authed ??
      (await prisma.user.findFirst({ where: { tracks: { some: {} } } }));
  }

  const { genre } = await context.params;
  const blueprintWorld = decodeURIComponent(genre);

  if (!user) {
    return NextResponse.json({ genre: blueprintWorld, tracks: [] });
  }

  const tracks = await prisma.track.findMany({
    where: { userId: user.id, blueprintWorld },
    select: {
      id:                true,
      name:              true,
      artist:            true,
      album:             true,
      imageUrl:          true,
      previewUrl:        true,
      spotifyId:         true,
      blueprintSubgenre: true,
    },
    orderBy: [{ artist: "asc" }, { name: "asc" }],
  });

  // ── Social popularity: count other Midvale users who also have each track ──
  // One grouped query — not one query per track.
  // Because (userId, spotifyId) is a unique index, each row = one distinct user.
  // So _count.id === number of other users who have that spotifyId.

  const spotifyIds = tracks
    .map(t => t.spotifyId)
    .filter((id): id is string => !!id);

  let socialMap = new Map<string, number>();
  if (spotifyIds.length > 0) {
    const groups = await prisma.track.groupBy({
      by:    ["spotifyId"],
      _count: { id: true },
      where: {
        spotifyId: { in: spotifyIds },
        userId:    { not: user.id },   // exclude the viewed user themselves
      },
    });
    socialMap = new Map(
      groups.map(g => [g.spotifyId as string, g._count.id])
    );
  }

  const tracksWithSocial = tracks.map(t => ({
    ...t,
    socialCount: socialMap.get(t.spotifyId ?? "") ?? 0,
  }));

  return NextResponse.json({ genre: blueprintWorld, tracks: tracksWithSocial });
}

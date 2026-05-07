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

  // ── Social popularity: find other Midvale users who also have each track ──
  // One query fetches all matching tracks with their owner's id + name.
  // Because (userId, spotifyId) is a unique index, each row = one distinct user.

  const spotifyIds = tracks
    .map(t => t.spotifyId)
    .filter((id): id is string => !!id);

  // Map from spotifyId → array of { id, name } for users who have that track
  const socialUsersMap = new Map<string, { id: string; name: string | null }[]>();
  if (spotifyIds.length > 0) {
    const otherTracks = await prisma.track.findMany({
      where: {
        spotifyId: { in: spotifyIds },
        userId:    { not: user.id },   // exclude the viewed user themselves
      },
      select: {
        spotifyId: true,
        user:      { select: { id: true, name: true } },
      },
    });
    for (const ot of otherTracks) {
      if (!ot.spotifyId) continue;
      const list = socialUsersMap.get(ot.spotifyId) ?? [];
      list.push(ot.user);
      socialUsersMap.set(ot.spotifyId, list);
    }
  }

  const tracksWithSocial = tracks.map(t => ({
    ...t,
    socialCount: socialUsersMap.get(t.spotifyId ?? "")?.length ?? 0,
    socialUsers: socialUsersMap.get(t.spotifyId ?? "") ?? [],
  }));

  return NextResponse.json({ genre: blueprintWorld, tracks: tracksWithSocial });
}

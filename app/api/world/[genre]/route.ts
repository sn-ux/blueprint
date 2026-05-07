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
  // Single source of truth: build socialUsers first (deduped by userId),
  // then socialCount = socialUsers.length.  No separate count query.

  const spotifyIds = tracks
    .map(t => t.spotifyId)
    .filter((id): id is string => !!id);

  // Map from spotifyId → deduped array of { id, name } for OTHER users
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
      // Dedupe by userId — guard against duplicate DB rows for the same user
      if (!list.some(u => u.id === ot.user.id)) {
        list.push(ot.user);
      }
      socialUsersMap.set(ot.spotifyId, list);
    }
  }

  const tracksWithSocial = tracks.map(t => {
    const socialUsers = socialUsersMap.get(t.spotifyId ?? "") ?? [];
    const socialCount = socialUsers.length;   // single source of truth
    return { ...t, socialUsers, socialCount };
  });

  // Debug log: first track that has any social data
  const firstSocial = tracksWithSocial.find(t => t.socialCount > 0);
  if (firstSocial) {
    console.log(
      `[social-debug] spotifyId=${firstSocial.spotifyId}` +
      ` socialUsers.length=${firstSocial.socialUsers.length}` +
      ` socialCount=${firstSocial.socialCount}` +
      ` renderedCount=${firstSocial.socialCount}`
    );
  }

  return NextResponse.json({ genre: blueprintWorld, tracks: tracksWithSocial });
}

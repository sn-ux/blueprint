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

  return NextResponse.json({ genre: blueprintWorld, tracks });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(
  _req: Request,
  context: { params: Promise<{ genre: string }> },
) {
  const authed = await getCurrentUser();
  const user =
    authed ??
    (await prisma.user.findFirst({ where: { tracks: { some: {} } } }));

  const { genre } = await context.params;
  const blueprintWorld = decodeURIComponent(genre);

  if (!user) {
    return NextResponse.json({ genre: blueprintWorld, tracks: [] });
  }

  const tracks = await prisma.track.findMany({
    where: { userId: user.id, blueprintWorld },
    select: {
      id:               true,
      name:             true,
      artist:           true,
      album:            true,
      blueprintSubgenre: true,
    },
    orderBy: [{ artist: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ genre: blueprintWorld, tracks });
}

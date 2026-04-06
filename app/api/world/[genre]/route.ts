import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(
  _req: Request,
  context: { params: Promise<{ genre: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { genre } = await context.params;
  const blueprintWorld = decodeURIComponent(genre);

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

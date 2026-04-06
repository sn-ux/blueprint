import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET() {
  // Authenticated users see their own world; unauthenticated visitors see the
  // owner's public world (first user in the DB who has imported tracks).
  const authed = await getCurrentUser();
  const user =
    authed ??
    (await prisma.user.findFirst({ where: { tracks: { some: {} } } }));

  if (!user) {
    return NextResponse.json({});
  }

  const tracks = await prisma.track.findMany({
    where: {
      userId: user.id,
    },
  });

  const worlds: Record<string, number> = {};

  for (const track of tracks) {
    const world = track.blueprintWorld;

    if (!worlds[world]) {
      worlds[world] = 0;
    }

    worlds[world]++;
  }

  const sortedWorlds = Object.fromEntries(
    Object.entries(worlds).sort((a, b) => b[1] - a[1])
  );

  return NextResponse.json(sortedWorlds);
}

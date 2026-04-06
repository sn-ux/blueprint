import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

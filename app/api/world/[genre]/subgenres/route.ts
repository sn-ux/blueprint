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
    return NextResponse.json({ world: blueprintWorld, subgenres: [] });
  }

  const tracks = await prisma.track.findMany({
    where: { userId: user.id, blueprintWorld },
    select: { blueprintSubgenre: true },
  });

  const counts: Record<string, number> = {};
  for (const track of tracks) {
    const sub = track.blueprintSubgenre?.trim();
    if (!sub) continue;
    counts[sub] = (counts[sub] ?? 0) + 1;
  }

  const subgenres = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ world: blueprintWorld, subgenres });
}

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

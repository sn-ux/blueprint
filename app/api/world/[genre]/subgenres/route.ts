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

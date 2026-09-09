import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorldUser, unauthenticated } from "@/lib/world-user";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ genre: string }> },
) {
  // Either an explicitly named profile, or the authenticated caller's own
  // library. Anything else is refused rather than answered with a stranger's.
  const resolved = await resolveWorldUser(req);
  if (!resolved) return unauthenticated();

  const user = resolved.user;

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

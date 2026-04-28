import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(req: NextRequest) {
  // Priority:
  //  1. ?userId=<id>  — explicit userId (Midvale public view, no auth required)
  //  2. Authenticated session  — user views their own world
  //  3. Fallback — first user in DB who has imported tracks (unauthenticated homepage)
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

  if (!user) {
    return NextResponse.json({});
  }

  const tracks = await prisma.track.findMany({
    where: { userId: user.id },
  });

  const worlds: Record<string, number> = {};
  for (const track of tracks) {
    worlds[track.blueprintWorld] = (worlds[track.blueprintWorld] ?? 0) + 1;
  }

  const sortedWorlds = Object.fromEntries(
    Object.entries(worlds).sort((a, b) => b[1] - a[1])
  );

  return NextResponse.json(sortedWorlds, {
    headers: { "Cache-Control": "no-store" },
  });
}

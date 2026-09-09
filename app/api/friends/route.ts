import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

/**
 * GET /api/friends — the people whose music the Friends world is made of.
 *
 * There is no friend graph yet. "Friends" is the same pool the aggregate
 * Friends endpoints already sum over: every user with a usable Spotify grant
 * and at least one imported track. The caller is excluded, because a person is
 * not their own social proof.
 *
 * Returns id, display name and avatar only. No emails, no account metadata.
 */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const friends = await prisma.user.findMany({
    where: {
      midvaleHidden: false,
      tracks: { some: {} },
      id: { not: viewer.id },
    },
    select: { id: true, name: true, image: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ friends }, { headers: { "Cache-Control": "no-store" } });
}

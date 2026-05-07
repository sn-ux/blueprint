// GET /api/admin/midvale/users
// Returns all users with track counts and account status.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select:  { id: true, name: true, email: true, image: true },
  });

  const [trackGroups, accounts] = await Promise.all([
    users.length > 0
      ? prisma.track.groupBy({
          by:    ["userId"],
          _count: { id: true },
          where: { userId: { in: users.map(u => u.id) } },
        })
      : Promise.resolve([]),
    users.length > 0
      ? prisma.account.findMany({
          where:  { userId: { in: users.map(u => u.id) }, provider: "spotify" },
          select: { userId: true, scope: true, expires_at: true },
        })
      : Promise.resolve([]),
  ]);

  const countMap   = new Map(trackGroups.map(g => [g.userId, g._count.id]));
  const accountMap = new Map(accounts.map(a => [a.userId, a]));

  const rows = users.map((u, i) => {
    const acc = accountMap.get(u.id);
    return {
      slot:             i,
      id:               u.id,
      name:             u.name,
      email:            u.email,
      image:            u.image,
      trackCount:       countMap.get(u.id) ?? 0,
      spotifyConnected: !!acc,
      spotifyScope:     acc?.scope ?? null,
      tokenExpiresAt:   acc?.expires_at ?? null,
    };
  });

  return NextResponse.json({ users: rows });
}

// GET /api/admin/midvale/users
// Returns all users with track counts and account status. Admin-only.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdmin, missingRequiredScopes, REQUIRED_SPOTIFY_SCOPES } from "@/lib/admin";

export async function GET() {
  const me = await getCurrentUser();
  if (!isAdmin(me?.id)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select:  { id: true, name: true, email: true, image: true, midvaleHidden: true },
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
          select: { userId: true, scope: true, refresh_token: true },
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
      // Connection health only. No token values, no granted-scope string and
      // no expiry timestamp leave the server.
      spotifyConnected: !!acc,
      hasRefreshToken:  !!acc?.refresh_token,
      missingScopes:    acc ? missingRequiredScopes(acc.scope) : REQUIRED_SPOTIFY_SCOPES,
      midvaleHidden:    u.midvaleHidden,
    };
  });

  return NextResponse.json({ users: rows });
}

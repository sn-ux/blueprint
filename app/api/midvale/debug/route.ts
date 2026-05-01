// GET /api/midvale/debug
//
// Returns a complete picture of what /midvale renders and why.
// Use this endpoint to diagnose:
//   A. OAuth worked but import fetched 0 tracks
//   B. Import fetched tracks but DB write failed
//   C. DB has tracks but /midvale query excludes user
//   D. User is hidden by the 4-slot limit
//   E. User has no liked songs on Spotify

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_SLOTS = 5;

export async function GET() {
  // All users, ordered the same way as /midvale
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select:  { id: true, name: true, email: true },
  });

  // All OAuth accounts
  const accounts = await prisma.account.findMany({
    select: {
      userId:            true,
      provider:          true,
      providerAccountId: true,
      scope:             true,
      expires_at:        true,
      access_token:      true,   // just first 8 chars for confirmation
      refresh_token:     true,   // just "present" / "missing"
    },
  });

  // Track counts per user
  const trackGroups = await prisma.track.groupBy({
    by:    ["userId"],
    _count: { id: true },
  });
  const countMap = new Map(trackGroups.map(t => [t.userId, t._count.id]));

  const allUserRows = users.map((u, index) => {
    const userAccounts = accounts.filter(a => a.userId === u.id);
    const trackCount   = countMap.get(u.id) ?? 0;
    const visibleOnMidvale = index < MAX_SLOTS && trackCount > 0;

    return {
      slot:          index,
      visibleOnMidvale,
      hiddenReason:  index >= MAX_SLOTS
        ? `outside MAX_SLOTS (${MAX_SLOTS})`
        : trackCount === 0
          ? "trackCount = 0 → shows as placeholder, not FullWorldCard"
          : null,
      user: {
        id:    u.id,
        name:  u.name,
        email: u.email,
      },
      trackCount,
      accounts: userAccounts.map(a => ({
        provider:          a.provider,
        providerAccountId: a.providerAccountId,
        scope:             a.scope,
        expires_at:        a.expires_at,
        // Show only first 8 chars of token so it's identifiable but not leaked
        accessTokenPrefix: a.access_token ? a.access_token.slice(0, 8) + "…" : null,
        hasRefreshToken:   !!a.refresh_token,
      })),
    };
  });

  // Summary
  const usersInSlots        = allUserRows.filter(r => r.slot < MAX_SLOTS);
  const usersWithTracks     = allUserRows.filter(r => r.trackCount > 0);
  const usersHiddenBySlot   = allUserRows.filter(r => r.slot >= MAX_SLOTS);

  return NextResponse.json({
    summary: {
      totalUsers:           users.length,
      MAX_SLOTS,
      usersVisibleOnMidvale: usersInSlots.filter(r => r.trackCount > 0).length,
      usersHiddenBySlotLimit: usersHiddenBySlot.length,
      usersWithZeroTracks:   usersInSlots.filter(r => r.trackCount === 0).length,
    },
    slots: usersInSlots,
    hiddenBeyondSlotLimit: usersHiddenBySlot,
    allUsersWithTracks: usersWithTracks.map(r => ({
      slot:  r.slot,
      id:    r.user.id,
      name:  r.user.name,
      trackCount: r.trackCount,
      visibleOnMidvale: r.visibleOnMidvale,
    })),
  });
}

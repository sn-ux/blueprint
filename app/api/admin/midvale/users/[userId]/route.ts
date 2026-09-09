// DELETE /api/admin/midvale/users/[userId]  — remove user + all their data
// Admin-only: this cascade-deletes the user's Account, Session and every Track.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdmin } from "@/lib/admin";

type Ctx = { params: Promise<{ userId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!isAdmin(me?.id)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { userId } = await ctx.params;

  const target = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, name: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const trackCount = await prisma.track.count({ where: { userId } });

  // onDelete: Cascade on Account, Session, Track — one delete removes everything.
  await prisma.user.delete({ where: { id: userId } });

  console.log(`[admin] deleted user ${userId} (${target.name}), ${trackCount} tracks removed`);

  return NextResponse.json({
    success:       true,
    deletedUserId: userId,
    deletedName:   target.name,
    tracksRemoved: trackCount,
  });
}

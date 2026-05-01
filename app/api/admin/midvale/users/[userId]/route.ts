// DELETE /api/admin/midvale/users/[userId]  — remove user + all their data
// PATCH  /api/admin/midvale/users/[userId]  — toggle midvaleHidden
// Admin-only.

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

  // Prevent admin from accidentally deleting themselves
  if (userId === me!.id) {
    return NextResponse.json({ error: "Cannot delete your own admin account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, name: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const trackCount = await prisma.track.count({ where: { userId } });

  // onDelete: Cascade on Account, Session, Track — deleting User removes everything.
  await prisma.user.delete({ where: { id: userId } });

  console.log(`[admin] deleted user ${userId} (${target.name}), ${trackCount} tracks removed`);

  return NextResponse.json({
    success:      true,
    deletedUserId: userId,
    deletedName:   target.name,
    tracksRemoved: trackCount,
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!isAdmin(me?.id)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { userId } = await ctx.params;
  const body: { midvaleHidden?: boolean } = await req.json().catch(() => ({}));

  if (typeof body.midvaleHidden !== "boolean") {
    return NextResponse.json({ error: "midvaleHidden (boolean) required" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data:  { midvaleHidden: body.midvaleHidden },
    select: { id: true, name: true, midvaleHidden: true },
  });

  console.log(`[admin] user ${userId} (${updated.name}) midvaleHidden → ${updated.midvaleHidden}`);

  return NextResponse.json({ success: true, user: updated });
}

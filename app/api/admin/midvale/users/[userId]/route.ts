// DELETE /api/admin/midvale/users/[userId]  — remove user + all their data

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ userId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
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

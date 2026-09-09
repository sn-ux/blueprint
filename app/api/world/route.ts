import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorldUser, unauthenticated } from "@/lib/world-user";

export async function GET(req: NextRequest) {
  const t0 = Date.now();

  // Either an explicitly named profile, or the authenticated caller's own
  // library. Anything else is refused rather than answered with a stranger's.
  const resolved = await resolveWorldUser(req);
  if (!resolved) return unauthenticated();

  const isPublicView = resolved.kind === "public";
  const user = resolved.user;

  if (!user) {
    return NextResponse.json({});
  }

  // Only need blueprintWorld + count — select minimal fields
  const tracks = await prisma.track.findMany({
    where:  { userId: user.id },
    select: { blueprintWorld: true },
  });

  const worlds: Record<string, number> = {};
  for (const track of tracks) {
    worlds[track.blueprintWorld] = (worlds[track.blueprintWorld] ?? 0) + 1;
  }

  const sortedWorlds = Object.fromEntries(
    Object.entries(worlds).sort((a, b) => b[1] - a[1])
  );

  console.log(`[perf] /api/world (${isPublicView ? `userId=${user.id}` : "session"}) → ${Object.keys(sortedWorlds).length} genres in ${Date.now() - t0}ms`);

  // Public Midvale views: allow short-lived CDN + client cache.
  // Own-world: no-store so auto-sync changes are always reflected.
  const cacheHeader = isPublicView
    ? "public, max-age=60, stale-while-revalidate=300"
    : "no-store";

  return NextResponse.json(sortedWorlds, {
    headers: { "Cache-Control": cacheHeader },
  });
}

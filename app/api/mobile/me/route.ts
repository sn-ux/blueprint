// GET /api/mobile/me
//
// The signed-in user's identity. Also the smallest endpoint mobile can use to
// confirm its credential still works. No Spotify tokens are exposed.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  /**
   * How many tracks this account holds.
   *
   * The one thing a client needs to tell a signed-in account with a library
   * from one that has just been created and has nothing yet. Somebody signing
   * in for the first time has no tracks until an import runs, and without this
   * the app cannot tell that apart from a library that is genuinely empty —
   * so it sat on an empty feed waiting for an import nobody had started.
   *
   * A count of the caller's own rows and nothing else.
   */
  const trackCount = await prisma.track.count({ where: { userId: me.id } });

  return NextResponse.json(
    { id: me.id, name: me.name, image: me.image, trackCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}

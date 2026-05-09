// POST /api/admin/midvale/users/[userId]/refresh
// Re-runs the liked-songs import for any user using their stored Spotify token.
// Admin-only.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { isAdmin } from "@/lib/admin";
import { runLikedSongsImport } from "@/lib/spotify-import";

type Ctx = { params: Promise<{ userId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!isAdmin(me?.id)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { userId } = await ctx.params;

  const result = await runLikedSongsImport(userId);

  if (!result.success) {
    // Return the full result object so the admin UI gets retryAfter, missingScopes, etc.
    const status = result.retryAfter !== undefined ? 429 : 400;
    const headers: Record<string, string> = result.retryAfter !== undefined
      ? { "Retry-After": String(result.retryAfter) }
      : {};
    return NextResponse.json(result, { status, headers });
  }

  return NextResponse.json(result);
}

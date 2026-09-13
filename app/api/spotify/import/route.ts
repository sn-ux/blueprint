import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { runLikedSongsImport } from "@/lib/spotify-import";

/**
 * A first import is minutes of work, not seconds.
 *
 * It pages the whole of Liked Songs, then every owned playlist, then the
 * artist genres, then upserts a row per track. For a few thousand tracks that
 * is well past the platform's default ceiling, and a truncated invocation
 * leaves a partially imported library behind. Raised to the maximum this plan
 * allows so a first-time sign-in completes in one request.
 */
export const maxDuration = 300;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await runLikedSongsImport(user.id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}

// POST /api/spotify/sync
//
// Lightweight sync: fetch current Liked Songs, upsert new tracks, delete
// unliked ones.  Used by the homepage auto-poll — authenticated user only.
//
// Returns:
//   { success, likedSongsFetched, tracksAdded, tracksRemoved,
//     dbTrackCountAfter, genreDistribution }
//
// 429 from Spotify is surfaced as HTTP 429 with a Retry-After header so the
// client can back off without spamming.

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

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const result = await runLikedSongsImport(user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Net-new tracks = after - before + removed
    // (upsert count includes updates to existing rows; this gives true additions)
    const tracksAdded = Math.max(
      0,
      result.dbTrackCountAfter - result.dbTrackCountBefore + result.tracksRemoved,
    );

    return NextResponse.json({
      success:           true,
      likedSongsFetched: result.likedSongsFetched,
      tracksAdded,
      tracksRemoved:     result.tracksRemoved,
      dbTrackCountAfter: result.dbTrackCountAfter,
      genreDistribution: result.genreDistribution,
    });
  } catch (err: unknown) {
    // Surface Spotify 429 so the client can respect Retry-After
    const axiosErr = err as {
      response?: { status?: number; headers?: Record<string, string> };
    };
    if (axiosErr?.response?.status === 429) {
      const retryAfter = parseInt(
        axiosErr.response?.headers?.["retry-after"] ?? "60",
        10,
      );
      console.warn(`[sync] Spotify 429 for userId=${user.id}, retry after ${retryAfter}s`);
      return NextResponse.json(
        { error: "rate_limited", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    console.error("[sync] unexpected error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

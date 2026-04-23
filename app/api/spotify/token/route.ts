import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getSpotifyToken } from "@/lib/spotify-token";

/**
 * GET /api/spotify/token
 *
 * Returns the current user's Spotify access token (auto-refreshed if expired).
 * Used by the client to initialize the Spotify Web Playback SDK.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tokenData = await getSpotifyToken(user.id);
  if (!tokenData) {
    return NextResponse.json({ error: "No Spotify account linked" }, { status: 400 });
  }

  return NextResponse.json(tokenData);
}

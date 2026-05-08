// POST /api/spotify/playlist-push
//
// Creates a private Spotify playlist for the logged-in user containing all
// tracks from the selected genre or subgenre.
//
// Body:
//   worldType : "user" | "friends"
//   userId?   : string   — the DB userId whose world to pull tracks from (user worlds only)
//   genre     : string   — blueprintWorld value
//   subgenre? : string   — blueprintSubgenre value (optional filter)
//
// The playlist is ALWAYS created in the account of whoever is logged in —
// not necessarily the owner of the world being viewed.
//
// Returns:
//   { playlistId, playlistUrl, trackCount }

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getSpotifyToken } from "@/lib/spotify-token";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Required scopes for playlist creation.
const REQUIRED_SCOPES = ["playlist-modify-private", "playlist-modify-public"];

// ── Spotify API helpers ───────────────────────────────────────────────────────

async function spotifyFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Diagnostic ──────────────────────────────────────────────────────────────
  const cookieHeader = req.headers.get("cookie") ?? "";
  const hasCookie    = cookieHeader.length > 0;
  const userAgent    = req.headers.get("user-agent") ?? "(none)";
  console.log("[playlist-push] route hit", {
    hasCookie,
    hasSessionToken: cookieHeader.includes("next-auth.session-token") ||
                     cookieHeader.includes("__Secure-next-auth.session-token"),
    userAgent: userAgent.slice(0, 80),
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  console.log("[playlist-push] auth", { userFound: !!user, userId: user?.id ?? null });
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tokenData = await getSpotifyToken(user.id);
  if (!tokenData) {
    return NextResponse.json(
      { error: "No Spotify account linked" },
      { status: 400 },
    );
  }

  // ── Scope check ─────────────────────────────────────────────────────────────
  const grantedScopes = (tokenData.scope ?? "").split(" ");
  const hasScope = REQUIRED_SCOPES.some(s => grantedScopes.includes(s));
  if (!hasScope) {
    return NextResponse.json(
      { error: "missing_scope", message: "Reconnect Spotify to create playlists." },
      { status: 403 },
    );
  }

  const { accessToken } = tokenData;

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: {
    worldType: "user" | "friends";
    userId?: string;
    genre: string;
    subgenre?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { worldType, userId, genre, subgenre } = body;

  if (!genre) {
    return NextResponse.json({ error: "genre is required" }, { status: 400 });
  }

  // Friends world: refuse to create playlists for top-level genres (no subgenre).
  // Subgenre must be specified.
  if (worldType === "friends" && !subgenre) {
    return NextResponse.json(
      { error: "Friends world playlists require a subgenre" },
      { status: 400 },
    );
  }

  // ── Fetch tracks from DB ─────────────────────────────────────────────────────

  let spotifyIds: string[] = [];

  if (worldType === "user") {
    // Resolve which userId's tracks to pull.
    // If userId is provided it refers to the world owner; if not, use the
    // currently logged-in user's own world.
    const targetUserId = userId ?? user.id;

    const rows = await prisma.track.findMany({
      where: {
        userId: targetUserId,
        blueprintWorld: genre,
        ...(subgenre ? { blueprintSubgenre: subgenre } : {}),
      },
      select: { spotifyId: true },
      orderBy: [{ artist: "asc" }, { name: "asc" }],
    });

    // Deduplicate by spotifyId, skip missing
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.spotifyId && !seen.has(r.spotifyId)) {
        seen.add(r.spotifyId);
        spotifyIds.push(r.spotifyId);
      }
    }
  } else {
    // Friends world: aggregate across ALL users, dedupe, filter by subgenre
    const rows = await prisma.track.findMany({
      where: {
        blueprintWorld: genre,
        ...(subgenre ? { blueprintSubgenre: subgenre } : {}),
      },
      select: { spotifyId: true },
      orderBy: [{ artist: "asc" }, { name: "asc" }],
    });

    const seen = new Set<string>();
    for (const r of rows) {
      if (r.spotifyId && !seen.has(r.spotifyId)) {
        seen.add(r.spotifyId);
        spotifyIds.push(r.spotifyId);
      }
    }
  }

  if (spotifyIds.length === 0) {
    return NextResponse.json(
      { error: "No tracks with Spotify IDs found for this selection" },
      { status: 400 },
    );
  }

  // ── Get the logged-in user's Spotify user ID ─────────────────────────────────
  const meRes = await spotifyFetch("/me", accessToken);
  if (!meRes.ok) {
    const err = await meRes.text().catch(() => "");
    console.error("[playlist-push] /me failed:", meRes.status, err);
    return NextResponse.json(
      { error: "Failed to get Spotify user info" },
      { status: 502 },
    );
  }
  const me = await meRes.json() as { id: string; display_name?: string };
  const spotifyUserId = me.id;

  // ── Build playlist name ──────────────────────────────────────────────────────
  // Individual genre:    Blueprint · [User Name] · [Genre]
  // Individual subgenre: Blueprint · [User Name] · [Subgenre]
  // Friends subgenre:    Blueprint · Friends · [Subgenre]
  let playlistName: string;
  if (worldType === "friends") {
    playlistName = `Blueprint · Friends · ${subgenre!}`;
  } else {
    const displayName = user.name?.split(" ")[0] ?? "Me";
    const label = subgenre ?? genre;
    playlistName = `Blueprint · ${displayName} · ${label}`;
  }

  // ── Create the playlist ──────────────────────────────────────────────────────
  const createRes = await spotifyFetch(
    `/users/${encodeURIComponent(spotifyUserId)}/playlists`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name:        playlistName,
        description: `Created by Blueprint · ${subgenre ?? genre}`,
        public:      false,
      }),
    },
  );

  if (!createRes.ok) {
    const err = await createRes.text().catch(() => "");
    console.error("[playlist-push] create failed:", createRes.status, err);

    // Detect scope issues Spotify surfaces at creation time
    if (createRes.status === 403) {
      return NextResponse.json(
        { error: "missing_scope", message: "Reconnect Spotify to create playlists." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create Spotify playlist" },
      { status: 502 },
    );
  }

  const playlist = await createRes.json() as { id: string; external_urls: { spotify: string } };
  const playlistId  = playlist.id;
  const playlistUrl = playlist.external_urls.spotify;

  // ── Add tracks in batches of 100 ─────────────────────────────────────────────
  const uris = spotifyIds.map(id => `spotify:track:${id}`);
  const BATCH = 100;
  let addedCount = 0;

  for (let i = 0; i < uris.length; i += BATCH) {
    const batch = uris.slice(i, i + BATCH);
    const addRes = await spotifyFetch(
      `/playlists/${playlistId}/tracks`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ uris: batch }),
      },
    );
    if (!addRes.ok) {
      const err = await addRes.text().catch(() => "");
      console.error("[playlist-push] add tracks failed (batch", i / BATCH, "):", addRes.status, err);
      // Continue — partial playlist is better than aborting
      break;
    }
    addedCount += batch.length;
  }

  console.log(
    `[playlist-push] created "${playlistName}" (${playlistId}) for Spotify user ${spotifyUserId}` +
    ` — ${addedCount}/${spotifyIds.length} tracks added`,
  );

  return NextResponse.json({
    playlistId,
    playlistUrl,
    trackCount: addedCount,
  });
}

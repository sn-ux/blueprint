// POST /api/spotify/playlist-push
//
// Creates a private Spotify playlist for the logged-in user containing all
// tracks from the selected genre or subgenre.
//
// Body:
//   worldType : "user" | "friends"
//   userId?   : string     — the DB userId whose world to pull tracks from (user worlds only)
//   genre     : string     — blueprintWorld value
//   subgenre? : string     — blueprintSubgenre value (optional filter)
//   trackIds? : string[]   — ordered Spotify track IDs from the client UI.
//                            When provided, the server uses this order exactly
//                            (matching the Track tab) instead of re-sorting from DB.
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
  const userAgent    = req.headers.get("user-agent") ?? "(none)";
  const hasInsecure  = cookieHeader.includes("next-auth.session-token");
  const hasSecure    = cookieHeader.includes("__Secure-next-auth.session-token");
  console.log("[playlist-push] route hit", {
    host:            req.headers.get("host"),
    origin:          req.headers.get("origin"),
    referer:         req.headers.get("referer"),
    hasCookieHeader: cookieHeader.length > 0,
    hasInsecureToken: hasInsecure,
    hasSecureToken:  hasSecure,
    cookieNames:     cookieHeader
                       .split(";")
                       .map(c => c.trim().split("=")[0])
                       .filter(Boolean),
    userAgent:       userAgent.slice(0, 80),
    nextauthUrl:     process.env.NEXTAUTH_URL ?? "(not set)",
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  console.log("[playlist-push] auth", {
    userFound: !!user,
    userId:    user?.id ?? null,
    email:     user?.email ?? null,
  });
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
    /** Ordered Spotify track IDs from the client-side UI.  When present (and
     *  non-empty) the server uses this list as-is — preserving the exact sort
     *  order the user sees in the Track tab — instead of re-sorting from DB. */
    trackIds?: string[];
    /** What to call it. Falls back to the subgenre, then the genre. */
    name?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { worldType, userId, genre, subgenre, trackIds, name } = body;

  if (!genre) {
    return NextResponse.json({ error: "genre is required" }, { status: 400 });
  }

  // ── Resolve ordered Spotify IDs ──────────────────────────────────────────────
  // Priority: client-supplied trackIds (UI order) > DB fallback (alphabetical).
  // The client always sends trackIds for user worlds so the fallback path exists
  // for friends worlds and any future callers that omit the field.

  const spotifyIds: string[] = [];

  if (Array.isArray(trackIds) && trackIds.length > 0) {
    // Client sent the pre-ordered list.  Dedup and drop any empty strings that
    // may have slipped through (tracks missing a Spotify URI).
    const seen = new Set<string>();
    for (const id of trackIds) {
      if (id && !seen.has(id)) {
        seen.add(id);
        spotifyIds.push(id);
      }
    }
  } else {
    // Fallback: re-derive from DB (friends world, or legacy callers).
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

  /**
   * Only ids Spotify can actually take.
   *
   * Twenty-two characters of base62 is what a Spotify id is; anything else —
   * a Blueprint row id, an empty string, something half-mapped — makes the
   * add call fail for every track in its batch, not just for itself.
   */
  const validIds = spotifyIds.filter(id => /^[A-Za-z0-9]{22}$/.test(id));
  const dropped = spotifyIds.length - validIds.length;
  console.log(
    `[playlist-push] ${worldType} "${genre}" — ${spotifyIds.length} ids in,`
    + ` ${validIds.length} valid${dropped ? `, ${dropped} dropped` : ""}`
    + ` — first: ${validIds.slice(0, 5).join(", ")}`,
  );

  // Nothing to make a playlist out of. Said before one is created, so there is
  // never an empty playlist sitting in somebody's Spotify.
  if (validIds.length === 0) {
    console.error("[playlist-push] no usable Spotify ids", spotifyIds.slice(0, 5));
    return NextResponse.json(
      { error: "no_tracks", message: "None of these tracks have a usable Spotify id." },
      { status: 400 },
    );
  }

  // ── Build playlist name ──────────────────────────────────────────────────────
  // Individual genre:    Blueprint · [User Name] · [Genre]
  // Individual subgenre: Blueprint · [User Name] · [Subgenre]
  // Friends subgenre:    Blueprint · Friends · [Subgenre]
  // A caller that knows what the list is may say so; otherwise the subgenre,
  // otherwise the genre. The subgenre used to be asserted non-null and is not
  // sent by the app at all, so every playlist it made was called
  // "Blueprint · Friends · undefined".
  const label = (name?.trim() || subgenre || genre);
  const playlistName = worldType === "friends"
    ? `Blueprint · Friends · ${label}`
    : `Blueprint · ${user.name?.split(" ")[0] ?? "Me"} · ${label}`;

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

  /**
   * Add the tracks, in batches of a hundred.
   *
   * Spotify rejects a whole batch for one bad id — "Invalid base62 id", 400,
   * nothing added — so a single unusable row among a hundred good ones used to
   * empty the entire playlist. The ids are filtered to the shape Spotify
   * accepts before any of them is sent, so one bad row costs one track.
   */
  const uris = validIds.map(id => `spotify:track:${id}`);
  const BATCH = 100;
  let addedCount = 0;

  for (let i = 0; i < uris.length; i += BATCH) {
    const batch = uris.slice(i, i + BATCH);
    const addRes = await spotifyFetch(
      `/playlists/${playlistId}/tracks`,
      accessToken,
      { method: "POST", body: JSON.stringify({ uris: batch }) },
    );
    if (!addRes.ok) {
      const err = await addRes.text().catch(() => "");
      console.error(
        `[playlist-push] add failed, batch ${i / BATCH}: ${addRes.status} ${err}`,
      );
      /**
       * A failure is a failure.
       *
       * This used to break out of the loop and answer 200 with the playlist's
       * address and a count of zero — so the app opened an empty playlist and
       * called it done. Nothing is reported as created unless every batch
       * went in.
       */
      return NextResponse.json(
        {
          error: "add_failed",
          message: "Spotify created the playlist but would not accept the tracks.",
          status: addRes.status,
          detail: err.slice(0, 400),
          playlistId,
          playlistUrl,
          added: addedCount,
          expected: uris.length,
        },
        { status: 502 },
      );
    }
    addedCount += batch.length;
  }

  console.log(
    `[playlist-push] created "${playlistName}" (${playlistId}) for Spotify user ${spotifyUserId}`
    + ` — ${addedCount}/${validIds.length} tracks added`,
  );

  return NextResponse.json({ playlistId, playlistUrl, trackCount: addedCount });
}

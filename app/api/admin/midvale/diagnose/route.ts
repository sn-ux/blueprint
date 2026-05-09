// GET /api/admin/midvale/diagnose?userId=<dbUserId>
//
// Full per-stage diagnostic for a single user's Spotify import.
// Returns every intermediate value so we can identify exactly which
// stage is failing without relying on server logs.
//
// Stages reported:
//   1. DB user + Spotify account meta (scopes, token presence)
//   2. GET /v1/me  → spotifyUserId, display_name
//   3. GET /v1/me/playlists → first 20 with owner info + isOwned flag
//   4. Per owned-playlist: raw item count, valid track count, first 5 tracks
//   5. Merge summary: liked, ownedPlaylistTracks, unique, dbBefore, dbAfter
//   6. DB state after: total rows, distinct spotifyIds, latest 10 tracks

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdmin } from "@/lib/admin";

// ── Spotify helpers (lightweight, no side-effects on DB except token refresh) ─

async function getToken(account: {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
}): Promise<string> {
  if (account.access_token) return account.access_token;
  throw new Error("No access token stored");
}

async function sGet(url: string, token: string) {
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,   // don't throw on 4xx so we can report the status
  });
  return res;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isAdmin(me?.id)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get("userId");

  if (!targetUserId) {
    // If no userId given, list all users so caller can pick one
    const users = await prisma.user.findMany({
      orderBy: { id: "asc" },
      select:  { id: true, name: true, email: true },
    });
    return NextResponse.json({ hint: "Pass ?userId=<id> to diagnose", users });
  }

  const dbUser = await prisma.user.findUnique({
    where:  { id: targetUserId },
    select: { id: true, name: true, email: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: `No user with id ${targetUserId}` }, { status: 404 });
  }

  // ── Stage 1: Account meta ─────────────────────────────────────────────────

  const account = await prisma.account.findFirst({
    where:  { userId: targetUserId, provider: "spotify" },
    select: {
      id: true, scope: true,
      access_token: true, refresh_token: true, expires_at: true,
    },
  });

  const stage1 = {
    dbUser,
    hasAccount:         !!account,
    hasAccessToken:     !!account?.access_token,
    hasRefreshToken:    !!account?.refresh_token,
    scope:              account?.scope ?? null,
    scopeHasUserLibraryRead:           account?.scope?.includes("user-library-read") ?? false,
    scopeHasPlaylistReadPrivate:       account?.scope?.includes("playlist-read-private") ?? false,
    scopeHasPlaylistReadCollaborative: account?.scope?.includes("playlist-read-collaborative") ?? false,
    tokenExpiresAt: account?.expires_at
      ? new Date(account.expires_at * 1000).toISOString()
      : null,
  };

  if (!account?.access_token) {
    return NextResponse.json({ stage1, error: "No access token — cannot call Spotify" });
  }

  const token = await getToken(account);

  // ── Stage 2: GET /v1/me ───────────────────────────────────────────────────

  const meRes = await sGet("https://api.spotify.com/v1/me", token);
  const stage2 = {
    status:        meRes.status,
    spotifyUserId: meRes.data?.id          ?? null,
    displayName:   meRes.data?.display_name ?? null,
    country:       meRes.data?.country     ?? null,
    error:         meRes.status !== 200 ? meRes.data : undefined,
  };

  if (meRes.status !== 200) {
    return NextResponse.json({ stage1, stage2, error: "GET /v1/me failed" });
  }

  const spotifyUserId: string = meRes.data.id;

  // ── Stage 3: GET /v1/me/playlists ────────────────────────────────────────

  const playlistsRes = await sGet(
    "https://api.spotify.com/v1/me/playlists?limit=50", token,
  );

  const rawPlaylists: Array<{
    id: string; name: string; tracks: { total: number };
    owner: { id: string; display_name?: string };
  }> = playlistsRes.data?.items ?? [];

  const first20 = rawPlaylists.slice(0, 20).map(p => ({
    id:           p.id,
    name:         p.name,
    totalTracks:  p.tracks?.total ?? "?",
    ownerId:      p.owner?.id,
    ownerName:    p.owner?.display_name ?? null,
    isOwned:      p.owner?.id === spotifyUserId,
  }));

  const ownedPlaylistIds   = rawPlaylists.filter(p => p.owner?.id === spotifyUserId).map(p => p.id);
  const ownedPlaylistNames = rawPlaylists.filter(p => p.owner?.id === spotifyUserId).map(p => p.name);

  const stage3 = {
    httpStatus:              playlistsRes.status,
    totalReturnedThisPage:   rawPlaylists.length,
    hasNextPage:             !!playlistsRes.data?.next,
    ownedCount:              ownedPlaylistIds.length,
    skippedCount:            rawPlaylists.length - ownedPlaylistIds.length,
    ownedPlaylistNames,
    first20,
  };

  // ── Stage 4: Per-owned-playlist track fetch ───────────────────────────────

  type TrackDiag = {
    playlistName:    string;
    playlistId:      string;
    httpStatus:      number;
    rawItemCount:    number;
    validTrackCount: number;
    nullTrackCount:  number;
    localTrackCount: number;
    nonTrackCount:   number;
    noArtistCount:   number;
    first5Tracks:    string[];
    fieldsParamUsed: string;
  };

  const stage4: TrackDiag[] = [];
  const trackIdsSeen = new Set<string>();   // global dedup across liked+playlists
  let   ownedPlaylistTracksFetched = 0;
  let   uniqueNewTracks = 0;

  const ownedPlaylists = rawPlaylists.filter(p => p.owner?.id === spotifyUserId);

  for (const pl of ownedPlaylists) {
    const fieldsParam =
      "next,items(track(id,name,type,is_local,preview_url,album(name,images),artists(id,name)))";
    const firstPageUrl =
      `https://api.spotify.com/v1/playlists/${pl.id}/tracks?limit=50&fields=${encodeURIComponent(fieldsParam)}`;

    const plRes = await sGet(firstPageUrl, token);

    const rawItems: Array<{ track: Record<string, unknown> | null }> =
      plRes.data?.items ?? [];

    let nullTracks  = 0;
    let localTracks = 0;
    let nonTracks   = 0;
    let noArtist    = 0;
    let valid       = 0;
    const first5: string[] = [];

    for (const item of rawItems) {
      ownedPlaylistTracksFetched++;
      const t = item.track;
      if (!t)                                        { nullTracks++;  continue; }
      if ((t as { is_local?: boolean }).is_local)    { localTracks++; continue; }
      if (t.type && t.type !== "track")              { nonTracks++;   continue; }
      if (!t.id)                                                       continue;
      const artists = (t.artists as Array<{ id: string }> | undefined) ?? [];
      if (!artists[0]?.id)                           { noArtist++;    continue; }
      valid++;
      if (!trackIdsSeen.has(t.id as string)) {
        trackIdsSeen.add(t.id as string);
        uniqueNewTracks++;
        if (first5.length < 5) first5.push(t.name as string);
      }
    }

    stage4.push({
      playlistName:    pl.name,
      playlistId:      pl.id,
      httpStatus:      plRes.status,
      rawItemCount:    rawItems.length,
      validTrackCount: valid,
      nullTrackCount:  nullTracks,
      localTrackCount: localTracks,
      nonTrackCount:   nonTracks,
      noArtistCount:   noArtist,
      first5Tracks:    first5,
      fieldsParamUsed: fieldsParam,
    });
  }

  // ── Stage 5: Liked songs count (1-page only for speed) ───────────────────

  const likedRes = await sGet(
    "https://api.spotify.com/v1/me/tracks?limit=1", token,
  );
  const likedTotal: number = likedRes.data?.total ?? 0;

  // ── Stage 6: DB state AFTER last real import ──────────────────────────────

  const dbCount = await prisma.track.count({ where: { userId: targetUserId } });
  const latestTracks = await prisma.track.findMany({
    where:   { userId: targetUserId },
    orderBy: { id: "desc" },
    take:    10,
    select:  { id: true, name: true, artist: true, spotifyId: true, blueprintWorld: true },
  });

  const stage6 = {
    dbTrackCount:  dbCount,
    latestTracks,
  };

  // ── Summary ───────────────────────────────────────────────────────────────

  const summary = {
    likedSongsTotal:          likedTotal,
    ownedPlaylistsFound:      ownedPlaylists.length,
    ownedPlaylistTracksDiagd: ownedPlaylistTracksFetched,
    uniqueNewTracksFromPlaylists: uniqueNewTracks,
    dbTrackCount:             dbCount,
    diagnosis: dbCount === likedTotal
      ? "DB matches liked-songs count — playlist tracks NOT being saved (likely Stage A or C)"
      : dbCount > likedTotal
        ? "DB has MORE tracks than liked songs — playlist tracks may be in DB already"
        : "DB has FEWER tracks than liked songs — import may not be finishing",
  };

  return NextResponse.json({
    summary,
    stage1_accountMeta:   stage1,
    stage2_spotifyMe:     stage2,
    stage3_playlists:     stage3,
    stage4_playlistTracks: stage4,
    stage6_dbState:       stage6,
  }, { headers: { "Cache-Control": "no-store" } });
}

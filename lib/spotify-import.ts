// Core library import: Liked Songs + playlists OWNED by the user.
//
// Sources included:
//   1. GET /v1/me/tracks          — Liked Songs
//   2. GET /v1/me/playlists       — user's playlist list (paginated)
//      filter: playlist.owner.id === spotifyUserId  (owns it, not just following)
//      GET /v1/playlists/{id}/tracks for each qualifying playlist
//
// Sources explicitly excluded:
//   - Spotify editorial / algorithmic playlists
//   - Playlists followed but not owned
//   - Playlists owned by other users / Spotify
//   - Recently played, top tracks, albums, recommendations
//
// Used by:
//   /api/spotify/import                          (self-import)
//   /api/spotify/sync                            (auto-poll)
//   /api/admin/midvale/users/[userId]/refresh    (admin refresh)

import axios from "axios";
import { prisma } from "@/lib/prisma";
import { classifyGenres } from "@/lib/blueprint-taxonomy";

// ── Types ─────────────────────────────────────────────────────────────────────

type RawTrack = {
  id: string;
  name: string;
  type: string;
  is_local?: boolean;
  preview_url: string | null;
  duration_ms?: number | null;
  album?: {
    name?: string | null;
    images?: { url: string }[];
    release_date?: string | null;
    release_date_precision?: string | null;
  };
  artists?: { id: string; name: string }[];
};

type NormalizedTrack = {
  id:            string;
  name:          string;
  previewUrl:    string | null;
  durationMs:    number | null;
  albumName:     string | null;
  albumImageUrl: string | null;
  // Kept exactly as Spotify gives it, with its own precision alongside.
  releaseDate:          string | null;
  releaseDatePrecision: string | null;
  artists:       { id: string; name: string }[];
};

export interface ImportResult {
  success:                       boolean;
  userId:                        string;
  // Liked Songs
  likedSongsFetched:             number;
  // Playlists
  playlistsReturnedBySpotify:    number;
  ownedPlaylistsCount:           number;
  skippedNonOwnedPlaylistsCount: number;
  ownedPlaylistTracksFetched:    number;
  // Combined
  uniqueAllowedTracks:           number;
  tracksUpserted:                number;
  tracksRemoved:                 number;
  dbTrackCountBefore:            number;
  dbTrackCountAfter:             number;
  dbDelta:                       number;
  noLikedSongs?:                 boolean;
  genreDistribution:             Record<string, number>;
  // Error detail
  error?:                        string;
  missingScopes?:                string[];   // set when required OAuth scopes absent
  retryAfter?:                   number;     // seconds, set on Spotify 429
}

// Required OAuth scopes — user must have granted all of these.
const REQUIRED_SCOPES = ["user-library-read", "playlist-read-private"] as const;

// Zero-value result for early-exit error paths.
function failResult(userId: string, error: string, extra?: Partial<ImportResult>): ImportResult {
  return {
    success: false, userId, error,
    likedSongsFetched: 0, playlistsReturnedBySpotify: 0,
    ownedPlaylistsCount: 0, skippedNonOwnedPlaylistsCount: 0,
    ownedPlaylistTracksFetched: 0, uniqueAllowedTracks: 0,
    tracksUpserted: 0, tracksRemoved: 0,
    dbTrackCountBefore: 0, dbTrackCountAfter: 0, dbDelta: 0,
    genreDistribution: {},
    ...extra,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function refreshToken(account: { id: string; refresh_token: string | null }) {
  if (!account.refresh_token) throw new Error("Missing refresh token.");

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID!}:${process.env.SPOTIFY_CLIENT_SECRET!}`
  ).toString("base64");

  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.refresh_token }).toString(),
    { headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" } },
  );

  const newToken   = res.data.access_token as string;
  const newRefresh = (res.data.refresh_token as string | undefined) ?? account.refresh_token;
  const expiresIn  = res.data.expires_in as number | undefined;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token:  newToken,
      refresh_token: newRefresh,
      expires_at: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
    },
  });

  return newToken;
}

async function spotifyGet(
  url: string,
  account: { id: string; access_token: string | null; refresh_token: string | null },
) {
  try {
    return await axios.get(url, { headers: { Authorization: `Bearer ${account.access_token}` } });
  } catch (err: unknown) {
    if ((err as { response?: { status?: number } })?.response?.status !== 401) throw err;
    const fresh = await refreshToken(account);
    return await axios.get(url, { headers: { Authorization: `Bearer ${fresh}` } });
  }
}

function normalizeTrack(t: RawTrack): NormalizedTrack {
  return {
    id:            t.id,
    name:          t.name,
    previewUrl:    t.preview_url ?? null,
    durationMs:    typeof t.duration_ms === "number" ? t.duration_ms : null,
    albumName:     t.album?.name ?? null,
    albumImageUrl: t.album?.images?.[0]?.url ?? null,
    releaseDate:          t.album?.release_date ?? null,
    releaseDatePrecision: t.album?.release_date_precision ?? null,
    artists:       t.artists ?? [],
  };
}

function isValidTrack(t: RawTrack | null | undefined): t is RawTrack {
  if (!t) return false;
  if (t.is_local) return false;
  if (t.type && t.type !== "track") return false;
  if (!t.id) return false;
  if (!t.artists?.[0]?.id) return false;
  return true;
}

// ── Core import ───────────────────────────────────────────────────────────────

export async function runLikedSongsImport(userId: string): Promise<ImportResult> {
  console.log(`\n[import] ════ starting userId=${userId} ════`);

  const account = await prisma.account.findFirst({
    where:  { userId, provider: "spotify" },
    select: { id: true, access_token: true, refresh_token: true, scope: true },
  });

  // ── Pre-flight checks ─────────────────────────────────────────────────────

  if (!account) {
    return failResult(userId, "No Spotify account linked — user needs to reconnect Spotify.");
  }
  if (!account.access_token) {
    return failResult(userId, "Missing Spotify access token — user needs to reconnect Spotify.");
  }
  if (!account.refresh_token) {
    return failResult(userId, "Missing refresh token — user needs to reconnect Spotify.");
  }

  // Scope check — ensure the required permissions were granted at OAuth time.
  const grantedScopes = (account.scope ?? "").split(/\s+/).filter(Boolean);
  const missingScopes = REQUIRED_SCOPES.filter(s => !grantedScopes.includes(s));
  if (missingScopes.length > 0) {
    console.warn(`[import] userId=${userId} missing scopes: ${missingScopes.join(", ")}`);
    return failResult(
      userId,
      `Missing Spotify scopes: ${missingScopes.join(", ")} — user needs to reconnect Spotify.`,
      { missingScopes: [...missingScopes] },
    );
  }

  const dbTrackCountBefore = await prisma.track.count({ where: { userId } });
  console.log(`[import] dbTrackCountBefore=${dbTrackCountBefore}`);

  // ── Stages 1–8 wrapped in try/catch so every Spotify error returns a clean ─
  // ImportResult instead of throwing and crashing the calling route.
  // 401 inside spotifyGet → token refresh is attempted automatically; a second
  // 401 means the token is truly dead and we surface a reconnect message.
  // 429 → Spotify rate-limit; we extract Retry-After and surface it.
  try {

  // ── Stage 1: Get Spotify user identity ───────────────────────────────────

  const meRes = await spotifyGet("https://api.spotify.com/v1/me", account);
  const spotifyUserId: string = meRes.data.id;
  console.log(`[import] spotifyUserId=${spotifyUserId}`);

  // ── Stage 2: Fetch all Liked Songs ───────────────────────────────────────

  // trackMap is the single dedup store: spotifyId → NormalizedTrack.
  // Liked songs and owned-playlist tracks both write into it; duplicates are
  // kept once (liked-song entry wins on first write, same data either way).
  const trackMap = new Map<string, NormalizedTrack>();

  let likedSongsFetched = 0;
  {
    let url: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
    while (url) {
      const res = await spotifyGet(url, account);
      for (const item of res.data.items ?? []) {
        const t: RawTrack | null = item.track ?? null;
        if (isValidTrack(t) && !trackMap.has(t.id)) {
          trackMap.set(t.id, normalizeTrack(t));
        }
        likedSongsFetched++;
      }
      url = res.data.next ?? null;
    }
    console.log(`[import] likedSongsFetched=${likedSongsFetched}  (valid+deduped so far: ${trackMap.size})`);
    if (likedSongsFetched === 0) {
      console.log(`[import] note: no liked songs found for userId=${userId}`);
    }
  }

  // ── Stage 3: Fetch user's playlists + filter to owned only ───────────────

  type PlaylistStub = { id: string; name: string; owner: { id: string } };
  const allPlaylists: PlaylistStub[] = [];

  {
    let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";
    while (url) {
      const res = await spotifyGet(url, account);
      allPlaylists.push(...(res.data.items ?? []));
      url = res.data.next ?? null;
    }
  }

  const ownedPlaylists  = allPlaylists.filter(p => p.owner?.id === spotifyUserId);
  const skippedPlaylists = allPlaylists.filter(p => p.owner?.id !== spotifyUserId);

  console.log(
    `[import] playlistsReturnedBySpotify=${allPlaylists.length}` +
    `  ownedPlaylistsCount=${ownedPlaylists.length}` +
    `  skippedNonOwnedPlaylistsCount=${skippedPlaylists.length}`
  );

  // Log up to 10 skipped playlist names so the caller can verify the filter
  if (skippedPlaylists.length > 0) {
    const sample = skippedPlaylists.slice(0, 10);
    console.log(
      `[import] skipped (non-owned) playlists (first ${sample.length}):`,
      sample.map(p => `"${p.name}" owned by ${p.owner?.id ?? "?"}`)
    );
  }

  // ── Stage 4: Fetch tracks from owned playlists ───────────────────────────

  let ownedPlaylistTracksFetched = 0;

  for (const playlist of ownedPlaylists) {
    let url: string | null =
      `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=50&fields=next,items(track(id,name,type,is_local,preview_url,album(name,images),artists(id,name)))`;
    while (url) {
      const res = await spotifyGet(url, account);
      for (const item of res.data.items ?? []) {
        ownedPlaylistTracksFetched++;
        const t: RawTrack | null = item.track ?? null;
        if (isValidTrack(t) && !trackMap.has(t.id)) {
          trackMap.set(t.id, normalizeTrack(t));
        }
      }
      url = res.data.next ?? null;
    }
    console.log(`[import]   playlist "${playlist.name}" → trackMap.size=${trackMap.size}`);
  }

  console.log(
    `[import] ownedPlaylistTracksFetched=${ownedPlaylistTracksFetched}` +
    `  uniqueAllowedTracks=${trackMap.size}`
  );

  // ── Stage 5: Resolve artist genres ───────────────────────────────────────

  const allTracks = Array.from(trackMap.values());

  const uniqueArtistIds = Array.from(
    new Set(allTracks.flatMap(t => t.artists.map(a => a.id)).filter(Boolean))
  );
  const artistGenreMap = new Map<string, string[]>();

  for (let i = 0; i < uniqueArtistIds.length; i += 50) {
    const chunk = uniqueArtistIds.slice(i, i + 50);
    const res = await spotifyGet(
      `https://api.spotify.com/v1/artists?ids=${chunk.join(",")}`, account,
    );
    for (const artist of res.data.artists ?? []) {
      artistGenreMap.set(artist.id, artist.genres ?? []);
    }
  }

  // ── Stage 6: Upsert allowed tracks (batches of 25) ───────────────────────

  const BATCH = 25;
  for (let i = 0; i < allTracks.length; i += BATCH) {
    await Promise.all(
      allTracks.slice(i, i + BATCH).map(async t => {
        const firstArtist = t.artists[0];
        if (!firstArtist) return;
        const genres = t.artists.flatMap(a => artistGenreMap.get(a.id) ?? []);
        const { rawGenre, blueprintWorld, blueprintSubgenre } = classifyGenres(genres);
        await prisma.track.upsert({
          where:  { userId_spotifyId: { userId, spotifyId: t.id } },
          update: { name: t.name, artist: firstArtist.name, album: t.albumName,
            imageUrl: t.albumImageUrl, previewUrl: t.previewUrl,
            durationMs: t.durationMs,
            releaseDate: t.releaseDate, releaseDatePrecision: t.releaseDatePrecision,
            rawGenre, blueprintWorld, blueprintSubgenre },
          create: { userId, spotifyId: t.id, name: t.name, artist: firstArtist.name,
            album: t.albumName, imageUrl: t.albumImageUrl, previewUrl: t.previewUrl,
            durationMs: t.durationMs,
            releaseDate: t.releaseDate, releaseDatePrecision: t.releaseDatePrecision,
            rawGenre, blueprintWorld, blueprintSubgenre },
        });
      })
    );
  }

  // ── Stage 7: Purge tracks NOT in the allowed set ─────────────────────────
  // Removes any Track rows for this user whose spotifyId is not in
  // (liked songs ∪ owned-playlist tracks).  Scoped to userId — never touches
  // other users' rows.

  const allowedSpotifyIds = allTracks.map(t => t.id);
  const purge = await prisma.track.deleteMany({
    where: { userId, spotifyId: { notIn: allowedSpotifyIds } },
  });

  const dbTrackCountAfter = await prisma.track.count({ where: { userId } });

  // ── Stage 8: Genre distribution ───────────────────────────────────────────

  const genreDistribution: Record<string, number> = {};
  for (const t of allTracks) {
    const genres = t.artists.flatMap(a => artistGenreMap.get(a.id) ?? []);
    const { blueprintWorld } = classifyGenres(genres);
    genreDistribution[blueprintWorld] = (genreDistribution[blueprintWorld] ?? 0) + 1;
  }

  console.log(
    `[import] ════ finished userId=${userId} ════\n` +
    `  spotifyUserId                  = ${spotifyUserId}\n` +
    `  likedSongsFetched              = ${likedSongsFetched}\n` +
    `  playlistsReturnedBySpotify     = ${allPlaylists.length}\n` +
    `  ownedPlaylistsCount            = ${ownedPlaylists.length}\n` +
    `  skippedNonOwnedPlaylistsCount  = ${skippedPlaylists.length}\n` +
    `  ownedPlaylistTracksFetched     = ${ownedPlaylistTracksFetched}\n` +
    `  uniqueAllowedTracks            = ${allTracks.length}\n` +
    `  dbTrackCountBefore             = ${dbTrackCountBefore}\n` +
    `  staleTracksRemoved             = ${purge.count}\n` +
    `  dbTrackCountAfter              = ${dbTrackCountAfter}`
  );

  // A successful sync proves Spotify access is currently valid — clear any
  // previous auto-hide from a past 401/403 (e.g. user was re-added to the
  // Developer Dashboard allowlist).
  await prisma.user.update({
    where: { id: userId },
    data:  { midvaleHidden: false },
  }).catch(() => {});

  return {
    success:    true,
    userId,
    likedSongsFetched,
    playlistsReturnedBySpotify:    allPlaylists.length,
    ownedPlaylistsCount:           ownedPlaylists.length,
    skippedNonOwnedPlaylistsCount: skippedPlaylists.length,
    ownedPlaylistTracksFetched,
    uniqueAllowedTracks:           allTracks.length,
    tracksUpserted:                allTracks.length,
    tracksRemoved:                 purge.count,
    dbTrackCountBefore,
    dbTrackCountAfter,
    dbDelta:    dbTrackCountAfter - dbTrackCountBefore,
    noLikedSongs: likedSongsFetched === 0 && ownedPlaylistTracksFetched === 0,
    genreDistribution,
  };

  } catch (err: unknown) {
    // ── Structured error handling ──────────────────────────────────────────
    // Map known Spotify HTTP errors to actionable messages; fall back to a
    // generic string for anything unexpected.

    const axErr = err as {
      response?: { status?: number; headers?: Record<string, string>; data?: unknown };
      message?:  string;
    };
    const status  = axErr?.response?.status;
    const dbBefore = await prisma.track.count({ where: { userId } }).catch(() => 0);

    if (status === 429) {
      const ra = parseInt(
        (axErr.response?.headers?.["retry-after"] ?? axErr.response?.headers?.["Retry-After"] ?? "60"),
        10,
      );
      console.error(`[import] 429 rate-limited for userId=${userId}, retryAfter=${ra}s`);
      return failResult(
        userId,
        `Rate limited by Spotify. Try again in ${ra} second${ra === 1 ? "" : "s"}.`,
        { retryAfter: ra, dbTrackCountBefore: dbBefore, dbTrackCountAfter: dbBefore },
      );
    }

    if (status === 401) {
      console.error(`[import] 401 for userId=${userId} — token refresh failed or invalid`);
      // Refresh token is dead — Spotify access is no longer valid (e.g. the
      // user revoked app access). Hide from Friends until access is restored.
      await prisma.user.update({ where: { id: userId }, data: { midvaleHidden: true } }).catch(() => {});
      return failResult(
        userId,
        "Spotify returned 401 — access token invalid or refresh failed. User needs to reconnect Spotify.",
        { dbTrackCountBefore: dbBefore, dbTrackCountAfter: dbBefore },
      );
    }

    if (status === 403) {
      console.error(`[import] 403 for userId=${userId} — scope or permission issue`);
      // Spotify apps in Development Mode return 403 for users removed from the
      // Developer Dashboard allowlist. Their Blueprint record still exists,
      // but they no longer have valid Spotify access — hide from Friends.
      await prisma.user.update({ where: { id: userId }, data: { midvaleHidden: true } }).catch(() => {});
      return failResult(
        userId,
        "Spotify returned 403 — permission denied. User may need to reconnect Spotify with the correct scopes.",
        { dbTrackCountBefore: dbBefore, dbTrackCountAfter: dbBefore },
      );
    }

    const message = axErr?.message ?? String(err);
    console.error(`[import] unexpected error for userId=${userId}:`, err);
    return failResult(
      userId,
      `Import failed: ${message}`,
      { dbTrackCountBefore: dbBefore, dbTrackCountAfter: dbBefore },
    );
  }
}

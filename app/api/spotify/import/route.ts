import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { classifyGenres } from "@/lib/blueprint-taxonomy";

// ── Spotify API types ─────────────────────────────────────────────────────────

/** Shape returned by /v1/me/tracks items */
type LikedTrackItem = {
  track: {
    id: string;
    name: string;
    type: string;
    preview_url: string | null;
    album?: { name?: string | null; images?: { url: string }[] };
    artists?: { id: string; name: string }[];
  } | null;
};

/** Shape returned by /v1/playlists/{id}/tracks items */
type PlaylistTrackItem = {
  is_local: boolean;
  track: {
    id: string;
    name: string;
    type: string;          // "track" | "episode"
    preview_url: string | null;
    album?: { name?: string | null; images?: { url: string }[] };
    artists?: { id: string; name: string }[];
  } | null;
};

type SpotifyPlaylist = { id: string; name: string };

/** Internal canonical form — one entry per unique spotifyId. */
type NormalizedTrack = {
  id:            string;
  name:          string;
  previewUrl:    string | null;
  albumName:     string | null;
  albumImageUrl: string | null;
  artists:       { id: string; name: string }[];
};

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshSpotifyAccessToken(account: {
  id: string;
  refresh_token: string | null;
}) {
  if (!account.refresh_token) {
    throw new Error("Missing Spotify refresh token. Sign out and sign in again.");
  }

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID!}:${process.env.SPOTIFY_CLIENT_SECRET!}`
  ).toString("base64");

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: account.refresh_token,
    }).toString(),
    {
      headers: {
        Authorization:  `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const newAccessToken  = response.data.access_token as string;
  const newRefreshToken =
    (response.data.refresh_token as string | undefined) ?? account.refresh_token;
  const expiresIn = response.data.expires_in as number | undefined;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token:  newAccessToken,
      refresh_token: newRefreshToken,
      expires_at: expiresIn
        ? Math.floor(Date.now() / 1000) + expiresIn
        : undefined,
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// ── Authenticated GET helper — auto-refreshes on 401 ─────────────────────────

async function spotifyGet(
  url: string,
  account: { id: string; access_token: string | null; refresh_token: string | null },
) {
  try {
    return await axios.get(url, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    });
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status !== 401) throw error;

    const refreshed = await refreshSpotifyAccessToken(account);
    return await axios.get(url, {
      headers: { Authorization: `Bearer ${refreshed.accessToken}` },
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true for items we should import. */
function isValidTrack(
  item: { is_local?: boolean; track: NormalizedTrack | null | { id?: unknown; type?: string; artists?: unknown[] } | undefined },
): boolean {
  if (item.is_local) return false;
  const t = item.track;
  if (!t) return false;
  if ((t as { type?: string }).type && (t as { type: string }).type !== "track") return false;
  if (!(t as { id?: string }).id) return false;
  if (!((t as { artists?: { id: string }[] }).artists?.[0]?.id)) return false;
  return true;
}

/** Converts a liked-song or playlist-track item into our canonical shape. */
function normalize(
  track: {
    id: string;
    name: string;
    preview_url?: string | null;
    album?: { name?: string | null; images?: { url: string }[] };
    artists?: { id: string; name: string }[];
  },
): NormalizedTrack {
  return {
    id:            track.id,
    name:          track.name,
    previewUrl:    track.preview_url ?? null,
    albumName:     track.album?.name ?? null,
    albumImageUrl: track.album?.images?.[0]?.url ?? null,
    artists:       track.artists ?? [],
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn("[import] no authenticated session → 401");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    console.log("[import] starting for user:", {
      id:    user.id,
      name:  user.name,
      email: user.email,
    });

    const account = await prisma.account.findFirst({
      where:  { userId: user.id, provider: "spotify" },
      select: { id: true, access_token: true, refresh_token: true },
    });
    if (!account?.access_token) {
      return NextResponse.json({ error: "Missing Spotify access token" }, { status: 400 });
    }

    // ── 1. Liked Songs (/v1/me/tracks) ───────────────────────────────────────

    const likedItems: LikedTrackItem[] = [];
    let likedUrl: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
    while (likedUrl) {
      const res = await spotifyGet(likedUrl, account);
      likedItems.push(...(res.data.items ?? []));
      likedUrl = res.data.next ?? null;
    }
    console.log(`[import] liked songs fetched: ${likedItems.length}`);

    // ── 2. Playlists + their tracks ──────────────────────────────────────────

    const playlists: SpotifyPlaylist[] = [];
    let playlistUrl: string | null =
      "https://api.spotify.com/v1/me/playlists?limit=50";

    let playlistTracksFetched = 0;
    let skippedTracks = 0;
    const playlistItems: PlaylistTrackItem[] = [];

    try {
      // 2a. Collect all playlist stubs
      while (playlistUrl) {
        const res = await spotifyGet(playlistUrl, account);
        playlists.push(
          ...(res.data.items ?? []).map((p: { id: string; name: string }) => ({
            id:   p.id,
            name: p.name,
          }))
        );
        playlistUrl = res.data.next ?? null;
      }
      console.log(`[import] playlists found: ${playlists.length}`);

      // 2b. Fetch tracks for every playlist.
      // Use the fields parameter to request only the properties we need,
      // cutting response size substantially for large playlists.
      for (const playlist of playlists) {
        let ptUrl: string | null =
          `https://api.spotify.com/v1/playlists/${playlist.id}/tracks` +
          `?limit=100` +
          `&fields=items(is_local,track(id,name,type,preview_url,album(name,images),artists(id,name))),next`;
        while (ptUrl) {
          const res = await spotifyGet(ptUrl, account);
          const items: PlaylistTrackItem[] = res.data.items ?? [];
          playlistItems.push(...items);
          playlistTracksFetched += items.length;
          ptUrl = res.data.next ?? null;
        }
      }
      console.log(`[import] playlist tracks fetched (raw): ${playlistTracksFetched}`);
    } catch (err: unknown) {
      // Gracefully degrade: if playlist scopes are missing (403) or any other
      // error, continue with liked songs only and warn in the logs.
      const status = (err as { response?: { status?: number } })?.response?.status;
      console.warn(
        `[import] playlist fetch failed (status=${status ?? "?"}) — ` +
        `continuing with liked songs only. ` +
        `If status=403, user needs to re-authorize with playlist scopes.`,
        status === 403 ? "(scope issue)" : err,
      );
    }

    // ── 3. Normalize + deduplicate into a single Map ─────────────────────────
    // Liked songs go in first. Playlist tracks are added only if the spotifyId
    // is not already present. This means:
    //   • a track liked AND in a playlist → stored once (liked-song entry wins)
    //   • a track only in playlists → stored from the playlist entry
    // The @@unique([userId, spotifyId]) DB constraint is the final safety net.

    const trackMap = new Map<string, NormalizedTrack>();

    for (const item of likedItems) {
      if (!item.track || !item.track.id || !item.track.artists?.[0]?.id) continue;
      trackMap.set(item.track.id, normalize(item.track));
    }

    for (const item of playlistItems) {
      if (item.is_local) { skippedTracks++; continue; }
      if (!item.track)   { skippedTracks++; continue; }
      // Skip podcast episodes and anything that isn't a proper track
      if (item.track.type && item.track.type !== "track") { skippedTracks++; continue; }
      if (!item.track.id || !item.track.artists?.[0]?.id) { skippedTracks++; continue; }
      if (trackMap.has(item.track.id)) continue; // already in map from liked songs
      trackMap.set(item.track.id, normalize(item.track));
    }

    const allTracks = Array.from(trackMap.values());
    console.log(`[import] unique tracks after dedup: ${allTracks.length}  (skipped: ${skippedTracks})`);

    // ── 4. Early exit if nothing to import ───────────────────────────────────

    if (allTracks.length === 0) {
      const dbTrackCount = await prisma.track.count({ where: { userId: user.id } });
      console.warn("[import] 0 importable tracks for user:", { id: user.id, name: user.name });
      return NextResponse.json({
        success:              true,
        noLikedSongs:         likedItems.length === 0,
        imported:             0,
        likedTracksFetched:   likedItems.length,
        playlistTracksFetched,
        playlistsScanned:     playlists.length,
        uniqueTracksImported: 0,
        skippedTracks,
        dbTrackCount,
        genreDistribution:    {},
      });
    }

    // ── 5. Collect all unique artist IDs ─────────────────────────────────────

    const uniqueArtistIds = Array.from(
      new Set(
        allTracks.flatMap(t => t.artists.map(a => a.id)).filter(Boolean)
      )
    );

    // ── 6. Batch-fetch artist genres (50 per request) ─────────────────────────

    const artistGenreMap = new Map<string, string[]>();
    for (let i = 0; i < uniqueArtistIds.length; i += 50) {
      const chunk = uniqueArtistIds.slice(i, i + 50);
      const res = await spotifyGet(
        `https://api.spotify.com/v1/artists?ids=${chunk.join(",")}`,
        account,
      );
      for (const artist of res.data.artists ?? []) {
        artistGenreMap.set(artist.id, artist?.genres ?? []);
      }
    }

    // ── 7. Upsert all tracks in parallel batches of 25 ───────────────────────

    const BATCH_SIZE = 25;
    for (let i = 0; i < allTracks.length; i += BATCH_SIZE) {
      await Promise.all(
        allTracks.slice(i, i + BATCH_SIZE).map(async t => {
          const firstArtist = t.artists[0];
          if (!firstArtist) return;

          const allGenres = t.artists.flatMap(a => artistGenreMap.get(a.id) ?? []);
          const { rawGenre, blueprintWorld, blueprintSubgenre } =
            classifyGenres(allGenres);

          await prisma.track.upsert({
            where:  { userId_spotifyId: { userId: user.id, spotifyId: t.id } },
            update: {
              name:              t.name,
              artist:            firstArtist.name,
              album:             t.albumName,
              imageUrl:          t.albumImageUrl,
              previewUrl:        t.previewUrl,
              rawGenre,
              blueprintWorld,
              blueprintSubgenre,
            },
            create: {
              userId:            user.id,
              spotifyId:         t.id,
              name:              t.name,
              artist:            firstArtist.name,
              album:             t.albumName,
              imageUrl:          t.albumImageUrl,
              previewUrl:        t.previewUrl,
              rawGenre,
              blueprintWorld,
              blueprintSubgenre,
            },
          });
        })
      );
    }

    // ── 8. Final DB count + diagnostics ──────────────────────────────────────

    const dbTrackCount = await prisma.track.count({ where: { userId: user.id } });

    const worldCounts: Record<string, number> = {};
    const otherExamples: { track: string; artists: string[]; genres: string[] }[] = [];

    for (const t of allTracks) {
      const allGenres = t.artists.flatMap(a => artistGenreMap.get(a.id) ?? []);
      const { blueprintWorld } = classifyGenres(allGenres);
      worldCounts[blueprintWorld] = (worldCounts[blueprintWorld] ?? 0) + 1;
      if (blueprintWorld === "Other" && otherExamples.length < 20) {
        otherExamples.push({
          track:   t.name,
          artists: t.artists.map(a => a.name),
          genres:  allGenres.slice(0, 6),
        });
      }
    }

    console.log("[import] genre distribution:", worldCounts);
    if (otherExamples.length > 0) {
      console.log("[import] sample 'Other' tracks (up to 20):", otherExamples);
    }
    console.log("[import] finished for user:", {
      id:                   user.id,
      name:                 user.name,
      likedTracksFetched:   likedItems.length,
      playlistsScanned:     playlists.length,
      playlistTracksFetched,
      uniqueTracksImported: allTracks.length,
      skippedTracks,
      dbTrackCount,
    });

    return NextResponse.json({
      success:              true,
      imported:             allTracks.length,  // total unique tracks sent to DB
      likedTracksFetched:   likedItems.length,
      playlistTracksFetched,
      playlistsScanned:     playlists.length,
      uniqueTracksImported: allTracks.length,
      skippedTracks,
      dbTrackCount,
      genreDistribution:    worldCounts,
    });
  } catch (error) {
    console.error("[import] ROUTE ERROR:", error);
    return NextResponse.json(
      { error: "Import failed", detail: String(error) },
      { status: 500 },
    );
  }
}

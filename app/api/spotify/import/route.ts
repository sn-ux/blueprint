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

    // ── STAGE 1: Account + scope check ───────────────────────────────────────

    const account = await prisma.account.findFirst({
      where:  { userId: user.id, provider: "spotify" },
      select: { id: true, access_token: true, refresh_token: true, scope: true },
    });

    console.log("[import][stage1] account row:", {
      found:        !!account,
      hasToken:     !!account?.access_token,
      hasRefresh:   !!account?.refresh_token,
      scope:        account?.scope ?? "(null)",
      hasPlaylistPrivate:       account?.scope?.includes("playlist-read-private")       ?? false,
      hasPlaylistCollaborative: account?.scope?.includes("playlist-read-collaborative") ?? false,
    });

    if (!account?.access_token) {
      return NextResponse.json({ error: "Missing Spotify access token" }, { status: 400 });
    }

    // ── Pre-import DB snapshot ────────────────────────────────────────────────

    const dbTrackCountBefore = await prisma.track.count({ where: { userId: user.id } });
    console.log(`[import][pre] DB track count BEFORE import for userId=${user.id}: ${dbTrackCountBefore}`);

    // ── STAGE 2: Liked Songs (/v1/me/tracks) ─────────────────────────────────

    const likedItems: LikedTrackItem[] = [];
    let likedUrl: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
    let likedPages = 0;
    while (likedUrl) {
      const res = await spotifyGet(likedUrl, account);
      const page: LikedTrackItem[] = res.data.items ?? [];
      likedItems.push(...page);
      likedPages++;
      likedUrl = res.data.next ?? null;
    }
    console.log(`[import][stage2] liked songs: ${likedItems.length} tracks across ${likedPages} page(s)`);

    // ── STAGE 3: Playlists + their tracks ────────────────────────────────────

    const playlists: SpotifyPlaylist[] = [];
    let playlistUrl: string | null =
      "https://api.spotify.com/v1/me/playlists?limit=50";

    let playlistTracksFetched = 0;
    let skippedTracks = 0;
    let playlistFetchError: string | null = null;
    const playlistItems: PlaylistTrackItem[] = [];

    // Per-playlist diagnostics for stage 3 logging
    type PlaylistDiag = {
      id: string; name: string; owner: string;
      public: boolean | null; collaborative: boolean;
      rawItems: number; validTracks: number;
      skippedNull: number; skippedLocal: number;
      skippedEpisode: number; skippedNoId: number;
      pages: number;
    };
    const playlistDiags: PlaylistDiag[] = [];

    try {
      // 3a. Collect all playlist stubs (paginated)
      let playlistPages = 0;
      while (playlistUrl) {
        const res = await spotifyGet(playlistUrl, account);
        playlistPages++;
        const raw = res.data.items ?? [];
        playlists.push(
          ...raw.map((p: { id: string; name: string }) => ({
            id:   p.id,
            name: p.name,
          }))
        );
        console.log(`[import][stage3a] playlists page ${playlistPages}: ${raw.length} items, next=${!!res.data.next}`);
        playlistUrl = res.data.next ?? null;
      }
      console.log(`[import][stage3a] total playlists found: ${playlists.length} across ${playlistPages} page(s)`);

      if (playlists.length > 0) {
        console.log("[import][stage3a] first 5 playlists:", playlists.slice(0, 5).map(p => ({ id: p.id, name: p.name })));
      }

      // 3b. Fetch tracks for every playlist (paginated)
      for (const playlist of playlists) {
        const diag: PlaylistDiag = {
          id: playlist.id, name: playlist.name,
          owner: "", public: null, collaborative: false,
          rawItems: 0, validTracks: 0,
          skippedNull: 0, skippedLocal: 0,
          skippedEpisode: 0, skippedNoId: 0,
          pages: 0,
        };

        let ptUrl: string | null =
          `https://api.spotify.com/v1/playlists/${playlist.id}/tracks` +
          `?limit=100` +
          `&fields=items(is_local,track(id,name,type,preview_url,album(name,images),artists(id,name))),next`;

        try {
          while (ptUrl) {
            const res = await spotifyGet(ptUrl, account);
            diag.pages++;
            const items: PlaylistTrackItem[] = res.data.items ?? [];
            diag.rawItems += items.length;
            playlistTracksFetched += items.length;

            for (const item of items) {
              if (item.is_local)                                               { diag.skippedLocal++;   continue; }
              if (!item.track)                                                 { diag.skippedNull++;    continue; }
              if (item.track.type && item.track.type !== "track")              { diag.skippedEpisode++; continue; }
              if (!item.track.id || !item.track.artists?.[0]?.id)             { diag.skippedNoId++;    continue; }
              diag.validTracks++;
            }
            playlistItems.push(...items);
            ptUrl = res.data.next ?? null;
          }
        } catch (ptErr: unknown) {
          const ptStatus = (ptErr as { response?: { status?: number } })?.response?.status;
          console.warn(`[import][stage3b] FAILED to fetch tracks for playlist "${playlist.name}" (${playlist.id}), status=${ptStatus ?? "?"}`, ptErr);
        }

        playlistDiags.push(diag);
      }

      // Log per-playlist summary (all playlists, not truncated)
      console.log("[import][stage3b] per-playlist breakdown:");
      for (const d of playlistDiags) {
        console.log(
          `  "${d.name}" (${d.id}): rawItems=${d.rawItems} valid=${d.validTracks} ` +
          `skipped(null=${d.skippedNull} local=${d.skippedLocal} episode=${d.skippedEpisode} noId=${d.skippedNoId}) pages=${d.pages}`,
        );
      }

      const totalValidFromPlaylists = playlistDiags.reduce((s, d) => s + d.validTracks, 0);
      console.log(`[import][stage3b] summary: playlistTracksFetched(raw)=${playlistTracksFetched} totalValid=${totalValidFromPlaylists}`);

    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      playlistFetchError = `status=${status ?? "?"} — ${String(err)}`;
      console.warn(
        `[import][stage3] playlist fetch FAILED (status=${status ?? "?"}) — ` +
        `continuing with liked songs only. ` +
        (status === 403 ? "STATUS 403 = SCOPE ISSUE — user must re-authorize." : ""),
        status === 403 ? "(scope issue)" : err,
      );
    }

    // ── STAGE 4: Deduplicate ──────────────────────────────────────────────────

    const trackMap = new Map<string, NormalizedTrack>();

    let likedSkipped = 0;
    for (const item of likedItems) {
      if (!item.track || !item.track.id || !item.track.artists?.[0]?.id) { likedSkipped++; continue; }
      trackMap.set(item.track.id, normalize(item.track));
    }

    let deduped = 0;
    for (const item of playlistItems) {
      if (item.is_local)                                              { skippedTracks++; continue; }
      if (!item.track)                                               { skippedTracks++; continue; }
      if (item.track.type && item.track.type !== "track")            { skippedTracks++; continue; }
      if (!item.track.id || !item.track.artists?.[0]?.id)           { skippedTracks++; continue; }
      if (trackMap.has(item.track.id))                               { deduped++;       continue; }
      trackMap.set(item.track.id, normalize(item.track));
    }

    const allTracks = Array.from(trackMap.values());

    console.log("[import][stage4] dedup summary:", {
      likedSongsRaw:          likedItems.length,
      likedSongsSkippedBadData: likedSkipped,
      likedSongsAddedToMap:   likedItems.length - likedSkipped,
      playlistItemsRaw:       playlistItems.length,
      playlistItemsSkipped:   skippedTracks,
      playlistItemsDeduped:   deduped,
      playlistItemsNewToMap:  playlistItems.length - skippedTracks - deduped,
      uniqueTracksTotal:      allTracks.length,
    });

    // ── STAGE 5 (early exit): nothing to import ───────────────────────────────

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
        debug: { playlistFetchError },
      });
    }

    // ── STAGE 6: Artist genre fetch ───────────────────────────────────────────

    const uniqueArtistIds = Array.from(
      new Set(
        allTracks.flatMap(t => t.artists.map(a => a.id)).filter(Boolean)
      )
    );
    console.log(`[import][stage6] unique artists to fetch genres for: ${uniqueArtistIds.length}`);

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
    console.log(`[import][stage6] artist genres loaded for ${artistGenreMap.size} artists`);

    // ── STAGE 7: Upsert all tracks ────────────────────────────────────────────

    const BATCH_SIZE = 25;
    let upsertCount = 0;
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
          upsertCount++;
        })
      );
    }
    console.log(`[import][stage7] upserted ${upsertCount} tracks to DB`);

    // ── STAGE 8: Final DB count + diagnostics ─────────────────────────────────

    const dbTrackCount = await prisma.track.count({ where: { userId: user.id } });
    console.log("[import][stage8] DB track count delta:", {
      userId:   user.id,
      before:   dbTrackCountBefore,
      after:    dbTrackCount,
      delta:    dbTrackCount - dbTrackCountBefore,
      expected: allTracks.length,
    });

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
      imported:             allTracks.length,
      likedTracksFetched:   likedItems.length,
      playlistTracksFetched,
      playlistsScanned:     playlists.length,
      uniqueTracksImported: allTracks.length,
      skippedTracks,
      dbTrackCountBefore,
      dbTrackCount,
      dbDelta:              dbTrackCount - dbTrackCountBefore,
      genreDistribution:    worldCounts,
      debug: { playlistFetchError },
    });
  } catch (error) {
    console.error("[import] ROUTE ERROR:", error);
    return NextResponse.json(
      { error: "Import failed", detail: String(error) },
      { status: 500 },
    );
  }
}

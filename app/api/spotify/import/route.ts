import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { classifyGenres } from "@/lib/blueprint-taxonomy";

// ── Spotify API types ─────────────────────────────────────────────────────────

/** Shape returned by GET /v1/me/tracks items */
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

// ── Normalize ─────────────────────────────────────────────────────────────────

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
    // ── Auth ─────────────────────────────────────────────────────────────────

    const user = await getCurrentUser();
    if (!user) {
      console.warn("[import] no authenticated session → 401");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    console.log("[import] starting for user:", { id: user.id, name: user.name });

    const account = await prisma.account.findFirst({
      where:  { userId: user.id, provider: "spotify" },
      select: { id: true, access_token: true, refresh_token: true, scope: true },
    });

    if (!account?.access_token) {
      return NextResponse.json({ error: "Missing Spotify access token" }, { status: 400 });
    }

    // ── Pre-import snapshot ───────────────────────────────────────────────────

    const dbTrackCountBefore = await prisma.track.count({ where: { userId: user.id } });
    console.log(`[import] dbTrackCountBefore=${dbTrackCountBefore}`);

    // ── Fetch all liked songs (GET /v1/me/tracks) ─────────────────────────────

    const likedItems: LikedTrackItem[] = [];
    let url: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
    let pages = 0;

    while (url) {
      const res = await spotifyGet(url, account);
      likedItems.push(...(res.data.items ?? []));
      pages++;
      url = res.data.next ?? null;
    }

    console.log(`[import] liked songs fetched: ${likedItems.length} across ${pages} page(s)`);

    // ── Normalize + deduplicate ───────────────────────────────────────────────
    // Filter to valid tracks only (non-null, type=track, has id + artist),
    // then deduplicate by spotifyId.

    const trackMap = new Map<string, NormalizedTrack>();

    for (const item of likedItems) {
      const t = item.track;
      if (!t)                                   continue; // null (removed from Spotify)
      if (t.type && t.type !== "track")         continue; // episode / podcast
      if (!t.id)                                continue; // no spotifyId
      if (!t.artists?.[0]?.id)                  continue; // no artist
      trackMap.set(t.id, normalize(t));
    }

    const allTracks = Array.from(trackMap.values());
    console.log(`[import] unique valid tracks: ${allTracks.length}`);

    // ── Early exit if nothing to import ──────────────────────────────────────

    if (allTracks.length === 0) {
      const dbTrackCount = await prisma.track.count({ where: { userId: user.id } });
      console.warn("[import] 0 valid liked songs found");
      return NextResponse.json({
        success:          true,
        noLikedSongs:     likedItems.length === 0,
        likedSongsFetched: likedItems.length,
        importedLikedTracks: 0,
        dbTrackCountBefore,
        dbTrackCountAfter: dbTrackCount,
        removedNonLikedTracks: 0,
        genreDistribution: {},
      });
    }

    // ── Fetch artist genres (50 per batch) ────────────────────────────────────

    const uniqueArtistIds = Array.from(
      new Set(allTracks.flatMap(t => t.artists.map(a => a.id)).filter(Boolean))
    );

    const artistGenreMap = new Map<string, string[]>();
    for (let i = 0; i < uniqueArtistIds.length; i += 50) {
      const chunk = uniqueArtistIds.slice(i, i + 50);
      const res = await spotifyGet(
        `https://api.spotify.com/v1/artists?ids=${chunk.join(",")}`,
        account,
      );
      for (const artist of res.data.artists ?? []) {
        artistGenreMap.set(artist.id, artist.genres ?? []);
      }
    }

    console.log(`[import] genres loaded for ${artistGenreMap.size} artists`);

    // ── Upsert liked tracks (batches of 25) ───────────────────────────────────

    const BATCH = 25;
    for (let i = 0; i < allTracks.length; i += BATCH) {
      await Promise.all(
        allTracks.slice(i, i + BATCH).map(async t => {
          const firstArtist = t.artists[0];
          if (!firstArtist) return;

          const genres = t.artists.flatMap(a => artistGenreMap.get(a.id) ?? []);
          const { rawGenre, blueprintWorld, blueprintSubgenre } = classifyGenres(genres);

          await prisma.track.upsert({
            where:  { userId_spotifyId: { userId: user.id, spotifyId: t.id } },
            update: {
              name: t.name, artist: firstArtist.name,
              album: t.albumName, imageUrl: t.albumImageUrl,
              previewUrl: t.previewUrl,
              rawGenre, blueprintWorld, blueprintSubgenre,
            },
            create: {
              userId: user.id, spotifyId: t.id,
              name: t.name, artist: firstArtist.name,
              album: t.albumName, imageUrl: t.albumImageUrl,
              previewUrl: t.previewUrl,
              rawGenre, blueprintWorld, blueprintSubgenre,
            },
          });
        })
      );
    }

    console.log(`[import] upserted ${allTracks.length} liked tracks`);

    // ── Purge any tracks not in the current liked-songs set ───────────────────
    // This removes songs the user has since unliked, AND any old playlist tracks
    // that were imported under previous logic.  Scoped to this userId only.

    const likedSpotifyIds = allTracks.map(t => t.id);
    const purgeResult = await prisma.track.deleteMany({
      where: {
        userId:    user.id,
        spotifyId: { notIn: likedSpotifyIds },
      },
    });

    console.log(`[import] purged ${purgeResult.count} non-liked tracks for userId=${user.id}`);

    // ── Final count + genre distribution ─────────────────────────────────────

    const dbTrackCountAfter = await prisma.track.count({ where: { userId: user.id } });

    const genreDistribution: Record<string, number> = {};
    for (const t of allTracks) {
      const genres = t.artists.flatMap(a => artistGenreMap.get(a.id) ?? []);
      const { blueprintWorld } = classifyGenres(genres);
      genreDistribution[blueprintWorld] = (genreDistribution[blueprintWorld] ?? 0) + 1;
    }

    console.log("[import] finished:", {
      userId:               user.id,
      name:                 user.name,
      likedSongsFetched:    likedItems.length,
      importedLikedTracks:  allTracks.length,
      removedNonLikedTracks: purgeResult.count,
      dbTrackCountBefore,
      dbTrackCountAfter,
      genreDistribution,
    });

    return NextResponse.json({
      success:              true,
      userId:               user.id,
      likedSongsFetched:    likedItems.length,
      importedLikedTracks:  allTracks.length,
      removedNonLikedTracks: purgeResult.count,
      dbTrackCountBefore,
      dbTrackCountAfter,
      dbDelta:              dbTrackCountAfter - dbTrackCountBefore,
      genreDistribution,
    });

  } catch (error) {
    console.error("[import] ROUTE ERROR:", error);
    return NextResponse.json(
      { error: "Import failed", detail: String(error) },
      { status: 500 },
    );
  }
}

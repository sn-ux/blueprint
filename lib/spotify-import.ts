// Core liked-songs import logic.
// Accepts a userId and runs the full import independently of any HTTP session.
// Used by both /api/spotify/import (self-import) and /api/admin/midvale/users/[userId]/refresh (admin refresh).

import axios from "axios";
import { prisma } from "@/lib/prisma";
import { classifyGenres } from "@/lib/blueprint-taxonomy";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type NormalizedTrack = {
  id:            string;
  name:          string;
  previewUrl:    string | null;
  albumName:     string | null;
  albumImageUrl: string | null;
  artists:       { id: string; name: string }[];
};

export interface ImportResult {
  success:               boolean;
  userId:                string;
  likedSongsFetched:     number;
  importedLikedTracks:   number;
  removedNonLikedTracks: number;
  dbTrackCountBefore:    number;
  dbTrackCountAfter:     number;
  dbDelta:               number;
  noLikedSongs?:         boolean;
  genreDistribution:     Record<string, number>;
  error?:                string;
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

function normalize(track: {
  id: string; name: string; preview_url?: string | null;
  album?: { name?: string | null; images?: { url: string }[] };
  artists?: { id: string; name: string }[];
}): NormalizedTrack {
  return {
    id:            track.id,
    name:          track.name,
    previewUrl:    track.preview_url ?? null,
    albumName:     track.album?.name ?? null,
    albumImageUrl: track.album?.images?.[0]?.url ?? null,
    artists:       track.artists ?? [],
  };
}

// ── Core import ───────────────────────────────────────────────────────────────

export async function runLikedSongsImport(userId: string): Promise<ImportResult> {
  console.log(`[import] starting for userId=${userId}`);

  const account = await prisma.account.findFirst({
    where:  { userId, provider: "spotify" },
    select: { id: true, access_token: true, refresh_token: true },
  });

  if (!account?.access_token) {
    return { success: false, userId, error: "Missing Spotify access token",
      likedSongsFetched: 0, importedLikedTracks: 0, removedNonLikedTracks: 0,
      dbTrackCountBefore: 0, dbTrackCountAfter: 0, dbDelta: 0, genreDistribution: {} };
  }

  const dbTrackCountBefore = await prisma.track.count({ where: { userId } });

  // ── Fetch all liked songs ─────────────────────────────────────────────────

  const likedItems: LikedTrackItem[] = [];
  let url: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
  let pages = 0;

  while (url) {
    const res = await spotifyGet(url, account);
    likedItems.push(...(res.data.items ?? []));
    pages++;
    url = res.data.next ?? null;
  }

  console.log(`[import] liked songs fetched: ${likedItems.length} across ${pages} page(s) for userId=${userId}`);

  // ── Normalize + dedup ─────────────────────────────────────────────────────

  const trackMap = new Map<string, NormalizedTrack>();
  for (const item of likedItems) {
    const t = item.track;
    if (!t || (t.type && t.type !== "track") || !t.id || !t.artists?.[0]?.id) continue;
    trackMap.set(t.id, normalize(t));
  }

  const allTracks = Array.from(trackMap.values());

  if (allTracks.length === 0) {
    const dbTrackCountAfter = await prisma.track.count({ where: { userId } });
    return {
      success: true, userId, noLikedSongs: likedItems.length === 0,
      likedSongsFetched: likedItems.length, importedLikedTracks: 0,
      removedNonLikedTracks: 0, dbTrackCountBefore, dbTrackCountAfter,
      dbDelta: 0, genreDistribution: {},
    };
  }

  // ── Artist genres ─────────────────────────────────────────────────────────

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

  // ── Upsert (batches of 25) ────────────────────────────────────────────────

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
            rawGenre, blueprintWorld, blueprintSubgenre },
          create: { userId, spotifyId: t.id, name: t.name, artist: firstArtist.name,
            album: t.albumName, imageUrl: t.albumImageUrl, previewUrl: t.previewUrl,
            rawGenre, blueprintWorld, blueprintSubgenre },
        });
      })
    );
  }

  // ── Purge stale / non-liked tracks ───────────────────────────────────────

  const likedSpotifyIds = allTracks.map(t => t.id);
  const purge = await prisma.track.deleteMany({
    where: { userId, spotifyId: { notIn: likedSpotifyIds } },
  });

  const dbTrackCountAfter = await prisma.track.count({ where: { userId } });

  // ── Genre distribution ────────────────────────────────────────────────────

  const genreDistribution: Record<string, number> = {};
  for (const t of allTracks) {
    const genres = t.artists.flatMap(a => artistGenreMap.get(a.id) ?? []);
    const { blueprintWorld } = classifyGenres(genres);
    genreDistribution[blueprintWorld] = (genreDistribution[blueprintWorld] ?? 0) + 1;
  }

  console.log(`[import] finished: userId=${userId} liked=${allTracks.length} purged=${purge.count} after=${dbTrackCountAfter}`);

  return {
    success: true, userId,
    likedSongsFetched:     likedItems.length,
    importedLikedTracks:   allTracks.length,
    removedNonLikedTracks: purge.count,
    dbTrackCountBefore, dbTrackCountAfter,
    dbDelta: dbTrackCountAfter - dbTrackCountBefore,
    genreDistribution,
  };
}

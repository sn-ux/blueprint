import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { mapSpotifyGenre } from "@/lib/blueprint-taxonomy";

type SpotifyTrackItem = {
  track: {
    id: string;
    name: string;
    preview_url: string | null;
    album?: {
      name?: string | null;
      images?: { url: string }[];
    };
    artists?: {
      id: string;
      name: string;
    }[];
  };
};

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
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const newAccessToken = response.data.access_token as string;
  const newRefreshToken =
    (response.data.refresh_token as string | undefined) ?? account.refresh_token;
  const expiresIn = response.data.expires_in as number | undefined;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_at: expiresIn
        ? Math.floor(Date.now() / 1000) + expiresIn
        : undefined,
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

async function spotifyGet(url: string, account: {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
}) {
  try {
    return await axios.get(url, {
      headers: {
        Authorization: `Bearer ${account.access_token}`,
      },
    });
  } catch (error: any) {
    if (error?.response?.status !== 401) {
      throw error;
    }

    const refreshed = await refreshSpotifyAccessToken(account);

    return await axios.get(url, {
      headers: {
        Authorization: `Bearer ${refreshed.accessToken}`,
      },
    });
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: {
        userId: user.id,
        provider: "spotify",
      },
      select: {
        id: true,
        access_token: true,
        refresh_token: true,
      },
    });

    if (!account?.access_token) {
      return NextResponse.json(
        { error: "Missing Spotify access token" },
        { status: 400 }
      );
    }

    let allItems: SpotifyTrackItem[] = [];
    let url: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";

    while (url) {
      const res = await spotifyGet(url, account);
      allItems = allItems.concat(res.data.items ?? []);
      url = res.data.next;
    }

    const uniqueArtistIds = Array.from(
      new Set(
        allItems
          .map((item) => item.track?.artists?.[0]?.id)
          .filter(Boolean)
      )
    ) as string[];

    const artistGenreMap = new Map<string, string>();

    for (let i = 0; i < uniqueArtistIds.length; i += 50) {
      const chunk = uniqueArtistIds.slice(i, i + 50);
      const res = await spotifyGet(
        `https://api.spotify.com/v1/artists?ids=${chunk.join(",")}`,
        account
      );

      for (const artist of res.data.artists ?? []) {
        artistGenreMap.set(artist.id, artist?.genres?.[0] || "unknown");
      }
    }

    // Upsert in parallel batches of 25 — avoids serverless timeout on large libraries
    const BATCH_SIZE = 25;
    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      await Promise.all(
        allItems.slice(i, i + BATCH_SIZE).map(async (item) => {
          const track = item.track;
          const firstArtist = track?.artists?.[0];

          if (!track?.id || !firstArtist?.id) return;

          const rawGenre = artistGenreMap.get(firstArtist.id) || "unknown";
          const { blueprintWorld, blueprintSubgenre } = mapSpotifyGenre(rawGenre);

          await prisma.track.upsert({
            where: {
              userId_spotifyId: {
                userId: user.id,
                spotifyId: track.id,
              },
            },
            update: {
              name: track.name,
              artist: firstArtist.name,
              album: track.album?.name ?? null,
              imageUrl: track.album?.images?.[0]?.url ?? null,
              previewUrl: track.preview_url ?? null,
              rawGenre,
              blueprintWorld,
              blueprintSubgenre,
            },
            create: {
              userId: user.id,
              spotifyId: track.id,
              name: track.name,
              artist: firstArtist.name,
              album: track.album?.name ?? null,
              imageUrl: track.album?.images?.[0]?.url ?? null,
              previewUrl: track.preview_url ?? null,
              rawGenre,
              blueprintWorld,
              blueprintSubgenre,
            },
          });
        })
      );
    }

    return NextResponse.json({
      success: true,
      imported: allItems.length,
      uniqueArtists: uniqueArtistIds.length,
    });
  } catch (error) {
    console.error("IMPORT ROUTE ERROR:", error);
    return NextResponse.json(
      { error: "Import failed", detail: String(error) },
      { status: 500 }
    );
  }
}

import axios from "axios";
import { prisma } from "@/lib/prisma";

/** Refresh an expired Spotify access token and persist the new values. */
export async function refreshSpotifyToken(account: {
  id: string;
  refresh_token: string | null;
}): Promise<{ accessToken: string; refreshToken: string }> {
  if (!account.refresh_token) {
    throw new Error("Missing Spotify refresh token. Sign out and sign back in.");
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
      expires_at:    expiresIn
        ? Math.floor(Date.now() / 1000) + expiresIn
        : undefined,
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

/**
 * Return the current valid Spotify access token for a user.
 * Auto-refreshes if the token is within 60 seconds of expiry.
 */
export async function getSpotifyToken(
  userId: string
): Promise<{ accessToken: string; scope: string } | null> {
  const account = await prisma.account.findFirst({
    where:  { userId, provider: "spotify" },
    select: {
      id:            true,
      access_token:  true,
      refresh_token: true,
      expires_at:    true,
      scope:         true,
    },
  });

  if (!account?.access_token) return null;

  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at - now < 60) {
    const { accessToken } = await refreshSpotifyToken(account);
    return { accessToken, scope: account.scope ?? "" };
  }

  return { accessToken: account.access_token, scope: account.scope ?? "" };
}

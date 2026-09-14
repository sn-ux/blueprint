import axios from "axios";
import { prisma } from "@/lib/prisma";

/**
 * Revoking someone in Spotify's developer dashboard is silent.
 *
 * There is no webhook and no endpoint that lists who is still on an app's
 * allowlist, so Blueprint cannot be told. What it can observe is the next
 * refresh: a revoked grant comes back 400 with `invalid_grant`, and that is
 * proof the credential itself is dead rather than a network blip or a rate
 * limit. Until this existed, a removed tester's library stayed in the corpus
 * indefinitely — still receiving cards, and still acting as evidence in
 * everyone else's, which is the part that actually matters.
 *
 * The response is to hide, not to delete. Hiding takes them out of the corpus
 * on the next read, and it is one reversible field if the removal was a
 * mistake or they are added back. Deleting a library because a token expired
 * would be an irreversible act triggered by an HTTP status.
 */
async function retireRevokedAccount(accountId: string, why: string): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { userId: true },
  });
  if (!account) return;
  await prisma.$transaction([
    // Stop the credential being retried, and stop it sitting there.
    prisma.account.update({
      where: { id: accountId },
      data: { access_token: null, refresh_token: null, expires_at: null },
    }),
    // Out of the corpus: no cards for them, and none built from them.
    prisma.user.update({
      where: { id: account.userId },
      data: { midvaleHidden: true },
    }),
  ]);
  console.warn(
    `[spotify] access revoked for user ${account.userId} (${why}) —`
    + " tokens cleared, library hidden from the corpus",
  );
}

/** A dead grant, as distinct from a bad minute. */
function isRevoked(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const status = err.response?.status;
  const code = (err.response?.data as { error?: string } | undefined)?.error;
  if (status === 400 && code === "invalid_grant") return "invalid_grant";
  if (status === 403) return "forbidden";
  return null;                       // 429, 5xx, timeouts: transient, leave alone
}

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

  let response;
  try {
    response = await axios.post(
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
  } catch (err) {
    const why = isRevoked(err);
    if (why) {
      await retireRevokedAccount(account.id, why);
      throw new Error("Spotify access for this account has been revoked.");
    }
    throw err;
  }

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

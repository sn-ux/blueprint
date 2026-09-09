// Mobile handoff: browser sign-in -> one-time code -> mobile session.
//
// The mobile app never sees Spotify tokens and never receives a session token
// through a URL. It gets a short-lived, single-use code in the deep link, and
// trades that at /api/mobile/exchange for its own session.
//
// Both sides reuse tables NextAuth already owns:
//   VerificationToken — the one-time code (token is @unique, so deleting it is
//                       an atomic single-winner consume)
//   Session           — the mobile credential, a normal session row, so
//                       getCurrentUser() resolves it with no special casing
//                       and it can be revoked independently of the web session.

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/** Namespace so mobile codes can never collide with NextAuth's own tokens. */
const CODE_PREFIX = "mobile:";

/** Short enough that a leaked code is near-useless, long enough to redeem. */
const CODE_TTL_MS = 3 * 60 * 1000;

/** Matches NextAuth's default session lifetime. */
const MOBILE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Issues a one-time code for a user, replacing any outstanding one so a user
 * only ever has a single live code.
 */
export async function issueHandoffCode(userId: string): Promise<string> {
  const identifier = CODE_PREFIX + userId;

  await prisma.verificationToken.deleteMany({ where: { identifier } });

  const token = randomToken();
  await prisma.verificationToken.create({
    data: { identifier, token, expires: new Date(Date.now() + CODE_TTL_MS) },
  });
  return token;
}

export interface MobileCredential {
  token: string;
  expiresAt: string;
}

/**
 * Redeems a code and mints a mobile session.
 *
 * The delete is the serialization point: `token` is unique, so exactly one
 * caller can delete a given row. A concurrent second request finds the row
 * already gone and is rejected. Delete and session creation share one
 * transaction, so a failure part-way cannot burn a code without returning a
 * credential.
 *
 * Returns null for unknown, already-redeemed and expired codes alike — the
 * caller must not distinguish them to a client.
 */
export async function redeemHandoffCode(code: string): Promise<MobileCredential | null> {
  if (!code || typeof code !== "string") return null;

  try {
    return await prisma.$transaction(async (tx) => {
      // Atomic consume. Throws P2025 if another request already took it.
      const record = await tx.verificationToken.delete({ where: { token: code } });

      if (!record.identifier.startsWith(CODE_PREFIX)) return null;
      // Expired codes are consumed on sight, then refused.
      if (record.expires.getTime() <= Date.now()) return null;

      const userId = record.identifier.slice(CODE_PREFIX.length);
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) return null;

      const expires = new Date(Date.now() + MOBILE_SESSION_TTL_MS);
      const session = await tx.session.create({
        data: { sessionToken: randomToken(), userId, expires },
      });

      return { token: session.sessionToken, expiresAt: expires.toISOString() };
    });
  } catch {
    // Unknown or already-consumed code.
    return null;
  }
}

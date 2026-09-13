import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const cookieStore = await cookies();

  // Browser: NextAuth's session cookie. Mobile: the same kind of session token
  // presented as a bearer, since a native client has no cookie jar to rely on.
  // Both resolve through the one Session lookup below.
  const headerStore = await headers();
  const bearer = headerStore.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];

  /**
   * An explicitly presented credential wins over an ambient one.
   *
   * The cookies used to be read first, which got the precedence backwards in
   * two ways.
   *
   * A bearer token is a client stating which session it is acting as. A cookie
   * is whatever the platform happened to attach. Preferring the cookie meant a
   * request that said who it was could still be resolved as somebody else —
   * one stale cookie in the jar and every request from that client answered
   * for the wrong account no matter which credential it sent. Two devices
   * cannot hold independent sessions against a server that ignores the thing
   * distinguishing them.
   *
   * And of the two cookie names, the unprefixed one was read first. Production
   * is https and NextAuth sets `__Secure-next-auth.session-token` there; the
   * bare name only appears over http, so a leftover from a local sign-in
   * outranked the real session. Most specific first, then.
   */
  const sessionToken =
    bearer ||
    cookieStore.get("__Secure-next-auth.session-token")?.value ||
    cookieStore.get("next-auth.session-token")?.value;

  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });

  if (!session) return null;

  // The lookup alone never checked expiry, so a stale session token kept
  // working indefinitely. Matters more now that mobile holds a long-lived one.
  if (session.expires.getTime() <= Date.now()) return null;

  return session.user;
}

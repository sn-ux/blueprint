import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const cookieStore = await cookies();

  // Browser: NextAuth's session cookie. Mobile: the same kind of session token
  // presented as a bearer, since a native client has no cookie jar to rely on.
  // Both resolve through the one Session lookup below.
  const headerStore = await headers();
  const bearer = headerStore.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];

  const sessionToken =
    cookieStore.get("next-auth.session-token")?.value ||
    cookieStore.get("__Secure-next-auth.session-token")?.value ||
    bearer;

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

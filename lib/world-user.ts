import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

/**
 * Resolves whose library a personal-world request is for.
 *
 * There are exactly two legitimate answers:
 *
 *  - `?userId=<id>` — an explicit, deliberately public profile view. The
 *    caller has named a specific person, so no credential is required.
 *  - no parameter — the authenticated caller's own library, and nobody
 *    else's.
 *
 * There is deliberately no third case. These routes used to fall back to
 * `findFirst({ where: { tracks: { some: {} } } })` when neither applied, so an
 * anonymous request for "my library" was answered with whichever user happened
 * to be first in the table — a real library, served to someone who had not
 * asked for it and could not have named it. Returning null here is what makes
 * that impossible; every caller must answer 401.
 */
export type WorldUser =
  /** An explicitly named profile. The user is null when that id does not exist. */
  | { kind: "public"; user: { id: string } | null }
  /** The authenticated caller. */
  | { kind: "self"; user: { id: string } };

export async function resolveWorldUser(req: NextRequest): Promise<WorldUser | null> {
  const queryUserId = new URL(req.url).searchParams.get("userId");

  if (queryUserId) {
    const user = await prisma.user.findUnique({
      where: { id: queryUserId },
      select: { id: true },
    });
    return { kind: "public", user };
  }

  const authed = await getCurrentUser();
  if (!authed) return null;

  return { kind: "self", user: { id: authed.id } };
}

/** The single response an unauthenticated personal-library request gets. */
export const unauthenticated = () =>
  NextResponse.json({ error: "Not authenticated" }, { status: 401 });

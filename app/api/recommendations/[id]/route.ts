import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { cardDetail } from "@/lib/recommendations/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/recommendations/[id] — one card and every track its page must show.
 *
 * The card comes back out of the session snapshot the feed was served from,
 * so it is the same card: the same artwork, the same caption, the same
 * numbers. Nothing is recomputed on tap, and no external service is called.
 *
 * Split from the feed route so the feed stays small — a card can carry fifteen
 * deliverable tracks and a page of them in one payload would be a screen's
 * worth of rows times a whole page of cards. The deliverability invariant
 * lives here: whatever number the caption implies, this returns it in full,
 * and the client never reconstructs a set of its own.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const detail = await cardDetail(viewer.id, id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail, { headers: { "Cache-Control": "private, no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { buildFeed, deliverablesOf, toFeedCard } from "@/lib/discovery/feed";

export const dynamic = "force-dynamic";

/**
 * GET /api/recommendations/[id] — one card and every track its page must show.
 *
 * Split from the feed route so the feed stays small: a subgenre card can carry
 * three hundred deliverable tracks, and a hundred of those in one payload
 * would be megabytes for a screen that shows a dozen rows. The deliverability
 * invariant lives here — whatever number the caption implies, this returns it
 * in full, and the client never reconstructs a set of its own.
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
  const result = await buildFeed(viewer.id, 100);
  if (!result) {
    return NextResponse.json({ error: "No library imported yet" }, { status: 404 });
  }

  const candidate = result.feed.find((c) => c.discoverySetId === id);
  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const card = toFeedCard(result.index, candidate);
  const tracks = deliverablesOf(result.index, candidate);

  return NextResponse.json(
    { card, tracks },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

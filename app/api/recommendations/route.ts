import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { LIFECYCLE } from "@/lib/discovery/config";
import { feedPage } from "@/lib/recommendations/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/recommendations — a page of the viewer's discovery stream.
 *
 * The viewer is resolved from their own session. There is deliberately no
 * userId parameter: a recommendation feed is built by subtracting one person's
 * library from everyone else's, so letting a caller name the viewer would hand
 * them a readout of that person's library by difference.
 *
 * Cursor-based, not page-numbered. The order is decided once when a session
 * starts and then frozen, so scrolling cannot make a card the reader is
 * looking at jump, and a page can neither repeat nor skip what came before it.
 *
 * There is no fixed feed length. `hasMore: false` means nothing else currently
 * clears the publishing threshold — not that Blueprint has a hundred
 * recommendations. Cooldowns expiring, libraries changing and new sources
 * arriving all put more cards behind it.
 */
export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const cursor = params.get("cursor");
  const raw = Number(params.get("limit") ?? LIFECYCLE.pageSize);
  const limit = Number.isFinite(raw) ? raw : LIFECYCLE.pageSize;

  const t0 = Date.now();
  const page = await feedPage(viewer.id, cursor, limit);
  if (!page) {
    return NextResponse.json({ error: "No library imported yet" }, { status: 404 });
  }

  console.log(
    `[recs] ${viewer.id} page ${page.cards.length}/${page.total}`
    + ` (${cursor ? "cursor" : "new session"}) in ${Date.now() - t0}ms`,
  );

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      cards: page.cards,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      caughtUp: page.caughtUp,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

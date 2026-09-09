import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { buildFeed, toFeedCard } from "@/lib/discovery/feed";

export const dynamic = "force-dynamic";

/**
 * GET /api/recommendations — the composed feed for the authenticated caller.
 *
 * The viewer is resolved from their own session. There is deliberately no
 * userId parameter: a recommendation feed is built by subtracting one
 * person's library from everyone else's, so letting a caller name the viewer
 * would hand them a readout of that person's library by difference.
 *
 * Ordering is the engine's. Nothing here reranks, and the client must not
 * either — the composer's diversification is the product.
 */
export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const limitParam = Number(new URL(req.url).searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 100;

  const t0 = Date.now();
  const result = await buildFeed(viewer.id, limit);
  if (!result) {
    return NextResponse.json({ error: "No library imported yet" }, { status: 404 });
  }

  const cards = result.feed.map((c) => toFeedCard(result.index, c));
  console.log(`[recs] ${viewer.id} → ${cards.length} cards in ${Date.now() - t0}ms`);

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), count: cards.length, cards },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

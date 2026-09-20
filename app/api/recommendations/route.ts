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
  /** Only a deliberate refresh abandons the reading in progress. */
  const fresh = params.get("fresh") === "1";
  const raw = Number(params.get("limit") ?? LIFECYCLE.pageSize);
  const limit = Number.isFinite(raw) ? raw : LIFECYCLE.pageSize;

  const t0 = Date.now();
  const page = await feedPage(viewer.id, cursor, limit, fresh);
  if (!page) {
    return NextResponse.json({ error: "No library imported yet" }, { status: 404 });
  }

  /**
   * Which generator served this request, said plainly.
   *
   * Temporary, and deliberately loud. The observation engine was invisible on
   * a phone for a while purely because it had never been deployed, and no log
   * line anywhere said which generator was answering.
   */
  const engine = process.env.BLUEPRINT_ENGINE === "legacy" ? "LEGACY" : "FRIENDS";
  const head = page.cards.slice(0, 5);
  console.log(
    `\n=== BLUEPRINT CARD ENGINE: ${engine} ===`
    + `\nUSER: ${viewer.id}`
    + `\nGENERATED: ${page.total} (page ${page.cards.length}, ${cursor ? "cursor" : "new session"}, ${Date.now() - t0}ms)`
    + `\nFIRST 5 FAMILIES: ${head.map((c) => c.generator).join(", ")}`
    + `\nFIRST 5 HEADLINES:\n${head.map((c, i) => `  ${i + 1}. ${c.title} — ${c.caption}`).join("\n")}`
    + `\n=== END ===\n`,
  );

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      /** Temporary: which generator produced these. Read by the mobile log. */
      engine,
      cards: page.cards,
      /** The reading these cards belong to, so their captions can be asked for. */
      sessionId: page.sessionId,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      caughtUp: page.caughtUp,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

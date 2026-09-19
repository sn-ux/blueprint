import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { captionCards } from "@/lib/recommendations/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/recommendations/captions — captions for cards already served.
 *
 * The feed returns its cards immediately and their captions are written here,
 * because one caption takes seven to nine seconds and a page holds two dozen.
 * The viewer comes from their own session, as everywhere else, and the session
 * id is checked against them, so this cannot be pointed at somebody else's
 * reading. Cards already written are skipped rather than rewritten.
 */
export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { sessionId?: string; ids?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Expected JSON" }, { status: 400 }); }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 40) : [];
  if (!sessionId || !ids.length) {
    return NextResponse.json({ error: "sessionId and ids are required" }, { status: 400 });
  }

  const t0 = Date.now();
  const captions = await captionCards(viewer.id, sessionId, ids);
  console.log(`[caption] endpoint returned ${Object.keys(captions).length}/${ids.length}`
    + ` in ${Date.now() - t0}ms`);
  return NextResponse.json({ captions });
}

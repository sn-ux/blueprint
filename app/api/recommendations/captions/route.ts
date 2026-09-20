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
  const all = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string") : [];
  const ids = all.slice(0, 40);
  if (all.length > ids.length) {
    console.warn(`[caption] request carried ${all.length} ids; ${all.length - ids.length}`
      + ` beyond the per-request ceiling were not attempted`);
  }
  if (!sessionId || !ids.length) {
    return NextResponse.json({ error: "sessionId and ids are required" }, { status: 400 });
  }

  const t0 = Date.now();
  const { captions, failed } = await captionCards(viewer.id, sessionId, ids);
  const beyond = all.slice(ids.length);
  console.log(`[caption] endpoint returned ${Object.keys(captions).length}/${all.length}`
    + ` in ${Date.now() - t0}ms`
    + (failed.length || beyond.length ? ` · failed ${failed.length + beyond.length}` : ""));
  // A card is either written or named as unwritten. It is never just absent.
  return NextResponse.json({ captions, failed: [...failed, ...beyond] });
}

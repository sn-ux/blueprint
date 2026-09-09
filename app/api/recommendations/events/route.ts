import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { recordEvents, type LifecycleEvent } from "@/lib/recommendations/events";

export const dynamic = "force-dynamic";

/**
 * POST /api/recommendations/events — what happened to a recommendation.
 *
 * Batched by the client: an impression is sent once, when a card has
 * meaningfully become visible, not continuously while it stays on screen.
 * Events are keyed on the proposition's stable identity, so they survive the
 * engine re-running and the card moving in the feed.
 *
 * Events are always written against the caller's own row. There is no userId
 * parameter and no way to write anyone else's lifecycle state.
 */
export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { events?: LifecycleEvent[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const events = Array.isArray(body?.events) ? body.events : [];
  if (events.length === 0) return NextResponse.json({ applied: 0 });

  const applied = await recordEvents(viewer.id, events);
  return NextResponse.json({ applied }, { headers: { "Cache-Control": "no-store" } });
}

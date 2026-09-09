import { prisma } from "@/lib/prisma";
import { cooldownFor } from "@/lib/discovery/lifecycle";

/**
 * Lifecycle events.
 *
 * Four distinct things happen to a recommendation, and conflating any two of
 * them is how a feed starts lying about what the reader wanted.
 *
 *   IMPRESSION  it was on screen long enough to have been read. Not a
 *               judgement, not a rejection — a modest rest, nothing more.
 *   OPEN        the reader went and looked. Stronger evidence they have
 *               already investigated it, so it rests longer.
 *   DISMISS     an explicit "stop showing me this".
 *   ACTION      they did something with it. Resolution proper needs no event:
 *               saved material enters the library, the engine excludes it, and
 *               the recommendation stops existing.
 *
 * Impressions are never inferred from a scroll position, opens are never
 * inferred from impressions, and dismissals are never inferred at all.
 */

export type EventType = "IMPRESSION" | "OPEN" | "DISMISS" | "ACTION";

export interface LifecycleEvent {
  key: string;
  type: EventType;
  /** The card's underlying version at the time, so change can be detected. */
  version?: string | null;
}

const MAX_EVENTS = 200;

/**
 * Applies a batch.
 *
 * Written one row at a time in key order. The client batches and de-duplicates
 * before sending, so a batch is a handful of rows rather than one per frame,
 * and ordering by key keeps two concurrent batches from deadlocking on the
 * same pair of rows.
 */
export async function recordEvents(
  userId: string, events: LifecycleEvent[], now = new Date(),
): Promise<number> {
  // One event per (key, type): a card seen three times in one batch is one
  // impression, not three.
  const unique = new Map<string, LifecycleEvent>();
  for (const e of events.slice(0, MAX_EVENTS)) {
    if (!e?.key || !e?.type) continue;
    unique.set(`${e.key}␟${e.type}`, e);
  }

  const ordered = [...unique.values()].sort((a, b) => a.key.localeCompare(b.key));
  let applied = 0;

  for (const e of ordered) {
    // Impressions never produce one — see cooldownFor.
    const cooldown = cooldownFor(e.type, now);
    const base = {
      lastUnderlyingVersion: e.version ?? undefined,
      ...(cooldown ? { cooldownUntil: cooldown } : {}),
    };

    const create = {
      userId, recommendationKey: e.key, ...base,
      ...(e.type === "IMPRESSION" ? { impressionCount: 1, firstShownAt: now, lastShownAt: now } : {}),
      ...(e.type === "OPEN" ? { openCount: 1, firstOpenedAt: now, lastOpenedAt: now } : {}),
      ...(e.type === "DISMISS" ? { dismissedAt: now } : {}),
      ...(e.type === "ACTION" ? { actedOnAt: now } : {}),
    };

    const update = {
      ...base,
      ...(e.type === "IMPRESSION" ? { impressionCount: { increment: 1 }, lastShownAt: now, firstShownAt: undefined } : {}),
      ...(e.type === "OPEN" ? { openCount: { increment: 1 }, lastOpenedAt: now } : {}),
      ...(e.type === "DISMISS" ? { dismissedAt: now } : {}),
      ...(e.type === "ACTION" ? { actedOnAt: now } : {}),
    };

    const row = await prisma.recommendationExposure.upsert({
      where: { userId_recommendationKey: { userId, recommendationKey: e.key } },
      create,
      update,
      select: { id: true, firstShownAt: true, firstOpenedAt: true },
    });

    // First-touch stamps are set once and never moved.
    if (e.type === "IMPRESSION" && !row.firstShownAt) {
      await prisma.recommendationExposure.update({ where: { id: row.id }, data: { firstShownAt: now } });
    }
    if (e.type === "OPEN" && !row.firstOpenedAt) {
      await prisma.recommendationExposure.update({ where: { id: row.id }, data: { firstOpenedAt: now } });
    }
    applied++;
  }

  return applied;
}

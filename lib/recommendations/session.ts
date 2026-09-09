import { prisma } from "@/lib/prisma";
import * as CFG from "@/lib/discovery/config";
import { compose } from "@/lib/discovery/engine";
import { buildFeed, toFeedCard, type FeedCard, type FeedPerson, type FeedTrack } from "@/lib/discovery/feed";
import { evaluate, type ExposureState, type LifecycleStatus } from "@/lib/discovery/lifecycle";
import { MAX_DEPTH } from "@/lib/discovery/tiers";
import type { Candidate } from "@/lib/discovery/types";

/**
 * The feed as a persistent stream.
 *
 * Three things have to be true at once, and they pull against each other.
 *
 * The stream must not end at an arbitrary number. So the engine hands over its
 * whole eligible universe and this layer paginates over it; the only thing
 * that ever stops the feed is running out of recommendations that clear the
 * publishing floor, and that is reported as being caught up rather than as the
 * end of a hundred cards.
 *
 * The stream must not reorder underneath the reader. So ranking and lifecycle
 * are evaluated once, at the start of a session, and the resulting order is
 * frozen and stored. Card twelve cannot become card three because an
 * impression was written while the reader was looking at it, and a later page
 * costs one row read rather than another engine run.
 *
 * The stream must feel alive across sessions without being random. So a new
 * session re-evaluates lifecycle from scratch: what was seen yesterday sinks,
 * what has never been shown rises, what was resolved is simply no longer
 * generated. Nothing is shuffled — the same inputs give the same order.
 */

/** One stored card: what the feed renders, plus what its page will contain. */
export interface StoredCard {
  card: FeedCard;
  deliverableIds: string[];
  lifecycle: { status: LifecycleStatus; score: number };
  /** Which generation band produced it. Higher is nicher. */
  depth?: number;
  /** True when this is a card from earlier in the reading, brought back. */
  resurfaced?: boolean;
}

export interface FeedPage {
  cards: FeedCard[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Nothing else currently clears the publishing threshold. */
  caughtUp: boolean;
  sessionId: string;
  total: number;
}

const encodeCursor = (sessionId: string, offset: number) =>
  Buffer.from(`${sessionId}:${offset}`).toString("base64url");

function decodeCursor(cursor: string): { sessionId: string; offset: number } | null {
  try {
    const [sessionId, raw] = Buffer.from(cursor, "base64url").toString("utf8").split(":");
    const offset = Number(raw);
    if (!sessionId || !Number.isInteger(offset) || offset < 0) return null;
    return { sessionId, offset };
  } catch {
    return null;
  }
}

async function exposuresOf(userId: string): Promise<Map<string, ExposureState>> {
  const rows = await prisma.recommendationExposure.findMany({ where: { userId } });
  return new Map(rows.map((r) => [r.recommendationKey, {
    recommendationKey: r.recommendationKey,
    impressionCount: r.impressionCount,
    openCount: r.openCount,
    firstShownAt: r.firstShownAt,
    lastShownAt: r.lastShownAt,
    lastOpenedAt: r.lastOpenedAt,
    dismissedAt: r.dismissedAt,
    actedOnAt: r.actedOnAt,
    cooldownUntil: r.cooldownUntil,
    lastUnderlyingVersion: r.lastUnderlyingVersion,
  }]));
}

export interface SessionBuild {
  sessionId: string;
  stored: StoredCard[];
  /** Why each ineligible candidate is not in this session. */
  suppressed: { key: string; status: LifecycleStatus }[];
}

/**
 * Evaluates the whole universe and freezes one reading order.
 *
 * Quality gates ran in the engine; everything arriving here is already
 * publishable. This stage only decides placement in time and then stops
 * touching it.
 */
export async function startSession(viewerId: string, persist = true): Promise<SessionBuild | null> {
  const result = await buildFeed(viewerId, 0, 0);
  if (!result) return null;

  const now = new Date();
  const exposures = await exposuresOf(viewerId);

  const eligible: { candidate: Candidate; status: LifecycleStatus }[] = [];
  const suppressed: SessionBuild["suppressed"] = [];
  const resting: { candidate: Candidate; until: number }[] = [];
  for (const c of result.all) {
    const v = evaluate(c, exposures.get(c.recommendationKey ?? ""), now);
    c.lifecycleScore = v.score;
    c.lifecycleParts = v.parts;
    if (!v.eligible) {
      if (v.revivable) resting.push({ candidate: c, until: v.restingUntil?.getTime() ?? 0 });
      else suppressed.push({ key: c.recommendationKey ?? "", status: v.status });
      continue;
    }
    eligible.push({ candidate: c, status: v.status });
  }

  /**
   * Resting must never mean an empty stream.
   *
   * A reader who scrolls the whole feed in one sitting has seen everything
   * once, and one sighting is not a reason to withhold a valid recommendation
   * the next morning. So when suppression would leave the stream shorter than
   * a couple of pages, the longest-rested cards come back — carrying the
   * penalties they earned, so they sort behind anything genuinely new. Only
   * cards that are merely cooling are eligible for this; a dismissal or a
   * resolution is a decision and stays a decision.
   */
  const floor = CFG.LIFECYCLE.minEligiblePages * CFG.LIFECYCLE.pageSize;
  if (eligible.length < floor && resting.length > 0) {
    resting.sort((a, b) => a.until - b.until
      || (b.candidate.lifecycleScore ?? 0) - (a.candidate.lifecycleScore ?? 0));
    for (const r of resting) {
      if (eligible.length >= floor) {
        suppressed.push({ key: r.candidate.recommendationKey ?? "", status: "COOLING" });
        continue;
      }
      eligible.push({ candidate: r.candidate, status: "REVIVED" });
    }
  } else {
    for (const r of resting) {
      suppressed.push({ key: r.candidate.recommendationKey ?? "", status: "COOLING" });
    }
  }

  // Composition runs over lifecycle placement rather than raw ranking, and
  // draws each slot from a window a few pages deep so a later page stays
  // mixed instead of becoming the dregs of one sort.
  // A seed per session. Two sessions over unchanged lifecycle state would
  // otherwise compose identically, which is how a card ends up pinned to the
  // same position across every refresh.
  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const ordered = compose(
    eligible.map((e) => e.candidate),
    Infinity,
    CFG.FEED.lambda,
    (c) => c.lifecycleScore ?? c.rankingScore ?? 0,
    CFG.LIFECYCLE.pageSize * CFG.LIFECYCLE.pageWindowMultiple,
    seed,
  );
  ordered.forEach((c, i) => { c.feedRank = i + 1; });

  const statusOf = new Map(eligible.map((e) => [e.candidate, e.status]));
  const stored: StoredCard[] = ordered.map((c) => ({
    card: toFeedCard(result.index, c),
    deliverableIds: c.deliverableIds ?? [],
    lifecycle: { status: statusOf.get(c) ?? "READY", score: c.lifecycleScore ?? 0 },
    depth: c.tier ?? 0,
  }));

  if (!persist) return { sessionId: "", stored, suppressed };

  const session = await prisma.recommendationFeedSession.create({
    data: {
      userId: viewerId,
      expiresAt: new Date(now.getTime() + CFG.LIFECYCLE.sessionTtlMinutes * 60_000),
      depth: 0,
      cards: stored as unknown as object,
    },
    select: { id: true },
  });

  // Keep only the most recent few, so a detail page opened from an older
  // session still resolves without the table growing without bound.
  const stale = await prisma.recommendationFeedSession.findMany({
    where: { userId: viewerId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: CFG.LIFECYCLE.sessionsRetained,
  });
  if (stale.length) {
    await prisma.recommendationFeedSession.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  return { sessionId: session.id, stored, suppressed };
}

async function loadSession(viewerId: string, sessionId: string) {
  const row = await prisma.recommendationFeedSession.findFirst({
    where: { id: sessionId, userId: viewerId },
    select: { cards: true, depth: true, laps: true },
  });
  return row
    ? { stored: row.cards as unknown as StoredCard[], depth: row.depth, laps: row.laps }
    : null;
}

/**
 * The next stretch of feed, generated when the reader arrives at it.
 *
 * Discovery does not have a length, so a session is not a list — it is a
 * position in a search that keeps widening. Building every band up front would
 * spend the effort whether or not anyone scrolled that far, and would still
 * end; generating a band when it is reached costs nothing until it is needed
 * and has somewhere to go afterwards.
 *
 * Two things can extend it, in that order. Deeper generation first: the same
 * generators asked for smaller, nicher, still entirely factual misses. When
 * that is spent, cards from far enough back in this same reading return —
 * ranked by how long it has been rather than by score, so what comes back is
 * what has been out of sight longest rather than the same handful each time.
 */
async function extendSession(
  viewerId: string, sessionId: string,
  stored: StoredCard[], depth: number, laps: number,
): Promise<{ stored: StoredCard[]; depth: number; laps: number; grew: boolean }> {
  const held = new Set(stored.map((s) => s.card.id));
  const now = new Date();

  // ── Deeper generation ────────────────────────────────────────────────────
  if (depth < MAX_DEPTH) {
    const nextDepth = depth + 1;
    const result = await buildFeed(viewerId, 0, nextDepth);
    if (result) {
      const exposures = await exposuresOf(viewerId);
      const fresh = [];
      for (const c of result.all) {
        if (held.has(c.recommendationKey ?? "")) continue;
        const v = evaluate(c, exposures.get(c.recommendationKey ?? ""), now);
        c.lifecycleScore = v.score;
        if (!v.eligible) continue;
        fresh.push(c);
      }
      if (fresh.length > 0) {
        const ordered = compose(
          fresh, Infinity, CFG.FEED.lambda,
          (c) => c.lifecycleScore ?? c.rankingScore ?? 0,
          CFG.LIFECYCLE.pageSize * CFG.LIFECYCLE.pageWindowMultiple,
          sessionId, stored.length,
        );
        const added: StoredCard[] = ordered.map((c) => ({
          card: toFeedCard(result.index, c),
          deliverableIds: c.deliverableIds ?? [],
          lifecycle: { status: "READY" as LifecycleStatus, score: c.lifecycleScore ?? 0 },
          depth: c.tier ?? nextDepth,
        }));
        const next = [...stored, ...added];
        await persist(sessionId, next, nextDepth, laps);
        console.log(`[feed] session ${sessionId} → depth ${nextDepth}, +${added.length} new (${next.length} total)`);
        return { stored: next, depth: nextDepth, laps, grew: true };
      }
      // Nothing new at this band; record the depth so it is not retried.
      await persist(sessionId, stored, nextDepth, laps);
      depth = nextDepth;
    }
  }

  // ── Resurfacing ──────────────────────────────────────────────────────────
  //
  // Only from far enough back that the reader could not experience it as a
  // loop, and preferring what has been out of sight longest.
  const gap = CFG.LIFECYCLE.resurfaceMinGap;

  /**
   * A card is eligible to come back only from its most recent appearance.
   *
   * Keying on the first one lets the strongest cards return on every lap while
   * everything else waits, which reads as a loop and — because resurfacing
   * prefers quality — makes the deep feed better than the middle of it, which
   * is plainly wrong. So the gap is measured from wherever a card was last
   * seen, and each return costs it, so the whole body of material takes its
   * turn before anything comes round twice.
   */
  const lastSeen = new Map<string, number>();
  const returns = new Map<string, number>();
  stored.forEach((s2, i) => {
    const key = s2.card.id;
    if (lastSeen.has(key)) returns.set(key, (returns.get(key) ?? 0) + 1);
    lastSeen.set(key, i);
  });

  const byKey = new Map<string, StoredCard>();
  for (const s2 of stored) if (!byKey.has(s2.card.id)) byKey.set(s2.card.id, s2);

  const age = (i: number) =>
    Math.min(1, (stored.length - i) / CFG.LIFECYCLE.resurfaceAgeSaturation);

  const pool = [...lastSeen.entries()]
    .filter(([, i]) => stored.length - i >= gap)
    .map(([key, i]) => ({
      key,
      card: byKey.get(key) as StoredCard,
      // Longest out of sight first, quality still counted, and every previous
      // return held against it.
      rank: (byKey.get(key)?.lifecycle.score ?? 0)
        + CFG.LIFECYCLE.resurfaceAgeBonus * age(i)
        - CFG.LIFECYCLE.resurfaceRepeatPenalty * (returns.get(key) ?? 0),
    }))
    .sort((a, b) => b.rank - a.rank);

  if (pool.length === 0) return { stored, depth, laps, grew: false };

  const added = pool.slice(0, CFG.LIFECYCLE.pageSize).map(({ card }) => ({
    ...card,
    resurfaced: true,
    lifecycle: { ...card.lifecycle, status: "REVIVED" as LifecycleStatus },
  }));
  const next = [...stored, ...added];
  await persist(sessionId, next, depth, laps + 1);
  console.log(`[feed] session ${sessionId} lap ${laps + 1}, +${added.length} resurfaced (${next.length} total)`);
  return { stored: next, depth, laps: laps + 1, grew: true };
}

async function persist(sessionId: string, stored: StoredCard[], depth: number, laps: number) {
  await prisma.recommendationFeedSession.update({
    where: { id: sessionId },
    data: { cards: stored as unknown as object, depth, laps },
  });
}

/**
 * One page of the stream.
 *
 * Without a cursor this starts a new session; with one it slices the session
 * that cursor names. A cursor pointing at a session that has been pruned falls
 * back to a fresh session rather than an error — the reader gets cards, not a
 * blank feed.
 */
export async function feedPage(
  viewerId: string, cursor: string | null, limit: number,
): Promise<FeedPage | null> {
  const size = Math.min(CFG.LIFECYCLE.maxPageSize, Math.max(1, limit));

  let sessionId: string | null = null;
  let offset = 0;
  let stored: StoredCard[] | null = null;
  let depth = 0;
  let laps = 0;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const loaded = await loadSession(viewerId, decoded.sessionId);
      if (loaded) {
        sessionId = decoded.sessionId;
        stored = loaded.stored;
        depth = loaded.depth;
        laps = loaded.laps;
        offset = decoded.offset;
      }
    }
  }

  if (!stored) {
    const built = await startSession(viewerId);
    if (!built) return null;
    sessionId = built.sessionId;
    stored = built.stored;
    offset = 0;
  }

  /**
   * Reaching the end of what has been generated is not the end of the feed.
   *
   * It is the point at which the search widens: a deeper band of the same
   * generators, and when those are spent, cards from far enough back in this
   * reading to have left the reader's memory. Extension runs until the page
   * can be filled or until neither source has anything left, which for a real
   * library does not happen.
   */
  let guard = 0;
  while (offset + size > stored.length && guard++ < CFG.LIFECYCLE.maxExtensions) {
    const grown = await extendSession(viewerId, sessionId as string, stored, depth, laps);
    stored = grown.stored;
    depth = grown.depth;
    laps = grown.laps;
    if (!grown.grew) break;
  }

  const slice = stored.slice(offset, offset + size);
  const end = offset + slice.length;

  // More exists whenever another card has been composed, another band can
  // still be searched, or anything is far enough back to come round again.
  const canDeepen = depth < MAX_DEPTH;
  const canResurface = stored.length > CFG.LIFECYCLE.resurfaceMinGap;
  const hasMore = end < stored.length || canDeepen || canResurface;

  return {
    cards: slice.map((s, i) => ({ ...s.card, rank: offset + i + 1 })),
    nextCursor: hasMore ? encodeCursor(sessionId as string, end) : null,
    hasMore,
    caughtUp: !hasMore,
    sessionId: sessionId as string,
    total: stored.length,
  };
}

/**
 * One card and every track its page must show.
 *
 * Served from the session snapshot, so the card here is the card the feed
 * rendered — identical artwork, caption and numbers — and tapping a card makes
 * no external request of any kind. Only the track rows are read, and those
 * come from Blueprint's own tables.
 */
export async function cardDetail(
  viewerId: string, key: string,
): Promise<{ card: FeedCard; tracks: FeedTrack[] } | null> {
  const sessions = await prisma.recommendationFeedSession.findMany({
    where: { userId: viewerId },
    orderBy: { createdAt: "desc" },
    take: CFG.LIFECYCLE.sessionsRetained,
    select: { cards: true },
  });

  let hit: StoredCard | undefined;
  for (const s of sessions) {
    hit = (s.cards as unknown as StoredCard[]).find((c) => c.card.id === key);
    if (hit) break;
  }
  if (!hit) return null;

  return { card: hit.card, tracks: await hydrate(viewerId, hit.deliverableIds) };
}

/** Track rows for a stored deliverable set, with the people who hold each. */
async function hydrate(viewerId: string, ids: string[]): Promise<FeedTrack[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.track.findMany({
    where: { spotifyId: { in: ids }, user: { midvaleHidden: false } },
    select: {
      spotifyId: true, name: true, artist: true, album: true, imageUrl: true,
      user: { select: { id: true, name: true, image: true } },
    },
  });

  const byId = new Map<string, { name: string; artist: string; album: string | null; imageUrl: string | null; friends: FeedPerson[] }>();
  for (const r of rows) {
    const entry = byId.get(r.spotifyId) ?? {
      name: r.name, artist: r.artist, album: r.album, imageUrl: r.imageUrl, friends: [],
    };
    if (!entry.imageUrl && r.imageUrl) entry.imageUrl = r.imageUrl;
    if (r.user.id !== viewerId && !entry.friends.some((f) => f.id === r.user.id)) {
      entry.friends.push({ id: r.user.id, name: r.user.name, image: r.user.image });
    }
    byId.set(r.spotifyId, entry);
  }

  // The stored order is the order the engine chose; it is not re-sorted here.
  return ids.flatMap((id) => {
    const e = byId.get(id);
    if (!e) return [];
    return [{
      id, spotifyId: id, name: e.name, artist: e.artist, album: e.album,
      imageUrl: e.imageUrl,
      spotifyUrl: `https://open.spotify.com/track/${id}`,
      friends: e.friends.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    }];
  });
}

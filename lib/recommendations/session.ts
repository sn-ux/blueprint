import { prisma } from "@/lib/prisma";
import * as CFG from "@/lib/discovery/config";
import { compose } from "@/lib/discovery/engine";
import { buildFeed, toFeedCard, type FeedCard, type FeedPerson, type FeedTrack } from "@/lib/discovery/feed";
import { evaluate, type ExposureState, type LifecycleStatus } from "@/lib/discovery/lifecycle";

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
  const result = await buildFeed(viewerId, 0);
  if (!result) return null;

  const now = new Date();
  const exposures = await exposuresOf(viewerId);

  const eligible = [];
  const suppressed: SessionBuild["suppressed"] = [];
  for (const c of result.all) {
    const v = evaluate(c, exposures.get(c.recommendationKey ?? ""), now);
    c.lifecycleScore = v.score;
    c.lifecycleParts = v.parts;
    if (!v.eligible) {
      suppressed.push({ key: c.recommendationKey ?? "", status: v.status });
      continue;
    }
    eligible.push({ candidate: c, status: v.status });
  }

  // Composition runs over lifecycle placement rather than raw ranking, and
  // draws each slot from a window a few pages deep so a later page stays
  // mixed instead of becoming the dregs of one sort.
  const ordered = compose(
    eligible.map((e) => e.candidate),
    Infinity,
    CFG.FEED.lambda,
    (c) => c.lifecycleScore ?? c.rankingScore ?? 0,
    CFG.LIFECYCLE.pageSize * CFG.LIFECYCLE.pageWindowMultiple,
  );
  ordered.forEach((c, i) => { c.feedRank = i + 1; });

  const statusOf = new Map(eligible.map((e) => [e.candidate, e.status]));
  const stored: StoredCard[] = ordered.map((c) => ({
    card: toFeedCard(result.index, c),
    deliverableIds: c.deliverableIds ?? [],
    lifecycle: { status: statusOf.get(c) ?? "READY", score: c.lifecycleScore ?? 0 },
  }));

  if (!persist) return { sessionId: "", stored, suppressed };

  const session = await prisma.recommendationFeedSession.create({
    data: {
      userId: viewerId,
      expiresAt: new Date(now.getTime() + CFG.LIFECYCLE.sessionTtlMinutes * 60_000),
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

async function loadSession(viewerId: string, sessionId: string): Promise<StoredCard[] | null> {
  const row = await prisma.recommendationFeedSession.findFirst({
    where: { id: sessionId, userId: viewerId },
    select: { cards: true },
  });
  return row ? (row.cards as unknown as StoredCard[]) : null;
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

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      stored = await loadSession(viewerId, decoded.sessionId);
      if (stored) { sessionId = decoded.sessionId; offset = decoded.offset; }
    }
  }

  if (!stored) {
    const built = await startSession(viewerId);
    if (!built) return null;
    sessionId = built.sessionId;
    stored = built.stored;
    offset = 0;
  }

  const slice = stored.slice(offset, offset + size);
  const end = offset + slice.length;
  const hasMore = end < stored.length;

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

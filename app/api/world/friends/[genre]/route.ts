// GET /api/world/friends/[genre]
// Returns the deduped tracklist for one genre across ALL Midvale users.
// Deduplication: one track per spotifyId (best representative — prefers entries
// with imageUrl).  socialUsers = every user who has that spotifyId; socialCount
// = socialUsers.length (single source of truth, same as the per-user endpoint).
// Also bundles subgenre counts so the frontend can skip the /subgenres fetch.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { discoveryFilter } from "@/lib/friends-discovery";

export const dynamic = "force-dynamic";

type RawTrack = {
  id:                string;
  name:              string;
  artist:            string;
  album:             string | null;
  imageUrl:          string | null;
  previewUrl:        string | null;
  spotifyId:         string;
  blueprintSubgenre: string;
  user:              { id: string; name: string | null; image: string | null };
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ genre: string }> },
) {
  const t0 = Date.now();

  // ?excludeMine=1 drops everything the caller already has. Applied before the
  // representative track and the subgenre counts are built, so the counts and
  // the list they head can never disagree.
  const filter = await discoveryFilter(req);
  if (!filter.ok) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams }  = new URL(req.url);
  const unheardForUserId  = searchParams.get("unheardForUserId");
  const { genre } = await context.params;
  const blueprintWorld = decodeURIComponent(genre);

  // All tracks for this world across every user. Excludes users whose
  // Spotify access is no longer valid (midvaleHidden — see lib/spotify-import.ts).
  const allTracks: RawTrack[] = await prisma.track.findMany({
    where:   { blueprintWorld, user: { midvaleHidden: false } },
    select:  {
      id:                true,
      name:              true,
      artist:            true,
      album:             true,
      imageUrl:          true,
      previewUrl:        true,
      spotifyId:         true,
      blueprintSubgenre: true,
      user:              { select: { id: true, name: true, image: true } },
    },
    orderBy: [{ artist: "asc" }, { name: "asc" }],
  });

  const tDB = Date.now();

  if (allTracks.length === 0) {
    return NextResponse.json({ genre: blueprintWorld, tracks: [], subgenres: [] });
  }

  // ── Build maps in one pass ────────────────────────────────────────────────
  // 1. best representative track per spotifyId (prefer entries with imageUrl)
  // 2. deduped socialUsers list per spotifyId

  const repMap        = new Map<string, RawTrack>();
  const socialUserMap = new Map<string, { id: string; name: string | null; image: string | null }[]>();

  for (const t of allTracks) {
    if (!filter.keep(t.spotifyId)) continue;
    const existing = repMap.get(t.spotifyId);
    if (!existing || (!existing.imageUrl && t.imageUrl)) {
      repMap.set(t.spotifyId, t);
    }
    const list = socialUserMap.get(t.spotifyId) ?? [];
    if (!list.some(u => u.id === t.user.id)) {
      list.push(t.user);
    }
    socialUserMap.set(t.spotifyId, list);
  }

  // ── Unheard-for-user: find which spotifyIds the substitute already has ────
  const allSpotifyIds = [...repMap.keys()];
  let heardSet = new Set<string>();
  if (unheardForUserId && allSpotifyIds.length > 0) {
    const heardRows = await prisma.track.findMany({
      where:  { userId: unheardForUserId, spotifyId: { in: allSpotifyIds } },
      select: { spotifyId: true },
    });
    heardSet = new Set(heardRows.map(r => r.spotifyId).filter(Boolean) as string[]);
  }

  // ── Compose final tracks ──────────────────────────────────────────────────
  const tracks = [...repMap.values()]
    .sort((a, b) => a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name))
    .map(({ user: _user, ...rest }) => {
      const socialUsers = socialUserMap.get(rest.spotifyId) ?? [];
      const socialCount = socialUsers.length;
      const isUnheardForSelectedUser = unheardForUserId
        ? !heardSet.has(rest.spotifyId)
        : undefined;
      return { ...rest, socialUsers, socialCount, isUnheardForSelectedUser };
    });

  // ── Bundle subgenre counts (saves a second /subgenres round-trip) ─────────
  const subgenreCounts: Record<string, number> = {};
  for (const [, t] of repMap) {
    const sub = t.blueprintSubgenre?.trim();
    if (!sub) continue;
    subgenreCounts[sub] = (subgenreCounts[sub] ?? 0) + 1;
  }
  const subgenres = Object.entries(subgenreCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const firstSocial = tracks.find(t => t.socialCount > 0);
  if (firstSocial) {
    console.log(
      `[friends-social-debug] spotifyId=${firstSocial.spotifyId}` +
      ` socialUsers.length=${firstSocial.socialUsers.length}` +
      ` socialCount=${firstSocial.socialCount}`,
    );
  }

  console.log(`[perf] /api/world/friends/${blueprintWorld} → ${tracks.length} deduped tracks, ${subgenres.length} subgenres in ${Date.now() - t0}ms (db=${tDB - t0}ms)`);

  // Responses that include user-specific unheard data must be private (never
  // served from a shared CDN cache to a different user).  Responses without
  // the param are safe to cache publicly for a short window.
  // A filtered response is personal to the caller, as is unheard data, so
  // neither may reach a shared CDN cache.
  const cacheHeader = (unheardForUserId || filter.excluded)
    ? "private, no-store"
    : "public, max-age=60, stale-while-revalidate=300";

  return NextResponse.json(
    { genre: blueprintWorld, tracks, subgenres },
    { headers: { "Cache-Control": cacheHeader } },
  );
}

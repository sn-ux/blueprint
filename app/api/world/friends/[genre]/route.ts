// GET /api/world/friends/[genre]
// Returns the deduped tracklist for one genre across ALL Midvale users.
// Deduplication: one track per spotifyId (best representative — prefers entries
// with imageUrl).  socialUsers = every user who has that spotifyId; socialCount
// = socialUsers.length (single source of truth, same as the per-user endpoint).
// Also bundles subgenre counts so the frontend can skip the /subgenres fetch.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  user:              { id: string; name: string | null };
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ genre: string }> },
) {
  const t0 = Date.now();
  const { searchParams }  = new URL(req.url);
  const unheardForUserId  = searchParams.get("unheardForUserId");
  const { genre } = await context.params;
  const blueprintWorld = decodeURIComponent(genre);

  // All tracks for this world across every user.
  const allTracks: RawTrack[] = await prisma.track.findMany({
    where:   { blueprintWorld },
    select:  {
      id:                true,
      name:              true,
      artist:            true,
      album:             true,
      imageUrl:          true,
      previewUrl:        true,
      spotifyId:         true,
      blueprintSubgenre: true,
      user:              { select: { id: true, name: true } },
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
  const socialUserMap = new Map<string, { id: string; name: string | null }[]>();

  for (const t of allTracks) {
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

  return NextResponse.json(
    { genre: blueprintWorld, tracks, subgenres },
    // Friends world data changes only when users import new tracks — short cache is safe.
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ genre: string }> },
) {
  const t0 = Date.now();

  const { searchParams } = new URL(req.url);
  const queryUserId = searchParams.get("userId");
  const isPublicView = !!queryUserId;

  let user;
  if (queryUserId) {
    user = await prisma.user.findUnique({ where: { id: queryUserId } });
  } else {
    const authed = await getCurrentUser();
    user =
      authed ??
      (await prisma.user.findFirst({ where: { tracks: { some: {} } } }));
  }

  const { genre } = await context.params;
  const blueprintWorld = decodeURIComponent(genre);

  if (!user) {
    return NextResponse.json({ genre: blueprintWorld, tracks: [], subgenres: [] });
  }

  const tracks = await prisma.track.findMany({
    where: { userId: user.id, blueprintWorld },
    select: {
      id:                true,
      name:              true,
      artist:            true,
      album:             true,
      imageUrl:          true,
      previewUrl:        true,
      spotifyId:         true,
      blueprintSubgenre: true,
    },
    orderBy: [{ artist: "asc" }, { name: "asc" }],
  });

  const tDB = Date.now();

  // ── Social popularity: find other Midvale users who also have each track ──
  // Single source of truth: build socialUsers first (deduped by userId),
  // then socialCount = socialUsers.length.  No separate count query.

  const spotifyIds = tracks
    .map(t => t.spotifyId)
    .filter((id): id is string => !!id);

  // Map from spotifyId → deduped array of { id, name } for OTHER users
  const socialUsersMap = new Map<string, { id: string; name: string | null }[]>();
  if (spotifyIds.length > 0) {
    const otherTracks = await prisma.track.findMany({
      where: {
        spotifyId: { in: spotifyIds },
        userId:    { not: user.id },
      },
      select: {
        spotifyId: true,
        user:      { select: { id: true, name: true } },
      },
    });
    for (const ot of otherTracks) {
      if (!ot.spotifyId) continue;
      const list = socialUsersMap.get(ot.spotifyId) ?? [];
      if (!list.some(u => u.id === ot.user.id)) {
        list.push(ot.user);
      }
      socialUsersMap.set(ot.spotifyId, list);
    }
  }

  const tracksWithSocial = tracks.map(t => {
    const socialUsers = socialUsersMap.get(t.spotifyId ?? "") ?? [];
    const socialCount = socialUsers.length;
    return { ...t, socialUsers, socialCount };
  });

  // ── Bundle subgenre counts (saves the frontend's second /subgenres fetch) ──
  const subgenreCounts: Record<string, number> = {};
  for (const t of tracks) {
    const sub = t.blueprintSubgenre?.trim();
    if (!sub) continue;
    subgenreCounts[sub] = (subgenreCounts[sub] ?? 0) + 1;
  }
  const subgenres = Object.entries(subgenreCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  console.log(`[perf] /api/world/${blueprintWorld} (userId=${queryUserId ?? "session"}) → ${tracks.length} tracks, ${subgenres.length} subgenres in ${Date.now() - t0}ms (db=${tDB - t0}ms, js=${Date.now() - tDB}ms)`);

  // First track with social data for debug
  const firstSocial = tracksWithSocial.find(t => t.socialCount > 0);
  if (firstSocial) {
    console.log(
      `[social-debug] spotifyId=${firstSocial.spotifyId}` +
      ` socialUsers.length=${firstSocial.socialUsers.length}` +
      ` socialCount=${firstSocial.socialCount}`,
    );
  }

  // Public views can be cached briefly; own-world stays fresh for auto-sync.
  const cacheHeader = isPublicView
    ? "public, max-age=60, stale-while-revalidate=300"
    : "no-store";

  return NextResponse.json(
    { genre: blueprintWorld, tracks: tracksWithSocial, subgenres },
    { headers: { "Cache-Control": cacheHeader } },
  );
}

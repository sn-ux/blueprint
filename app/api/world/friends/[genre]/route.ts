// GET /api/world/friends/[genre]
// Returns the deduped tracklist for one genre across ALL Midvale users.
// Deduplication: one track per spotifyId (best representative — prefers entries
// with imageUrl).  socialUsers = every user who has that spotifyId; socialCount
// = socialUsers.length (single source of truth, same as the per-user endpoint).

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
  _req: NextRequest,
  context: { params: Promise<{ genre: string }> },
) {
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

  if (allTracks.length === 0) {
    return NextResponse.json({ genre: blueprintWorld, tracks: [] });
  }

  // ── Build two maps in one pass ────────────────────────────────────────────
  // 1. best representative track per spotifyId (prefer entries with imageUrl)
  // 2. deduped socialUsers list per spotifyId

  const repMap        = new Map<string, RawTrack>();
  const socialUserMap = new Map<string, { id: string; name: string | null }[]>();

  for (const t of allTracks) {
    // Representative selection
    const existing = repMap.get(t.spotifyId);
    if (!existing || (!existing.imageUrl && t.imageUrl)) {
      repMap.set(t.spotifyId, t);
    }

    // Social users — dedupe by userId
    const list = socialUserMap.get(t.spotifyId) ?? [];
    if (!list.some(u => u.id === t.user.id)) {
      list.push(t.user);
    }
    socialUserMap.set(t.spotifyId, list);
  }

  // ── Compose final tracks (strip the `user` relation, add social fields) ──
  const tracks = [...repMap.values()]
    .sort((a, b) => a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name))
    .map(({ user: _user, ...rest }) => {
      const socialUsers = socialUserMap.get(rest.spotifyId) ?? [];
      const socialCount = socialUsers.length;   // single source of truth
      return { ...rest, socialUsers, socialCount };
    });

  // Debug log: first track that has social data
  const firstSocial = tracks.find(t => t.socialCount > 0);
  if (firstSocial) {
    console.log(
      `[friends-social-debug] spotifyId=${firstSocial.spotifyId}` +
      ` socialUsers.length=${firstSocial.socialUsers.length}` +
      ` socialCount=${firstSocial.socialCount}` +
      ` renderedCount=${firstSocial.socialCount}`
    );
  }

  return NextResponse.json(
    { genre: blueprintWorld, tracks },
    { headers: { "Cache-Control": "no-store" } },
  );
}

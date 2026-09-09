// GET /api/me/albums
//
// Every album the caller has saved anything from, with how many of its tracks
// they have saved. Same shape and same reasoning as /api/me/artists.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rows = await prisma.track.findMany({
    // An empty title is not an album; two rows carry one, and they would
    // render as nameless tiles.
    where: { userId: viewer.id, album: { not: null, notIn: [""] } },
    select: { album: true, albumId: true, artist: true, imageUrl: true },
  });

  type Entry = { id: string; spotifyId: string | null; name: string; artist: string; imageUrl: string | null; trackCount: number };
  const byAlbum = new Map<string, Entry>();

  for (const t of rows) {
    // The album id is the identity: titles collide across reissues, deluxe
    // editions and rereleases, and grouping by name would merge them.
    const id = t.albumId ?? `name:${(t.album ?? "").trim().toLowerCase()}|${t.artist.trim().toLowerCase()}`;
    const hit = byAlbum.get(id);
    if (hit) {
      hit.trackCount++;
      if (!hit.imageUrl && t.imageUrl) hit.imageUrl = t.imageUrl;
      continue;
    }
    byAlbum.set(id, {
      id,
      spotifyId: t.albumId,
      name: t.album ?? "",
      artist: t.artist,
      imageUrl: t.imageUrl ?? null,
      trackCount: 1,
    });
  }

  const albums = [...byAlbum.values()].sort(
    (a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name),
  );

  return NextResponse.json({ albums }, { headers: { "Cache-Control": "no-store" } });
}

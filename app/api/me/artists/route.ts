// GET /api/me/artists
//
// Every artist in the caller's own saved library, with how many of their
// tracks the caller has saved.
//
// One query and one pass. The alternative — fetching the library a genre at a
// time and grouping on the device — sends five thousand tracks over the wire
// to answer a question about twelve hundred artists.

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
    where: { userId: viewer.id },
    select: { artist: true, artistId: true, artistImageUrl: true },
  });

  type Entry = { id: string; spotifyId: string | null; name: string; imageUrl: string | null; trackCount: number };
  const byArtist = new Map<string, Entry>();

  for (const t of rows) {
    // Spotify's id where the import captured one, the name otherwise — so two
    // spellings of one artist stay one tile, and an artist with no id is
    // still counted rather than dropped.
    const id = t.artistId ?? `name:${t.artist.trim().toLowerCase()}`;
    const hit = byArtist.get(id);
    if (hit) {
      hit.trackCount++;
      // A picture from any of their tracks; the backfill did not reach all.
      if (!hit.imageUrl && t.artistImageUrl) hit.imageUrl = t.artistImageUrl;
      continue;
    }
    byArtist.set(id, {
      id,
      spotifyId: t.artistId,
      name: t.artist,
      imageUrl: t.artistImageUrl ?? null,
      trackCount: 1,
    });
  }

  // Most saved first, and the name settles ties so the order is the same
  // every time the screen opens.
  const artists = [...byArtist.values()].sort(
    (a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name),
  );

  return NextResponse.json({ artists }, { headers: { "Cache-Control": "no-store" } });
}

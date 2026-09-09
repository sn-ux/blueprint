// GET /api/unheard/[genre]
//
// The "New to You" candidate list for one Blueprint world: what the people
// around the caller have in that genre that the caller does not, ordered by
// how many of them hold it.
//
// This is not the recommendation engine. There is no scoring, no evidence
// scale, no diversification and no notion of taste — it is a filter and a
// count, and the order is entirely "how many friends have this".

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { workKeyOf } from "@/lib/discovery/sets";

export const dynamic = "force-dynamic";

/**
 * How many candidates to return.
 *
 * The client builds a playlist of up to 180 minutes from the head of this
 * list. Even at a minute a song that is 180 rows, so this is headroom rather
 * than a limit anyone reaches — it exists so a large world cannot send four
 * thousand rows to a phone.
 */
const LIMIT = 300;

type Holder = { id: string; name: string | null; image: string | null };

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ genre: string }> },
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { genre } = await context.params;
  const blueprintWorld = decodeURIComponent(genre);

  // ── What the caller already has, at recording level ────────────────────────
  //
  // Keyed by work rather than by Spotify id, because an id identifies a
  // pressing: the 2018 remaster, the deluxe rerelease and the single edit are
  // three ids for one recording. Excluding by id alone let all three back in
  // as "new to you" when the caller owned one of them.
  const mine = await prisma.track.findMany({
    where: { userId: viewer.id },
    select: { name: true, artist: true },
  });
  const owned = new Set(mine.map((t) => workKeyOf(t.name, t.artist)));

  const rows = await prisma.track.findMany({
    where: {
      blueprintWorld,
      userId: { not: viewer.id },
      user: { midvaleHidden: false },
    },
    select: {
      spotifyId: true,
      name: true,
      artist: true,
      album: true,
      imageUrl: true,
      previewUrl: true,
      durationMs: true,
      releaseDate: true,
      releaseDatePrecision: true,
      blueprintSubgenre: true,
      user: { select: { id: true, name: true, image: true } },
    },
  });

  // ── Fold pressings onto recordings ─────────────────────────────────────────
  //
  // Holders are counted per recording, not per pressing. Two people holding
  // two different pressings of the same song are two people who have that
  // song, and splitting them into two rows of one would understate both.
  type Entry = {
    key: string;
    rep: (typeof rows)[number];
    holders: Map<string, Holder>;
  };
  const byWork = new Map<string, Entry>();

  for (const t of rows) {
    const key = workKeyOf(t.name, t.artist);
    // Exclusion runs here, before anything is counted, so the ranking never
    // sees a recording the caller already owns.
    if (owned.has(key)) continue;

    const hit = byWork.get(key);
    if (!hit) {
      byWork.set(key, {
        key,
        rep: t,
        holders: new Map([[t.user.id, t.user]]),
      });
      continue;
    }
    hit.holders.set(t.user.id, t.user);
    // The pressing that represents the recording is chosen deterministically:
    // one with artwork beats one without, and the lower Spotify id settles it.
    // Nothing here depends on which order the database returned rows in.
    const better =
      (!!t.imageUrl && !hit.rep.imageUrl) ||
      (!!t.imageUrl === !!hit.rep.imageUrl && t.spotifyId < hit.rep.spotifyId);
    if (better) hit.rep = t;
    if (hit.rep.durationMs == null && t.durationMs != null) hit.rep = { ...hit.rep, durationMs: t.durationMs };
  }

  // ── Rank by friend popularity ──────────────────────────────────────────────
  //
  // Holder count descending, and the work key breaks ties. The tiebreak is
  // there to make the order total and repeatable, not to express a preference:
  // it is the same list in the same order every time the page is opened.
  const ranked = [...byWork.values()]
    .sort((a, b) => b.holders.size - a.holders.size || a.key.localeCompare(b.key))
    .slice(0, LIMIT);

  const tracks = ranked.map(({ rep, holders }) => {
    const socialUsers = [...holders.values()];
    return {
      id: rep.spotifyId,
      name: rep.name,
      artist: rep.artist,
      album: rep.album,
      imageUrl: rep.imageUrl,
      previewUrl: rep.previewUrl,
      spotifyId: rep.spotifyId,
      durationMs: rep.durationMs,
      releaseDate: rep.releaseDate,
      releaseDatePrecision: rep.releaseDatePrecision,
      blueprintSubgenre: rep.blueprintSubgenre,
      socialUsers,
      socialCount: socialUsers.length,
    };
  });

  return NextResponse.json(
    { genre: blueprintWorld, tracks, total: byWork.size },
    { headers: { "Cache-Control": "no-store" } },
  );
}

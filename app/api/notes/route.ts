// GET  /api/notes?target=artist:<id>   — every note on that target
// POST /api/notes  { target, body }    — write one
//
// Notes are about an entity, not about a card. The key is the one
// subjectIdentity() already builds, which is the same string for every viewer,
// so two people who reach the same artist by different routes are reading and
// writing the same thread.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { workKeyOf } from "@/lib/discovery/sets";

export const dynamic = "force-dynamic";

/**
 * The kinds subjectIdentity() produces, plus tracks.
 *
 * A track is named by its Spotify id on the way in and stored by its
 * recording. A Spotify id identifies a pressing — the album, the deluxe
 * edition and the anthology are three ids for one song — so keying comments
 * to the id would scatter a conversation about a song across whichever
 * pressing each person happened to have saved.
 */
const KINDS = ["artist", "album", "subgenre", "genre", "set", "track"];
const MAX_BODY = 2000;

/**
 * The stored key for a target.
 *
 * Everything but a track is already stable and is taken as given. A track is
 * resolved here, once, so a read and a write can never disagree about what
 * the same song is called — which is also why the client is not asked to work
 * it out and there is no second copy of this rule on a device.
 */
async function resolveTarget(raw: string | null): Promise<{ type: string; key: string } | null> {
  const [one] = await resolveMany(raw ? [raw] : []);
  return one ?? null;
}

/** What a track note is about, so a list can say which song. */
export interface Subject { kind: string; title: string; subtitle: string | null }

/**
 * Resolve a whole set of targets in one go, and say what the track ones are.
 *
 * The pressings are looked up together rather than one query per track — a
 * card's tracklist is twenty of them. The names come back with the keys, so a
 * note stored under a recording can be shown against the song it is about
 * without the client ever having to know what a recording key is.
 */
async function resolveMany(
  raws: string[],
): Promise<{ type: string; key: string; subject?: Subject }[]> {
  const out: { type: string; key: string; subject?: Subject }[] = [];
  const trackIds: string[] = [];

  for (const raw of raws) {
    const given = (raw ?? "").trim();
    if (!given || given.length > 400) continue;
    const type = given.slice(0, given.indexOf(":"));
    if (!KINDS.includes(type)) continue;
    if (type === "track") {
      const id = given.slice("track:".length);
      if (id) trackIds.push(id);
    } else {
      out.push({ type, key: given });
    }
  }

  if (trackIds.length) {
    const rows = await prisma.track.findMany({
      where: { spotifyId: { in: [...new Set(trackIds)] } },
      select: { spotifyId: true, name: true, artist: true },
      distinct: ["spotifyId"],
    });
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `track:${workKeyOf(r.name, r.artist)}`;
      // Two pressings of one recording collapse to one key, and one entry.
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        type: "track",
        key,
        subject: { kind: "track", title: r.name, subtitle: r.artist },
      });
    }
  }

  return out;
}

/** Author fields only: a name and a picture, never an email or a grant. */
const AUTHOR = { select: { id: true, name: true, image: true } };

export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  /**
   * One or many targets.
   *
   * A card's Notes tab asks for the card and for every track on its own
   * tracklist at once, and gets one list back. The notes stay stored against
   * whatever they were written on — this is a read, not a copy — and each one
   * comes back saying what it is about, so a track note can be shown against
   * its song.
   */
  const asked = new URL(req.url).searchParams.getAll("target").slice(0, 200);
  const targets = await resolveMany(asked);
  if (targets.length === 0) {
    return NextResponse.json({ error: "Unknown target" }, { status: 400 });
  }

  const subjects = new Map(
    targets.filter((t) => t.subject).map((t) => [t.key, t.subject as Subject]),
  );

  const rows = await prisma.note.findMany({
    where: { targetKey: { in: targets.map((t) => t.key) } },
    orderBy: { createdAt: "desc" },
    take: 400,
    include: { author: AUTHOR },
  });

  return NextResponse.json(
    { notes: rows.map((n) => ({ ...shape(n), subject: subjects.get(n.targetKey) ?? null })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: { target?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const target = await resolveTarget(payload.target ?? null);
  if (!target) {
    return NextResponse.json({ error: "Unknown target" }, { status: 400 });
  }

  // Whitespace is not a note.
  const body = (payload.body ?? "").trim();
  if (!body) {
    return NextResponse.json({ error: "Empty note" }, { status: 400 });
  }
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: "Note too long" }, { status: 400 });
  }

  const note = await prisma.note.create({
    data: { authorId: viewer.id, targetType: target.type, targetKey: target.key, body },
    include: { author: AUTHOR },
  });

  return NextResponse.json({ note: shape(note) }, { status: 201 });
}

type Row = {
  id: string; body: string; createdAt: Date; targetKey: string;
  author: { id: string; name: string | null; image: string | null };
};

const shape = (n: Row) => ({
  id: n.id,
  body: n.body,
  createdAt: n.createdAt.toISOString(),
  target: n.targetKey,
  author: { id: n.author.id, name: n.author.name, image: n.author.image },
});

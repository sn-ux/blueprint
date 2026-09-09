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
  if (!raw) return null;
  const given = raw.trim();
  if (!given || given.length > 400) return null;
  const type = given.slice(0, given.indexOf(":"));
  if (!KINDS.includes(type)) return null;
  if (type !== "track") return { type, key: given };

  const spotifyId = given.slice("track:".length);
  if (!spotifyId) return null;
  // Any row for this pressing gives its name and artist; the recording key is
  // the same whichever row answers.
  const row = await prisma.track.findFirst({
    where: { spotifyId },
    select: { name: true, artist: true },
  });
  if (!row) return null;
  return { type, key: `track:${workKeyOf(row.name, row.artist)}` };
}

/** Author fields only: a name and a picture, never an email or a grant. */
const AUTHOR = { select: { id: true, name: true, image: true } };

export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const target = await resolveTarget(new URL(req.url).searchParams.get("target"));
  if (!target) {
    return NextResponse.json({ error: "Unknown target" }, { status: 400 });
  }

  const rows = await prisma.note.findMany({
    where: { targetKey: target.key },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { author: AUTHOR },
  });

  return NextResponse.json(
    { notes: rows.map(shape) },
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

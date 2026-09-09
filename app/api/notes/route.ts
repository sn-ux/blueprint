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

export const dynamic = "force-dynamic";

/** The kinds subjectIdentity() produces. Anything else is not a target. */
const KINDS = ["artist", "album", "subgenre", "genre", "set"];
const MAX_BODY = 2000;

function parseTarget(raw: string | null): { type: string; key: string } | null {
  if (!raw) return null;
  const key = raw.trim();
  if (!key || key.length > 400) return null;
  const type = key.slice(0, key.indexOf(":"));
  if (!KINDS.includes(type)) return null;
  return { type, key };
}

/** Author fields only: a name and a picture, never an email or a grant. */
const AUTHOR = { select: { id: true, name: true, image: true } };

export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const target = parseTarget(new URL(req.url).searchParams.get("target"));
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

  const target = parseTarget(payload.target ?? null);
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

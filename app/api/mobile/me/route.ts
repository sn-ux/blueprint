// GET /api/mobile/me
//
// The signed-in user's identity. Also the smallest endpoint mobile can use to
// confirm its credential still works. No Spotify tokens are exposed.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return NextResponse.json(
    { id: me.id, name: me.name, image: me.image },
    { headers: { "Cache-Control": "no-store" } },
  );
}

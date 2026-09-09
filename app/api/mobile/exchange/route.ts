// POST /api/mobile/exchange   { code }
//
// Trades a one-time handoff code for the mobile session credential. Single-use
// and short-lived; see lib/mobile-auth.

import { NextRequest, NextResponse } from "next/server";
import { redeemHandoffCode } from "@/lib/mobile-auth";

export async function POST(req: NextRequest) {
  let code: unknown;
  try {
    ({ code } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (typeof code !== "string" || code.length === 0) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const credential = await redeemHandoffCode(code);
  if (!credential) {
    // Unknown, already redeemed and expired are deliberately indistinguishable.
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  return NextResponse.json(credential, {
    headers: { "Cache-Control": "no-store" },
  });
}

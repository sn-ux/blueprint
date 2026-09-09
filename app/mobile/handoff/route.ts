// GET /mobile/handoff
//
// Where NextAuth lands the mobile app after a normal browser Spotify sign-in.
// Issues a one-time code and bounces back into the app's custom scheme. Only
// the code travels in the URL — never a session token.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { issueHandoffCode } from "@/lib/mobile-auth";

const APP_SCHEME = "blueprintmobile://auth";

function deepLink(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  // Built by hand rather than via NextResponse.redirect, which expects an
  // http(s) URL and rejects a custom scheme.
  return new NextResponse(null, { status: 302, headers: { Location: `${APP_SCHEME}?${qs}` } });
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return deepLink({ error: "unauthenticated" });

  try {
    const code = await issueHandoffCode(me.id);
    return deepLink({ code });
  } catch {
    return deepLink({ error: "handoff_failed" });
  }
}

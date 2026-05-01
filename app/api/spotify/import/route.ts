import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { runLikedSongsImport } from "@/lib/spotify-import";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await runLikedSongsImport(user.id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}

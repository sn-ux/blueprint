import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET() {
  // Counts over the caller's own library. This route has no public form —
  // nothing here names a profile — so without a credential there is no
  // question to answer, and answering with somebody else's totals is the bug
  // this replaces.
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [artistRows, subgenreRows] = await Promise.all([
    prisma.track.groupBy({
      by: ["artist"],
      where: { userId: user.id },
    }),
    prisma.track.groupBy({
      by: ["blueprintSubgenre"],
      where: { userId: user.id, blueprintSubgenre: { not: "" } },
    }),
  ]);

  return NextResponse.json({
    artistCount: artistRows.length,
    subgenreCount: subgenreRows.length,
  });
}

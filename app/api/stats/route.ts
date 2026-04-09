import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export async function GET() {
  const authed = await getCurrentUser();
  const user =
    authed ??
    (await prisma.user.findFirst({ where: { tracks: { some: {} } } }));

  if (!user) {
    return NextResponse.json({ artistCount: 0, subgenreCount: 0 });
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

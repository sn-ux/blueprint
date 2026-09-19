/**
 * Who has re-granted the two behavioural scopes, and who has not.
 *
 * The scope string is written by the NextAuth adapter at sign-in and is not
 * touched by a token refresh, so this is the honest answer to "did that
 * reauthorization actually take?". Read-only.
 */
import { prisma } from "../../lib/prisma.ts";

const NEEDED = ["user-top-read", "user-read-recently-played"];

const users = await prisma.user.findMany({
  where: { tracks: { some: {} } },
  select: {
    id: true, name: true, midvaleHidden: true,
    accounts: {
      where: { provider: "spotify" },
      select: { scope: true, expires_at: true, access_token: true },
    },
    _count: { select: { tracks: true, topArtists: true, topTracks: true, plays: true } },
  },
  orderBy: { name: "asc" },
});

for (const u of users) {
  const a = u.accounts[0];
  const scopes = (a?.scope ?? "").split(/\s+/).filter(Boolean);
  const missing = NEEDED.filter((s) => !scopes.includes(s));
  const mark = !a?.access_token ? "NO TOKEN" : missing.length ? "needs reauth" : "granted";
  console.log(
    `${(u.name ?? u.id.slice(0, 8)).padEnd(16)} ${mark.padEnd(13)}` +
    `${u.midvaleHidden ? " [hidden]" : ""}` +
    `  songs ${String(u._count.tracks).padStart(6)}` +
    `  topArtists ${String(u._count.topArtists).padStart(4)}` +
    `  topTracks ${String(u._count.topTracks).padStart(4)}` +
    `  plays ${String(u._count.plays).padStart(5)}`,
  );
  if (missing.length && a?.access_token) console.log(`${"".padEnd(16)} missing: ${missing.join(", ")}`);
}

await prisma.$disconnect();

/**
 * Pull top artists, top tracks and recently played for one person or everyone.
 *
 *   npx tsx scripts/lab/collect-signals.mjs            every library
 *   npx tsx scripts/lab/collect-signals.mjs Manish     one, by name
 *
 * This is the same collectSignals the sync's last stage calls, run on its own
 * so a library does not have to be re-imported to fill the signal tables. It
 * writes only TopArtist, TopTrack and PlayEvent. Track is never opened.
 */
import { collectSignals } from "../../lib/spotify-signals.ts";
import { prisma } from "../../lib/prisma.ts";

const who = process.argv[2];

const users = await prisma.user.findMany({
  where: {
    tracks: { some: {} },
    ...(who ? { name: { contains: who, mode: "insensitive" } } : {}),
  },
  select: { id: true, name: true },
  orderBy: { name: "asc" },
});

if (!users.length) {
  console.log(who ? `no library matches "${who}"` : "no libraries");
  process.exit(0);
}

const before = await prisma.track.count();

for (const u of users) {
  const r = await collectSignals(u.id);
  console.log(
    `${(u.name ?? u.id.slice(0, 8)).padEnd(16)} ` +
    `topArtists ${String(r.topArtists).padStart(4)}  topTracks ${String(r.topTracks).padStart(4)}  ` +
    `plays +${String(r.plays).padStart(3)} (${r.playsAlreadyKnown} already known)` +
    `${r.skipped ? `  — ${r.skipped}` : ""}`,
  );
}

const after = await prisma.track.count();
console.log(`\nlibrary rows ${before} -> ${after}${before === after ? " (untouched)" : "  ** CHANGED **"}`);

await prisma.$disconnect();

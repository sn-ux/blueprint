/** What one fresh recommendation session actually costs the database. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let queries = 0, dbMs = 0;
const seen = [];
prisma.$on("query", (e) => {
  queries++;
  dbMs += e.duration;
  seen.push(`${e.duration}ms  ${e.query.slice(0, 80)}`);
});

const t0 = Date.now();
const people = await prisma.user.findMany({
  where: { midvaleHidden: false, tracks: { some: {} } },
  select: { id: true, name: true, image: true },
});
const tracks = await prisma.track.findMany({
  where: { user: { midvaleHidden: false } },
  select: {
    userId: true, spotifyId: true, name: true, artist: true, album: true,
    imageUrl: true, artistId: true, artistImageUrl: true,
    blueprintWorld: true, blueprintSubgenre: true,
    albumId: true, albumTotalTracks: true, trackNumber: true, discNumber: true, albumType: true,
  },
});
const loadMs = Date.now() - t0;
const bytes = Buffer.byteLength(JSON.stringify(tracks), "utf8");

console.log(`people        ${people.length} rows`);
console.log(`tracks        ${tracks.length.toLocaleString()} rows`);
console.log(`payload       ${(bytes / 1e6).toFixed(2)} MB as JSON  (~${Math.round(bytes / tracks.length)} bytes/row)`);
console.log(`queries       ${queries}`);
console.log(`db time       ${dbMs}ms`);
console.log(`load latency  ${loadMs}ms`);
for (const q of seen) console.log(`   ${q}`);

// What a fingerprint would cost instead.
const t1 = Date.now();
const fp = await prisma.track.groupBy({ by: ["userId"], _count: { _all: true }, _max: { id: true } });
console.log(`\nfingerprint   ${fp.length} rows in ${Date.now() - t1}ms  (${Buffer.byteLength(JSON.stringify(fp))} bytes)`);
await prisma.$disconnect();

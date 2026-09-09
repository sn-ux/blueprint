/**
 * Full-feed validation. Runs every invariant over every card and every
 * deliverable track — not a sample.
 *
 *   node --import ./scripts/register.mjs scripts/validate-feed.mjs --user <id>
 */
import { PrismaClient } from "@prisma/client";
import { buildFeed, deliverablesOf, toFeedCard } from "../lib/discovery/feed.ts";
import { SONG_SET_MAX, SONG_SET_MIN } from "../lib/discovery/types.ts";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; };
const userId = arg("--user", "cmown82yw0000l404njt51be8");

const prisma = new PrismaClient();
const mine = new Set((await prisma.track.findMany({
  where: { userId }, select: { spotifyId: true },
})).map((t) => t.spotifyId));
const albumIdByTrack = new Map();
const artistByTrack = new Map();
for (const t of await prisma.track.findMany({
  select: { spotifyId: true, albumId: true, artist: true },
})) {
  if (t.albumId && !albumIdByTrack.has(t.spotifyId)) albumIdByTrack.set(t.spotifyId, t.albumId);
  if (!artistByTrack.has(t.spotifyId)) artistByTrack.set(t.spotifyId, t.artist);
}
await prisma.$disconnect();

const result = await buildFeed(userId, 100);
const { index, feed, all, rejected } = result;

let pass = 0, fail = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (ok) pass++; else fail++;
};
const tally = (xs, f) => { const m = new Map(); for (const x of xs) m.set(f(x), (m.get(f(x)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };

console.log(`viewer ${index.viewer.name}   |U| ${index.U.size}   |D| ${index.D.length}`);
console.log(`candidates ${all.length}   feed ${feed.length}\n`);

console.log("── inventory ──");
for (const [k, v] of tally(all, (c) => c.cardType)) console.log(`  ${String(k).padEnd(12)} ${v}`);
console.log("  by generator:");
for (const [k, v] of tally(all, (c) => c.generator)) console.log(`    ${String(k).padEnd(24)} ${v}`);
console.log("  by anchor:");
for (const [k, v] of tally(all, (c) => c.anchor?.type ?? "NONE")) console.log(`    ${String(k).padEnd(24)} ${v}`);

console.log("\n── rejections ──");
for (const [k, v] of tally(rejected, (r) => r.reasonCode)) console.log(`  ${String(k).padEnd(30)} ${v}`);

console.log("\n── invariants over the WHOLE feed ──");
const cards = feed.map((c) => toFeedCard(index, c));
check("no card is a single song", !cards.some((c) => c.cardType === "SONG"));
check("every card is one of the five allowed types",
  cards.every((c) => ["SONG_SET", "ALBUM", "ARTIST", "SUBGENRE", "GENRE"].includes(c.cardType)));
check("every card has a recipient anchor", feed.every((c) => !!c.anchor));
check("every card has at least two independent sources",
  feed.every((c) => c.sourceFriendIds.length >= 2),
  `min ${Math.min(...feed.map((c) => c.sourceFriendIds.length))}`);

let leaked = 0, totalTracks = 0, artistBad = 0, albumBad = 0, setTooSmall = 0, setTooBig = 0, promiseBad = 0;
const artistImages = { have: 0, missing: 0 };
const albumImages = { have: 0, missing: 0 };

for (const c of feed) {
  const tracks = deliverablesOf(index, c);
  totalTracks += tracks.length;
  for (const t of tracks) if (mine.has(t.spotifyId)) leaked++;

  if (c.subject.type === "Artist") {
    const wrong = tracks.filter((t) => artistByTrack.get(t.spotifyId) !== c.subject.artist);
    if (wrong.length) { artistBad++; console.log(`    ARTIST MISMATCH ${c.subject.artist}: ${wrong.length}`); }
    if (toFeedCard(index, c).subjectImageUrl) artistImages.have++; else artistImages.missing++;
  }
  if (c.subject.type === "Album") {
    const wrong = tracks.filter((t) => albumIdByTrack.get(t.spotifyId) !== c.albumId);
    if (wrong.length) { albumBad++; console.log(`    ALBUM MISMATCH ${c.subject.album}: ${wrong.length}`); }
    if (toFeedCard(index, c).subjectImageUrl) albumImages.have++; else albumImages.missing++;
  }
  if (c.cardType === "SONG_SET") {
    if (tracks.length < SONG_SET_MIN) setTooSmall++;
    if (tracks.length > SONG_SET_MAX) setTooBig++;
  }
  if (c.winningClaim) {
    const promised = c.deliverableCount;
    if (tracks.length !== promised) { promiseBad++; console.log(`    PROMISE MISMATCH "${c.caption}": says ${promised}, page ${tracks.length}`); }
  }
}

check("no deliverable track anywhere is already in the library", leaked === 0,
  `${totalTracks} tracks checked across ${feed.length} pages`);
check("every ARTIST page contains only that artist's tracks", artistBad === 0);
check("every ALBUM page contains only that albumId's tracks", albumBad === 0);
check(`every SONG_SET holds ${SONG_SET_MIN}–${SONG_SET_MAX} tracks`, setTooSmall === 0 && setTooBig === 0);
check("caption promise equals page contents everywhere", promiseBad === 0);
console.log(`  artist cards with an image: ${artistImages.have}/${artistImages.have + artistImages.missing}`);
console.log(`  album cards with artwork:   ${albumImages.have}/${albumImages.have + albumImages.missing}`);

console.log("\n── top 30 ──");
for (const c of feed.slice(0, 30)) {
  const a = c.anchor;
  console.log(`${String(c.feedRank).padStart(3)}. [${c.cardType.padEnd(9)}] ${c.caption}`);
  console.log(`      anchor ${a.type} "${a.entityName}" owned=${a.ownedCount}   sources ${c.sourceFriendNames.join(", ")}   delivers ${c.deliverableCount}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

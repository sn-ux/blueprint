/**
 * Full-feed validation. Every invariant over every candidate and every
 * deliverable track — not a sample.
 *
 *   node --import ./scripts/register.mjs scripts/validate-feed.mjs --user <id>
 */
import { PrismaClient } from "@prisma/client";
import { concentrationOf } from "../lib/discovery/aperture.ts";
import { APERTURE, REDUNDANCY } from "../lib/discovery/config.ts";
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
for (const t of await prisma.track.findMany({ select: { spotifyId: true, albumId: true, artist: true } })) {
  if (t.albumId && !albumIdByTrack.has(t.spotifyId)) albumIdByTrack.set(t.spotifyId, t.albumId);
  if (!artistByTrack.has(t.spotifyId)) artistByTrack.set(t.spotifyId, t.artist);
}
await prisma.$disconnect();

const t0 = Date.now();
const result = await buildFeed(userId, 30);
const { index, feed, all, rejected, redundancy } = result;
const ms = Date.now() - t0;

let pass = 0, fail = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (ok) pass++; else fail++;
};
const tally = (xs, f) => { const m = new Map(); for (const x of xs) m.set(f(x), (m.get(f(x)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
const pct = (x) => `${Math.round(x * 100)}%`;

console.log(`viewer ${index.viewer.name}   |U| ${index.U.size}   |D| ${index.D.length}   engine ${ms}ms`);
console.log(`eligible universe ${all.length} cards\n`);

// ── SECTION 1 · SONG_SET aperture ──────────────────────────────────────────
console.log("═══ SECTION 1 — SONG_SET APERTURE ═══");
console.log(`dominantShare ${APERTURE.dominantShare}  dominantGenreShare ${APERTURE.dominantGenreShare}`);
const setCandidates = rejected.filter((r) => r.stage === "aperture");
const songSets = all.filter((c) => c.cardType === "SONG_SET");

// Every candidate a generator emitted as a multi-track set, and where it went.
const resolvedSets = all.filter((c) => c.generator === "CONSENSUS_IN_LANE");
const collapsedSets = rejected.filter((r) => r.stage === "collapse" && r.generator === "CONSENSUS_IN_LANE");
console.log(`\nmulti-track sets emitted by generators: ${resolvedSets.length + collapsedSets.length + setCandidates.length}`);
for (const c of resolvedSets) {
  const k = c.concentration ?? concentrationOf(index, c.deliverableIds ?? []);
  console.log(`  ${(c.recommendationKey ?? "").slice(0, 10)}  "${c.subject.type === "Subgenre" ? c.subject.subgenre : c.subjectKey}"`);
  console.log(`      generator ${c.generator}  delivers ${c.deliverableCount}  grouping ${c.groupingReason.kind}/${c.groupingReason.entity ?? c.groupingReason.relation}`);
  console.log(`      concentration  album ${pct(k.album)}  artist ${pct(k.artist)}  subgenre ${pct(k.subgenre)}  genre ${pct(k.genre)}`);
  console.log(`      survives as SONG_SET: no → ${c.cardType}   (${c.apertureNote})`);
}
for (const r of collapsedSets) {
  console.log(`  ${r.subjectKey}`);
  console.log(`      generator ${r.generator}  grouping TAXONOMIC/SUBGENRE`);
  console.log(`      survives as SONG_SET: no → SUBGENRE, then folded into the lane's own card (${r.detail})`);
}
for (const r of setCandidates) console.log(`  ${r.generator} ${r.subjectKey} → dropped (${r.detail})`);
check("no SONG_SET survives on a taxonomic grouping reason",
  songSets.every((c) => c.groupingReason.kind === "STRUCTURAL"),
  `${songSets.length} SONG_SET in the universe`);

console.log("\n── cross-card redundancy ──");
console.log(`containment >= ${REDUNDANCY.containment}, shared >= ${REDUNDANCY.minShared}`);
if (redundancy.length === 0) console.log("  no high-overlap card pairs");
for (const p of redundancy) {
  console.log(`  [${p.keptType}] ${p.keptSubject}  ←  dropped [${p.droppedType}] ${p.droppedSubject}`
    + `   shared ${p.shared} (${pct(p.containment)}), resolved by ${p.resolvedBy}`);
}

// ── SECTION 3 · inventory ──────────────────────────────────────────────────
console.log("\n═══ SECTION 3 — FEED INVENTORY ═══");
for (const t of ["ARTIST", "ALBUM", "SUBGENRE", "GENRE", "SONG_SET"]) {
  console.log(`  ${t.padEnd(10)} ${all.filter((c) => c.cardType === t).length}`);
}
console.log("  by generator:");
for (const [k, v] of tally(all, (c) => c.generator)) console.log(`    ${String(k).padEnd(24)} ${v}`);
console.log("  by anchor:");
for (const [k, v] of tally(all, (c) => c.anchor?.type ?? "NONE")) console.log(`    ${String(k).padEnd(24)} ${v}`);
console.log("  by quality band:");
for (const [k, v] of tally(all, (c) => c.qualityBand)) console.log(`    ${String(k).padEnd(24)} ${v}`);
console.log("  rejections:");
for (const [k, v] of tally(rejected, (r) => r.reasonCode)) console.log(`    ${String(k).padEnd(32)} ${v}`);

// ── SECTION 6 · correctness ────────────────────────────────────────────────
console.log("\n═══ SECTION 6 — CORRECTNESS (every candidate, every deliverable) ═══");
const cards = all.map((c) => toFeedCard(index, c));
check("zero SONG cards", !cards.some((c) => c.cardType === "SONG"));
check("every card is one of the five allowed types",
  cards.every((c) => ["SONG_SET", "ALBUM", "ARTIST", "SUBGENRE", "GENRE"].includes(c.cardType)));
check("every candidate has a recipient anchor", all.every((c) => !!c.anchor));
check("every candidate has at least two independent sources",
  all.every((c) => c.sourceFriendIds.length >= 2),
  `min ${Math.min(...all.map((c) => c.sourceFriendIds.length))}`);

let leaked = 0, totalTracks = 0, artistBad = 0, albumBad = 0, setBad = 0, promiseBad = 0, keyBad = 0;
const keys = new Set();
const artistImages = { have: 0, missing: 0 };
const albumImages = { have: 0, missing: 0 };

for (const c of all) {
  const tracks = deliverablesOf(index, c);
  totalTracks += tracks.length;
  for (const t of tracks) if (mine.has(t.spotifyId)) leaked++;

  if (!c.recommendationKey || keys.has(c.recommendationKey)) keyBad++;
  keys.add(c.recommendationKey);

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
  if (c.cardType === "SONG_SET" && (tracks.length < SONG_SET_MIN || tracks.length > SONG_SET_MAX)) setBad++;
  if (c.winningClaim && tracks.length !== c.deliverableCount) {
    promiseBad++;
    console.log(`    PROMISE MISMATCH "${c.caption}": says ${c.deliverableCount}, page ${tracks.length}`);
  }
}

check("no deliverable track anywhere is already in the library", leaked === 0,
  `${totalTracks} tracks checked across ${all.length} pages`);
check("every ARTIST page contains only that artist's tracks", artistBad === 0);
check("every ALBUM page contains only that albumId's tracks", albumBad === 0);
check(`every SONG_SET holds ${SONG_SET_MIN}–${SONG_SET_MAX} tracks`, setBad === 0);
check("caption promise equals page contents everywhere", promiseBad === 0);
check("every card carries a unique stable recommendation key", keyBad === 0);
check("taxonomy display labels are formatted",
  cards.filter((c) => c.cardType === "SUBGENRE" || c.cardType === "GENRE")
    .every((c) => !/^[a-z]/.test(c.title)));

// C1 — no card may be anchored more loosely than the viewer's library allows.
const loose = [];
for (const c of all) {
  const a = c.anchor;
  if (!a) continue;
  if (c.subject.type === "Album" && a.type !== "ALBUM_PARTIAL"
    && (index.viewerByAlbumId.get(c.albumId ?? "") ?? 0) > 0) {
    loose.push(`ALBUM ${c.subject.album} anchored ${a.type} while the viewer holds part of it`);
  }
  if (c.subject.type === "Artist" && a.type !== "ARTIST_PRESENT"
    && (index.viewerByArtist.get(c.subject.artist) ?? 0) > 0) {
    loose.push(`ARTIST ${c.subject.artist} anchored ${a.type} while the viewer holds ${index.viewerByArtist.get(c.subject.artist)} of their tracks`);
  }
  if (c.subject.type === "Subgenre" && a.type === "PARENT_GENRE_PRESENT"
    && (index.viewerByLane.get(c.subject.subgenre) ?? 0) > 0) {
    loose.push(`SUBGENRE ${c.subject.subgenre} anchored at its parent while the viewer is present in the lane`);
  }
}
check("every card uses the most specific recipient anchor its library supports",
  loose.length === 0, loose.slice(0, 3).join(" | "));

// No caption may assert a preference rather than a set relationship.
const BANNED = /\b(you love|you like|you're into|you are into|you prefer|your taste|matches your|you'll like|you will like|people with your)\b/i;
const offending = cards.filter((c) => BANNED.test(c.caption));
check("no caption claims a preference rather than a library relationship",
  offending.length === 0, offending.map((c) => c.caption).join(" | "));

console.log(`  artist cards with an image: ${artistImages.have}/${artistImages.have + artistImages.missing}`);
console.log(`  album cards with artwork:   ${albumImages.have}/${albumImages.have + albumImages.missing}`);

// ── SECTION 7 · what a fresh viewer sees ───────────────────────────────────
console.log("\n═══ SECTION 7 — TOP OF THE FEED (composed, fresh state) ═══");
for (const c of feed) {
  const a = c.anchor;
  console.log(`${String(c.feedRank).padStart(3)}. [${(c.cardType ?? "?").padEnd(9)}] ${c.caption}`);
  console.log(`      ${(c.recommendationKey ?? "").slice(0, 10)}  anchor ${a.type} "${a.entityName}" owned=${a.ownedCount} spec=${a.specificity}`);
  console.log(`      evidence ${c.evidenceStrength.toFixed(2)}  attention ${c.attentionValue.toFixed(2)}  base ${(c.baseRankingScore ?? 0).toFixed(3)}  sources ${c.sourceFriendNames.join(", ")}  delivers ${c.deliverableCount}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/**
 * Full-feed validation. Every invariant over every candidate and every
 * deliverable track — not a sample.
 *
 *   node --import ./scripts/register.mjs scripts/validate-feed.mjs --user <id>
 */
import { PrismaClient } from "@prisma/client";
import { concentrationOf } from "../lib/discovery/aperture.ts";
import { APERTURE, CONSENSUS_SET, MIN_SOURCES_PER_TRACK as CFG_MIN_SOURCES_PER_TRACK, REDUNDANCY } from "../lib/discovery/config.ts";
import { buildFeed, deliverablesOf, toFeedCard } from "../lib/discovery/feed.ts";
import { label } from "../lib/discovery/display.ts";
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
const { index, feed, all, rejected, redundancy, coexisting } = result;
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
console.log(`album/artist dominance ${APERTURE.dominantShare}   selection must be <= ${CONSENSUS_SET.maxShareOfScope} of its scope`
  + `   holder floor ${CONSENSUS_SET.minHolders}`);
const setCandidates = rejected.filter((r) => r.stage === "aperture");
const songSets = all.filter((c) => c.cardType === "SONG_SET");
const emitted = all.filter((c) => c.generator === "CONSENSUS_SET");
const collapsed = rejected.filter((r) => r.generator === "CONSENSUS_SET" && r.stage !== "aperture");

console.log(`\nCONSENSUS_SET emitted ${emitted.length + setCandidates.filter((r) => r.generator === "CONSENSUS_SET").length + collapsed.length}, surviving as SONG_SET: ${songSets.length}`);
for (const c of emitted) {
  const g = c.groupingReason;
  const k = c.concentration ?? concentrationOf(index, c.deliverableIds ?? []);
  const holders = (c.deliverableIds ?? []).map((id) => index.holders.get(id)?.length ?? 0);
  const avg = holders.reduce((a, b) => a + b, 0) / Math.max(1, holders.length);
  const lanes = new Set((c.deliverableIds ?? []).map((id) => index.meta.get(id)?.subgenre));
  const artists = new Set((c.deliverableIds ?? []).map((id) => index.meta.get(id)?.artist));
  console.log(`  ${(c.recommendationKey ?? "").slice(0, 10)}  "${c.subject.title}"   [${c.cardType}]`);
  console.log(`      scope ${g.scope.entity} ${g.scope.key}   broad corroborated inventory ${g.rule.scopeInventory}   qualifying ${g.rule.qualifying}   delivers ${c.deliverableCount}`);
  console.log(`      rule ${g.rule.id} threshold ${g.rule.threshold}   holders min ${Math.min(...holders)} avg ${avg.toFixed(2)} max ${Math.max(...holders)}`);
  console.log(`      spans ${lanes.size} lanes, ${artists.size} artists   concentration album ${pct(k.album)} artist ${pct(k.artist)} subgenre ${pct(k.subgenre)} genre ${pct(k.genre)}`);
  console.log(`      anchor ${c.anchor.type} "${c.anchor.entityName}" owned=${c.anchor.ownedCount}`);
  console.log(`      caption  ${c.caption}`);
  const area = all.find((x) => (x.cardType === "SUBGENRE" || x.cardType === "GENRE")
    && (x.subject.type === "Subgenre" ? x.subject.subgenre : x.subject.type === "Genre" ? x.subject.genre : "") === g.scope.key);
  if (area) {
    const shared = (c.deliverableIds ?? []).filter((id) => (area.deliverableIds ?? []).includes(id)).length;
    console.log(`      area card  ${area.caption}`);
    console.log(`      overlap with it: ${shared}/${c.deliverableCount}`);
  } else {
    console.log(`      area card  none on the feed for ${g.scope.key}`);
  }
  console.log(`      decision  SONG_SET${area ? " and the area card, both" : ""}   (${c.apertureNote})`);
}
for (const r of setCandidates) console.log(`  ${r.generator} ${r.subjectKey} → no card (${r.detail})`);
for (const r of collapsed) console.log(`  ${r.subjectKey} → dropped at ${r.stage} (${r.detail})`);

// Each rule kind has its own bar for being stronger than a bare scope.
const ruleHolds = (c) => {
  if (c.groupingReason.kind !== "SELECTED") return false;
  const r = c.groupingReason.rule;
  if (r.id === "MIN_INDEPENDENT_HOLDERS") return r.threshold > CFG_MIN_SOURCES_PER_TRACK;
  if (r.id === "MULTI_SOURCE_DEPTH") return r.threshold >= 2;
  return false;
};
check("every SONG_SET carries a selection rule, not just a scope",
  songSets.every(ruleHolds),
  `${songSets.length} SONG_SET; rules ${[...new Set(songSets.map((c) => c.groupingReason.rule.id))].join(", ")}`);

// A set drawn from territory the viewer occupies must be materially smaller
// than the area card that already covers it. Territory they have nothing in
// has no such card, so there is nothing for it to be smaller than.
const occupied = songSets.filter((c) => (index.viewerByLane.get(c.groupingReason.scope.key) ?? 0) > 0
  || (index.viewerByWorld.get(c.groupingReason.scope.key) ?? 0) > 0);
check("a set inside territory you occupy is materially smaller than it",
  occupied.every((c) => c.deliverableCount < c.groupingReason.rule.scopeInventory / 2),
  occupied.map((c) => `${c.deliverableCount} of ${c.groupingReason.rule.scopeInventory}`).join(", ") || "none");
check("a set in new territory hands over a startable dozen",
  songSets.filter((c) => !occupied.includes(c))
    .every((c) => c.deliverableCount >= 12 && c.deliverableCount <= 15),
  `${songSets.length - occupied.length} new-territory sets`);

console.log("\n── cross-card redundancy ──");
console.log(`containment >= ${REDUNDANCY.containment}, shared >= ${REDUNDANCY.minShared}`);
if (redundancy.length === 0) console.log("  collapsed: none");
for (const p of redundancy) {
  console.log(`  collapsed  [${p.keptType}] ${p.keptSubject}  ←  [${p.droppedType}] ${p.droppedSubject}`
    + `   shared ${p.shared} (${pct(p.containment)}), resolved by ${p.resolvedBy}`);
}
console.log(`  overlapping pairs kept as distinct propositions: ${coexisting.length}`);
for (const p of coexisting.slice(0, 12)) {
  console.log(`    ${p.a}  ∥  ${p.b}   shared ${p.shared} (${pct(p.containment)})`);
  console.log(`      differ on: ${p.distinct.join(", ")}`);
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
console.log("  by world:");
for (const [k, v] of tally(all, (c) => c.genre ?? "—")) {
  const types = tally(all.filter((c) => (c.genre ?? "—") === k), (c) => c.cardType);
  console.log(`    ${String(k).padEnd(32)} ${String(v).padStart(3)}   ${types.map(([t, n]) => `${t}:${n}`).join(" ")}`);
}
console.log("  stacked vs standalone:");
const stacked = all.filter((c) => c.reasonCodes.includes("STACKED")).length;
console.log(`    stacked (2+ facts)             ${stacked}`);
console.log(`    standalone                     ${all.length - stacked}`);
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

// ── Title and recipient context ────────────────────────────────────────────
check("every card has a non-empty subject title",
  cards.every((c) => typeof c.title === "string" && c.title.trim().length > 0),
  `shortest "${cards.map((c) => c.title).sort((a, b) => a.length - b.length)[0]}"`);

const typesPresent = [...new Set(cards.map((c) => c.cardType))];
check("every CardSubjectType present renders a title",
  typesPresent.every((t) => cards.filter((c) => c.cardType === t).every((c) => c.title.trim())),
  typesPresent.map((t) => `${t}:${cards.filter((c) => c.cardType === t).length}`).join(" "));

// The title must come from the subject, never from the caption.
check("titles are sourced from subject metadata, not caption text",
  all.every((c) => {
    const f = toFeedCard(index, c);
    const s2 = c.subject;
    const expected = s2.type === "Album" ? s2.album
      : s2.type === "Artist" ? s2.artist
      : s2.type === "Subgenre" ? label(s2.subgenre)
      : s2.type === "Genre" ? label(s2.genre)
      : s2.type === "Songs" ? s2.title : null;
    return f.title === expected;
  }));
check("no card's title is a prefix of its own caption",
  cards.every((c) => !c.caption.startsWith(c.title)));

check("every card carries a structured recipient context",
  cards.every((c) => c.recipientContext && c.recipientContext.shortLabel.trim().length > 0));
check("the context line names the card's actual anchor",
  all.every((c) => {
    const f = toFeedCard(index, c);
    return f.recipientContext?.anchorType === c.anchor?.type
      && f.recipientContext?.ownedCount === c.anchor?.ownedCount;
  }));
check("no context line claims a preference",
  cards.every((c) => /^(Already in your library|From .+ in your library)$/.test(c.recipientContext.shortLabel)));

// Feed and detail must be two renderings of one proposition.
check("every card has an expanded detail explanation",
  cards.every((c) => c.detailExplanation.trim().length > 0));
check("the detail explanation states the same deliverable count as the caption",
  all.every((c) => {
    const f = toFeedCard(index, c);
    const n = String(c.deliverableCount);
    const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    const w = c.deliverableCount <= 10 ? words[c.deliverableCount] : n;
    return f.detailExplanation.includes(n) || f.detailExplanation.toLowerCase().includes(w);
  }));
check("the detail explanation names the same subject as the title",
  all.every((c) => {
    const f = toFeedCard(index, c);
    if (c.subject.type === "Songs") return true;
    const key = c.subject.type === "Album" ? c.subject.album
      : c.subject.type === "Artist" ? c.subject.artist
      : c.subject.type === "Subgenre" ? label(c.subject.subgenre) : label(c.subject.genre);
    return f.detailExplanation.includes(key);
  }));

console.log("\n── card hierarchy, first 6 ──");
for (const c of cards.slice(0, 6)) {
  console.log(`  [${c.cardType}]`);
  console.log(`  ${c.title}${c.byline ? `  · ${c.byline}` : ""}`);
  console.log(`  ${c.recipientContext.shortLabel}`);
  console.log(`  ${c.caption}`);
  console.log();
}

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

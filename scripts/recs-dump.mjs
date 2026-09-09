/**
 * Step B — the evaluation harness.
 *
 * Loads real library data, runs the missed-information engine, and writes
 * everything needed to grade it by hand. Built before any generator is tuned,
 * because nothing downstream can be judged without it.
 *
 *   node scripts/recs-dump.mjs --user <id> [--limit 100] [--out ./out]
 *
 * Writes:
 *   candidates.jsonl   every field, every component score, every rejected rationale
 *   grade.csv          the grading sheet — open it, fill the last three columns
 *   exceptional.csv    every EXCEPTIONAL-band candidate, in the feed or not
 *   rejected.jsonl     everything dropped, with reason codes
 *   inventory.txt      the breakdown by generator, band, subject, source, lane
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runEngine } from "../lib/discovery/engine.ts";

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const userId = arg("--user", null);
const limit = Number(arg("--limit", "100"));
const outDir = arg("--out", "./out");
if (!userId) { console.error("--user <id> is required"); process.exit(1); }

const prisma = new PrismaClient();

const people = await prisma.user.findMany({
  where: { midvaleHidden: false, tracks: { some: {} } },
  select: { id: true, name: true, image: true },
});
if (!people.some((p) => p.id === userId)) {
  console.error(`user ${userId} has no tracks or is hidden`); process.exit(1);
}
const tracks = await prisma.track.findMany({
  where: { user: { midvaleHidden: false } },
  select: {
    userId: true, spotifyId: true, name: true, artist: true, album: true,
    blueprintWorld: true, blueprintSubgenre: true,
  },
});
await prisma.$disconnect();

const t0 = Date.now();
const { index, all, feed, rejected, byGenerator } = runEngine(
  { viewerId: userId, people, tracks }, { feedSize: limit },
);
const ms = Date.now() - t0;

mkdirSync(outDir, { recursive: true });

// ── candidates.jsonl ────────────────────────────────────────────────────────
const detail = (c) => ({
  feedRank: c.feedRank ?? null,
  qualityBand: c.qualityBand,
  subject: c.subject,
  subjectType: c.subject.type,
  generator: c.generator,
  discoverySetId: c.discoverySetId,
  setRelationship: c.discoveryExpression,
  caption: c.caption,
  winningClaim: c.winningClaim && {
    claimType: c.winningClaim.claimType,
    proposition: c.winningClaim.proposition,
    templateId: c.winningClaim.templateId,
    score: round(c.winningClaim.score),
    exceptionalness: c.winningClaim.exceptionalness,
    specificity: round(c.winningClaim.specificity),
    socialMeaning: c.winningClaim.socialMeaning,
    simplicity: round(c.winningClaim.simplicity),
    confidence: c.winningClaim.confidence,
  },
  alternativesThatLost: (c.losingClaims ?? []).map((l) => ({
    claimType: l.claimType, text: l.text, score: round(l.score),
  })),
  otherRationalesThatLost: c.secondaryRationales ?? [],
  evidenceStrength: round(c.evidenceStrength),
  attentionValue: round(c.attentionValue),
  baseRankingScore: round(c.baseRankingScore),
  tieBreak: round(c.tieBreak),
  corroborationBonus: round(c.corroborationBonus),
  rankingScore: round(c.rankingScore),
  feedScore: round(c.feedScore),
  componentScores: Object.fromEntries(Object.entries(c.componentScores).map(([k, v]) => [k, round(v)])),
  whyItSurvived: c.reasonCodes,
  evidence: c.evidence,
  friends: c.sourceFriendNames,
  genre: c.genre, subgenre: c.subgenre, artist: c.artist, album: c.album,
});
function round(n) { return typeof n === "number" ? Math.round(n * 1000) / 1000 : n; }

writeFileSync(join(outDir, "candidates.jsonl"),
  feed.map((c) => JSON.stringify(detail(c))).join("\n") + "\n");
writeFileSync(join(outDir, "rejected.jsonl"),
  rejected.map((r) => JSON.stringify(r)).join("\n") + "\n");

// ── grade.csv ───────────────────────────────────────────────────────────────
const esc = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const subjectLabel = (c) => {
  const s = c.subject;
  switch (s.type) {
    case "Song": return `${s.name} — ${s.artist}`;
    case "Album": return `${s.album} — ${s.artist}`;
    case "Artist": return s.artist;
    case "Subgenre": return s.subgenre;
    case "Genre": return s.genre;
    default: return s.label;
  }
};
const GRADE_COLS = [
  "rank", "qualityBand", "subject", "subjectType", "generator", "setRelationship", "caption",
  "winningClaim", "evidenceStrength", "attentionValue", "baseRankingScore",
  "rankingScore", "feedScore", "friends", "genre", "subgenre", "artist", "album",
  "whyItSurvived", "alternativesThatLost",
  "recommendationQuality", "captionQuality", "notes",
];
const gradeRow = (c, rank) => [
  rank, c.qualityBand, subjectLabel(c), c.subject.type, c.generator, c.discoveryExpression, c.caption,
  c.winningClaim?.claimType, round(c.evidenceStrength), round(c.attentionValue),
  round(c.baseRankingScore), round(c.rankingScore), round(c.feedScore),
  c.sourceFriendNames.join(" + "), c.genre, c.subgenre, c.artist, c.album,
  c.reasonCodes.join(" "),
  (c.losingClaims ?? []).map((l) => `${l.claimType}:${round(l.score)}`).join(" | "),
  "", "", "",
].map(esc).join(",");

writeFileSync(join(outDir, "grade.csv"),
  GRADE_COLS.join(",") + "\n" + feed.map((c, i) => gradeRow(c, i + 1)).join("\n") + "\n");

// ── exceptional.csv — nothing strong may be hidden by diversification ───────
const inFeed = new Set(feed.map((c) => c.id));
const exceptional = all.filter((c) => c.qualityBand === "EXCEPTIONAL");
writeFileSync(join(outDir, "exceptional.csv"),
  ["inFeed", ...GRADE_COLS].join(",") + "\n" +
  exceptional
    .sort((a, b) => b.evidenceStrength - a.evidenceStrength)
    .map((c, i) => [esc(inFeed.has(c.id) ? "yes" : "NO"), gradeRow(c, i + 1)].join(","))
    .join("\n") + "\n");

// ── inventory.txt ───────────────────────────────────────────────────────────
const tally = (items, keyFn) => {
  const m = new Map();
  for (const it of items) {
    for (const k of [].concat(keyFn(it) ?? [])) {
      if (k === null || k === undefined) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const band = (v) => {
  if (v >= 0.9) return "0.90–1.00 categorical";
  if (v >= 0.75) return "0.75–0.89 near-categorical";
  if (v >= 0.55) return "0.55–0.74 strong";
  if (v >= 0.35) return "0.35–0.54 solid";
  return "0.30–0.34 weak";
};
const section = (title, rows, width = 46) =>
  `\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}\n` +
  rows.map(([k, v]) => `  ${String(k).padEnd(width)} ${String(v).padStart(6)}`).join("\n");

const rejectTally = tally(rejected, (r) => `${r.reasonCode}`);
const lines = [
  `Blueprint · missed-information engine · evaluation run`,
  `viewer            ${index.viewer.name} (${userId})`,
  `sources           ${index.friends.map((f) => f.name).join(", ")}`,
  `|U|               ${index.U.size.toLocaleString()}`,
  `|D| = F_all − U   ${index.D.length.toLocaleString()}`,
  `candidates        ${all.length.toLocaleString()} after eligibility + collapse`,
  `feed              ${feed.length}`,
  `EXCEPTIONAL       ${exceptional.length} (strong evidence AND high attention)`,
  `engine time       ${ms} ms`,
  section("raw production by generator", [...byGenerator.entries()].sort((a, b) => b[1] - a[1])),
  section("surviving candidates by generator", tally(all, (c) => c.generator)),
  section("feed by generator", tally(feed, (c) => c.generator)),
  section("candidates by recommendation-quality band", tally(all, (c) => c.qualityBand)),
  section("feed by recommendation-quality band", tally(feed, (c) => c.qualityBand)),
  section("per-generator quality bands", tally(all, (c) => `${c.generator} · ${c.qualityBand}`), 52),
  section("candidates by evidenceStrength band", tally(all, (c) => band(c.evidenceStrength))),
  section("candidates by attentionValue band", tally(all, (c) => band(c.attentionValue))),
  section("candidates by subject type", tally(all, (c) => c.subject.type)),
  section("candidates by source", tally(all, (c) => c.sourceFriendNames)),
  section("feed by source", tally(feed, (c) => c.sourceFriendNames)),
  section("candidates by genre", tally(all, (c) => c.genre)),
  section("top subgenres", tally(all, (c) => c.subgenre).slice(0, 15)),
  section("feed by claim type", tally(feed, (c) => c.winningClaim?.claimType)),
  section("rejections by reason", rejectTally),
].join("\n");

writeFileSync(join(outDir, "inventory.txt"), lines + "\n");
console.log(lines);
console.log(`\nwrote ${outDir}/{candidates.jsonl,grade.csv,exceptional.csv,rejected.jsonl,inventory.txt}`);

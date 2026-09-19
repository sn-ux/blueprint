/**
 * The real runtime path: one page of real cards, captions written by the model.
 *
 * Reads ANTHROPIC_API_KEY from the environment or .env.local. Writes nothing.
 *
 *   npx tsx scripts/lab/caption-live.mjs "<user name>" [howMany]
 */
import fs from "fs";
// A plain script does not get Next's env loading, so read .env.local ourselves.
for (const line of (fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
import { startSession } from "../../lib/recommendations/session.ts";
import { loadListener, writeCaptions } from "../../lib/discovery/observe/llm-caption.ts";
import { prisma } from "../../lib/prisma.ts";

const name = process.argv[2] ?? "Surya Nathan";
const want = Number(process.argv[3] ?? 6);
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("No ANTHROPIC_API_KEY. Put it in .env.local and re-run.");
  process.exit(1);
}
const u = await prisma.user.findFirst({ where: { name }, select: { id: true, name: true } });
const built = await startSession(u.id, false);
const who = await loadListener(u.id);
const typeOf = (c) => (c.cardType === "ARTIST" ? "ARTIST" : c.cardType === "ALBUM" ? "ALBUM" : "GENRE");

// a real spread across the three types, taken in rank order
const picked = [];
for (const t of ["ARTIST", "ALBUM", "GENRE"]) {
  picked.push(...built.stored.filter(({ card }) => typeOf(card) === t).slice(0, Math.ceil(want / 3)));
}
const cards = picked.map(({ card }) => ({
  id: card.id, type: typeOf(card), subject: card.title, artist: card.artist,
  lane: typeOf(card) === "GENRE" ? null : (card.subgenre ?? card.genre),
  cardGenres: typeOf(card) === "GENRE" ? []
    : [card.subgenre, card.genre].filter((g) => g && g !== "unknown"),
  anchor: typeOf(card) === "GENRE" && card.subgenre !== "unknown" ? card.subgenre : null,
  years: [card.releaseYearMin, card.releaseYearMax].filter((y) => typeof y === "number"),
}));

const t0 = Date.now();
const written = await writeCaptions(cards, who);
console.log(`\n${u.name} — ${written.size}/${cards.length} captions in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
for (const c of cards) {
  const old = picked.find((p) => p.card.id === c.id).card.caption;
  console.log(`── [${c.type}] ${c.subject}${c.type === "ALBUM" && c.artist ? ` · ${c.artist}` : ""}`);
  console.log(`   BEFORE  ${old}`);
  console.log(`   AFTER   ${written.get(c.id) ?? "(writer skipped it — keeps the built-in prose)"}\n`);
}
await prisma.$disconnect();

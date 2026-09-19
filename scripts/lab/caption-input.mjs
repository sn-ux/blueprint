/**
 * The exact text the writer receives for one card, without making a request.
 *
 *   npx tsx scripts/lab/caption-input.mjs "<user name>"
 */
import { startSession } from "../../lib/recommendations/session.ts";
import { loadListener, contextFor } from "../../lib/discovery/observe/llm-caption.ts";
import { prisma } from "../../lib/prisma.ts";

const name = process.argv[2] ?? "Surya Nathan";
const u = await prisma.user.findFirst({ where: { name }, select: { id: true, name: true } });
const built = await startSession(u.id, false);          // false = do not write a session
const who = await loadListener(u.id);
console.log(`${u.name}: ${built.stored.length} cards in the first page window\n`);

for (const type of ["ARTIST", "ALBUM", "GENRE"]) {
  const hit = built.stored.find(({ card }) => {
    const t = card.cardType === "ARTIST" ? "ARTIST" : card.cardType === "ALBUM" ? "ALBUM" : "GENRE";
    return t === type;
  });
  if (!hit) { console.log(`── ${type}: none in this page\n`); continue; }
  const card = hit.card;
  const cc = {
    id: card.id,
    type,
    subject: card.title,
    artist: card.artist,
    lane: card.subgenre ?? card.genre,
    cardGenres: [card.subgenre, card.genre].filter((g) => g && g !== "unknown"),
    years: [card.releaseYearMin, card.releaseYearMax].filter((y) => typeof y === "number"),
  };
  console.log(`── ${type} ─────────────────────────────────────────────`);
  console.log(contextFor(cc, who));
  console.log(`   [built-in caption now: ${card.caption.slice(0, 110)}…]\n`);
}
await prisma.$disconnect();

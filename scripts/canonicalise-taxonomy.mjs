/**
 * One lane per recording, written back so every screen agrees.
 *
 *   node --import ./scripts/register.mjs scripts/canonicalise-taxonomy.mjs [--apply]
 *
 * The importer tags each row from the artist's genres at the time it ran, so
 * two people can hold the same recording under different lanes. Card
 * generation resolves that by majority vote; the sphere, search and the world
 * routes read the row. The two then disagree about where a track lives, which
 * is the kind of thing that makes a count on one screen contradict a count on
 * another. This writes the vote back to the rows, so there is one answer.
 *
 * Re-runnable and idempotent. It should be run after any import.
 */
import { prisma } from "../lib/prisma.ts";
import { loadCorpus } from "../lib/discovery/corpus.ts";
import { buildReference, workKeyOf } from "../lib/discovery/observe/observe.ts";

const apply = process.argv.includes("--apply");
const { tracks } = await loadCorpus();
const ref = buildReference(tracks);
const edits = [];
for (const t of tracks) {
  const w = ref.works.get(workKeyOf(t.name, t.artist));
  if (!w) continue;
  if (w.subgenre !== t.blueprintSubgenre || w.world !== t.blueprintWorld) {
    edits.push({ userId: t.userId, spotifyId: t.spotifyId, sub: w.subgenre, world: w.world });
  }
}
console.log((apply ? "applying " : "would change ") + edits.length + " rows of " + tracks.length);
if (!apply) { console.log("re-run with --apply"); await prisma.$disconnect(); process.exit(0); }
let done = 0;
for (const e of edits) {
  await prisma.track.updateMany({
    where: { userId: e.userId, spotifyId: e.spotifyId },
    data: { blueprintSubgenre: e.sub, blueprintWorld: e.world },
  });
  done++;
}
console.log("updated " + done + " rows");
await prisma.$disconnect();

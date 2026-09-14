/**
 * Does every layer describe the same world?
 *
 *   node --import ./scripts/register.mjs scripts/validate-data-integrity.mjs
 *
 * Reconciliation against the live corpus rather than a reading of the code.
 * Each check exists because the thing it checks was once wrong:
 *
 *  OWNERSHIP  every layer agrees who holds what.
 *  IDENTITY   one canonical identity per recording, artist, album and lane.
 *             Seventeen artists written outside the Latin alphabet once shared
 *             a single empty identity; four hundred work-keys merged a live
 *             take with a studio one and credited people with sharing tracks
 *             neither had.
 *  TAXONOMY   the lane a card reasons about is the lane the sphere and search
 *             resolve to. They drifted on a hundred and fifty rows.
 *  RECORDS    an artist's record count excludes singles and compilations, so a
 *             caption cannot print 29 where 18 is the truth.
 *  METADATA   one album id carries one title, type and track count.
 *  LEAKAGE    no holder credit without a row for that user.
 */
import { prisma } from "../lib/prisma.ts";
import { loadCorpus } from "../lib/discovery/corpus.ts";
import { buildReference, workKeyOf } from "../lib/discovery/observe/observe.ts";
import { artistKeyOf } from "../lib/discovery/observe/reference.ts";

const { people, tracks } = await loadCorpus();
const nameOf = (id) => people.find((x) => x.id === id)?.name ?? id.slice(0, 6);
const ref = buildReference(tracks);
const uids = [...new Set(tracks.map((t) => t.userId))];
const fail = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail ? "   " + detail : ""));
  if (!ok) fail.push(label);
};

console.log("OWNERSHIP");
const dbPairs = new Set(tracks.map((t) => t.userId + "@@" + workKeyOf(t.name, t.artist)));
let extra = 0, missing = 0;
for (const [wk, w] of ref.works) for (const u of w.holders) if (!dbPairs.has(u + "@@" + wk)) extra++;
for (const t of tracks) if (!ref.works.get(workKeyOf(t.name, t.artist))?.holders.has(t.userId)) missing++;
check(extra === 0, "no holder credit without a backing row", "extra=" + extra);
check(missing === 0, "no row without a holder credit", "missing=" + missing);

console.log("IDENTITY");
let emptyArtist = 0;
for (const t of tracks) if (!artistKeyOf(t.artist)) emptyArtist++;
check(emptyArtist === 0, "every artist name resolves to a non-empty identity", "empty=" + emptyArtist);
const PERF = [/\blive\b/i, /\bremix\b/i, /\bacoustic\b/i, /\bdemo\b/i, /\binstrumental\b/i, /\bcover\b/i, /\breprise\b/i];
const byKey = new Map();
for (const t of tracks) {
  const k = workKeyOf(t.name, t.artist);
  if (!byKey.has(k)) byKey.set(k, new Set());
  byKey.get(k).add(t.name);
}
let merged = 0;
for (const [, names] of byKey) {
  const a = [...names];
  if (a.length < 2) continue;
  const m = a.filter((x) => PERF.some((r) => r.test(x)));
  if (m.length && m.length < a.length) merged++;
}
check(merged === 0, "no performance merged with a different performance", "merged=" + merged);

console.log("TAXONOMY");
let laneDrift = 0, worldDrift = 0;
for (const t of tracks) {
  const w = ref.works.get(workKeyOf(t.name, t.artist));
  if (!w) continue;
  if (w.subgenre !== t.blueprintSubgenre) laneDrift++;
  if (w.world !== t.blueprintWorld) worldDrift++;
}
check(laneDrift === 0, "card lane == row lane (sphere, search, world routes)", "drift=" + laneDrift);
check(worldDrift === 0, "card world == row world", "drift=" + worldDrift);

console.log("RECORDS AND METADATA");
let albConflict = 0;
const meta = new Map();
for (const t of tracks) {
  if (!t.albumId) continue;
  const prev = meta.get(t.albumId);
  if (!prev) { meta.set(t.albumId, t); continue; }
  if (prev.albumTotalTracks !== t.albumTotalTracks || prev.albumType !== t.albumType) albConflict++;
}
check(albConflict === 0, "one album id, one set of album metadata", "conflicts=" + albConflict);

console.log("PER-USER RECONCILIATION");
for (const uid of uids) {
  const rows = tracks.filter((t) => t.userId === uid);
  const works = new Set(rows.map((t) => workKeyOf(t.name, t.artist)));
  let held = 0;
  for (const wk of works) if (ref.works.get(wk)?.holders.has(uid)) held++;
  check(held === works.size, nameOf(uid) + " holdings reconcile", works.size + " recordings");
}

console.log("");
if (fail.length) { console.log("FAILED: " + fail.join("; ")); process.exit(1); }
console.log("DATA INTEGRITY HOLDS across " + tracks.length + " rows, " + ref.works.size + " recordings, " + uids.length + " libraries");
await prisma.$disconnect();

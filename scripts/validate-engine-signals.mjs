/**
 * The four library signals: save recency, artist familiarity, the track floor,
 * and how a reading is paced between new and adjacent ground.
 *
 * Two kinds of check. The pure functions are exercised against hand-built
 * inputs, so their shape is proved without a database in the way. The rest run
 * over the real corpus, because a rule that holds on a fixture and not on
 * twenty-seven thousand rows has not been tested.
 *
 *   node --import ./scripts/register.mjs scripts/validate-engine-signals.mjs [--user <id>]
 */
import { prisma } from "../lib/prisma.ts";
import * as CFG from "../lib/discovery/config.ts";
import { loadCorpus } from "../lib/discovery/corpus.ts";
import { runEngine } from "../lib/discovery/engine.ts";
import { anchorRecency, artistFamiliarity } from "../lib/discovery/recency.ts";
import { noveltyOf, wantedAt } from "../lib/discovery/novelty.ts";
import { dbReady } from "./db-ready.mjs";

let pass = 0, fail = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (ok) pass++; else fail++;
};

const DAY = 86_400_000;
const now = Date.UTC(2026, 0, 1);

// ── 1 · RECENT SAVES MATTER MORE ───────────────────────────────────────────
{
  const index = {
    viewerHasSaveDates: true,
    viewerSavedAtByAlbumId: new Map(),
    viewerSavedAtByArtist: new Map([
      ["Fresh", now - 7 * DAY],
      ["Stale", now - 5 * 365 * DAY],
      ["Middling", now - CFG.RECENCY.halfLifeDays * DAY],
    ]),
    viewerSavedAtByLane: new Map([["a lane", now - 30 * DAY]]),
    viewerSavedAtByWorld: new Map(),
  };
  const at = (artist) => anchorRecency(index, { artist, subgenre: null, genre: null }, now);
  check("a save last week outranks a save five years ago", at("Fresh") > at("Stale"),
    `${at("Fresh").toFixed(3)} vs ${at("Stale").toFixed(3)}`);
  check("one half-life is worth half", Math.abs(at("Middling") - 0.5) < 0.01,
    at("Middling").toFixed(3));
  check("recency is bounded in [0,1]", at("Fresh") <= 1 && at("Stale") >= 0);
  check("an anchor with no date scores zero rather than old",
    at("Never heard of them") === 0);
  check("the tightest dated set wins over a looser one",
    anchorRecency(index, { artist: "Stale", subgenre: "a lane", genre: null }, now)
      === at("Stale"),
    "artist beats lane");
  // The whole term is inert on a library that has never been date-stamped.
  const undated = { ...index, viewerHasSaveDates: false };
  check("a library with no save dates gets no lift anywhere",
    anchorRecency(undated, { artist: "Fresh", subgenre: null, genre: null }, now) === 0);
}

// ── 2 · ARTISTS ALREADY WELL REPRESENTED ARE WEAK EVIDENCE ─────────────────
{
  const meta = new Map([
    ["t1", { artist: "Held a lot" }], ["t2", { artist: "Held a lot" }],
    ["t3", { artist: "Held once" }], ["t4", { artist: "Never held" }],
  ]);
  const index = {
    meta,
    viewerByArtist: new Map([["Held a lot", 25], ["Held once", 1]]),
  };
  const fam = (ids) => artistFamiliarity(index, { deliverableIds: ids });
  check("a page of a well-held artist is fully familiar", fam(["t1", "t2"]) === 1,
    fam(["t1", "t2"]).toFixed(2));
  check("a page of artists absent from the library is not familiar at all",
    fam(["t4"]) === 0);
  check("an artist held once costs nothing", fam(["t3"]) === 0);
  check("a mixed page lands in between", fam(["t1", "t4"]) === 0.5);
  check("familiarity is a bounded fraction",
    [["t1"], ["t3"], ["t4"], []].every((ids) => fam(ids) >= 0 && fam(ids) <= 1));
  check("the setback is strong enough to matter against the selection band",
    CFG.FAMILIAR_ARTIST.max > CFG.FEED.selectionBand,
    `${CFG.FAMILIAR_ARTIST.max} vs ${CFG.FEED.selectionBand}`);
}

// ── 4a · NEW vs ADJACENT is set containment, and nothing else ──────────────
{
  const index = {
    viewerByArtist: new Map([["Held", 3]]),
    viewerByAlbumId: new Map([["album-held", 2]]),
    viewerByLane: new Map([["held lane", 9]]),
    viewerByWorld: new Map([["held world", 40]]),
  };
  const nov = (subject, albumId) => noveltyOf(index, { subject, albumId });
  check("an artist in the library is adjacent",
    nov({ type: "Artist", artist: "Held" }) === "ADJACENT");
  check("an artist absent from it is new",
    nov({ type: "Artist", artist: "Stranger" }) === "NEW");
  check("a record partly held is adjacent",
    nov({ type: "Album", artist: "x", album: "y" }, "album-held") === "ADJACENT");
  check("a lane never entered is new",
    nov({ type: "Subgenre", subgenre: "unentered" }) === "NEW");
  check("an empty library makes everything new",
    noveltyOf({ viewerByArtist: new Map(), viewerByAlbumId: new Map(),
      viewerByLane: new Map(), viewerByWorld: new Map() },
    { subject: { type: "Artist", artist: "Held" } }) === "NEW");

  const P = CFG.FEED.novelty;
  check("the opening seven slots ask for the stated pattern",
    [0, 1, 2, 3, 4, 5, 6].map((i) => wantedAt(i, 0, i, P)).join(",")
      === P.pattern.join(","),
    P.pattern.join(" "));
  check("a reading short of new ground asks for new ground",
    wantedAt(20, 10, 20, P) === "NEW");
  check("a reading past the target asks for adjacent",
    wantedAt(20, 19, 20, P) === "ADJACENT");
  check("a reading at the target asks for nothing",
    wantedAt(20, Math.round(20 * P.target), 20, P) === null);
}

// ── Over the real corpus ───────────────────────────────────────────────────
const ui = process.argv.indexOf("--user");
const userId = ui > -1 ? process.argv[ui + 1] : "cmown82yw0000l404njt51be8";

if (!(await dbReady(prisma))) {
  console.log("database unreachable — stopping cleanly");
  await prisma.$disconnect();
  process.exit(1);
}

const { people, tracks } = await loadCorpus();
const r = runEngine({ viewerId: userId, people, tracks }, { feedSize: 100, seed: "signals" });

// ── 3 · THE TRACK FLOOR ────────────────────────────────────────────────────
const short = r.all.filter((c) =>
  !CFG.MIN_DELIVERABLE_EXEMPT.includes(c.cardType) && c.deliverableCount < CFG.MIN_DELIVERABLE);
check(`no card outside ${CFG.MIN_DELIVERABLE_EXEMPT.join("/")} shows fewer than ${CFG.MIN_DELIVERABLE} tracks`,
  short.length === 0,
  short.length ? short.slice(0, 3).map((c) => `${c.cardType} ${c.subjectKey}=${c.deliverableCount}`).join(", ")
    : `${r.all.length} cards`);
check("a page's count equals what it will actually hand over",
  r.all.every((c) => c.deliverableCount === (c.deliverableIds ?? []).length));
const floored = r.rejected.filter((x) => x.reasonCode === "BELOW_TRACK_MINIMUM");
check("short candidates are suppressed rather than padded", floored.length > 0,
  `${floored.length} suppressed`);
check("nothing suppressed by the floor came back through another stage",
  !r.all.some((c) => floored.some((f) => f.subjectKey === c.subjectKey
    && !CFG.MIN_DELIVERABLE_EXEMPT.includes(c.cardType) && c.deliverableCount < CFG.MIN_DELIVERABLE)));

// ── 1b · recency actually moves the real order ─────────────────────────────
check("the corpus carries real save dates", r.index.viewerHasSaveDates,
  `${tracks.filter((t) => t.userId === userId && t.savedAt).length} dated rows`);
{
  // The same run with the dates removed. Nothing else differs, so any change
  // in the order is this signal and only this signal.
  const undated = tracks.map((t) => (t.userId === userId ? { ...t, savedAt: null } : t));
  const r2 = runEngine({ viewerId: userId, people, tracks: undated }, { feedSize: 100, seed: "signals" });
  check("with no dates the term is inert", !r2.index.viewerHasSaveDates
    && r2.all.every((c) => (c.anchorRecency ?? 0) === 0));
  const rankIn = (res) => new Map(res.all.map((c, i) => [c.recommendationKey, i]));
  const a = rankIn(r), b = rankIn(r2);
  const shared = [...a.keys()].filter((k) => b.has(k));
  const moved = shared.filter((k) => a.get(k) !== b.get(k));
  check("save recency changes where cards sit", moved.length > 0,
    `${moved.length} of ${shared.length} cards moved`);
  // Freshest-anchored cards should on average be higher with dates than without.
  const fresh = r.all.filter((c) => (c.anchorRecency ?? 0) > 0.5).map((c) => c.recommendationKey);
  const before = fresh.reduce((s, k) => s + (b.get(k) ?? 0), 0) / Math.max(1, fresh.length);
  const after = fresh.reduce((s, k) => s + (a.get(k) ?? 0), 0) / Math.max(1, fresh.length);
  check("recently-saved territory rises", after < before,
    `mean rank ${after.toFixed(1)} with dates, ${before.toFixed(1)} without (${fresh.length} cards)`);
}

// ── 2b · familiar artists really do sink ───────────────────────────────────
{
  const rankOf = new Map(r.all.map((c, i) => [c, i]));
  const familiar = r.all.filter((c) => (c.artistFamiliarity ?? 0) >= 0.5);
  const strangers = r.all.filter((c) => (c.artistFamiliarity ?? 0) === 0);
  const mean = (xs) => xs.reduce((s, c) => s + rankOf.get(c), 0) / Math.max(1, xs.length);
  check("cards made of well-held artists rank below cards made of new ones",
    familiar.length > 0 && mean(familiar) > mean(strangers),
    `mean rank ${mean(familiar).toFixed(0)} vs ${mean(strangers).toFixed(0)} of ${r.all.length}`);
  check("the setback is a cost, not a gate — such cards still exist",
    familiar.length > 0, `${familiar.length} still eligible`);
}

// ── 4b · the real reading is paced ─────────────────────────────────────────
{
  const seq = r.feed.map((c) => c.novelty);
  check("every card carries a novelty class", seq.every((n) => n === "NEW" || n === "ADJACENT"));
  // One slot of slack: the bias competes with the crowding rules rather than
  // overruling them, so after a run of new ground a slot occasionally goes to
  // an adjacent card instead of to a fourth card from the same lane.
  const off = CFG.FEED.novelty.pattern.filter((want, i) => seq[i] !== want).length;
  check("the opening seven follow the pattern", off <= 1,
    `${seq.slice(0, 7).map((n) => n === "NEW" ? "N" : "A").join(" ")}, ${off} slot(s) off`);
  check("the feed opens on new ground", seq.slice(0, 2).every((n) => n === "NEW"));
  const supply = r.all.filter((c) => c.novelty === "NEW").length / r.all.length;
  const share30 = seq.slice(0, 30).filter((n) => n === "NEW").length / 30;
  // The reading cannot be more new than the inventory is, and nothing weak is
  // invented to make it so — so the floor is whichever is smaller.
  const floor = Math.min(CFG.FEED.novelty.target - 0.05, supply - 0.02);
  check("the reading holds roughly three quarters new ground",
    share30 >= floor,
    `${(share30 * 100).toFixed(0)}% over 30, supply is ${(supply * 100).toFixed(0)}%`);
  check("adjacent cards are not squeezed out entirely",
    seq.slice(0, 30).some((n) => n === "ADJACENT"));
}

console.log(`\n${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);

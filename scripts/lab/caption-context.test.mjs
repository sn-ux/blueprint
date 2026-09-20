/**
 * What a genre card tells the writer about itself.
 *
 * A Rap card built from Kanye, Travis Scott and Drake came back describing
 * Pusha T — who is in the listener's library and not on the card — because the
 * card arrived as a bare heading and was simultaneously told not to describe
 * rap. These pin down both halves of that.
 *
 *   npx tsx scripts/lab/caption-context.test.mjs
 */
import { contextFor } from "../../lib/discovery/observe/llm-caption.ts";
import { anchorOf } from "../../lib/recommendations/session.ts";

const who = {
  genres: ["rap", "hip hop", "progressive rock"],
  holdings: new Map([["Kanye West", 91], ["Drake", 56], ["Pusha T", 13]]),
  genresOfArtist: new Map([
    ["kanyewest", new Set(["rap"])], ["drake", new Set(["rap"])], ["pushat", new Set(["rap"])],
  ]),
  topArtists: ["Kendrick Lamar", "Kanye West"],
  recentArtists: ["Offset", "Shakti"],
};

const rapCard = {
  id: "fr:WHAT_THEY_HAVE:theirs:rap:friend", type: "GENRE", subject: "Rap",
  artist: null, lane: null, cardGenres: [], years: [2011, 2021],
  anchor: anchorOf("Rap", "rap"),
  contents: {
    artists: ["Kanye West", "Travis Scott", "Drake", "J. Cole", "Lil Wayne"],
    tracks: ["Kanye West — Hurricane", "Travis Scott — CAROUSEL", "Drake — God's Plan"],
  },
};
const antiFolk = {
  id: "fr:RELATED_GENRE_CONSENSUS:vouched:afrobeat:anti-folk", type: "GENRE",
  subject: "Anti-folk", artist: null, lane: null, cardGenres: [], years: [2001, 2019],
  anchor: anchorOf("Anti-folk", "afrobeat"),
  contents: { artists: ["The Moldy Peaches", "Jeffrey Lewis"], tracks: ["Jeffrey Lewis — Williamsburg"] },
};

const cases = [
  // ── the collision ──────────────────────────────────────────────────────
  ["same lane yields no anchor", () => anchorOf("Rap", "rap") === null],
  ["case and punctuation ignored", () => anchorOf("Old school hip hop", "old school hip hop") === null],
  ["genuine anchor survives", () => anchorOf("Anti-folk", "afrobeat") === "afrobeat"],
  ["missing subgenre is no anchor", () => anchorOf("Rap", null) === null],
  ["unknown is no anchor", () => anchorOf("Rap", "unknown") === null],

  // ── the contradictory instruction ──────────────────────────────────────
  ["no do-not-describe on a same-lane card",
    () => !/Do not describe/i.test(contextFor(rapCard, who))],
  ["anti-folk keeps its anchor line",
    () => /they already like: afrobeat/.test(contextFor(antiFolk, who))
       && /Do not describe afrobeat/.test(contextFor(antiFolk, who))],
  ["anti-folk still writes about anti-folk",
    () => /WRITE ABOUT — GENRE: Anti-folk/.test(contextFor(antiFolk, who))],

  // ── the card's own contents ───────────────────────────────────────────
  ["rap context names the card's artists", () => {
    const t = contextFor(rapCard, who);
    return ["Kanye West", "Travis Scott", "Drake", "J. Cole", "Lil Wayne"].every((a) => t.includes(a));
  }],
  ["rap context carries example tracks",
    () => /Kanye West — Hurricane/.test(contextFor(rapCard, who))],
  ["contents are marked as the subject",
    () => /Write about this music/.test(contextFor(rapCard, who))],
  ["an artist not on the card is not offered as the subject", () => {
    const t = contextFor(rapCard, who);
    const i = t.indexOf("the music on this card:");
    const j = t.indexOf("their artists in this area:");
    // Pusha T may appear as listener context, but never among the card's music.
    return i >= 0 && (!t.includes("Pusha T") || t.indexOf("Pusha T") > j);
  }],
];

let pass = 0, fail = 0;
for (const [name, fn] of cases) {
  let ok = false;
  try { ok = !!fn(); } catch (e) { ok = false; }
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

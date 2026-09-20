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

// An artist and an album card, which must be untouched by any of this.
const artistCard = {
  id: "fr:DEEPER_ON_AN_ARTIST:deeper:gunna", type: "ARTIST", subject: "Gunna",
  artist: "Gunna", lane: "trap", cardGenres: ["trap"], years: [2018, 2022], anchor: null,
};
const albumCard = {
  id: "fr:FINISH_THE_RECORD:finish:x", type: "ALBUM", subject: "DAYTONA",
  artist: "Pusha T", lane: "rap", cardGenres: ["rap"], years: [2018, 2018], anchor: null,
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
    () => /the music gathered on this card/.test(contextFor(rapCard, who))],
  ["an artist not on the card is not offered as the subject", () => {
    const t = contextFor(rapCard, who);
    const i = t.indexOf("the music on this card:");
    const j = t.indexOf("their artists in this area:");
    // Pusha T may appear as listener context, but never among the card's music.
    return i >= 0 && (!t.includes("Pusha T") || t.indexOf("Pusha T") > j);
  }],

  // ── the genre, not one act inside it ──────────────────────────────────
  ["genre card names the genre as the subject",
    () => /The subject is Rap itself/.test(contextFor(rapCard, who))],
  ["genre card forbids collapsing onto one artist",
    () => /Never let a single artist or album become what the caption is about/
      .test(contextFor(rapCard, who))],
  ["genre card asks what links the music",
    () => /what actually links them/.test(contextFor(rapCard, who))],
  ["genre card still forbids off-card artists",
    () => /never write about an artist who is not on this card/.test(contextFor(rapCard, who))],
  ["anti-folk gets the same abstraction rule",
    () => /The subject is Anti-folk itself/.test(contextFor(antiFolk, who))],

  // ── artist and album cards are untouched ──────────────────────────────
  ["artist card carries no genre abstraction rule",
    () => !/The subject is .* itself/.test(contextFor(artistCard, who))
       && !/Never let a single artist/.test(contextFor(artistCard, who))],
  ["artist card still writes about the artist",
    () => /WRITE ABOUT — ARTIST: Gunna/.test(contextFor(artistCard, who))],
  ["album card carries no genre abstraction rule",
    () => !/The subject is .* itself/.test(contextFor(albumCard, who))
       && !/Never let a single artist/.test(contextFor(albumCard, who))],
  ["album card still writes about the album",
    () => /WRITE ABOUT — ALBUM: DAYTONA by Pusha T/.test(contextFor(albumCard, who))],
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

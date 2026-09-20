/**
 * What the caption validator accepts, pinned down.
 *
 * The rule has not moved: a caption must place the music in time, and must not
 * talk like a recommender system. These cases are about the validator reading
 * English correctly — "mid-2000s" is a date, and a film score is a score.
 *
 *   npx tsx scripts/lab/caption-validator.test.mjs
 */
import { rejection } from "../../lib/discovery/observe/llm-caption.ts";

const body = (extra) =>
  `Gucci Mane has been a foundational voice in Atlanta trap ${extra}, and you already `
  + `keep Young Thug and 2 Chainz from the same city. His mixtape run is where that `
  + `sound was worked out before anyone else picked it up, and it rewards going past `
  + `the singles into the records that built it.`;

const cases = [
  // ── dates the validator must recognise ─────────────────────────────────
  ["1990s",            body("through the 1990s"),          null],
  ["2000s",            body("across the 2000s"),           null],
  ["mid-2000s",        body("since the mid-2000s"),        null],
  ["early 2000s",      body("since the early 2000s"),      null],
  ["late 2000s",       body("into the late 2000s"),        null],
  ["'90s",             body("since the '90s"),             null],
  ["90s",              body("since the 90s"),              null],
  ["explicit year",    body("since 2005"),                 null],
  ["1970s",            body("back in the 1970s"),          null],
  ["decade range",     body("from 1994 to 2001"),          null],

  // ── still undated, still refused ───────────────────────────────────────
  ["no date at all",   body("for a long time"),            "no date in it"],
  ["vague era",        body("for many years now"),         "no date in it"],

  // ── ordinary music prose that must not trip the machine filter ────────
  ["film score",       body("since 2005") + " His score work is sparse.",        null],
  ["the word recommend", body("since 2005") + " Worth recommending to anyone.",  null],
  ["ranked among",     body("since 2005") + " Often ranked among Atlanta's best.", null],

  // ── genuine algorithm and database language, still refused ────────────
  ["algorithm",        body("since 2005") + " Our algorithm surfaced this.",     "algorithm or database language"],
  ["database",         body("since 2005") + " Pulled from our database.",        "algorithm or database language"],
  ["Blueprint",        body("since 2005") + " Blueprint picked this for you.",   "algorithm or database language"],
  ["match score",      body("since 2005") + " It has a high match score.",       "algorithm or database language"],
  ["based on your listening", body("since 2005") + " Based on your listening habits.", "algorithm or database language"],
  ["library count",    body("since 2005") + " Your library has 12 of these.",    "algorithm or database language"],

  // ── the generic ending, still refused ─────────────────────────────────
  ["library gap",      body("since 2005") + " It fills a gap in your library.",  "generic library-gap ending"],

  // ── length, unchanged ─────────────────────────────────────────────────
  ["too short",        "Gucci Mane is from Atlanta, 2005.",                      /too short/],
  ["empty",            "",                                                        "empty"],
];

let pass = 0, fail = 0;
for (const [name, text, want] of cases) {
  const got = rejection(text);
  const ok = want instanceof RegExp ? (got && want.test(got)) : got === want;
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n          want ${want}\n          got  ${got}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

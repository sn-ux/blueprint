/**
 * Captions that say what something is, what of yours it touches, and why that
 * is worth your time.
 *
 * The old captions were built from the two things the database had plenty of:
 * other people's names and counts. "TheEthanSmith has 27 Christmas songs. You
 * share 0 and do not have the other 27." That is a diff, not a reason, and it
 * tells you nothing about the music.
 *
 * So nothing here may use a person's name or a quantity. What is left is the
 * music itself and the reader's own taste, which is what a caption should have
 * been made of from the start:
 *
 *   what it is        who made it, what kind of music, where from, when —
 *                     from ArtistFact, and a real year rather than "the
 *                     seventies" wherever we hold one
 *   what it touches    the strongest true link into this reader's library,
 *                     named: their own artists, a band somebody in this one
 *                     played in, a scene they already keep, an era they live in
 *   why it is worth it what carries over and what is genuinely new
 *
 * A clause with no fact behind it is dropped, never guessed. An artist we know
 * nothing about gets a caption built from the record's own date and the
 * reader's taste, which is thinner but still true.
 *
 * Shape follows evidence rather than a template: a card whose strongest link is
 * a person who played in both bands is written differently from one whose link
 * is a scene, and the connective phrasing rotates on the subject so two cards
 * with the same evidence shape do not read identically.
 */
import type { Candidate } from "./candidates";
import type { Reference } from "./reference";

export interface ArtistFacts {
  name: string;
  kind: string | null;
  country: string | null;
  area: string | null;
  beginArea: string | null;
  activeFrom: string | null;
  activeTo: string | null;
  memberships: string[];
  summary: string | null;
  wikidataGenres: string[];
  instruments: string[];
  styles: string[];
  pressingYear: number | null;
  pressingCountry: string | null;
}

/** What this reader's own library looks like, for the connecting sentence. */
export interface Taste {
  /** Their artists in a given subgenre, commonest first. */
  artistsInLane: Map<string, string[]>;
  /** How many of their songs sit in each subgenre. Used to choose, never printed. */
  laneDepth: Map<string, number>;
  /** Every artist they hold, by normalised name, for lineage checks. */
  artistKeys: Set<string>;
  /** Their artists by normalised name, for naming one back to them. */
  nameOfKey: Map<string, string>;
  /** Which decade their music clusters in, where it does. */
  eraCentre: number | null;
}

const DEMONYM: Record<string, string> = {
  US: "American", GB: "British", IN: "Indian", FR: "French", DE: "German",
  IT: "Italian", JP: "Japanese", BR: "Brazilian", NG: "Nigerian", GH: "Ghanaian",
  JM: "Jamaican", SE: "Swedish", CA: "Canadian", AU: "Australian", IE: "Irish",
  NL: "Dutch", ES: "Spanish", MX: "Mexican", ZA: "South African", KR: "Korean",
  HU: "Hungarian", RU: "Russian", PL: "Polish", AR: "Argentine", CU: "Cuban",
  BE: "Belgian", CH: "Swiss", AT: "Austrian", DK: "Danish", NO: "Norwegian",
  FI: "Finnish", PT: "Portuguese", GR: "Greek", TR: "Turkish", IL: "Israeli",
  ET: "Ethiopian", ML: "Malian", SN: "Senegalese", CO: "Colombian", CL: "Chilean",
};
const COUNTRY_NAME = new Set(Object.values(DEMONYM).concat([
  "United Kingdom", "United States", "India", "France", "Germany", "Italy", "Japan",
  "Brazil", "Nigeria", "Canada", "Australia", "Ireland", "Sweden", "Hungary", "Ghana"]));

export const plainName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const list = (xs: string[], join = "and"): string =>
  xs.length <= 1 ? (xs[0] ?? "")
    : xs.length === 2 ? `${xs[0]} ${join} ${xs[1]}`
      : `${xs.slice(0, -1).join(", ")} ${join} ${xs[xs.length - 1]}`;
const decadeOf = (y: number): string => `${Math.floor(y / 10) * 10}s`;
const yearOf = (s: string | null): number | null => {
  const y = Number((s ?? "").slice(0, 4));
  return y > 1850 && y < 2100 ? y : null;
};
/** Stable per subject, so phrasing varies between cards but not between runs. */
const rotate = (seed: string, n: number): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 100003;
  return h % n;
};

/** The place worth naming: a city where MusicBrainz has one, else a nationality. */
function placeOf(f: ArtistFacts | null): string | null {
  if (!f) return null;
  for (const v of [f.beginArea, f.area]) if (v && !COUNTRY_NAME.has(v)) return v;
  return f.country ? (DEMONYM[f.country] ?? null) : null;
}
const isCity = (f: ArtistFacts | null): boolean => {
  if (!f) return false;
  return [f.beginArea, f.area].some((v) => !!v && !COUNTRY_NAME.has(v));
};

/** "psychedelic rock and funk" from whichever source describes it most finely. */
function styleWords(f: ArtistFacts | null, lane: string | null): string | null {
  const from = (xs: string[]) => xs.filter((x) => x && x.toLowerCase() !== "unknown");
  const pick = from(f?.styles ?? []).length ? from(f!.styles)
    : from(f?.wikidataGenres ?? []).length ? from(f!.wikidataGenres)
      : lane && lane !== "unknown" ? [lane] : [];
  if (!pick.length) return null;
  return list(pick.slice(0, 3).map((s) => s.toLowerCase()));
}

/** "was Pink Floyd's keyboardist" — only from a forward membership relation. */
function memberClause(f: ArtistFacts | null): string | null {
  const m = f?.memberships?.[0];
  if (!m) return null;
  const band = m.replace(/^[^:]*:\s*/, "").replace(/\s*\([^)]*\)/, "").replace(/\s+\d{4}(-\d{4})?$/, "").trim();
  if (!band) return null;
  const instr = /\(([^)]*)\)/.exec(m)?.[1]?.split("/")
    .find((a) => !/^(original|lead vocals|eponymous|guest|additional)$/i.test(a));
  const years = /(\d{4})(?:-(\d{4}))?\s*$/.exec(m);
  const when = years ? ` from ${years[1]}${years[2] ? ` to ${years[2]}` : ""}` : "";
  return instr ? `played ${instr} in ${band}${when}` : `was part of ${band}${when}`;
}

export interface CaptionInput {
  kind: "album" | "artist" | "set";
  /** The record's own title, for an album card. */
  album?: string | null;
  artist: string;
  /** The release year, where the corpus agrees on one. */
  year: number | null;
  lane: string | null;
  facts: ArtistFacts | null;
  taste: Taste;
  /** Songs on the record, used only to decide whether it is a whole record. */
  albumTotal?: number | null;
}

/**
 * The strongest true link from this music into this reader's library.
 *
 * Ordered by how much it actually says. A person who played in a band they
 * keep is a fact about the music; sharing a subgenre is barely a fact at all.
 */
function connection(inp: CaptionInput): { text: string; strength: number; newness: string | null } | null {
  const { facts, lane, taste } = inp;

  // 1. lineage — this person was in a band the reader keeps
  for (const m of facts?.memberships ?? []) {
    const band = m.replace(/^[^:]*:\s*/, "").replace(/\s*\([^)]*\)/, "").replace(/\s+\d{4}(-\d{4})?$/, "").trim();
    const key = plainName(band);
    if (key && taste.artistKeys.has(key)) {
      const theirs = taste.nameOfKey.get(key) ?? band;
      return { text: `${theirs} runs through your library`, strength: 3, newness: null };
    }
  }

  // 2. named artists of theirs in the same lane
  const inLane = (lane ? taste.artistsInLane.get(lane) ?? [] : [])
    .filter((a) => plainName(a) !== plainName(inp.artist)).slice(0, 3);
  if (inLane.length >= 2) return { text: list(inLane), strength: 2, newness: null };

  // 3. the reader's deepest lane that shares a word with this one — a real
  //    overlap of vocabulary rather than an exact match
  if (lane) {
    const words = new Set(lane.split(/\s+/));
    let best: { lane: string; n: number } | null = null;
    for (const [l, n] of taste.laneDepth) {
      if (l === lane) continue;
      if (![...words].some((w) => w.length > 3 && l.includes(w))) continue;
      if (!best || n > best.n) best = { lane: l, n };
    }
    if (best) {
      const acts = (taste.artistsInLane.get(best.lane) ?? []).slice(0, 2);
      if (acts.length) return { text: list(acts), strength: 2, newness: `you have almost no ${lane}` };
      return { text: `the ${best.lane} you keep`, strength: 1, newness: null };
    }
  }

  // 4. one named artist in the lane
  if (inLane.length === 1) return { text: inLane[0], strength: 1, newness: null };
  return null;
}

/** The caption. Three things said once each, in whatever order the evidence suits. */
export function writeCaption(inp: CaptionInput): string {
  const { artist, album, year, lane, facts, taste } = inp;
  const seed = `${artist}|${album ?? ""}|${lane ?? ""}`;
  const subject = inp.kind === "album" && album ? album : artist;

  // ── what is it ───────────────────────────────────────────────────────────
  const style = styleWords(facts, lane);
  const place = placeOf(facts);
  const group = facts?.kind === "Group";
  const formed = group ? yearOf(facts?.activeFrom ?? null) : null;
  const member = memberClause(facts);
  const summary = facts?.summary ?? null;
  const was = group ? "were" : "is";

  const identity: string[] = [];
  /** A Wikidata description is a noun phrase, so it needs a verb in front. */
  const asSentence = (d: string) => {
    if (/^(was|is|were|are)\b/i.test(d)) return `${artist} ${d}`;
    // Wikidata descriptions are bare noun phrases — "German film composer" —
    // so they need both a verb and an article.
    const art = /^(an?|the)\b/i.test(d) ? "" : /^[aeiou]/i.test(d) ? "an " : "a ";
    return `${artist} ${group ? "were" : "is"} ${art}${d}`;
  };
  if (summary) {
    identity.push(asSentence(summary));
  } else if (style && place) {
    identity.push(isCity(facts)
      ? `${artist} ${was} a ${style} ${group ? "band" : "musician"} from ${place}${formed ? `, formed in ${formed}` : ""}`
      : `${artist} ${was} ${place === "American" || place === "Indian" || place === "Italian" || place === "Irish" || place === "Argentine" || place === "Israeli" || place === "Austrian" || place === "Australian" || place === "Ethiopian" ? "an" : "a"} ${place} ${style} ${group ? "band" : "musician"}${formed ? `, together since ${formed}` : ""}`);
  } else if (style) {
    identity.push(`${artist} ${was} ${/^[aeiou]/.test(style) ? "an" : "a"} ${style} ${group ? "band" : "act"}${formed ? `, formed in ${formed}` : ""}`);
  } else if (place) {
    identity.push(`${artist} ${was} from ${place}${formed ? `, working since ${formed}` : ""}`);
  }
  if (member && !summary) identity.push(member);

  // an album card should say when the record came out
  let one: string | null = null;
  if (identity.length) {
    one = identity.join(", and ");
    if (inp.kind === "album" && album && year) {
      one += rotate(seed, 2) === 0
        ? `. ${album} came out in ${year}.`
        : `, and made ${album} in ${year}.`;
    } else if (inp.kind === "artist" && facts?.activeTo && yearOf(facts.activeTo)
      && !/\d{4}/.test(summary ?? "")) {
      one += `, working through ${yearOf(facts.activeTo)}.`;
    } else one += ".";
  } else if (inp.kind === "album" && album && year) {
    one = style
      ? `${album} is a ${style} record from ${year}.`
      : `${album} came out in ${year}.`;
  }
  // A card about a scene should describe the scene, not whichever artist
  // happened to be first in it.
  if (inp.kind === "set" && lane) {
    const era = inp.year ? ` that mostly dates from the ${decadeOf(inp.year)}` : "";
    one = `${lane.charAt(0).toUpperCase()}${lane.slice(1)} is a corner of music${era}.`;
  }

  // ── what it touches ──────────────────────────────────────────────────────
  const link = connection(inp);
  let two: string | null = null;
  if (link) {
    const forms = [
      `If you like ${link.text}, this sits close to it.`,
      `It lands near ${link.text} in your library.`,
      `${link.text} put you in reach of this.`,
    ];
    two = link.strength >= 3
      ? `${link.text}, and this is one of its branches.`
      : forms[rotate(seed, forms.length)];
  }

  // ── why it is worth it ───────────────────────────────────────────────────
  const held = lane ? taste.laneDepth.get(lane) ?? 0 : 0;
  const unexplored = lane && held === 0;
  const era = year ?? (formed ?? null);
  const far = era && taste.eraCentre ? Math.abs(era - taste.eraCentre) >= 15 : false;

  const payoffs: string[] = [];
  if (link?.newness) payoffs.push(`${link.newness[0].toUpperCase()}${link.newness.slice(1)}, so the familiar part arrives from an unfamiliar direction.`);
  if (unexplored && place && isCity(facts)) payoffs.push(`The sound is one you know; the scene it comes from is not.`);
  else if (unexplored) payoffs.push(`It is a corner of that sound your library never went into.`);
  else if (far && era) payoffs.push(`Same music, a good deal earlier than most of what you keep.`);
  else if (inp.kind === "album" && (inp.albumTotal ?? 0) >= 8) payoffs.push(`Worth hearing whole rather than in pieces.`);
  else if (style) payoffs.push(`A different way into something you already spend time in.`);
  if (place && isCity(facts) && !unexplored) payoffs.push(`The same sound, worked out somewhere else entirely.`);
  if (member && inp.kind !== "set") payoffs.push(`Following one player out of a band you know tends to go somewhere quieter.`);
  if (era && !far) payoffs.push(`It sits in the same years as the rest of what you keep, just off to one side.`);
  if (inp.kind === "set") payoffs.push(`Plenty of it here that never reached you.`);
  const three = payoffs.length ? payoffs[rotate(seed, payoffs.length)] : null;

  // Nothing known about the artist is not nothing to say: the music still has
  // a kind and a date, and the reader still has a library.
  if (!one) {
    const when = year ? ` from ${year}` : "";
    one = inp.kind === "artist"
      ? (style ? `${subject} works in ${style}.`
        // "The The Weeknd music" — a name may already carry its article.
        : year ? `What is here by ${subject} dates from ${year}.` : null)
      : style
        ? `${subject} is ${/^[aeiou]/.test(style) ? "an" : "a"} ${style} record${when}.`
        : year ? `${subject} came out in ${year}.` : null;
  }

  /**
   * Assembly, and the part that decides whether these read as writing.
   *
   * Three facts said in the same order every time is a template however much
   * the words inside it vary — fifty-four captions came out in three shapes.
   * So the order itself moves: some lead with the music, some with the reader,
   * some fold the reason into the description rather than adding a sentence.
   * The choice follows the evidence first and the subject second, so it is
   * stable per card but different between cards.
   */
  const linkText = link?.text ?? null;
  const strongLink = (link?.strength ?? 0) >= 3;
  /**
   * Only ever lowercase our own prose. An artist's name is not ours to
   * recase, and doing it produced "john Coltrane" and "j. Cole".
   */
  const lower = (t: string) =>
    /^[A-Z][a-z]+ [A-Z]/.test(t) || /^[A-Z]\./.test(t) || /^(The|A|An) [A-Z]/.test(t)
      ? t : t.charAt(0).toLowerCase() + t.slice(1);
  const trimEnd = (t: string) => t.replace(/\.$/, "");

  const forms: (string | null)[] = [];

  // a. the music, then the reader, then the reason
  forms.push([one, two, three].filter(Boolean).join(" "));

  // b. the reader first — useful when the link is the strongest thing we have
  if (linkText && one) {
    forms.push(`${strongLink ? `${trimEnd(linkText)}, and this comes out of it.` : `You already keep ${trimEnd(linkText)}.`} ${one}${three ? ` ${three}` : ""}`);
  }

  // c. one sentence for the music and the reason together — but only where
  // the reason is a clause that can follow "and". A payoff that starts with
  // its own subject reads as two sentences jammed together.
  const mergeable = !!three && /^(worth|a different way|plenty of|it sits|following)/i.test(three);
  if (one && three && mergeable) {
    forms.push(`${trimEnd(one)}, and ${lower(trimEnd(three))}.${two ? ` ${two}` : ""}`);
  }

  // d. the record itself in front, where there is a record and a date
  if (inp.kind === "album" && album && year && (style || place)) {
    const who = style
      ? `${artist}'s ${style} record`
      : `${artist}'s record${place ? ` out of ${place}` : ""}`;
    forms.push(`${album}, from ${year}, is ${who}.${two ? ` ${two}` : ""}${three ? ` ${three}` : ""}`);
  }

  // e. lineage in front, where a named player connects the two
  if (member && strongLink && linkText) {
    forms.push(`${artist} ${member}, and ${trimEnd(linkText)}. ${three ?? ""}`.trim());
  }

  /**
   * A caption that is only a reason is not a caption. Where there is neither
   * a description nor a link — an artist nothing is recorded about, in a lane
   * the taxonomy could not place — say the one true thing left rather than
   * offering a payoff floating free of its subject.
   */
  if (!one && !two) {
    return year
      ? `${subject} sits in ${year}, and there is little else recorded here about it.`
      : `${subject} is not something this library has anything close to yet.`;
  }

  const usable = forms.filter((f): f is string => !!f && f.trim().length > 0);
  const out = (usable[rotate(seed + (lane ?? ""), usable.length)] ?? usable[0] ?? "")
    .replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();
  return out || `${subject}.`;
}

/** Build the reader's taste profile once per feed from the corpus reference. */
export function tasteOf(ref: Reference, viewerId: string): Taste {
  const artistsInLane = new Map<string, Map<string, number>>();
  const laneDepth = new Map<string, number>();
  const artistKeys = new Set<string>();
  const nameOfKey = new Map<string, string>();
  const years: number[] = [];

  for (const w of ref.works.values()) {
    if (!w.holders.has(viewerId)) continue;
    artistKeys.add(w.artistKey);
    if (!nameOfKey.has(w.artistKey)) nameOfKey.set(w.artistKey, w.artist);
    if (w.firstYear) years.push(w.firstYear);
    const lane = w.subgenre;
    if (!lane || lane === "unknown") continue;
    laneDepth.set(lane, (laneDepth.get(lane) ?? 0) + 1);
    if (!artistsInLane.has(lane)) artistsInLane.set(lane, new Map());
    const m = artistsInLane.get(lane)!;
    m.set(w.artist, (m.get(w.artist) ?? 0) + 1);
  }
  years.sort((a, b) => a - b);
  return {
    artistsInLane: new Map([...artistsInLane].map(([l, m]) =>
      [l, [...m].sort((a, b) => b[1] - a[1]).map(([a]) => a)])),
    laneDepth, artistKeys, nameOfKey,
    eraCentre: years.length ? years[Math.floor(years.length / 2)] : null,
  };
}

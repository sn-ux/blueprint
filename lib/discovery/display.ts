/**
 * Display formatting for taxonomy labels.
 *
 * Database keys stay exactly as the classifier wrote them — "shoegaze",
 * "classic rock" — because they are identity, and mutating identity for
 * presentation is how two spellings of one lane end up as two lanes. This is
 * the single place that turns a key into something a person reads, so a
 * caption, a card and a page title can never disagree about it.
 */

/** Tokens whose established stylization survives title-casing. */
const STYLED: Record<string, string> = {
  "r&b": "R&B",
  "hip-hop": "Hip-Hop",
  "hip hop": "Hip Hop",
  "lo-fi": "Lo-Fi",
  idm: "IDM",
  edm: "EDM",
  uk: "UK",
  us: "US",
  dj: "DJ",
  mc: "MC",
  nyc: "NYC",
  "k-pop": "K-Pop",
  "j-pop": "J-Pop",
  "c-pop": "C-Pop",
  "drum & bass": "Drum & Bass",
  "rock en español": "Rock en Español",
};

/** Small words that stay lowercase unless they open the label. */
const MINOR = new Set(["a", "an", "and", "the", "of", "in", "on", "for", "to", "en", "de", "y"]);

function titleWord(word: string, first: boolean): string {
  const lower = word.toLowerCase();
  if (STYLED[lower]) return STYLED[lower];
  if (!first && MINOR.has(lower)) return lower;
  // Hyphenated compounds capitalize on both sides: "neo-psychedelic".
  return lower
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join("-");
}

/**
 * "shoegaze" → "Shoegaze", "classic rock" → "Classic Rock",
 * "rock en español" → "Rock en Español", and anything already stylized —
 * "Rock / Indie / Alternative", "R&B / Soul / Funk" — comes back untouched.
 */
export function label(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (STYLED[trimmed.toLowerCase()]) return STYLED[trimmed.toLowerCase()];

  return trimmed
    .split("/")
    .map((segment) => {
      const words = segment.trim().split(/\s+/);
      return words.map((w, i) => titleWord(w, i === 0)).join(" ");
    })
    .join(" / ");
}

// ── Sentence case ───────────────────────────────────────────────────────────
/**
 * `label` above is Title Case, which is right for a heading like "Classic
 * Rock" and wrong for a card title, where the reader wants a sentence. These
 * two are the sentence-case pair, and they are the only place a lane key
 * becomes readable for the observation engine.
 *
 * Nothing here ever touches an artist, album or track name. Those arrive from
 * Spotify with their own capitalisation — "JAŸ-Z", "mike.", "SOPHIE" — and
 * reconstructing it from a lowercased copy would destroy it. Only taxonomy
 * keys, which the classifier writes in lower case, pass through here.
 */

/** Tokens that carry their own capitalisation wherever they appear. */
const ALWAYS: Record<string, string> = {
  // Acronyms, from the lane vocabulary actually present in the corpus.
  "r&b": "R&B", edm: "EDM", idm: "IDM", mpb: "MPB", aor: "AOR",
  ccm: "CCM", vgm: "VGM", uk: "UK", us: "US", dj: "DJ", mc: "MC",
  nyc: "NYC", ost: "OST", bgm: "BGM", "hi-nrg": "Hi-NRG",
  // A country initial stays a capital; the genre after it does not.
  "j-pop": "J-pop", "j-rap": "J-rap", "j-rock": "J-rock",
  "k-pop": "K-pop", "k-rap": "K-rap", "k-ballad": "K-ballad", "c-pop": "C-pop",
  // Places, peoples, languages and faiths. Everything else in the vocabulary
  // — cumbia, norteño, shoegaze, lo-fi, nu, emo — is a common noun and stays
  // lower case, which is how those genres are written.
  afrikaans: "Afrikaans", american: "American", americana: "Americana",
  anatolian: "Anatolian", arabic: "Arabic", argentine: "Argentine",
  aussie: "Aussie", bangla: "Bangla", bollywood: "Bollywood",
  brazilian: "Brazilian", britpop: "Britpop", brooklyn: "Brooklyn",
  cajun: "Cajun", catholic: "Catholic", celtic: "Celtic", chicago: "Chicago",
  chinese: "Chinese", christian: "Christian", christmas: "Christmas",
  colombian: "Colombian", dansk: "Dansk", egyptian: "Egyptian",
  ethiopian: "Ethiopian", "español": "Español", "française": "Française",
  french: "French", german: "German", ghanaian: "Ghanaian",
  gujarati: "Gujarati", haryanvi: "Haryanvi", hindi: "Hindi",
  hollands: "Hollands", indian: "Indian", indonesian: "Indonesian",
  italian: "Italian", italo: "Italo", japanese: "Japanese", jersey: "Jersey",
  kannada: "Kannada", malay: "Malay", malayalam: "Malayalam",
  malaysian: "Malaysian", marathi: "Marathi", melbourne: "Melbourne",
  mexican: "Mexican", miami: "Miami", midwest: "Midwest", mizrahi: "Mizrahi",
  moroccan: "Moroccan", "napoletana": "Napoletana", norwegian: "Norwegian",
  philly: "Philly", pinoy: "Pinoy", portuguese: "Portuguese",
  punjabi: "Punjabi", "québécois": "Québécois", "québécoise": "Québécoise",
  sufi: "Sufi", swedish: "Swedish", tamil: "Tamil", texas: "Texas",
  thai: "Thai", turkish: "Turkish", vietnamese: "Vietnamese",
};

/** Multi-word proper nouns, matched before the tokens are split. */
const PHRASES: [RegExp, string][] = [
  [/\bnew orleans\b/gi, "New Orleans"],
  [/\bnew york\b/gi, "New York"],
  [/\brock en español\b/gi, "rock en Español"],
];

const fixTokens = (s: string) =>
  s.split(/(\s+|\/)/).map((part) => ALWAYS[part.toLowerCase()] ?? part).join("");

/**
 * A lane as it reads inside a sentence: "…of your french pop" becomes "…of
 * your French pop", and "edm" becomes "EDM", but nothing gains a leading
 * capital it has not earned.
 */
export function laneInline(name: string | null | undefined): string {
  if (!name) return "";
  let out = name.trim();
  if (!out) return "";
  for (const [re, to] of PHRASES) out = out.replace(re, to);
  return fixTokens(out);
}

/**
 * A lane as a card title: sentence case. "psychedelic rock" becomes
 * "Psychedelic rock" — the first word capitalised and the rest left alone,
 * never "Psychedelic Rock".
 */
export function laneTitle(name: string | null | undefined): string {
  const inline = laneInline(name);
  if (!inline) return "";
  // Leave a token that already carries its own capitals ("EDM", "K-pop").
  const first = inline.split(/\s/)[0];
  if (ALWAYS[first.toLowerCase()] === first) return inline;
  return inline[0].toUpperCase() + inline.slice(1);
}

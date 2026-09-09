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

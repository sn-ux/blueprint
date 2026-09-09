import type { DiscoveryIndex } from "./sets";
import type {
  Candidate, CaptionClaim, ClaimType, Evidence, StructuredProposition,
} from "./types";

/**
 * Step E — attention value, factual claims, and the templates that render them.
 *
 * Two rules govern this whole file.
 *
 * A fact can be statistically exceptional and still be a bad card, so
 * attentionValue is scored separately from evidence and gates independently:
 * it asks whether knowing the fact makes someone more likely to care about the
 * music behind it, which is not the same question as whether the fact is
 * unusual.
 *
 * And a caption may only state the proposition. It may reorder words, change
 * register and choose framing; it may never introduce, drop or round a number,
 * name an entity the proposition does not carry, or reach for the engine's own
 * arithmetic. Ranks, percentiles, ratios and set-shape statistics are not
 * renderable, because no proposition carries them.
 */

// ── attentionValue ──────────────────────────────────────────────────────────

/** Base by claim type: does knowing this make you want to hear the thing. */
const ATTENTION_BASE: Record<ClaimType, number> = {
  SOLE_GAP_TRUE:        0.75,   // exact, complete, and one tap from resolved
  ALL_SOURCES_HAVE:     0.75,   // being the sole exception is a position, not a statistic
  ALL_SOURCES_HAVE_SET: 0.60,
  SOLE_GAP_OBSERVED:    0.70,   // one hole in something already held creates tension
  K_OF_N_HAVE:          0.60,
  K_SHARE_SET:          0.50,
  CHILD_VOID:           0.55,   // a named area never entered, beside ones that were
  ARTIST_ABSENT:        0.45,
  NAMED_PAIR_HAVE:      0.45,
  LANE_VOID:            0.45,
  SOURCE_LANE_DEPTH:    0.45,   // one person, one body of work
  ALBUM_AS_UNIT:        0.40,
  RESIDUE_TRUE:         0.50,
  RESIDUE_OBSERVED:     0.40,
  LANE_GAP:             0.25,   // genre magnitude — fails the gate, correctly
};

export const ATTENTION_FLOOR = 0.4;

export function attentionValue(claimType: ClaimType, c: Candidate): { value: number; parts: Record<string, number> } {
  const base = ATTENTION_BASE[claimType] ?? 0.4;
  const parts: Record<string, number> = { base };

  // A named person attached to the fact.
  if (c.sourceFriendNames.length > 0) parts.namedSource = 0.15;
  // A single track can be played right now; a set has to be browsed.
  if (c.subject.type === "Song") parts.actionable = 0.10;
  // Magnitude and rank facts describe the library, not the music.
  if (claimType === "LANE_GAP") parts.magnitudeOnly = -0.25;
  // A set too large to act on.
  const size = c.componentScores.gapSize ?? c.componentScores.size ?? c.componentScores.count ?? 0;
  if (size > 500) parts.unactionableSize = -0.15;

  const value = Math.max(0, Math.min(1, Object.values(parts).reduce((a, b) => a + b, 0)));
  return { value, parts };
}

// ── Claim enumeration ───────────────────────────────────────────────────────

const num = (p: StructuredProposition): number => {
  const vals = Object.values(p).filter((v) => typeof v === "number") as number[];
  return vals.length;
};

/** Simplicity is measured, not assumed. */
function simplicityOf(text: string, p: StructuredProposition): number {
  const clauses = text.split(/[.;]/).filter((s) => s.trim()).length;
  return Math.max(0, Math.min(1, 1 - 0.15 * (clauses - 1) - 0.1 * Math.max(0, num(p) - 1)));
}

/**
 * Claim types that assert a complete catalogue.
 *
 * Only these may use completion language, and they are only ever constructed
 * from a verified tracklist length that passed every structural check.
 */
const AUTHORITATIVE_CLAIMS = new Set<ClaimType>(["SOLE_GAP_TRUE", "RESIDUE_TRUE"]);

/** Confidence: 1.0 for pure membership facts, hedged where the catalogue is only observed. */
function confidenceOf(claimType: ClaimType): number {
  if (claimType === "SOLE_GAP_OBSERVED" || claimType === "RESIDUE_OBSERVED") return 0.7;
  return 1.0;
}

/** How unusual the fact is, judged against the shape of the evidence itself. */
function exceptionalnessOf(claimType: ClaimType, p: StructuredProposition): number {
  switch (p.type) {
    case "SOLE_GAP_TRUE":        return 0.92;
    case "RESIDUE_TRUE":         return Math.max(0.5, 0.8 - 0.08 * p.residue);
    case "ALL_SOURCES_HAVE":     return 0.95;
    case "ALL_SOURCES_HAVE_SET": return 0.9;
    case "K_OF_N_HAVE":          return Math.min(0.85, 0.4 + 0.45 * (p.k / p.n));
    case "SOLE_GAP_OBSERVED":    return 0.85;
    case "RESIDUE_OBSERVED":     return Math.max(0.4, 0.75 - 0.08 * p.residue);
    case "K_SHARE_SET":          return 0.75;
    case "CHILD_VOID":           return 0.7;
    case "ARTIST_ABSENT":        return 0.6;
    case "ALBUM_AS_UNIT":        return 0.6;
    case "LANE_VOID":            return 0.6;
    case "SOURCE_LANE_DEPTH":    return 0.55;
    case "NAMED_PAIR_HAVE":      return 0.45;
    case "LANE_GAP":             return 0.35;
    default:                     return 0.4;
  }
}

function socialMeaningOf(p: StructuredProposition): number {
  switch (p.type) {
    case "ALL_SOURCES_HAVE":
    case "ALL_SOURCES_HAVE_SET": return 0.95;
    case "K_OF_N_HAVE":
    case "K_SHARE_SET":          return 0.85;
    case "NAMED_PAIR_HAVE":      return 0.9;
    case "SOURCE_LANE_DEPTH":    return 0.8;
    case "ALBUM_AS_UNIT":        return 0.6;
    case "ARTIST_ABSENT":        return 0.5;
    default:                     return 0.25;
  }
}

/** Named entities and exact counts beat vague ones. */
function specificityOf(p: StructuredProposition): number {
  const named = "names" in p && Array.isArray((p as { names?: string[] }).names)
    ? (p as { names: string[] }).names.length : 0;
  const hasLabel = "label" in p || "lane" in p || "artist" in p || "child" in p;
  return Math.min(1, 0.4 + 0.15 * Math.min(3, named) + (hasLabel ? 0.25 : 0) + (num(p) > 0 ? 0.15 : 0));
}

/**
 * Enumerates every true statement available about a candidate.
 *
 * Deliberately independent of the generator that produced it: a track surfaced
 * by an album gap may have a better sentence available from its social
 * evidence, and should be free to use it.
 */
export function enumerateClaims(index: DiscoveryIndex, c: Candidate): StructuredProposition[] {
  const props: StructuredProposition[] = [];
  const names = c.sourceFriendNames;
  const n = index.friends.length;
  const k = c.sourceFriendIds.length;

  // Social claims, available to any candidate with named holders.
  if (c.subject.type === "Song" && k > 0) {
    if (k === n && n >= 3) props.push({ type: "ALL_SOURCES_HAVE", friendCount: k, names });
    else if (k >= 3) props.push({ type: "K_OF_N_HAVE", k, n, names });
    else if (k === 2) props.push({ type: "NAMED_PAIR_HAVE", names: [names[0], names[1]] });
  }

  switch (c.generator) {
    case "UNANIMOUS_SET":
      props.push({ type: "ALL_SOURCES_HAVE_SET", friendCount: n, size: c.componentScores.size });
      break;
    case "MULTI_INTERSECTION_SET":
      props.push({ type: "K_SHARE_SET", k: 3, size: c.componentScores.size, names });
      break;
    case "ALBUM_SOLE_GAP_TRUE":
      props.push({
        type: "SOLE_GAP_TRUE", label: c.album ?? "", artist: c.artist ?? "",
        totalTracks: c.componentScores.totalTracks,
      });
      break;
    case "ALBUM_NEAR_COMPLETE_TRUE":
      props.push({
        type: "RESIDUE_TRUE", label: c.album ?? "", artist: c.artist ?? "",
        totalTracks: c.componentScores.totalTracks, residue: c.componentScores.residue,
      });
      break;
    case "ALBUM_SOLE_GAP_OBSERVED":
      props.push({ type: "SOLE_GAP_OBSERVED", unit: "album", label: c.album ?? "", artist: c.artist ?? undefined });
      break;
    case "ARTIST_SOLE_GAP_OBSERVED":
      props.push({ type: "SOLE_GAP_OBSERVED", unit: "artist", label: c.artist ?? "" });
      break;
    case "ALBUM_RESIDUE_OBSERVED":
      props.push({ type: "RESIDUE_OBSERVED", unit: "album", label: c.album ?? "", residue: c.componentScores.residue });
      break;
    case "ARTIST_RESIDUE_OBSERVED":
      props.push({ type: "RESIDUE_OBSERVED", unit: "artist", label: c.artist ?? "", residue: c.componentScores.residue });
      break;
    case "ALBUM_AS_UNIT":
      props.push({
        type: "ALBUM_AS_UNIT", label: c.album ?? "", artist: c.artist ?? "",
        holders: c.componentScores.holders, depth: c.componentScores.depth,
      });
      break;
    case "ARTIST_ABSENT_IN_LANE":
      props.push({
        type: "ARTIST_ABSENT", artist: c.artist ?? "", lane: c.subgenre ?? "",
        catalogSize: c.componentScores.catalogSize, holders: c.componentScores.holders,
      });
      break;
    case "SUBGENRE_VOID":
      props.push({ type: "LANE_VOID", lane: c.subgenre ?? "", gapSize: c.componentScores.gapSize });
      break;
    case "MISSING_CHILD":
      props.push({ type: "CHILD_VOID", parent: c.genre ?? "", child: c.subgenre ?? "", gapSize: c.componentScores.gapSize });
      break;
    case "SOURCE_LANE_DEPTH":
      props.push({ type: "SOURCE_LANE_DEPTH", name: names[0] ?? "Someone", lane: c.subgenre ?? "", count: c.componentScores.count });
      break;
    case "GENRE_GAP":
      props.push({ type: "LANE_GAP", lane: c.genre ?? "", gapSize: c.componentScores.gapSize });
      break;
    default:
      break;
  }

  return props;
}

// ── Templates ───────────────────────────────────────────────────────────────

interface Template {
  id: string;
  claimType: ClaimType;
  render: (p: StructuredProposition) => string;
  /**
   * Templates that assert completeness of a real catalogue. Parked until the
   * import carries album identity and total-track structure — not deleted,
   * because they are the right sentences once the data supports them.
   */
  requires?: "authoritativeCatalog";
}

/** Set once step H lands. Nothing that asserts completeness renders while off. */
export const CAPABILITIES = { authoritativeCatalog: false };

/**
 * Phrases that imply a complete catalogue.
 *
 * These libraries observe thirteen tracks of an album that has twenty-three,
 * so "nothing else is" and "the only one you don't have" are false in ordinary
 * English even when the discovery set is accurate. The check is a backstop
 * against a template drifting into this shape later; the real defence is that
 * no proposition carries a catalogue total.
 */
const COMPLETION_LANGUAGE = [
  /nothing else is/i,
  /the only\b[^.]*\byou (?:don'?t|do not) have/i,
  /\bone track is missing\b/i,
  /you have everything except/i,
  /you have every\b[^.]*\bbut\b/i,
  /\bexcept this\b/i,
  /\bis in your library except\b/i,
];

const assertsCompletion = (text: string) => COMPLETION_LANGUAGE.some((re) => re.test(text));

const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const spell = (n: number) => (n <= 10 ? words[n] : String(n));
/** Same word, capitalised, for sentence-initial use. */
const Spell = (n: number) => { const w = spell(n); return w[0].toUpperCase() + w.slice(1); };
const list = (ns: string[]) =>
  ns.length <= 1 ? (ns[0] ?? "Someone")
    : `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;

const TEMPLATES: Template[] = [
  { id: "all-1", claimType: "ALL_SOURCES_HAVE",
    render: (p) => `All ${spell((p as { friendCount: number }).friendCount)} of your friends have this. You don't.` },
  { id: "all-2", claimType: "ALL_SOURCES_HAVE",
    render: () => `Everyone in your circle has this except you.` },
  { id: "all-3", claimType: "ALL_SOURCES_HAVE",
    render: (p) => `${list((p as { names: string[] }).names)} all have this. You don't.` },

  { id: "allset-1", claimType: "ALL_SOURCES_HAVE_SET",
    render: (p) => { const q = p as { size: number }; return `There are ${spell(q.size)} tracks every one of your friends has and you don't.`; } },

  { id: "kofn-1", claimType: "K_OF_N_HAVE",
    render: (p) => { const q = p as { k: number; n: number }; return `${Spell(q.k)} of your ${spell(q.n)} friends have this. You don't.`; } },
  { id: "kofn-2", claimType: "K_OF_N_HAVE",
    render: (p) => `${list((p as { names: string[] }).names)} have this. You don't.` },

  { id: "pair-1", claimType: "NAMED_PAIR_HAVE",
    render: (p) => { const q = p as { names: [string, string] }; return `${q.names[0]} and ${q.names[1]} both have this. You don't.`; } },
  { id: "pair-2", claimType: "NAMED_PAIR_HAVE",
    render: (p) => { const q = p as { names: [string, string] }; return `Two of your friends have this — ${q.names[0]} and ${q.names[1]}. You don't.`; } },

  { id: "kset-1", claimType: "K_SHARE_SET",
    render: (p) => { const q = p as { names: string[]; size: number }; return `${list(q.names)} all have these ${q.size} tracks. You have none of them.`; } },

  // Observed-set phrasing. Names the set the claim is made over — the
  // friends' libraries — and never the catalogue, which we cannot see.
  { id: "sole-obs-1", claimType: "SOLE_GAP_OBSERVED",
    render: (p) => { const q = p as { unit: string; label: string }; return q.unit === "album"
      ? `Your friends have one track from ${q.label} that you don't.`
      : `Your friends have one ${q.label} track you don't.`; } },
  { id: "sole-obs-2", claimType: "SOLE_GAP_OBSERVED",
    render: (p) => { const q = p as { unit: string; label: string }; return q.unit === "album"
      ? `There's one track from ${q.label} in your friends' libraries and not yours.`
      : `There's one ${q.label} track your friends have and you don't.`; } },

  // Authoritative. Reachable only from a verified tracklist length, which is
  // what makes the completion wording true rather than merely striking.
  { id: "true-sole-1", claimType: "SOLE_GAP_TRUE",
    render: (p) => `You have every track on ${(p as { label: string }).label} except this one.` },
  { id: "true-sole-2", claimType: "SOLE_GAP_TRUE",
    render: (p) => { const q = p as { label: string; totalTracks: number }; return `One track short of the whole of ${q.label}. This is it.`; } },
  { id: "true-sole-3", claimType: "SOLE_GAP_TRUE",
    render: (p) => { const q = p as { label: string; totalTracks: number }; return `${q.totalTracks} tracks on ${q.label}. You have all but this one.`; } },

  { id: "true-residue-1", claimType: "RESIDUE_TRUE",
    render: (p) => { const q = p as { label: string; residue: number }; return `You're ${spell(q.residue)} tracks short of the whole of ${q.label}.`; } },
  { id: "true-residue-2", claimType: "RESIDUE_TRUE",
    render: (p) => { const q = p as { label: string; residue: number; totalTracks: number }; return `${Spell(q.residue)} of the ${q.totalTracks} tracks on ${q.label} aren't in your library.`; } },

  { id: "residue-1", claimType: "RESIDUE_OBSERVED",
    render: (p) => { const q = p as { unit: string; label: string; residue: number }; return q.unit === "album"
      ? `Your friends have ${spell(q.residue)} tracks from ${q.label} that you don't.`
      : `Your friends have ${spell(q.residue)} ${q.label} tracks you don't.`; } },

  { id: "unit-1", claimType: "ALBUM_AS_UNIT",
    render: (p) => { const q = p as { label: string; holders: number; depth: number }; return `${Spell(q.holders)} of your friends kept ${spell(q.depth)} or more tracks from ${q.label}. You have none of it.`; } },

  { id: "artistabsent-1", claimType: "ARTIST_ABSENT",
    render: (p) => { const q = p as { artist: string; lane: string; catalogSize: number }; return `You have ${q.lane} tracks and nothing by ${q.artist}. Your friends have ${q.catalogSize}.`; } },
  { id: "artistabsent-2", claimType: "ARTIST_ABSENT",
    render: (p) => { const q = p as { artist: string; catalogSize: number }; return `Your friends have ${q.catalogSize} ${q.artist} tracks. You have none.`; } },

  { id: "void-1", claimType: "LANE_VOID",
    render: (p) => { const q = p as { lane: string; gapSize: number }; return `Your friends have ${q.gapSize} ${q.lane} tracks. You have none.`; } },
  { id: "void-2", claimType: "LANE_VOID",
    render: (p) => { const q = p as { lane: string; gapSize: number }; return `Between them your friends have ${q.gapSize} ${q.lane} tracks. You have none.`; } },

  { id: "child-1", claimType: "CHILD_VOID",
    render: (p) => { const q = p as { child: string; gapSize: number }; return `You have nothing in ${q.child}. Your friends have ${q.gapSize} tracks there.`; } },
  { id: "child-2", claimType: "CHILD_VOID",
    render: (p) => { const q = p as { child: string; gapSize: number }; return `Your friends have ${q.gapSize} ${q.child} tracks between them. You have none.`; } },

  { id: "depth-1", claimType: "SOURCE_LANE_DEPTH",
    render: (p) => { const q = p as { name: string; lane: string; count: number }; return `${q.name} has ${q.count} ${q.lane} tracks you don't.`; } },

  { id: "lanegap-1", claimType: "LANE_GAP",
    render: (p) => { const q = p as { lane: string; gapSize: number }; return `Your friends have ${q.gapSize} ${q.lane} tracks you don't.`; } },
];

/** Deterministic per candidate, so a card always reads the same way. */
function pickTemplate(claimType: ClaimType, seed: string): Template | null {
  const family = TEMPLATES.filter((t) =>
    t.claimType === claimType
    && (!t.requires || CAPABILITIES[t.requires]));
  if (family.length === 0) return null;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return family[h % family.length];
}

export const CLAIM_FLOOR = 0.35;

/**
 * How many tracks a proposition promises the page will contain.
 *
 * A claim that enumerates or implies a finite set — "three tracks short of
 * this album", "all four have these six" — has to be able to show all of it.
 * A claim that states a structural fact without promising an enumeration
 * promises nothing, and returns 0.
 */
export function promisedCount(p: StructuredProposition): number {
  switch (p.type) {
    case "ALL_SOURCES_HAVE":
    case "K_OF_N_HAVE":
    case "NAMED_PAIR_HAVE":
    case "SOLE_GAP_TRUE":
    case "SOLE_GAP_OBSERVED":     return 1;
    case "ALL_SOURCES_HAVE_SET":
    case "K_SHARE_SET":           return p.size;
    case "RESIDUE_TRUE":
    case "RESIDUE_OBSERVED":      return p.residue;
    case "ARTIST_ABSENT":         return p.catalogSize;
    case "LANE_VOID":
    case "CHILD_VOID":
    case "LANE_GAP":              return p.gapSize;
    case "SOURCE_LANE_DEPTH":     return p.count;
    // Describes how much the holders kept, not a set the page enumerates.
    case "ALBUM_AS_UNIT":         return 0;
    default:                      return 0;
  }
}

export function buildClaims(index: DiscoveryIndex, c: Candidate): CaptionClaim[] {
  const out: CaptionClaim[] = [];
  for (const p of enumerateClaims(index, c)) {
    const tpl = pickTemplate(p.type, c.subjectKey + p.type);
    if (!tpl) continue;
    const text = tpl.render(p);
    if (!text || /undefined|NaN|\s{2,}|^\s|""/.test(text)) continue;
    // Backstop: a rendered sentence may never imply a complete catalogue unless
    // the claim is one of the authoritative types, which cannot be constructed
    // without a verified tracklist length. The check is scoped, not relaxed —
    // every observed claim is still held to it.
    if (!AUTHORITATIVE_CLAIMS.has(p.type)
      && !CAPABILITIES.authoritativeCatalog
      && assertsCompletion(text)) continue;

    const exceptionalness = exceptionalnessOf(p.type, p);
    const specificity = specificityOf(p);
    const socialMeaning = socialMeaningOf(p);
    const simplicity = simplicityOf(text, p);
    const confidence = confidenceOf(p.type);

    const score =
      0.30 * exceptionalness +
      0.25 * specificity +
      0.15 * socialMeaning +
      0.15 * simplicity +
      0.15 * confidence;

    const evidence: Evidence[] = c.evidence;
    out.push({
      claimType: p.type, proposition: p, evidence,
      exceptionalness, specificity, socialMeaning, simplicity, confidence,
      score, text, templateId: tpl.id,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

import * as CFG from "./config";
import { label } from "./display";
import type { DiscoveryIndex } from "./sets";
import type {
  Candidate, CaptionClaim, ClaimType, StructuredProposition,
} from "./types";

/**
 * Step E — attention value, factual claims, and the templates that render them.
 *
 * Three rules govern this file.
 *
 * A caption must state both sides. "Your friends have this" is not a
 * recommendation; it is a fact about other people. Every proposition carries
 * the viewer's own holding alongside the miss, so a one-sided sentence cannot
 * be constructed — there is no proposition shaped like one.
 *
 * A fact can be exceptional and still be a bad card, so attentionValue is
 * scored and gated separately from evidence.
 *
 * And a template may only restate its proposition. It may reorder words and
 * change framing; it may never introduce, drop or round a number, name an
 * entity the proposition does not carry, or reach for the engine's own
 * arithmetic. Ranks, percentiles and set-shape statistics are unrenderable,
 * because nothing carries them.
 */

// ── attentionValue ──────────────────────────────────────────────────────────

export const ATTENTION_BASE: Record<ClaimType, number> = {
  // An exact remainder on a record already half-held is the sharpest of these.
  ALBUM_COMPLETION: 0.80,
  ARTIST_MORE: 0.70,
  SET_CONSENSUS: 0.65,
  // Stacked propositions carry more than one reason, which is the whole point
  // of stacking: they are worth more attention than either half alone.
  LANE_VIA_BRIDGE: 0.78,
  NEW_TERRITORY: 0.72,
  ALBUM_VIA_ARTIST: 0.60,
  ARTIST_VIA_LANE: 0.55,
  LANE_VIA_PARENT: 0.55,
  LANE_MORE: 0.50,
};

export const ATTENTION_FLOOR = CFG.ATTENTION_FLOOR;

export function attentionValue(
  claimType: ClaimType, c: Candidate,
): { value: number; parts: Record<string, number> } {
  const parts: Record<string, number> = { base: ATTENTION_BASE[claimType] ?? 0.4 };

  // A named person attached to the fact.
  if (c.sourceFriendNames.length > 0) parts.namedSource = CFG.ATTENTION_MODIFIERS.namedSource;
  // How tightly the recommendation ties to something already held. Structural,
  // not a preference: an album is a narrower connection than a whole genre.
  parts.anchorSpecificity = 0.15 * ((c.anchor?.specificity ?? 0.5) - 0.5);
  // A set nobody could work through is not actionable.
  if (c.deliverableCount > CFG.ATTENTION_MODIFIERS.unactionableAbove) {
    parts.unactionableSize = CFG.ATTENTION_MODIFIERS.unactionableSize;
  }

  const value = Math.max(0, Math.min(1, Object.values(parts).reduce((a, b) => a + b, 0)));
  return { value, parts };
}

// ── Claim construction ──────────────────────────────────────────────────────

/**
 * The claims available for a candidate.
 *
 * A candidate without a recipient anchor produces none and is rejected as
 * inexplicable — the intended outcome, not a gap.
 */
export function enumerateClaims(_index: DiscoveryIndex, c: Candidate): StructuredProposition[] {
  const a = c.anchor;
  if (!a) return [];
  const names = c.sourceFriendNames;
  const n = c.deliverableCount;

  switch (c.generator) {
    case "ALBUM_GAP_TRUE":
      return [{
        type: "ALBUM_COMPLETION", album: c.album ?? "", artist: c.artist ?? "",
        owned: a.ownedCount, total: a.relevantSetSize ?? 0, residue: n, names,
      }];
    case "ALBUM_AS_UNIT":
      return [{
        type: "ALBUM_VIA_ARTIST", album: c.album ?? "", artist: c.artist ?? "",
        ownedByArtist: a.ownedCount, deliverable: n, names,
      }];
    case "ARTIST_GAP":
      return [{ type: "ARTIST_MORE", artist: c.artist ?? "", owned: a.ownedCount, deliverable: n, names }];
    case "ARTIST_ABSENT_IN_LANE":
      return [{
        type: "ARTIST_VIA_LANE", artist: c.artist ?? "", lane: a.entityName,
        ownedInLane: a.ownedCount, deliverable: n, names,
      }];
    case "SUBGENRE_GAP":
      return [{ type: "LANE_MORE", lane: a.entityName, owned: a.ownedCount, deliverable: n, names }];
    case "MISSING_CHILD":
      return [{
        type: "LANE_VIA_PARENT", parent: a.entityName, lane: c.subgenre ?? "",
        ownedInParent: a.ownedCount, deliverable: n, names,
      }];
    case "BRIDGED_LANE": {
      const g = c.componentScores;
      return [{
        type: "LANE_VIA_BRIDGE", lane: c.subgenre ?? "", parent: c.genre ?? "",
        bridgeArtists: (c.bridgeArtists ?? []).slice(0, 3),
        ownedByBridge: g.ownedByBridge ?? a.ownedCount,
        deliverable: n, names,
      }];
    }
    case "NEW_TERRITORY_SET": {
      const g = c.groupingReason;
      if (g.kind !== "SELECTED") return [];
      return [{
        type: "NEW_TERRITORY", scope: g.scope.key, scopeIsGenre: false,
        parent: c.genre ?? "", ownedInParent: c.componentScores.ownedInParent ?? 0,
        deepSources: c.deepSourceNames ?? names,
        deepCounts: c.deepSourceCounts ?? [],
        bridgeArtists: (c.bridgeArtists ?? []).slice(0, 3),
        deliverable: n, laneInventory: c.componentScores.laneInventory ?? n,
      }];
    }
    case "CONSENSUS_SET": {
      const g = c.groupingReason;
      if (g.kind !== "SELECTED") return [];
      return [{
        type: "SET_CONSENSUS",
        scope: g.scope.key, scopeIsGenre: g.scope.entity === "GENRE",
        owned: a.ownedCount, deliverable: n,
        minHolders: g.rule.threshold, qualifying: g.rule.qualifying, names,
      }];
    }
    default:
      return [];
  }
}

/** How many tracks a proposition promises the page will contain. */
export function promisedCount(p: StructuredProposition): number {
  return p.type === "ALBUM_COMPLETION" ? p.residue : p.deliverable;
}

// ── Templates ───────────────────────────────────────────────────────────────

const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** Thousands separators only. A template may format a number, never change it. */
const num = (n: number) => n.toLocaleString("en-US");
const spell = (n: number) => (n <= 10 ? words[n] : String(n));
const Spell = (n: number) => { const w = spell(n); return w[0].toUpperCase() + w.slice(1); };

type P<T extends ClaimType> = Extract<StructuredProposition, { type: T }>;

/**
 * Naming the people behind a recommendation.
 *
 * Two or three friends are named outright — "Chris and Sahaj" carries more
 * than "two of your friends", and it is the same fact. Beyond three a list
 * stops being readable, so it becomes a count. Never a bare number where a
 * name would fit.
 */
/** "Funkadelic", "Funkadelic and Sly Stone", "A, B, and C". */
export function listOf(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function friendPhrase(names: string[]): string {
  const n = names.length;
  if (n === 0) return "";
  if (n === 1) return names[0];
  if (n === 2) return `${names[0]} and ${names[1]}`;
  if (n === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${Spell(n)} of your friends`;
}

/** "Chris and Sahaj have" / "Three of your friends have". */
const friendsHave = (names: string[]) =>
  `${friendPhrase(names)} ${names.length <= 3 && names.length > 0 ? (names.length === 1 ? "has" : "have") : "have"}`;

interface Template {
  id: string;
  claimType: ClaimType;
  /** The feed sentence. Short; never repeats the card's own title. */
  render: (p: StructuredProposition) => string;
  /** The page's expanded version of the same fact. Names the sources. */
  detail: (p: StructuredProposition) => string;
}

const TEMPLATES: Template[] = [
  // Album completion — the only claim permitted to assert a full tracklist,
  // and only ever built from a verified one. The card's title is the album and
  // its context line names the artist, so neither is repeated here.
  {
    id: "album-complete-1", claimType: "ALBUM_COMPLETION",
    render: (p) => {
      const q = p as P<"ALBUM_COMPLETION">;
      return `You have ${q.owned} of the ${q.total} tracks. Your friends have the other ${spell(q.residue)}.`;
    },
    detail: (p) => {
      const q = p as P<"ALBUM_COMPLETION">;
      const by = q.artist && q.artist !== q.album ? ` by ${q.artist}` : "";
      return `You already have ${q.owned} of the ${q.total} tracks on ${q.album}${by}.`
        + ` ${friendsHave(q.names ?? [])} saved the remaining ${spell(q.residue)}, which are not in your library.`
        + ` ${q.residue === 1 ? "It is" : "Those " + spell(q.residue) + " are"} shown below.`;
    },
  },
  {
    id: "album-complete-2", claimType: "ALBUM_COMPLETION",
    render: (p) => {
      const q = p as P<"ALBUM_COMPLETION">;
      return q.residue === 1
        ? `You have every track but one, and your friends have it.`
        : `${Spell(q.residue)} tracks short of the whole record. Your friends have them.`;
    },
    detail: (p) => {
      const q = p as P<"ALBUM_COMPLETION">;
      const by = q.artist && q.artist !== q.album ? ` by ${q.artist}` : "";
      return `You already have ${q.owned} of the ${q.total} tracks on ${q.album}${by}.`
        + ` ${friendsHave(q.names ?? [])} saved the remaining ${spell(q.residue)}, which are not in your library.`
        + ` ${q.residue === 1 ? "It is" : "Those " + spell(q.residue) + " are"} shown below.`;
    },
  },

  {
    id: "album-via-artist-1", claimType: "ALBUM_VIA_ARTIST",
    render: (p) => {
      const q = p as P<"ALBUM_VIA_ARTIST">;
      return `You already have ${num(q.ownedByArtist)} ${q.artist} tracks, but nothing from this album. ${friendsHave(q.names)} ${q.deliverable}.`;
    },
    detail: (p) => {
      const q = p as P<"ALBUM_VIA_ARTIST">;
      return `You already have ${num(q.ownedByArtist)} tracks by ${q.artist}, but none from ${q.album}.`
        + ` ${friendsHave(q.names)} saved ${q.deliverable} tracks from the album that aren't in your library.`
        + ` Those ${q.deliverable} tracks are shown below.`;
    },
  },

  {
    id: "artist-more-1", claimType: "ARTIST_MORE",
    render: (p) => {
      const q = p as P<"ARTIST_MORE">;
      return `You already have ${num(q.owned)} ${q.owned === 1 ? "track" : "tracks"}. ${friendsHave(q.names)} ${q.deliverable} more you don't.`;
    },
    detail: (p) => {
      const q = p as P<"ARTIST_MORE">;
      return `You already have ${num(q.owned)} ${q.artist} ${q.owned === 1 ? "track" : "tracks"} in your library.`
        + ` ${friendsHave(q.names)} saved ${q.deliverable} more that aren't in yours.`
        + ` Those ${q.deliverable} tracks are shown below.`;
    },
  },
  {
    id: "artist-more-2", claimType: "ARTIST_MORE",
    render: (p) => {
      const q = p as P<"ARTIST_MORE">;
      return `${num(q.owned)} tracks of theirs are already yours. ${friendsHave(q.names)} ${q.deliverable} more.`;
    },
    detail: (p) => {
      const q = p as P<"ARTIST_MORE">;
      return `You already have ${num(q.owned)} ${q.artist} ${q.owned === 1 ? "track" : "tracks"} in your library.`
        + ` ${friendsHave(q.names)} saved ${q.deliverable} more that aren't in yours.`
        + ` Those ${q.deliverable} tracks are shown below.`;
    },
  },

  {
    id: "artist-via-lane-1", claimType: "ARTIST_VIA_LANE",
    render: (p) => {
      const q = p as P<"ARTIST_VIA_LANE">;
      return `You don't have any tracks by them. ${friendsHave(q.names)} ${q.deliverable}.`;
    },
    detail: (p) => {
      const q = p as P<"ARTIST_VIA_LANE">;
      return `You already have ${num(q.ownedInLane)} ${label(q.lane)} tracks, but nothing at all by ${q.artist}.`
        + ` ${friendsHave(q.names)} saved ${q.deliverable} of their tracks that aren't in your library.`
        + ` Those ${q.deliverable} tracks are shown below.`;
    },
  },

  {
    id: "lane-more-1", claimType: "LANE_MORE",
    render: (p) => {
      const q = p as P<"LANE_MORE">;
      return `You already have ${num(q.owned)} tracks here. ${friendsHave(q.names)} ${q.deliverable} more you don't.`;
    },
    detail: (p) => {
      const q = p as P<"LANE_MORE">;
      return `You already have ${num(q.owned)} ${label(q.lane)} tracks in your library.`
        + ` ${friendsHave(q.names)} saved ${q.deliverable} more in the same lane that aren't in yours.`
        + ` Those ${q.deliverable} tracks are shown below.`;
    },
  },

  {
    id: "lane-via-parent-1", claimType: "LANE_VIA_PARENT",
    render: (p) => {
      const q = p as P<"LANE_VIA_PARENT">;
      return `You don't have any ${label(q.lane)} saved. ${friendsHave(q.names)} ${q.deliverable} tracks there.`;
    },
    detail: (p) => {
      const q = p as P<"LANE_VIA_PARENT">;
      return `You already have ${num(q.ownedInParent)} tracks across ${label(q.parent)}, but none classified as ${label(q.lane)}.`
        + ` ${friendsHave(q.names)} saved ${q.deliverable} ${label(q.lane)} tracks that are not in your library.`
        + ` Those ${q.deliverable} tracks are shown below.`;
    },
  },

  // A curated set states three things: why the area is relevant to the viewer,
  // why these particular tracks were chosen out of it, and who vouches.
  {
    id: "set-consensus-1", claimType: "SET_CONSENSUS",
    render: (p) => {
      const q = p as P<"SET_CONSENSUS">;
      return `You already have ${num(q.owned)} tracks in this ${q.scopeIsGenre ? "genre" : "lane"}. These ${q.deliverable} are saved by at least ${spell(q.minHolders)} of your friends, and none are in your library.`;
    },
    detail: (p) => {
      const q = p as P<"SET_CONSENSUS">;
      return `You already have ${num(q.owned)} ${label(q.scope)} tracks in your library.`
        + ` Of everything in that ${q.scopeIsGenre ? "genre" : "lane"} you're missing, ${q.qualifying} ${q.qualifying === 1 ? "track has" : "tracks have"} been saved independently by at least ${spell(q.minHolders)} of your friends.`
        + ` The ${q.deliverable} with the most agreement are shown below.`;
    },
  },

  // Two facts at once, and the second is what makes the first worth reading:
  // named artists already in the library work in a lane the viewer has never
  // entered. Never "you like these artists" — only that they are held.
  {
    id: "lane-via-bridge-1", claimType: "LANE_VIA_BRIDGE",
    render: (p) => {
      const q = p as P<"LANE_VIA_BRIDGE">;
      return `You have none of this, but ${listOf(q.bridgeArtists)} — ${num(q.ownedByBridge)} of whose tracks are already yours — ${q.bridgeArtists.length === 1 ? "works" : "work"} here. ${friendsHave(q.names)} ${q.deliverable}.`;
    },
    detail: (p) => {
      const q = p as P<"LANE_VIA_BRIDGE">;
      return `You have no ${label(q.lane)} in your library at all.`
        + ` But ${listOf(q.bridgeArtists)}${q.bridgeArtists.length === 1 ? " is an artist" : " are artists"} you already hold — ${num(q.ownedByBridge)} of their tracks are in your library — and ${q.bridgeArtists.length === 1 ? "they have" : "they have"} tracks classified as ${label(q.lane)}.`
        + ` ${friendsHave(q.names)} saved ${q.deliverable} ${label(q.lane)} tracks that aren't in yours. Those ${q.deliverable} are shown below.`;
    },
  },

  // New territory as a starting set: depth rather than agreement is the vouch,
  // and the card hands over tracks rather than announcing a genre.
  {
    id: "new-territory-1", claimType: "NEW_TERRITORY",
    render: (p) => {
      const q = p as P<"NEW_TERRITORY">;
      const who = q.deepSources.length ? `${listOf(q.deepSources.slice(0, 3))} each keep a collection here` : "";
      const bridge = q.bridgeArtists.length
        ? `, and ${listOf(q.bridgeArtists)} — already in your library — ${q.bridgeArtists.length === 1 ? "works" : "work"} in it`
        : "";
      return `New to you: ${who}${bridge}. These ${q.deliverable} are where to start.`;
    },
    detail: (p) => {
      const q = p as P<"NEW_TERRITORY">;
      const bridge = q.bridgeArtists.length
        ? ` ${listOf(q.bridgeArtists)}, already in your library, ${q.bridgeArtists.length === 1 ? "has" : "have"} tracks classified here.`
        : "";
      return `You have nothing at all classified as ${label(q.scope)}, though you hold ${num(q.ownedInParent)} tracks across ${label(q.parent)}.`
        + ` ${listOf(q.deepSources.slice(0, 3))} each keep a collection of it${q.deepCounts.length ? ` — ${q.deepCounts.slice(0, 3).join(", ")} tracks respectively` : ""}, and between them there are ${q.laneInventory} you don't have.${bridge}`
        + ` The ${q.deliverable} most widely kept are shown below.`;
    },
  },
];

/** Deterministic per candidate, so a card always reads the same way. */
function pickTemplate(claimType: ClaimType, seed: string): Template | null {
  const family = TEMPLATES.filter((t) => t.claimType === claimType);
  if (family.length === 0) return null;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return family[h % family.length];
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export const CLAIM_FLOOR = CFG.CLAIM_FLOOR;

const numbersIn = (p: StructuredProposition) =>
  Object.values(p).filter((v) => typeof v === "number").length;

function simplicityOf(text: string, p: StructuredProposition): number {
  const clauses = text.split(/[.;]/).filter((x) => x.trim()).length;
  return Math.max(0, Math.min(1, 1 - 0.15 * (clauses - 1) - 0.1 * Math.max(0, numbersIn(p) - 2)));
}

function exceptionalnessOf(p: StructuredProposition): number {
  switch (p.type) {
    case "ALBUM_COMPLETION": return Math.max(0.6, 0.95 - 0.08 * p.residue);
    case "ARTIST_MORE": return 0.7;
    case "SET_CONSENSUS": return 0.65;
    case "LANE_VIA_BRIDGE": return 0.8;
    case "NEW_TERRITORY": return 0.7;
    case "LANE_VIA_PARENT": return 0.6;
    case "ALBUM_VIA_ARTIST": return 0.6;
    case "ARTIST_VIA_LANE": return 0.55;
    default: return 0.45;
  }
}

const socialMeaningOf = (p: StructuredProposition) =>
  ("names" in p && p.names.length > 0 ? 0.8 : 0.35);

/** Named entities and a tight anchor beat vague ones. */
const specificityOf = (p: StructuredProposition, anchorSpecificity: number) =>
  Math.min(1, 0.35 + 0.3 * anchorSpecificity + 0.1 * Math.min(3, "names" in p ? p.names.length : 0) + 0.15);

export function buildClaims(index: DiscoveryIndex, c: Candidate): CaptionClaim[] {
  const out: CaptionClaim[] = [];
  for (const p of enumerateClaims(index, c)) {
    const tpl = pickTemplate(p.type, c.subjectKey + p.type);
    if (!tpl) continue;
    // Titles carry their own punctuation — "DAMN." ends a sentence on its
    // own — so a template's full stop must not double up behind one.
    // Titles carry their own punctuation — "DAMN." ends a sentence on its
    // own — so a template's full stop must not double up behind one.
    const clean = (t: string) => t.replace(/\.\.(?=\s|$)/g, ".");
    const text = clean(tpl.render(p));
    const detailText = clean(tpl.detail(p));
    if (!text || /undefined|NaN|\s{2,}|^\s/.test(text)) continue;
    if (!detailText || /undefined|NaN|\s{2,}|^\s/.test(detailText)) continue;

    const exceptionalness = exceptionalnessOf(p);
    const specificity = specificityOf(p, c.anchor?.specificity ?? 0.5);
    const socialMeaning = socialMeaningOf(p);
    const simplicity = simplicityOf(text, p);
    // Every surviving claim rests on authoritative album structure or plain
    // set membership; nothing is hedged over an observed catalogue any more.
    const confidence = 1.0;

    const score =
      CFG.CLAIM_WEIGHTS.exceptionalness * exceptionalness
      + CFG.CLAIM_WEIGHTS.specificity * specificity
      + CFG.CLAIM_WEIGHTS.socialMeaning * socialMeaning
      + CFG.CLAIM_WEIGHTS.simplicity * simplicity
      + CFG.CLAIM_WEIGHTS.confidence * confidence;

    out.push({
      claimType: p.type, proposition: p, evidence: c.evidence, detailText,
      exceptionalness, specificity, socialMeaning, simplicity, confidence,
      score, text, templateId: tpl.id,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

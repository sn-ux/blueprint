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
  LANE_CONSENSUS: 0.65,
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
        owned: a.ownedCount, total: a.relevantSetSize ?? 0, residue: n,
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
        ownedInParent: a.ownedCount, deliverable: n,
      }];
    case "CONSENSUS_IN_LANE":
      return [{ type: "LANE_CONSENSUS", lane: a.entityName, owned: a.ownedCount, deliverable: n, names }];
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
const spell = (n: number) => (n <= 10 ? words[n] : String(n));
const Spell = (n: number) => { const w = spell(n); return w[0].toUpperCase() + w.slice(1); };

type P<T extends ClaimType> = Extract<StructuredProposition, { type: T }>;

interface Template {
  id: string;
  claimType: ClaimType;
  render: (p: StructuredProposition) => string;
}

const TEMPLATES: Template[] = [
  // Album completion — the only claim permitted to assert a full tracklist,
  // and only ever built from a verified one.
  {
    id: "album-complete-1", claimType: "ALBUM_COMPLETION",
    render: (p) => {
      const q = p as P<"ALBUM_COMPLETION">;
      return `You have ${q.owned} of the ${q.total} tracks on ${q.album}. Your friends have the other ${spell(q.residue)}.`;
    },
  },
  {
    id: "album-complete-2", claimType: "ALBUM_COMPLETION",
    render: (p) => {
      const q = p as P<"ALBUM_COMPLETION">;
      return q.residue === 1
        ? `You have every track on ${q.album} except one, and your friends have it.`
        : `${Spell(q.residue)} tracks short of the whole of ${q.album}. Your friends have them.`;
    },
  },

  {
    id: "album-via-artist-1", claimType: "ALBUM_VIA_ARTIST",
    render: (p) => {
      const q = p as P<"ALBUM_VIA_ARTIST">;
      return `You already have ${q.ownedByArtist} tracks by ${q.artist} but nothing from ${q.album}. Your friends have ${q.deliverable}.`;
    },
  },

  {
    id: "artist-more-1", claimType: "ARTIST_MORE",
    render: (p) => {
      const q = p as P<"ARTIST_MORE">;
      return `You already have ${q.owned} ${q.owned === 1 ? "track" : "tracks"} by ${q.artist}. Your friends have ${q.deliverable} more you don't.`;
    },
  },
  {
    id: "artist-more-2", claimType: "ARTIST_MORE",
    render: (p) => {
      const q = p as P<"ARTIST_MORE">;
      return `${q.artist} is already in your library — ${q.owned} tracks. Your friends kept ${q.deliverable} more.`;
    },
  },

  {
    id: "artist-via-lane-1", claimType: "ARTIST_VIA_LANE",
    render: (p) => {
      const q = p as P<"ARTIST_VIA_LANE">;
      return `You already have ${q.ownedInLane} ${label(q.lane)} tracks. Your friends have ${q.deliverable} by ${q.artist} you haven't saved.`;
    },
  },

  {
    id: "lane-more-1", claimType: "LANE_MORE",
    render: (p) => {
      const q = p as P<"LANE_MORE">;
      return `You already have ${label(q.lane)} in your library. Your friends have ${q.deliverable} more tracks here you don't.`;
    },
  },
  {
    id: "lane-more-2", claimType: "LANE_MORE",
    render: (p) => {
      const q = p as P<"LANE_MORE">;
      return `${q.owned} ${label(q.lane)} tracks in your library, and ${q.deliverable} more your friends kept.`;
    },
  },

  {
    id: "lane-via-parent-1", claimType: "LANE_VIA_PARENT",
    render: (p) => {
      const q = p as P<"LANE_VIA_PARENT">;
      return `You have plenty of ${label(q.parent)}, but no ${label(q.lane)}. Your friends have ${q.deliverable} tracks there.`;
    },
  },
  {
    id: "lane-via-parent-2", claimType: "LANE_VIA_PARENT",
    render: (p) => {
      const q = p as P<"LANE_VIA_PARENT">;
      return `${label(q.lane)} is the corner of ${label(q.parent)} you've never entered. Your friends have ${q.deliverable} tracks in it.`;
    },
  },

  {
    id: "lane-consensus-1", claimType: "LANE_CONSENSUS",
    render: (p) => {
      const q = p as P<"LANE_CONSENSUS">;
      return `You already have ${label(q.lane)}. Your friends agree on ${q.deliverable} tracks here you don't have.`;
    },
  },
  {
    id: "lane-consensus-2", claimType: "LANE_CONSENSUS",
    render: (p) => {
      const q = p as P<"LANE_CONSENSUS">;
      return `${q.deliverable} ${label(q.lane)} tracks more than one of your friends kept, and none of them are yours.`;
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
    case "LANE_CONSENSUS": return 0.65;
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
    const text = tpl.render(p).replace(/\.\.(?=\s|$)/g, ".");
    if (!text || /undefined|NaN|\s{2,}|^\s/.test(text)) continue;

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
      claimType: p.type, proposition: p, evidence: c.evidence,
      exceptionalness, specificity, socialMeaning, simplicity, confidence,
      score, text, templateId: tpl.id,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

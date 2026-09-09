import { LIFECYCLE } from "./config";
import type { Candidate } from "./types";

/**
 * Card lifecycle — should this valid recommendation appear now?
 *
 * Two systems, kept deliberately apart. Recommendation quality asks whether a
 * card is worth showing at all: evidenceStrength, attentionValue, anchor
 * specificity, the publishing floor. Nothing in this file touches any of them,
 * and nothing here can promote a card that failed them.
 *
 * Lifecycle asks a different question — of the cards that are all worth
 * showing, which belong in front of the viewer today. It knows only what has
 * happened between this viewer and this proposition: shown, opened, dismissed,
 * resolved, changed.
 *
 * The distinctions that matter:
 *
 *   Seeing is not disliking. Scrolling past a card earns a modest penalty and
 *   a short rest, never removal.
 *
 *   Opening is stronger. The viewer went and looked; showing it again the next
 *   morning is the app forgetting. It rests longer and can still come back.
 *
 *   Dismissal is a decision. It stands until the proposition itself changes.
 *
 *   Resolution is not lifecycle at all. When the viewer saves the material,
 *   the tracks enter their library, the engine's exclusion drops them, and the
 *   card stops being generated. Nothing here has to suppress it.
 */

export interface ExposureState {
  recommendationKey: string;
  impressionCount: number;
  openCount: number;
  firstShownAt: Date | null;
  lastShownAt: Date | null;
  lastOpenedAt: Date | null;
  dismissedAt: Date | null;
  actedOnAt: Date | null;
  cooldownUntil: Date | null;
  lastUnderlyingVersion: string | null;
}

export type LifecycleStatus =
  | "UNSEEN"
  | "MATERIALLY_CHANGED"
  | "READY"
  | "COOLING"
  | "DISMISSED"
  | "ACTED_ON";

export interface LifecycleVerdict {
  status: LifecycleStatus;
  eligible: boolean;
  score: number;
  parts: Record<string, number>;
}

const hours = (ms: number) => ms / 3_600_000;

/**
 * Places one candidate in time.
 *
 * `base` is the recommendation's own quality score and is passed through
 * untouched; every term added to it here is a lifecycle term and is bounded,
 * so no amount of freshness can lift a card above a materially better one by
 * more than the configured boosts.
 */
export function evaluate(
  c: Candidate, state: ExposureState | undefined, now: Date,
): LifecycleVerdict {
  const base = c.rankingScore ?? 0;
  const parts: Record<string, number> = { base };

  if (!state) {
    parts.unseen = LIFECYCLE.unseenBoost;
    return { status: "UNSEEN", eligible: true, score: base + parts.unseen, parts };
  }

  const changed = !!state.lastUnderlyingVersion
    && state.lastUnderlyingVersion !== c.underlyingVersion;

  if (state.dismissedAt) {
    // A dismissal stands until the proposition itself is different, and even
    // then only after the suppression window has passed.
    const elapsedDays = hours(now.getTime() - state.dismissedAt.getTime()) / 24;
    if (!changed || elapsedDays < LIFECYCLE.dismissCooldownDays) {
      return { status: "DISMISSED", eligible: false, score: 0, parts };
    }
  }

  if (state.actedOnAt && !changed) {
    return { status: "ACTED_ON", eligible: false, score: 0, parts };
  }

  const cooling = !!state.cooldownUntil && state.cooldownUntil > now;
  if (cooling && !(changed && LIFECYCLE.materialChangeClearsCooldown)) {
    return { status: "COOLING", eligible: false, score: 0, parts };
  }

  parts.impressions = -Math.min(
    LIFECYCLE.impressionPenaltyMax,
    LIFECYCLE.impressionPenalty * state.impressionCount,
  );
  parts.opens = -Math.min(
    LIFECYCLE.openPenaltyMax,
    LIFECYCLE.openPenalty * state.openCount,
  );
  if (changed) parts.materialChange = LIFECYCLE.materialChangeBoost;

  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  return {
    status: changed ? "MATERIALLY_CHANGED" : "READY",
    eligible: true,
    score,
    parts,
  };
}

/** When a card should rest until, given what just happened to it. */
export function cooldownFor(
  event: "IMPRESSION" | "OPEN" | "DISMISS" | "ACTION", now: Date,
): Date | null {
  const h = event === "OPEN" ? LIFECYCLE.openCooldownHours
    : event === "IMPRESSION" ? LIFECYCLE.impressionCooldownHours
    : event === "DISMISS" ? LIFECYCLE.dismissCooldownDays * 24
    : null;
  return h === null ? null : new Date(now.getTime() + h * 3_600_000);
}

/**
 * Cinematic easing functions.
 * All functions map t ∈ [0,1] → [0,1].
 */

export type EasingFn = (t: number) => number;

export const linear:           EasingFn = t => t;
export const easeIn:           EasingFn = t => t * t;
export const easeOut:          EasingFn = t => 1 - (1 - t) ** 2;
export const easeInOut:        EasingFn = t =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
export const easeInOutCubic:   EasingFn = t =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
export const easeInOutQuint:   EasingFn = t =>
  t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;

const EASING_MAP: Record<string, EasingFn> = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  easeInOutCubic,
  easeInOutQuint,
};

export function getEasing(name?: string): EasingFn {
  return (name ? (EASING_MAP[name] ?? easeInOut) : easeInOut);
}

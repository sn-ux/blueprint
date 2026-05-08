/**
 * Cinematic timeline — keyframe interpolation.
 *
 * Pure functions; no React, no side-effects.
 * Given a sequence + elapsed time (seconds), returns the interpolated
 * camera state for that frame.
 */

import { CameraKeyframe, CinematicFrame, CinematicSequence } from "./types";
import { getEasing } from "./easing";

// ── Math helpers ──────────────────────────────────────────────────────────────

/**
 * Build the 3×3 rotation matrix (row-major) from Euler angles.
 * Matches the matFromEuler() defined in app/page.tsx and WorldSphere.tsx —
 * apply Y-rotation first (orbit), then X-rotation (tilt).
 */
export function matFromEuler(rx: number, ry: number): number[] {
  const cX = Math.cos(rx), sX = Math.sin(rx);
  const cY = Math.cos(ry), sY = Math.sin(ry);
  return [
     cY,       0,   sY,
     sX * sY,  cX, -sX * cY,
    -cX * sY,  sX,  cX * cY,
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate a rotation angle taking the shortest arc (avoiding ±π wrapping).
 */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  // Normalise to (−π, π]
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute the CinematicFrame for a given playback time `t` (seconds).
 *
 * - Clamps `t` to [0, sequence.duration].
 * - Finds the keyframe segment containing `t`.
 * - Applies the segment's easing function.
 * - Interpolates zoom, rx, ry then builds the rotation matrix.
 */
export function getCinematicFrame(
  sequence: CinematicSequence,
  t: number,
): CinematicFrame {
  const kfs = sequence.keyframes;
  if (kfs.length === 0) throw new Error("[cinematic] No keyframes defined");

  const tc = Math.max(0, Math.min(t, sequence.duration));
  const progress = sequence.duration > 0 ? tc / sequence.duration : 1;

  // Before first keyframe
  if (tc <= kfs[0].t) {
    return {
      zoom:    kfs[0].zoom,
      rotMat:  matFromEuler(kfs[0].rx, kfs[0].ry),
      progress,
    };
  }

  // After last keyframe
  const last = kfs[kfs.length - 1];
  if (tc >= last.t) {
    return {
      zoom:    last.zoom,
      rotMat:  matFromEuler(last.rx, last.ry),
      progress,
    };
  }

  // Find the segment [i, i+1] whose time range straddles tc
  let seg = 0;
  for (let j = 0; j < kfs.length - 1; j++) {
    if (kfs[j].t <= tc && tc < kfs[j + 1].t) { seg = j; break; }
  }

  const a: CameraKeyframe = kfs[seg];
  const b: CameraKeyframe = kfs[seg + 1];
  const span   = b.t - a.t;
  const localT = span === 0 ? 0 : (tc - a.t) / span;
  const easedT = getEasing(a.easing)(localT);

  return {
    zoom:    lerp(a.zoom, b.zoom, easedT),
    rotMat:  matFromEuler(
      lerp(a.rx,       b.rx, easedT),
      lerpAngle(a.ry,  b.ry, easedT),
    ),
    progress,
  };
}

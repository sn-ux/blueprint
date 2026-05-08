/**
 * Cinematic sequences — pre-built camera choreographies.
 *
 * Each sequence is a list of CameraKeyframe objects.  The timeline
 * interpolates between them; each keyframe specifies the easing for the
 * segment that follows it.
 *
 * Orientation reference:
 *   SPHERE_INIT_RX = −0.3074  (tilt downward slightly)
 *   SPHERE_INIT_RY = −1.9603  (Electronic / Ambient faces the camera)
 */

import { CinematicSequence } from "./types";
import { SPHERE_INIT_RX, SPHERE_INIT_RY } from "@/lib/sphereConfig";

const RX = SPHERE_INIT_RX;   // base X tilt
const RY = SPHERE_INIT_RY;   // base Y yaw

// ─────────────────────────────────────────────────────────────────────────────
// 40-SECOND PRESENTATION SEQUENCE
// Designed for investor decks, product demos, landing pages.
//
// Act 1 (0–10s):  Slow full-sphere reveal — gentle orbit, slight tilt drift
// Act 2 (10–22s): Graceful zoom into genre territory — subgenres emerge
// Act 3 (22–30s): Drift & hover — ambient exploration of the detailed face
// Act 4 (30–40s): Cinematic pull-back — sphere re-reveals, orbit closes
// ─────────────────────────────────────────────────────────────────────────────
export const SEQ_40S: CinematicSequence = {
  name:     "blueprint-40s",
  duration: 40,
  fps:      60,
  resolution: { width: 1920, height: 1080 },
  keyframes: [
    // ── Act 1: Full-sphere reveal orbit ──────────────────────────────────────
    { t:  0, zoom: 1.00, rx: RX,         ry: RY,          easing: "easeInOut"      },
    { t:  3, zoom: 1.03, rx: RX - 0.04,  ry: RY - 0.40,   easing: "linear"         },
    { t:  6, zoom: 1.06, rx: RX - 0.07,  ry: RY - 0.85,   easing: "linear"         },
    { t:  9, zoom: 1.08, rx: RX - 0.06,  ry: RY - 1.20,   easing: "easeInOut"      },
    // ── Act 2: Zoom in — subgenres appear at zoom ≥ 1.6 ─────────────────────
    { t: 12, zoom: 1.50, rx: RX - 0.04,  ry: RY - 1.40,   easing: "easeInOutCubic" },
    { t: 15, zoom: 2.00, rx: RX - 0.02,  ry: RY - 1.52,   easing: "easeInOutCubic" },
    { t: 18, zoom: 2.50, rx: RX + 0.01,  ry: RY - 1.58,   easing: "easeInOut"      },
    // ── Act 3: Drift — slow ambient pan across subgenre face ─────────────────
    { t: 21, zoom: 2.60, rx: RX + 0.03,  ry: RY - 1.66,   easing: "easeInOut"      },
    { t: 24, zoom: 2.55, rx: RX + 0.04,  ry: RY - 1.78,   easing: "easeInOut"      },
    { t: 27, zoom: 2.40, rx: RX + 0.02,  ry: RY - 1.92,   easing: "easeInOut"      },
    // ── Act 4: Pull-back reveal ───────────────────────────────────────────────
    { t: 30, zoom: 1.80, rx: RX,         ry: RY - 2.10,   easing: "easeInOutCubic" },
    { t: 33, zoom: 1.20, rx: RX - 0.03,  ry: RY - 2.45,   easing: "easeInOutCubic" },
    { t: 36, zoom: 1.05, rx: RX - 0.06,  ry: RY - 2.85,   easing: "linear"         },
    { t: 40, zoom: 1.00, rx: RX,         ry: RY - Math.PI, easing: "linear"         },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 15-SECOND SHORT — social media, stories, quick previews
// ─────────────────────────────────────────────────────────────────────────────
export const SEQ_15S: CinematicSequence = {
  name:     "blueprint-15s",
  duration: 15,
  fps:      60,
  resolution: { width: 1920, height: 1080 },
  keyframes: [
    { t:  0, zoom: 1.00, rx: RX,         ry: RY,          easing: "easeInOut"      },
    { t:  3, zoom: 1.08, rx: RX - 0.04,  ry: RY - 0.55,   easing: "easeInOut"      },
    { t:  6, zoom: 2.10, rx: RX - 0.01,  ry: RY - 0.85,   easing: "easeInOutCubic" },
    { t:  9, zoom: 2.50, rx: RX + 0.02,  ry: RY - 1.05,   easing: "easeInOut"      },
    { t: 12, zoom: 1.25, rx: RX - 0.01,  ry: RY - 1.45,   easing: "easeInOutCubic" },
    { t: 15, zoom: 1.00, rx: RX,         ry: RY - 1.70,   easing: "linear"         },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 8-SECOND SEAMLESS LOOP — landing page background, ambient display
// Starts and ends at the same position for gapless looping.
// ─────────────────────────────────────────────────────────────────────────────
export const SEQ_LOOP: CinematicSequence = {
  name:     "blueprint-loop",
  duration: 8,
  fps:      60,
  resolution: { width: 1920, height: 1080 },
  keyframes: [
    { t: 0, zoom: 1.06, rx: RX - 0.05, ry: RY,                 easing: "linear" },
    { t: 4, zoom: 1.06, rx: RX + 0.05, ry: RY - Math.PI,       easing: "linear" },
    { t: 8, zoom: 1.06, rx: RX - 0.05, ry: RY - 2 * Math.PI,   easing: "linear" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// /MAP PAGE SEQUENCES
// These are optimised for the CinematicPlayer at /map.
// Zoom caps at 1.45 (below the 1.6 subgenre-reveal threshold) so no per-genre
// data fetching is needed — the full sphere renders cleanly at every zoom level.
// The loop flag in each sequence drives the player to restart from frame 0.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MAP_AMBIENT — ~16 s seamless loop
 * Gentle continuous orbit with a soft breathing zoom.
 * Ideal for landing page backgrounds / ambient displays.
 */
export const MAP_AMBIENT: CinematicSequence = {
  name:     "map-ambient",
  duration: 16,
  fps:      60,
  resolution: { width: 1920, height: 1080 },
  keyframes: [
    { t:  0, zoom: 1.04, rx: RX - 0.04, ry: RY,              easing: "linear"    },
    { t:  4, zoom: 1.08, rx: RX + 0.02, ry: RY - 0.78,       easing: "linear"    },
    { t:  8, zoom: 1.06, rx: RX + 0.04, ry: RY - Math.PI,    easing: "linear"    },
    { t: 12, zoom: 1.04, rx: RX - 0.02, ry: RY - Math.PI - 0.78, easing: "linear" },
    { t: 16, zoom: 1.04, rx: RX - 0.04, ry: RY - 2*Math.PI,  easing: "linear"    },
  ],
};

/**
 * MAP_INVESTOR — ~42 s cinematic presentation
 * Full sweep: reveal orbit → graceful approach → hover near genre territory → pull-back.
 * Stays below subgenre-reveal zoom so no selection state is required.
 */
export const MAP_INVESTOR: CinematicSequence = {
  name:     "map-investor",
  duration: 42,
  fps:      60,
  resolution: { width: 1920, height: 1080 },
  keyframes: [
    // ── Act 1: Reveal — slow orbit of the full globe ──────────────────────
    { t:  0, zoom: 1.00, rx: RX,         ry: RY,          easing: "easeInOut"      },
    { t:  3, zoom: 1.02, rx: RX - 0.03,  ry: RY - 0.38,   easing: "linear"         },
    { t:  6, zoom: 1.05, rx: RX - 0.06,  ry: RY - 0.80,   easing: "linear"         },
    { t:  9, zoom: 1.07, rx: RX - 0.05,  ry: RY - 1.15,   easing: "easeInOut"      },
    // ── Act 2: Approach — zoom in toward a genre region ───────────────────
    { t: 13, zoom: 1.18, rx: RX - 0.03,  ry: RY - 1.38,   easing: "easeInOutCubic" },
    { t: 17, zoom: 1.38, rx: RX - 0.01,  ry: RY - 1.52,   easing: "easeInOutCubic" },
    { t: 20, zoom: 1.44, rx: RX + 0.01,  ry: RY - 1.58,   easing: "easeInOut"      },
    // ── Act 3: Hover — ambient drift across the face ──────────────────────
    { t: 23, zoom: 1.45, rx: RX + 0.03,  ry: RY - 1.68,   easing: "easeInOut"      },
    { t: 26, zoom: 1.44, rx: RX + 0.04,  ry: RY - 1.80,   easing: "easeInOut"      },
    { t: 29, zoom: 1.40, rx: RX + 0.02,  ry: RY - 1.96,   easing: "easeInOut"      },
    // ── Act 4: Pull-back — reveal the surrounding structure ───────────────
    { t: 32, zoom: 1.22, rx: RX,         ry: RY - 2.18,   easing: "easeInOutCubic" },
    { t: 36, zoom: 1.06, rx: RX - 0.03,  ry: RY - 2.60,   easing: "easeInOutCubic" },
    { t: 39, zoom: 1.02, rx: RX - 0.05,  ry: RY - 2.95,   easing: "linear"         },
    { t: 42, zoom: 1.00, rx: RX,         ry: RY - Math.PI, easing: "linear"         },
  ],
};

/**
 * MAP_FAST — ~16 s punchy sequence
 * Quick showcase for social media, stories, and short-form content.
 */
export const MAP_FAST: CinematicSequence = {
  name:     "map-fast",
  duration: 16,
  fps:      60,
  resolution: { width: 1920, height: 1080 },
  keyframes: [
    { t:  0, zoom: 1.00, rx: RX,         ry: RY,          easing: "easeInOut"      },
    { t:  3, zoom: 1.08, rx: RX - 0.04,  ry: RY - 0.55,   easing: "easeInOut"      },
    { t:  6, zoom: 1.40, rx: RX - 0.01,  ry: RY - 0.88,   easing: "easeInOutCubic" },
    { t:  9, zoom: 1.44, rx: RX + 0.02,  ry: RY - 1.08,   easing: "easeInOut"      },
    { t: 12, zoom: 1.18, rx: RX - 0.01,  ry: RY - 1.50,   easing: "easeInOutCubic" },
    { t: 16, zoom: 1.00, rx: RX,         ry: RY - 1.72,   easing: "linear"         },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry — maps query param / shortcut names → sequences
// ─────────────────────────────────────────────────────────────────────────────
export const SEQUENCES: Record<string, CinematicSequence> = {
  // Homepage capture sequences (used by Shift+R / ?record= param)
  "40s":            SEQ_40S,
  "15s":            SEQ_15S,
  "loop":           SEQ_LOOP,
  // /map page sequences (used by CinematicPlayer)
  "map-ambient":    MAP_AMBIENT,
  "map-investor":   MAP_INVESTOR,
  "map-fast":       MAP_FAST,
};

/** Resolve a name (or undefined → default) to a sequence. */
export function resolveSequence(name?: string | null): CinematicSequence {
  return (name ? (SEQUENCES[name] ?? SEQ_40S) : SEQ_40S);
}

/** Resolve a name to a /map sequence (defaults to MAP_INVESTOR). */
export function resolveMapSequence(name?: string | null): CinematicSequence {
  const MAP_DEFAULTS: Record<string, CinematicSequence> = {
    ambient:  MAP_AMBIENT,
    investor: MAP_INVESTOR,
    fast:     MAP_FAST,
  };
  return (name ? (MAP_DEFAULTS[name] ?? MAP_INVESTOR) : MAP_INVESTOR);
}

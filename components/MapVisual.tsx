"use client";

/**
 * MapVisual — Page 4 globe
 *
 * Renders a full MapLibre GL globe using CartoDB Dark Matter tiles (free, no API
 * key) with a 22-second autonomous animation loop:
 *
 *   Phase A  0.00–0.30 (6.6 s) — ease-in-out zoom out: Menlo Park → full Earth
 *   Phase B  0.30–0.65 (7.7 s) — linear full-globe rotation, 360° westward
 *   Phase C  0.65–1.00 (7.7 s) — ease-in-out zoom in: full Earth → Menlo Park
 *
 * All phase boundaries are camera-continuous (no visual jumps at loop wrap-around).
 * MapLibre handles map detail, label hierarchy, and collision detection natively.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Map style ────────────────────────────────────────────────────────────── *
 *  CartoDB Dark Matter — free, no API key, close to Apple Maps dark mode.   */
const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/* ── Animation timing ─────────────────────────────────────────────────────── */
const LOOP_MS        = 22_000;  // 22 s total loop
const P_ZOOM_OUT_END = 0.30;    // 0.00–0.30 → zoom out  (6.6 s)
const P_ROTATE_END   = 0.65;    // 0.30–0.65 → rotation  (7.7 s)
//                              // 0.65–1.00 → zoom in   (7.7 s)

/* ── Camera keyframes ─────────────────────────────────────────────────────── *
 *  t=0: Menlo Park street level (MapLibre zoom 14)                           *
 *  t=1: Full Earth (MapLibre zoom 1.8)                                       *
 *                                                                            *
 *  getCamera() linearly interpolates between keyframes.                     *
 *  Easing is applied once by getLoopCamera() — no double-easing.            */

const CAM_PATH = [
  { t: 0.00, zoom: 14.0, lat:  37.453, lng: -122.182 },  // Menlo Park
  { t: 0.25, zoom:  9.5, lat:  37.50,  lng: -122.10  },  // Bay Area
  { t: 0.50, zoom:  6.0, lat:  37.50,  lng: -119.50  },  // California
  { t: 0.75, zoom:  3.8, lat:  38.00,  lng:  -97.00  },  // Continental USA
  { t: 1.00, zoom:  1.8, lat:  25.00,  lng:  -30.00  },  // Full Earth
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Smooth cubic ease-in-out — applied to zoom-out and zoom-in phases. */
const easeIO = (u: number): number =>
  u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

/** Linear interpolation between CAM_PATH keyframes. No inner easing. */
function getCamFromPath(t: number): { zoom: number; lat: number; lng: number } {
  let i = 0;
  while (i < CAM_PATH.length - 2 && CAM_PATH[i + 1].t <= t) i++;
  const a = CAM_PATH[i], b = CAM_PATH[i + 1];
  const u = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  return {
    zoom: a.zoom + (b.zoom - a.zoom) * u,
    lat:  a.lat  + (b.lat  - a.lat)  * u,
    lng:  a.lng  + (b.lng  - a.lng)  * u,
  };
}

/**
 * Returns the MapLibre camera state for a given animation loop phase (0→1).
 *
 * Phase A (zoom out): eased t 0→1 through camera path.
 * Phase B (rotate):   globe held at t=1, longitude advances linearly −360°.
 * Phase C (zoom in):  eased t 1→0 through camera path.
 *
 * Camera is continuous at all phase boundaries:
 *   A→B: both yield getCamFromPath(1)
 *   B→C: longitude wrapped 360° ≡ same screen position in globe projection
 *   C→A: both yield getCamFromPath(0) = Menlo Park
 */
function getLoopCamera(p: number): { center: [number, number]; zoom: number } {
  // Phase A — zoom out
  if (p < P_ZOOM_OUT_END) {
    const cam = getCamFromPath(easeIO(p / P_ZOOM_OUT_END));
    return { center: [cam.lng, cam.lat], zoom: cam.zoom };
  }

  // Phase B — rotation (constant angular speed = uniform visual motion)
  if (p < P_ROTATE_END) {
    const u    = (p - P_ZOOM_OUT_END) / (P_ROTATE_END - P_ZOOM_OUT_END);
    const base = getCamFromPath(1.0);
    // Advance longitude westward; 360° completes a full Earth rotation
    return { center: [base.lng - u * 360, base.lat], zoom: base.zoom };
  }

  // Phase C — zoom in (exact reverse of Phase A)
  const u   = (p - P_ROTATE_END) / (1 - P_ROTATE_END);
  const cam = getCamFromPath(1 - easeIO(u));
  return { center: [cam.lng, cam.lat], zoom: cam.zoom };
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function MapVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initialise MapLibre map — non-interactive (cinematic mode)
    const map = new maplibregl.Map({
      container,
      style:              STYLE_URL,
      center:             [-122.182, 37.453],
      zoom:               14,
      interactive:        false,
      attributionControl: false,
      renderWorldCopies:  false,
    });

    let loopPhase = 0;
    let last      = 0;

    map.on("load", () => {
      // ── Globe projection (MapLibre v3+) ───────────────────────────────────
      // Falls back to Mercator in older builds — map still works.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (map as any).setProjection?.("globe"); } catch { /* ignore */ }

      // ── Atmospheric fog — black space around the globe ────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).setFog?.({
          range:             [0.5, 10],
          color:             "#000000",
          "high-color":      "#000010",
          "horizon-blend":   0.10,
          "space-color":     "#000000",
          "star-intensity":  0.0,
        });
      } catch { /* ignore */ }

      // ── RAF animation loop ────────────────────────────────────────────────
      function frame(now: number) {
        const dt  = last ? Math.min(now - last, 50) : 16;
        last      = now;
        loopPhase = (loopPhase + dt / LOOP_MS) % 1;

        const { center, zoom } = getLoopCamera(loopPhase);
        // jumpTo() sets the camera instantly each frame — with per-frame
        // computed positions this is identical to a smooth animation.
        map.jumpTo({ center, zoom });

        rafRef.current = requestAnimationFrame(frame);
      }

      rafRef.current = requestAnimationFrame(frame);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width:    "100%",
        height:   "100%",
        background: "#000000",
      }}
    />
  );
}

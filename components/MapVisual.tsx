"use client";

/**
 * MapVisual — Page 4 globe
 *
 * Renders a full MapLibre GL globe using CartoDB Dark Matter tiles (free, no API
 * key) with a 60-second autonomous animation loop:
 *
 *   Phase A  0.00–0.40 (24 s) — linear zoom out: Menlo Park → full Earth
 *   Phase B  0.40–0.65 (15 s) — linear full-globe rotation, 360° westward
 *   Phase C  0.65–1.00 (21 s) — linear zoom in: full Earth → Menlo Park
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
const LOOP_MS        = 60_000;  // 60 s total loop — slow, cinematic reveal
const P_ZOOM_OUT_END = 0.40;    // 0.00–0.40 → zoom out  (24 s)
const P_ROTATE_END   = 0.65;    // 0.40–0.65 → rotation  (15 s)
//                              // 0.65–1.00 → zoom in   (21 s)

/* ── Camera keyframes ─────────────────────────────────────────────────────── *
 *  t=0: Menlo Park street level (MapLibre zoom 14)                           *
 *  t=1: Full Earth (MapLibre zoom 1.8)                                       *
 *                                                                            *
 *  Design goals:                                                              *
 *   • California stays the visual anchor throughout the pull-back            *
 *   • Longitude drifts only gently eastward (−122 → −108) so California      *
 *     never leaves the frame until the true global view                      *
 *   • Latitude holds near 37 °N until the final keyframe, giving a straight  *
 *     southward tilt as the full globe fills the screen                      *
 *   • Equal ~1.5-zoom-unit segments → constant perceived zoom rate           */

const CAM_PATH = [
  { t: 0.000, zoom: 14.0, lat: 37.45, lng: -122.18 },  // Menlo Park street
  { t: 0.125, zoom: 12.5, lat: 37.48, lng: -121.80 },  // Bay Area close
  { t: 0.250, zoom: 11.0, lat: 37.40, lng: -121.20 },  // Bay Area wide
  { t: 0.375, zoom:  9.5, lat: 37.20, lng: -120.40 },  // Central California
  { t: 0.500, zoom:  8.0, lat: 36.90, lng: -119.70 },  // Southern California
  { t: 0.625, zoom:  6.5, lat: 36.50, lng: -118.80 },  // California full
  { t: 0.750, zoom:  5.0, lat: 36.00, lng: -116.50 },  // California + Nevada
  { t: 0.875, zoom:  3.5, lat: 34.50, lng: -113.00 },  // Western USA
  { t: 1.000, zoom:  1.8, lat: 30.00, lng: -108.00 },  // Full Earth, CA centred
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * Catmull-Rom cubic spline for a single scalar channel.
 * p0..p3 are the four surrounding control points; t ∈ [0, 1] interpolates
 * between p1 and p2.  The spline is C1-continuous: velocity at each knot
 * equals the chord from the previous to the next point (×0.5), so there are
 * no velocity jumps at keyframe boundaries.
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
      2 * p1
    + (-p0 + p2)                    * t
    + ( 2*p0 - 5*p1 + 4*p2 - p3)   * t2
    + (-p0   + 3*p1 - 3*p2 + p3)   * t3
  );
}

/**
 * Catmull-Rom interpolation through CAM_PATH.
 *
 * Clamped boundary control points (repeat the first / last keyframe) prevent
 * overshoot at t=0 and t=1, while interior segments stay fully smooth.
 */
function getCamFromPath(t: number): { zoom: number; lat: number; lng: number } {
  const n = CAM_PATH.length;
  let i = 0;
  while (i < n - 2 && CAM_PATH[i + 1].t <= t) i++;

  const u  = Math.max(0, Math.min(1, (t - CAM_PATH[i].t) / (CAM_PATH[i + 1].t - CAM_PATH[i].t)));
  const p0 = CAM_PATH[Math.max(0,     i - 1)];
  const p1 = CAM_PATH[i];
  const p2 = CAM_PATH[Math.min(n - 1, i + 1)];
  const p3 = CAM_PATH[Math.min(n - 1, i + 2)];

  return {
    zoom: catmullRom(p0.zoom, p1.zoom, p2.zoom, p3.zoom, u),
    lat:  catmullRom(p0.lat,  p1.lat,  p2.lat,  p3.lat,  u),
    lng:  catmullRom(p0.lng,  p1.lng,  p2.lng,  p3.lng,  u),
  };
}

/**
 * Returns the MapLibre camera state for a given animation loop phase (0→1).
 *
 * Phase A (zoom out): Catmull-Rom spline t 0→1 through camera path.
 *   California stays centred; camera pulls back from Menlo Park to full Earth.
 * Phase B (rotate):   globe held at t=1, longitude advances linearly −360°.
 * Phase C (zoom in):  Catmull-Rom spline t 1→0 (reverse of Phase A).
 *
 * Equal-velocity keyframes (each segment ≈ 1.5 zoom units) combined with
 * Catmull-Rom C1-continuous interpolation means the zoom rate is both
 * perceptually constant and physically smooth — no slow start, no mid-rush,
 * no velocity kicks at keyframe boundaries.
 *
 * Camera is continuous at all phase boundaries:
 *   A→B: both yield getCamFromPath(1)
 *   B→C: longitude wrapped 360° ≡ same screen position in globe projection
 *   C→A: both yield getCamFromPath(0) = Menlo Park
 */
function getLoopCamera(p: number): { center: [number, number]; zoom: number } {
  // Phase A — zoom out (linear, constant zoom rate)
  if (p < P_ZOOM_OUT_END) {
    const cam = getCamFromPath(p / P_ZOOM_OUT_END);
    return { center: [cam.lng, cam.lat], zoom: cam.zoom };
  }

  // Phase B — rotation (constant angular speed = uniform visual motion)
  if (p < P_ROTATE_END) {
    const u    = (p - P_ZOOM_OUT_END) / (P_ROTATE_END - P_ZOOM_OUT_END);
    const base = getCamFromPath(1.0);
    // Advance longitude westward; 360° completes a full Earth rotation
    return { center: [base.lng - u * 360, base.lat], zoom: base.zoom };
  }

  // Phase C — zoom in (linear reverse, same constant rate as zoom out)
  const u   = (p - P_ROTATE_END) / (1 - P_ROTATE_END);
  const cam = getCamFromPath(1 - u);
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

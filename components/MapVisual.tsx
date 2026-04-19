"use client";

/**
 * MapVisual — Page 4 globe
 *
 * Renders a full MapLibre GL map in globe projection using CartoDB Dark Matter
 * tiles (free, no API key) with a 60-second cinematic American city tour:
 *
 *   San Francisco → Los Angeles → UCLA → Chicago → New York
 *   → Atlanta → Miami → Dallas → San Francisco  (seamless loop)
 *
 * Camera path uses a periodic Catmull-Rom spline for C1-continuous motion:
 * no velocity jumps at waypoints, no snapping, seamless loop.
 * Transit waypoints between distant city pairs zoom the camera out for a
 * natural "fly-over" arc before diving back into each destination.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Map style ────────────────────────────────────────────────────────────── *
 *  CartoDB Dark Matter — free, no API key, close to Apple Maps dark mode.   */
const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/* ── Timing ───────────────────────────────────────────────────────────────── */
const LOOP_MS = 60_000;   // 60 s per full city tour

/* ── City tour waypoints ──────────────────────────────────────────────────── *
 *  City stops have zoom 11–13.5 so neighbourhood labels are readable.        *
 *  Transit waypoints (lower zoom) create natural "fly-over" arcs between     *
 *  distant cities: the camera lifts out, travels, then descends again.       *
 *                                                                             *
 *  t values are chosen so city dwell ≈ 4–5 s, long transits ≈ 6 s @ 60 s.  *
 *  The spline is periodic: after the last entry it flows back to [0] with    *
 *  matching velocity — the loop seam at t = 0/1 is invisible.               */

const TOUR = [
  // ── San Francisco / Bay Area ──────────────────────────────────────────────
  { t: 0.000, zoom: 11.0, lat:  37.770, lng: -122.420 },
  // SF → LA transit (Central Valley, coast range visible)
  { t: 0.065, zoom:  7.5, lat:  36.200, lng: -120.400 },
  // ── Los Angeles — downtown ────────────────────────────────────────────────
  { t: 0.135, zoom: 11.0, lat:  34.052, lng: -118.244 },
  // ── UCLA — Westwood (zoomed in so campus labels are clearly visible) ──────
  { t: 0.205, zoom: 13.5, lat:  34.068, lng: -118.445 },
  // Transcontinental flyover (Arizona / Colorado plateau)
  { t: 0.285, zoom:  5.5, lat:  37.500, lng: -108.000 },
  // ── Chicago — The Loop ────────────────────────────────────────────────────
  { t: 0.385, zoom: 11.0, lat:  41.878, lng:  -87.630 },
  // Chicago → NYC transit (northern Ohio)
  { t: 0.450, zoom:  8.0, lat:  41.200, lng:  -80.500 },
  // ── New York City — Manhattan ─────────────────────────────────────────────
  { t: 0.520, zoom: 11.0, lat:  40.712, lng:  -74.006 },
  // NYC → Atlanta transit (Virginia / Carolinas)
  { t: 0.583, zoom:  8.5, lat:  37.000, lng:  -80.000 },
  // ── Atlanta ───────────────────────────────────────────────────────────────
  { t: 0.645, zoom: 11.0, lat:  33.749, lng:  -84.388 },
  // Atlanta → Miami (central Florida coast)
  { t: 0.710, zoom:  9.0, lat:  29.000, lng:  -82.000 },
  // ── Miami ─────────────────────────────────────────────────────────────────
  { t: 0.770, zoom: 11.5, lat:  25.774, lng:  -80.194 },
  // Miami → Dallas flyover (Gulf of Mexico)
  { t: 0.825, zoom:  7.0, lat:  28.500, lng:  -88.500 },
  // ── Dallas ────────────────────────────────────────────────────────────────
  { t: 0.890, zoom: 11.0, lat:  32.776, lng:  -96.797 },
  // Dallas → SF transit (Southwest desert — loops back to Bay Area)
  { t: 0.950, zoom:  6.0, lat:  35.500, lng: -110.000 },
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * Catmull-Rom cubic spline for a single scalar channel.
 * Interpolates between p1 and p2 using p0 and p3 as outer tangent guides.
 * C1-continuous: velocity at each knot = chord(prev → next) × 0.5, so
 * there are no velocity jumps where segments meet.
 */
function catmullRom(
  p0: number, p1: number, p2: number, p3: number, t: number
): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
      2 * p1
    + (-p0 + p2)                   * t
    + ( 2*p0 - 5*p1 + 4*p2 - p3)  * t2
    + (-p0   + 3*p1 - 3*p2 + p3)  * t3
  );
}

/**
 * Periodic Catmull-Rom interpolation through TOUR waypoints.
 *
 * t ∈ [0, 1) maps to the full city-tour loop.  Control points wrap with
 * modulo so the seam at t = 0/1 is C1-continuous — the loop flows back
 * into San Francisco with matching velocity, no snap or stutter.
 *
 * Zoom is clamped to [1.5, 16] to prevent spline overshoot from producing
 * nonsensical values between keyframes with very different zoom levels.
 */
function getTourCamera(t: number): { zoom: number; lat: number; lng: number } {
  const n = TOUR.length;

  // Find the segment [TOUR[i].t, nextT) that contains t.
  // The last segment [TOUR[n-1].t, 1.0) wraps back to TOUR[0].
  let i = n - 1;
  for (let j = 0; j < n - 1; j++) {
    if (t < TOUR[j + 1].t) { i = j; break; }
  }

  const tStart = TOUR[i].t;
  const tEnd   = i < n - 1 ? TOUR[i + 1].t : 1.0;
  const u      = Math.max(0, Math.min(1, (t - tStart) / (tEnd - tStart)));

  // Periodic control points — wrap with modulo for seamless loop
  const p0 = TOUR[(i - 1 + n) % n];
  const p1 = TOUR[i];
  const p2 = TOUR[(i + 1) % n];
  const p3 = TOUR[(i + 2) % n];

  return {
    zoom: Math.max(1.5, Math.min(16, catmullRom(p0.zoom, p1.zoom, p2.zoom, p3.zoom, u))),
    lat:  catmullRom(p0.lat,  p1.lat,  p2.lat,  p3.lat,  u),
    lng:  catmullRom(p0.lng,  p1.lng,  p2.lng,  p3.lng,  u),
  };
}

/** Returns the MapLibre camera state for a given loop phase t ∈ [0, 1). */
function getLoopCamera(p: number): { center: [number, number]; zoom: number } {
  const { zoom, lat, lng } = getTourCamera(p);
  return { center: [lng, lat], zoom };
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
      center:             [-122.420, 37.770],
      zoom:               11,
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
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).setFog?.({
          range:            [0.5, 10],
          color:            "#000000",
          "high-color":     "#000010",
          "horizon-blend":  0.10,
          "space-color":    "#000000",
          "star-intensity": 0.0,
        });
      } catch { /* ignore */ }

      // ── RAF animation loop ────────────────────────────────────────────────
      function frame(now: number) {
        const dt  = last ? Math.min(now - last, 50) : 16;
        last      = now;
        loopPhase = (loopPhase + dt / LOOP_MS) % 1;

        const { center, zoom } = getLoopCamera(loopPhase);
        // jumpTo() applies the camera instantly each frame; combined with
        // per-frame Catmull-Rom positions this produces smooth animation.
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
        position:   "relative",
        width:      "100%",
        height:     "100%",
        background: "#000000",
      }}
    />
  );
}

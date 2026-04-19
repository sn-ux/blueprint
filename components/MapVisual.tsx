"use client";

/**
 * MapVisual — Page 4 globe
 *
 * Renders a full MapLibre GL map in globe projection using CartoDB Dark Matter
 * tiles (free, no API key) with a 120-second cinematic American city tour:
 *
 *   San Francisco → Los Angeles → UCLA → Chicago → New York
 *   → Atlanta → Miami → Dallas → San Francisco  (seamless loop)
 *
 * Every transition follows the Google-Earth / Apple-Maps pattern:
 *   1. Zoom out while hovering over the current city (pullback waypoint)
 *   2. Travel to the next city at altitude (transit waypoint)
 *   3. Descend back into the next city (arrival waypoint)
 *   4. Zoom in to street / neighbourhood level (city waypoint)
 *
 * "Pullback" waypoints share the same lat/lng as their city but carry a lower
 * zoom.  Because they flank each city symmetrically in zoom space, Catmull-
 * Rom's tangent rule makes the zoom velocity near-zero at each city peak —
 * producing a natural dwell without any extra code.
 *
 * Camera path uses a periodic Catmull-Rom spline (C1-continuous), so the loop
 * seam at t = 0/1 is invisible.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Map style ────────────────────────────────────────────────────────────── *
 *  CartoDB Dark Matter — free, no API key, close to Apple Maps dark mode.   */
const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/* ── Timing ───────────────────────────────────────────────────────────────── */
const LOOP_MS = 120_000;   // 120 s per full city tour — cinematic, unhurried

/* ── City tour waypoints ──────────────────────────────────────────────────── *
 *  Structure per city stop:                                                   *
 *    arrival  — same lat/lng as city, pulled back (zoom 7–8)                  *
 *    city     — full zoom-in (zoom 11–13.5), labels readable                  *
 *    pullback — same lat/lng as city, pulled back (zoom 7–8)                  *
 *    transit  — geographic midpoint, deep altitude (zoom 4.5–7)               *
 *    (next arrival)                                                            *
 *                                                                             *
 *  t values space out so each city dwell ≈ 5 s, each transition ≈ 10 s       *
 *  at 120 s total.  Segment time = (t_next – t_this) × 120 s.               */

const TOUR = [

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  SAN FRANCISCO / BAY AREA  ━━━━
  //   — no explicit arrival; wrap-around from Dallas transit lands here
  { t: 0.000, zoom: 11.0, lat:  37.770, lng: -122.420 },   // SF city
  { t: 0.038, zoom:  7.5, lat:  37.770, lng: -122.420 },   // SF pullback
  { t: 0.078, zoom:  6.0, lat:  36.200, lng: -120.400 },   // transit: Central Valley

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  LOS ANGELES  ━━━━━━━
  { t: 0.118, zoom:  8.0, lat:  34.052, lng: -118.244 },   // LA arrival
  { t: 0.158, zoom: 11.0, lat:  34.052, lng: -118.244 },   // LA city

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  UCLA / WESTWOOD  ━━━━━━
  //   Close to LA — direct zoom-in, no deep pullback needed
  { t: 0.205, zoom: 13.5, lat:  34.068, lng: -118.445 },   // UCLA city (labels visible)
  { t: 0.247, zoom:  6.5, lat:  34.068, lng: -118.445 },   // UCLA pullback (launch for jump)
  { t: 0.310, zoom:  4.5, lat:  37.500, lng: -108.000 },   // transit: Arizona / Colorado plateau

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  CHICAGO  ━━━━━
  { t: 0.365, zoom:  7.5, lat:  41.878, lng:  -87.630 },   // Chicago arrival
  { t: 0.405, zoom: 11.0, lat:  41.878, lng:  -87.630 },   // Chicago city
  { t: 0.440, zoom:  7.5, lat:  41.878, lng:  -87.630 },   // Chicago pullback
  { t: 0.478, zoom:  6.5, lat:  41.200, lng:  -80.500 },   // transit: northern Ohio

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  NEW YORK CITY  ━━━
  { t: 0.517, zoom:  8.0, lat:  40.712, lng:  -74.006 },   // NYC arrival
  { t: 0.555, zoom: 11.0, lat:  40.712, lng:  -74.006 },   // NYC city
  { t: 0.588, zoom:  7.5, lat:  40.712, lng:  -74.006 },   // NYC pullback
  { t: 0.623, zoom:  7.0, lat:  37.000, lng:  -80.000 },   // transit: Virginia / Carolinas

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ATLANTA  ━━━━━
  { t: 0.658, zoom:  8.0, lat:  33.749, lng:  -84.388 },   // Atlanta arrival
  { t: 0.695, zoom: 11.0, lat:  33.749, lng:  -84.388 },   // Atlanta city
  { t: 0.728, zoom:  8.5, lat:  29.000, lng:  -82.000 },   // transit: central Florida coast

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  MIAMI  ━━━━━
  { t: 0.768, zoom: 11.5, lat:  25.774, lng:  -80.194 },   // Miami city
  { t: 0.803, zoom:  7.0, lat:  25.774, lng:  -80.194 },   // Miami pullback
  { t: 0.843, zoom:  5.5, lat:  28.500, lng:  -88.500 },   // transit: Gulf of Mexico

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  DALLAS  ━━━━━
  { t: 0.882, zoom:  7.5, lat:  32.776, lng:  -96.797 },   // Dallas arrival
  { t: 0.920, zoom: 11.0, lat:  32.776, lng:  -96.797 },   // Dallas city
  { t: 0.962, zoom:  5.5, lat:  35.500, lng: -110.000 },   // transit: Southwest desert → SF

];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * Catmull-Rom cubic spline for a single scalar channel.
 * Interpolates between p1 and p2; p0 and p3 set the entry/exit tangents.
 * C1-continuous at every knot: tangent = (next – prev) × 0.5.
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
 * modulo so the seam at t = 0/1 is C1-continuous: the loop returns to San
 * Francisco with matching velocity — no snap, no stutter.
 *
 * Zoom is clamped to [1.5, 16] to absorb any spline overshoot between
 * waypoints with large zoom differences (e.g. UCLA 13.5 → transit 4.5).
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

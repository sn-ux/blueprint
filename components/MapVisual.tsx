"use client";

/**
 * MapVisual — Page 4 globe
 *
 * Renders a full MapLibre GL map in globe projection using CartoDB Dark Matter
 * tiles (free, no API key) with a 200-second cinematic world tour:
 *
 *   Bay Area → Tokyo → Hong Kong → Dubai → Rome → London → New York → Bay Area
 *
 * The route is a continuous westward circumnavigation.  It crosses the
 * International Date Line (Bay Area → Tokyo) and the North Atlantic
 * (London → New York).
 *
 * ── Interpolation ────────────────────────────────────────────────────────────
 * Segment-wise smootherstep lerp (Ken Perlin, 6t⁵ − 15t⁴ + 10t³):
 *   • Zero velocity at every waypoint → natural dwell / smooth landing
 *   • No overshoot, no oscillation
 *   • Seamless loop: velocity at t=0/1 seam matches on both sides
 *
 * Longitude uses a short-path lerp that always takes the ≤180° arc, so the
 * Pacific crossing routes correctly westward through the date line.
 *
 * ── Waypoint design ──────────────────────────────────────────────────────────
 * Every city follows: arrival (altitude) → city (street level) → pullback
 * (altitude) → transit (ocean / continent).  Arrival and pullback share the
 * city's exact lat/lng so the camera zooms in-place before and after each
 * stop — never sliding sideways at street level.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Map style ────────────────────────────────────────────────────────────── *
 *  CartoDB Dark Matter — free, no API key, close to Apple Maps dark mode.   */
const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/* ── Timing ───────────────────────────────────────────────────────────────── */
const LOOP_MS = 200_000;   // 200 s — slow, cinematic, premium

/* ── World-tour waypoints ─────────────────────────────────────────────────── *
 *  Route: Bay Area →(Pacific)→ Tokyo → Hong Kong →(Indian Ocean)→ Dubai      *
 *         →(Med)→ Rome →(Channel)→ London →(Atlantic)→ New York → Bay Area   *
 *                                                                             *
 *  Segment time = (t_next – t_this) × 200 s.  Ocean crossings: ~10–13 s.    *
 *  City dwells: ~7 s.  Transit hops: ~7–8 s.                                 */

const TOUR = [

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  BAY AREA / SAN FRANCISCO  ━━━━
  { t: 0.000, zoom: 11.0, lat:  37.770, lng: -122.420 },   // city
  { t: 0.033, zoom:  7.5, lat:  37.770, lng: -122.420 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  PACIFIC CROSSING  ━━━━━
  //   Short-path lerpLng routes this westward through the date line.
  { t: 0.095, zoom:  3.0, lat:  42.000, lng: -168.000 },   // mid-Pacific

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  TOKYO  ━━━━━━
  { t: 0.148, zoom:  7.5, lat:  35.689, lng:  139.692 },   // arrival
  { t: 0.185, zoom: 11.0, lat:  35.689, lng:  139.692 },   // city (Shinjuku)
  { t: 0.220, zoom:  7.5, lat:  35.689, lng:  139.692 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  HONG KONG  ━━━━━━
  { t: 0.258, zoom:  6.0, lat:  28.000, lng:  122.000 },   // transit: East China Sea
  { t: 0.295, zoom:  8.0, lat:  22.319, lng:  114.169 },   // arrival
  { t: 0.330, zoom: 11.5, lat:  22.319, lng:  114.169 },   // city (Victoria Harbour)
  { t: 0.362, zoom:  7.0, lat:  22.319, lng:  114.169 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  DUBAI  ━━━━━━━
  { t: 0.422, zoom:  3.5, lat:  18.000, lng:   75.000 },   // transit: Indian Ocean
  { t: 0.463, zoom:  7.5, lat:  25.204, lng:   55.270 },   // arrival
  { t: 0.498, zoom: 11.0, lat:  25.204, lng:   55.270 },   // city (Dubai Marina)
  { t: 0.532, zoom:  7.5, lat:  25.204, lng:   55.270 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ROME  ━━━━━━
  { t: 0.573, zoom:  5.5, lat:  36.000, lng:   25.000 },   // transit: Aegean Sea
  { t: 0.610, zoom:  8.0, lat:  41.902, lng:   12.496 },   // arrival
  { t: 0.645, zoom: 11.0, lat:  41.902, lng:   12.496 },   // city (Colosseum area)
  { t: 0.675, zoom:  7.5, lat:  41.902, lng:   12.496 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  LONDON  ━━━━━━
  { t: 0.706, zoom:  7.0, lat:  50.500, lng:    2.500 },   // transit: N. France / Channel
  { t: 0.745, zoom: 11.0, lat:  51.508, lng:   -0.128 },   // city (Central London)
  { t: 0.778, zoom:  7.5, lat:  51.508, lng:   -0.128 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  NORTH ATLANTIC CROSSING  ━━━
  { t: 0.832, zoom:  3.0, lat:  55.000, lng:  -35.000 },   // mid-Atlantic

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  NEW YORK CITY  ━━━━━━
  { t: 0.880, zoom:  7.5, lat:  40.712, lng:  -74.006 },   // arrival
  { t: 0.915, zoom: 11.0, lat:  40.712, lng:  -74.006 },   // city (Manhattan)
  { t: 0.947, zoom:  7.0, lat:  40.712, lng:  -74.006 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  RETURN  ━━━━━━
  { t: 0.968, zoom:  5.0, lat:  38.500, lng: -105.000 },   // transit: Rockies
  { t: 0.983, zoom:  7.5, lat:  37.770, lng: -122.420 },   // Bay Area arrival

];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * Ken Perlin's "smootherstep" (6t⁵ − 15t⁴ + 10t³).
 * Both first and second derivatives are zero at t=0 and t=1, giving a very
 * soft ease-in / ease-out with no perceptible jerk at either end.
 */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Short-path longitude interpolation.
 * Normalises the difference to [−180, 180] so the camera always takes the
 * ≤180° arc — this is what makes the Pacific crossing go westward through
 * the date line instead of eastward the long way around the globe.
 */
function lerpLng(a: number, b: number, u: number): number {
  let diff = b - a;
  while (diff >  180) diff -= 360;
  while (diff < -180) diff += 360;
  return a + diff * u;
}

/**
 * Segment-wise smootherstep interpolation through TOUR waypoints.
 *
 * Within each segment the camera travels on a straight line in
 * (zoom, lat, lng) space, eased by smootherstep so velocity is zero at both
 * endpoints.  The last segment wraps from TOUR[n-1] back to TOUR[0].
 *
 * Because velocity is always zero at waypoint boundaries:
 *   • Each city naturally dwells at peak zoom with no extra dwell logic
 *   • No overshoot, no oscillation, no jitter
 *   • The loop seam at t = 0/1 has matching zero velocity on both sides
 */
function getTourCamera(t: number): { zoom: number; lat: number; lng: number } {
  const n = TOUR.length;

  // Find the segment [TOUR[i].t, nextT) that contains t.
  let i = n - 1;
  for (let j = 0; j < n - 1; j++) {
    if (t < TOUR[j + 1].t) { i = j; break; }
  }

  const tStart = TOUR[i].t;
  const tEnd   = i < n - 1 ? TOUR[i + 1].t : 1.0;
  const u      = smootherstep(Math.max(0, Math.min(1, (t - tStart) / (tEnd - tStart))));

  const a = TOUR[i];
  const b = TOUR[(i + 1) % n];   // wraps to TOUR[0] on the last segment

  return {
    zoom: a.zoom + (b.zoom - a.zoom) * u,
    lat:  a.lat  + (b.lat  - a.lat)  * u,
    lng:  lerpLng(a.lng, b.lng, u),
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
      renderWorldCopies:  true,    // required: camera crosses the date line
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
        // jumpTo() applies the camera instantly each frame; the per-frame
        // smootherstep positions produce a perfectly smooth animation.
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

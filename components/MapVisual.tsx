"use client";

/**
 * MapVisual — Page 4 globe
 *
 * 480-second cinematic world tour, starting and ending in the Bay Area:
 *
 *   Bay Area → Tokyo → Hong Kong → Dubai → Rome → London → New York → Bay Area
 *
 * The route travels westward the whole way, crossing the International Date
 * Line (Bay Area → Tokyo) and the North Atlantic (London → New York).
 *
 * ── Zoom range ────────────────────────────────────────────────────────────────
 *   City stops  zoom 13–13.5  street-level detail, labels readable
 *   Arrivals    zoom 7–8      city visible as a whole
 *   Pullbacks   zoom 6        altitude, city still identifiable
 *   Transits    zoom 2.5–5.5  globe / hemisphere / continent view
 *
 * ── Land-only rule ───────────────────────────────────────────────────────────
 *   Every transit waypoint is centred on a named landmass, never open ocean:
 *     Pacific → Alaska (60 N, 155 W)
 *     Asia    → Eastern China (32 N, 120 E)
 *     Indian  → Central India (20 N, 80 E)
 *     Med     → Western Turkey (39 N, 28 E)
 *     Channel → Central France (49 N, 4 E)
 *     Atlantic→ Greenland ice sheet (70 N, 40 W)
 *     Return  → Colorado Rockies (40 N, 105 W)
 *
 * ── Interpolation ────────────────────────────────────────────────────────────
 *   Segment-wise smootherstep lerp (6t⁵ − 15t⁴ + 10t³) with short-path
 *   longitude lerp to handle the date-line crossing cleanly.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Map style ────────────────────────────────────────────────────────────── */
const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/* ── Timing ───────────────────────────────────────────────────────────────── */
const LOOP_MS = 480_000;   // 8 min — slow, meditative, globe-scale

/* ── World-tour waypoints ─────────────────────────────────────────────────── *
 *  Segment duration = (t_next – t_this) × 480 s                              *
 *  City pairs:   city (20 s) + pullback (15 s)                               *
 *  Ocean arcs:   pullback → transit → arrival (15 + 40–45 + 15 s)            *
 *  Short hops:   pullback → transit → city   (15 + 15–20 + 0 s)             */

const TOUR = [

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  BAY AREA / SAN FRANCISCO  ━━━━
  { t: 0.000, zoom: 13.0, lat:  37.770, lng: -122.420 },   // city
  { t: 0.042, zoom:  6.0, lat:  37.770, lng: -122.420 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  PACIFIC CROSSING  (45 s arc)  ━━━━━━━━
  //   Centred over Alaska — globe view shows N. Pacific with land on both sides
  { t: 0.073, zoom:  2.5, lat:  60.000, lng: -155.000 },   // Alaska (globe)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  TOKYO  ━━━━━━
  { t: 0.167, zoom:  7.5, lat:  35.689, lng:  139.692 },   // arrival
  { t: 0.198, zoom: 13.0, lat:  35.689, lng:  139.692 },   // city (Shinjuku)
  { t: 0.240, zoom:  6.0, lat:  35.689, lng:  139.692 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  HONG KONG  ━━━━━━
  //   Short hop south via Eastern China coastline — never over water
  { t: 0.271, zoom:  5.0, lat:  32.000, lng:  120.000 },   // E. China (land)
  { t: 0.302, zoom: 13.5, lat:  22.319, lng:  114.169 },   // city (Kowloon)
  { t: 0.344, zoom:  6.0, lat:  22.319, lng:  114.169 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  INDIAN ARC  (20 s)  ━━━━━━━━━━━
  //   Centred over Central India — hemisphere shows Asia continent
  { t: 0.375, zoom:  3.5, lat:  20.000, lng:   80.000 },   // India (globe)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  DUBAI  ━━━━━━━
  { t: 0.417, zoom:  7.5, lat:  25.204, lng:   55.270 },   // arrival
  { t: 0.448, zoom: 13.0, lat:  25.204, lng:   55.270 },   // city (Downtown)
  { t: 0.490, zoom:  6.0, lat:  25.204, lng:   55.270 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ROME  ━━━━━━
  //   Via W. Turkey — Mediterranean visible but camera centred on land
  { t: 0.521, zoom:  5.5, lat:  39.000, lng:   28.000 },   // W. Turkey (land)
  { t: 0.563, zoom: 13.0, lat:  41.902, lng:   12.496 },   // city (Colosseum)
  { t: 0.604, zoom:  6.0, lat:  41.902, lng:   12.496 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  LONDON  ━━━━━━
  //   Via Central France — completely over land
  { t: 0.635, zoom:  6.5, lat:  49.000, lng:    4.000 },   // C. France (land)
  { t: 0.667, zoom: 13.0, lat:  51.508, lng:   -0.128 },   // city (Central London)
  { t: 0.708, zoom:  6.0, lat:  51.508, lng:   -0.128 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  NORTH ATLANTIC  (40 s arc)  ━━━━━━━━━
  //   Centred over Greenland ice sheet — globe view with land anchor
  { t: 0.740, zoom:  2.5, lat:  70.000, lng:  -40.000 },   // Greenland (globe)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  NEW YORK CITY  ━━━━
  { t: 0.823, zoom:  7.5, lat:  40.712, lng:  -74.006 },   // arrival
  { t: 0.854, zoom: 13.0, lat:  40.712, lng:  -74.006 },   // city (Manhattan)
  { t: 0.896, zoom:  6.0, lat:  40.712, lng:  -74.006 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  RETURN  ━━━━━━
  //   Via Colorado Rockies — scenic continental cross-section over land
  { t: 0.927, zoom:  4.0, lat:  40.000, lng: -105.000 },   // Rockies (land)
  { t: 0.969, zoom:  7.5, lat:  37.770, lng: -122.420 },   // Bay Area arrival

];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * Ken Perlin's smootherstep (6t⁵ − 15t⁴ + 10t³).
 * Zero first and second derivatives at t=0 and t=1 — the softest possible
 * ease-in / ease-out with no jerk at either end.
 */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Short-path longitude lerp.
 * Normalises the arc to [−180, 180] so the camera always takes the ≤180°
 * route — this makes the Pacific crossing travel westward through the date
 * line instead of eastward the long way around.
 */
function lerpLng(a: number, b: number, u: number): number {
  let diff = b - a;
  while (diff >  180) diff -= 360;
  while (diff < -180) diff += 360;
  return a + diff * u;
}

/**
 * Segment-wise smootherstep interpolation through TOUR waypoints.
 * Velocity is always zero at waypoint boundaries, giving natural dwells and
 * no overshoot.  The last segment wraps from TOUR[n-1] back to TOUR[0].
 */
function getTourCamera(t: number): { zoom: number; lat: number; lng: number } {
  const n = TOUR.length;

  let i = n - 1;
  for (let j = 0; j < n - 1; j++) {
    if (t < TOUR[j + 1].t) { i = j; break; }
  }

  const tStart = TOUR[i].t;
  const tEnd   = i < n - 1 ? TOUR[i + 1].t : 1.0;
  const u      = smootherstep(Math.max(0, Math.min(1, (t - tStart) / (tEnd - tStart))));

  const a = TOUR[i];
  const b = TOUR[(i + 1) % n];

  return {
    zoom: a.zoom + (b.zoom - a.zoom) * u,
    lat:  a.lat  + (b.lat  - a.lat)  * u,
    lng:  lerpLng(a.lng, b.lng, u),
  };
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function MapVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style:              STYLE_URL,
      center:             [-122.420, 37.770],
      zoom:               13,
      interactive:        false,
      attributionControl: false,
      renderWorldCopies:  true,   // needed for date-line crossing
    });

    let loopPhase = 0;
    let last      = 0;

    map.on("load", () => {
      // ── Globe projection ──────────────────────────────────────────────────
      // At zoom ≤ ~5 MapLibre renders a 3-D globe floating in space.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (map as any).setProjection({ type: "globe" }); } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        try { (map as any).setProjection("globe"); } catch { /* unsupported build */ }
      }

      // ── Space atmosphere: black void + subtle horizon glow ────────────────
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).setFog?.({
          range:            [0.8, 12],
          color:            "#000000",
          "high-color":     "#000818",   // faint blue atmosphere at horizon
          "horizon-blend":  0.12,
          "space-color":    "#000000",
          "star-intensity": 0.15,        // stars visible on globe view
        });
      } catch { /* ignore */ }

      // ── Animation loop ────────────────────────────────────────────────────
      function frame(now: number) {
        const dt  = last ? Math.min(now - last, 50) : 16;
        last      = now;
        loopPhase = (loopPhase + dt / LOOP_MS) % 1;

        const { zoom, lat, lng } = getTourCamera(loopPhase);
        map.jumpTo({ center: [lng, lat], zoom });

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

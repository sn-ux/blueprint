"use client";

/**
 * MapVisual — Page 4 globe
 *
 * 300-second cinematic world tour travelling eastward, starting and ending
 * in the Bay Area:
 *
 *   SF → Chicago → NYC → London → Paris → Rome → Istanbul
 *     → Dubai → Nairobi → Mumbai → Singapore → Tokyo → SF
 *
 * ── Zoom range ────────────────────────────────────────────────────────────────
 *   City stops      zoom 13.5   street-level detail
 *   Short arrivals  zoom 6      city in regional context
 *   Pullbacks       zoom 5.5    altitude, city identifiable
 *   Transits        zoom 3–5    continent / hemisphere view
 *   Ocean arcs      zoom 2.5–3  globe, always land-centred
 *
 * ── Land-only rule ───────────────────────────────────────────────────────────
 *   Every wide-view waypoint is centred on a named landmass:
 *     US interior    → Colorado Rockies      (41 N, 105 W)
 *     Appalachians   → Catskills / PA        (42 N,  78 W)
 *     N. Atlantic    → Labrador, Canada      (56 N,  60 W)
 *     C. Europe      → Swiss Alps            (46 N,   9 E)
 *     SE Europe      → Greece                (40 N,  22 E)
 *     Mesopotamia    → Iraq                  (34 N,  43 E)
 *     Horn / Arabia  → Ethiopia / Yemen      (12 N,  42 E)
 *     Bay of Bengal  → Myanmar / Bangladesh  (20 N,  92 E)
 *     S. China Sea   → S. China coast        (22 N, 114 E)
 *     N. Pacific     → Kamchatka Peninsula   (53 N, 159 E)
 *     Aleutians      → Aleutian Islands      (53 N, 175 W) ← land chain
 *     Pacific NW     → Oregon coast          (48 N, 124 W)
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Map style ────────────────────────────────────────────────────────────── */
const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/* ── Timing ───────────────────────────────────────────────────────────────── */
const LOOP_MS = 300_000;   // 5 min — dynamic, city-to-city pace

/* ── World-tour waypoints ─────────────────────────────────────────────────── */

const TOUR = [

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  SAN FRANCISCO  ━━━━━━━━━━━━━━━━
  { t: 0.000, zoom: 13.5, lat:  37.779, lng: -122.419 },   // city
  { t: 0.033, zoom:  5.5, lat:  37.779, lng: -122.419 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  CHICAGO  ━━━━━━━
  { t: 0.053, zoom:  4.5, lat:  41.000, lng: -105.000 },   // Rockies transit
  { t: 0.080, zoom: 13.5, lat:  41.878, lng:  -87.629 },   // city (Loop)
  { t: 0.113, zoom:  5.5, lat:  41.878, lng:  -87.629 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  NEW YORK CITY  ━━━━━
  { t: 0.130, zoom:  5.0, lat:  42.500, lng:  -78.000 },   // Appalachians
  { t: 0.157, zoom: 13.5, lat:  40.712, lng:  -74.006 },   // city (Manhattan)
  { t: 0.190, zoom:  5.5, lat:  40.712, lng:  -74.006 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  LONDON  ━━━━━━━
  { t: 0.220, zoom:  3.0, lat:  56.000, lng:  -60.000 },   // Labrador (globe)
  { t: 0.273, zoom: 13.5, lat:  51.509, lng:   -0.118 },   // city (Central)
  { t: 0.307, zoom:  5.5, lat:  51.509, lng:   -0.118 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  PARIS  ━━━━━━
  { t: 0.323, zoom: 13.5, lat:  48.857, lng:    2.352 },   // city (Marais)
  { t: 0.357, zoom:  5.5, lat:  48.857, lng:    2.352 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ROME  ━━━━━━
  { t: 0.373, zoom:  5.0, lat:  46.000, lng:    9.000 },   // Alps transit
  { t: 0.393, zoom: 13.5, lat:  41.902, lng:   12.496 },   // city (Colosseum)
  { t: 0.423, zoom:  5.5, lat:  41.902, lng:   12.496 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ISTANBUL  ━━━━━━
  { t: 0.440, zoom:  5.0, lat:  40.000, lng:   22.000 },   // Greece transit
  { t: 0.460, zoom: 13.5, lat:  41.013, lng:   28.978 },   // city (Bosphorus)
  { t: 0.490, zoom:  5.5, lat:  41.013, lng:   28.978 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  DUBAI  ━━━━━━
  { t: 0.507, zoom:  4.5, lat:  34.000, lng:   43.000 },   // Mesopotamia
  { t: 0.530, zoom: 13.5, lat:  25.204, lng:   55.270 },   // city (Downtown)
  { t: 0.560, zoom:  5.5, lat:  25.204, lng:   55.270 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  NAIROBI  ━━━━━━━
  { t: 0.577, zoom:  4.5, lat:  12.000, lng:   42.000 },   // Ethiopia
  { t: 0.600, zoom: 13.5, lat:  -1.286, lng:   36.817 },   // city (CBD)
  { t: 0.630, zoom:  5.5, lat:  -1.286, lng:   36.817 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  MUMBAI  ━━━━━━━
  { t: 0.647, zoom:  4.0, lat:  15.000, lng:   51.000 },   // Yemen / Horn
  { t: 0.673, zoom: 13.5, lat:  19.076, lng:   72.877 },   // city (Marine Dr)
  { t: 0.703, zoom:  5.5, lat:  19.076, lng:   72.877 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  SINGAPORE  ━━━━━━
  { t: 0.720, zoom:  4.5, lat:  20.000, lng:   92.000 },   // Myanmar coast
  { t: 0.747, zoom: 13.5, lat:   1.290, lng:  103.850 },   // city (Marina Bay)
  { t: 0.777, zoom:  5.5, lat:   1.290, lng:  103.850 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  TOKYO  ━━━━━━━
  { t: 0.793, zoom:  4.5, lat:  22.000, lng:  114.000 },   // S. China coast
  { t: 0.820, zoom: 13.5, lat:  35.689, lng:  139.692 },   // city (Shinjuku)
  { t: 0.850, zoom:  5.5, lat:  35.689, lng:  139.692 },   // pullback

  // ━━━━━━━━━━━━━━━━━━━━━━━  PACIFIC RETURN (fast arc)  ━━━━━━━━━━━━━━━━━━━━━
  { t: 0.873, zoom:  3.5, lat:  53.000, lng:  159.000 },   // Kamchatka
  { t: 0.910, zoom:  2.5, lat:  53.000, lng: -175.000 },   // Aleutians (globe)
  { t: 0.953, zoom:  5.0, lat:  48.000, lng: -124.000 },   // Oregon coast

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  SAN FRANCISCO (return)  ━━━━━━━━━
  { t: 1.000, zoom: 13.5, lat:  37.779, lng: -122.419 },   // arrival
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Ken Perlin's smootherstep — zero first and second derivatives at t=0/1. */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Short-path longitude lerp.
 * Always takes the ≤180° route so Pacific crossings go westward through the
 * date line instead of all the way eastward.
 */
function lerpLng(a: number, b: number, u: number): number {
  let diff = b - a;
  while (diff >  180) diff -= 360;
  while (diff < -180) diff += 360;
  return a + diff * u;
}

/** Segment-wise smootherstep interpolation through TOUR waypoints. */
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
      center:             [-122.419, 37.779],
      zoom:               13.5,
      interactive:        false,
      attributionControl: false,
      renderWorldCopies:  false,  // single globe, no tile-copy overhead
      fadeDuration:       0,      // tiles appear instantly — no pop-in flash
    });

    let loopPhase = 0;
    let last      = 0;

    map.on("load", () => {
      // ── Globe projection ──────────────────────────────────────────────────
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
          "high-color":     "#000818",
          "horizon-blend":  0.12,
          "space-color":    "#000000",
          "star-intensity": 0.15,
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

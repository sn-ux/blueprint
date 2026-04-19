"use client";

/**
 * MapVisual — cinematic city tour
 *
 * Movement pattern per city — three fully-decoupled phases:
 *   1. ZOOM IN   — camera locked over city, slow zoom in        (~17 s)
 *   2. ZOOM OUT  — camera locked over city, slow zoom out       (~17 s)
 *   3. LATERAL   — constant zoom, sweeps to next city           (~ 4 s)
 *   → repeat
 *
 * No lateral movement while zoomed in.
 * No zoom change during lateral movement.
 *
 * Route (eastward):
 *   Bay Area → LA → UCLA → Atlanta → New York → London → Paris
 *   → Beirut → Dubai → Chennai → Bangkok → Hong Kong → Tokyo → Bay Area
 *
 * Timing (480 s loop):
 *   Zoom out / in  : 0.035 × 480 s ≈ 16.8 s each  (slow, meditative)
 *   Lateral snap   : 0.008 × 480 s ≈  3.8 s        (fast relative to zoom)
 *   Per-city cycle : 0.078 × 480 s ≈ 37.4 s
 *   Pacific return : remaining ≈ 10 s final zoom-in
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Map style ────────────────────────────────────────────────────────────── */
const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/* ── Timing ───────────────────────────────────────────────────────────────── */
const LOOP_MS = 480_000;   // 8 min full loop

/* ── Tour waypoints ───────────────────────────────────────────────────────── *
 *
 *  Three-waypoint structure per city A → B:
 *
 *    { t: T,         zoom: cityZoom,    lat/lng: A }   ← zoomed in at A
 *    { t: T + 0.035, zoom: transitZoom, lat/lng: A }   ← fully pulled back, no lateral
 *    { t: T + 0.043, zoom: transitZoom, lat/lng: B }   ← lateral complete, same zoom
 *    next: { t: T + 0.078, zoom: cityZoom, lat/lng: B }  ← zoomed in at B
 *
 *  City zoom 13 keeps neighbourhood labels visible at center.
 *  Transit zooms scale with distance:
 *    BA → LA          7   (California coast)
 *    LA → UCLA        9   (LA metro, short hop)
 *    UCLA → Atlanta   5   (SE United States)
 *    Atlanta → NYC    5   (East Coast)
 *    NYC → London     3   (globe — Atlantic crossing)
 *    London → Paris   7   (NW Europe)
 *    Paris → Beirut   4   (Mediterranean basin)
 *    Beirut → Dubai   5   (Middle East)
 *    Dubai → Chennai  4   (Indian subcontinent)
 *    Chennai → BKK    5   (SE Asia)
 *    BKK → HK         6   (S China / SE Asia)
 *    HK → Tokyo       5   (East Asia)
 *    Tokyo → BA       2.5 (globe — Pacific crossing)
 * ─────────────────────────────────────────────────────────────────────────── */

const TOUR = [

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  BAY AREA  ━━━━━━━━━━
  { t: 0.000, zoom: 13,   lat:  37.7879, lng: -122.4074 },   // Union Square
  { t: 0.035, zoom:  7,   lat:  37.7879, lng: -122.4074 },   // pulled back
  { t: 0.043, zoom:  7,   lat:  34.0522, lng: -118.2437 },   // → LA

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  LOS ANGELES  ━━━━━━━━━━
  { t: 0.078, zoom: 13,   lat:  34.0522, lng: -118.2437 },   // Grand Park
  { t: 0.113, zoom:  9,   lat:  34.0522, lng: -118.2437 },   // pulled back
  { t: 0.121, zoom:  9,   lat:  34.0689, lng: -118.4452 },   // → UCLA

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  UCLA  ━━━━━━━━━
  { t: 0.156, zoom: 14,   lat:  34.0689, lng: -118.4452 },   // Powell Library
  { t: 0.191, zoom:  5,   lat:  34.0689, lng: -118.4452 },   // pulled back
  { t: 0.199, zoom:  5,   lat:  33.7490, lng:  -84.3880 },   // → Atlanta

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ATLANTA  ━━━━━━━━━━
  { t: 0.234, zoom: 13,   lat:  33.7490, lng:  -84.3880 },   // Centennial Park
  { t: 0.269, zoom:  5,   lat:  33.7490, lng:  -84.3880 },   // pulled back
  { t: 0.277, zoom:  5,   lat:  40.7580, lng:  -73.9855 },   // → New York

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  NEW YORK  ━━━━━━━━━
  { t: 0.312, zoom: 13,   lat:  40.7580, lng:  -73.9855 },   // Times Square
  { t: 0.347, zoom:  3,   lat:  40.7580, lng:  -73.9855 },   // pulled back (globe)
  { t: 0.355, zoom:  3,   lat:  51.5074, lng:   -0.1278 },   // → London

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  LONDON  ━━━━━━━━━
  { t: 0.390, zoom: 13,   lat:  51.5074, lng:   -0.1278 },   // Westminster
  { t: 0.425, zoom:  7,   lat:  51.5074, lng:   -0.1278 },   // pulled back
  { t: 0.433, zoom:  7,   lat:  48.8584, lng:    2.2945 },   // → Paris

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  PARIS  ━━━━━━━━
  { t: 0.468, zoom: 13,   lat:  48.8584, lng:    2.2945 },   // Eiffel Tower
  { t: 0.503, zoom:  4,   lat:  48.8584, lng:    2.2945 },   // pulled back
  { t: 0.511, zoom:  4,   lat:  33.8886, lng:   35.4955 },   // → Beirut

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  BEIRUT  ━━━━━━━━
  { t: 0.546, zoom: 13,   lat:  33.8886, lng:   35.4955 },   // Downtown
  { t: 0.581, zoom:  5,   lat:  33.8886, lng:   35.4955 },   // pulled back
  { t: 0.589, zoom:  5,   lat:  25.2048, lng:   55.2708 },   // → Dubai

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  DUBAI  ━━━━━━━━
  { t: 0.624, zoom: 13,   lat:  25.2048, lng:   55.2708 },   // Burj Khalifa
  { t: 0.659, zoom:  4,   lat:  25.2048, lng:   55.2708 },   // pulled back
  { t: 0.667, zoom:  4,   lat:  13.0827, lng:   80.2707 },   // → Chennai

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  CHENNAI  ━━━━━━━━
  { t: 0.702, zoom: 13,   lat:  13.0827, lng:   80.2707 },   // Marina Beach
  { t: 0.737, zoom:  5,   lat:  13.0827, lng:   80.2707 },   // pulled back
  { t: 0.745, zoom:  5,   lat:  13.7563, lng:  100.4970 },   // → Bangkok

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  BANGKOK  ━━━━━━━━
  { t: 0.780, zoom: 13,   lat:  13.7563, lng:  100.4970 },   // Grand Palace
  { t: 0.815, zoom:  6,   lat:  13.7563, lng:  100.4970 },   // pulled back
  { t: 0.823, zoom:  6,   lat:  22.2857, lng:  114.1577 },   // → Hong Kong

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  HONG KONG  ━━━━━━━
  { t: 0.858, zoom: 13,   lat:  22.2857, lng:  114.1577 },   // Tsim Sha Tsui
  { t: 0.893, zoom:  5,   lat:  22.2857, lng:  114.1577 },   // pulled back
  { t: 0.901, zoom:  5,   lat:  35.6762, lng:  139.6503 },   // → Tokyo

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  TOKYO  ━━━━━━━━
  { t: 0.936, zoom: 13,   lat:  35.6762, lng:  139.6503 },   // Shinjuku
  { t: 0.971, zoom:  2.5, lat:  35.6762, lng:  139.6503 },   // pulled back (globe)
  { t: 0.979, zoom:  2.5, lat:  37.7879, lng: -122.4074 },   // → Bay Area (Pacific arc)
  // Wraps to TOUR[0]: 2.5 → 13 zoom-in over Bay Area  (≈ 10 s)

];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/**
 * Smootherstep (6t⁵ − 15t⁴ + 10t³).
 * Zero first AND second derivatives at t = 0 and t = 1 — maximally smooth
 * ease-in/ease-out with no jerk at either endpoint.
 */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Short-path longitude lerp.
 * Always takes the ≤ 180° arc, so the Pacific sweep travels east through
 * the Aleutians rather than westward the long way round.
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
  const b = TOUR[(i + 1) % n];   // last entry wraps back to first

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
      center:             [-122.4074, 37.7879],
      zoom:               13,
      interactive:        false,
      attributionControl: false,
      renderWorldCopies:  false,   // single globe — halves tile overhead
      fadeDuration:       0,       // instant tile rendering, no pop-in flash
    });

    let loopPhase = 0;
    let last      = 0;

    map.on("load", () => {

      // ── Globe projection ────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (map as any).setProjection({ type: "globe" }); } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        try { (map as any).setProjection("globe"); } catch { /* unsupported */ }
      }

      // ── Space atmosphere ────────────────────────────────────────────────
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

      // ── Animation loop ──────────────────────────────────────────────────
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

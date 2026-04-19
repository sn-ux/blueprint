"use client";

/**
 * MapVisual — cinematic city tour
 *
 * Movement pattern per city:
 *   1. Zoomed-in street view — no lateral movement
 *   2. Slow zoom OUT  (camera stays fixed over city)
 *   3. Fast lateral SNAP to next city  (at constant wide zoom)
 *   4. Slow zoom IN  (camera stays fixed over next city)
 *   → repeat
 *
 * Route:
 *   Bay Area → LA → UCLA → Atlanta → New York → London → Paris
 *   → Beirut → Dubai → Chennai → Bangkok → Hong Kong → Tokyo → Bay Area
 *
 * Timing (240 s loop):
 *   Zoom out / zoom in : 0.035 × 240 s ≈ 8.4 s each   (slow)
 *   Lateral transit    : 0.006 × 240 s ≈ 1.4 s         (fast)
 *   Cycle per city     : 0.076 × 240 s ≈ 18 s
 *   Pacific return     : remaining ~11 s zoom-in to close loop
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Map style ────────────────────────────────────────────────────────────── */
const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/* ── Timing ───────────────────────────────────────────────────────────────── */
const LOOP_MS = 240_000;   // 4 min

/* ── Tour waypoints ───────────────────────────────────────────────────────── *
 *
 *  Three-point pattern per city transition A → B:
 *
 *    { t,         zoom: cityZoom,    lat/lng: A }   ← zoomed in at A
 *    { t + 0.035, zoom: transitZoom, lat/lng: A }   ← pulled back, no lateral
 *    { t + 0.041, zoom: transitZoom, lat/lng: B }   ← fast lateral to B, same zoom
 *    (next entry) { t + 0.076, zoom: cityZoom, lat/lng: B }   ← zoomed in at B
 *
 *  Transit zoom by leg:
 *    Bay Area → LA          z 7   (see California)
 *    LA → UCLA              z 9   (see LA metro — short hop)
 *    UCLA → Atlanta         z 5   (see SE United States)
 *    Atlanta → NYC          z 5   (see East Coast)
 *    NYC → London           z 3   (globe — Atlantic crossing)
 *    London → Paris         z 7   (see NW Europe)
 *    Paris → Beirut         z 4   (see Mediterranean basin)
 *    Beirut → Dubai         z 5   (see Middle East)
 *    Dubai → Chennai        z 4   (see Indian subcontinent)
 *    Chennai → Bangkok      z 5   (see SE Asia)
 *    Bangkok → Hong Kong    z 6   (see S China / SE Asia)
 *    Hong Kong → Tokyo      z 5   (see East Asia)
 *    Tokyo → Bay Area       z 2.5 (globe — Pacific crossing)
 * ─────────────────────────────────────────────────────────────────────────── */

const TOUR = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  BAY AREA  ━━━━━━━━━━━━━━━━━━
  { t: 0.000, zoom: 14,   lat:  37.7955, lng: -122.3934 },   // city (Embarcadero)
  { t: 0.035, zoom:  7,   lat:  37.7955, lng: -122.3934 },   // pulled back
  { t: 0.041, zoom:  7,   lat:  34.0522, lng: -118.2437 },   // → LA

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  LOS ANGELES  ━━━━━━━━━━━━━━━━━
  { t: 0.076, zoom: 14,   lat:  34.0522, lng: -118.2437 },   // city (Downtown)
  { t: 0.111, zoom:  9,   lat:  34.0522, lng: -118.2437 },   // pulled back
  { t: 0.117, zoom:  9,   lat:  34.0731, lng: -118.4441 },   // → UCLA

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  UCLA  ━━━━━━━━━━━━━━━━━
  { t: 0.152, zoom: 15,   lat:  34.0731, lng: -118.4441 },   // city (Royce Hall)
  { t: 0.187, zoom:  5,   lat:  34.0731, lng: -118.4441 },   // pulled back
  { t: 0.193, zoom:  5,   lat:  33.7490, lng:  -84.3880 },   // → Atlanta

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ATLANTA  ━━━━━━━━━━━━━━━━
  { t: 0.228, zoom: 14,   lat:  33.7490, lng:  -84.3880 },   // city (Midtown)
  { t: 0.263, zoom:  5,   lat:  33.7490, lng:  -84.3880 },   // pulled back
  { t: 0.269, zoom:  5,   lat:  40.7580, lng:  -73.9855 },   // → New York

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  NEW YORK  ━━━━━━━━━━━━━━━
  { t: 0.304, zoom: 14,   lat:  40.7580, lng:  -73.9855 },   // city (Midtown)
  { t: 0.339, zoom:  3,   lat:  40.7580, lng:  -73.9855 },   // pulled back (globe)
  { t: 0.345, zoom:  3,   lat:  51.5074, lng:   -0.1278 },   // → London

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  LONDON  ━━━━━━━━━━━━━━━
  { t: 0.380, zoom: 14,   lat:  51.5074, lng:   -0.1278 },   // city (Westminster)
  { t: 0.415, zoom:  7,   lat:  51.5074, lng:   -0.1278 },   // pulled back
  { t: 0.421, zoom:  7,   lat:  48.8584, lng:    2.2945 },   // → Paris

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  PARIS  ━━━━━━━━━━━━━━
  { t: 0.456, zoom: 14,   lat:  48.8584, lng:    2.2945 },   // city (Eiffel Tower)
  { t: 0.491, zoom:  4,   lat:  48.8584, lng:    2.2945 },   // pulled back
  { t: 0.497, zoom:  4,   lat:  33.8886, lng:   35.4955 },   // → Beirut

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  BEIRUT  ━━━━━━━━━━━━━━
  { t: 0.532, zoom: 14,   lat:  33.8886, lng:   35.4955 },   // city (Downtown)
  { t: 0.567, zoom:  5,   lat:  33.8886, lng:   35.4955 },   // pulled back
  { t: 0.573, zoom:  5,   lat:  25.2048, lng:   55.2708 },   // → Dubai

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  DUBAI  ━━━━━━━━━━━━━
  { t: 0.608, zoom: 14,   lat:  25.2048, lng:   55.2708 },   // city (Burj Khalifa)
  { t: 0.643, zoom:  4,   lat:  25.2048, lng:   55.2708 },   // pulled back
  { t: 0.649, zoom:  4,   lat:  13.0827, lng:   80.2707 },   // → Chennai

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  CHENNAI  ━━━━━━━━━━━━━
  { t: 0.684, zoom: 14,   lat:  13.0827, lng:   80.2707 },   // city (Marina Beach)
  { t: 0.719, zoom:  5,   lat:  13.0827, lng:   80.2707 },   // pulled back
  { t: 0.725, zoom:  5,   lat:  13.7563, lng:  100.5018 },   // → Bangkok

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  BANGKOK  ━━━━━━━━━━━━━
  { t: 0.760, zoom: 14,   lat:  13.7563, lng:  100.5018 },   // city (Grand Palace)
  { t: 0.795, zoom:  6,   lat:  13.7563, lng:  100.5018 },   // pulled back
  { t: 0.801, zoom:  6,   lat:  22.2857, lng:  114.1577 },   // → Hong Kong

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  HONG KONG  ━━━━━━━━━━━━
  { t: 0.836, zoom: 14,   lat:  22.2857, lng:  114.1577 },   // city (Victoria Harbour)
  { t: 0.871, zoom:  5,   lat:  22.2857, lng:  114.1577 },   // pulled back
  { t: 0.877, zoom:  5,   lat:  35.6762, lng:  139.6503 },   // → Tokyo

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  TOKYO  ━━━━━━━━━━━━━
  { t: 0.912, zoom: 14,   lat:  35.6762, lng:  139.6503 },   // city (Shinjuku)
  { t: 0.947, zoom:  2.5, lat:  35.6762, lng:  139.6503 },   // pulled back (globe)
  { t: 0.953, zoom:  2.5, lat:  37.7955, lng: -122.3934 },   // → Bay Area (Pacific arc)
  // Last segment wraps to TOUR[0]: zoom 2.5 → 14 over Bay Area  (~11 s zoom-in)
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Ken Perlin's smootherstep — zero first and second derivatives at t=0/1. */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Short-path longitude lerp.
 * Always takes the ≤180° route, so the Pacific return sweeps eastward
 * through the Aleutians rather than westward the long way around.
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

  // Find the current segment
  let i = n - 1;
  for (let j = 0; j < n - 1; j++) {
    if (t < TOUR[j + 1].t) { i = j; break; }
  }

  const tStart = TOUR[i].t;
  const tEnd   = i < n - 1 ? TOUR[i + 1].t : 1.0;
  const u      = smootherstep(Math.max(0, Math.min(1, (t - tStart) / (tEnd - tStart))));

  const a = TOUR[i];
  const b = TOUR[(i + 1) % n];   // wraps last → first

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
      center:             [-122.3934, 37.7955],
      zoom:               14,
      interactive:        false,
      attributionControl: false,
      renderWorldCopies:  false,   // single globe, halves tile load overhead
      fadeDuration:       0,       // tiles render instantly — no pop-in flicker
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

      // ── Space atmosphere ──────────────────────────────────────────────────
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

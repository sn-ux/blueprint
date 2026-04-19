"use client";

/**
 * MapVisual — cinematic city tour with icosphere city markers
 *
 * Each city has a small icosphere dot that blooms into a full rotating
 * icosphere as the camera zooms in — echoing the MiniSphere interface.
 *
 * Movement phases per city (fully decoupled):
 *   1. ZOOM IN   — camera locked, sphere grows  (~17 s)
 *   2. ZOOM OUT  — camera locked, sphere shrinks (~17 s)
 *   3. LATERAL   — constant wide zoom, sweeps to next city (~4 s)
 *
 * Route: Bay Area → LA → UCLA → Atlanta → New York → London → Paris
 *        → Beirut → Dubai → Chennai → Bangkok → Hong Kong → Tokyo → Bay Area
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Constants ────────────────────────────────────────────────────────────── */

const STYLE_URL     = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LOOP_MS       = 480_000;   // 8-min loop
const ZOOM_DELTA    = 0.035;     // fraction of loop for each zoom phase
const LATERAL_DELTA = 0.008;     // fraction for lateral transit
const CYCLE         = ZOOM_DELTA * 2 + LATERAL_DELTA;   // 0.078 per city

/* ── City data ────────────────────────────────────────────────────────────── */

const CITIES = [
  { name: "Bay Area",    lat:  37.7879, lng: -122.4074, cityZoom: 13,  txZ: 7   },
  { name: "Los Angeles", lat:  34.0522, lng: -118.2437, cityZoom: 13,  txZ: 9   },
  { name: "UCLA",        lat:  34.0689, lng: -118.4452, cityZoom: 14,  txZ: 5   },
  { name: "Atlanta",     lat:  33.7490, lng:  -84.3880, cityZoom: 13,  txZ: 5   },
  { name: "New York",    lat:  40.7580, lng:  -73.9855, cityZoom: 13,  txZ: 3   },
  { name: "London",      lat:  51.5074, lng:   -0.1278, cityZoom: 13,  txZ: 7   },
  { name: "Paris",       lat:  48.8584, lng:    2.2945, cityZoom: 13,  txZ: 4   },
  { name: "Beirut",      lat:  33.8886, lng:   35.4955, cityZoom: 13,  txZ: 5   },
  { name: "Dubai",       lat:  25.2048, lng:   55.2708, cityZoom: 13,  txZ: 4   },
  { name: "Chennai",     lat:  13.0827, lng:   80.2707, cityZoom: 13,  txZ: 5   },
  { name: "Bangkok",     lat:  13.7563, lng:  100.4970, cityZoom: 13,  txZ: 6   },
  { name: "Hong Kong",   lat:  22.2857, lng:  114.1577, cityZoom: 13,  txZ: 5   },
  { name: "Tokyo",       lat:  35.6762, lng:  139.6503, cityZoom: 13,  txZ: 2.5 },
] as const;

/* ── Tour waypoints (generated from CITIES) ──────────────────────────────── *
 *
 *  Per city i at T = i × CYCLE:
 *    { t: T,              zoom: cityZoom, lat/lng: city[i]   }  ← zoomed in
 *    { t: T + ZOOM_DELTA, zoom: txZ,      lat/lng: city[i]   }  ← pulled back
 *    { t: T + ZOOM_DELTA + LATERAL_DELTA, zoom: txZ, lat/lng: city[i+1] }
 *
 *  Last segment wraps to TOUR[0]: globe zoom → city zoom over Bay Area.
 * ─────────────────────────────────────────────────────────────────────────── */

const TOUR = (() => {
  const pts: { t: number; zoom: number; lat: number; lng: number }[] = [];
  for (let i = 0; i < CITIES.length; i++) {
    const T = i * CYCLE;
    const c = CITIES[i];
    const n = CITIES[(i + 1) % CITIES.length];
    pts.push(
      { t: T,                              zoom: c.cityZoom, lat: c.lat, lng: c.lng },
      { t: T + ZOOM_DELTA,                 zoom: c.txZ,      lat: c.lat, lng: c.lng },
      { t: T + ZOOM_DELTA + LATERAL_DELTA, zoom: c.txZ,      lat: n.lat, lng: n.lng },
    );
  }
  return pts;
})();

/* ── Icosphere geometry ───────────────────────────────────────────────────── */

type V3  = [number, number, number];
type Tri = [number, number, number];

function norm3([x, y, z]: V3): V3 {
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
}

function buildIcosphere(subdivs: number): { verts: V3[]; faces: Tri[] } {
  const φ = (1 + Math.sqrt(5)) / 2;
  let verts: V3[] = ([
    [-1,φ,0],[1,φ,0],[-1,-φ,0],[1,-φ,0],
    [0,-1,φ],[0,1,φ],[0,-1,-φ],[0,1,-φ],
    [φ,0,-1],[φ,0,1],[-φ,0,-1],[-φ,0,1],
  ] as V3[]).map(norm3);
  let faces: Tri[] = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ];
  for (let s = 0; s < subdivs; s++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const k = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (cache.has(k)) return cache.get(k)!;
      const [ax, ay, az] = verts[a], [bx, by, bz] = verts[b];
      verts.push(norm3([(ax+bx)/2, (ay+by)/2, (az+bz)/2]));
      cache.set(k, verts.length - 1);
      return verts.length - 1;
    };
    const next: Tri[] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a,b), bc = mid(b,c), ca = mid(c,a);
      next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
    }
    faces = next;
  }
  return { verts, faces };
}

// Built once at module load — 2 subdivisions: 162 verts, 320 faces
const ISO = buildIcosphere(2);

/* ── Math helpers ─────────────────────────────────────────────────────────── */

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerpLng(a: number, b: number, u: number): number {
  let diff = b - a;
  while (diff >  180) diff -= 360;
  while (diff < -180) diff += 360;
  return a + diff * u;
}

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

/** Returns 0–1: how "active" (zoomed-in) city i is at the given loop phase. */
function getCityActivity(cityIdx: number, phase: number): number {
  const cityT = cityIdx * CYCLE;
  let dt = Math.abs(phase - cityT);
  if (dt > 0.5) dt = 1 - dt;             // wrap around loop boundary
  if (dt >= ZOOM_DELTA) return 0;
  return smootherstep(1 - dt / ZOOM_DELTA);
}

/* ── Icosphere canvas renderer ────────────────────────────────────────────── */

function drawIcosphere(
  ctx:    CanvasRenderingContext2D,
  cx:     number,
  cy:     number,
  radius: number,
  rotY:   number,
  alpha:  number,   // 0–1 overall opacity
) {
  const R    = radius;
  const tilt = 0.42;                             // gentle X tilt
  const sX   = Math.sin(tilt), cX = Math.cos(tilt);
  const sY   = Math.sin(rotY),  cY = Math.cos(rotY);

  // Project all vertices to screen space
  const pv = ISO.verts.map(([x, y, z]) => {
    const x1 =  x * cY - z * sY;
    const z1 =  x * sY + z * cY;
    const y2 =  y * cX - z1 * sX;
    const z2 =  y * sX + z1 * cX;
    return { sx: cx + x1 * R, sy: cy - y2 * R, z: z2 };
  });

  // Painter's algorithm: sort faces back-to-front
  const sorted = ISO.faces
    .map(f => ({ f, z: (pv[f[0]].z + pv[f[1]].z + pv[f[2]].z) / 3 }))
    .sort((a, b) => a.z - b.z);

  for (const { f } of sorted) {
    const [ia, ib, ic] = f;
    const pa = pv[ia], pb = pv[ib], pc = pv[ic];
    const avgZ = (pa.z + pb.z + pc.z) / 3;
    if (avgZ < -0.05) continue;                  // skip back-facing

    const lit     = Math.max(0, avgZ);
    const fillA   = (0.04 + lit * 0.09) * alpha;
    const strokeA = (0.28 + lit * 0.60) * alpha;

    ctx.beginPath();
    ctx.moveTo(pa.sx, pa.sy);
    ctx.lineTo(pb.sx, pb.sy);
    ctx.lineTo(pc.sx, pc.sy);
    ctx.closePath();
    ctx.fillStyle   = `rgba(245,158,11,${fillA.toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(245,158,11,${strokeA.toFixed(3)})`;
    ctx.lineWidth   = radius > 20 ? 0.8 : 0.5;
    ctx.stroke();
  }
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function MapVisual() {
  const wrapperRef      = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef      = useRef<HTMLCanvasElement>(null);
  const rafRef          = useRef(0);

  useEffect(() => {
    const wrapper      = wrapperRef.current;
    const mapContainer = mapContainerRef.current;
    const overlay      = overlayRef.current;
    if (!wrapper || !mapContainer || !overlay) return;

    const map = new maplibregl.Map({
      container:          mapContainer,
      style:              STYLE_URL,
      center:             [CITIES[0].lng, CITIES[0].lat],
      zoom:               CITIES[0].cityZoom,
      interactive:        false,
      attributionControl: false,
      renderWorldCopies:  false,
      fadeDuration:       0,
    });

    let loopPhase = 0;
    let last      = 0;

    // Per-city rotation state (different starting angles + speeds)
    const rotY = CITIES.map((_, i) => i * 0.7);

    map.on("load", () => {
      // Globe projection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (map as any).setProjection({ type: "globe" }); } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        try { (map as any).setProjection("globe"); } catch { /* unsupported */ }
      }

      // Space atmosphere
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

      function frame(now: number) {
        const dt  = last ? Math.min(now - last, 50) : 16;
        last      = now;
        loopPhase = (loopPhase + dt / LOOP_MS) % 1;

        // ── Map camera ──────────────────────────────────────────────────────
        const { zoom, lat, lng } = getTourCamera(loopPhase);
        map.jumpTo({ center: [lng, lat], zoom });

        // ── Sphere rotations (slow, each city its own speed) ────────────────
        for (let i = 0; i < CITIES.length; i++) {
          rotY[i] += 0.004 + i * 0.0002;   // slight variation per city
        }

        // ── Overlay canvas ──────────────────────────────────────────────────
        const dpr      = window.devicePixelRatio || 1;
        const { width: W, height: H } = wrapper.getBoundingClientRect();
        const pixW = Math.round(W * dpr);
        const pixH = Math.round(H * dpr);

        if (overlay.width !== pixW || overlay.height !== pixH) {
          overlay.width  = pixW;
          overlay.height = pixH;
        }

        const ctx = overlay.getContext("2d");
        if (!ctx) { rafRef.current = requestAnimationFrame(frame); return; }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        for (let i = 0; i < CITIES.length; i++) {
          const city     = CITIES[i];
          const activity = getCityActivity(i, loopPhase);

          // Project geographic coordinate → canvas pixel
          const pt = map.project([city.lng, city.lat]);
          if (pt.x < -300 || pt.x > W + 300 || pt.y < -300 || pt.y > H + 300) continue;

          const MIN_R  = 4;
          const MAX_R  = 54;
          const radius = MIN_R + (MAX_R - MIN_R) * activity;
          const alpha  = 0.55 + activity * 0.45;

          if (activity < 0.04) {
            // Inactive: render as a small glowing dot
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, MIN_R, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(245,158,11,0.65)";
            ctx.fill();
          } else {
            // Active: full rotating icosphere, centered on the projected point
            drawIcosphere(ctx, pt.x, pt.y, radius, rotY[i], alpha);
          }

          // ── Label below sphere ────────────────────────────────────────────
          const labelY   = pt.y + radius + 15;
          const fontSize = 10 + activity * 3;
          const textAlpha = 0.45 + activity * 0.5;

          ctx.font         = `${activity > 0.4 ? "500 " : ""}${fontSize.toFixed(1)}px system-ui, sans-serif`;
          ctx.textAlign    = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle    = `rgba(255,255,255,${textAlpha.toFixed(2)})`;
          ctx.fillText(city.name, pt.x, labelY);
        }

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
      ref={wrapperRef}
      style={{ position: "relative", width: "100%", height: "100%", background: "#000000" }}
    >
      {/* Map lives in its own div so MapLibre can control it */}
      <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Icosphere overlay — pointer-events: none so map interactions pass through */}
      <canvas
        ref={overlayRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
    </div>
  );
}

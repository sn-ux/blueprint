"use client";

/**
 * MapVisual — cinematic city tour with icosphere city markers
 *
 * Dots are rendered as a native MapLibre circle layer (flat on the map surface,
 * same pipeline as the tile labels). The canvas overlay is used only for the
 * bloom icosphere on the active tour city.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

/* ── Constants ────────────────────────────────────────────────────────────── */

const STYLE_URL     = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LOOP_MS       = 480_000;
const ZOOM_DELTA    = 0.035;
const LATERAL_DELTA = 0.008;
const CYCLE         = ZOOM_DELTA * 2 + LATERAL_DELTA;

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

/* ── Tour waypoints ───────────────────────────────────────────────────────── */

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

const ISO = buildIcosphere(2);

/* ── Helpers ──────────────────────────────────────────────────────────────── */

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
  const a = TOUR[i], b = TOUR[(i + 1) % n];
  return {
    zoom: a.zoom + (b.zoom - a.zoom) * u,
    lat:  a.lat  + (b.lat  - a.lat)  * u,
    lng:  lerpLng(a.lng, b.lng, u),
  };
}

function getCityActivity(cityIdx: number, phase: number): number {
  const cityT = cityIdx * CYCLE;
  let dt = Math.abs(phase - cityT);
  if (dt > 0.5) dt = 1 - dt;
  if (dt >= ZOOM_DELTA) return 0;
  return smootherstep(1 - dt / ZOOM_DELTA);
}

/* ── Icosphere canvas renderer ────────────────────────────────────────────── */

function drawIcosphere(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number, rotY: number, alpha: number,
) {
  const tilt = 0.42;
  const sX = Math.sin(tilt), cX = Math.cos(tilt);
  const sY = Math.sin(rotY),  cY = Math.cos(rotY);
  const pv = ISO.verts.map(([x, y, z]) => {
    const x1 = x*cY - z*sY, z1 = x*sY + z*cY;
    const y2 = y*cX - z1*sX, z2 = y*sX + z1*cX;
    return { sx: cx + x1*radius, sy: cy - y2*radius, z: z2 };
  });
  const sorted = ISO.faces
    .map(f => ({ f, z: (pv[f[0]].z + pv[f[1]].z + pv[f[2]].z) / 3 }))
    .sort((a, b) => a.z - b.z);
  for (const { f } of sorted) {
    const [ia, ib, ic] = f;
    const pa = pv[ia], pb = pv[ib], pc = pv[ic];
    const avgZ = (pa.z + pb.z + pc.z) / 3;
    if (avgZ < -0.05) continue;
    const lit = Math.max(0, avgZ);
    ctx.beginPath();
    ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy);
    ctx.lineTo(pc.sx, pc.sy); ctx.closePath();
    ctx.fillStyle   = `rgba(245,158,11,${((0.04 + lit*0.09)*alpha).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(245,158,11,${((0.28 + lit*0.60)*alpha).toFixed(3)})`;
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

    const wrapperEl = wrapper as HTMLDivElement;
    const overlayEl = overlay as HTMLCanvasElement;

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

    let loopPhase  = 0;
    let last       = 0;
    let frameCount = 0;
    const rotY     = CITIES.map((_, i) => i * 0.7);

    // Layer IDs whose source-layer === "place" — populated once on load
    let placeLayers: string[] = [];

    map.on("load", () => {
      // ── Globe + atmosphere ────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (map as any).setProjection({ type: "globe" }); } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        try { (map as any).setProjection("globe"); } catch { /* unsupported */ }
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).setFog?.({
          range: [0.8, 12], color: "#000000",
          "high-color": "#000818", "horizon-blend": 0.12,
          "space-color": "#000000", "star-intensity": 0.15,
        });
      } catch { /* ignore */ }

      // ── Place dot layer (flat inside the map, same Z as labels) ──────────
      //    We drive its data from queryRenderedFeatures each cycle so it
      //    always matches exactly what tile labels are visible.
      map.addSource("place-dots", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id:     "place-dots-layer",
        type:   "circle",
        source: "place-dots",
        paint: {
          "circle-radius":    4,
          "circle-color":     "#f59e0b",
          "circle-opacity":   0.72,
          // Shift every dot 14 px upward so it sits above the label text
          // rather than overlapping the lettering.
          "circle-translate": [0, -14],
        },
      });

      // ── Collect place symbol layer IDs ────────────────────────────────────
      //    OpenMapTiles schema: all city / town / country label features live
      //    in source-layer "place". Targeting it explicitly avoids road / POI
      //    / water layers and keeps queryRenderedFeatures fast.
      placeLayers = map.getStyle().layers
        .filter(l => {
          if (l.type !== "symbol") return false;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sl = ((l as any)["source-layer"] ?? "").toLowerCase();
          return sl === "place";
        })
        .map(l => l.id);

      // ── Animation loop ────────────────────────────────────────────────────
      function frame(now: number) {
        const dt  = last ? Math.min(now - last, 50) : 16;
        last      = now;
        loopPhase = (loopPhase + dt / LOOP_MS) % 1;
        frameCount++;

        // Camera
        const { zoom, lat, lng } = getTourCamera(loopPhase);
        map.jumpTo({ center: [lng, lat], zoom });

        // Rotations
        for (let i = 0; i < CITIES.length; i++) rotY[i] += 0.004 + i * 0.0002;

        // ── Refresh place dot source every 4 frames (~15 Hz) ─────────────
        //    queryRenderedFeatures returns ONLY features whose label is
        //    actually drawn in the current view — perfect 1-to-1 with labels.
        if (frameCount % 4 === 0 && placeLayers.length > 0) {
          try {
            const seen: Set<string> = new Set();
            const dotCoords: [number, number][] = [];

            for (const f of map.queryRenderedFeatures(undefined, { layers: placeLayers })) {
              if (f.geometry.type !== "Point") continue;
              const [fLng, fLat] = f.geometry.coordinates;
              const key = `${fLng.toFixed(3)},${fLat.toFixed(3)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              dotCoords.push([fLng, fLat]);
            }

            (map.getSource("place-dots") as maplibregl.GeoJSONSource).setData({
              type: "FeatureCollection",
              features: dotCoords.map(([dLng, dLat]) => ({
                type:       "Feature" as const,
                geometry:   { type: "Point" as const, coordinates: [dLng, dLat] },
                properties: {},
              })),
            });
          } catch { /* map briefly not ready */ }
        }

        // ── Canvas overlay — bloom icosphere only ─────────────────────────
        const dpr  = window.devicePixelRatio || 1;
        const { width: W, height: H } = wrapperEl.getBoundingClientRect();
        const pixW = Math.round(W * dpr);
        const pixH = Math.round(H * dpr);
        if (overlayEl.width !== pixW || overlayEl.height !== pixH) {
          overlayEl.width  = pixW;
          overlayEl.height = pixH;
        }
        const ctx = overlayEl.getContext("2d");
        if (!ctx) { rafRef.current = requestAnimationFrame(frame); return; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        for (let i = 0; i < CITIES.length; i++) {
          const activity = getCityActivity(i, loopPhase);
          if (activity < 0.04) continue;   // circle layer already shows the dot

          const city = CITIES[i];
          const pt   = map.project([city.lng, city.lat]);

          // Only render the bloom when the city is near the screen centre.
          // This kills the ghost sphere that appears in the corner while the
          // camera is still in transit toward the city.
          const distFromCenter = Math.hypot(pt.x - W / 2, pt.y - H / 2);
          if (distFromCenter > Math.min(W, H) * 0.35) continue;

          const radius = 3 + 51 * activity;
          drawIcosphere(ctx, pt.x, pt.y, radius, rotY[i], 0.55 + activity * 0.45);

          // City name fades in below the sphere once noticeably active
          if (activity > 0.25) {
            const textAlpha = (activity - 0.25) / 0.75;
            ctx.font         = `500 ${(10 + activity * 3).toFixed(1)}px system-ui,sans-serif`;
            ctx.textAlign    = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle    = `rgba(255,255,255,${textAlpha.toFixed(2)})`;
            ctx.fillText(city.name, pt.x, pt.y + radius + 10);
          }
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
      <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
      <canvas
        ref={overlayRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
    </div>
  );
}

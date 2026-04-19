"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

const STYLE_URL     = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LOOP_MS       = 480_000;
const ZOOM_DELTA    = 0.035;
const LATERAL_DELTA = 0.008;
const CYCLE         = ZOOM_DELTA * 2 + LATERAL_DELTA;

// Default dot color when no platform color is supplied
const DEFAULT_COLOR = "#f59e0b";

// Transition duration in ms — matches MiniSphere / carousel
const COLOR_TRANSITION_MS = 250;

const CITIES = [
  { lat:  37.7879, lng: -122.4074, cityZoom: 13,  txZ: 7   },
  { lat:  34.0522, lng: -118.2437, cityZoom: 13,  txZ: 9   },
  { lat:  34.0689, lng: -118.4452, cityZoom: 14,  txZ: 5   },
  { lat:  33.7490, lng:  -84.3880, cityZoom: 13,  txZ: 5   },
  { lat:  40.7580, lng:  -73.9855, cityZoom: 13,  txZ: 3   },
  { lat:  51.5074, lng:   -0.1278, cityZoom: 13,  txZ: 7   },
  { lat:  48.8584, lng:    2.2945, cityZoom: 13,  txZ: 4   },
  { lat:  33.8886, lng:   35.4955, cityZoom: 13,  txZ: 5   },
  { lat:  25.2048, lng:   55.2708, cityZoom: 13,  txZ: 4   },
  { lat:  13.0827, lng:   80.2707, cityZoom: 13,  txZ: 5   },
  { lat:  13.7563, lng:  100.4970, cityZoom: 13,  txZ: 6   },
  { lat:  22.2857, lng:  114.1577, cityZoom: 13,  txZ: 5   },
  { lat:  35.6762, lng:  139.6503, cityZoom: 13,  txZ: 2.5 },
] as const;

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

// ── Color helpers ─────────────────────────────────────────────────────────────

/** Parse a 6-digit hex color into [r, g, b] 0-255. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Ease-in-out quadratic, matching MiniSphere transition curve. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ── Icosphere geometry ────────────────────────────────────────────────────────

type V3  = [number, number, number];
type Tri = [number, number, number];

function norm3([x, y, z]: V3): V3 {
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
}

function buildIcosphere(subdivs: number): { verts: V3[]; faces: Tri[] } {
  const φ = (1 + Math.sqrt(5)) / 2;
  let verts: V3[] = ([
    [-1, φ, 0], [1, φ, 0], [-1, -φ, 0], [1, -φ, 0],
    [0, -1, φ], [0, 1, φ], [0, -1, -φ], [0, 1, -φ],
    [φ, 0, -1], [φ, 0, 1], [-φ, 0, -1], [-φ, 0, 1],
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

// 1 subdivision = 80 faces / 42 verts.
// At marker radius ~7 px each triangular edge is ≈4 px — clearly readable as
// a wireframe facet.  2 subdivisions (320 faces) collapse to an indistinct
// blob at that scale, so we use the coarser mesh here.
const ISO_MARKER = buildIcosphere(1);

// Marker radius in CSS px — large enough to show geometry, small enough to
// sit next to a label without dominating it.
const MARKER_R = 7;

/**
 * Soft radial glow drawn behind each icosphere.
 * Mimics the bloom that makes the Page-3 spheres feel lit and premium.
 */
function drawGlow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  R:  number,
  cr: number, cg: number, cb: number,
) {
  const glowR = R * 2.6;
  const grad  = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  grad.addColorStop(0,    `rgba(${cr},${cg},${cb},0.22)`);
  grad.addColorStop(0.45, `rgba(${cr},${cg},${cb},0.07)`);
  grad.addColorStop(1,    `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw a single marker icosphere centred at (cx, cy).
 *
 * Opacity model mirrors MiniSphere exactly:
 *   fill   0.08 → ~0.30  (z-depth lit hemisphere)
 *   stroke 0.40 → ~0.95  (bright edge on front-facing edges)
 *   lineWidth 0.7         (matches MiniSphere)
 */
function drawIcosphere(
  ctx: CanvasRenderingContext2D,
  cx:  number,
  cy:  number,
  R:   number,
  rx:  number,
  ry:  number,
  cr:  number,
  cg:  number,
  cb:  number,
) {
  const { verts, faces } = ISO_MARKER;
  const sX = Math.sin(rx), cX = Math.cos(rx);
  const sY = Math.sin(ry), cY = Math.cos(ry);

  const pv = verts.map(([x, y, z]) => {
    const x1 = x * cY - z * sY;
    const z1 = x * sY + z * cY;
    const y2 = y * cX - z1 * sX;
    const z2 = y * sX + z1 * cX;
    return { sx: cx + x1 * R, sy: cy - y2 * R, z: z2 };
  });

  // Painter's algorithm — back-to-front
  const sorted = faces
    .map((f, i) => ({ f, i, z: (pv[f[0]].z + pv[f[1]].z + pv[f[2]].z) / 3 }))
    .sort((a, b) => a.z - b.z);

  for (const { f, z } of sorted) {
    const [ia, ib, ic] = f;
    // Depth-based opacity: back faces nearly invisible, front faces solid —
    // same formula as MiniSphere, tuned for a 7 px marker.
    const fillA   = (0.08 + Math.max(0, z) * 0.22).toFixed(3);
    const strokeA = (0.40 + Math.max(0, z) * 0.55).toFixed(3);
    ctx.beginPath();
    ctx.moveTo(pv[ia].sx, pv[ia].sy);
    ctx.lineTo(pv[ib].sx, pv[ib].sy);
    ctx.lineTo(pv[ic].sx, pv[ic].sy);
    ctx.closePath();
    ctx.fillStyle   = `rgba(${cr},${cg},${cb},${fillA})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${strokeA})`;
    ctx.lineWidth   = 0.7;
    ctx.stroke();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapVisual({
  platformColor,
}: {
  /** Hex color that all dots should show. Transitions smoothly when it changes. */
  platformColor?: string;
}) {
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const mapDivRef   = useRef<HTMLDivElement>(null);
  const overlayRef  = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef(0);

  // Color transition state — mirrors MiniSphere pattern
  const toColorRef         = useRef<string>(platformColor ?? DEFAULT_COLOR);
  const fromColorRef       = useRef<string | null>(null);
  const transitionStartRef = useRef<number>(-1);

  // Sync prop changes into refs so the rAF loop picks them up without re-running useEffect
  useEffect(() => {
    const next = platformColor ?? DEFAULT_COLOR;
    if (next !== toColorRef.current) {
      fromColorRef.current       = toColorRef.current;
      toColorRef.current         = next;
      transitionStartRef.current = performance.now();
    }
  }, [platformColor]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const mapDiv  = mapDivRef.current;
    const overlay = overlayRef.current;
    if (!wrapper || !mapDiv || !overlay) return;

    // Capture non-nullable aliases after the guard so TypeScript retains
    // the narrowed types inside nested closures (e.g. the rAF frame callback).
    const overlayEl: HTMLCanvasElement = overlay;

    const ctx2d = overlayEl.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    const map = new maplibregl.Map({
      container:          mapDiv,
      style:              STYLE_URL,
      center:             [CITIES[0].lng, CITIES[0].lat],
      zoom:               CITIES[0].cityZoom,
      interactive:        false,
      attributionControl: false,
      renderWorldCopies:  false,
      fadeDuration:       0,
    });

    // Resize canvas to match wrapper
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const w   = wrapper.clientWidth;
      const h   = wrapper.clientHeight;
      overlayEl.width  = w * dpr;
      overlayEl.height = h * dpr;
      overlayEl.style.width  = `${w}px`;
      overlayEl.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(wrapper);

    let loopPhase  = 0;
    let last       = 0;
    let frameCount = 0;
    let placeLayers: string[] = [];

    // Cached dot positions (in lng/lat) — updated every 4 frames
    let dotCoords: [number, number][] = [];

    // Per-dot rotation state — independent spin per label
    const dotRotations = new Map<string, { rx: number; ry: number; speedX: number; speedY: number }>();

    function getDotRot(key: string, idx: number) {
      if (!dotRotations.has(key)) {
        const h = idx * 1234567 + 98765;
        dotRotations.set(key, {
          rx:     ((h * 3) % 628) / 100,
          ry:     ((h * 7) % 628) / 100,
          speedX: 0.003 + (((h * 13) % 100) / 100) * 0.004,
          speedY: 0.004 + (((h * 17) % 100) / 100) * 0.005,
        });
      }
      return dotRotations.get(key)!;
    }

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
          range: [0.8, 12], color: "#000000",
          "high-color": "#000818", "horizon-blend": 0.12,
          "space-color": "#000000", "star-intensity": 0.15,
        });
      } catch { /* ignore */ }

      // Collect place label layer IDs
      placeLayers = map.getStyle().layers
        .filter(l => {
          if (l.type !== "symbol") return false;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return ((l as any)["source-layer"] ?? "").toLowerCase() === "place";
        })
        .map(l => l.id);

      function frame(now: number) {
        const dt  = last ? Math.min(now - last, 50) : 16;
        last      = now;
        loopPhase = (loopPhase + dt / LOOP_MS) % 1;
        frameCount++;

        const { zoom, lat, lng } = getTourCamera(loopPhase);
        map.jumpTo({ center: [lng, lat], zoom });

        // Refresh dot positions every 4 frames
        if (frameCount % 4 === 0 && placeLayers.length > 0) {
          try {
            const seen   = new Set<string>();
            const coords: [number, number][] = [];
            for (const f of map.queryRenderedFeatures(undefined, { layers: placeLayers })) {
              if (f.geometry.type !== "Point") continue;
              const [fLng, fLat] = f.geometry.coordinates;
              const key = `${fLng.toFixed(3)},${fLat.toFixed(3)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              coords.push([fLng, fLat]);
            }
            dotCoords = coords;
          } catch { /* map briefly not ready */ }
        }

        // ── Compute current dot RGB (shared by all dots this frame) ────────────
        let cr: number, cg: number, cb: number;

        const toHex   = toColorRef.current;
        const fromHex = fromColorRef.current;

        if (fromHex && transitionStartRef.current >= 0) {
          const elapsed = now - transitionStartRef.current;
          if (elapsed >= COLOR_TRANSITION_MS) {
            // Transition complete — snap and clear
            fromColorRef.current       = null;
            transitionStartRef.current = -1;
            [cr, cg, cb] = hexToRgb(toHex);
          } else {
            const t = easeInOut(elapsed / COLOR_TRANSITION_MS);
            const [fr, fg, fb] = hexToRgb(fromHex);
            const [tr, tg, tb] = hexToRgb(toHex);
            cr = Math.round(fr + (tr - fr) * t);
            cg = Math.round(fg + (tg - fg) * t);
            cb = Math.round(fb + (tb - fb) * t);
          }
        } else {
          [cr, cg, cb] = hexToRgb(toHex);
        }

        // ── Draw icospheres on canvas overlay ──────────────────────────────────
        const W = overlayEl.width  / (window.devicePixelRatio || 1);
        const H = overlayEl.height / (window.devicePixelRatio || 1);
        ctx.clearRect(0, 0, W, H);

        // Cull margin: glow extends to MARKER_R * 2.6 beyond the centre
        const cullR = MARKER_R * 3;

        dotCoords.forEach((coord, idx) => {
          const [dLng, dLat] = coord;
          const key = `${dLng.toFixed(3)},${dLat.toFixed(3)}`;

          const pt = map.project([dLng, dLat]);
          if (pt.x < -cullR || pt.x > W + cullR || pt.y < -cullR || pt.y > H + cullR) return;

          const rot = getDotRot(key, idx);
          rot.rx += rot.speedX;
          rot.ry += rot.speedY;

          // Centre the sphere above its label anchor (16 px clears the text)
          const sx = pt.x;
          const sy = pt.y - 16;

          drawGlow(ctx, sx, sy, MARKER_R, cr, cg, cb);
          drawIcosphere(ctx, sx, sy, MARKER_R, rot.rx, rot.ry, cr, cg, cb);
        });

        rafRef.current = requestAnimationFrame(frame);
      }

      rafRef.current = requestAnimationFrame(frame);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      map.remove();
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", width: "100%", height: "100%", background: "#000000" }}
    >
      <div
        ref={mapDivRef}
        style={{ position: "absolute", inset: 0 }}
      />
      <canvas
        ref={overlayRef}
        style={{
          position:      "absolute",
          inset:         0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

"use client";

/**
 * CinematicMapPage — fullscreen ambient geographic network map for /map.
 *
 * Completely separate from the homepage sphere / world system.
 * Uses MapLibre GL (same as MapVisual) to render the dark geographic basemap
 * and tours through 20 global cities with glowing Blueprint icosphere nodes.
 *
 * Enhancements over the embedded MapVisual widget:
 *  • Full-viewport layout (position: fixed, inset 0)
 *  • Blueprint brand color nodes (neon emerald green) with stronger glow
 *  • Pulsing node radii (soft breathing animation)
 *  • Faint connection lines between on-screen neighbours
 *  • Multi-layer bloom (inner core + mid glow + outer haze)
 *  • CSS vignette overlay
 *  • Mode-based tour speed: ambient (slow) · investor (standard) · fast
 *
 * Controls:
 *  Space → pause / resume
 *  Mouse movement → subtle map parallax (nudge toward cursor, very gentle)
 */

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

// ── Constants ─────────────────────────────────────────────────────────────────

const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Blueprint brand color — neon emerald green (sci-fi / NVIDIA / Matrix)
const BLUEPRINT_COLOR = "#39ff14";

// Tour timing (milliseconds for one full loop through all cities).
// Mode multipliers are applied at runtime.
const BASE_LOOP_MS    = 764_000;
const ZOOM_DELTA      = 0.022;
const LATERAL_DELTA   = 0.005;
const CYCLE           = ZOOM_DELTA * 2 + LATERAL_DELTA;

const MARKER_R = 13; // CSS px — slightly larger than widget version for fullscreen

// Connection lines: max screen-distance (px) between two dots to draw a line
const CONNECT_MAX_PX = 160;

// ── City list (identical to MapVisual — same world tour) ──────────────────────

const CITIES = [
  { lat:  37.7879, lng: -122.4074, cityZoom: 13, txZ: 7 },
  { lat:  34.0522, lng: -118.2437, cityZoom: 13, txZ: 5 },
  { lat:  19.4326, lng:  -99.1332, cityZoom: 13, txZ: 5 },
  { lat:  33.7490, lng:  -84.3880, cityZoom: 13, txZ: 6 },
  { lat:  40.7580, lng:  -73.9855, cityZoom: 13, txZ: 4 },
  { lat:  10.4806, lng:  -66.9036, cityZoom: 13, txZ: 3 },
  { lat: -34.6037, lng:  -58.3816, cityZoom: 13, txZ: 3 },
  { lat:  48.8584, lng:    2.2945, cityZoom: 13, txZ: 4 },
  { lat:   6.5244, lng:    3.3792, cityZoom: 13, txZ: 4 },
  { lat: -33.9249, lng:   18.4241, cityZoom: 13, txZ: 3 },
  { lat:  33.8886, lng:   35.4955, cityZoom: 13, txZ: 5 },
  { lat:  55.7558, lng:   37.6173, cityZoom: 13, txZ: 4 },
  { lat:  28.7041, lng:   77.1025, cityZoom: 13, txZ: 6 },
  { lat:  13.0827, lng:   80.2707, cityZoom: 13, txZ: 5 },
  { lat:  22.2857, lng:  114.1577, cityZoom: 13, txZ: 6 },
  { lat:  31.2304, lng:  121.4737, cityZoom: 13, txZ: 7 },
  { lat:  37.5665, lng:  126.9780, cityZoom: 13, txZ: 7 },
  { lat:  35.6762, lng:  139.6503, cityZoom: 13, txZ: 3 },
  { lat: -33.8688, lng:  151.2093, cityZoom: 13, txZ: 3 },
  { lat:  21.3069, lng: -157.8583, cityZoom: 13, txZ: 4 },
] as const;

// ── Tour keyframe table ───────────────────────────────────────────────────────

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

// ── Color helper ──────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

// ── Icosphere geometry (subdivision 1 = 80 faces, clear wireframe at 13 px) ──

type V3  = [number, number, number];
type Tri = [number, number, number];

function norm3([x,y,z]: V3): V3 {
  const l = Math.sqrt(x*x+y*y+z*z); return [x/l,y/l,z/l];
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
  for (let s=0; s<subdivs; s++) {
    const cache = new Map<string,number>();
    const mid = (a: number, b: number): number => {
      const k = a<b?`${a}:${b}`:`${b}:${a}`;
      if (cache.has(k)) return cache.get(k)!;
      const [ax,ay,az]=verts[a],[bx,by,bz]=verts[b];
      verts.push(norm3([(ax+bx)/2,(ay+by)/2,(az+bz)/2]));
      cache.set(k,verts.length-1); return verts.length-1;
    };
    const next: Tri[] = [];
    for (const [a,b,c] of faces) {
      const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
    }
    faces=next;
  }
  return {verts,faces};
}

const ISO_MARKER = buildIcosphere(1);

// ── Drawing helpers ───────────────────────────────────────────────────────────

/**
 * Multi-layer bloom glow — three concentric radial gradients for a richer
 * bloom than the single-layer version in MapVisual.
 *
 *  Layer 1: tight inner corona  (strong)
 *  Layer 2: mid atmosphere      (medium)
 *  Layer 3: outer haze          (very soft)
 */
function drawGlow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number,
  cr: number, cg: number, cb: number,
  pulse: number,
) {
  // Inner corona
  const r1 = R * 2.0 * pulse;
  const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r1);
  g1.addColorStop(0,   `rgba(${cr},${cg},${cb},0.42)`);
  g1.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.12)`);
  g1.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = g1;
  ctx.beginPath(); ctx.arc(cx, cy, r1, 0, Math.PI*2); ctx.fill();

  // Mid atmosphere
  const r2 = R * 3.8 * pulse;
  const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r2);
  g2.addColorStop(0,    `rgba(${cr},${cg},${cb},0.10)`);
  g2.addColorStop(0.55, `rgba(${cr},${cg},${cb},0.04)`);
  g2.addColorStop(1,    `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = g2;
  ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI*2); ctx.fill();

  // Outer haze — only on fullscreen (performance acceptable at 60fps)
  const r3 = R * 6.5 * pulse;
  const g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r3);
  g3.addColorStop(0,    `rgba(${cr},${cg},${cb},0.03)`);
  g3.addColorStop(1,    `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = g3;
  ctx.beginPath(); ctx.arc(cx, cy, r3, 0, Math.PI*2); ctx.fill();
}

/** Draw a rotating icosphere wireframe node — matches MapVisual logic. */
function drawIcosphere(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number,
  rx: number, ry: number,
  cr: number, cg: number, cb: number,
) {
  const { verts, faces } = ISO_MARKER;
  const sX=Math.sin(rx),cX=Math.cos(rx),sY=Math.sin(ry),cY=Math.cos(ry);
  const pv = verts.map(([x,y,z]) => {
    const x1=x*cY-z*sY, z1=x*sY+z*cY;
    const y2=y*cX-z1*sX, z2=y*sX+z1*cX;
    return { sx: cx+x1*R, sy: cy-y2*R, z: z2 };
  });
  const sorted = faces
    .map((f,i)=>({f,i,z:(pv[f[0]].z+pv[f[1]].z+pv[f[2]].z)/3}))
    .sort((a,b)=>a.z-b.z);
  for (const {f,z} of sorted) {
    const [ia,ib,ic]=f;
    const fillA   = (0.08 + Math.max(0,z)*0.22).toFixed(3);
    const strokeA = (0.40 + Math.max(0,z)*0.55).toFixed(3);
    ctx.beginPath();
    ctx.moveTo(pv[ia].sx,pv[ia].sy);
    ctx.lineTo(pv[ib].sx,pv[ib].sy);
    ctx.lineTo(pv[ic].sx,pv[ic].sy);
    ctx.closePath();
    ctx.fillStyle   = `rgba(${cr},${cg},${cb},${fillA})`; ctx.fill();
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${strokeA})`; ctx.lineWidth=0.7; ctx.stroke();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** "ambient" = slow languid orbit | "investor" = standard tour | "fast" = energetic */
  mode?: string;
}

export default function CinematicMapPage({ mode = "investor" }: Props) {
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const mapDivRef   = useRef<HTMLDivElement>(null);
  const overlayRef  = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef(0);
  const pausedRef   = useRef(false);

  const [isPaused, setIsPaused] = useState(false);

  // ── Spacebar pause / resume ───────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.target !== document.body) return;
      e.preventDefault();
      pausedRef.current = !pausedRef.current;
      setIsPaused(v => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Map + overlay loop ────────────────────────────────────────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const mapDiv  = mapDivRef.current;
    const overlay = overlayRef.current;
    if (!wrapper || !mapDiv || !overlay) return;

    const overlayEl: HTMLCanvasElement = overlay;
    const ctx2d = overlayEl.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    // Mode → tour speed multiplier
    const speedMult = mode === "ambient" ? 0.40
                    : mode === "fast"    ? 2.20
                    : 1.00;
    const loopMs = BASE_LOOP_MS / speedMult;

    // Blueprint brand RGB
    const [CR, CG, CB] = hexToRgb(BLUEPRINT_COLOR);

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

    let mapLoaded  = false;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const w   = wrapper.clientWidth;
      const h   = wrapper.clientHeight;
      overlayEl.width        = w * dpr;
      overlayEl.height       = h * dpr;
      overlayEl.style.width  = `${w}px`;
      overlayEl.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mapLoaded) map.resize();
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(wrapper);

    let loopPhase  = 0;
    let last       = 0;
    let frameCount = 0;
    let placeLayers: string[] = [];
    let dotCoords:   [number, number][] = [];

    // Per-dot rotation state (stable across frames via Map key)
    const dotRotations = new Map<string, {
      rx: number; ry: number; speedX: number; speedY: number;
    }>();

    function getDotRot(key: string, idx: number) {
      if (!dotRotations.has(key)) {
        const h = idx * 1_234_567 + 98_765;
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
      mapLoaded = true;
      requestAnimationFrame(() => map.resize());

      // Globe projection
      try { (map as any).setProjection({ type: "globe" }); } catch {
        try { (map as any).setProjection("globe"); } catch { /* unsupported */ }
      }
      // Deep space atmosphere
      try {
        (map as any).setFog?.({
          range:           [0.8, 12],
          color:           "#000000",
          "high-color":    "#00050f",
          "horizon-blend": 0.14,
          "space-color":   "#000000",
          "star-intensity": 0.10,
        });
      } catch { /* ignore */ }

      // Collect place-label layer IDs
      placeLayers = map.getStyle().layers
        .filter(l => {
          if (l.type !== "symbol") return false;
          return ((l as any)["source-layer"] ?? "").toLowerCase() === "place";
        })
        .map(l => l.id);

      function frame(now: number) {
        if (pausedRef.current) {
          rafRef.current = requestAnimationFrame(frame);
          return;
        }

        const dt  = last ? Math.min(now - last, 50) : 16;
        last      = now;
        loopPhase = (loopPhase + dt / loopMs) % 1;
        frameCount++;

        const { zoom, lat, lng } = getTourCamera(loopPhase);
        map.jumpTo({ center: [lng, lat], zoom });

        // Update dot positions every 4 frames
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

        // ── Canvas overlay ─────────────────────────────────────────────────
        const W = overlayEl.width  / (window.devicePixelRatio || 1);
        const H = overlayEl.height / (window.devicePixelRatio || 1);
        ctx.clearRect(0, 0, W, H);

        const cullR = MARKER_R * 7; // glow extends far on fullscreen

        // Collect on-screen dot screen positions for connection lines
        type DotPos = { x: number; y: number };
        const onScreen: DotPos[] = [];

        dotCoords.forEach((coord, idx) => {
          const [dLng, dLat] = coord;
          const key = `${dLng.toFixed(3)},${dLat.toFixed(3)}`;
          const pt  = map.project([dLng, dLat]);
          if (pt.x < -cullR || pt.x > W+cullR || pt.y < -cullR || pt.y > H+cullR) return;

          const rot = getDotRot(key, idx);
          rot.rx += rot.speedX;
          rot.ry += rot.speedY;

          // Breathing pulse — each dot has a slightly different phase
          const pulse = 0.88 + 0.12 * Math.sin(now * 0.0008 + idx * 0.9);

          const sx = pt.x;
          const sy = pt.y - 22; // float above label anchor

          drawGlow(ctx, sx, sy, MARKER_R, CR, CG, CB, pulse);
          drawIcosphere(ctx, sx, sy, MARKER_R * pulse, rot.rx, rot.ry, CR, CG, CB);

          onScreen.push({ x: sx, y: sy });
        });

        // ── Faint connection lines between nearby on-screen nodes ──────────
        // Only draw lines when enough nodes are visible (zoomed out)
        if (onScreen.length > 1 && onScreen.length < 80) {
          ctx.save();
          for (let i = 0; i < onScreen.length; i++) {
            for (let j = i + 1; j < onScreen.length; j++) {
              const dx   = onScreen[i].x - onScreen[j].x;
              const dy   = onScreen[i].y - onScreen[j].y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist > CONNECT_MAX_PX) continue;
              const alpha = (1 - dist / CONNECT_MAX_PX) * 0.12;
              ctx.strokeStyle = `rgba(${CR},${CG},${CB},${alpha.toFixed(3)})`;
              ctx.lineWidth   = 0.6;
              ctx.beginPath();
              ctx.moveTo(onScreen[i].x, onScreen[i].y);
              ctx.lineTo(onScreen[j].x, onScreen[j].y);
              ctx.stroke();
            }
          }
          ctx.restore();
        }

        rafRef.current = requestAnimationFrame(frame);
      }

      rafRef.current = requestAnimationFrame(frame);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      map.remove();
    };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={wrapperRef}
      style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}
    >
      {/* ── MapLibre basemap ────────────────────────────────────────────────── */}
      <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />

      {/* ── Icosphere overlay canvas ────────────────────────────────────────── */}
      <canvas
        ref={overlayRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />

      {/* ── Vignette ────────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          inset:         0,
          background:    "radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(0,0,0,0.68) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Top edge fade (softens map sky / title bar area) ────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          top:           0, left: 0, right: 0,
          height:        80,
          background:    "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)",
          pointerEvents: "none",
        }}
      />

      {/* ── Bottom edge fade ────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          bottom:        0, left: 0, right: 0,
          height:        80,
          background:    "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
          pointerEvents: "none",
        }}
      />

      {/* ── Blueprint wordmark ──────────────────────────────────────────────── */}
      <div
        style={{
          position:      "absolute",
          bottom:        28,
          left:          "50%",
          transform:     "translateX(-50%)",
          color:         "rgba(255,255,255,0.14)",
          fontSize:      11,
          fontWeight:    500,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          userSelect:    "none",
          pointerEvents: "none",
          whiteSpace:    "nowrap",
        }}
      >
        Blueprint
      </div>

      {/* ── Pause indicator ─────────────────────────────────────────────────── */}
      {isPaused && (
        <div
          style={{
            position:      "absolute",
            inset:         0,
            display:       "flex",
            alignItems:    "center",
            justifyContent:"center",
            pointerEvents: "none",
          }}
        >
          <span style={{
            color:         "rgba(255,255,255,0.28)",
            fontSize:      12,
            letterSpacing: "0.20em",
            textTransform: "uppercase",
            fontWeight:    500,
          }}>
            Paused — Space to resume
          </span>
        </div>
      )}
    </div>
  );
}

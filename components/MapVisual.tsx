"use client";

import { useEffect, useRef } from "react";
import MiniSphere from "@/components/MiniSphere";

/* ── Types ──────────────────────────────────────────────────────────────── */

type PlaceNode = {
  id: string; label: string;
  lat: number; lng: number;
  size: number; seed: number;
  minT: number; maxT: number;
};

/* ── Place nodes — US only, three zoom stages ───────────────────────────── *
 *
 *  Stage 1  (t 0.00–0.30)  Menlo Park only — clean, focused
 *  Stage 2  (t 0.32–0.72)  West Coast cities — SF, LA, Seattle, Denver
 *                           These are 40–110 px apart at Stage 2 zoom, so
 *                           spheres never overlap.
 *  Stage 3  (t 0.55–1.00)  National cities — full USA
 *
 *  MP exits before Stage 2 cities enter (brief clean gap at t≈0.30–0.32)
 *  so the camera pan never causes MP + SF to share the same screen pixel.
 *
 *  PLACES is the single source of truth.  Every entry renders exactly one
 *  MiniSphere + one label, always paired in the same parent div.           */

const PLACES: PlaceNode[] = [
  // ── Stage 1: just Menlo Park ──────────────────────────────────────────
  { id:"mp",  label:"Menlo Park",    lat:37.453, lng:-122.182, size:28, seed:17, minT:-0.055, maxT:0.30 },

  // ── Stage 2: West Coast — verified non-overlapping at zoom 1.8× ──────
  //   SF (275,441)  LA (301,472)  Sea (278,370)  Den (377,422) — all 40px+ apart
  { id:"sf",  label:"San Francisco", lat:37.774, lng:-122.419, size:32, seed: 1, minT:0.32, maxT:0.68 },
  { id:"la",  label:"Los Angeles",   lat:34.052, lng:-118.244, size:34, seed: 3, minT:0.32, maxT:0.72 },
  { id:"sea", label:"Seattle",       lat:47.606, lng:-122.332, size:28, seed:31, minT:0.34, maxT:0.70 },
  { id:"den", label:"Denver",        lat:39.739, lng:-104.984, size:24, seed:35, minT:0.36, maxT:0.75 },

  // ── Stage 3: national ─────────────────────────────────────────────────
  { id:"ny",  label:"New York",      lat:40.713, lng: -74.006, size:38, seed:21, minT:0.55, maxT:1.055 },
  { id:"chi", label:"Chicago",       lat:41.878, lng: -87.630, size:32, seed: 9, minT:0.55, maxT:1.055 },
  { id:"hou", label:"Houston",       lat:29.760, lng: -95.370, size:26, seed:11, minT:0.57, maxT:1.055 },
  { id:"mia", label:"Miami",         lat:25.762, lng: -80.192, size:24, seed:15, minT:0.57, maxT:1.055 },
  { id:"bos", label:"Boston",        lat:42.361, lng: -71.057, size:26, seed:19, minT:0.57, maxT:1.055 },
];

/* ── Camera keyframes: [t, zoomScale, cLat, cLng] ───────────────────────── *
 *  zoomScale multiplies the base globe radius (BASE_R × zoom = actual R).   *
 *                                                                            *
 *    5×  →  R ≈ 2.1× min(w,h).  Bay Area close-up.  Globe edge arcs in     *
 *           from sides so it still reads as a sphere, not a flat map.       *
 *                                                                            *
 *   1.8×  →  R ≈ 0.76× min(w,h).  California coast and Pacific visible;    *
 *            West Coast cities spread comfortably across the frame.          *
 *                                                                            *
 *   0.90×  →  Full globe circle fits in the panel.  All of North America    *
 *            and the wider US visible.  5.6:1 ratio Stage 1 → Stage 3.      */

const CAM: readonly [number, number, number, number][] = [
  [0.00,  5.00, 37.50, -122.20],  // Stage 1: Bay Area — zoomed in, globe edge arcs in from sides
  [0.38,  1.80, 37.00, -120.00],  // California / West Coast pull-back
  [0.65,  0.90, 39.00,  -97.00],  // Full continental USA
  [1.00,  0.90, 39.00,  -97.00],  // Hold at USA for smooth loop reverse
];

const BASE_R  = 0.42;    // globe radius as fraction of min(w,h) at zoom 1× (= 0.90 in Stage 3)
const SPEED   = 0.000110; // t units per ms → full cycle ≈ 9 s each way
const FADE_W  = 0.055;    // t-width of label fade-in / fade-out ramp

/* ── Continent outlines — [lng, lat] ────────────────────────────────────── */

const LAND: [number, number][][] = [
  // North America
  [[-165,68],[-148,70],[-130,56],[-124,49],[-124,46],[-124,42],
   [-117,33],[-110,23],[-90,15],[-83,9],[-77,8],[-77,10],[-83,15],
   [-88,21],[-91,19],[-97,26],[-81,25],[-80,26],[-80,32],[-73,41],
   [-66,44],[-60,47],[-53,47],[-56,53],[-60,60],[-64,64],[-80,73],
   [-100,74],[-125,70],[-150,62],[-162,60],[-165,64],[-165,68]],
  // South America
  [[-80,10],[-75,11],[-65,11],[-52,5],[-35,-5],[-36,-10],[-40,-20],
   [-43,-23],[-50,-29],[-55,-35],[-58,-42],[-65,-55],[-68,-57],[-70,-55],
   [-76,-52],[-72,-45],[-70,-40],[-72,-35],[-70,-18],[-77,-14],[-80,-8],
   [-80,0],[-80,10]],
  // Europe
  [[-10,36],[40,35],[42,37],[40,42],[32,47],[28,57],[18,71],[10,63],
   [5,58],[3,51],[-5,50],[-5,48],[-2,44],[0,43],[2,41],[-5,37],
   [-9,39],[-9,44],[-5,44],[-10,36]],
  // Africa
  [[-17,35],[10,37],[32,30],[42,37],[50,30],[45,22],[44,12],[42,5],
   [40,-10],[35,-20],[26,-34],[18,-35],[14,-20],[10,-8],[8,5],[-5,5],
   [-16,12],[-17,20],[-15,25],[-17,35]],
  // Asia
  [[30,70],[50,75],[80,73],[100,73],[120,73],[140,72],[160,68],[170,64],
   [165,55],[145,43],[140,35],[130,20],[115,8],[100,10],[95,18],[88,22],
   [82,10],[77,8],[80,13],[78,20],[72,22],[63,22],[58,22],[50,25],
   [42,37],[40,42],[32,47],[30,52],[30,60],[30,70]],
  // Australia
  [[114,-22],[117,-20],[128,-14],[136,-12],[140,-12],[148,-15],[152,-18],
   [155,-25],[152,-30],[152,-36],[150,-38],[148,-38],[143,-38],[140,-35],
   [136,-36],[128,-35],[122,-34],[116,-33],[114,-30],[112,-26],[114,-22]],
];

/* ── Orthographic projection ─────────────────────────────────────────────
   Standard formula. z > 0 → front hemisphere (camera-facing, visible).  */

type Proj = { px: number; py: number; z: number };

function orthoProject(
  lat: number, lng: number,
  cLat: number, cLng: number,
  R: number, cx: number, cy: number,
): Proj {
  const φ   = (lat  * Math.PI) / 180;
  const φ0  = (cLat * Math.PI) / 180;
  const dλ  = ((lng - cLng) * Math.PI) / 180;
  const sinφ  = Math.sin(φ),  cosφ  = Math.cos(φ);
  const sinφ0 = Math.sin(φ0), cosφ0 = Math.cos(φ0);
  const x = cosφ  * Math.sin(dλ);
  const y = cosφ0 * sinφ - sinφ0 * cosφ * Math.cos(dλ);
  const z = sinφ0 * sinφ + cosφ0 * cosφ * Math.cos(dλ);
  return { px: cx + x * R, py: cy - y * R, z };
}

/* Back-hemisphere vertices clamped to the limb ring so continent fills
   wrap cleanly to the globe edge instead of spilling inward.            */
function clampToLimb({ px, py, z }: Proj, R: number, cx: number, cy: number): Proj {
  if (z >= 0) return { px, py, z };
  const dx = px - cx, dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return { px: cx + R, py: cy, z: 0 };
  return { px: cx + (dx / dist) * R, py: cy + (dy / dist) * R, z: 0 };
}

/* ── Globe renderer ──────────────────────────────────────────────────────
   R is passed in so the caller can animate zoom by scaling it.          */

function drawGlobe(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  cLat: number, cLng: number,
  R: number,
) {
  const cx = w / 2;
  const cy = h / 2;

  ctx.clearRect(0, 0, w, h);

  // Space background
  ctx.fillStyle = "#03050b";
  ctx.fillRect(0, 0, w, h);

  // Atmosphere halo
  const atmos = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.14);
  atmos.addColorStop(0,   "rgba(20,70,200,0.20)");
  atmos.addColorStop(0.5, "rgba(10,40,120,0.07)");
  atmos.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.14, 0, Math.PI * 2);
  ctx.fillStyle = atmos;
  ctx.fill();

  // Globe base + clip region
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "#091422";
  ctx.fill();
  ctx.clip();

  // Graticule — very subtle lat/lng grid
  ctx.strokeStyle = "rgba(30,80,160,0.11)";
  ctx.lineWidth = 0.5;
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath();
    let fresh = true;
    for (let ln = -180; ln <= 180; ln += 3) {
      const { px, py, z } = orthoProject(lat, ln, cLat, cLng, R, cx, cy);
      if (z >= 0) { fresh ? ctx.moveTo(px, py) : ctx.lineTo(px, py); fresh = false; }
      else fresh = true;
    }
    ctx.stroke();
  }
  for (let ln = -180; ln <= 180; ln += 30) {
    ctx.beginPath();
    let fresh = true;
    for (let lt = -80; lt <= 80; lt += 3) {
      const { px, py, z } = orthoProject(lt, ln, cLat, cLng, R, cx, cy);
      if (z >= 0) { fresh ? ctx.moveTo(px, py) : ctx.lineTo(px, py); fresh = false; }
      else fresh = true;
    }
    ctx.stroke();
  }

  // Continent fills — clamped projection keeps fills within the globe circle
  ctx.fillStyle = "#1d3352";
  for (const poly of LAND) {
    ctx.beginPath();
    poly.forEach(([lng, lat], i) => {
      const p = clampToLimb(orthoProject(lat, lng, cLat, cLng, R, cx, cy), R, cx, cy);
      i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py);
    });
    ctx.closePath();
    ctx.fill();
  }

  // Continent edges — only on front-facing portions, pen lifts at limb
  ctx.strokeStyle = "#2b4f74";
  ctx.lineWidth = 0.8;
  for (const poly of LAND) {
    ctx.beginPath();
    let pen = false;
    for (const [lng, lat] of poly) {
      const { px, py, z } = orthoProject(lat, lng, cLat, cLng, R, cx, cy);
      if (z >= 0) { pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py); pen = true; }
      else pen = false;
    }
    ctx.stroke();
  }

  // Limb darkening — the primary effect that makes a disc read as a sphere
  const limb = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  limb.addColorStop(0.00, "rgba(0,0,0,0)");
  limb.addColorStop(0.55, "rgba(0,0,0,0)");
  limb.addColorStop(0.82, "rgba(0,4,18,0.28)");
  limb.addColorStop(1.00, "rgba(0,4,18,0.90)");
  ctx.fillStyle = limb;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Specular highlight — subtle light source, upper-left
  const spec = ctx.createRadialGradient(
    cx - R * 0.32, cy - R * 0.30, 0,
    cx - R * 0.32, cy - R * 0.30, R * 0.72,
  );
  spec.addColorStop(0, "rgba(80,150,255,0.11)");
  spec.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = spec;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  ctx.restore();

  // Globe edge ring
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(40,100,220,0.28)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/* ── Component ───────────────────────────────────────────────────────── */

export default function MapVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef(0);
  const animRef      = useRef({ t: 0, dir: 1 });
  const elsRef       = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const containerRaw = containerRef.current;
    const canvasRaw    = canvasRef.current;
    if (!containerRaw || !canvasRaw) return;
    const container: HTMLDivElement    = containerRaw;
    const canvas:    HTMLCanvasElement = canvasRaw;

    const ctxRaw = canvas.getContext("2d");
    if (!ctxRaw) return;
    const ctx: CanvasRenderingContext2D = ctxRaw;

    function sizeCanvas() {
      canvas.width  = container.offsetWidth  || 600;
      canvas.height = container.offsetHeight || 800;
    }
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(container);

    // Animation helpers
    const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
    const ease = (u: number) =>
      u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

    function getCamera(t: number) {
      let i = 0;
      while (i < CAM.length - 2 && CAM[i + 1][0] <= t) i++;
      const [t0, s0, la0, ln0] = CAM[i];
      const [t1, s1, la1, ln1] = CAM[i + 1];
      const e = ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
      return {
        zoom: lerp(s0, s1, e),
        cLat: lerp(la0, la1, e),
        cLng: lerp(ln0, ln1, e),
      };
    }

    let last = 0;

    function frame(now: number) {
      const dt = last ? Math.min(now - last, 50) : 16;
      last = now;

      const a = animRef.current;
      a.t += a.dir * SPEED * dt;
      if (a.t >= 1) { a.t = 1; a.dir = -1; }
      if (a.t <= 0) { a.t = 0; a.dir =  1; }

      const { zoom, cLat, cLng } = getCamera(a.t);
      const w  = canvas.width;
      const h  = canvas.height;
      const R  = Math.min(w, h) * BASE_R * zoom;
      const cx = w / 2;
      const cy = h / 2;

      // Draw globe — stable dark sphere, no spinning
      drawGlobe(ctx, w, h, cLat, cLng, R);

      // Position nodes using the same orthographic projection.
      // Each node is visible only when:
      //   (a) t is within [minT, maxT]  — zoom-stage gating
      //   (b) z > 0.05                  — front-facing hemisphere only
      // Sphere and label are in one div, so they always appear together.
      PLACES.forEach(p => {
        const el = elsRef.current.get(p.id);
        if (!el) return;
        const { px, py, z } = orthoProject(p.lat, p.lng, cLat, cLng, R, cx, cy);

        const tFade =
          a.t < p.minT || a.t > p.maxT
            ? 0
            : Math.min((a.t - p.minT) / FADE_W, (p.maxT - a.t) / FADE_W, 1);
        const zFade = Math.min(1, Math.max(0, (z - 0.05) / 0.18));
        const opacity = tFade * zFade;

        if (opacity > 0.004) {
          el.style.left    = `${px}px`;
          el.style.top     = `${py}px`;
          el.style.opacity = `${opacity}`;
        } else {
          el.style.opacity = "0";
        }
      });

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative", width: "100%", height: "100%",
        overflow: "hidden", background: "#03050b",
      }}
    >
      {/* Canvas — globe drawn fresh each frame, pure canvas, zero network */}
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, display: "block" }} />

      {/* ── Place nodes ──────────────────────────────────────────────────────
          PLACES is the only source of visible labels.  Each entry gets:
            • one MiniSphere (colorful icosphere)
            • one label span directly below it
          Both live in the same parent div.  Opacity is set on the parent,
          so sphere and label are ALWAYS shown or hidden together — a label
          can never appear without its sphere.                             */}
      {PLACES.map(p => (
        <div
          key={p.id}
          ref={el => { if (el) elsRef.current.set(p.id, el); }}
          style={{
            position: "absolute",
            zIndex: 10,
            opacity: 0,
            pointerEvents: "none",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
          }}
        >
          <MiniSphere size={p.size} seed={p.seed} />
          <span style={{
            fontSize: Math.max(8, Math.round(p.size * 0.30)),
            color: "rgba(255,255,255,0.65)",
            whiteSpace: "nowrap",
            letterSpacing: "0.06em",
            lineHeight: 1,
            textShadow: "0 1px 6px rgba(0,0,0,0.95)",
          }}>
            {p.label}
          </span>
        </div>
      ))}
    </div>
  );
}

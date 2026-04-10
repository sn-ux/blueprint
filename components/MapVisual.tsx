"use client";

import { useEffect, useRef } from "react";
import MiniSphere from "@/components/MiniSphere";

/* ── Types ──────────────────────────────────────────────────────────────── */

type PlaceNode = {
  id: string; label: string;
  lat: number; lng: number;
  size: number; seed: number;
};

/* ── Place nodes (small fixed set — no zoom sequence yet) ───────────────── */

const PLACES: PlaceNode[] = [
  { id:"mp",  label:"Menlo Park",    lat: 37.45, lng:-122.18, size:26, seed:17 },
  { id:"sf",  label:"San Francisco", lat: 37.77, lng:-122.42, size:32, seed: 1 },
  { id:"ny",  label:"New York",      lat: 40.71, lng: -74.01, size:36, seed:21 },
  { id:"lon", label:"London",        lat: 51.51, lng:  -0.13, size:36, seed: 2 },
  { id:"tok", label:"Tokyo",         lat: 35.68, lng: 139.69, size:32, seed:16 },
];

/* ── Globe constants ────────────────────────────────────────────────────── */

const CENTER_LAT = 20;    // fixed axial tilt (degrees N)
const ROT_SPEED  = 0.03;  // degrees per frame → ~3 min per full rotation

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
   Standard formula. Returns screen [px, py] and depth z.
   z > 0  → point faces the camera (front hemisphere, visible).
   z <= 0 → point is behind the globe (hidden).                         */

type Proj = { px: number; py: number; z: number };

function orthoProject(
  lat: number, lng: number,
  cLat: number, cLng: number,
  R: number, cx: number, cy: number,
): Proj {
  const φ   = (lat  * Math.PI) / 180;
  const φ0  = (cLat * Math.PI) / 180;
  const dλ  = ((lng - cLng) * Math.PI) / 180;
  const sinφ = Math.sin(φ),  cosφ = Math.cos(φ);
  const sinφ0 = Math.sin(φ0), cosφ0 = Math.cos(φ0);
  const x = cosφ * Math.sin(dλ);
  const y = cosφ0 * sinφ - sinφ0 * cosφ * Math.cos(dλ);
  const z = sinφ0 * sinφ + cosφ0 * cosφ * Math.cos(dλ);
  return { px: cx + x * R, py: cy - y * R, z };
}

/* Continent fills: back-hemisphere polygon vertices are pushed to the limb
   so the continent silhouette wraps naturally to the globe edge rather than
   spilling to the wrong side of the canvas.                             */
function clampToLimb({ px, py, z }: Proj, R: number, cx: number, cy: number): Proj {
  if (z >= 0) return { px, py, z };
  const dx = px - cx, dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return { px: cx + R, py: cy, z: 0 };
  return { px: cx + (dx / dist) * R, py: cy + (dy / dist) * R, z: 0 };
}

/* ── Globe renderer — called every animation frame ───────────────────────
   Pure canvas ops. No network. No tiles. Zero flash.                   */

function drawGlobe(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  cLat: number, cLng: number,
) {
  const R  = Math.min(w, h) * 0.42;
  const cx = w / 2;
  const cy = h / 2;

  ctx.clearRect(0, 0, w, h);

  // ── Deep space background ──────────────────────────────────────────────
  ctx.fillStyle = "#03050b";
  ctx.fillRect(0, 0, w, h);

  // ── Atmosphere glow (halo just outside the limb) ───────────────────────
  const atmos = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.14);
  atmos.addColorStop(0, "rgba(20,70,200,0.20)");
  atmos.addColorStop(0.5, "rgba(10,40,120,0.07)");
  atmos.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.14, 0, Math.PI * 2);
  ctx.fillStyle = atmos;
  ctx.fill();

  // ── Globe sphere — everything below is clipped to this circle ─────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "#091422";
  ctx.fill();
  ctx.clip();

  // ── Graticule (lat/lng grid, very subtle) ─────────────────────────────
  ctx.strokeStyle = "rgba(30,80,160,0.11)";
  ctx.lineWidth = 0.5;
  // Latitude parallels
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
  // Longitude meridians
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

  // ── Continent fills ────────────────────────────────────────────────────
  // Back-hemisphere vertices are clamped to the limb so the fill wraps
  // cleanly to the globe edge — looks correct, not distorted.
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

  // ── Continent edges (front-facing only — pen lifts at the limb) ────────
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

  // ── Limb darkening — the key effect that sells the spherical form ──────
  // Ocean brightens toward centre, darkens toward edge (atmospheric limb)
  const limb = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  limb.addColorStop(0.0, "rgba(0,0,0,0)");
  limb.addColorStop(0.55, "rgba(0,0,0,0)");
  limb.addColorStop(0.82, "rgba(0,4,18,0.28)");
  limb.addColorStop(1.0,  "rgba(0,4,18,0.90)");
  ctx.fillStyle = limb;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // ── Specular highlight (light source upper-left) ───────────────────────
  const spec = ctx.createRadialGradient(
    cx - R * 0.32, cy - R * 0.30, 0,
    cx - R * 0.32, cy - R * 0.30, R * 0.72,
  );
  spec.addColorStop(0, "rgba(80,150,255,0.11)");
  spec.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = spec;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  ctx.restore(); // end clip

  // ── Globe edge ring (thin bright circle defines the limb cleanly) ──────
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
  const rotLngRef    = useRef(-60); // start facing Atlantic (MP, NY, London all visible)
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

    let last = 0;

    function frame(now: number) {
      const dt = last ? Math.min(now - last, 50) : 16;
      last = now;

      // Slowly rotate the globe eastward
      rotLngRef.current += ROT_SPEED * (dt / 16);
      if (rotLngRef.current > 180) rotLngRef.current -= 360;

      const cLat = CENTER_LAT;
      const cLng = rotLngRef.current;
      const w    = canvas.width;
      const h    = canvas.height;
      const R    = Math.min(w, h) * 0.42;
      const cx   = w / 2;
      const cy   = h / 2;

      drawGlobe(ctx, w, h, cLat, cLng);

      // Position each place node using the same orthographic projection.
      // Only front-facing nodes (z > 0.05) are shown; they fade in near the limb.
      PLACES.forEach(p => {
        const el = elsRef.current.get(p.id);
        if (!el) return;
        const { px, py, z } = orthoProject(p.lat, p.lng, cLat, cLng, R, cx, cy);
        if (z > 0.05) {
          el.style.left    = `${px}px`;
          el.style.top     = `${py}px`;
          el.style.opacity = `${Math.min(1, (z - 0.05) / 0.18)}`;
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
      {/* Canvas renders the globe every frame — pure canvas, no network, no flash */}
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, display: "block" }} />

      {/* ── Place nodes ──────────────────────────────────────────────────────
          PLACES is the single source of truth. Each entry renders exactly
          one MiniSphere + one label. Both are in the same div — the opacity
          of the parent controls both together, so a label is NEVER visible
          without its sphere.                                             */}
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

"use client";

import { useEffect, useRef } from "react";
import MiniSphere from "@/components/MiniSphere";

/* ── Types ────────────────────────────────────────────────────────────────── */

type PlaceNode = {
  id: string; label: string;
  lat: number; lng: number;
  size: number; seed: number;
};

type GeoLabel = {
  id: string; label: string;
  lat: number; lng: number;
  /** normalised-zoom window: 0 = Menlo Park close, 1 = full globe */
  minZ: number; maxZ: number;
  size: number;
  type: "state" | "country" | "continent";
};

/* ── City nodes ───────────────────────────────────────────────────────────── *
 *  All nodes are always rendered when on the front hemisphere.              *
 *  No minT/maxT: size scales with camera zoom instead of gating visibility. */

const PLACES: PlaceNode[] = [
  { id:"mp",  label:"Menlo Park",    lat:37.453, lng:-122.182, size:22, seed:17 },
  { id:"sf",  label:"San Francisco", lat:37.774, lng:-122.419, size:26, seed:1  },
  { id:"la",  label:"Los Angeles",   lat:34.052, lng:-118.244, size:28, seed:3  },
  { id:"sea", label:"Seattle",       lat:47.606, lng:-122.332, size:22, seed:31 },
  { id:"den", label:"Denver",        lat:39.739, lng:-104.984, size:20, seed:35 },
  { id:"ny",  label:"New York",      lat:40.713, lng:-74.006,  size:30, seed:21 },
  { id:"chi", label:"Chicago",       lat:41.878, lng:-87.630,  size:26, seed:9  },
  { id:"hou", label:"Houston",       lat:29.760, lng:-95.370,  size:22, seed:11 },
  { id:"mia", label:"Miami",         lat:25.762, lng:-80.192,  size:20, seed:15 },
  { id:"bos", label:"Boston",        lat:42.361, lng:-71.057,  size:20, seed:19 },
];

/* ── Geographic text labels ───────────────────────────────────────────────── *
 *  Text-only labels (no sphere) that fade in/out at appropriate zoom levels. */

const GEO_LABELS: GeoLabel[] = [
  // States — appear at medium zoom
  { id:"gca",  label:"California",    lat: 37.0, lng:-119.5, minZ:0.18, maxZ:0.60, size:11, type:"state"     },
  { id:"gore", label:"Oregon",        lat: 44.0, lng:-120.5, minZ:0.24, maxZ:0.60, size: 9, type:"state"     },
  { id:"gwsh", label:"Washington",    lat: 47.5, lng:-120.5, minZ:0.24, maxZ:0.60, size: 9, type:"state"     },
  { id:"gnev", label:"Nevada",        lat: 39.5, lng:-117.0, minZ:0.28, maxZ:0.62, size: 9, type:"state"     },
  { id:"gari", label:"Arizona",       lat: 34.0, lng:-111.5, minZ:0.28, maxZ:0.62, size: 9, type:"state"     },
  { id:"gtex", label:"Texas",         lat: 31.0, lng: -99.0, minZ:0.32, maxZ:0.66, size:11, type:"state"     },
  { id:"gflo", label:"Florida",       lat: 27.5, lng: -82.5, minZ:0.34, maxZ:0.66, size: 9, type:"state"     },
  { id:"gnys", label:"New York",      lat: 43.0, lng: -75.5, minZ:0.34, maxZ:0.66, size: 9, type:"state"     },
  // Countries — appear at wider zoom
  { id:"cusa", label:"UNITED STATES", lat: 39.5, lng: -97.0, minZ:0.58, maxZ:0.88, size:14, type:"country"   },
  { id:"ccan", label:"CANADA",        lat: 56.0, lng: -96.0, minZ:0.58, maxZ:0.88, size:12, type:"country"   },
  { id:"cmex", label:"MEXICO",        lat: 23.5, lng:-102.5, minZ:0.60, maxZ:0.88, size:11, type:"country"   },
  { id:"cbra", label:"BRAZIL",        lat:-10.0, lng: -51.0, minZ:0.70, maxZ:0.96, size:12, type:"country"   },
  { id:"cgbr", label:"U.K.",          lat: 54.0, lng:  -3.0, minZ:0.70, maxZ:0.96, size: 9, type:"country"   },
  { id:"cfra", label:"FRANCE",        lat: 46.0, lng:   2.0, minZ:0.70, maxZ:0.96, size: 9, type:"country"   },
  { id:"cchn", label:"CHINA",         lat: 35.0, lng: 105.0, minZ:0.70, maxZ:0.96, size:12, type:"country"   },
  { id:"cind", label:"INDIA",         lat: 22.0, lng:  79.0, minZ:0.70, maxZ:0.96, size:11, type:"country"   },
  { id:"caus", label:"AUSTRALIA",     lat:-25.0, lng: 135.0, minZ:0.70, maxZ:0.96, size:11, type:"country"   },
  // Continents — appear at full globe zoom
  { id:"xnam", label:"NORTH AMERICA", lat: 46.0, lng:-100.0, minZ:0.80, maxZ:1.05, size:14, type:"continent" },
  { id:"xsam", label:"SOUTH AMERICA", lat:-15.0, lng: -60.0, minZ:0.80, maxZ:1.05, size:13, type:"continent" },
  { id:"xeur", label:"EUROPE",        lat: 50.0, lng:  15.0, minZ:0.80, maxZ:1.05, size:13, type:"continent" },
  { id:"xafr", label:"AFRICA",        lat:  0.0, lng:  22.0, minZ:0.80, maxZ:1.05, size:13, type:"continent" },
  { id:"xasi", label:"ASIA",          lat: 45.0, lng:  90.0, minZ:0.80, maxZ:1.05, size:14, type:"continent" },
];

/* ── Camera path: [t, zoomScale, cLat, cLng] ─────────────────────────────── *
 *  t=0: zoomed in on Menlo Park (zoom 5×)  →  t=1: full globe (zoom ~0.62) */

const CAM_PATH: readonly [number, number, number, number][] = [
  [0.00, 5.00, 37.45, -122.18],  // Menlo Park close-up
  [0.28, 2.20, 37.20, -121.00],  // Bay Area
  [0.55, 1.30, 38.50, -117.00],  // West Coast / California
  [0.80, 0.90, 39.00,  -97.00],  // Continental USA
  [1.00, 0.62, 28.00,  -55.00],  // North America + Atlantic
];

const CAM_MAX_ZOOM = CAM_PATH[0][1];                    // 5.00
const CAM_MIN_ZOOM = CAM_PATH[CAM_PATH.length - 1][1]; // 0.62

const BASE_R = 0.42;  // globe radius as fraction of min(w,h) at zoom 1×
const FADE_W = 0.06;  // normalised-zoom window for geo label fade

/* ── Continent outlines ───────────────────────────────────────────────────── */

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

/* ── Orthographic projection ──────────────────────────────────────────────── */

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

function clampToLimb({ px, py, z }: Proj, R: number, cx: number, cy: number): Proj {
  if (z >= 0) return { px, py, z };
  const dx = px - cx, dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return { px: cx + R, py: cy, z: 0 };
  return { px: cx + (dx / dist) * R, py: cy + (dy / dist) * R, z: 0 };
}

/* ── Globe renderer ───────────────────────────────────────────────────────── *
 *  Apple Maps dark-mode palette: black bg, near-black water, dark-gray land */

function drawGlobe(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  cLat: number, cLng: number,
  R: number,
) {
  const cx = w / 2, cy = h / 2;
  ctx.clearRect(0, 0, w, h);

  // Pure black background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  // Very subtle white atmosphere halo (no blue)
  const atmos = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.07);
  atmos.addColorStop(0,   "rgba(255,255,255,0.045)");
  atmos.addColorStop(0.6, "rgba(255,255,255,0.010)");
  atmos.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.07, 0, Math.PI * 2);
  ctx.fillStyle = atmos;
  ctx.fill();

  // Globe base — near-black water
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "#0d0d12";
  ctx.fill();
  ctx.clip();

  // Graticule — barely visible
  ctx.strokeStyle = "rgba(255,255,255,0.028)";
  ctx.lineWidth = 0.4;
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

  // Land fill — very dark gray (slightly lighter than water)
  ctx.fillStyle = "#1c1c22";
  for (const poly of LAND) {
    ctx.beginPath();
    poly.forEach(([lng, lat], i) => {
      const p = clampToLimb(orthoProject(lat, lng, cLat, cLng, R, cx, cy), R, cx, cy);
      i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py);
    });
    ctx.closePath();
    ctx.fill();
  }

  // Coastlines — subtle edges on front hemisphere only
  ctx.strokeStyle = "#30303a";
  ctx.lineWidth = 0.7;
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

  // Limb darkening — deep black rim makes disc read as sphere
  const limb = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  limb.addColorStop(0.00, "rgba(0,0,0,0)");
  limb.addColorStop(0.62, "rgba(0,0,0,0)");
  limb.addColorStop(0.85, "rgba(0,0,0,0.38)");
  limb.addColorStop(1.00, "rgba(0,0,0,0.94)");
  ctx.fillStyle = limb;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Specular highlight — very subtle white, upper-left
  const spec = ctx.createRadialGradient(
    cx - R * 0.30, cy - R * 0.28, 0,
    cx - R * 0.30, cy - R * 0.28, R * 0.65,
  );
  spec.addColorStop(0, "rgba(255,255,255,0.052)");
  spec.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = spec;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  ctx.restore();

  // Thin edge ring — barely visible white
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function MapVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef(0);
  const cityElsRef   = useRef<Map<string, HTMLDivElement>>(new Map());
  const geoElsRef    = useRef<Map<string, HTMLDivElement>>(new Map());

  // tRef: smoothly lerped current position (0 = Menlo Park, 1 = full globe)
  // targetTRef: set from scroll position / wheel interaction
  const tRef       = useRef(0);
  const targetTRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function sizeCanvas() {
      canvas.width  = container.offsetWidth  || 600;
      canvas.height = container.offsetHeight || 800;
    }
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(container);

    // ── Scroll driver ──────────────────────────────────────────────────────
    // Maps section scroll progress (0 = just entering view, 1 = scrolled through)
    // to targetT so camera smoothly pans Menlo Park → Globe as user scrolls.
    function updateScroll() {
      const section = container.closest("section") as HTMLElement | null;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      // traveled: pixels scrolled past section top entering viewport
      // range: section height + 60% of viewport (gives comfortable scroll feel)
      const traveled = vh - rect.top;
      const range    = section.offsetHeight + vh * 0.6;
      targetTRef.current = Math.max(0, Math.min(1, traveled / range));
    }
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });

    // ── Wheel on globe: interactive zoom nudge ─────────────────────────────
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      targetTRef.current = Math.max(0, Math.min(1,
        targetTRef.current + e.deltaY * 0.0008,
      ));
    }
    container.addEventListener("wheel", onWheel, { passive: false });

    // ── Camera interpolation helpers ───────────────────────────────────────
    const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
    const ease = (u: number) =>
      u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

    function getCamera(t: number) {
      let i = 0;
      while (i < CAM_PATH.length - 2 && CAM_PATH[i + 1][0] <= t) i++;
      const [t0, s0, la0, ln0] = CAM_PATH[i];
      const [t1, s1, la1, ln1] = CAM_PATH[i + 1];
      const e = ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
      return {
        zoom: lerp(s0, s1, e),
        cLat: lerp(la0, la1, e),
        cLng: lerp(ln0, ln1, e),
      };
    }

    // Normalised zoom: 0 = closest (zoom=5), 1 = most zoomed out (zoom=0.62)
    function normZoom(zoom: number) {
      return Math.max(0, Math.min(1,
        (CAM_MAX_ZOOM - zoom) / (CAM_MAX_ZOOM - CAM_MIN_ZOOM),
      ));
    }

    let last = 0;

    function frame(now: number) {
      const dt = last ? Math.min(now - last, 50) : 16;
      last = now;

      // Exponential lerp — frame-rate independent smooth approach
      const k = 1 - Math.pow(0.92, dt / 16);
      tRef.current += (targetTRef.current - tRef.current) * k;

      const { zoom, cLat, cLng } = getCamera(tRef.current);
      const w  = canvas.width;
      const h  = canvas.height;
      const R  = Math.min(w, h) * BASE_R * zoom;
      const cx = w / 2, cy = h / 2;

      drawGlobe(ctx, w, h, cLat, cLng, R);

      const nz = normZoom(zoom);

      // ── City nodes ────────────────────────────────────────────────────────
      // Always visible on front hemisphere; scale CSS transform with zoom
      // so spheres shrink gracefully instead of disappearing.
      cityElsRef.current.forEach((el, id) => {
        const p = PLACES.find(pl => pl.id === id);
        if (!p) return;
        const { px, py, z } = orthoProject(p.lat, p.lng, cLat, cLng, R, cx, cy);
        const zFade  = Math.min(1, Math.max(0, (z - 0.05) / 0.15));
        // Scale: full size when zoomed in (zoom≥3), smallest at full globe
        const sScale = Math.max(0.30, Math.min(1.5, zoom / 3.2));
        el.style.left      = `${px}px`;
        el.style.top       = `${py}px`;
        el.style.opacity   = `${zFade}`;
        el.style.transform = `translate(-50%, -50%) scale(${sScale})`;
      });

      // ── Geographic text labels ────────────────────────────────────────────
      // Fade in/out based on normalised-zoom window; hidden on back hemisphere.
      geoElsRef.current.forEach((el, id) => {
        const g = GEO_LABELS.find(gl => gl.id === id);
        if (!g) return;
        const { px, py, z } = orthoProject(g.lat, g.lng, cLat, cLng, R, cx, cy);
        if (z < 0.04) { el.style.opacity = "0"; return; }
        const zFade   = Math.min(1, Math.max(0, (z - 0.04) / 0.14));
        const tFade   = Math.min(
          (nz - g.minZ) / FADE_W,
          (g.maxZ - nz) / FADE_W,
          1,
        );
        const opacity = zFade * Math.max(0, tFade);
        el.style.left    = `${px}px`;
        el.style.top     = `${py}px`;
        el.style.opacity = `${opacity}`;
      });

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener("scroll", updateScroll);
      container.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative", width: "100%", height: "100%",
        overflow: "hidden", background: "#000000",
      }}
    >
      {/* Globe canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, display: "block" }}
      />

      {/* ── City nodes: MiniSphere + label ─────────────────────────────────── */}
      {PLACES.map(p => (
        <div
          key={p.id}
          ref={el => { if (el) cityElsRef.current.set(p.id, el); }}
          style={{
            position: "absolute", zIndex: 10,
            opacity: 0, pointerEvents: "none",
            transform: "translate(-50%, -50%)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          }}
        >
          <MiniSphere size={p.size} seed={p.seed} />
          <span style={{
            fontSize: Math.max(8, Math.round(p.size * 0.28)),
            color: "rgba(255,255,255,0.70)",
            whiteSpace: "nowrap",
            letterSpacing: "0.06em",
            lineHeight: 1,
            textShadow: "0 1px 6px rgba(0,0,0,0.98)",
          }}>
            {p.label}
          </span>
        </div>
      ))}

      {/* ── Geographic text labels ─────────────────────────────────────────── */}
      {GEO_LABELS.map(g => (
        <div
          key={g.id}
          ref={el => { if (el) geoElsRef.current.set(g.id, el); }}
          style={{
            position: "absolute", zIndex: 8,
            opacity: 0, pointerEvents: "none",
            transform: "translate(-50%, -50%)",
          }}
        >
          <span style={{
            display: "block",
            fontSize: g.size,
            fontWeight: g.type === "continent" ? 500 : 400,
            color: g.type === "continent"
              ? "rgba(255,255,255,0.42)"
              : g.type === "country"
              ? "rgba(255,255,255,0.52)"
              : "rgba(255,255,255,0.48)",
            whiteSpace: "nowrap",
            letterSpacing: g.type === "continent"
              ? "0.20em"
              : g.type === "country"
              ? "0.10em"
              : "0.04em",
            textAlign: "center",
            textShadow: "0 1px 8px rgba(0,0,0,0.98)",
          }}>
            {g.label}
          </span>
        </div>
      ))}
    </div>
  );
}

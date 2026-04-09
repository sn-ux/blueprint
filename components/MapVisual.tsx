"use client";

import { useEffect, useRef } from "react";
import MiniSphere from "@/components/MiniSphere";

/* ── Types ──────────────────────────────────────────────────────────────── */

type MapNode = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  seed: number;
  size: number;
  minT: number;
  maxT: number;
};

/* ── Place data ─────────────────────────────────────────────────────────── */

const NODES: MapNode[] = [
  // Hyper-local  (t 0.00 – 0.20)
  { id:"mp",  label:"Menlo Park",    lat: 37.453,  lng:-122.182, seed:17, size:30, minT:0.00, maxT:0.20 },
  { id:"pa",  label:"Palo Alto",     lat: 37.441,  lng:-122.143, seed:23, size:20, minT:0.05, maxT:0.20 },
  // Bay Area     (t 0.10 – 0.44)
  { id:"sf",  label:"San Francisco", lat: 37.774,  lng:-122.419, seed:1,  size:36, minT:0.10, maxT:0.44 },
  { id:"oak", label:"Oakland",       lat: 37.804,  lng:-122.271, seed:7,  size:22, minT:0.12, maxT:0.40 },
  { id:"sj",  label:"San Jose",      lat: 37.338,  lng:-121.886, seed:13, size:22, minT:0.12, maxT:0.40 },
  // West Coast   (t 0.28 – 0.62)
  { id:"la",  label:"Los Angeles",   lat: 34.052,  lng:-118.244, seed:3,  size:34, minT:0.28, maxT:0.62 },
  { id:"sea", label:"Seattle",       lat: 47.606,  lng:-122.332, seed:31, size:28, minT:0.28, maxT:0.62 },
  { id:"sac", label:"Sacramento",    lat: 38.576,  lng:-121.487, seed:25, size:20, minT:0.28, maxT:0.56 },
  // USA          (t 0.42 – 0.74)
  { id:"ny",  label:"New York",      lat: 40.713,  lng: -74.006, seed:21, size:38, minT:0.42, maxT:0.74 },
  { id:"chi", label:"Chicago",       lat: 41.878,  lng: -87.630, seed:9,  size:32, minT:0.42, maxT:0.74 },
  { id:"hou", label:"Houston",       lat: 29.760,  lng: -95.370, seed:11, size:26, minT:0.42, maxT:0.72 },
  { id:"mia", label:"Miami",         lat: 25.762,  lng: -80.192, seed:15, size:24, minT:0.42, maxT:0.72 },
  // International (t 0.58 – 0.92)
  { id:"lon", label:"London",        lat: 51.507,  lng:  -0.128, seed:2,  size:38, minT:0.58, maxT:0.92 },
  { id:"par", label:"Paris",         lat: 48.857,  lng:   2.352, seed:8,  size:28, minT:0.58, maxT:0.90 },
  { id:"mos", label:"Moscow",        lat: 55.751,  lng:  37.618, seed:26, size:28, minT:0.60, maxT:0.90 },
  { id:"tok", label:"Tokyo",         lat: 35.682,  lng: 139.691, seed:16, size:36, minT:0.60, maxT:0.90 },
  { id:"bej", label:"Beijing",       lat: 39.904,  lng: 116.407, seed:42, size:28, minT:0.62, maxT:0.88 },
  { id:"mum", label:"Mumbai",        lat: 19.076,  lng:  72.878, seed:4,  size:26, minT:0.60, maxT:0.88 },
  { id:"sao", label:"São Paulo",     lat:-23.549,  lng: -46.633, seed:28, size:26, minT:0.60, maxT:0.90 },
  { id:"syd", label:"Sydney",        lat:-33.869,  lng: 151.209, seed:22, size:24, minT:0.62, maxT:0.88 },
  { id:"lag", label:"Lagos",         lat:  6.524,  lng:   3.379, seed:40, size:22, minT:0.64, maxT:0.88 },
  { id:"dub", label:"Dubai",         lat: 25.204,  lng:  55.270, seed:38, size:22, minT:0.64, maxT:0.86 },
  // Continents   (t 0.80 – 1.00)
  { id:"naf", label:"North America", lat: 40.0,    lng:-100.0,   seed:6,  size:54, minT:0.80, maxT:1.00 },
  { id:"eur", label:"Europe",        lat: 50.0,    lng:  15.0,   seed:12, size:48, minT:0.80, maxT:1.00 },
  { id:"asi", label:"Asia",          lat: 40.0,    lng:  90.0,   seed:18, size:54, minT:0.80, maxT:1.00 },
  { id:"afr", label:"Africa",        lat:  5.0,    lng:  20.0,   seed:24, size:42, minT:0.82, maxT:1.00 },
  { id:"sam", label:"South America", lat:-15.0,    lng: -60.0,   seed:30, size:40, minT:0.82, maxT:1.00 },
  { id:"oce", label:"Oceania",       lat:-25.0,    lng: 135.0,   seed:36, size:36, minT:0.86, maxT:1.00 },
];

/* ── Camera keyframes: [t, zoom, lat, lng] ──────────────────────────────── */

const CAM: readonly [number, number, number, number][] = [
  [0.00, 13,  37.453, -122.182],  // Menlo Park streets
  [0.16, 10,  37.650, -122.280],  // Bay Area
  [0.30,  7,  37.500, -119.500],  // California
  [0.48,  4,  39.500,  -96.000],  // USA
  [0.66,  3,  40.000,  -20.000],  // Atlantic
  [0.82,  2,  20.000,    5.000],  // World
  [1.00,  2,  15.000,   20.000],  // Full globe
];

const SPEED      = 0.000036; // full cycle ≈ 28 s each way
const FADE_WIDTH = 0.055;

/* ── Web Mercator projection ─────────────────────────────────────────────
   Identical to the formula used by Leaflet / Google Maps.
   Returns pixel [x, y] on the canvas for a given geographic coordinate. */

function project(
  lat: number, lng: number,
  cLat: number, cLng: number,
  zoom: number, w: number, h: number,
): [number, number] {
  const scale = (256 * Math.pow(2, zoom)) / 360;
  const x = w / 2 + (lng - cLng) * scale;
  const latR  = (lat  * Math.PI) / 180;
  const cLatR = (cLat * Math.PI) / 180;
  const yM  = Math.log(Math.tan(Math.PI / 4 + latR  / 2));
  const ycM = Math.log(Math.tan(Math.PI / 4 + cLatR / 2));
  return [x, h / 2 - (yM - ycM) * scale];
}

/* ── Simplified continent outlines — [lng, lat] pairs ───────────────────
   Approximate polygons. Accurate enough to be recognizable at zoom 2–7.
   At high zoom (Bay Area / Menlo Park) the fill just paints the canvas
   a uniform dark land colour, which is correct for those inland areas.  */

const LAND: [number, number][][] = [
  // ── North America ───────────────────────────────────────────────────
  [
    [-165, 68],[-148, 70],[-130, 56],[-124, 49],[-124, 46],[-124, 42],
    [-117, 33],[-110, 23],[-90,  15],[-83,   9],[-77,   8],
    [-77,  10],[-83,  15],[-88,  21],[-91,  19],[-97,  26],
    [-81,  25],[-80,  26],[-80,  32],[-73,  41],[-66,  44],
    [-60,  47],[-53,  47],[-56,  53],[-60,  60],[-64,  64],
    [-80,  73],[-100, 74],[-125, 70],[-150, 62],
    [-162, 60],[-165, 64],[-165, 68],
  ],
  // ── South America ───────────────────────────────────────────────────
  [
    [-80,  10],[-75,  11],[-65,  11],[-52,   5],
    [-35,  -5],[-36, -10],[-40, -20],[-43, -23],
    [-50, -29],[-55, -35],[-58, -42],[-65, -55],
    [-68, -57],[-70, -55],[-76, -52],
    [-72, -45],[-70, -40],[-72, -35],
    [-70, -18],[-77, -14],[-80,  -8],[-80,   0],[-80,  10],
  ],
  // ── Europe ──────────────────────────────────────────────────────────
  [
    [-10, 36],[40,  35],[42,  37],[40,  42],
    [32,  47],[28,  57],[18,  71],[10,  63],[5,   58],
    [3,   51],[-5,  50],[-5,  48],[-2,  44],
    [0,   43],[2,   41],[-5,  37],[-9,  39],[-9,  44],[-5,  44],[-10, 36],
  ],
  // ── Africa ──────────────────────────────────────────────────────────
  [
    [-17, 35],[10,  37],[32,  30],[42,  37],[50,  30],[45,  22],
    [44,  12],[42,   5],[40, -10],[35, -20],
    [26, -34],[18, -35],[14, -20],[10,  -8],
    [8,    5],[-5,   5],[-16, 12],[-17, 20],[-15, 25],[-17, 35],
  ],
  // ── Asia ────────────────────────────────────────────────────────────
  [
    [30,  70],[50,  75],[80,  73],[100, 73],[120, 73],[140, 72],
    [160, 68],[170, 64],[165, 55],[145, 43],[140, 35],[130, 20],
    [115,  8],[100, 10],[95,  18],[88,  22],[82,  10],[77,   8],
    [80,  13],[78,  20],[72,  22],[63,  22],[58,  22],[50,  25],
    [42,  37],[40,  42],[32,  47],[30,  52],[30,  60],[30,  70],
  ],
  // ── Australia ───────────────────────────────────────────────────────
  [
    [114,-22],[117,-20],[128,-14],[136,-12],[140,-12],
    [148,-15],[152,-18],[155,-25],[152,-30],[152,-36],
    [150,-38],[148,-38],[143,-38],[140,-35],[136,-36],
    [128,-35],[122,-34],[116,-33],[114,-30],[112,-26],[114,-22],
  ],
];

/* ── drawMap ─────────────────────────────────────────────────────────────
   Renders one frame of the map onto the canvas.
   Pure synchronous canvas ops — no network, no tiles, no flash.        */

function drawMap(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  cLat: number, cLng: number, zoom: number,
) {
  // Ocean — always dark, the very first thing painted every frame
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, w, h);

  // Graticule — only visible at world/continental zoom (zoom < 5)
  const gridAlpha = Math.max(0, Math.min(1, (5 - zoom) / 3)) * 0.07;
  if (gridAlpha > 0.004) {
    ctx.strokeStyle = `rgba(99,130,180,${gridAlpha.toFixed(3)})`;
    ctx.lineWidth = 0.5;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      for (let ln = -180; ln <= 180; ln += 4) {
        const [x, y] = project(lat, ln, cLat, cLng, zoom, w, h);
        ln === -180 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let ln = -180; ln <= 180; ln += 30) {
      ctx.beginPath();
      for (let lat2 = -80; lat2 <= 80; lat2 += 4) {
        const [x, y] = project(lat2, ln, cLat, cLng, zoom, w, h);
        lat2 === -80 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // Land polygons — filled then stroked
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 0) { ctx.fillStyle = "#1a2535"; }
    else            { ctx.strokeStyle = "#243050"; ctx.lineWidth = 0.8; }
    for (const poly of LAND) {
      ctx.beginPath();
      poly.forEach(([lng, lat], i) => {
        const [x, y] = project(lat, lng, cLat, cLng, zoom, w, h);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      pass === 0 ? ctx.fill() : ctx.stroke();
    }
  }
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
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const ease = (t: number) =>
      t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    function getCamera(t: number) {
      let i = 0;
      while (i < CAM.length - 2 && CAM[i + 1][0] <= t) i++;
      const [t0, z0, la0, ln0] = CAM[i];
      const [t1, z1, la1, ln1] = CAM[i + 1];
      const e = ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
      return { zoom: lerp(z0, z1, e), lat: lerp(la0, la1, e), lng: lerp(ln0, ln1, e) };
    }

    function nodeOpacity(n: MapNode, t: number): number {
      if (t < n.minT || t > n.maxT) return 0;
      return Math.min((t - n.minT) / FADE_WIDTH, (n.maxT - t) / FADE_WIDTH, 1);
    }

    let last = 0;

    function frame(now: number) {
      const dt = last ? Math.min(now - last, 50) : 16;
      last = now;

      const a = animRef.current;
      a.t += a.dir * SPEED * dt;
      if (a.t >= 1) { a.t = 1; a.dir = -1; }
      if (a.t <= 0) { a.t = 0; a.dir =  1; }

      const { zoom, lat, lng } = getCamera(a.t);
      const w = canvas.width;
      const h = canvas.height;

      // Draw map to canvas — no network, no tile loading, no flash
      drawMap(ctx, w, h, lat, lng, zoom);

      // Position nodes using the same projection formula
      NODES.forEach(n => {
        const el = elsRef.current.get(n.id);
        if (!el) return;
        const [x, y] = project(n.lat, n.lng, lat, lng, zoom, w, h);
        el.style.left    = `${x}px`;
        el.style.top     = `${y}px`;
        el.style.opacity = `${nodeOpacity(n, a.t)}`;
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
        overflow: "hidden", background: "#0d1117",
      }}
    >
      {/* Canvas renders the full map every frame — pure canvas, zero network */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, display: "block" }}
      />

      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,8,0.55) 100%)",
      }} />

      {/* Eyebrow label */}
      <p style={{
        position: "absolute", top: 32, left: 28, zIndex: 20, margin: 0,
        fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.18)", pointerEvents: "none",
      }}>
        The Universal Intellect
      </p>

      {/* ── Sphere + label nodes ──────────────────────────────────────────
          NODES is the single source of truth for every visible label.
          Each entry renders exactly one MiniSphere above one label span.
          Opacity is controlled by the animation loop — when a node is
          visible (opacity > 0), both its sphere and label are visible.
          There is no way for a label to appear without its sphere.     */}
      {NODES.map(n => (
        <div
          key={n.id}
          ref={el => { if (el) elsRef.current.set(n.id, el); }}
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
          <MiniSphere size={n.size} seed={n.seed} />
          <span style={{
            fontSize: Math.max(8, Math.round(n.size * 0.27)),
            color: "rgba(255,255,255,0.55)",
            whiteSpace: "nowrap",
            letterSpacing: "0.05em",
            lineHeight: 1,
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          }}>
            {n.label}
          </span>
        </div>
      ))}
    </div>
  );
}

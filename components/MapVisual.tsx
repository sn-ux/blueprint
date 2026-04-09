"use client";

import { useEffect, useRef } from "react";
import MiniSphere from "@/components/MiniSphere";

// ── Place data ────────────────────────────────────────────────────────────────
//
// World-space coordinates: 1000 × 620 canvas
// Approximate Mercator-ish layout — believable, not pixel-perfect
//
// Each node has a [minT, maxT] visibility window.
// t runs 0 → 1 (zoom out from Menlo Park to globe) then reverses.
//
// Node hierarchy:
//   t 0.00–0.20  Hyper-local  (Menlo Park)
//   t 0.10–0.42  Bay Area     (SF, Oakland, San Jose, Palo Alto)
//   t 0.28–0.60  West Coast   (LA, Seattle, Sacramento)
//   t 0.42–0.74  USA          (NY, Chicago, Houston, Miami)
//   t 0.58–0.92  World        (London, Tokyo, Mumbai, São Paulo …)
//   t 0.80–1.00  Continents   (North America, Europe, Asia …)

type MapNode = {
  id: string;
  label: string;
  x: number;       // world-space X (0–1000)
  y: number;       // world-space Y (0–620)
  seed: number;    // MiniSphere seed for unique colors
  size: number;    // MiniSphere pixel size
  minT: number;    // fade-in starts
  maxT: number;    // fade-out ends
};

const NODES: MapNode[] = [
  // ── Hyper-local ──────────────────────────────────────────────────────────
  { id:"mp",  label:"Menlo Park",     x:200, y:300, seed:17, size:30, minT:0.00, maxT:0.20 },
  { id:"pa",  label:"Palo Alto",      x:203, y:313, seed:23, size:20, minT:0.05, maxT:0.20 },

  // ── Bay Area ─────────────────────────────────────────────────────────────
  { id:"sf",  label:"San Francisco",  x:182, y:276, seed:1,  size:36, minT:0.10, maxT:0.44 },
  { id:"oak", label:"Oakland",        x:189, y:282, seed:7,  size:22, minT:0.12, maxT:0.40 },
  { id:"sj",  label:"San Jose",       x:206, y:322, seed:13, size:22, minT:0.12, maxT:0.40 },

  // ── California / West Coast ───────────────────────────────────────────────
  { id:"la",  label:"Los Angeles",    x:210, y:370, seed:3,  size:34, minT:0.28, maxT:0.62 },
  { id:"sea", label:"Seattle",        x:185, y:216, seed:31, size:28, minT:0.28, maxT:0.62 },
  { id:"sac", label:"Sacramento",     x:194, y:264, seed:25, size:20, minT:0.28, maxT:0.56 },

  // ── USA ───────────────────────────────────────────────────────────────────
  { id:"ny",  label:"New York",       x:408, y:250, seed:21, size:38, minT:0.42, maxT:0.74 },
  { id:"chi", label:"Chicago",        x:350, y:266, seed:9,  size:32, minT:0.42, maxT:0.74 },
  { id:"hou", label:"Houston",        x:326, y:386, seed:11, size:26, minT:0.42, maxT:0.72 },
  { id:"mia", label:"Miami",          x:388, y:402, seed:15, size:24, minT:0.42, maxT:0.72 },

  // ── International ─────────────────────────────────────────────────────────
  { id:"lon", label:"London",         x:494, y:204, seed:2,  size:38, minT:0.58, maxT:0.92 },
  { id:"par", label:"Paris",          x:504, y:220, seed:8,  size:28, minT:0.58, maxT:0.90 },
  { id:"mos", label:"Moscow",         x:572, y:182, seed:26, size:28, minT:0.60, maxT:0.90 },
  { id:"tok", label:"Tokyo",          x:782, y:236, seed:16, size:36, minT:0.60, maxT:0.90 },
  { id:"bej", label:"Beijing",        x:748, y:218, seed:42, size:28, minT:0.62, maxT:0.88 },
  { id:"mum", label:"Mumbai",         x:644, y:294, seed:4,  size:26, minT:0.60, maxT:0.88 },
  { id:"sao", label:"São Paulo",      x:378, y:420, seed:28, size:26, minT:0.60, maxT:0.90 },
  { id:"syd", label:"Sydney",         x:792, y:414, seed:22, size:24, minT:0.62, maxT:0.88 },
  { id:"lag", label:"Lagos",          x:508, y:334, seed:40, size:22, minT:0.64, maxT:0.88 },
  { id:"dub", label:"Dubai",          x:596, y:278, seed:38, size:22, minT:0.64, maxT:0.86 },

  // ── Continents ────────────────────────────────────────────────────────────
  { id:"naf", label:"North America",  x:268, y:283, seed:6,  size:54, minT:0.80, maxT:1.00 },
  { id:"eur", label:"Europe",         x:518, y:210, seed:12, size:48, minT:0.80, maxT:1.00 },
  { id:"asi", label:"Asia",           x:700, y:253, seed:18, size:54, minT:0.80, maxT:1.00 },
  { id:"afr", label:"Africa",         x:528, y:348, seed:24, size:42, minT:0.82, maxT:1.00 },
  { id:"sam", label:"South America",  x:358, y:404, seed:30, size:40, minT:0.82, maxT:1.00 },
  { id:"oce", label:"Oceania",        x:792, y:416, seed:36, size:36, minT:0.86, maxT:1.00 },
];

// ── Camera keyframes: [t, zoom, cx, cy] ──────────────────────────────────────
//
// At each t the "camera" is at world-space (cx, cy) with the given zoom.
// Screen position of a node = node.x * zoom + tx, where tx = cw/2 − cx*zoom.

const CAM: readonly [number, number, number, number][] = [
  [0.00, 22.0, 200, 300],   // tight on Menlo Park
  [0.16,  9.0, 193, 292],   // Bay Area revealed
  [0.30,  4.0, 202, 308],   // California / West Coast
  [0.48,  1.8, 294, 292],   // USA
  [0.66,  0.9, 456, 272],   // Atlantic / USA + Europe
  [0.82,  0.6, 500, 292],   // Near-global
  [1.00,  0.52,500, 298],   // Full world / continents
];

// ── Animation constants ───────────────────────────────────────────────────────

const SPEED      = 0.000036; // t-units per ms  → full cycle ~28 s each way
const FADE_WIDTH = 0.055;    // fraction of t over which nodes fade in/out
const GRID_BASE  = 60;       // world-space grid cell size at zoom = 1

// ── MapVisual component ───────────────────────────────────────────────────────

export default function MapVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef        = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);
  const animRef      = useRef({ t: 0, dir: 1 });
  const elsRef       = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const containerRaw = containerRef.current;
    const bgRaw        = bgRef.current;
    if (!containerRaw || !bgRaw) return;
    const container: HTMLDivElement = containerRaw;
    const bg: HTMLDivElement        = bgRaw;

    // ── Helpers ──────────────────────────────────────────────────────────────

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const ease = (t: number) => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;

    function getCamera(t: number) {
      let i = 0;
      while (i < CAM.length - 2 && CAM[i + 1][0] <= t) i++;
      const [t0, z0, x0, y0] = CAM[i];
      const [t1, z1, x1, y1] = CAM[i + 1];
      const e = ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
      return {
        zoom: lerp(z0, z1, e),
        cx:   lerp(x0, x1, e),
        cy:   lerp(y0, y1, e),
      };
    }

    function nodeOpacity(n: MapNode, t: number): number {
      if (t < n.minT || t > n.maxT) return 0;
      return Math.min((t - n.minT) / FADE_WIDTH, (n.maxT - t) / FADE_WIDTH, 1);
    }

    // ── Animation loop ───────────────────────────────────────────────────────

    let last = 0;

    function frame(now: number) {
      const dt = last ? Math.min(now - last, 50) : 16;
      last = now;

      const a = animRef.current;
      a.t += a.dir * SPEED * dt;
      if (a.t >= 1) { a.t = 1; a.dir = -1; }
      if (a.t <= 0) { a.t = 0; a.dir =  1; }

      const { zoom, cx, cy } = getCamera(a.t);
      const cw = container.clientWidth  || 460;
      const ch = container.clientHeight || 700;
      const tx = cw / 2 - cx * zoom;
      const ty = ch / 2 - cy * zoom;

      // Grid scrolls + scales with the camera
      const gs = GRID_BASE * zoom;
      bg.style.backgroundSize     = `${gs}px ${gs}px`;
      bg.style.backgroundPosition = `${((tx % gs) + gs) % gs}px ${((ty % gs) + gs) % gs}px`;

      // Position and fade each node
      NODES.forEach(n => {
        const el = elsRef.current.get(n.id);
        if (!el) return;
        el.style.left    = `${n.x * zoom + tx}px`;
        el.style.top     = `${n.y * zoom + ty}px`;
        el.style.opacity = `${nodeOpacity(n, a.t)}`;
      });

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative", width: "100%", height: "100%",
        overflow: "hidden", background: "#000",
      }}
    >
      {/* Animated grid — scrolls and scales with the camera */}
      <div
        ref={bgRef}
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        }}
      />

      {/* Eyebrow label */}
      <p style={{
        position: "absolute", top: 32, left: 28, zIndex: 10,
        fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.18)", pointerEvents: "none", margin: 0,
      }}>
        The Universal Intellect
      </p>

      {/* Place nodes — positioned in JS each frame */}
      {NODES.map(n => (
        <div
          key={n.id}
          ref={el => { if (el) elsRef.current.set(n.id, el); }}
          style={{
            position: "absolute",
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
            color: "rgba(255,255,255,0.42)",
            whiteSpace: "nowrap",
            letterSpacing: "0.05em",
            lineHeight: 1,
          }}>
            {n.label}
          </span>
        </div>
      ))}
    </div>
  );
}

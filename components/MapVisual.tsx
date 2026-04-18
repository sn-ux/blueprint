"use client";

import { useEffect, useRef } from "react";
import MiniSphere from "@/components/MiniSphere";
import { feature } from "topojson-client";

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
 *  All nodes scale with zoom rather than appearing/disappearing.             */

const PLACES: PlaceNode[] = [
  { id:"mp",  label:"Menlo Park",    lat: 37.453, lng:-122.182, size:20, seed:17 },
  { id:"pa",  label:"Palo Alto",     lat: 37.441, lng:-122.143, size:18, seed:23 },
  { id:"sj",  label:"San Jose",      lat: 37.338, lng:-121.886, size:22, seed:27 },
  { id:"sf",  label:"San Francisco", lat: 37.774, lng:-122.419, size:26, seed:1  },
  { id:"la",  label:"Los Angeles",   lat: 34.052, lng:-118.244, size:28, seed:3  },
  { id:"sea", label:"Seattle",       lat: 47.606, lng:-122.332, size:22, seed:31 },
  { id:"den", label:"Denver",        lat: 39.739, lng:-104.984, size:20, seed:35 },
  { id:"ny",  label:"New York",      lat: 40.713, lng:  -74.006, size:30, seed:21 },
  { id:"chi", label:"Chicago",       lat: 41.878, lng:  -87.630, size:26, seed:9  },
  { id:"hou", label:"Houston",       lat: 29.760, lng:  -95.370, size:22, seed:11 },
  { id:"mia", label:"Miami",         lat: 25.762, lng:  -80.192, size:20, seed:15 },
  { id:"bos", label:"Boston",        lat: 42.361, lng:  -71.057, size:20, seed:19 },
];

/* ── Geographic text labels ───────────────────────────────────────────────── *
 *  Each label has a normalised-zoom window [minZ, maxZ] that controls when  *
 *  it fades in. Labels transition cleanly: city nodes → state → country →   *
 *  continent as the camera pulls back.                                       */

const GEO_LABELS: GeoLabel[] = [
  // States — visible at intermediate zoom
  { id:"gca",  label:"California",    lat: 37.0, lng:-119.5, minZ:0.18, maxZ:0.60, size:11, type:"state"     },
  { id:"gore", label:"Oregon",        lat: 44.0, lng:-120.5, minZ:0.24, maxZ:0.60, size: 9, type:"state"     },
  { id:"gwsh", label:"Washington",    lat: 47.5, lng:-120.5, minZ:0.24, maxZ:0.60, size: 9, type:"state"     },
  { id:"gnev", label:"Nevada",        lat: 39.5, lng:-117.0, minZ:0.28, maxZ:0.62, size: 9, type:"state"     },
  { id:"gari", label:"Arizona",       lat: 34.0, lng:-111.5, minZ:0.28, maxZ:0.62, size: 9, type:"state"     },
  { id:"gtex", label:"Texas",         lat: 31.0, lng: -99.0, minZ:0.32, maxZ:0.66, size:11, type:"state"     },
  { id:"gflo", label:"Florida",       lat: 27.5, lng: -82.5, minZ:0.34, maxZ:0.66, size: 9, type:"state"     },
  { id:"gnys", label:"New York",      lat: 43.0, lng: -75.5, minZ:0.34, maxZ:0.66, size: 9, type:"state"     },
  // Countries — visible at wider zoom
  { id:"cusa", label:"UNITED STATES", lat: 39.5, lng: -97.0, minZ:0.58, maxZ:0.88, size:14, type:"country"   },
  { id:"ccan", label:"CANADA",        lat: 56.0, lng: -96.0, minZ:0.58, maxZ:0.88, size:12, type:"country"   },
  { id:"cmex", label:"MEXICO",        lat: 23.5, lng:-102.5, minZ:0.60, maxZ:0.88, size:11, type:"country"   },
  { id:"cbra", label:"BRAZIL",        lat:-10.0, lng: -51.0, minZ:0.70, maxZ:0.96, size:12, type:"country"   },
  { id:"cgbr", label:"U.K.",          lat: 54.0, lng:   -3.0, minZ:0.70, maxZ:0.96, size: 9, type:"country"   },
  { id:"cfra", label:"FRANCE",        lat: 46.0, lng:    2.0, minZ:0.70, maxZ:0.96, size: 9, type:"country"   },
  { id:"cchn", label:"CHINA",         lat: 35.0, lng:  105.0, minZ:0.70, maxZ:0.96, size:12, type:"country"   },
  { id:"cind", label:"INDIA",         lat: 22.0, lng:   79.0, minZ:0.70, maxZ:0.96, size:11, type:"country"   },
  { id:"caus", label:"AUSTRALIA",     lat:-25.0, lng:  135.0, minZ:0.70, maxZ:0.96, size:11, type:"country"   },
  // Continents — visible only at full globe zoom
  { id:"xnam", label:"NORTH AMERICA", lat: 46.0, lng:-100.0, minZ:0.80, maxZ:1.05, size:14, type:"continent" },
  { id:"xsam", label:"SOUTH AMERICA", lat:-15.0, lng: -60.0, minZ:0.80, maxZ:1.05, size:13, type:"continent" },
  { id:"xeur", label:"EUROPE",        lat: 50.0, lng:   15.0, minZ:0.80, maxZ:1.05, size:13, type:"continent" },
  { id:"xafr", label:"AFRICA",        lat:  0.0, lng:   22.0, minZ:0.80, maxZ:1.05, size:13, type:"continent" },
  { id:"xasi", label:"ASIA",          lat: 45.0, lng:   90.0, minZ:0.80, maxZ:1.05, size:14, type:"continent" },
];

/* ── Camera path: [t, zoomScale, cLat, cLng] ─────────────────────────────── *
 *  Defines zoom levels at specific t-values (0=Menlo Park, 1=full globe).   *
 *  getCamera() linearly interpolates between keyframes; the animation loop  *
 *  applies easing on top so there is no double-easing.                      */

const CAM_PATH: readonly [number, number, number, number][] = [
  [0.00, 5.00,  37.45, -122.18],  // Menlo Park close-up
  [0.28, 2.20,  37.20, -121.00],  // Bay Area
  [0.55, 1.30,  38.50, -117.00],  // West Coast / California
  [0.80, 0.90,  39.00,  -97.00],  // Continental USA
  [1.00, 0.62,  28.00,  -55.00],  // North America + Atlantic
];

const CAM_MAX_ZOOM = CAM_PATH[0][1];                    // 5.00
const CAM_MIN_ZOOM = CAM_PATH[CAM_PATH.length - 1][1]; // 0.62

const BASE_R = 0.42;
const FADE_W = 0.06;

/* ── Animation loop constants ─────────────────────────────────────────────── *
 *  Total: 20 s.  Three phases:                                               *
 *    0.00–0.30 (6 s): ease-in-out zoom out, Menlo Park → full globe         *
 *    0.30–0.70 (8 s): linear full-globe rotation, 360° westward             *
 *    0.70–1.00 (6 s): ease-in-out zoom in, full globe → Menlo Park          */

const LOOP_MS        = 20_000;
const P_ZOOM_OUT_END = 0.30;
const P_ROTATE_END   = 0.70;

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

/* ── Globe renderer ───────────────────────────────────────────────────────── */

function drawGlobe(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  cLat: number, cLng: number,
  R: number,
  landRings: [number, number][][],
) {
  const cx = w / 2, cy = h / 2;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  // Outer atmospheric halo — very subtle blue-white limb glow
  const atmoOuter = ctx.createRadialGradient(cx, cy, R * 0.93, cx, cy, R * 1.14);
  atmoOuter.addColorStop(0,    "rgba(160,195,255,0.07)");
  atmoOuter.addColorStop(0.45, "rgba(120,165,255,0.022)");
  atmoOuter.addColorStop(1,    "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.14, 0, Math.PI * 2);
  ctx.fillStyle = atmoOuter;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  // Ocean base — deep blue-black with radial depth gradient
  const ocean = ctx.createRadialGradient(cx - R * 0.18, cy - R * 0.22, 0, cx, cy, R * 1.05);
  ocean.addColorStop(0.00, "#0d1119");
  ocean.addColorStop(0.35, "#090d14");
  ocean.addColorStop(0.70, "#05070f");
  ocean.addColorStop(1.00, "#020308");
  ctx.fillStyle = ocean;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Graticule — barely perceptible grid
  ctx.strokeStyle = "rgba(255,255,255,0.018)";
  ctx.lineWidth   = 0.35;
  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath();
    let fresh = true;
    for (let ln = -180; ln <= 180; ln += 2) {
      const { px, py, z } = orthoProject(lat, ln, cLat, cLng, R, cx, cy);
      if (z >= 0) { fresh ? ctx.moveTo(px, py) : ctx.lineTo(px, py); fresh = false; }
      else fresh = true;
    }
    ctx.stroke();
  }
  for (let ln = -180; ln <= 180; ln += 30) {
    ctx.beginPath();
    let fresh = true;
    for (let lt = -80; lt <= 80; lt += 2) {
      const { px, py, z } = orthoProject(lt, ln, cLat, cLng, R, cx, cy);
      if (z >= 0) { fresh ? ctx.moveTo(px, py) : ctx.lineTo(px, py); fresh = false; }
      else fresh = true;
    }
    ctx.stroke();
  }

  // Land — directional gradient (lit upper-left, shadowed lower-right)
  const landFill = ctx.createLinearGradient(
    cx - R * 0.55, cy - R * 0.55,
    cx + R * 0.65, cy + R * 0.65,
  );
  landFill.addColorStop(0.00, "#252530");
  landFill.addColorStop(0.40, "#1c1c26");
  landFill.addColorStop(1.00, "#0d0d16");

  ctx.fillStyle   = landFill;
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth   = 0.5;

  for (const ring of landRings) {
    if (ring.length < 3) continue;
    let hasFront = false;
    const pts: Array<{ px: number; py: number; z: number }> = [];
    for (const coord of ring) {
      const lng = coord[0] as number, lat = coord[1] as number;
      const raw = orthoProject(lat, lng, cLat, cLng, R, cx, cy);
      if (raw.z > -0.1) hasFront = true;
      const c = clampToLimb(raw, R, cx, cy);
      pts.push({ px: c.px, py: c.py, z: raw.z });
    }
    if (!hasFront) continue;

    // Fill (clamped, back-hemisphere sections hug the limb)
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      i === 0 ? ctx.moveTo(pts[i].px, pts[i].py) : ctx.lineTo(pts[i].px, pts[i].py);
    }
    ctx.closePath();
    ctx.fill();

    // Coastlines (front hemisphere only)
    ctx.beginPath();
    let pen = false;
    for (const { px, py, z } of pts) {
      if (z >= 0) { pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py); pen = true; }
      else pen = false;
    }
    ctx.stroke();
  }

  // Inner atmospheric edge — thin blue-white haze at globe rim
  const innerAtmo = ctx.createRadialGradient(cx, cy, R * 0.80, cx, cy, R);
  innerAtmo.addColorStop(0.00, "rgba(0,0,0,0)");
  innerAtmo.addColorStop(0.72, "rgba(130,168,255,0.016)");
  innerAtmo.addColorStop(1.00, "rgba(160,198,255,0.052)");
  ctx.fillStyle = innerAtmo;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Limb darkening — deep black at globe edge
  const limb = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  limb.addColorStop(0.00, "rgba(0,0,0,0)");
  limb.addColorStop(0.58, "rgba(0,0,0,0)");
  limb.addColorStop(0.76, "rgba(0,0,0,0.14)");
  limb.addColorStop(0.88, "rgba(0,0,0,0.52)");
  limb.addColorStop(1.00, "rgba(0,0,0,0.94)");
  ctx.fillStyle = limb;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Specular highlight — upper-left
  const spec = ctx.createRadialGradient(
    cx - R * 0.30, cy - R * 0.28, 0,
    cx - R * 0.30, cy - R * 0.28, R * 0.60,
  );
  spec.addColorStop(0,    "rgba(255,255,255,0.08)");
  spec.addColorStop(0.35, "rgba(255,255,255,0.022)");
  spec.addColorStop(1,    "rgba(0,0,0,0)");
  ctx.fillStyle = spec;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  ctx.restore();

  // Thin edge ring
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth   = 0.8;
  ctx.stroke();
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function MapVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef(0);
  const cityElsRef   = useRef<Map<string, HTMLDivElement>>(new Map());
  const geoElsRef    = useRef<Map<string, HTMLDivElement>>(new Map());

  // Animation loop phase: 0→1, wraps every LOOP_MS milliseconds
  const loopRef = useRef(0);

  // Decoded Natural Earth 110m land rings — populated async from CDN
  const landRingsRef = useRef<[number, number][][]>([]);

  // ── Fetch Natural Earth 110m land topology (world-atlas, public domain) ────
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json")
      .then(r => r.json())
      .then((topo: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const geo = feature(topo as any, (topo.objects as any).land) as any;
        const rings: [number, number][][] = [];

        function collectGeom(geom: Record<string, unknown> | null) {
          if (!geom) return;
          if (geom.type === "Polygon") {
            for (const ring of geom.coordinates as [number, number][][]) rings.push(ring);
          } else if (geom.type === "MultiPolygon") {
            for (const poly of geom.coordinates as [number, number][][][]) {
              for (const ring of poly) rings.push(ring);
            }
          }
        }

        if (geo.type === "Feature") {
          collectGeom(geo.geometry as Record<string, unknown>);
        } else if (geo.type === "FeatureCollection") {
          for (const f of geo.features as Array<{ geometry: Record<string, unknown> }>) {
            collectGeom(f.geometry);
          }
        }

        landRingsRef.current = rings;
      })
      .catch(() => {/* silent fail — renders water-only globe */});
  }, []);

  // ── Main render loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function sizeCanvas() {
      if (!canvas || !container) return;
      canvas.width  = container.offsetWidth  || 600;
      canvas.height = container.offsetHeight || 800;
    }
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(container);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

    // Smooth ease-in-out (cubic) — applied to zoom-out and zoom-in phases
    const easeIO = (u: number) =>
      u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

    // Linear interpolation between CAM_PATH keyframes.
    // No inner easing here — easing is applied by the caller.
    function getCamera(t: number) {
      let i = 0;
      while (i < CAM_PATH.length - 2 && CAM_PATH[i + 1][0] <= t) i++;
      const [t0, s0, la0, ln0] = CAM_PATH[i];
      const [t1, s1, la1, ln1] = CAM_PATH[i + 1];
      const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
      return {
        zoom: lerp(s0,  s1,  u),
        cLat: lerp(la0, la1, u),
        cLng: lerp(ln0, ln1, u),
      };
    }

    // Returns camera params for the given loop phase (0→1).
    //
    //  Phase A  0.00–P_ZOOM_OUT_END : ease-in-out zoom out (t: 0→1)
    //  Phase B  P_ZOOM_OUT_END–P_ROTATE_END : full-globe linear rotation
    //  Phase C  P_ROTATE_END–1.00 : ease-in-out zoom in (t: 1→0)
    //
    // At all phase boundaries the camera position is continuous:
    //   A→B: both give getCamera(1.0)
    //   B→C: rotation completes 360° so cLng mod 360 = starting cLng
    //   C→A: both give getCamera(0), so the loop wraps seamlessly
    function getLoopCamera(p: number) {
      if (p < P_ZOOM_OUT_END) {
        // Phase A — zoom out
        const u = p / P_ZOOM_OUT_END;          // 0→1 linear
        return getCamera(easeIO(u));            // 0→1 eased
      }

      if (p < P_ROTATE_END) {
        // Phase B — full-globe rotation (linear, constant angular speed)
        const u    = (p - P_ZOOM_OUT_END) / (P_ROTATE_END - P_ZOOM_OUT_END); // 0→1
        const base = getCamera(1.0);
        return { ...base, cLng: base.cLng + u * 360 };
      }

      // Phase C — zoom in (reverse of zoom out)
      const u = (p - P_ROTATE_END) / (1 - P_ROTATE_END); // 0→1
      return getCamera(1 - easeIO(u));                    // 1→0 eased
    }

    // Normalised zoom: 0 = closest (zoom MAX), 1 = most zoomed out (zoom MIN)
    // Used to gate geographic label visibility.
    function normZoom(zoom: number) {
      return Math.max(0, Math.min(1,
        (CAM_MAX_ZOOM - zoom) / (CAM_MAX_ZOOM - CAM_MIN_ZOOM),
      ));
    }

    let last = 0;

    function frame(now: number) {
      if (!canvas || !ctx) return;

      const dt = last ? Math.min(now - last, 50) : 16;
      last = now;

      // Advance the loop clock; wrap at 1.0
      loopRef.current = (loopRef.current + dt / LOOP_MS) % 1;

      const { zoom, cLat, cLng } = getLoopCamera(loopRef.current);
      const w  = canvas.width;
      const h  = canvas.height;
      const R  = Math.min(w, h) * BASE_R * zoom;
      const cx = w / 2, cy = h / 2;

      drawGlobe(ctx, w, h, cLat, cLng, R, landRingsRef.current);

      const nz = normZoom(zoom);

      // ── City nodes — always rendered, scale with zoom ──────────────────────
      cityElsRef.current.forEach((el, id) => {
        const p = PLACES.find(pl => pl.id === id);
        if (!p) return;
        const { px, py, z } = orthoProject(p.lat, p.lng, cLat, cLng, R, cx, cy);
        const zFade  = Math.min(1, Math.max(0, (z - 0.05) / 0.15));
        // Scale: full-size when zoomed in close (zoom≥3.2), tiny at globe view
        const sScale = Math.max(0.25, Math.min(1.5, zoom / 3.2));
        el.style.left      = `${px}px`;
        el.style.top       = `${py}px`;
        el.style.opacity   = `${zFade}`;
        el.style.transform = `translate(-50%, -50%) scale(${sScale})`;
      });

      // ── Geographic text labels — fade per normalised-zoom window ──────────
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

"use client";

import { useEffect, useRef } from "react";
import MiniSphere from "@/components/MiniSphere";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Place data — real coordinates ─────────────────────────────────────────────

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

// ── Camera keyframes: [t, leafletZoom, lat, lng] ──────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapVisual() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const rafRef    = useRef(0);
  const animRef   = useRef({ t: 0, dir: 1 });
  const elsRef    = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const mapDiv = mapDivRef.current;
    if (!mapDiv) return;

    let cancelled = false;

    // Dynamic import keeps Leaflet out of the SSR bundle
    import("leaflet").then(({ default: L }) => {
      if (cancelled) return;

      // ── Build map ──────────────────────────────────────────────────────────
      const map = L.map(mapDiv, {
        zoomControl:        false,
        attributionControl: false,
        dragging:           false,
        touchZoom:          false,
        doubleClickZoom:    false,
        scrollWheelZoom:    false,
        boxZoom:            false,
        keyboard:           false,
        zoomSnap:           0,
        zoomDelta:          0,
        fadeAnimation:      false,  // tiles appear immediately, no opacity fade
        zoomAnimation:      false,  // no zoom transition animation
      });

      // CartoDB Dark Matter (no-labels variant) — tiles only, zero basemap labels.
      // Using dark_nolabels instead of dark_all so the only visible labels are
      // our custom English NODES labels, each paired with a MiniSphere.
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 19 }
      ).addTo(map);

      map.setView([37.453, -122.182], 13);
      // Tell Leaflet the true container size after React has painted
      setTimeout(() => map.invalidateSize(), 0);

      // ── Animation helpers ──────────────────────────────────────────────────
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const ease = (t: number) =>
        t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      function getCamera(t: number) {
        let i = 0;
        while (i < CAM.length - 2 && CAM[i + 1][0] <= t) i++;
        const [t0, z0, la0, ln0] = CAM[i];
        const [t1, z1, la1, ln1] = CAM[i + 1];
        const e = ease(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
        return {
          zoom: lerp(z0, z1, e),
          lat:  lerp(la0, la1, e),
          lng:  lerp(ln0, ln1, e),
        };
      }

      function nodeOpacity(n: MapNode, t: number): number {
        if (t < n.minT || t > n.maxT) return 0;
        return Math.min((t - n.minT) / FADE_WIDTH, (n.maxT - t) / FADE_WIDTH, 1);
      }

      // ── RAF loop ───────────────────────────────────────────────────────────
      // Throttle map.setView to ~8 fps so tiles have time to render.
      // Node positions update every frame from the current Leaflet projection.
      let last = 0;
      let lastMapUpdate = 0;

      function frame(now: number) {
        const dt = last ? Math.min(now - last, 50) : 16;
        last = now;

        const a = animRef.current;
        a.t += a.dir * SPEED * dt;
        if (a.t >= 1) { a.t = 1; a.dir = -1; }
        if (a.t <= 0) { a.t = 0; a.dir =  1; }

        const { zoom, lat, lng } = getCamera(a.t);

        // Update Leaflet view at ~8 fps so tiles can render between updates
        if (now - lastMapUpdate > 120) {
          map.setView([lat, lng], zoom, { animate: false });
          lastMapUpdate = now;
        }

        // Project nodes using whatever Leaflet's current view is
        NODES.forEach(n => {
          const el = elsRef.current.get(n.id);
          if (!el) return;
          const pt = map.latLngToContainerPoint([n.lat, n.lng]);
          el.style.left    = `${pt.x}px`;
          el.style.top     = `${pt.y}px`;
          el.style.opacity = `${nodeOpacity(n, a.t)}`;
        });

        rafRef.current = requestAnimationFrame(frame);
      }

      rafRef.current = requestAnimationFrame(frame);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      // Leaflet cleanup is handled by the map.remove() below if map was created
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0a0a0f" }}>

      {/* Leaflet map — fills entire panel */}
      <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />

      {/* Subtle dark vignette overlay — keeps map subdued behind spheres */}
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

      {/* Sphere + label nodes — positioned each frame via Leaflet projection */}
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

"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

const STYLE_URL     = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LOOP_MS       = 480_000;
const ZOOM_DELTA    = 0.035;
const LATERAL_DELTA = 0.008;
const CYCLE         = ZOOM_DELTA * 2 + LATERAL_DELTA;

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

export default function MapVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
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
    let placeLayers: string[] = [];

    map.on("load", () => {
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

      // Native circle layer — flat on the map surface, same Z as labels
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
          "circle-translate": [0, -14],
        },
      });

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

        if (frameCount % 4 === 0 && placeLayers.length > 0) {
          try {
            const seen = new Set<string>();
            const coords: [number, number][] = [];
            for (const f of map.queryRenderedFeatures(undefined, { layers: placeLayers })) {
              if (f.geometry.type !== "Point") continue;
              const [fLng, fLat] = f.geometry.coordinates;
              const key = `${fLng.toFixed(3)},${fLat.toFixed(3)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              coords.push([fLng, fLat]);
            }
            (map.getSource("place-dots") as maplibregl.GeoJSONSource).setData({
              type: "FeatureCollection",
              features: coords.map(([dLng, dLat]) => ({
                type:       "Feature" as const,
                geometry:   { type: "Point" as const, coordinates: [dLng, dLat] },
                properties: {},
              })),
            });
          } catch { /* map briefly not ready */ }
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
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%", background: "#000000" }}
    />
  );
}

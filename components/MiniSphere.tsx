"use client";

import { useEffect, useRef } from "react";

// ── Palette ───────────────────────────────────────────────────────────────────

export const MINI_COLORS: Record<string, string> = {
  "Rap / Hip-Hop":                  "#a78bfa",
  "R&B / Soul / Funk":              "#fb923c",
  "Rock / Indie / Alternative":     "#f87171",
  "Pop / Dance":                    "#f472b6",
  "Jazz / Blues":                   "#60a5fa",
  "Electronic / Ambient":           "#22d3ee",
  "Classical / Score / Soundtrack": "#fbbf24",
  "World / Folk / Regional":        "#4ade80",
  "Other":                          "#71717a",
};

// ── Geometry helpers ──────────────────────────────────────────────────────────

type V3  = [number, number, number];
type Tri = [number, number, number];

const norm3 = ([x, y, z]: V3): V3 => {
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
};

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

function fiboPoles(n: number): V3[] {
  const phi = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = phi * i;
    return [Math.cos(t) * r, y, Math.sin(t) * r] as V3;
  });
}

// ── MiniSphere component ──────────────────────────────────────────────────────

export default function MiniSphere({
  size = 80,
  seed = 0,
  platformColor,
  transitionDelay = 0,
  transitionDuration = 250,
}: {
  size?: number;
  seed?: number;
  /** When set, overrides the multi-color palette with monochromatic shades of this hex color. */
  platformColor?: string;
  /** Milliseconds to wait before starting the color transition (used for left→right stagger). */
  transitionDelay?: number;
  /** Milliseconds for the color transition to complete. */
  transitionDuration?: number;
}) {
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const rotRef           = useRef({ x: 0.3 + seed * 0.18, y: seed * 0.55 });
  const rafRef           = useRef(0);

  // Target color the sphere is transitioning TO
  const platformColorRef = useRef(platformColor);
  // Color the sphere is transitioning FROM (undefined = snap, no lerp)
  const fromColorRef     = useRef<string | undefined>(undefined);
  // performance.now() timestamp when the transition should BEGIN
  // (accounting for delay). -1 means no active transition.
  const transitionStartRef = useRef<number>(-1);

  // When platformColor changes: capture the old color as fromColor,
  // update the target, and schedule the transition start after the delay.
  useEffect(() => {
    const prev = platformColorRef.current;
    if (platformColor !== prev) {
      fromColorRef.current       = prev;
      platformColorRef.current   = platformColor;
      transitionStartRef.current = performance.now() + transitionDelay;
    }
  // transitionDelay is stable per-sphere; platformColor drives the change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformColor, transitionDelay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const { verts, faces } = buildIcosphere(2);
    const palette = Object.values(MINI_COLORS);
    const nC      = palette.length;

    // Seeded shuffle — each sphere gets a unique, non-repeating color order
    const colorOrder = Array.from({ length: nC }, (_, i) => i);
    let s = (seed * 1234567 + 42) >>> 0;
    for (let i = nC - 1; i > 0; i--) {
      s = Math.imul(s, 1664525) + 1013904223 >>> 0;
      const j = s % (i + 1);
      [colorOrder[i], colorOrder[j]] = [colorOrder[j], colorOrder[i]];
    }

    // Fibonacci poles rotated by seed → unique Voronoi layout per sphere
    const rawPoles = fiboPoles(nC);
    const yOff = seed * 1.1, cosO = Math.cos(yOff), sinO = Math.sin(yOff);
    const poles = rawPoles.map(([px, py, pz]): V3 =>
      [px * cosO - pz * sinO, py, px * sinO + pz * cosO]);

    // Assign each face to its nearest pole (Voronoi)
    const faceRegion = faces.map(f => {
      const cx = (verts[f[0]][0]+verts[f[1]][0]+verts[f[2]][0]) / 3;
      const cy = (verts[f[0]][1]+verts[f[1]][1]+verts[f[2]][1]) / 3;
      const cz = (verts[f[0]][2]+verts[f[1]][2]+verts[f[2]][2]) / 3;
      const len = Math.sqrt(cx*cx + cy*cy + cz*cz) || 1;
      const nx = cx/len, ny = cy/len, nz = cz/len;
      let best = 0, bestDot = -Infinity;
      for (let p = 0; p < nC; p++) {
        const dot = nx*poles[p][0] + ny*poles[p][1] + nz*poles[p][2];
        if (dot > bestDot) { bestDot = dot; best = p; }
      }
      return colorOrder[best];
    });

    const hp = (h: string) =>
      [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)] as const;

    // Compute a monochromatic shade of a hex color for a given Voronoi region index.
    // regionIdx 0..nC-1 → brightness 0.30× (dark patch) → 1.10× (light highlight).
    const shade = (hex: string, regionIdx: number): [number, number, number] => {
      const [baseR, baseG, baseB] = hp(hex);
      const t      = nC > 1 ? regionIdx / (nC - 1) : 0.5;
      const factor = 0.30 + t * 0.80;
      if (factor <= 1.0) {
        return [Math.round(baseR * factor), Math.round(baseG * factor), Math.round(baseB * factor)];
      }
      const excess = factor - 1.0;
      return [
        Math.min(255, Math.round(baseR + (255 - baseR) * excess)),
        Math.min(255, Math.round(baseG + (255 - baseG) * excess)),
        Math.min(255, Math.round(baseB + (255 - baseB) * excess)),
      ];
    };

    function draw() {
      ctx.clearRect(0, 0, size, size);
      rotRef.current.y += 0.006;
      const R  = size * 0.42;
      const rx = rotRef.current.x, ry = rotRef.current.y;
      const sX = Math.sin(rx), cX = Math.cos(rx);
      const sY = Math.sin(ry), cY = Math.cos(ry);
      const pv = verts.map(([x, y, z]) => {
        const x1 = x*cY - z*sY, z1 = x*sY + z*cY;
        const y2 = y*cX - z1*sX, z2 = y*sX + z1*cX;
        return { sx: size/2 + x1*R, sy: size/2 - y2*R, z: z2 };
      });
      const sorted = faces
        .map((f, i) => ({ f, i, z: (pv[f[0]].z + pv[f[1]].z + pv[f[2]].z) / 3 }))
        .sort((a, b) => a.z - b.z);

      for (const { f, i, z } of sorted) {
        const [ia, ib, ic] = f;

        let r: number, g: number, b: number;

        if (platformColorRef.current) {
          const regionIdx = faceRegion[i];
          const toHex     = platformColorRef.current;
          const fromHex   = fromColorRef.current;

          if (fromHex && transitionStartRef.current >= 0) {
            const elapsed = performance.now() - transitionStartRef.current;

            if (elapsed < 0) {
              // Still in pre-delay — hold the from color
              [r, g, b] = shade(fromHex, regionIdx);
            } else {
              // Lerp with ease-in-out over transitionDuration
              const rawT  = Math.min(1, elapsed / transitionDuration);
              const eased = rawT < 0.5
                ? 2 * rawT * rawT
                : -1 + (4 - 2 * rawT) * rawT;
              const [fr, fg, fb] = shade(fromHex, regionIdx);
              const [tr, tg, tb] = shade(toHex,   regionIdx);
              r = Math.round(fr + (tr - fr) * eased);
              g = Math.round(fg + (tg - fg) * eased);
              b = Math.round(fb + (tb - fb) * eased);
            }
          } else {
            // No prior color — snap directly to target
            [r, g, b] = shade(toHex, regionIdx);
          }
        } else {
          // No platformColor — use original multi-color palette
          [r, g, b] = hp(palette[faceRegion[i]]);
        }

        ctx.beginPath();
        ctx.moveTo(pv[ia].sx, pv[ia].sy);
        ctx.lineTo(pv[ib].sx, pv[ib].sy);
        ctx.lineTo(pv[ic].sx, pv[ic].sy);
        ctx.closePath();
        ctx.fillStyle   = `rgba(${r},${g},${b},${(0.05 + Math.max(0,z)*0.13).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${r},${g},${b},${(0.28 + Math.max(0,z)*0.55).toFixed(3)})`;
        ctx.lineWidth   = 0.7;
        ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, seed]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} />;
}

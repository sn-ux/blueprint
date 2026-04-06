"use client";

import { useEffect, useRef, useState } from "react";

// ── Blueprint palette ─────────────────────────────────────────────────────────

const COLORS: Record<string, string> = {
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

// ── Track / subgenre types (match API responses) ──────────────────────────────

type TrackItem = {
  id: string;
  name: string;
  artist: string;
  album: string | null;
  blueprintSubgenre: string;
};

type SubgenreItem = {
  name: string;
  count: number;
};

// ── Geometry types & helpers ──────────────────────────────────────────────────

type V3 = [number, number, number];
type Tri = [number, number, number];

const norm3 = ([x, y, z]: V3): V3 => {
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
};

/**
 * Build a unit icosphere by subdividing a regular icosahedron `subdivs` times.
 *   subdivs=0 →  20 faces
 *   subdivs=1 →  80 faces
 *   subdivs=2 → 320 faces  ← we use this
 */
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
      const [ax, ay, az] = verts[a];
      const [bx, by, bz] = verts[b];
      verts.push(norm3([(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]));
      cache.set(k, verts.length - 1);
      return verts.length - 1;
    };
    const next: Tri[] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  return { verts, faces };
}

/**
 * Distribute n points evenly on a unit sphere (Fibonacci / golden-angle method).
 */
function fiboPoles(n: number): V3[] {
  const phi = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const t = phi * i;
    return [Math.cos(t) * r, y, Math.sin(t) * r] as V3;
  });
}

/** Normalised centroid of a triangle mapped back onto the sphere. */
function triCentroid(verts: V3[], [a, b, c]: Tri): V3 {
  return norm3([
    (verts[a][0] + verts[b][0] + verts[c][0]) / 3,
    (verts[a][1] + verts[b][1] + verts[c][1]) / 3,
    (verts[a][2] + verts[b][2] + verts[c][2]) / 3,
  ]);
}

/**
 * Additive weighted Voronoi: each face goes to genre i minimising
 *   arc_distance(centroid, pole_i) − bonus_i
 *
 * Unlike the multiplicative form (d / w), the additive form gives every
 * genre a *bounded* geographic advantage. A large genre's bonus lets it
 * claim faces up to `bonus` radians further away than a small genre — but
 * it cannot wrap completely around a small genre and enclose it, because
 * the advantage never exceeds a fixed angular cap (~π/4 at most).
 */
function assignVoronoi(cents: V3[], poles: V3[], bonuses: number[]): number[] {
  return cents.map(c => {
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < poles.length; i++) {
      const cosA = Math.min(1, Math.max(-1,
        c[0] * poles[i][0] + c[1] * poles[i][1] + c[2] * poles[i][2]
      ));
      const score = Math.acos(cosA) - bonuses[i]; // additive: larger bonus = bigger pull
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  });
}

/**
 * Lloyd's relaxation: iteratively move each pole to the centroid of its
 * currently-assigned faces, then re-assign. Converges toward a Centroidal
 * Voronoi Tessellation where regions are more convex and poles are
 * well-centred — greatly reducing the chance of thin or irregular plates.
 */
function lloydRelax(
  cents: V3[],
  initialPoles: V3[],
  bonuses: number[],
  iters: number,
): { poles: V3[]; region: number[] } {
  let poles = initialPoles.map(p => [...p] as V3);
  let region = assignVoronoi(cents, poles, bonuses);

  for (let t = 0; t < iters; t++) {
    const sum: V3[] = poles.map(() => [0, 0, 0] as V3);
    const cnt = new Int32Array(poles.length);

    for (let fi = 0; fi < cents.length; fi++) {
      const ri = region[fi];
      sum[ri][0] += cents[fi][0];
      sum[ri][1] += cents[fi][1];
      sum[ri][2] += cents[fi][2];
      cnt[ri]++;
    }

    for (let i = 0; i < poles.length; i++) {
      if (cnt[i] > 0) {
        poles[i] = norm3([sum[i][0] / cnt[i], sum[i][1] / cnt[i], sum[i][2] / cnt[i]]);
      }
    }

    region = assignVoronoi(cents, poles, bonuses);
  }

  return { poles, region };
}

/**
 * Build a face-adjacency list from shared icosphere edges.
 * Two faces are adjacent if they share exactly one edge (two vertex indices).
 */
function buildAdjacency(faces: Tri[]): number[][] {
  const edgeMap = new Map<string, number[]>();
  for (let fi = 0; fi < faces.length; fi++) {
    const [a, b, c] = faces[fi];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const k = p < q ? `${p}:${q}` : `${q}:${p}`;
      if (!edgeMap.has(k)) edgeMap.set(k, []);
      edgeMap.get(k)!.push(fi);
    }
  }
  const adj: number[][] = Array.from({ length: faces.length }, () => []);
  for (const [, fl] of edgeMap) {
    if (fl.length === 2) {
      adj[fl[0]].push(fl[1]);
      adj[fl[1]].push(fl[0]);
    }
  }
  return adj;
}

/**
 * Remove disconnected islands: for each genre, BFS its faces to find
 * connected components. Any component smaller than the largest is
 * re-assigned to the most-common neighbouring genre. One pass is enough
 * because Lloyd's relaxation already produces well-connected regions and
 * islands are small edge cases.
 */
function removeIslands(region: number[], adj: number[][], numGenres: number): number[] {
  const result = [...region];

  for (let g = 0; g < numGenres; g++) {
    const members: number[] = [];
    for (let fi = 0; fi < result.length; fi++) {
      if (result[fi] === g) members.push(fi);
    }
    if (members.length === 0) continue;

    // BFS — find all connected components of this genre
    const visited = new Set<number>();
    const components: number[][] = [];

    for (const seed of members) {
      if (visited.has(seed)) continue;
      const comp: number[] = [];
      const queue = [seed];
      visited.add(seed);
      while (queue.length) {
        const fi = queue.shift()!;
        comp.push(fi);
        for (const ni of adj[fi]) {
          if (!visited.has(ni) && result[ni] === g) {
            visited.add(ni);
            queue.push(ni);
          }
        }
      }
      components.push(comp);
    }

    if (components.length <= 1) continue; // already a single plate

    // Keep the largest component; absorb the rest into their neighbours
    const largest = components.reduce((a, b) => (b.length > a.length ? b : a));

    for (const comp of components) {
      if (comp === largest) continue;
      for (const fi of comp) {
        // Vote among the face's neighbours to pick the absorbing genre
        const votes = new Map<number, number>();
        for (const ni of adj[fi]) {
          const ng = result[ni];
          if (ng !== g) votes.set(ng, (votes.get(ng) ?? 0) + 1);
        }
        let winner = -1, top = 0;
        for (const [ng, v] of votes) {
          if (v > top) { top = v; winner = ng; }
        }
        if (winner >= 0) result[fi] = winner;
      }
    }
  }

  return result;
}

/** Parse a 7-char hex colour to [r, g, b] integers. */
function hexRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorldPage() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [loading,    setLoading]     = useState(true);
  const [refreshing, setRefreshing]  = useState(false);
  const [worlds,     setWorlds]      = useState<Record<string, number>>({});
  const [error,      setError]       = useState<string | null>(null);

  // ── Genre selection + track list ──────────────────────────────────────────
  const [selected,         setSelected]         = useState<string | null>(null);
  const [tracks,           setTracks]           = useState<TrackItem[]>([]);
  const [tracksLoading,    setTracksLoading]    = useState(false);
  const [subgenres,        setSubgenres]        = useState<SubgenreItem[]>([]);
  const [subgenresLoading, setSubgenresLoading] = useState(false);
  const [selectedSubgenre, setSelectedSubgenre] = useState<string | null>(null);
  const selectedSubgenreRef = useRef<string | null>(null);
  // Zoom-driven subgenre focus (separate from clicked selectedSubgenre)
  const [zoomSubgenre, setZoomSubgenre] = useState<string | null>(null);
  const zoomSubgenreRef = useRef<string | null>(null);
  // Hover-driven subgenre focus — updated by polling hoveredRef so the panel
  // previews whatever subgenre is under the cursor without React renders on every pixel.
  const [hoveredSubgenre, setHoveredSubgenre] = useState<string | null>(null);
  const hoveredSubgRef = useRef<string | null>(null); // dedup — only set state when value changes

  const zoomRef      = useRef(1);
  const subRegionRef  = useRef<Map<number, number>>(new Map());
  const activeSubsRef = useRef<SubgenreItem[]>([]);
  const subPolesRef   = useRef<{ name: string; pole: V3 }[]>([]);
  const rotRef  = useRef({ x: 0.3, y: 0 });
  // `moved` flag: true if the pointer traveled during this press (= drag, not click)
  const dragRef = useRef({ active: false, lx: 0, ly: 0, moved: false });
  const rafRef  = useRef<number>(0);

  // Label bounding boxes populated each draw frame, read in onClick
  const labelHitsRef = useRef<
    { name: string; subgenre?: string; x1: number; y1: number; x2: number; y2: number }[]
  >([]);
  // Final Lloyd-relaxed poles in world space, used for sphere-surface hit tests
  const regionPolesRef = useRef<{ name: string; pole: V3 }[]>([]);
  // Hover state — ref (not state) so mouse-move never triggers a React re-render.
  const hoveredRef = useRef<{ genre: string; subgenre?: string } | null>(null);
  // True when the current selection was triggered automatically by zoom (not click).
  // Cleared whenever the user explicitly clicks a genre or clicks outside.
  const autoSelectedRef = useRef(false);

  // ── Data fetching ─────────────────────────────────────────────────────────

  async function loadWorld() {
    try {
      setLoading(true); setError(null);
      const res  = await fetch("/api/world");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "World fetch failed");
      setWorlds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setLoading(false); }
  }

  async function refreshFromSpotify() {
    try {
      setRefreshing(true); setError(null);
      const r = await fetch("/api/spotify/import");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Import failed");
      await loadWorld();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setRefreshing(false); }
  }

  useEffect(() => { loadWorld(); }, []);

  // ── Fetch tracks for the selected genre ───────────────────────────────────

  useEffect(() => {
    // Always clear hover-driven subgenre focus when active genre changes
    hoveredSubgRef.current = null;
    setHoveredSubgenre(null);

    if (!selected) {
      setTracks([]);
      setSubgenres([]);
      setSelectedSubgenre(null);
      selectedSubgenreRef.current = null;
      zoomSubgenreRef.current = null;
      setZoomSubgenre(null);
      return;
    }
    // Clear subgenre filter whenever the parent genre changes
    setSelectedSubgenre(null);
    selectedSubgenreRef.current = null;
    zoomSubgenreRef.current = null;
    setZoomSubgenre(null);

    const encoded = encodeURIComponent(selected);

    setTracksLoading(true);
    fetch(`/api/world/${encoded}`)
      .then(r => r.json())
      .then(d => setTracks(d.tracks ?? []))
      .catch(() => setTracks([]))
      .finally(() => setTracksLoading(false));

    setSubgenresLoading(true);
    fetch(`/api/world/${encoded}/subgenres`)
      .then(r => r.json())
      .then(d => setSubgenres(d.subgenres ?? []))
      .catch(() => setSubgenres([]))
      .finally(() => setSubgenresLoading(false));
  }, [selected]);

  // ── Poll hoveredRef → hoveredSubgenre state ───────────────────────────────
  // hoveredRef is a plain ref (updated per-frame in onMouseMove) so it never
  // causes React re-renders on its own. We poll at 100 ms and only call setState
  // when the subgenre value actually changes — gives live panel preview without
  // firing a re-render on every pixel of mouse movement.
  useEffect(() => {
    const id = setInterval(() => {
      // Only allow hovered subgenre to drive the panel when in subgenre state (zoom ≥ 2.0).
      // Below that threshold we're in genre state and subgenre hover must not override it.
      const newSub = zoomRef.current >= 2.0 ? (hoveredRef.current?.subgenre ?? null) : null;
      if (newSub !== hoveredSubgRef.current) {
        hoveredSubgRef.current = newSub;
        setHoveredSubgenre(newSub);
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  // ── Canvas / render loop ───────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loading || Object.keys(worlds).length === 0) return;

    // Keep canvas pixel dimensions in sync with its CSS layout size.
    const sync = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);

    // ── Build geometry + assign regions (once per worlds change) ────────────
    const { verts, faces } = buildIcosphere(2); // 162 vertices, 320 triangles

    const entries = Object.entries(worlds);
    const total   = entries.reduce((s, [, c]) => s + c, 0) || 1;
    const names   = entries.map(([n]) => n);

    // Additive bonus: (π/4) * √(share) caps the largest genre at ~45° of extra
    // reach — enough for clear size differences, not enough to wrap around a
    // neighbour and enclose it.
    const bonuses = entries.map(([, c]) => (Math.PI / 4) * Math.sqrt(c / total));

    const initialPoles = fiboPoles(names.length);
    const cents        = faces.map(f => triCentroid(verts, f));

    // Lloyd's relaxation → poles converge to region centroids → convex plates
    const { region: rawRegion, poles: finalPoles } = lloydRelax(cents, initialPoles, bonuses, 8);

    // Expose final poles so the click handler can inverse-project to world space
    regionPolesRef.current = names.map((n, i) => ({ name: n, pole: finalPoles[i] }));

    // Remove any disconnected islands → every genre is one contiguous plate
    const adj    = buildAdjacency(faces);
    const region = removeIslands(rawRegion, adj, names.length);

    // ── Subgenre Voronoi inside the selected genre plate ─────────────────────
    subRegionRef.current  = new Map();
    activeSubsRef.current = [];
    subPolesRef.current   = [];
    if (selected !== null && subgenres.length > 0) {
      const selIdx = names.indexOf(selected);
      if (selIdx >= 0) {
        const gfi = faces.map((_, i) => i).filter(i => region[i] === selIdx);
        if (gfi.length > 0) {
          // Cap so every subgenre gets ≥ 3 faces on average
          const maxSubs = Math.max(1, Math.floor(gfi.length / 3));
          const actSubs = subgenres.slice(0, maxSubs);
          activeSubsRef.current = actSubs;
          const n = actSubs.length;

          // ── Sub-adjacency: only edges within this genre's face set ───────────
          const gfiSet = new Set(gfi);
          const subAdj = new Map<number, number[]>(
            gfi.map(fi => [fi, adj[fi].filter(ni => gfiSet.has(ni))])
          );

          // ── Target sizes proportional to track count ─────────────────────────
          const subTotal = actSubs.reduce((s, sg) => s + sg.count, 0) || 1;
          const targets  = actSubs.map(sg =>
            Math.max(1, Math.round((sg.count / subTotal) * gfi.length))
          );
          // Normalise so targets sum exactly to gfi.length
          const tSum = targets.reduce((s, t) => s + t, 0);
          let surplus = gfi.length - tSum;
          if (surplus > 0) {
            for (let i = 0; surplus > 0; i = (i + 1) % n) { targets[i]++; surplus--; }
          } else if (surplus < 0) {
            for (let i = n - 1; surplus < 0; i = ((i - 1) + n) % n) {
              if (targets[i] > 1) { targets[i]--; surplus++; }
            }
          }

          // ── Seed selection: farthest-point sampling within the plate ─────────
          // First seed: face closest to the plate's 3-D centroid
          let psx = 0, psy = 0, psz = 0;
          for (const fi of gfi) { psx += cents[fi][0]; psy += cents[fi][1]; psz += cents[fi][2]; }
          psx /= gfi.length; psy /= gfi.length; psz /= gfi.length;

          let firstSeed = gfi[0], bestCentDot = -Infinity;
          for (const fi of gfi) {
            const d = cents[fi][0]*psx + cents[fi][1]*psy + cents[fi][2]*psz;
            if (d > bestCentDot) { bestCentDot = d; firstSeed = fi; }
          }

          const seedFaces: number[] = [firstSeed];
          // minDist[j] = arc-distance from gfi[j] to its nearest seed
          const minDist = new Float32Array(gfi.length).fill(Infinity);

          const updateDists = (seedFi: number) => {
            const [sx, sy, sz] = cents[seedFi];
            for (let j = 0; j < gfi.length; j++) {
              const [fx, fy, fz] = cents[gfi[j]];
              const dot = Math.min(1, Math.max(-1, fx*sx + fy*sy + fz*sz));
              const d   = Math.acos(dot);
              if (d < minDist[j]) minDist[j] = d;
            }
          };
          updateDists(firstSeed);

          for (let s = 1; s < n; s++) {
            // Pick the face that is farthest from all current seeds
            let farthestJ = 0;
            for (let j = 1; j < gfi.length; j++) {
              if (minDist[j] > minDist[farthestJ]) farthestJ = j;
            }
            seedFaces.push(gfi[farthestJ]);
            updateDists(gfi[farthestJ]);
          }

          // ── Simultaneous BFS region growing ──────────────────────────────────
          // All n seeds grow outward in lockstep; each subgenre claims one face
          // per round until it reaches its target. By construction every claimed
          // face is connected to the seed → regions are always contiguous.
          const assignment = new Map<number, number>(); // faceIdx → subIdx
          const frontiers:   number[][] = Array.from({ length: n }, () => []);
          const regionCounts = new Array<number>(n).fill(0);

          for (let i = 0; i < n; i++) {
            assignment.set(seedFaces[i], i);
            frontiers[i].push(seedFaces[i]);
            regionCounts[i] = 1;
          }
          let totalAssigned = n;

          while (totalAssigned < gfi.length) {
            let grewAny = false;
            for (let i = 0; i < n; i++) {
              if (regionCounts[i] >= targets[i] || frontiers[i].length === 0) continue;
              // Drain the frontier head until we find an unclaimed neighbour
              let found = false;
              while (frontiers[i].length > 0 && !found) {
                const fi2 = frontiers[i][0];
                let claimedOne = false;
                for (const ni of (subAdj.get(fi2) ?? [])) {
                  if (!assignment.has(ni)) {
                    assignment.set(ni, i);
                    regionCounts[i]++;
                    totalAssigned++;
                    frontiers[i].push(ni);
                    claimedOne = true;
                    found = true;
                    grewAny = true;
                    break;
                  }
                }
                if (!claimedOne) frontiers[i].shift(); // fi2 fully surrounded
              }
            }
            if (!grewAny) break; // all frontiers exhausted before targets met
          }

          // ── Mop-up: absorb any unassigned faces (over-shoot from targets) ────
          let mopping = true;
          while (mopping) {
            mopping = false;
            for (const fi of gfi) {
              if (assignment.has(fi)) continue;
              for (const ni of (subAdj.get(fi) ?? [])) {
                if (assignment.has(ni)) {
                  assignment.set(fi, assignment.get(ni)!);
                  mopping = true;
                  break;
                }
              }
            }
          }
          // Hard fallback: any topologically isolated face → subgenre 0
          for (const fi of gfi) {
            if (!assignment.has(fi)) assignment.set(fi, 0);
          }

          subRegionRef.current = assignment;

          // ── Poles: centroid of each subgenre's assigned faces ────────────────
          // Used by the click handler to map a 3-D ray to the nearest subgenre.
          const poleAcc: V3[] = Array.from({ length: n }, () => [0, 0, 0] as V3);
          const poleCnt = new Int32Array(n);
          for (const [fi2, si] of assignment) {
            poleAcc[si][0] += cents[fi2][0];
            poleAcc[si][1] += cents[fi2][1];
            poleAcc[si][2] += cents[fi2][2];
            poleCnt[si]++;
          }
          subPolesRef.current = actSubs.map((sub, i) => ({
            name: sub.name,
            pole: poleCnt[i] > 0
              ? norm3([poleAcc[i][0] / poleCnt[i], poleAcc[i][1] / poleCnt[i], poleAcc[i][2] / poleCnt[i]])
              : cents[seedFaces[i]],
          }));
        }
      }
    }

    // Pre-parse colours
    const rgbMap: [number, number, number][] = names.map(n => hexRgb(COLORS[n] ?? "#71717a"));

    const FOV = 900;

    // ── Per-frame draw ────────────────────────────────────────────────────────
    function drawFrame() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const W = canvas.width;
      const H = canvas.height;
      if (!W || !H) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const R   = Math.min(W, H) * 0.38 * zoomRef.current;
      const cx  = W / 2, cy = H / 2;
      const rx  = rotRef.current.x, ry = rotRef.current.y;

      // Reset label hit areas each frame
      labelHitsRef.current = [];

      ctx.clearRect(0, 0, W, H);

      // Soft atmosphere halo behind the sphere
      const atmo = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.22);
      atmo.addColorStop(0, "rgba(70,70,180,0.13)");
      atmo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2);
      ctx.fillStyle = atmo;
      ctx.fill();

      // ── Project every vertex once per frame ─────────────────────────────
      const pv = verts.map(([x, y, z]) => {
        // Rotate around Y
        const x1 = x * Math.cos(ry) + z * Math.sin(ry);
        const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
        // Rotate around X
        const y2 = y * Math.cos(rx) - z1 * Math.sin(rx);
        const z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
        const s  = FOV / (FOV + z2);
        return { sx: cx + x1 * R * s, sy: cy + y2 * R * s, z: z2 };
      });

      // ── Collect face metadata and sort back→front (painter's algorithm) ──
      const fd = faces.map((tri, i) => {
        const depth = (pv[tri[0]].z + pv[tri[1]].z + pv[tri[2]].z) / 3;
        return { tri, fi: i, depth, ri: region[i] };
      });
      fd.sort((a, b) => a.depth - b.depth);

      // Resolve hover + selection into indices used throughout the draw pass
      const selectedIdx    = selected !== null ? names.indexOf(selected) : -1;
      const hoveredGenre   = hoveredRef.current?.genre ?? null;
      // Hover state comes from actual mouse position only — never from zoom auto-focus.
      // zoomSubgenre feeds the right panel (via focusedSubgenre in JSX) but must not
      // create hover styling on the sphere, which would make a region look preselected.
      const hoveredSubName = hoveredRef.current?.subgenre ?? null;
      const hoveredIdx     = hoveredGenre !== null ? names.indexOf(hoveredGenre) : -1;

      // Zoom-based reveal factor: 0 at zoom=1.6 (first appear), 1 at zoom=2.1 (fully opaque).
      // Subgenres are invisible until zoom 1.6 so the genre level gets clear solo time (1.2–1.6).
      const subgReveal = Math.min(1, Math.max(0, (zoomRef.current - 1.6) / 0.5));

      // ── Draw each face ────────────────────────────────────────────────────
      for (const { tri, fi, depth, ri } of fd) {
        const [ia, ib, ic] = tri;
        const isFront        = depth >= 0;
        const isSelected     = ri === selectedIdx;
        const isHoveredGenre = ri === hoveredIdx && !isSelected;
        // Show subgenres at zoom ≥ 1.6 (opacity scales up via subgReveal above)
        const subIdx  = isSelected && zoomRef.current >= 1.6
          ? subRegionRef.current.get(fi)
          : undefined;
        const showSub = subIdx !== undefined;
        // Is this specific subgenre face the one being hovered / clicked?
        const subName      = showSub ? activeSubsRef.current[subIdx!]?.name : undefined;
        const isHoveredSub = showSub && !!subName && subName === hoveredSubName;
        const isClickedSub = showSub && !!subName && subName === selectedSubgenreRef.current;
        // Is any subgenre being hovered (but not this one)?
        const siblingHov   = showSub && !!hoveredSubName && !isHoveredSub;
        // Flat brightness for all subgenres — prevents the largest region from looking
        // pre-emphasized just because it has rank 0. Clicked/hovered state is conveyed
        // via fill/edge opacity rather than color brightness.
        let [r, g, b] = rgbMap[ri];
        if (showSub) {
          const scale = 0.55;
          r = Math.round(r * scale);
          g = Math.round(g * scale);
          b = Math.round(b * scale);
        }

        ctx.beginPath();
        ctx.moveTo(pv[ia].sx, pv[ia].sy);
        ctx.lineTo(pv[ib].sx, pv[ib].sy);
        ctx.lineTo(pv[ic].sx, pv[ic].sy);
        ctx.closePath();

        if (isFront) {
          const hasSel = selectedIdx >= 0;
          // ── Fill alpha ─────────────────────────────────────────────────────
          // Priority: clicked > hovered > sibling-dimmed > default-sub > genre
          const fillAlpha = isClickedSub  ? 0.52 * subgReveal
            : isHoveredSub                ? 0.35 * subgReveal
            : siblingHov                  ? 0.06 * subgReveal
            : showSub                     ? 0.08 * subgReveal
            : isSelected                  ? 0.28
            : isHoveredGenre              ? 0.15
            : hasSel                      ? 0.015 : 0.02;
          ctx.fillStyle = `rgba(${r},${g},${b},${fillAlpha})`;
          ctx.fill();

          // ── Edge alpha + weight ────────────────────────────────────────────
          const edgeAlpha = isClickedSub  ? 0.90 * subgReveal
            : isHoveredSub                ? 0.65 * subgReveal
            : siblingHov                  ? 0.03 * subgReveal
            : showSub                     ? 0.05 * subgReveal
            : isSelected                  ? 1.0
            : isHoveredGenre              ? 0.95
            : hasSel                      ? 0.60 : 0.82;
          ctx.strokeStyle = `rgba(${r},${g},${b},${edgeAlpha})`;
          ctx.lineWidth   = isClickedSub  ? 0.70
            : isHoveredSub                ? 0.55
            : showSub                     ? 0.30
            : isSelected                  ? 1.4
            : isHoveredGenre              ? 1.2
            : hasSel                      ? 0.75 : 0.9;
          ctx.stroke();
        } else {
          // Back hemisphere: ghost wireframe only, fades toward the south pole
          const t = Math.max(0, (depth + 0.8) / 0.8) * 0.13;
          ctx.strokeStyle = `rgba(${r},${g},${b},${t.toFixed(3)})`;
          ctx.lineWidth   = 0.4;
          ctx.stroke();
        }
      }

      // ── Level 2: Subgenre boundary edges ─────────────────────────────────────
      // Detect cross-subgenre edges within the selected plate and draw them as
      // a glowing medium-weight line — clearly readable, but subordinate to the
      // outer plate boundary (Level 1) drawn below.
      if (zoomRef.current >= 1.6 && selectedIdx >= 0 && subRegionRef.current.size > 0) {
        const [br, bg, bb] = rgbMap[selectedIdx];
        ctx.save();
        ctx.shadowColor = `rgba(${br},${bg},${bb},${(0.55 * subgReveal).toFixed(3)})`;
        ctx.shadowBlur  = 5;
        ctx.strokeStyle = `rgba(${br},${bg},${bb},${(0.82 * subgReveal).toFixed(3)})`;
        ctx.lineWidth   = 1.6;
        ctx.lineCap     = "round";
        const drawnEdges = new Set<string>();

        for (const { fi, depth, ri } of fd) {
          if (ri !== selectedIdx || depth < 0) continue;
          const siA = subRegionRef.current.get(fi);
          if (siA === undefined) continue;
          for (const ni of adj[fi]) {
            const siB = subRegionRef.current.get(ni);
            if (siB === undefined || siB === siA) continue;
            // Shared boundary — find the two common vertex indices
            const fv = faces[fi];
            const nv = faces[ni];
            const shared = fv.filter(v => nv.includes(v));
            if (shared.length !== 2) continue;
            const key = shared[0] < shared[1] ? `${shared[0]}:${shared[1]}` : `${shared[1]}:${shared[0]}`;
            if (drawnEdges.has(key)) continue;
            drawnEdges.add(key);
            ctx.beginPath();
            ctx.moveTo(pv[shared[0]].sx, pv[shared[0]].sy);
            ctx.lineTo(pv[shared[1]].sx, pv[shared[1]].sy);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // ── Level 1: Main genre plate boundary — strongest, thickest glow ────────
      // Edges where the selected genre borders any other genre define the plate's
      // outer silhouette. This is the dominant line — it anchors the entire
      // regional view and must read as clearly as a country border on a globe.
      if (selectedIdx >= 0) {
        const [pr, pg, pb] = rgbMap[selectedIdx];
        ctx.save();
        ctx.shadowColor = `rgba(${pr},${pg},${pb},0.85)`;
        ctx.shadowBlur  = 10;
        ctx.strokeStyle = `rgba(${pr},${pg},${pb},1.0)`;
        ctx.lineWidth   = 3.0;
        ctx.lineCap     = "round";
        const drawnPlate = new Set<string>();

        for (const { fi, depth, ri } of fd) {
          if (ri !== selectedIdx || depth < 0) continue;
          for (const ni of adj[fi]) {
            if (region[ni] === selectedIdx) continue; // interior edge — skip
            const fv = faces[fi], nv = faces[ni];
            const shared = fv.filter(v => nv.includes(v));
            if (shared.length !== 2) continue;
            const key = shared[0] < shared[1]
              ? `${shared[0]}:${shared[1]}`
              : `${shared[1]}:${shared[0]}`;
            if (drawnPlate.has(key)) continue;
            drawnPlate.add(key);
            ctx.beginPath();
            ctx.moveTo(pv[shared[0]].sx, pv[shared[0]].sy);
            ctx.lineTo(pv[shared[1]].sx, pv[shared[1]].sy);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // ── Genre labels ───────────────────────────────────────────────────────
      // Average 2-D centroid across each genre's front-facing triangles
      const acc: Record<number, { sx: number; sy: number; n: number }> = {};
      for (const { tri, depth, ri } of fd) {
        if (depth < 0) continue;
        const [ia, ib, ic] = tri;
        const lx = (pv[ia].sx + pv[ib].sx + pv[ic].sx) / 3;
        const ly = (pv[ia].sy + pv[ib].sy + pv[ic].sy) / 3;
        if (!acc[ri]) acc[ri] = { sx: 0, sy: 0, n: 0 };
        acc[ri].sx += lx;
        acc[ri].sy += ly;
        acc[ri].n++;
      }

      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";

      for (const [riStr, a] of Object.entries(acc)) {
        if (a.n < 4) continue; // skip genres with too few visible faces
        const ri        = Number(riStr);
        const isSelected = ri === selectedIdx;
        // Keep the selected genre label inside the visible canvas area so it
        // remains readable even when zoomed in and the centroid drifts off-screen.
        const rawLx = a.sx / a.n;
        const rawLy = a.sy / a.n;
        const lx = isSelected
          ? Math.max(80, Math.min(W - 80, rawLx))
          : rawLx;
        const ly = isSelected
          ? Math.max(24, Math.min(H * 0.88, rawLy))
          : rawLy;
        const name = names[ri];
        const [r, g, b] = rgbMap[ri];
        // Hovered + selected labels at full brightness; others soften
        const isThisHov = ri === hoveredIdx;
        const labelDim  = isSelected || isThisHov ? 1.0 : selectedIdx >= 0 ? 0.50 : 1.0;
        const fs  = isSelected ? 15 : 13;

        ctx.globalAlpha = labelDim;
        ctx.font = `700 ${fs}px system-ui, sans-serif`;
        const tw  = ctx.measureText(name).width;
        const pad = 8;
        const rad = 8;

        const bx = lx - tw / 2 - pad;
        const by = ly - fs / 2 - pad;
        const bw = tw + pad * 2;
        const bh = fs + pad * 2;

        // Soft rounded pill — shadow gives depth without hard edges
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.75)";
        ctx.shadowBlur  = 14;
        ctx.fillStyle   = isSelected ? "rgba(8,8,16,0.90)" : "rgba(8,8,16,0.72)";
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, rad);
        ctx.fill();
        ctx.restore();

        if (isSelected) {
          ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, rad);
          ctx.stroke();
        }

        // Genre-coloured label
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillText(name, lx, ly);
        ctx.globalAlpha = 1.0; // restore

        // Record hit area for onClick
        labelHitsRef.current.push({ name, x1: bx, y1: by, x2: bx + bw, y2: by + bh });
      }

      // ── Subgenre labels (zoomed-in view of the selected plate) ────────────
      if (zoomRef.current >= 1.6 && selectedIdx >= 0 && subgenres.length > 0) {
        // Labels fade in at 1.6 (same zoom as region faces appear), fully visible by 1.9
        const labelReveal = Math.min(1, Math.max(0, (zoomRef.current - 1.6) / 0.3));
        ctx.globalAlpha = labelReveal;
        const subAcc: Record<number, { sx: number; sy: number; n: number }> = {};
        for (const { tri, fi, depth, ri } of fd) {
          if (ri !== selectedIdx || depth < 0) continue;
          const si = subRegionRef.current.get(fi);
          if (si === undefined) continue;
          const [ia, ib, ic] = tri;
          const lx = (pv[ia].sx + pv[ib].sx + pv[ic].sx) / 3;
          const ly = (pv[ia].sy + pv[ib].sy + pv[ic].sy) / 3;
          if (!subAcc[si]) subAcc[si] = { sx: 0, sy: 0, n: 0 };
          subAcc[si].sx += lx; subAcc[si].sy += ly; subAcc[si].n++;
        }
        for (const [siStr, a] of Object.entries(subAcc)) {
          if (a.n < 2) continue;
          const si  = Number(siStr);
          const sub = activeSubsRef.current[si];
          if (!sub) continue;
          const lx = a.sx / a.n, ly = a.sy / a.n;
          // Same brightness-shade derivation as face coloring
          const n = activeSubsRef.current.length;
          const t = n > 1 ? 1 - si / (n - 1) : 0.5;
          const scale = 0.45 + 0.55 * t;
          const [pr, pg, pb] = rgbMap[selectedIdx];
          const cr = Math.round(pr * scale);
          const cg = Math.round(pg * scale);
          const cb = Math.round(pb * scale);
          const isActiveSub = selectedSubgenreRef.current === sub.name;
          const isHovSub    = hoveredSubName === sub.name;
          // selected > hovered > default for visual priority
          const subLit = isActiveSub || isHovSub;
          const fs  = subLit ? 12 : 11;
          ctx.font  = `${subLit ? 700 : 600} ${fs}px system-ui, sans-serif`;
          const tw  = ctx.measureText(sub.name).width;
          const pad = 6;
          const rad = 6;
          const bx  = lx - tw / 2 - pad, by = ly - fs / 2 - pad;
          const bw  = tw + pad * 2,       bh = fs + pad * 2;
          ctx.save();
          ctx.shadowColor = isHovSub ? `rgba(${cr},${cg},${cb},0.45)` : "rgba(0,0,0,0.55)";
          ctx.shadowBlur  = isHovSub ? 12 : 8;
          ctx.fillStyle   = isActiveSub ? `rgba(${cr},${cg},${cb},0.18)`
            : isHovSub    ? `rgba(${cr},${cg},${cb},0.12)`
            : "rgba(8,8,16,0.60)";
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, rad);
          ctx.fill();
          ctx.restore();
          if (isActiveSub) {
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},1.0)`;
            ctx.lineWidth   = 1.5;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, rad);
            ctx.stroke();
          } else if (isHovSub) {
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.60)`;
            ctx.lineWidth   = 1.0;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, rad);
            ctx.stroke();
          }
          // Hovered sub text at full parent-genre brightness
          ctx.fillStyle = isHovSub ? `rgb(${cr},${cg},${cb})` : `rgba(${cr},${cg},${cb},0.80)`;
          ctx.fillText(sub.name, lx, ly);
          // Record as clickable hit area with subgenre tag
          labelHitsRef.current.push({ name: selected!, subgenre: sub.name, x1: bx, y1: by, x2: bx + bw, y2: by + bh });
        }
        ctx.globalAlpha = 1.0; // restore after subgenre label fade
      }

      ctx.textBaseline = "alphabetic"; // restore default
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const prevZoom = zoomRef.current;
      zoomRef.current = Math.max(0.5, Math.min(5, prevZoom * (1 - e.deltaY * 0.004)));
      const newZoom  = zoomRef.current;

      // ── Auto-reveal: select the most front-facing genre on zoom-in ────────
      // When the user zooms past the reveal threshold without having clicked a
      // genre, automatically select the genre most directly facing the camera.
      // This triggers the existing fetch + BFS pipeline so subgenres appear
      // without requiring a click — same feel as Google Maps detail emergence.
      if (newZoom >= 1.2 && selected === null && regionPolesRef.current.length > 0) {
        const rx = rotRef.current.x, ry = rotRef.current.y;
        let bestName = regionPolesRef.current[0].name;
        let bestZ    = -Infinity;
        for (const { name, pole: [px, py, pz] } of regionPolesRef.current) {
          const x1 =  px * Math.cos(ry) + pz * Math.sin(ry);
          const z1 = -px * Math.sin(ry) + pz * Math.cos(ry);
          const z2 =  py * Math.sin(rx) + z1 * Math.cos(rx);
          if (z2 > bestZ) { bestZ = z2; bestName = name; }
        }
        autoSelectedRef.current = true;
        setSelected(bestName);
      }

      // ── Auto-focus subgenre at zoom >= 2.0 (same threshold as interactive subgenre state)
      if (newZoom >= 2.0 && subPolesRef.current.length > 0) {
        const rx2 = rotRef.current.x, ry2 = rotRef.current.y;
        let bestSubName = subPolesRef.current[0].name, bestSubZ = -Infinity;
        for (const { name, pole: [px, py, pz] } of subPolesRef.current) {
          const x1 =  px * Math.cos(ry2) + pz * Math.sin(ry2);
          const z1  = -px * Math.sin(ry2) + pz * Math.cos(ry2);
          const z2  =  py * Math.sin(rx2) + z1 * Math.cos(rx2);
          if (z2 > bestSubZ) { bestSubZ = z2; bestSubName = name; }
        }
        if (zoomSubgenreRef.current !== bestSubName) {
          zoomSubgenreRef.current = bestSubName;
          setZoomSubgenre(bestSubName);
        }
      } else if (newZoom < 2.0) {
        // Exit subgenre state — clear both auto-focused and explicitly clicked subgenre
        if (zoomSubgenreRef.current !== null) {
          zoomSubgenreRef.current = null;
          setZoomSubgenre(null);
        }
        if (selectedSubgenreRef.current !== null) {
          selectedSubgenreRef.current = null;
          setSelectedSubgenre(null);
        }
      }

      // ── Deselect when zooming back below the genre-focus threshold ────────
      // Applies to ALL selections (click or auto) — if you're zoomed out past
      // the point where genres are focused, there is no active genre.
      if (newZoom < 1.1 && selected !== null) {
        autoSelectedRef.current = false;
        selectedSubgenreRef.current = null;
        setSelectedSubgenre(null);
        zoomSubgenreRef.current = null;
        setZoomSubgenre(null);
        setSelected(null);
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    function animate() {
      drawFrame();
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [worlds, loading, selected, subgenres]); // re-run when selection or subgenres change

  // ── Mouse drag + hover ────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent) => {
    // Reset moved flag on every new press
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY, moved: false };
  };

  /** Inverse-project a canvas coordinate to the nearest region name, or null. */
  const hitTestSphere = (mx: number, my: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || regionPolesRef.current.length === 0) return null;
    const W  = canvas.clientWidth, H = canvas.clientHeight;
    const R  = Math.min(W, H) * 0.38 * zoomRef.current;
    const cx = W / 2, cy = H / 2;
    const nx = (mx - cx) / R;
    const ny = (my - cy) / R;
    if (nx * nx + ny * ny > 1) return null;
    const nz  = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const rx  = rotRef.current.x, ry = rotRef.current.y;
    const y_w = ny * Math.cos(rx) + nz * Math.sin(rx);
    const z1  = -ny * Math.sin(rx) + nz * Math.cos(rx);
    const x_w = nx * Math.cos(ry) - z1 * Math.sin(ry);
    const z_w = nx * Math.sin(ry) + z1 * Math.cos(ry);
    let best    = regionPolesRef.current[0];
    let bestDot = -Infinity;
    for (const rd of regionPolesRef.current) {
      const d = rd.pole[0] * x_w + rd.pole[1] * y_w + rd.pole[2] * z_w;
      if (d > bestDot) { bestDot = d; best = rd; }
    }
    return best.name;
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      // Dragging: rotate the sphere, suppress hover
      rotRef.current.y += (e.clientX - dragRef.current.lx) * 0.005;
      rotRef.current.x -= (e.clientY - dragRef.current.ly) * 0.005;
      dragRef.current.lx    = e.clientX;
      dragRef.current.ly    = e.clientY;
      dragRef.current.moved = true;
      hoveredRef.current    = null;

      // Expire selection if the selected genre has been dragged to the back hemisphere.
      // z2 < 0 means the genre's pole is now facing away from the camera — it is no
      // longer "in view", so the locked highlight should release naturally.
      if (selected !== null && zoomRef.current >= 1.1 && regionPolesRef.current.length > 0) {
        const selEntry = regionPolesRef.current.find(r => r.name === selected);
        if (selEntry) {
          const [px, py, pz] = selEntry.pole;
          const drx = rotRef.current.x, dry = rotRef.current.y;
          const sx1 =  px * Math.cos(dry) + pz * Math.sin(dry);
          const sz1 = -px * Math.sin(dry) + pz * Math.cos(dry);
          const sz2 =  py * Math.sin(drx) + sz1 * Math.cos(drx);
          if (sz2 < 0) {
            autoSelectedRef.current = false;
            selectedSubgenreRef.current = null;
            setSelectedSubgenre(null);
            zoomSubgenreRef.current = null;
            setZoomSubgenre(null);
            setSelected(null);
          }
        }
      }
      return;
    }

    // Not dragging: update hover state each frame
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    // Label hit-boxes take priority (they're more precise)
    for (const h of labelHitsRef.current) {
      if (mx >= h.x1 && mx <= h.x2 && my >= h.y1 && my <= h.y2) {
        hoveredRef.current = h.subgenre
          ? { genre: h.name, subgenre: h.subgenre }
          : { genre: h.name };
        return;
      }
    }

    // Sphere-surface inverse projection → genre
    const genreName = hitTestSphere(mx, my);
    if (!genreName) { hoveredRef.current = null; return; }

    // Only resolve to subgenre when fully in subgenre state (zoom ≥ 2.0)
    if (selected !== null && zoomRef.current >= 2.0 &&
        genreName === selected && subPolesRef.current.length > 0) {
      const canvas2 = canvasRef.current!;
      const W2 = canvas2.clientWidth, H2 = canvas2.clientHeight;
      const R2 = Math.min(W2, H2) * 0.38 * zoomRef.current;
      const nx2 = (mx - W2 / 2) / R2;
      const ny2 = (my - H2 / 2) / R2;
      if (nx2 * nx2 + ny2 * ny2 <= 1) {
        const nz2 = Math.sqrt(Math.max(0, 1 - nx2 * nx2 - ny2 * ny2));
        const rx2 = rotRef.current.x, ry2 = rotRef.current.y;
        const y_w = ny2 * Math.cos(rx2) + nz2 * Math.sin(rx2);
        const z1  = -ny2 * Math.sin(rx2) + nz2 * Math.cos(rx2);
        const x_w = nx2 * Math.cos(ry2) - z1 * Math.sin(ry2);
        const z_w = nx2 * Math.sin(ry2) + z1 * Math.cos(ry2);
        let bestSub = subPolesRef.current[0], bestDot = -Infinity;
        for (const sp of subPolesRef.current) {
          const d = sp.pole[0] * x_w + sp.pole[1] * y_w + sp.pole[2] * z_w;
          if (d > bestDot) { bestDot = d; bestSub = sp; }
        }
        hoveredRef.current = { genre: genreName, subgenre: bestSub.name };
        return;
      }
    }

    hoveredRef.current = { genre: genreName };
  };

  const stopDrag = () => { dragRef.current.active = false; };
  const onMouseLeave = () => { dragRef.current.active = false; hoveredRef.current = null; };

  // ── Click → genre selection ───────────────────────────────────────────────

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If the pointer moved during this press it was a drag — ignore
    if (dragRef.current.moved) return;

    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;

    // 1. Check label bounding boxes (most precise)
    for (const h of labelHitsRef.current) {
      if (mx >= h.x1 && mx <= h.x2 && my >= h.y1 && my <= h.y2) {
        if (h.subgenre) {
          // Subgenre label: toggle subgenre filter, keep parent selected
          const next = selectedSubgenreRef.current === h.subgenre ? null : h.subgenre;
          selectedSubgenreRef.current = next;
          setSelectedSubgenre(next);
        } else {
          // Genre label: user explicitly selecting — take over from auto-select
          autoSelectedRef.current = false;
          selectedSubgenreRef.current = null;
          setSelectedSubgenre(null);
          zoomSubgenreRef.current = null;
          setZoomSubgenre(null);
          setSelected(prev => prev === h.name ? null : h.name);
        }
        return;
      }
    }

    // 2. Sphere-surface hit: inverse-project the 2-D click into world space,
    //    then find the nearest region pole.
    const W  = canvas.clientWidth, H = canvas.clientHeight;
    const R  = Math.min(W, H) * 0.38 * zoomRef.current;
    const cx = W / 2, cy = H / 2;
    const nx = (mx - cx) / R;
    const ny = (my - cy) / R;
    if (nx * nx + ny * ny > 1) {
      // Click outside the sphere — reset to full overview state
      autoSelectedRef.current = false;
      selectedSubgenreRef.current = null;
      setSelectedSubgenre(null);
      zoomSubgenreRef.current = null;
      setZoomSubgenre(null);
      setSelected(null);
      return;
    }

    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); // front hemisphere

    // Invert the Ry-then-Rx rotation applied in drawFrame:
    //   given screen-space (x1≈nx, y2≈ny, z2≈nz), recover world (x_w, y_w, z_w)
    const rx  = rotRef.current.x, ry = rotRef.current.y;
    const y_w = ny * Math.cos(rx) + nz * Math.sin(rx);
    const z1  = -ny * Math.sin(rx) + nz * Math.cos(rx);
    const x_w = nx * Math.cos(ry) - z1 * Math.sin(ry);
    const z_w = nx * Math.sin(ry) + z1 * Math.cos(ry);

    if (regionPolesRef.current.length === 0) return;

    // Find nearest genre pole
    let best    = regionPolesRef.current[0];
    let bestDot = -Infinity;
    for (const rd of regionPolesRef.current) {
      const d = rd.pole[0] * x_w + rd.pole[1] * y_w + rd.pole[2] * z_w;
      if (d > bestDot) { bestDot = d; best = rd; }
    }

    // Only treat as a subgenre click when in subgenre state (zoom ≥ 2.0)
    if (selected !== null && zoomRef.current >= 2.0 &&
        best.name === selected && subPolesRef.current.length > 0) {
      let bestSub    = subPolesRef.current[0];
      let bestSubDot = -Infinity;
      for (const sp of subPolesRef.current) {
        const d = sp.pole[0] * x_w + sp.pole[1] * y_w + sp.pole[2] * z_w;
        if (d > bestSubDot) { bestSubDot = d; bestSub = sp; }
      }
      const next = selectedSubgenreRef.current === bestSub.name ? null : bestSub.name;
      selectedSubgenreRef.current = next;
      setSelectedSubgenre(next);
      return;
    }

    // Genre-level click: user explicitly selecting — take over from auto-select
    autoSelectedRef.current = false;
    selectedSubgenreRef.current = null;
    setSelectedSubgenre(null);
    zoomSubgenreRef.current = null;
    setZoomSubgenre(null);
    setSelected(prev => prev === best.name ? null : best.name);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-xl">Loading your Music World...</p>
      </main>
    );
  }

  const selectedColor = selected ? (COLORS[selected] ?? "#ffffff") : "#ffffff";
  const [sr, sg, sb]  = selected ? hexRgb(COLORS[selected] ?? "#ffffff") : [255, 255, 255];
  // Priority: hovered subgenre (live preview) > clicked > zoom-auto-focused
  const focusedSubgenre = hoveredSubgenre ?? selectedSubgenre ?? zoomSubgenre;
  // Filter the track list when a subgenre is in focus
  const displayedTracks = focusedSubgenre
    ? tracks.filter(t => t.blueprintSubgenre === focusedSubgenre)
    : tracks;

  return (
    <main className="h-screen bg-black text-white flex flex-col overflow-hidden">

      {/* ── Minimal utility bar — intentionally quiet ─────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-2.5">
        <span className="text-xs tracking-widest uppercase text-zinc-700 font-medium select-none">
          Blueprint
        </span>
        <div className="flex items-center gap-3">
          {error && <span className="text-red-500 text-xs">{error}</span>}
          <button
            onClick={refreshFromSpotify}
            disabled={refreshing}
            className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 text-xs transition-colors"
          >
            {refreshing ? "syncing…" : "sync library"}
          </button>
        </div>
      </div>

      {/* ── Body — sphere left, shelf right ───────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT — the world. Always the hero. */}
        <div className="flex-1 relative min-w-0">
          {Object.keys(worlds).length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-zinc-700 text-sm">Sync your library to begin</p>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-pointer"
              style={{ display: "block" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={stopDrag}
              onMouseLeave={onMouseLeave}
              onClick={handleClick}
            />
          )}
        </div>

        {/* RIGHT — content shelf. Always visible.
            Overview state: genre summary. Genre/subgenre focus: tracks. */}
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{
            width: "42%",
            borderLeft: `1px solid rgba(${sr},${sg},${sb},0.14)`,
            background: "rgba(4,4,8,0.98)",
          }}
        >
          {selected ? (
            <>
              {/* Thin genre-color accent strip at the very top */}
              <div
                className="flex-shrink-0"
                style={{ height: 2, background: selectedColor, opacity: 0.85 }}
              />

              {/* ── Shelf header — loose, not boxed ──────────────────────── */}
              <div className="flex-shrink-0 px-7 pt-6 pb-4">
                {focusedSubgenre ? (
                  <>
                    <button
                      onClick={() => {
                        setSelectedSubgenre(null); selectedSubgenreRef.current = null;
                        setZoomSubgenre(null); zoomSubgenreRef.current = null;
                      }}
                      className="text-xs mb-3 flex items-center gap-1.5 transition-opacity hover:opacity-100"
                      style={{ color: `rgba(${sr},${sg},${sb},0.45)` }}
                    >
                      ← {selected}
                    </button>
                    <h2 className="text-2xl font-bold leading-tight truncate" style={{ color: selectedColor }}>
                      {focusedSubgenre}
                    </h2>
                  </>
                ) : (
                  <>
                    <p className="text-xs tracking-widest uppercase mb-2"
                      style={{ color: `rgba(${sr},${sg},${sb},0.38)` }}>
                      Now exploring
                    </p>
                    <h2 className="text-2xl font-bold leading-tight truncate" style={{ color: selectedColor }}>
                      {selected}
                    </h2>
                  </>
                )}
                <p className="text-zinc-600 text-xs mt-1.5">
                  {tracksLoading ? "—" : `${displayedTracks.length} tracks`}
                </p>
              </div>

              {/* ── Subgenre filter row — minimal, navigation-feel ─────── */}
              {subgenres.length > 0 && (
                <div
                  className="flex-shrink-0 flex gap-1.5 px-7 pb-4 overflow-x-auto"
                  style={{ scrollbarWidth: "none" }}
                >
                  {subgenres.map(sub => {
                    const active = selectedSubgenre === sub.name;
                    return (
                      <button
                        key={sub.name}
                        onClick={() => {
                          const next = selectedSubgenre === sub.name ? null : sub.name;
                          setSelectedSubgenre(next);
                          selectedSubgenreRef.current = next;
                        }}
                        className="flex-shrink-0 text-xs px-3 py-1 rounded-full whitespace-nowrap transition-all"
                        style={{
                          background: active ? `rgba(${sr},${sg},${sb},0.18)` : "transparent",
                          color: active
                            ? `rgb(${sr},${sg},${sb})`
                            : "rgba(255,255,255,0.30)",
                          border: `1px solid rgba(${sr},${sg},${sb},${active ? 0.45 : 0.10})`,
                        }}
                      >
                        {sub.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Separator */}
              <div className="flex-shrink-0 mx-7"
                style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

              {/* ── Track shelf — rows like a record shelf, no card boxes ── */}
              <div className="overflow-y-auto flex-1"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
              >
                {tracksLoading ? (
                  <p className="text-zinc-700 text-xs px-7 py-8 text-center">—</p>
                ) : displayedTracks.length === 0 ? (
                  <p className="text-zinc-700 text-xs px-7 py-8 text-center">No tracks</p>
                ) : (
                  <div className="flex flex-col pt-1 pb-6">
                    {displayedTracks.map((t, idx) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-4 px-7 py-2.5 group"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.035)" }}
                      >
                        <span className="text-xs font-mono w-5 text-right flex-shrink-0"
                          style={{ color: "rgba(255,255,255,0.13)" }}>
                          {idx + 1}
                        </span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-white text-sm font-medium truncate leading-snug">
                            {t.name}
                          </span>
                          <span className="text-zinc-500 text-xs truncate">{t.artist}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Quiet close affordance ────────────────────────────────── */}
              <div className="flex-shrink-0 flex justify-end px-6 py-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <button
                  onClick={() => {
                    setSelected(null); setSelectedSubgenre(null); selectedSubgenreRef.current = null;
                    setZoomSubgenre(null); zoomSubgenreRef.current = null; autoSelectedRef.current = false;
                  }}
                  className="text-zinc-700 hover:text-zinc-400 text-xs transition-colors"
                >
                  close ✕
                </button>
              </div>
            </>
          ) : (
            /* ── Overview state: world summary ───────────────────────────── */
            <>
              <div className="flex-shrink-0 px-7 pt-6 pb-4">
                <p className="text-xs tracking-widest uppercase mb-2"
                  style={{ color: "rgba(255,255,255,0.20)" }}>
                  Your World
                </p>
                <h2 className="text-2xl font-bold text-white leading-tight">All Music</h2>
                <p className="text-zinc-600 text-xs mt-1.5">
                  {Object.values(worlds).reduce((s, c) => s + c, 0)} tracks
                </p>
              </div>

              {/* Separator */}
              <div className="flex-shrink-0 mx-7"
                style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

              {/* Genre list — click any to dive in */}
              <div className="overflow-y-auto flex-1"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
              >
                <div className="flex flex-col pt-1 pb-6">
                  {Object.entries(worlds)
                    .sort(([, a], [, b]) => b - a)
                    .map(([name, count]) => {
                      const color = COLORS[name] ?? "#71717a";
                      return (
                        <div
                          key={name}
                          className="flex items-center gap-4 px-7 py-2.5 cursor-pointer hover:bg-white/[0.025]"
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.035)" }}
                          onClick={() => { autoSelectedRef.current = false; setSelected(name); }}
                        >
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: color }}
                          />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-white text-sm font-medium truncate leading-snug">
                              {name}
                            </span>
                            <span className="text-zinc-500 text-xs">{count} tracks</span>
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </main>
  );
}

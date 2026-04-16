"use client";

import { useEffect, useRef, useState } from "react";
import SphereCanvas from "@/components/SphereCanvas";
import MiniSphere from "@/components/MiniSphere";
import MapVisual from "@/components/MapVisual";

// ── Palette ───────────────────────────────────────────────────────────────────

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

// ── Fallback demo data (used when not authenticated) ─────────────────────────

const DEMO_WORLDS: Record<string, number> = {
  "Rap / Hip-Hop":                  120,
  "R&B / Soul / Funk":               80,
  "Rock / Indie / Alternative":     105,
  "Pop / Dance":                     90,
  "Jazz / Blues":                    42,
  "Electronic / Ambient":            62,
  "Classical / Score / Soundtrack":  30,
  "World / Folk / Regional":         36,
  "Other":                           22,
};

type SubItem = { name: string; count: number };
const DEMO_SUBGENRES: Record<string, SubItem[]> = {
  "Rap / Hip-Hop": [
    { name: "Trap", count: 42 }, { name: "Boom Bap", count: 28 },
    { name: "Drill", count: 18 }, { name: "Lo-Fi Hip-Hop", count: 14 },
    { name: "Conscious Rap", count: 11 }, { name: "Cloud Rap", count: 7 },
  ],
  "R&B / Soul / Funk": [
    { name: "Neo-Soul", count: 31 }, { name: "Contemporary R&B", count: 24 },
    { name: "Funk", count: 14 }, { name: "Classic Soul", count: 11 },
  ],
  "Rock / Indie / Alternative": [
    { name: "Indie Rock", count: 38 }, { name: "Alternative Rock", count: 29 },
    { name: "Post-Rock", count: 16 }, { name: "Shoegaze", count: 13 },
    { name: "Punk", count: 9 },
  ],
  "Pop / Dance": [
    { name: "Synth-Pop", count: 32 }, { name: "Dance-Pop", count: 27 },
    { name: "Electropop", count: 19 }, { name: "K-Pop", count: 12 },
  ],
  "Jazz / Blues": [
    { name: "Jazz Fusion", count: 15 }, { name: "Cool Jazz", count: 12 },
    { name: "Blues Rock", count: 9 }, { name: "Modal Jazz", count: 6 },
  ],
  "Electronic / Ambient": [
    { name: "Ambient", count: 22 }, { name: "House", count: 19 },
    { name: "Techno", count: 13 }, { name: "Downtempo", count: 8 },
  ],
  "Classical / Score / Soundtrack": [
    { name: "Film Score", count: 14 }, { name: "Contemporary Classical", count: 9 },
    { name: "Orchestral", count: 7 },
  ],
  "World / Folk / Regional": [
    { name: "Folk", count: 15 }, { name: "Afrobeats", count: 11 },
    { name: "Latin", count: 10 },
  ],
  "Other": [
    { name: "Singer-Songwriter", count: 12 }, { name: "Experimental", count: 10 },
  ],
};

type TrackItem = { id: string; name: string; artist: string; album?: string | null; blueprintSubgenre: string };
const DEMO_TRACKS: Record<string, TrackItem[]> = {
  "Rap / Hip-Hop": [
    { id: "r1", name: "HUMBLE.", artist: "Kendrick Lamar", blueprintSubgenre: "Conscious Rap" },
    { id: "r2", name: "God's Plan", artist: "Drake", blueprintSubgenre: "Trap" },
    { id: "r3", name: "SICKO MODE", artist: "Travis Scott", blueprintSubgenre: "Trap" },
    { id: "r4", name: "Alright", artist: "Kendrick Lamar", blueprintSubgenre: "Conscious Rap" },
    { id: "r5", name: "New York State of Mind", artist: "Nas", blueprintSubgenre: "Boom Bap" },
    { id: "r6", name: "Otis", artist: "JAY-Z & Kanye West", blueprintSubgenre: "Boom Bap" },
    { id: "r7", name: "Knife Talk", artist: "Drake", blueprintSubgenre: "Drill" },
  ],
  "R&B / Soul / Funk": [
    { id: "s1", name: "Redbone", artist: "Childish Gambino", blueprintSubgenre: "Neo-Soul" },
    { id: "s2", name: "Location", artist: "Khalid", blueprintSubgenre: "Contemporary R&B" },
    { id: "s3", name: "Lovely Day", artist: "Bill Withers", blueprintSubgenre: "Classic Soul" },
    { id: "s4", name: "Superstition", artist: "Stevie Wonder", blueprintSubgenre: "Funk" },
    { id: "s5", name: "The Less I Know the Better", artist: "Tame Impala", blueprintSubgenre: "Neo-Soul" },
  ],
  "Rock / Indie / Alternative": [
    { id: "k1", name: "Mr. Brightside", artist: "The Killers", blueprintSubgenre: "Indie Rock" },
    { id: "k2", name: "Creep", artist: "Radiohead", blueprintSubgenre: "Alternative Rock" },
    { id: "k3", name: "There Is a Light", artist: "The Smiths", blueprintSubgenre: "Indie Rock" },
    { id: "k4", name: "Only in Dreams", artist: "Weezer", blueprintSubgenre: "Alternative Rock" },
    { id: "k5", name: "Sometimes", artist: "My Bloody Valentine", blueprintSubgenre: "Shoegaze" },
  ],
  "Pop / Dance": [
    { id: "p1", name: "Levitating", artist: "Dua Lipa", blueprintSubgenre: "Dance-Pop" },
    { id: "p2", name: "Blinding Lights", artist: "The Weeknd", blueprintSubgenre: "Synth-Pop" },
    { id: "p3", name: "As It Was", artist: "Harry Styles", blueprintSubgenre: "Electropop" },
    { id: "p4", name: "Dynamite", artist: "BTS", blueprintSubgenre: "K-Pop" },
  ],
  "Jazz / Blues": [
    { id: "j1", name: "So What", artist: "Miles Davis", blueprintSubgenre: "Modal Jazz" },
    { id: "j2", name: "Take Five", artist: "Dave Brubeck Quartet", blueprintSubgenre: "Cool Jazz" },
    { id: "j3", name: "Birdland", artist: "Weather Report", blueprintSubgenre: "Jazz Fusion" },
  ],
  "Electronic / Ambient": [
    { id: "e1", name: "Music for Airports", artist: "Brian Eno", blueprintSubgenre: "Ambient" },
    { id: "e2", name: "Around the World", artist: "Daft Punk", blueprintSubgenre: "House" },
    { id: "e3", name: "Windowlicker", artist: "Aphex Twin", blueprintSubgenre: "Downtempo" },
    { id: "e4", name: "Strings of Life", artist: "Derrick May", blueprintSubgenre: "Techno" },
  ],
  "Classical / Score / Soundtrack": [
    { id: "c1", name: "Interstellar Theme", artist: "Hans Zimmer", blueprintSubgenre: "Film Score" },
    { id: "c2", name: "Clair de Lune", artist: "Debussy", blueprintSubgenre: "Contemporary Classical" },
    { id: "c3", name: "Symphony No. 7", artist: "Beethoven", blueprintSubgenre: "Orchestral" },
  ],
  "World / Folk / Regional": [
    { id: "w1", name: "The Times They Are A-Changin'", artist: "Bob Dylan", blueprintSubgenre: "Folk" },
    { id: "w2", name: "Water No Get Enemy", artist: "Fela Kuti", blueprintSubgenre: "Afrobeats" },
    { id: "w3", name: "Oye Como Va", artist: "Santana", blueprintSubgenre: "Latin" },
  ],
  "Other": [
    { id: "o1", name: "Fast Car", artist: "Tracy Chapman", blueprintSubgenre: "Singer-Songwriter" },
    { id: "o2", name: "All I Want", artist: "Joni Mitchell", blueprintSubgenre: "Singer-Songwriter" },
    { id: "o3", name: "Pyramids", artist: "Frank Ocean", blueprintSubgenre: "Experimental" },
  ],
};

// ── Per-platform discovery statements (indexed to COMPANIES order) ───────────

const DISCOVERY = [
  "The result you\u2019d love, but never thought to search for",   // Google
  "The video you\u2019d love, but the algorithm never surfaced",    // TikTok
  "The product you\u2019d love, but never knew existed",            // Amazon
  "The song you\u2019d love, but haven\u2019t heard yet",           // Spotify
  "The video you\u2019d love, but never came across",               // YouTube
  "The answer you\u2019d love, but never knew to ask for",          // ChatGPT
  "The dish you\u2019d love, but haven\u2019t tried yet",           // DoorDash
];

// ── Company showcase data ─────────────────────────────────────────────────────

const COMPANIES = [
  { name: "Google",   accent: "#4285F4", rgb: "66,133,244",  tag: "Search",     hasSearch: true,  hasFeed: false },
  { name: "TikTok",   accent: "#EE1D52", rgb: "238,29,82",   tag: "Video feed", hasSearch: false, hasFeed: true  },
  { name: "Amazon",   accent: "#FF9900", rgb: "255,153,0",   tag: "E-commerce", hasSearch: true,  hasFeed: true  },
  { name: "Spotify",  accent: "#1DB954", rgb: "29,185,84",   tag: "Music",      hasSearch: false, hasFeed: true  },
  { name: "YouTube",  accent: "#FF0000", rgb: "255,0,0",     tag: "Video",      hasSearch: false, hasFeed: true  },
  { name: "ChatGPT",  accent: "#10A37F", rgb: "16,163,127",  tag: "AI",         hasSearch: true,  hasFeed: false },
  { name: "DoorDash", accent: "#FF3008", rgb: "255,48,8",    tag: "Delivery",   hasSearch: true,  hasFeed: true  },
];

// ── Geometry helpers (used by SphereCanvas logic below) ──────────────────────

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

function triCentroid(verts: V3[], [a, b, c]: Tri): V3 {
  return norm3([
    (verts[a][0]+verts[b][0]+verts[c][0])/3,
    (verts[a][1]+verts[b][1]+verts[c][1])/3,
    (verts[a][2]+verts[b][2]+verts[c][2])/3,
  ]);
}

function assignVoronoi(cents: V3[], poles: V3[], bonuses: number[]): number[] {
  return cents.map(c => {
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < poles.length; i++) {
      const cosA = Math.min(1, Math.max(-1, c[0]*poles[i][0]+c[1]*poles[i][1]+c[2]*poles[i][2]));
      const score = Math.acos(cosA) - bonuses[i];
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  });
}

function lloydRelax(cents: V3[], initialPoles: V3[], bonuses: number[], iters: number): { poles: V3[]; region: number[] } {
  let poles = initialPoles.map(p => [...p] as V3);
  let region = assignVoronoi(cents, poles, bonuses);
  for (let t = 0; t < iters; t++) {
    const sum: V3[] = poles.map(() => [0,0,0] as V3);
    const cnt = new Int32Array(poles.length);
    for (let fi = 0; fi < cents.length; fi++) {
      const ri = region[fi];
      sum[ri][0] += cents[fi][0]; sum[ri][1] += cents[fi][1]; sum[ri][2] += cents[fi][2]; cnt[ri]++;
    }
    for (let i = 0; i < poles.length; i++) {
      if (cnt[i] > 0) poles[i] = norm3([sum[i][0]/cnt[i], sum[i][1]/cnt[i], sum[i][2]/cnt[i]]);
    }
    region = assignVoronoi(cents, poles, bonuses);
  }
  return { poles, region };
}

function buildAdjacency(faces: Tri[]): number[][] {
  const edgeMap = new Map<string, number[]>();
  for (let fi = 0; fi < faces.length; fi++) {
    const [a, b, c] = faces[fi];
    for (const [p, q] of [[a,b],[b,c],[c,a]] as [number,number][]) {
      const k = p < q ? `${p}:${q}` : `${q}:${p}`;
      if (!edgeMap.has(k)) edgeMap.set(k, []);
      edgeMap.get(k)!.push(fi);
    }
  }
  const adj: number[][] = Array.from({ length: faces.length }, () => []);
  for (const [, fl] of edgeMap) {
    if (fl.length === 2) { adj[fl[0]].push(fl[1]); adj[fl[1]].push(fl[0]); }
  }
  return adj;
}

function removeIslands(region: number[], adj: number[][], numGenres: number): number[] {
  const result = [...region];
  for (let g = 0; g < numGenres; g++) {
    const members = result.map((r, i) => r === g ? i : -1).filter(i => i >= 0);
    if (!members.length) continue;
    const visited = new Set<number>(), components: number[][] = [];
    for (const seed of members) {
      if (visited.has(seed)) continue;
      const comp: number[] = [], queue = [seed]; visited.add(seed);
      while (queue.length) {
        const fi = queue.shift()!; comp.push(fi);
        for (const ni of adj[fi]) {
          if (!visited.has(ni) && result[ni] === g) { visited.add(ni); queue.push(ni); }
        }
      }
      components.push(comp);
    }
    if (components.length <= 1) continue;
    const largest = components.reduce((a, b) => b.length > a.length ? b : a);
    for (const comp of components) {
      if (comp === largest) continue;
      for (const fi of comp) {
        const votes = new Map<number, number>();
        for (const ni of adj[fi]) { const ng = result[ni]; if (ng !== g) votes.set(ng, (votes.get(ng) ?? 0) + 1); }
        let winner = -1, top = 0;
        for (const [ng, v] of votes) { if (v > top) { top = v; winner = ng; } }
        if (winner >= 0) result[fi] = winner;
      }
    }
  }
  return result;
}

function hexRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Real data (same path as /world — starts empty, filled from API) ─────────
  const [worlds,   setWorlds]   = useState<Record<string, number>>({});
  const [subgenres, setSubgenres] = useState<SubItem[]>([]);
  const [tracks,   setTracks]   = useState<TrackItem[]>([]);
  const [allTracksData, setAllTracksData] = useState<TrackItem[]>([]);

  // ── Genre + subgenre selection ────────────────────────────────────────────
  const [selected,          setSelected]          = useState<string | null>(null);
  const [selectedSubgenre,  setSelectedSubgenre]  = useState<string | null>(null);
  const selectedSubgenreRef = useRef<string | null>(null);
  const [zoomSubgenre,      setZoomSubgenre]      = useState<string | null>(null);
  const zoomSubgenreRef     = useRef<string | null>(null);
  const [hoveredSubgenre,   setHoveredSubgenre]   = useState<string | null>(null);
  const hoveredSubgRef      = useRef<string | null>(null);

  // ── Text visibility — tied to zoom; fades out in explore mode, back in at hero ──
  const [textVisible, setTextVisible] = useState(true);
  const textVisibleRef = useRef(true);

  // ── Company carousel ────────────────────────────────────────────────────────
  const [carouselIdx, setCarouselIdx] = useState(0);

  // ── Interaction refs ──────────────────────────────────────────────────────
  const zoomRef          = useRef(1);
  const subRegionRef     = useRef<Map<number, number>>(new Map());
  const activeSubsRef    = useRef<SubItem[]>([]);
  const subPolesRef      = useRef<{ name: string; pole: V3 }[]>([]);
  const rotRef           = useRef({ x: -0.49, y: -2.29 });
  const dragRef          = useRef({ active: false, lx: 0, ly: 0, moved: false });
  const rafRef           = useRef<number>(0);
  const labelHitsRef     = useRef<{ name: string; subgenre?: string; x1: number; y1: number; x2: number; y2: number }[]>([]);
  const regionPolesRef   = useRef<{ name: string; pole: V3 }[]>([]);
  const hoveredRef       = useRef<{ genre: string; subgenre?: string } | null>(null);
  const autoSelectedRef  = useRef(false);

  // ── Fetch worlds on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/world")
      .then(r => r.json())
      .then(d => { if (d && Object.keys(d).length > 0) setWorlds(d); })
      .catch(() => {});
  }, []);

  // ── Fetch all genre tracks once worlds loads (for stats derivation) ──────
  useEffect(() => {
    const genres = Object.keys(worlds);
    if (genres.length === 0) return;
    Promise.all(
      genres.map(g =>
        fetch(`/api/world/${encodeURIComponent(g)}`)
          .then(r => r.json())
          .then(d => (d?.tracks ?? []) as TrackItem[])
          .catch(() => [] as TrackItem[])
      )
    ).then(arrays => setAllTracksData(arrays.flat()));
  }, [worlds]);

  // ── Fetch tracks + subgenres when genre selected ──────────────────────────
  useEffect(() => {
    hoveredSubgRef.current = null;
    setHoveredSubgenre(null);
    if (!selected) {
      setTracks([]); setSubgenres([]);
      setSelectedSubgenre(null); selectedSubgenreRef.current = null;
      setZoomSubgenre(null);     zoomSubgenreRef.current = null;
      return;
    }
    setSelectedSubgenre(null); selectedSubgenreRef.current = null;
    setZoomSubgenre(null);     zoomSubgenreRef.current = null;

    const enc = encodeURIComponent(selected);
    fetch(`/api/world/${enc}`)
      .then(r => r.json())
      .then(d => setTracks(d?.tracks ?? []))
      .catch(() => setTracks([]));

    fetch(`/api/world/${enc}/subgenres`)
      .then(r => r.json())
      .then(d => setSubgenres(d?.subgenres ?? []))
      .catch(() => setSubgenres([]));
  }, [selected]);

  // ── Auto-rotate company carousel ─────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setCarouselIdx(i => (i + 1) % COMPANIES.length);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  // ── Poll zoomRef → text visibility (reversible) ──────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const visible = zoomRef.current < 1.15;
      if (visible !== textVisibleRef.current) {
        textVisibleRef.current = visible;
        setTextVisible(visible);
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  // ── Poll hoveredRef → hoveredSubgenre state ───────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const newSub = zoomRef.current >= 2.0 ? (hoveredRef.current?.subgenre ?? null) : null;
      if (newSub !== hoveredSubgRef.current) {
        hoveredSubgRef.current = newSub;
        setHoveredSubgenre(newSub);
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  // ── Canvas render loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || Object.keys(worlds).length === 0) return;

    const sync = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);

    const { verts, faces } = buildIcosphere(2);
    const entries = Object.entries(worlds);
    const total   = entries.reduce((s, [, c]) => s + c, 0) || 1;
    const names   = entries.map(([n]) => n);
    const bonuses = entries.map(([, c]) => (Math.PI / 4) * Math.sqrt(c / total));
    const cents   = faces.map(f => triCentroid(verts, f));
    const { region: rawRegion, poles: finalPoles } = lloydRelax(cents, fiboPoles(names.length), bonuses, 8);
    regionPolesRef.current = names.map((n, i) => ({ name: n, pole: finalPoles[i] }));
    const adj    = buildAdjacency(faces);
    const region = removeIslands(rawRegion, adj, names.length);

    // Subgenre BFS — uses the `subgenres` state captured by this effect closure
    subRegionRef.current  = new Map();
    activeSubsRef.current = [];
    subPolesRef.current   = [];
    if (selected !== null && subgenres.length > 0) {
      const selIdx = names.indexOf(selected);
      if (selIdx >= 0) {
        const gfi = faces.map((_, i) => i).filter(i => region[i] === selIdx);
        if (gfi.length > 0) {
          const maxSubs = Math.max(1, Math.floor(gfi.length / 3));
          const actSubs = subgenres.slice(0, maxSubs);
          activeSubsRef.current = actSubs;
          const n = actSubs.length;
          const gfiSet = new Set(gfi);
          const subAdj = new Map<number, number[]>(gfi.map(fi => [fi, adj[fi].filter(ni => gfiSet.has(ni))]));
          const subTotal = actSubs.reduce((s, sg) => s + sg.count, 0) || 1;
          const targets  = actSubs.map(sg => Math.max(1, Math.round((sg.count / subTotal) * gfi.length)));
          const tSum = targets.reduce((s, t) => s + t, 0);
          let surplus = gfi.length - tSum;
          if (surplus > 0) { for (let i = 0; surplus > 0; i = (i+1)%n) { targets[i]++; surplus--; } }
          else if (surplus < 0) { for (let i = n-1; surplus < 0; i = ((i-1)+n)%n) { if (targets[i]>1){targets[i]--;surplus++;} } }

          let psx=0, psy=0, psz=0;
          for (const fi of gfi) { psx+=cents[fi][0]; psy+=cents[fi][1]; psz+=cents[fi][2]; }
          psx/=gfi.length; psy/=gfi.length; psz/=gfi.length;
          let firstSeed=gfi[0], bestCentDot=-Infinity;
          for (const fi of gfi) {
            const d = cents[fi][0]*psx+cents[fi][1]*psy+cents[fi][2]*psz;
            if (d>bestCentDot){bestCentDot=d;firstSeed=fi;}
          }
          const seedFaces=[firstSeed];
          const minDist=new Float32Array(gfi.length).fill(Infinity);
          const updateDists=(seedFi: number)=>{
            const [sx,sy,sz]=cents[seedFi];
            for (let j=0;j<gfi.length;j++){
              const [fx,fy,fz]=cents[gfi[j]];
              const dot=Math.min(1,Math.max(-1,fx*sx+fy*sy+fz*sz));
              const d=Math.acos(dot); if(d<minDist[j])minDist[j]=d;
            }
          };
          updateDists(firstSeed);
          for (let s=1;s<n;s++){
            let farthestJ=0;
            for (let j=1;j<gfi.length;j++){if(minDist[j]>minDist[farthestJ])farthestJ=j;}
            seedFaces.push(gfi[farthestJ]); updateDists(gfi[farthestJ]);
          }
          const assignment=new Map<number,number>();
          const frontiers: number[][]=Array.from({length:n},()=>[]);
          const regionCounts=new Array<number>(n).fill(0);
          for (let i=0;i<n;i++){assignment.set(seedFaces[i],i);frontiers[i].push(seedFaces[i]);regionCounts[i]=1;}
          let totalAssigned=n;
          while (totalAssigned<gfi.length){
            let grewAny=false;
            for (let i=0;i<n;i++){
              if(regionCounts[i]>=targets[i]||frontiers[i].length===0)continue;
              let found=false;
              while(frontiers[i].length>0&&!found){
                const fi2=frontiers[i][0]; let claimedOne=false;
                for (const ni of (subAdj.get(fi2)??[])){
                  if(!assignment.has(ni)){
                    assignment.set(ni,i);regionCounts[i]++;totalAssigned++;
                    frontiers[i].push(ni);claimedOne=true;found=true;grewAny=true;break;
                  }
                }
                if(!claimedOne)frontiers[i].shift();
              }
            }
            if(!grewAny)break;
          }
          let mopping=true;
          while(mopping){mopping=false;for(const fi of gfi){if(assignment.has(fi))continue;for(const ni of(subAdj.get(fi)??[])){if(assignment.has(ni)){assignment.set(fi,assignment.get(ni)!);mopping=true;break;}}}}
          for(const fi of gfi){if(!assignment.has(fi))assignment.set(fi,0);}
          subRegionRef.current=assignment;
          const poleAcc: V3[]=Array.from({length:n},()=>[0,0,0] as V3);
          const poleCnt=new Int32Array(n);
          for(const [fi2,si] of assignment){poleAcc[si][0]+=cents[fi2][0];poleAcc[si][1]+=cents[fi2][1];poleAcc[si][2]+=cents[fi2][2];poleCnt[si]++;}
          subPolesRef.current=actSubs.map((sub,i)=>({name:sub.name,pole:poleCnt[i]>0?norm3([poleAcc[i][0]/poleCnt[i],poleAcc[i][1]/poleCnt[i],poleAcc[i][2]/poleCnt[i]]):cents[seedFaces[i]]}));
        }
      }
    }

    const rgbMap: [number,number,number][] = names.map(n => hexRgb(COLORS[n] ?? "#71717a"));
    const FOV = 900;

    function drawFrame() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const W = canvas.width;
      const H = canvas.height;
      if (!W || !H) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const R   = Math.min(W, H) * 0.34 * zoomRef.current;
      const cx  = W / 2, cy = H / 2;
      const rx  = rotRef.current.x, ry = rotRef.current.y;
      labelHitsRef.current = [];
      ctx.clearRect(0, 0, W, H);

      const atmo = ctx.createRadialGradient(cx, cy, R*0.82, cx, cy, R*1.22);
      atmo.addColorStop(0, "rgba(70,70,180,0.13)");
      atmo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(cx, cy, R*1.22, 0, Math.PI*2);
      ctx.fillStyle = atmo; ctx.fill();

      const pv = verts.map(([x, y, z]) => {
        const x1=x*Math.cos(ry)+z*Math.sin(ry), z1=-x*Math.sin(ry)+z*Math.cos(ry);
        const y2=y*Math.cos(rx)-z1*Math.sin(rx), z2=y*Math.sin(rx)+z1*Math.cos(rx);
        const s = FOV/(FOV+z2);
        return { sx: cx+x1*R*s, sy: cy+y2*R*s, z: z2 };
      });

      const fd = faces.map((tri, i) => ({
        tri, fi: i, depth: (pv[tri[0]].z+pv[tri[1]].z+pv[tri[2]].z)/3, ri: region[i],
      })).sort((a, b) => a.depth - b.depth);

      const selectedIdx    = selected !== null ? names.indexOf(selected) : -1;
      const hoveredGenre   = hoveredRef.current?.genre ?? null;
      const hoveredSubName = hoveredRef.current?.subgenre ?? null;
      const hoveredIdx     = hoveredGenre !== null ? names.indexOf(hoveredGenre) : -1;
      const subgReveal     = Math.min(1, Math.max(0, (zoomRef.current - 1.6) / 0.5));

      for (const { tri, fi, depth, ri } of fd) {
        const [ia, ib, ic] = tri;
        const isFront        = depth >= 0;
        const isSelected     = ri === selectedIdx;
        const isHoveredGenre = ri === hoveredIdx && !isSelected;
        const subIdx  = isSelected && zoomRef.current >= 1.6 ? subRegionRef.current.get(fi) : undefined;
        const showSub = subIdx !== undefined;
        const subName      = showSub ? activeSubsRef.current[subIdx!]?.name : undefined;
        const isHoveredSub = showSub && !!subName && subName === hoveredSubName;
        const isClickedSub = showSub && !!subName && subName === selectedSubgenreRef.current;
        const siblingHov   = showSub && !!hoveredSubName && !isHoveredSub;
        let [r, g, b] = rgbMap[ri];
        if (showSub) { const sc=0.55; r=Math.round(r*sc); g=Math.round(g*sc); b=Math.round(b*sc); }

        ctx.beginPath();
        ctx.moveTo(pv[ia].sx, pv[ia].sy);
        ctx.lineTo(pv[ib].sx, pv[ib].sy);
        ctx.lineTo(pv[ic].sx, pv[ic].sy);
        ctx.closePath();

        if (isFront) {
          const hasSel = selectedIdx >= 0;
          const fillAlpha = isClickedSub  ? 0.52*subgReveal
            : isHoveredSub               ? 0.35*subgReveal
            : siblingHov                 ? 0.06*subgReveal
            : showSub                    ? 0.08*subgReveal
            : isSelected                 ? 0.28
            : isHoveredGenre             ? 0.15
            : hasSel                     ? 0.015 : 0.02;
          ctx.fillStyle = `rgba(${r},${g},${b},${fillAlpha})`; ctx.fill();
          const edgeAlpha = isClickedSub  ? 0.90*subgReveal
            : isHoveredSub               ? 0.65*subgReveal
            : siblingHov                 ? 0.03*subgReveal
            : showSub                    ? 0.05*subgReveal
            : isSelected                 ? 1.0
            : isHoveredGenre             ? 0.95
            : hasSel                     ? 0.60 : 0.82;
          ctx.strokeStyle = `rgba(${r},${g},${b},${edgeAlpha})`;
          ctx.lineWidth   = isClickedSub ? 0.70 : isHoveredSub ? 0.55 : showSub ? 0.30
            : isSelected ? 1.4 : isHoveredGenre ? 1.2 : hasSel ? 0.75 : 0.9;
          ctx.stroke();
        } else {
          const t = Math.max(0, (depth+0.8)/0.8) * 0.13;
          ctx.strokeStyle = `rgba(${r},${g},${b},${t.toFixed(3)})`; ctx.lineWidth=0.4; ctx.stroke();
        }
      }

      // Level 2: subgenre boundary edges
      if (zoomRef.current >= 1.6 && selectedIdx >= 0 && subRegionRef.current.size > 0) {
        const [br,bg,bb] = rgbMap[selectedIdx];
        ctx.save();
        ctx.shadowColor = `rgba(${br},${bg},${bb},${(0.55*subgReveal).toFixed(3)})`;
        ctx.shadowBlur  = 5;
        ctx.strokeStyle = `rgba(${br},${bg},${bb},${(0.82*subgReveal).toFixed(3)})`;
        ctx.lineWidth=1.6; ctx.lineCap="round";
        const drawnEdges=new Set<string>();
        for (const {fi, depth, ri} of fd) {
          if (ri!==selectedIdx||depth<0) continue;
          const siA=subRegionRef.current.get(fi); if(siA===undefined)continue;
          for (const ni of adj[fi]) {
            const siB=subRegionRef.current.get(ni); if(siB===undefined||siB===siA)continue;
            const fv=faces[fi],nv=faces[ni];
            const shared=fv.filter(v=>nv.includes(v)); if(shared.length!==2)continue;
            const key=shared[0]<shared[1]?`${shared[0]}:${shared[1]}`:`${shared[1]}:${shared[0]}`;
            if(drawnEdges.has(key))continue; drawnEdges.add(key);
            ctx.beginPath(); ctx.moveTo(pv[shared[0]].sx,pv[shared[0]].sy);
            ctx.lineTo(pv[shared[1]].sx,pv[shared[1]].sy); ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Level 1: genre plate boundary
      if (selectedIdx >= 0) {
        const [pr,pg,pb] = rgbMap[selectedIdx];
        ctx.save();
        ctx.shadowColor=`rgba(${pr},${pg},${pb},0.85)`; ctx.shadowBlur=10;
        ctx.strokeStyle=`rgba(${pr},${pg},${pb},1.0)`; ctx.lineWidth=3.0; ctx.lineCap="round";
        const drawnPlate=new Set<string>();
        for (const {fi,depth,ri} of fd) {
          if(ri!==selectedIdx||depth<0)continue;
          for (const ni of adj[fi]) {
            if(region[ni]===selectedIdx)continue;
            const fv=faces[fi],nv=faces[ni];
            const shared=fv.filter(v=>nv.includes(v)); if(shared.length!==2)continue;
            const key=shared[0]<shared[1]?`${shared[0]}:${shared[1]}`:`${shared[1]}:${shared[0]}`;
            if(drawnPlate.has(key))continue; drawnPlate.add(key);
            ctx.beginPath(); ctx.moveTo(pv[shared[0]].sx,pv[shared[0]].sy);
            ctx.lineTo(pv[shared[1]].sx,pv[shared[1]].sy); ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Genre labels
      const acc: Record<number,{sx:number;sy:number;n:number}> = {};
      for (const {tri,depth,ri} of fd) {
        if(depth<0)continue;
        const [ia,ib,ic]=tri;
        const lx=(pv[ia].sx+pv[ib].sx+pv[ic].sx)/3, ly=(pv[ia].sy+pv[ib].sy+pv[ic].sy)/3;
        if(!acc[ri])acc[ri]={sx:0,sy:0,n:0}; acc[ri].sx+=lx;acc[ri].sy+=ly;acc[ri].n++;
      }
      ctx.textAlign="center"; ctx.textBaseline="middle";
      for (const [riStr,a] of Object.entries(acc)) {
        if(a.n<4)continue;
        const ri=Number(riStr);
        const isSelG=ri===selectedIdx;
        const rawLx=a.sx/a.n, rawLy=a.sy/a.n;
        const lx=isSelG?Math.max(80,Math.min(W-80,rawLx)):rawLx;
        const ly=isSelG?Math.max(24,Math.min(H*0.88,rawLy)):rawLy;
        const name=names[ri];
        const [r,g,b]=rgbMap[ri];
        const isThisHov=ri===hoveredIdx;
        const labelDim=isSelG||isThisHov?1.0:selectedIdx>=0?0.50:1.0;
        const fs=isSelG?15:13;
        ctx.globalAlpha=labelDim;
        ctx.font=`700 ${fs}px system-ui, sans-serif`;
        const tw=ctx.measureText(name).width, pad=8, rad=8;
        const bx=lx-tw/2-pad, by=ly-fs/2-pad, bw=tw+pad*2, bh=fs+pad*2;
        ctx.save();
        ctx.shadowColor="rgba(0,0,0,0.75)"; ctx.shadowBlur=14;
        ctx.fillStyle=isSelG?"rgba(8,8,16,0.90)":"rgba(8,8,16,0.72)";
        ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,rad); ctx.fill();
        ctx.restore();
        if(isSelG){
          ctx.strokeStyle=`rgba(${r},${g},${b},0.7)`;ctx.lineWidth=1;
          ctx.beginPath();ctx.roundRect(bx,by,bw,bh,rad);ctx.stroke();
        }
        ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillText(name,lx,ly);
        ctx.globalAlpha=1.0;
        labelHitsRef.current.push({name,x1:bx,y1:by,x2:bx+bw,y2:by+bh});
      }

      // Subgenre labels
      if (zoomRef.current >= 1.9 && selectedIdx >= 0 && activeSubsRef.current.length > 0) {
        const labelReveal=Math.min(1,Math.max(0,(zoomRef.current-1.9)/0.2));
        ctx.globalAlpha=labelReveal;
        const subAcc: Record<number,{sx:number;sy:number;n:number}> = {};
        for (const {tri,fi,depth,ri} of fd) {
          if(ri!==selectedIdx||depth<0)continue;
          const si=subRegionRef.current.get(fi); if(si===undefined)continue;
          const [ia,ib,ic]=tri;
          const lx=(pv[ia].sx+pv[ib].sx+pv[ic].sx)/3, ly=(pv[ia].sy+pv[ib].sy+pv[ic].sy)/3;
          if(!subAcc[si])subAcc[si]={sx:0,sy:0,n:0}; subAcc[si].sx+=lx;subAcc[si].sy+=ly;subAcc[si].n++;
        }
        for (const [siStr,a] of Object.entries(subAcc)) {
          if(a.n<2)continue;
          const si=Number(siStr), sub=activeSubsRef.current[si]; if(!sub)continue;
          const lx=a.sx/a.n, ly=a.sy/a.n;
          const n2=activeSubsRef.current.length;
          const t2=n2>1?1-si/(n2-1):0.5;
          const scale2=0.45+0.55*t2;
          const [pr,pg,pb]=rgbMap[selectedIdx];
          const cr=Math.round(pr*scale2),cg=Math.round(pg*scale2),cb=Math.round(pb*scale2);
          const isActiveSub=selectedSubgenreRef.current===sub.name;
          const isHovSub=hoveredSubName===sub.name;
          const subLit=isActiveSub||isHovSub;
          const fs2=subLit?12:11;
          ctx.font=`${subLit?700:600} ${fs2}px system-ui, sans-serif`;
          const tw2=ctx.measureText(sub.name).width,pad2=6,rad2=6;
          const bx2=lx-tw2/2-pad2,by2=ly-fs2/2-pad2,bw2=tw2+pad2*2,bh2=fs2+pad2*2;
          ctx.save();
          ctx.shadowColor=isHovSub?`rgba(${cr},${cg},${cb},0.45)`:"rgba(0,0,0,0.55)";
          ctx.shadowBlur=isHovSub?12:8;
          ctx.fillStyle=isActiveSub?`rgba(${cr},${cg},${cb},0.18)`:isHovSub?`rgba(${cr},${cg},${cb},0.12)`:"rgba(8,8,16,0.60)";
          ctx.beginPath();ctx.roundRect(bx2,by2,bw2,bh2,rad2);ctx.fill();
          ctx.restore();
          if(isActiveSub){
            ctx.strokeStyle=`rgba(${cr},${cg},${cb},1.0)`;ctx.lineWidth=1.5;
            ctx.beginPath();ctx.roundRect(bx2,by2,bw2,bh2,rad2);ctx.stroke();
          } else if(isHovSub){
            ctx.strokeStyle=`rgba(${cr},${cg},${cb},0.60)`;ctx.lineWidth=1.0;
            ctx.beginPath();ctx.roundRect(bx2,by2,bw2,bh2,rad2);ctx.stroke();
          }
          ctx.fillStyle=isHovSub?`rgb(${cr},${cg},${cb})`:`rgba(${cr},${cg},${cb},0.80)`;
          ctx.fillText(sub.name,lx,ly);
          labelHitsRef.current.push({name:selected!,subgenre:sub.name,x1:bx2,y1:by2,x2:bx2+bw2,y2:by2+bh2});
        }
        ctx.globalAlpha=1.0;
      }
      ctx.textBaseline="alphabetic";
    }

    // ── Wheel handler: only capture when pointer is inside the sphere circle ──
    // Outside the sphere, let the wheel event propagate so the page can scroll.
    const onWheel = (e: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const W    = canvas.clientWidth, H = canvas.clientHeight;
      const R    = Math.min(W, H) * 0.34 * zoomRef.current;
      const dx   = mx - W / 2, dy = my - H / 2;
      // Outside sphere circle → don't capture, let page scroll naturally
      if (dx * dx + dy * dy > R * R) return;
      // Hero state guard: genre selected, OR meaningfully zoomed in → explore mode (capture).
      // Otherwise (nothing selected, near-default zoom) only block scroll-down (page-scroll intent);
      // scroll-up over the sphere is still the entry point for zooming in.
      const inExploreMode = selected !== null || zoomRef.current > 1.05;
      if (!inExploreMode && e.deltaY > 0) return;

      e.preventDefault();

      const prevZoom = zoomRef.current;
      zoomRef.current = Math.max(0.5, Math.min(5, prevZoom * (1 - e.deltaY * 0.004)));
      const newZoom   = zoomRef.current;

      if (newZoom >= 1.2 && selected === null && regionPolesRef.current.length > 0) {
        const rx = rotRef.current.x, ry = rotRef.current.y;
        let bestName = regionPolesRef.current[0].name, bestZ = -Infinity;
        for (const { name, pole: [px, py, pz] } of regionPolesRef.current) {
          const z2 = py*Math.sin(rx) + (-px*Math.sin(ry) + pz*Math.cos(ry))*Math.cos(rx);
          if (z2 > bestZ) { bestZ = z2; bestName = name; }
        }
        autoSelectedRef.current = true;
        setSelected(bestName);
      }

      if (newZoom >= 2.0 && subPolesRef.current.length > 0) {
        const rx2 = rotRef.current.x, ry2 = rotRef.current.y;
        let bestSubName = subPolesRef.current[0].name, bestSubZ = -Infinity;
        for (const { name, pole: [px, py, pz] } of subPolesRef.current) {
          const z2 = py*Math.sin(rx2) + (-px*Math.sin(ry2) + pz*Math.cos(ry2))*Math.cos(rx2);
          if (z2 > bestSubZ) { bestSubZ = z2; bestSubName = name; }
        }
        if (zoomSubgenreRef.current !== bestSubName) { zoomSubgenreRef.current = bestSubName; setZoomSubgenre(bestSubName); }
      } else if (newZoom < 2.0) {
        if (zoomSubgenreRef.current !== null) { zoomSubgenreRef.current = null; setZoomSubgenre(null); }
        if (selectedSubgenreRef.current !== null) { selectedSubgenreRef.current = null; setSelectedSubgenre(null); }
      }

      if (newZoom < 1.1 && selected !== null) {
        autoSelectedRef.current = false;
        selectedSubgenreRef.current = null; setSelectedSubgenre(null);
        zoomSubgenreRef.current = null; setZoomSubgenre(null);
        setSelected(null);
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    function animate() { drawFrame(); rafRef.current = requestAnimationFrame(animate); }
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worlds, selected, subgenres]);

  // ── Mouse handlers ────────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY, moved: false };
  };

  const hitTestSphere = (mx: number, my: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || regionPolesRef.current.length === 0) return null;
    const W=canvas.clientWidth, H=canvas.clientHeight;
    const R=Math.min(W,H)*0.38*zoomRef.current;
    const cx=W/2, cy=H/2;
    const nx=(mx-cx)/R, ny=(my-cy)/R;
    if (nx*nx+ny*ny > 1) return null;
    const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const rx=rotRef.current.x, ry=rotRef.current.y;
    const y_w=ny*Math.cos(rx)+nz*Math.sin(rx);
    const z1=-ny*Math.sin(rx)+nz*Math.cos(rx);
    const x_w=nx*Math.cos(ry)-z1*Math.sin(ry);
    const z_w=nx*Math.sin(ry)+z1*Math.cos(ry);
    let best=regionPolesRef.current[0], bestDot=-Infinity;
    for (const rd of regionPolesRef.current) {
      const d=rd.pole[0]*x_w+rd.pole[1]*y_w+rd.pole[2]*z_w;
      if (d>bestDot){bestDot=d;best=rd;}
    }
    return best.name;
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      rotRef.current.y += (e.clientX-dragRef.current.lx)*0.005;
      rotRef.current.x -= (e.clientY-dragRef.current.ly)*0.005;
      rotRef.current.x  = Math.max(-1.2, Math.min(1.2, rotRef.current.x));
      dragRef.current.lx=e.clientX; dragRef.current.ly=e.clientY; dragRef.current.moved=true;
      hoveredRef.current=null;
      if (selected !== null && zoomRef.current >= 1.1 && regionPolesRef.current.length > 0) {
        const selEntry = regionPolesRef.current.find(r => r.name === selected);
        if (selEntry) {
          const [px,py,pz]=selEntry.pole;
          const drx=rotRef.current.x, dry=rotRef.current.y;
          const sz2=py*Math.sin(drx)+(-px*Math.sin(dry)+pz*Math.cos(dry))*Math.cos(drx);
          if (sz2 < 0) {
            autoSelectedRef.current=false;
            selectedSubgenreRef.current=null; setSelectedSubgenre(null);
            zoomSubgenreRef.current=null; setZoomSubgenre(null);
            setSelected(null);
          }
        }
      }
      return;
    }
    const canvas=canvasRef.current; if(!canvas)return;
    const rect=canvas.getBoundingClientRect();
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    for (const h of labelHitsRef.current) {
      if (mx>=h.x1&&mx<=h.x2&&my>=h.y1&&my<=h.y2) {
        hoveredRef.current=h.subgenre?{genre:h.name,subgenre:h.subgenre}:{genre:h.name}; return;
      }
    }
    const genreName=hitTestSphere(mx,my);
    if (!genreName){hoveredRef.current=null;return;}
    if (selected!==null&&zoomRef.current>=2.0&&genreName===selected&&subPolesRef.current.length>0) {
      const canvas2=canvasRef.current!;
      const W2=canvas2.clientWidth, H2=canvas2.clientHeight;
      const R2=Math.min(W2,H2)*0.38*zoomRef.current;
      const nx2=(mx-W2/2)/R2, ny2=(my-H2/2)/R2;
      if (nx2*nx2+ny2*ny2<=1) {
        const nz2=Math.sqrt(Math.max(0,1-nx2*nx2-ny2*ny2));
        const rx2=rotRef.current.x, ry2=rotRef.current.y;
        const y_w=ny2*Math.cos(rx2)+nz2*Math.sin(rx2);
        const z1=-ny2*Math.sin(rx2)+nz2*Math.cos(rx2);
        const x_w=nx2*Math.cos(ry2)-z1*Math.sin(ry2);
        const z_w=nx2*Math.sin(ry2)+z1*Math.cos(ry2);
        let bestSub=subPolesRef.current[0], bestDot=-Infinity;
        for (const sp of subPolesRef.current){const d=sp.pole[0]*x_w+sp.pole[1]*y_w+sp.pole[2]*z_w;if(d>bestDot){bestDot=d;bestSub=sp;}}
        hoveredRef.current={genre:genreName,subgenre:bestSub.name}; return;
      }
    }
    hoveredRef.current={genre:genreName};
  };

  const stopDrag   = () => { dragRef.current.active = false; };
  const onMouseLeave = () => { dragRef.current.active = false; hoveredRef.current = null; };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.moved) return;
    const canvas=canvasRef.current!;
    const rect=canvas.getBoundingClientRect();
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    for (const h of labelHitsRef.current) {
      if (mx>=h.x1&&mx<=h.x2&&my>=h.y1&&my<=h.y2) {
        if (h.subgenre) {
          const next=selectedSubgenreRef.current===h.subgenre?null:h.subgenre;
          selectedSubgenreRef.current=next; setSelectedSubgenre(next);
        } else {
          autoSelectedRef.current=false;
          selectedSubgenreRef.current=null; setSelectedSubgenre(null);
          zoomSubgenreRef.current=null; setZoomSubgenre(null);
          setSelected(prev=>prev===h.name?null:h.name);
        }
        return;
      }
    }
    const W=canvas.clientWidth, H=canvas.clientHeight;
    const R=Math.min(W,H)*0.38*zoomRef.current;
    const cx=W/2, cy=H/2;
    const nx=(mx-cx)/R, ny=(my-cy)/R;
    if (nx*nx+ny*ny > 1) {
      autoSelectedRef.current=false;
      selectedSubgenreRef.current=null; setSelectedSubgenre(null);
      zoomSubgenreRef.current=null; setZoomSubgenre(null);
      setSelected(null); return;
    }
    const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const rx=rotRef.current.x, ry=rotRef.current.y;
    const y_w=ny*Math.cos(rx)+nz*Math.sin(rx);
    const z1=-ny*Math.sin(rx)+nz*Math.cos(rx);
    const x_w=nx*Math.cos(ry)-z1*Math.sin(ry);
    const z_w=nx*Math.sin(ry)+z1*Math.cos(ry);
    if (regionPolesRef.current.length===0) return;
    let best=regionPolesRef.current[0], bestDot=-Infinity;
    for (const rd of regionPolesRef.current){const d=rd.pole[0]*x_w+rd.pole[1]*y_w+rd.pole[2]*z_w;if(d>bestDot){bestDot=d;best=rd;}}
    if (selected!==null&&zoomRef.current>=2.0&&best.name===selected&&subPolesRef.current.length>0) {
      let bestSub=subPolesRef.current[0], bestSubDot=-Infinity;
      for (const sp of subPolesRef.current){const d=sp.pole[0]*x_w+sp.pole[1]*y_w+sp.pole[2]*z_w;if(d>bestSubDot){bestSubDot=d;bestSub=sp;}}
      const next=selectedSubgenreRef.current===bestSub.name?null:bestSub.name;
      selectedSubgenreRef.current=next; setSelectedSubgenre(next); return;
    }
    autoSelectedRef.current=false;
    selectedSubgenreRef.current=null; setSelectedSubgenre(null);
    zoomSubgenreRef.current=null; setZoomSubgenre(null);
    setSelected(prev=>prev===best.name?null:best.name);
  };

  // ── Derived display values ────────────────────────────────────────────────
  const totalTrackCount    = Object.values(worlds).reduce((s, c) => s + c, 0);
  const totalGenreCount    = Object.keys(worlds).length;
  const totalArtistCount   = new Set(allTracksData.map(t => t.artist)).size;
  const totalSubgenreCount = new Set(allTracksData.map(t => t.blueprintSubgenre).filter(Boolean)).size;
  const selectedColor   = selected ? (COLORS[selected] ?? "#ffffff") : "#ffffff";
  const [sr, sg, sb]    = selected ? hexRgb(COLORS[selected] ?? "#ffffff") : [255, 255, 255];
  const focusedSubgenre = hoveredSubgenre ?? selectedSubgenre ?? zoomSubgenre;
  const displayedTracks = focusedSubgenre ? tracks.filter(t => t.blueprintSubgenre === focusedSubgenre) : tracks;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-black text-white">

      {/* ══ SECTION 1 — The Constraint ════════════════════════════════════════ */}
      {/* Full-bleed: breaks out of the constrained rail so the canvas/sphere
          fill the full viewport width. Works because the rail is centered with
          flex justify-center, so 50% of the section = 50vw exactly.           */}
      <section
        className="h-screen overflow-hidden flex flex-col"
        style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}
      >

        {/* Wordmark */}
        <div className="flex-shrink-0 flex items-center px-6 py-2.5 z-20 relative">
          <span className="text-xs tracking-widest uppercase text-zinc-700 font-medium select-none">
            Blueprint
          </span>
        </div>

        {/* Canvas area — fills remaining viewport, sphere centered within */}
        <div className="flex-1 relative min-h-0">

          {/* Canvas — fills entire area, sphere always centered */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-pointer"
            style={{ display: "block", transform: "translateY(-3%)" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={stopDrag}
            onMouseLeave={onMouseLeave}
            onClick={handleClick}
          />

          {/* Top-left: Headline + supporting text */}
          <div
            className="absolute z-10 flex flex-col pointer-events-none"
            style={{
              top: "5%",
              left: "6%",
              opacity: textVisible ? 1 : 0,
              transition: "opacity 0.4s ease-in-out",
            }}
          >
            <h1 className="text-2xl md:text-3xl font-light leading-[1.25] text-white mb-2 max-w-sm">
              This is what a music taste looks like.
            </h1>
            <p className="text-[11px] text-zinc-500 tracking-widest uppercase">
              Zoom. Explore. Discover.
            </p>
          </div>

          {/* Bottom center: Stats row */}
          {totalTrackCount > 0 && (
            <div
              className="absolute bottom-[4vh] right-[6%] z-10 flex flex-row gap-8 pointer-events-none"
              style={{
                opacity: textVisible ? 1 : 0,
                transition: "opacity 0.4s ease-in-out",
              }}
            >
              {[
                { label: "Tracks",    value: totalTrackCount },
                { label: "Artists",   value: totalArtistCount },
                { label: "Genres",    value: totalGenreCount },
                { label: "Subgenres", value: totalSubgenreCount },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center">
                  <span className="text-lg font-light text-white tabular-nums leading-none">
                    {value.toLocaleString()}
                  </span>
                  <span className="text-[10px] tracking-widest uppercase text-zinc-600 mt-1">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Right panel — absolute overlay, does not affect canvas layout */}
          {selected && (
            <div
              className="absolute top-0 right-0 bottom-0 z-20 flex flex-col overflow-hidden"
              style={{
                width: 420,
                borderLeft: `1px solid rgba(${sr},${sg},${sb},0.14)`,
                background: "rgba(4,4,8,0.90)",
                backdropFilter: "blur(12px)",
              }}
            >
              {/* Thin genre-color accent strip */}
              <div className="flex-shrink-0" style={{ height: 2, background: selectedColor, opacity: 0.85 }} />

              {/* Panel header */}
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
                <p className="text-zinc-600 text-xs mt-1.5">{displayedTracks.length} tracks</p>
              </div>

              {/* Subgenre pills */}
              {subgenres.length > 0 && (
                <div className="flex-shrink-0 flex gap-1.5 px-7 pb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {subgenres.map(sub => {
                    const active = selectedSubgenre === sub.name;
                    return (
                      <button
                        key={sub.name}
                        onClick={() => {
                          const next = selectedSubgenre === sub.name ? null : sub.name;
                          setSelectedSubgenre(next); selectedSubgenreRef.current = next;
                        }}
                        className="flex-shrink-0 text-xs px-3 py-1 rounded-full whitespace-nowrap transition-all"
                        style={{
                          background: active ? `rgba(${sr},${sg},${sb},0.18)` : "transparent",
                          color: active ? `rgb(${sr},${sg},${sb})` : "rgba(255,255,255,0.30)",
                          border: `1px solid rgba(${sr},${sg},${sb},${active ? 0.45 : 0.10})`,
                        }}
                      >
                        {sub.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex-shrink-0 mx-7" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

              {/* Track list */}
              <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
                {displayedTracks.length === 0 ? (
                  <p className="text-zinc-700 text-xs px-7 py-8 text-center">No tracks</p>
                ) : (
                  <div className="flex flex-col pt-1 pb-6">
                    {displayedTracks.map((t, idx) => (
                      <div key={t.id} className="flex items-center gap-4 px-7 py-2.5"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.035)" }}>
                        <span className="text-xs font-mono w-5 text-right flex-shrink-0"
                          style={{ color: "rgba(255,255,255,0.13)" }}>
                          {idx + 1}
                        </span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-white text-sm font-medium truncate leading-snug">{t.name}</span>
                          <span className="text-zinc-500 text-xs truncate">{t.artist}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Close */}
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
            </div>
          )}

        </div>

      </section>

      {/* ══ SECTION 2 — The Problem ═══════════════════════════════════════════ */}
      <section className="h-screen bg-black flex overflow-hidden"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>

        {/* ── LEFT: problem copy ──────────────────────────────────────────────── */}
        <div className="flex flex-col justify-between px-12 py-12 overflow-hidden"
          style={{ width: "54%", borderRight: "1px solid rgba(255,255,255,0.05)" }}>

          {/* Top: headline only */}
          <h2 className="text-[2.75rem] font-light leading-tight text-white">
            The modern &ldquo;internet&rdquo;<br />is a single model.
          </h2>

          {/* Middle: body blocks */}
          <div className="space-y-6 leading-relaxed">

            {/* Block 1 — the mechanism */}
            <div className="space-y-0.5 text-[17px] text-white">
              <p className="text-white font-semibold mb-3">Check every app you use.</p>
              <p>1. You type into a search bar</p>
              <p>2. You scroll a recommendation feed</p>
            </div>

            {/* Block 2 — the limits */}
            <div className="space-y-1.5 text-[17px]">
              <p>
                <span className="text-white font-semibold">Search</span>
                <span className="text-zinc-500"> shows you what you already know to look for.</span>
              </p>
              <p>
                <span className="text-white font-semibold">Feeds</span>
                <span className="text-zinc-500">{" "}show what the system predicts — based on what
                you&apos;ve already seen, what people like you have seen, and what companies pay to promote.</span>
              </p>
            </div>

            {/* Echo chamber line */}
            <p className="text-[17px] text-white font-semibold">This puts you in an algorithmic echo chamber.</p>

            {/* Block 3 — the gap */}
            <div className="space-y-1.5 text-[17px]">
              <p className="text-white font-semibold">Entire categories of information never reach you.</p>
              <div className="space-y-0.5 text-zinc-500">
                <p>1. What you don&apos;t know to search for</p>
                <p>2. What exists outside your behavioral profile</p>
                <p>3. What no one is paying to show you</p>
              </div>
            </div>

          </div>

          {/* Bottom: thesis + rotating line */}
          <div className="space-y-2.5 pt-6 border-t border-zinc-900 leading-relaxed">
            <p className="text-[17px] font-semibold text-zinc-200">This isn&apos;t a UX problem. It&apos;s a structural limit.</p>
            <p className="text-[16px] text-zinc-500">
              The modern internet is not designed for discovery. It is designed for engagement.
            </p>
            <p className="text-[19px] text-zinc-300 leading-relaxed font-medium">
              <span
                key={carouselIdx}
                style={{ color: COMPANIES[carouselIdx].accent, transition: "color 0.5s ease-in-out" }}
              >
                {DISCOVERY[carouselIdx]}
              </span>
              {" "}— all already out there. Just never shown to you.
            </p>
          </div>

        </div>

        {/* ── RIGHT: rotating company showcase ─────────────────────────────── */}
        <div className="flex flex-col py-8 px-7 overflow-hidden" style={{ width: "46%" }}>

          <p className="text-[11px] tracking-widest uppercase text-zinc-700 mb-4 select-none flex-shrink-0">
            Different content, same model
          </p>

          {/* Carousel slides */}
          <div className="flex-1 relative min-h-0">
            {COMPANIES.map((co, i) => (
              <div
                key={co.name}
                className="absolute inset-0 flex flex-col"
                style={{
                  opacity: i === carouselIdx ? 1 : 0,
                  transform: `translateY(${i === carouselIdx ? 0 : 8}px)`,
                  transition: "opacity 0.5s ease-in-out, transform 0.5s ease-in-out",
                  pointerEvents: i === carouselIdx ? "auto" : "none",
                }}
              >
                {/* Company label row */}
                <div className="flex items-center gap-2 mb-2.5 flex-shrink-0">
                  <span className="text-[15px] font-medium" style={{ color: co.accent }}>{co.name}</span>
                  <span className="text-[11px] text-zinc-600 tracking-wide">{co.tag}</span>
                  <span className="ml-auto text-[10px] tracking-widest uppercase text-zinc-700">search + feed</span>
                </div>

                {/* Window frame */}
                <div className="flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col"
                  style={{ background: "rgba(12,12,16,0.97)", border: "1px solid rgba(255,255,255,0.09)" }}>

                  {/* Window chrome */}
                  <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: `rgba(${co.rgb},0.55)` }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
                    <div className="flex-1 mx-2 h-4 rounded-md"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }} />
                  </div>

                  {/* Content area — ChatGPT is fully restructured; all others use search + feed */}
                  {co.name === "ChatGPT" ? (

                    /* ── ChatGPT: conversation above, prompt bar at bottom ── */
                    <div className="flex-1 min-h-0 flex flex-col p-3 gap-2 overflow-hidden">

                      {/* Feed label */}
                      <div className="text-[9px] tracking-[0.15em] uppercase font-medium flex-shrink-0"
                        style={{ color: `rgba(${co.rgb},0.55)` }}>feed</div>

                      {/* Conversation feed */}
                      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
                        {/* Assistant turn 1 */}
                        <div className="flex gap-2 items-start flex-shrink-0">
                          <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                            style={{ background: `rgba(${co.rgb},0.3)` }}>
                            <div className="w-2 h-2 rounded-sm" style={{ background: co.accent, opacity: 0.8 }} />
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.11)", width: "94%" }} />
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.08)", width: "80%" }} />
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.06)", width: "88%" }} />
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.05)", width: "52%" }} />
                          </div>
                        </div>
                        {/* User turn */}
                        <div className="flex justify-end flex-shrink-0">
                          <div className="rounded-xl px-3 py-2 space-y-1"
                            style={{ background: "rgba(255,255,255,0.07)", maxWidth: "72%" }}>
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.16)", width: "100%" }} />
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.10)", width: "76%" }} />
                          </div>
                        </div>
                        {/* Assistant turn 2 */}
                        <div className="flex gap-2 items-start flex-shrink-0">
                          <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                            style={{ background: `rgba(${co.rgb},0.3)` }}>
                            <div className="w-2 h-2 rounded-sm" style={{ background: co.accent, opacity: 0.8 }} />
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.11)", width: "90%" }} />
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.08)", width: "97%" }} />
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.06)", width: "68%" }} />
                          </div>
                        </div>
                        {/* User turn 2 */}
                        <div className="flex justify-end flex-shrink-0">
                          <div className="rounded-xl px-3 py-2 space-y-1"
                            style={{ background: "rgba(255,255,255,0.07)", maxWidth: "65%" }}>
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.16)", width: "100%" }} />
                          </div>
                        </div>
                        {/* Assistant turn 3 — typing indicator */}
                        <div className="flex gap-2 items-start flex-shrink-0">
                          <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                            style={{ background: `rgba(${co.rgb},0.3)` }}>
                            <div className="w-2 h-2 rounded-sm" style={{ background: co.accent, opacity: 0.8 }} />
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.11)", width: "85%" }} />
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.08)", width: "72%" }} />
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.06)", width: "91%" }} />
                            <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.05)", width: "44%" }} />
                          </div>
                        </div>
                      </div>

                      {/* Search label */}
                      <div className="text-[9px] tracking-[0.15em] uppercase font-medium flex-shrink-0"
                        style={{ color: `rgba(${co.rgb},0.55)` }}>search</div>

                      {/* Prompt input — pinned to bottom */}
                      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.11)" }}>
                        <div className="flex-1 h-1.5 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
                        <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{ background: `rgba(${co.rgb},0.35)` }}>
                          <div className="w-2 h-2 rounded-sm" style={{ background: co.accent }} />
                        </div>
                      </div>
                    </div>

                  ) : (

                    /* ── All other platforms: search zone + feed zone ── */
                    <div className="flex-1 min-h-0 flex flex-col p-3 gap-0 overflow-hidden">

                      {/* ── SEARCH zone ───────────────────────────────────────── */}
                      <div className="flex-shrink-0 mb-2">
                        <div className="text-[9px] tracking-[0.15em] uppercase mb-1.5 font-medium"
                          style={{ color: `rgba(${co.rgb},0.55)` }}>search</div>

                        {co.name === "Google" ? (
                          /* Google: prominent centered search bar + category tabs */
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full"
                              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                              <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ border: "1.5px solid rgba(255,255,255,0.2)" }} />
                              <div className="flex-1 h-1.5 rounded" style={{ background: "rgba(255,255,255,0.09)" }} />
                              <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.08)" }} />
                              <div className="w-4 h-4 rounded-full" style={{ background: `rgba(${co.rgb},0.3)` }} />
                            </div>
                            <div className="flex gap-3 px-1">
                              {["All","Images","News","Maps","Videos"].map((tab, k) => (
                                <div key={k} className="text-[9px] pb-1" style={{
                                  color: k === 0 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
                                  borderBottom: k === 0 ? `2px solid rgba(${co.rgb},0.8)` : "2px solid transparent",
                                }}>{tab}</div>
                              ))}
                            </div>
                          </div>
                        ) : co.name === "Amazon" ? (
                          /* Amazon: search bar with category selector + orange button */
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-0 rounded overflow-hidden"
                              style={{ border: "1px solid rgba(255,153,0,0.35)" }}>
                              <div className="px-2 py-2 flex-shrink-0 border-r flex items-center"
                                style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.08)", width: 52 }}>
                                <div className="h-1.5 w-full rounded" style={{ background: "rgba(255,255,255,0.12)" }} />
                              </div>
                              <div className="flex-1 flex items-center px-3 py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                                <div className="flex-1 h-1.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
                              </div>
                              <div className="px-3 py-2 flex-shrink-0 flex items-center justify-center"
                                style={{ background: `rgba(${co.rgb},0.5)`, width: 36 }}>
                                <div className="w-3.5 h-3.5 rounded" style={{ background: `rgba(${co.rgb},0.7)` }} />
                              </div>
                            </div>
                            <div className="flex gap-1.5 overflow-hidden">
                              {["Prime","Today's Deals","Electronics","Books"].map((c, k) => (
                                <div key={k} className="px-1.5 py-0.5 rounded text-[8px] whitespace-nowrap flex-shrink-0"
                                  style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}>{c}</div>
                              ))}
                            </div>
                          </div>
                        ) : co.name === "TikTok" ? (
                          /* TikTok: search bar + For You / Following / Live tabs */
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}>
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }} />
                              <div className="flex-1 h-1.5 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
                            </div>
                            <div className="flex gap-4 px-1">
                              {["For You","Following","Live"].map((tab, k) => (
                                <div key={k} className="text-[10px] pb-1 font-medium" style={{
                                  color: k === 0 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.3)",
                                  borderBottom: k === 0 ? "2px solid rgba(238,29,82,0.85)" : "2px solid transparent",
                                }}>{tab}</div>
                              ))}
                            </div>
                          </div>
                        ) : co.name === "Spotify" ? (
                          /* Spotify: search + filter pills */
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}>
                              <div className="w-3 h-3 flex-shrink-0 rounded" style={{ background: "rgba(255,255,255,0.25)" }} />
                              <div className="flex-1 h-1.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
                            </div>
                            <div className="flex gap-1.5">
                              {["Music","Podcasts","Artists","Albums"].map((p, k) => (
                                <div key={k} className="px-2 py-0.5 rounded-full text-[8px]"
                                  style={{
                                    background: k === 0 ? `rgba(${co.rgb},0.22)` : "rgba(255,255,255,0.05)",
                                    color: k === 0 ? co.accent : "rgba(255,255,255,0.35)",
                                    border: `1px solid ${k === 0 ? `rgba(${co.rgb},0.4)` : "rgba(255,255,255,0.07)"}`,
                                  }}>{p}</div>
                              ))}
                            </div>
                          </div>
                        ) : co.name === "YouTube" ? (
                          /* YouTube: search bar + category filter chips */
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-0 rounded-full overflow-hidden"
                              style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)" }}>
                              <div className="flex-1 flex items-center px-4 py-2">
                                <div className="flex-1 h-1.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
                              </div>
                              <div className="w-px h-5 self-center" style={{ background: "rgba(255,255,255,0.08)" }} />
                              <div className="px-3 py-2 flex items-center justify-center flex-shrink-0">
                                <div className="w-3 h-3.5 rounded-t-full" style={{ border: "1.5px solid rgba(255,255,255,0.2)" }} />
                              </div>
                            </div>
                            <div className="flex gap-1.5 overflow-hidden">
                              {["All","Music","Gaming","News","Live"].map((c, k) => (
                                <div key={k} className="px-2 py-0.5 rounded text-[8px] whitespace-nowrap flex-shrink-0"
                                  style={{
                                    background: k === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
                                    color: k === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                                  }}>{c}</div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          /* DoorDash: delivery address + search */
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `rgba(${co.rgb},0.55)` }} />
                              <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.10)", width: "55%" }} />
                              <div className="ml-auto h-1.5 rounded" style={{ background: "rgba(255,255,255,0.06)", width: "18%" }} />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}>
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }} />
                              <div className="flex-1 h-1.5 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── FEED zone ─────────────────────────────────────────── */}
                      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="text-[9px] tracking-[0.15em] uppercase mb-1.5 font-medium flex-shrink-0"
                          style={{ color: `rgba(${co.rgb},0.55)` }}>feed</div>

                        {co.name === "Google" ? (
                          /* Google: SERP — featured snippet + organic results */
                          <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
                            {/* Featured snippet */}
                            <div className="flex-shrink-0 rounded-lg px-2.5 py-2 space-y-1"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                              <div className="h-1.5 rounded" style={{ background: `rgba(${co.rgb},0.4)`, width: "60%" }} />
                              <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.08)", width: "95%" }} />
                              <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.06)", width: "80%" }} />
                            </div>
                            {/* Organic results */}
                            {[{ tw: "70%", sw: "38%", dw: "58%" }, { tw: "55%", sw: "44%", dw: "72%" }, { tw: "78%", sw: "36%", dw: "50%" }, { tw: "63%", sw: "42%", dw: "67%" }].map((row, j) => (
                              <div key={j} className="flex-shrink-0 space-y-0.5">
                                <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.06)", width: row.sw }} />
                                <div className="h-2 rounded" style={{ background: `rgba(${co.rgb},0.38)`, width: row.tw }} />
                                <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.05)", width: row.dw }} />
                                <div className="h-1 rounded" style={{ background: "rgba(255,255,255,0.03)", width: "65%" }} />
                              </div>
                            ))}
                            {/* People also ask */}
                            <div className="flex-shrink-0 rounded-lg overflow-hidden"
                              style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                              <div className="px-2.5 py-1 flex-shrink-0"
                                style={{ background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.09)", width: "48%" }} />
                              </div>
                              {[{ w: "68%" }, { w: "74%" }, { w: "60%" }].map((q, k) => (
                                <div key={k} className="px-2.5 py-1.5 flex items-center justify-between"
                                  style={{ borderBottom: k < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                  <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.07)", width: q.w }} />
                                  <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: "rgba(255,255,255,0.09)" }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : co.name === "Amazon" ? (
                          /* Amazon: dense ecommerce product grid — 2 rows of 4 */
                          <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
                            <div className="text-[9px] text-zinc-600 flex-shrink-0">Deals related to your search</div>
                            {[0, 1].map(row => (
                              <div key={row} className="flex gap-1.5 flex-1 min-h-0 overflow-hidden">
                                {[0,1,2,3].map(j => (
                                  <div key={j} className="flex flex-col flex-1 min-w-0 rounded overflow-hidden"
                                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                    <div className="flex-1" style={{ background: `rgba(255,255,255,${0.04 + (row*4+j)*0.005})` }} />
                                    <div className="px-1 py-1 space-y-0.5 flex-shrink-0">
                                      <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.10)", width: "92%" }} />
                                      <div className="h-1.5 rounded" style={{ background: `rgba(${co.rgb},0.35)`, width: "55%" }} />
                                      <div className="h-1 rounded" style={{ background: "rgba(255,255,255,0.05)", width: "70%" }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        ) : co.name === "TikTok" ? (
                          /* TikTok: single dominant fullscreen-style vertical video */
                          <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden"
                            style={{ background: "rgba(255,255,255,0.04)" }}>
                            {/* Video bg gradient */}
                            <div className="absolute inset-0" style={{
                              background: `linear-gradient(180deg, transparent 40%, rgba(${co.rgb},0.12) 100%)` }} />
                            {/* Play icon */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                                style={{ background: "rgba(255,255,255,0.08)" }}>
                                <div style={{ width: 0, height: 0, borderTop: "7px solid transparent",
                                  borderBottom: "7px solid transparent",
                                  borderLeft: "12px solid rgba(255,255,255,0.5)",
                                  marginLeft: 3 }} />
                              </div>
                            </div>
                            {/* Right action bar */}
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-3">
                              {["❤","💬","↗"].map((ic, k) => (
                                <div key={k} className="w-7 h-7 rounded-full flex items-center justify-center"
                                  style={{ background: "rgba(255,255,255,0.08)" }}>
                                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{ic}</div>
                                </div>
                              ))}
                            </div>
                            {/* Bottom text overlay */}
                            <div className="absolute bottom-0 left-0 right-8 p-2.5 space-y-1">
                              <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.4)", width: "70%" }} />
                              <div className="h-1 rounded" style={{ background: "rgba(255,255,255,0.25)", width: "50%" }} />
                              {/* Progress bar */}
                              <div className="h-0.5 rounded-full mt-1.5" style={{ background: "rgba(255,255,255,0.15)" }}>
                                <div className="h-full rounded-full" style={{ background: `rgba(${co.rgb},0.9)`, width: "38%" }} />
                              </div>
                            </div>
                          </div>
                        ) : co.name === "Spotify" ? (
                          /* Spotify: multi-section music feed */
                          <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
                            {/* Recently played row */}
                            <div className="flex-shrink-0">
                              <div className="text-[9px] text-zinc-600 mb-1.5">Recently played</div>
                              <div className="flex gap-1.5">
                                {[0,1,2,3].map(j => (
                                  <div key={j} className="flex-1 rounded overflow-hidden"
                                    style={{ background: "rgba(255,255,255,0.05)" }}>
                                    <div style={{ height: 52, background: `rgba(${co.rgb},${0.15+j*0.04})` }} />
                                    <div className="p-1">
                                      <div className="h-1 rounded" style={{ background: "rgba(255,255,255,0.10)", width: "80%" }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* Made for you section */}
                            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                              <div className="text-[9px] text-zinc-600 mb-1.5 flex-shrink-0">Made for you</div>
                              <div className="flex-1 min-h-0 grid grid-cols-3 grid-rows-2 gap-1.5">
                                {[0,1,2,3,4,5].map(j => (
                                  <div key={j} className="flex flex-col rounded overflow-hidden min-h-0"
                                    style={{ background: "rgba(255,255,255,0.04)" }}>
                                    <div className="flex-1 min-h-0" style={{ background: `rgba(${co.rgb},${0.08+j*0.03})` }} />
                                    <div className="px-1 py-1 flex-shrink-0 space-y-0.5">
                                      <div className="h-1 rounded" style={{ background: "rgba(255,255,255,0.11)", width: "85%" }} />
                                      <div className="h-1 rounded" style={{ background: "rgba(255,255,255,0.05)", width: "60%" }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : co.name === "YouTube" ? (
                          /* YouTube: 2-col thumbnail grid */
                          <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-3 gap-2 overflow-hidden">
                            {[0,1,2,3,4,5].map(j => (
                              <div key={j} className="flex flex-col min-h-0">
                                <div className="flex-1 min-h-0 rounded overflow-hidden relative flex items-center justify-center mb-1"
                                  style={{ background: "rgba(255,255,255,0.05)" }}>
                                  <div style={{ width: 0, height: 0, borderTop: "5px solid transparent",
                                    borderBottom: "5px solid transparent",
                                    borderLeft: `9px solid rgba(${co.rgb},0.5)` }} />
                                  <div className="absolute bottom-1 right-1 px-1 rounded"
                                    style={{ background: "rgba(0,0,0,0.6)", height: 8, width: 16 }} />
                                </div>
                                <div className="space-y-0.5">
                                  <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.11)", width: `${78+j*3}%` }} />
                                  <div className="h-1 rounded" style={{ background: "rgba(255,255,255,0.06)", width: "55%" }} />
                                  <div className="h-1 rounded" style={{ background: "rgba(255,255,255,0.04)", width: "38%" }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* DoorDash: category pills + restaurant + menu cards */
                          <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
                            {/* Category pills */}
                            <div className="flex gap-1.5 flex-shrink-0">
                              {["🍕 Pizza","🍜 Asian","🌮 Mexican","🍔 Burgers"].map((c, k) => (
                                <div key={k} className="px-1.5 py-0.5 rounded-full text-[8px] whitespace-nowrap flex-shrink-0"
                                  style={{
                                    background: k === 0 ? `rgba(${co.rgb},0.2)` : "rgba(255,255,255,0.05)",
                                    color: k === 0 ? co.accent : "rgba(255,255,255,0.35)",
                                    border: `1px solid ${k === 0 ? `rgba(${co.rgb},0.35)` : "rgba(255,255,255,0.07)"}`,
                                  }}>{c}</div>
                              ))}
                            </div>
                            {/* Restaurant cards — horizontal thumbnail layout */}
                            {[
                              { nw: "68%", c1: "45%", c2: "30%", time: "25 min", fee: "$0 delivery" },
                              { nw: "55%", c1: "52%", c2: "38%", time: "35 min", fee: "$1.99 delivery" },
                              { nw: "72%", c1: "40%", c2: "28%", time: "20 min", fee: "$0 delivery" },
                              { nw: "62%", c1: "48%", c2: "35%", time: "30 min", fee: "$0.99 delivery" },
                            ].map((r, j) => (
                              <div key={j} className="flex-shrink-0 flex gap-2.5 items-center rounded-lg px-2.5 py-2"
                                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                {/* Square thumbnail */}
                                <div className="flex-shrink-0 rounded-md"
                                  style={{ width: 44, height: 44, background: `rgba(${co.rgb},${0.18+j*0.04})` }} />
                                {/* Info */}
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="h-2 rounded" style={{ background: "rgba(255,255,255,0.14)", width: r.nw }} />
                                  <div className="flex gap-1.5 items-center">
                                    <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.07)", width: r.c1 }} />
                                    <div className="w-px h-2" style={{ background: "rgba(255,255,255,0.07)" }} />
                                    <div className="h-1.5 rounded" style={{ background: "rgba(255,255,255,0.05)", width: r.c2 }} />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: `rgba(${co.rgb},0.55)` }} />
                                    <div className="h-1 rounded" style={{ background: `rgba(${co.rgb},0.25)`, width: "22%" }} />
                                    <div className="h-1 rounded ml-1" style={{ background: "rgba(255,255,255,0.06)", width: "28%" }} />
                                    <div className="ml-auto text-[8px]" style={{ color: "rgba(255,255,255,0.28)" }}>{r.time}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  )}{/* /content */}
                </div>{/* /window */}
              </div>
            ))}
          </div>

          {/* Progress indicators */}
          <div className="flex gap-1.5 justify-center pt-3 flex-shrink-0">
            {COMPANIES.map((co, i) => (
              <button
                key={i}
                onClick={() => setCarouselIdx(i)}
                style={{
                  height: 3,
                  width: i === carouselIdx ? 18 : 6,
                  borderRadius: 2,
                  background: i === carouselIdx ? co.accent : "rgba(255,255,255,0.12)",
                  transition: "width 0.3s ease, background 0.3s ease",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>

        </div>
      </section>

      {/* ══ SECTION 3 — Friends ═══════════════════════════════════════════════ */}
      <section className="h-screen bg-black flex items-center overflow-hidden"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>

        {/* ── LEFT: spheres ───────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center py-8 px-6 flex-shrink-0" style={{ width: "54%" }}>
          <p className="text-[11px] tracking-widest uppercase text-zinc-700 mb-4 select-none">
            Explore through connection
          </p>

          {/* Circular arrangement — Friends in centre, 6 friends orbiting */}
          {(() => {
            const friends = [
              { name: "Chris",   seed:  1 },
              { name: "Adam",    seed:  5 },
              { name: "Ethan",   seed:  9 },
              { name: "Dole",    seed:  3 },
              { name: "UCLA",    seed:  7 },
              { name: "Atlanta", seed: 11 },
            ];
            const SIZE   = 460;          // container px — fits within constrained 54% column
            const CX     = SIZE / 2;     // 230
            const CY     = SIZE / 2;     // 230
            const ORBIT  = 170;          // orbit radius
            const N      = friends.length;
            return (
              <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>

                {/* Centre: Friends aggregate sphere */}
                <div style={{
                  position: "absolute",
                  left: CX, top: CY,
                  transform: "translate(-50%, -50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}>
                  <MiniSphere size={140} seed={99} />
                  <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)" }}>
                    Friends
                  </span>
                </div>

                {/* Individual friend spheres in a circle */}
                {friends.map((f, i) => {
                  const angle = (i / N) * 2 * Math.PI - Math.PI / 2; // start at top
                  const x = CX + ORBIT * Math.cos(angle);
                  const y = CY + ORBIT * Math.sin(angle);
                  return (
                    <div key={f.name} style={{
                      position: "absolute",
                      left: x, top: y,
                      transform: "translate(-50%, -50%)",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    }}>
                      <MiniSphere size={88} seed={f.seed} />
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── RIGHT: copy ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col justify-between py-12 px-12 overflow-hidden"
          style={{ width: "46%", borderLeft: "1px solid rgba(255,255,255,0.05)", alignSelf: "stretch" }}>

          <h2 className="text-[2.75rem] font-light leading-tight text-white">
            The people you trust<br />are the best filter.
          </h2>

          <div className="space-y-6 leading-relaxed">
            <div className="space-y-1.5 text-[17px]">
              <p className="text-white font-semibold">What your friends love isn&apos;t in your feed.</p>
              <p className="text-zinc-500">The algorithm only knows you. It doesn&apos;t know your friends — what they&apos;ve been obsessing over for years, what shaped them, what they&apos;d play you the moment you walked in the door.</p>
            </div>
            <div className="space-y-1.5 text-[17px]">
              <p className="text-white font-semibold">Navigate their taste, not their recently played.</p>
              <p className="text-zinc-500">See the full shape of what they love. Walk through their Jazz section, their Electronic corner, their deep cuts. Find what&apos;s been there for years — not just what they listened to yesterday.</p>
            </div>
            <div className="space-y-1.5 text-[17px]">
              <p className="text-white font-semibold">Find what no search bar could surface.</p>
              <p className="text-zinc-500">Things you didn&apos;t know to look for. Things outside your engagement profile. Things no one is paying to promote to you — but that someone you actually trust has loved for years.</p>
            </div>
          </div>

          <div className="space-y-2.5 pt-6 border-t border-zinc-900 leading-relaxed">
            <p className="text-[17px] font-semibold text-zinc-200">And you get closer in the process.</p>
            <p className="text-[18px] text-zinc-300 font-medium">There&apos;s no better way to understand someone than to explore what they actually love.</p>
          </div>
        </div>

      </section>

      {/* ══ SECTION 4 — Places ═══════════════════════════════════════════════ */}
      <section className="h-screen bg-black flex overflow-hidden"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>

        {/* ── LEFT: copy ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col justify-between px-12 py-12 overflow-hidden"
          style={{ width: "54%", borderRight: "1px solid rgba(255,255,255,0.05)" }}>

          <h2 className="text-[2.75rem] font-light leading-tight text-white">
            Every place has<br />a taste.
          </h2>

          <div className="space-y-6 leading-relaxed">
            <div className="space-y-1.5 text-[17px]">
              <p className="text-white font-semibold">A living map of human taste.</p>
              <p className="text-zinc-500">Every city, school, and community has a visual — built from the combined taste of everyone in that place. Not what&apos;s trending. Not what&apos;s promoted. What the people there actually love.</p>
            </div>
            <div className="space-y-1.5 text-[17px]">
              <p className="text-white font-semibold">Zoom out far enough and you see everything.</p>
              <p className="text-zinc-500">The aggregate of everything everyone has ever discovered, saved, and loved. The complete record of human taste, mapped onto the planet that produced it.</p>
            </div>
            <div className="space-y-1.5 text-[17px]">
              <p className="text-white font-semibold">The digital, tethered to the real.</p>
              <p className="text-zinc-500">Find music from Atlanta, jazz from New Orleans, electronic from Berlin — not because an algorithm decided you&apos;d like it, but because you chose to go there.</p>
            </div>
          </div>

          <div className="space-y-2.5 pt-6 border-t border-zinc-900 leading-relaxed">
            <p className="text-[17px] font-semibold text-zinc-200">This is the Universal Intellect.</p>
            <p className="text-[18px] text-zinc-300 font-medium">Everything humanity has ever loved — all already out there. Now you can find it.</p>
          </div>
        </div>

        {/* ── RIGHT: animated map visual ──────────────────────────────────────── */}
        <div className="relative overflow-hidden" style={{ width: "46%", alignSelf: "stretch" }}>
          <p className="absolute top-8 left-7 text-[11px] tracking-widest uppercase text-zinc-700 select-none pointer-events-none" style={{ zIndex: 10 }}>
            The Universal Intellect
          </p>
          <MapVisual />
        </div>

      </section>

    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import SphereCanvas from "@/components/SphereCanvas";

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

// ── Geometry helpers (identical to world/page.tsx) ────────────────────────────

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

  // ── Interaction refs ──────────────────────────────────────────────────────
  const zoomRef          = useRef(1);
  const subRegionRef     = useRef<Map<number, number>>(new Map());
  const activeSubsRef    = useRef<SubItem[]>([]);
  const subPolesRef      = useRef<{ name: string; pole: V3 }[]>([]);
  const rotRef           = useRef({ x: -0.52, y: -0.25 });
  const dragRef          = useRef({ active: false, lx: 0, ly: 0, moved: false });
  const rafRef           = useRef<number>(0);
  const labelHitsRef     = useRef<{ name: string; subgenre?: string; x1: number; y1: number; x2: number; y2: number }[]>([]);
  const regionPolesRef   = useRef<{ name: string; pole: V3 }[]>([]);
  const hoveredRef       = useRef<{ genre: string; subgenre?: string } | null>(null);
  const autoSelectedRef  = useRef(false);

  // ── Fetch worlds on mount — same pattern as /world page ─────────────────
  useEffect(() => {
    fetch("/api/world")
      .then(r => r.json())
      .then(d => { if (d && Object.keys(d).length > 0) setWorlds(d); })
      .catch(() => {});
  }, []);

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
      const R   = Math.min(W, H) * 0.38 * zoomRef.current;
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
      const R    = Math.min(W, H) * 0.38 * zoomRef.current;
      const dx   = mx - W / 2, dy = my - H / 2;
      // Outside sphere circle → don't capture, let page scroll naturally
      if (dx * dx + dy * dy > R * R) return;
      // Hero state (nothing selected, at default zoom) → page scroll has priority
      if (selected === null && zoomRef.current <= 1.05) return;

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
  const selectedColor   = selected ? (COLORS[selected] ?? "#ffffff") : "#ffffff";
  const [sr, sg, sb]    = selected ? hexRgb(COLORS[selected] ?? "#ffffff") : [255, 255, 255];
  const focusedSubgenre = hoveredSubgenre ?? selectedSubgenre ?? zoomSubgenre;
  const displayedTracks = focusedSubgenre ? tracks.filter(t => t.blueprintSubgenre === focusedSubgenre) : tracks;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-black text-white">

      {/* ══ SECTION 1 — The Constraint ════════════════════════════════════════ */}
      <section className="h-screen overflow-hidden flex flex-col">

        {/* Wordmark */}
        <div className="flex-shrink-0 flex items-center px-6 py-2.5 z-20 relative">
          <span className="text-xs tracking-widest uppercase text-zinc-700 font-medium select-none">
            Blueprint
          </span>
        </div>

        {/* Body — single positioned container; all UI layers are absolute */}
        <div className="flex-1 relative min-h-0">

          {/* Intro text — fades out on first interaction, stays gone */}
          <div
            className="absolute inset-y-0 left-0 z-10 flex flex-col justify-center px-10 md:px-16 lg:px-24 max-w-[480px]"
            style={{
              opacity: textVisible ? 1 : 0,
              transition: "opacity 0.4s ease-in-out",
              pointerEvents: textVisible ? "auto" : "none",
              background: "linear-gradient(to right, rgba(0,0,0,0.80) 50%, transparent)",
            }}
          >
            <h1 className="text-3xl md:text-4xl font-light leading-[1.15] text-white mb-5">
              This is what a music taste looks like.
            </h1>
            <p className="text-sm text-zinc-500 tracking-wide">
              Click. Drag. Zoom. Explore.
            </p>
          </div>

          {/* Canvas — fills entire body, sphere always centered */}
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
      <section className="bg-black">

        {/* Problem statement */}
        <div className="max-w-2xl mx-auto px-8 md:px-12 pt-24 pb-16">

          <h2 className="text-3xl md:text-4xl font-light leading-[1.15] text-white mb-14">
            You&apos;ve been using the internet through a single model.
          </h2>

          <div className="space-y-8 text-zinc-400 text-base leading-relaxed">

            <p>Every app works the same way:</p>

            <ol className="space-y-2 pl-1">
              <li className="flex gap-3"><span className="text-zinc-600 select-none">1.</span><span>You type into a search bar</span></li>
              <li className="flex gap-3"><span className="text-zinc-600 select-none">2.</span><span>You scroll a recommendation feed</span></li>
            </ol>

            <p className="text-zinc-600 text-sm">
              Google. Amazon. TikTok. Spotify. YouTube. ChatGPT. DoorDash.<br />
              Different content — same system.
            </p>

            <p>Both parts of this system limit what you can discover.</p>

            <p><span className="text-white">Search</span> shows you what you already know to look for.</p>

            <div>
              <p className="mb-3"><span className="text-white">Feeds</span> show you what the system predicts you&apos;ll engage with, based on:</p>
              <ol className="space-y-2 pl-1">
                <li className="flex gap-3"><span className="text-zinc-600 select-none">1.</span><span>What you&apos;ve already seen</span></li>
                <li className="flex gap-3"><span className="text-zinc-600 select-none">2.</span><span>What people like you have seen</span></li>
                <li className="flex gap-3"><span className="text-zinc-600 select-none">3.</span><span>What companies pay to promote</span></li>
              </ol>
            </div>

            <p className="text-zinc-600 text-sm">That&apos;s it.</p>

            <p>So entire categories of information never reach you.</p>

            <div>
              <p className="mb-3">You will never find:</p>
              <ol className="space-y-2 pl-1">
                <li className="flex gap-3"><span className="text-zinc-600 select-none">1.</span><span>What you don&apos;t know to search for</span></li>
                <li className="flex gap-3"><span className="text-zinc-600 select-none">2.</span><span>What exists outside your behavioral profile</span></li>
                <li className="flex gap-3"><span className="text-zinc-600 select-none">3.</span><span>What no one is paying to show you</span></li>
              </ol>
            </div>

            <p className="text-zinc-500">
              This isn&apos;t a UX problem. It&apos;s a structural limit.
            </p>

            <p>
              The modern internet is not designed for discovery.<br />
              It is designed for retrieval and prediction.
            </p>

            <p>
              Which means the majority of valuable information<br />
              is not just hard to find—
            </p>

            <div className="space-y-1.5 text-zinc-500 text-sm border-l border-zinc-800 pl-5">
              <p>The song you&apos;d love but haven&apos;t heard yet,</p>
              <p>the job you want but don&apos;t know exists yet,</p>
              <p>the product you&apos;d buy but haven&apos;t come across yet,</p>
              <p>the idea that would change your thinking but hasn&apos;t reached you yet.</p>
            </div>

            <p>All already out there — just never shown to you.</p>

          </div>
        </div>

        {/* ── search-feed-ui-placeholder ────────────────────────────────────────
            Future: replace with a row/grid of interface screenshots or logos
            from Google, Amazon, TikTok, Spotify, YouTube, ChatGPT, DoorDash.
        ──────────────────────────────────────────────────────────────────────── */}
        <div className="max-w-4xl mx-auto px-8 md:px-12 pb-24">
          <div
            className="w-full rounded-lg flex items-center justify-center"
            style={{
              height: 200,
              border: "1px dashed rgba(255,255,255,0.07)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <span className="text-xs text-zinc-700 tracking-widest uppercase select-none">
              interface screenshots
            </span>
          </div>
        </div>

      </section>

    </div>
  );
}

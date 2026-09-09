"use client";

/**
 * CinematicPlayer — full-screen ambient sphere for /map.
 *
 * Completely isolated from the homepage interaction state.
 * Runs its own canvas loop, geometry build, and cinematic timeline.
 * No panels, no tracks, no dragging — pure cinematic visualization.
 *
 * Props:
 *   mode — "investor" | "ambient" | "fast"  (default "investor")
 *
 * Keyboard:
 *   Space — pause / resume animation
 *
 * Mouse:
 *   Movement creates subtle parallax (±4° max, no clicking needed)
 */

import { useEffect, useRef, useState } from "react";
import { SPHERE_INIT_RX, SPHERE_INIT_RY } from "@/lib/sphereConfig";
import { getCinematicFrame }  from "@/lib/cinematic/timeline";
import { resolveMapSequence } from "@/lib/cinematic/sequences";

// ── Types ─────────────────────────────────────────────────────────────────────

type V3  = [number, number, number];
type Tri = [number, number, number];

// ── Genre metadata ────────────────────────────────────────────────────────────

const GENRE_SHORT: Record<string, string> = {
  "Jazz / Blues":                   "Jazz",
  "Rap / Hip-Hop":                  "Rap",
  "R&B / Soul / Funk":              "R&B",
  "Classical / Score / Soundtrack": "Classical",
  "Pop / Dance":                    "Pop",
  "Rock / Indie / Alternative":     "Rock",
  "Electronic / Ambient":           "Electronic",
  "World / Folk / Regional":        "World",
};
const shortLabel = (g: string) => GENRE_SHORT[g] ?? g;

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

// Fallback when the user isn't logged in / API isn't available.
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

// ── Geometry helpers (mirrors page.tsx exactly) ───────────────────────────────

const norm3 = ([x, y, z]: V3): V3 => {
  const l = Math.sqrt(x*x + y*y + z*z);
  return [x/l, y/l, z/l];
};

function buildIcosphere(subdivs: number): { verts: V3[]; faces: Tri[] } {
  const φ = (1 + Math.sqrt(5)) / 2;
  let verts: V3[] = ([
    [-1,φ,0],[1,φ,0],[-1,-φ,0],[1,-φ,0],
    [0,-1,φ],[0,1,φ],[0,-1,-φ],[0,1,-φ],
    [φ,0,-1],[φ,0,1],[-φ,0,-1],[-φ,0,1],
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
      const [ax,ay,az]=verts[a],[bx,by,bz]=verts[b];
      verts.push(norm3([(ax+bx)/2,(ay+by)/2,(az+bz)/2]));
      cache.set(k, verts.length - 1); return verts.length - 1;
    };
    const next: Tri[] = [];
    for (const [a,b,c] of faces) {
      const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
    }
    faces = next;
  }
  return { verts, faces };
}

function fiboPoles(n: number): V3[] {
  const phi = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = n > 1 ? 1 - (i/(n-1))*2 : 0;
    const r = Math.sqrt(Math.max(0, 1 - y*y));
    const t = phi * i;
    return [Math.cos(t)*r, y, Math.sin(t)*r] as V3;
  });
}

function triCentroid(verts: V3[], [a,b,c]: Tri): V3 {
  return norm3([
    (verts[a][0]+verts[b][0]+verts[c][0])/3,
    (verts[a][1]+verts[b][1]+verts[c][1])/3,
    (verts[a][2]+verts[b][2]+verts[c][2])/3,
  ]);
}

function assignVoronoi(cents: V3[], poles: V3[], bonuses: number[]): number[] {
  return cents.map(c => {
    let best=0, bestScore=Infinity;
    for (let i=0; i<poles.length; i++) {
      const cosA = Math.min(1,Math.max(-1,c[0]*poles[i][0]+c[1]*poles[i][1]+c[2]*poles[i][2]));
      const score = Math.acos(cosA) - bonuses[i];
      if (score < bestScore) { bestScore=score; best=i; }
    }
    return best;
  });
}

function lloydRelax(
  cents: V3[], initialPoles: V3[], bonuses: number[], iters: number,
): { poles: V3[]; region: number[] } {
  let poles = initialPoles.map(p => [...p] as V3);
  let region = assignVoronoi(cents, poles, bonuses);
  for (let t=0; t<iters; t++) {
    const sum: V3[] = poles.map(() => [0,0,0] as V3);
    const cnt = new Int32Array(poles.length);
    for (let fi=0; fi<cents.length; fi++) {
      const ri=region[fi];
      sum[ri][0]+=cents[fi][0]; sum[ri][1]+=cents[fi][1]; sum[ri][2]+=cents[fi][2]; cnt[ri]++;
    }
    for (let i=0; i<poles.length; i++) {
      if (cnt[i]>0) poles[i]=norm3([sum[i][0]/cnt[i],sum[i][1]/cnt[i],sum[i][2]/cnt[i]]);
    }
    region = assignVoronoi(cents, poles, bonuses);
  }
  return { poles, region };
}

function buildAdjacency(faces: Tri[]): number[][] {
  const edgeMap = new Map<string, number[]>();
  for (let fi=0; fi<faces.length; fi++) {
    const [a,b,c]=faces[fi];
    for (const [p,q] of [[a,b],[b,c],[c,a]] as [number,number][]) {
      const k = p<q ? `${p}:${q}` : `${q}:${p}`;
      if (!edgeMap.has(k)) edgeMap.set(k,[]);
      edgeMap.get(k)!.push(fi);
    }
  }
  const adj: number[][] = Array.from({length:faces.length},()=>[]);
  for (const [,fl] of edgeMap) {
    if (fl.length===2) { adj[fl[0]].push(fl[1]); adj[fl[1]].push(fl[0]); }
  }
  return adj;
}

function removeIslands(region: number[], adj: number[][], numGenres: number): number[] {
  const result = [...region];
  for (let g=0; g<numGenres; g++) {
    const members = result.map((r,i)=>r===g?i:-1).filter(i=>i>=0);
    if (!members.length) continue;
    const visited=new Set<number>(), components: number[][]=[];
    for (const seed of members) {
      if (visited.has(seed)) continue;
      const comp: number[]=[], queue=[seed]; visited.add(seed);
      while (queue.length) {
        const fi=queue.shift()!; comp.push(fi);
        for (const ni of adj[fi]) { if (!visited.has(ni)&&result[ni]===g){visited.add(ni);queue.push(ni);} }
      }
      components.push(comp);
    }
    if (components.length<=1) continue;
    const largest=components.reduce((a,b)=>b.length>a.length?b:a);
    for (const comp of components) {
      if (comp===largest) continue;
      for (const fi of comp) {
        const votes=new Map<number,number>();
        for (const ni of adj[fi]) { const ng=result[ni]; if (ng!==g) votes.set(ng,(votes.get(ng)??0)+1); }
        let winner=-1, top=0;
        for (const [ng,v] of votes) { if (v>top){top=v;winner=ng;} }
        if (winner>=0) result[fi]=winner;
      }
    }
  }
  return result;
}

function hexRgb(h: string): [number,number,number] {
  return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
}

// ── Rotation math ─────────────────────────────────────────────────────────────

function matFromEuler(rx: number, ry: number): number[] {
  const cX=Math.cos(rx),sX=Math.sin(rx),cY=Math.cos(ry),sY=Math.sin(ry);
  return [ cY,0,sY, sX*sY,cX,-sX*cY, -cX*sY,sX,cX*cY ];
}

function mat3Premul(d: number[], c: number[]): number[] {
  return [
    d[0]*c[0]+d[1]*c[3]+d[2]*c[6], d[0]*c[1]+d[1]*c[4]+d[2]*c[7], d[0]*c[2]+d[1]*c[5]+d[2]*c[8],
    d[3]*c[0]+d[4]*c[3]+d[5]*c[6], d[3]*c[1]+d[4]*c[4]+d[5]*c[7], d[3]*c[2]+d[4]*c[5]+d[5]*c[8],
    d[6]*c[0]+d[7]*c[3]+d[8]*c[6], d[6]*c[1]+d[7]*c[4]+d[8]*c[7], d[6]*c[2]+d[7]*c[5]+d[8]*c[8],
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CinematicPlayer({ mode = "investor" }: { mode?: string }) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef<number>(0);
  const zoomRef       = useRef(1.0);
  const rotMatRef     = useRef<number[]>(matFromEuler(SPHERE_INIT_RX, SPHERE_INIT_RY));
  const frameRef      = useRef(0);
  const pausedRef     = useRef(false);
  const parallaxRef   = useRef({ x: 0, y: 0 }); // normalised −1..+1
  const isMobileRef   = useRef(false);

  const [worlds,    setWorlds]    = useState<Record<string, number>>({});
  const [isPaused,  setIsPaused]  = useState(false);
  const [progress,  setProgress]  = useState(0);   // 0..1 for optional progress bar

  // ── Fetch worlds (real data) — fall back to demo ───────────────────────────
  useEffect(() => {
    // /api/world answers 401 to a caller with no session — it is one person's
    // library, not public data. A logged-out visitor gets the demo world, so
    // the response has to be checked before its body is read as counts.
    fetch("/api/world")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { setWorlds(d && Object.keys(d).length > 0 ? d : DEMO_WORLDS); })
      .catch(() => setWorlds(DEMO_WORLDS));
  }, []);

  // ── Mouse parallax ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      parallaxRef.current = {
        x: (e.clientX / window.innerWidth  - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // ── Spacebar pause / resume ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.target !== document.body) return;
      e.preventDefault();
      pausedRef.current = !pausedRef.current;
      setIsPaused(v => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Mobile detect ──────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => { isMobileRef.current = window.innerWidth < 768; };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Canvas render loop ─────────────────────────────────────────────────────
  // Deps: [worlds, mode] — both stable after first load; mode is a string prop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || Object.keys(worlds).length === 0) return;

    // ── DPR + ResizeObserver ────────────────────────────────────────────────
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sync = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      if (!w || !h) return;
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);

    // ── Sphere geometry ─────────────────────────────────────────────────────
    const { verts, faces } = buildIcosphere(2);
    const entries  = Object.entries(worlds);
    const total    = entries.reduce((s,[,c]) => s+c, 0) || 1;
    const names    = entries.map(([n]) => n);
    const bonuses  = entries.map(([,c]) => (Math.PI/4) * Math.sqrt(c/total));
    const cents    = faces.map(f => triCentroid(verts, f));
    const { region: rawRegion } = lloydRelax(cents, fiboPoles(names.length), bonuses, 8);
    const adj      = buildAdjacency(faces);
    const region   = removeIslands(rawRegion, adj, names.length);
    const rgbMap   : [number,number,number][] = names.map(n => hexRgb(COLORS[n] ?? "#71717a"));
    const FOV      = 900;

    // ── Cinematic sequence ──────────────────────────────────────────────────
    const sequence = resolveMapSequence(mode);
    // Reset frame counter when mode changes so we start from keyframe 0
    frameRef.current = 0;

    // ── drawFrame ───────────────────────────────────────────────────────────
    function drawFrame() {
      if (!canvas) return;
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      if (!W || !H) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Apply mouse parallax as a tiny additional rotation (±4° max).
      // Premultiply so it adds on top of the scripted camera orientation.
      const px  = parallaxRef.current;
      const pMat = matFromEuler(px.y * 0.07, px.x * 0.11);
      const [m0,m1,m2,m3,m4,m5,m6,m7,m8] = mat3Premul(pMat, rotMatRef.current);

      const R  = Math.min(W, H) * 0.34 * zoomRef.current;
      const cx = W/2, cy = H/2;

      ctx.clearRect(0, 0, W, H);

      // ── Atmospheric glow ─────────────────────────────────────────────────
      const atmo = ctx.createRadialGradient(cx, cy, R*0.80, cx, cy, R*1.28);
      atmo.addColorStop(0,   "rgba(70,70,200,0.11)");
      atmo.addColorStop(0.5, "rgba(40,40,140,0.06)");
      atmo.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(cx, cy, R*1.28, 0, Math.PI*2);
      ctx.fillStyle = atmo; ctx.fill();

      // ── Project all vertices ─────────────────────────────────────────────
      const pv = verts.map(([x,y,z]) => {
        const xs = m0*x+m1*y+m2*z;
        const ys = m3*x+m4*y+m5*z;
        const zs = m6*x+m7*y+m8*z;
        const s  = FOV / (FOV+zs);
        return { sx: cx+xs*R*s, sy: cy+ys*R*s, z: zs };
      });

      // ── Depth-sort faces (painter's algorithm) ───────────────────────────
      const fd = faces.map((tri,i) => ({
        tri, depth: (pv[tri[0]].z+pv[tri[1]].z+pv[tri[2]].z)/3, ri: region[i],
      })).sort((a,b) => a.depth - b.depth);

      // ── Draw faces ───────────────────────────────────────────────────────
      for (const { tri, depth, ri } of fd) {
        const [ia,ib,ic] = tri;
        const [r,g,b]    = rgbMap[ri];
        ctx.beginPath();
        ctx.moveTo(pv[ia].sx, pv[ia].sy);
        ctx.lineTo(pv[ib].sx, pv[ib].sy);
        ctx.lineTo(pv[ic].sx, pv[ic].sy);
        ctx.closePath();

        if (depth >= 0) {
          // Front face — filled + stroked
          ctx.fillStyle   = `rgba(${r},${g},${b},0.030)`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${r},${g},${b},0.88)`;
          ctx.lineWidth   = 0.9;
          ctx.stroke();
        } else {
          // Back face — thin ghost stroke, fades into darkness
          const t = Math.max(0, (depth+0.85)/0.85) * 0.10;
          ctx.strokeStyle = `rgba(${r},${g},${b},${t.toFixed(3)})`;
          ctx.lineWidth   = 0.35;
          ctx.stroke();
        }
      }

      // ── Genre labels ─────────────────────────────────────────────────────
      // Accumulate per-region face-centre averages for stable label placement.
      const acc: Record<number, {sx:number; sy:number; n:number}> = {};
      for (const { tri, depth, ri } of fd) {
        if (depth < 0) continue;
        const [ia,ib,ic] = tri;
        const lx = (pv[ia].sx+pv[ib].sx+pv[ic].sx)/3;
        const ly = (pv[ia].sy+pv[ib].sy+pv[ic].sy)/3;
        if (!acc[ri]) acc[ri] = { sx:0, sy:0, n:0 };
        acc[ri].sx += lx; acc[ri].sy += ly; acc[ri].n++;
      }

      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";

      // Label opacity pulses subtly with zoom — more prominent when zoomed in.
      const labelAlpha = 0.55 + 0.30 * Math.min(1, (zoomRef.current - 1.0) / 0.4);

      for (const [riStr, a] of Object.entries(acc)) {
        if (a.n < 4) continue;
        const ri    = Number(riStr);
        const lx    = a.sx / a.n;
        const ly    = a.sy / a.n;
        const name  = names[ri];
        const label = shortLabel(name);
        const [r,g,b] = rgbMap[ri];
        const isMob = isMobileRef.current;
        const fs    = isMob ? 12 : 14;

        ctx.globalAlpha = labelAlpha;
        ctx.font = `700 ${fs}px system-ui, sans-serif`;
        const tw  = ctx.measureText(label).width;
        const pad = isMob ? 6 : 8, rad = 7;
        const bx  = lx-tw/2-pad, by = ly-fs/2-pad, bw = tw+pad*2, bh = fs+pad*2;

        // Pill background
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.80)"; ctx.shadowBlur = 12;
        ctx.fillStyle   = "rgba(6,6,18,0.75)";
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, rad); ctx.fill();
        ctx.restore();

        // Subtle genre-coloured border
        ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`;
        ctx.lineWidth   = 0.8;
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, rad); ctx.stroke();

        // Label text
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillText(label, lx, ly);
        ctx.globalAlpha = 1.0;
      }

      ctx.textBaseline = "alphabetic";
    }

    // ── Cinematic animation loop ─────────────────────────────────────────────
    // Uses a deterministic virtual clock: virtual_t = frameIndex ÷ fps.
    // When the sequence ends, frameIndex resets to 0 for seamless looping.
    function animate() {
      if (!pausedRef.current) {
        const totalFrames = Math.round(sequence.duration * sequence.fps);
        const f  = frameRef.current % totalFrames;
        const t  = f / sequence.fps;
        const fr = getCinematicFrame(sequence, t);

        zoomRef.current   = fr.zoom;
        rotMatRef.current = fr.rotMat;

        frameRef.current++;
        setProgress(f / totalFrames);   // update progress bar (batched with draw)
      }

      drawFrame();
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [worlds, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>

      {/* ── Sphere canvas ──────────────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      {/* ── CSS vignette overlay ───────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:   "absolute",
          inset:      0,
          background: "radial-gradient(ellipse at 50% 50%, transparent 42%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Blueprint wordmark ─────────────────────────────────────────────── */}
      <div
        style={{
          position:      "absolute",
          bottom:        36,
          left:          "50%",
          transform:     "translateX(-50%)",
          color:         "rgba(255,255,255,0.16)",
          fontSize:      11,
          fontWeight:    500,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          userSelect:    "none",
          pointerEvents: "none",
          whiteSpace:    "nowrap",
        }}
      >
        Blueprint
      </div>

      {/* ── Subtle progress bar ────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:     "absolute",
          bottom:       0,
          left:         0,
          height:       1,
          width:        `${progress * 100}%`,
          background:   "rgba(255,255,255,0.12)",
          transition:   "width 0.1s linear",
          pointerEvents:"none",
        }}
      />

      {/* ── Pause overlay ──────────────────────────────────────────────────── */}
      {isPaused && (
        <div
          style={{
            position:      "absolute",
            inset:         0,
            display:       "flex",
            alignItems:    "center",
            justifyContent:"center",
            pointerEvents: "none",
          }}
        >
          <span style={{
            color:         "rgba(255,255,255,0.30)",
            fontSize:      12,
            letterSpacing: "0.20em",
            textTransform: "uppercase",
            fontWeight:    500,
          }}>
            Paused — Space to resume
          </span>
        </div>
      )}
    </div>
  );
}

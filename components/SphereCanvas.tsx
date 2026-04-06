"use client";

import { useEffect, useRef } from "react";

// ── Palette + static data (mirrors world/page.tsx) ───────────────────────────

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

const STATIC_WORLDS: Record<string, number> = {
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

// ── Geometry helpers (identical to world/page.tsx) ────────────────────────────

type V3  = [number, number, number];
type Tri = [number, number, number];

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
      cache.set(k, verts.length-1); return verts.length-1;
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
  return Array.from({ length: n }, (_,i) => {
    const y = n>1 ? 1-(i/(n-1))*2 : 0;
    const r = Math.sqrt(Math.max(0,1-y*y));
    const t = phi*i;
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
    for (let i=0;i<poles.length;i++) {
      const cosA = Math.min(1,Math.max(-1,c[0]*poles[i][0]+c[1]*poles[i][1]+c[2]*poles[i][2]));
      const score = Math.acos(cosA)-bonuses[i];
      if (score<bestScore){bestScore=score;best=i;}
    }
    return best;
  });
}

function lloydRelax(
  cents: V3[], initialPoles: V3[], bonuses: number[], iters: number
): { poles: V3[]; region: number[] } {
  let poles = initialPoles.map(p=>[...p] as V3);
  let region = assignVoronoi(cents, poles, bonuses);
  for (let t=0;t<iters;t++) {
    const sum: V3[] = poles.map(()=>[0,0,0] as V3);
    const cnt = new Int32Array(poles.length);
    for (let fi=0;fi<cents.length;fi++) {
      const ri=region[fi];
      sum[ri][0]+=cents[fi][0];sum[ri][1]+=cents[fi][1];sum[ri][2]+=cents[fi][2];cnt[ri]++;
    }
    for (let i=0;i<poles.length;i++) {
      if (cnt[i]>0) poles[i]=norm3([sum[i][0]/cnt[i],sum[i][1]/cnt[i],sum[i][2]/cnt[i]]);
    }
    region = assignVoronoi(cents, poles, bonuses);
  }
  return { poles, region };
}

function buildAdjacency(faces: Tri[]): number[][] {
  const edgeMap = new Map<string, number[]>();
  for (let fi=0;fi<faces.length;fi++) {
    const [a,b,c]=faces[fi];
    for (const [p,q] of [[a,b],[b,c],[c,a]] as [number,number][]) {
      const k=p<q?`${p}:${q}`:`${q}:${p}`;
      if (!edgeMap.has(k)) edgeMap.set(k,[]);
      edgeMap.get(k)!.push(fi);
    }
  }
  const adj: number[][] = Array.from({length:faces.length},()=>[]);
  for (const [,fl] of edgeMap) {
    if (fl.length===2){adj[fl[0]].push(fl[1]);adj[fl[1]].push(fl[0]);}
  }
  return adj;
}

function removeIslands(region: number[], adj: number[][], numGenres: number): number[] {
  const result=[...region];
  for (let g=0;g<numGenres;g++) {
    const members=result.map((r,i)=>r===g?i:-1).filter(i=>i>=0);
    if (!members.length) continue;
    const visited=new Set<number>(); const components: number[][]=[];
    for (const seed of members) {
      if (visited.has(seed)) continue;
      const comp: number[]=[]; const queue=[seed]; visited.add(seed);
      while (queue.length) {
        const fi=queue.shift()!; comp.push(fi);
        for (const ni of adj[fi]) {
          if (!visited.has(ni)&&result[ni]===g){visited.add(ni);queue.push(ni);}
        }
      }
      components.push(comp);
    }
    if (components.length<=1) continue;
    const largest=components.reduce((a,b)=>b.length>a.length?b:a);
    for (const comp of components) {
      if (comp===largest) continue;
      for (const fi of comp) {
        const votes=new Map<number,number>();
        for (const ni of adj[fi]){const ng=result[ni];if(ng!==g)votes.set(ng,(votes.get(ng)??0)+1);}
        let winner=-1,top=0;
        for (const [ng,v] of votes){if(v>top){top=v;winner=ng;}}
        if (winner>=0) result[fi]=winner;
      }
    }
  }
  return result;
}

function hexRgb(h: string): [number,number,number] {
  return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  className?:   string;
  /** Enables drag rotation + genre hover highlighting. Default: false */
  interactive?: boolean;
  /** Renders genre name pills (like world/page.tsx). Defaults to true when interactive. */
  showLabels?:  boolean;
  /** Auto-rotation speed in radians/frame when !interactive. Default: 0.0022 */
  rotSpeed?:    number;
  initialRotX?: number;
  initialRotY?: number;
}

export default function SphereCanvas({
  className,
  interactive = false,
  showLabels,
  rotSpeed     = 0.0022,
  initialRotX  = 0.3,
  initialRotY  = 0,
}: Props) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const rotRef        = useRef({ x: initialRotX, y: initialRotY });
  const dragRef       = useRef({ active: false, lx: 0, ly: 0 });
  const hoveredIdxRef = useRef(-1);
  // Poles are set once after lloydRelax; used for hover hit-testing
  const polesRef      = useRef<{ name: string; pole: V3 }[]>([]);

  const doLabels = showLabels ?? interactive;

  // ── Mouse handlers (only wired up when interactive) ──────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      rotRef.current.y += (e.clientX - dragRef.current.lx) * 0.005;
      rotRef.current.x -= (e.clientY - dragRef.current.ly) * 0.005;
      dragRef.current.lx = e.clientX;
      dragRef.current.ly = e.clientY;
      hoveredIdxRef.current = -1;
      return;
    }
    // Hover: inverse-project to nearest genre pole
    const canvas = canvasRef.current;
    if (!canvas || polesRef.current.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const R = Math.min(W, H) * 0.38;
    const nx = (mx - W/2) / R, ny = (my - H/2) / R;
    if (nx*nx + ny*ny > 1) { hoveredIdxRef.current = -1; return; }
    const nz = Math.sqrt(Math.max(0, 1 - nx*nx - ny*ny));
    const rx = rotRef.current.x, ry = rotRef.current.y;
    const y_w =  ny*Math.cos(rx) + nz*Math.sin(rx);
    const z1  = -ny*Math.sin(rx) + nz*Math.cos(rx);
    const x_w =  nx*Math.cos(ry) - z1*Math.sin(ry);
    const z_w =  nx*Math.sin(ry) + z1*Math.cos(ry);
    const names = Object.keys(STATIC_WORLDS);
    let bestIdx = 0, bestDot = -Infinity;
    for (let i = 0; i < polesRef.current.length; i++) {
      const { pole: [px,py,pz] } = polesRef.current[i];
      const d = px*x_w + py*y_w + pz*z_w;
      if (d > bestDot) { bestDot = d; bestIdx = i; }
    }
    hoveredIdxRef.current = bestIdx;
  };

  const handleMouseLeave = () => {
    dragRef.current.active = false;
    hoveredIdxRef.current  = -1;
  };

  const handleMouseUp = () => { dragRef.current.active = false; };

  // ── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sync = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);

    // Build geometry once
    const { verts, faces } = buildIcosphere(2);
    const entries = Object.entries(STATIC_WORLDS);
    const total   = entries.reduce((s,[,c])=>s+c,0)||1;
    const names   = entries.map(([n])=>n);
    const bonuses = entries.map(([,c])=>(Math.PI/4)*Math.sqrt(c/total));
    const cents   = faces.map(f=>triCentroid(verts,f));
    const { region: rawRegion, poles: finalPoles } = lloydRelax(cents, fiboPoles(names.length), bonuses, 8);
    const adj    = buildAdjacency(faces);
    const region = removeIslands(rawRegion, adj, names.length);
    const rgbMap = names.map(n=>hexRgb(COLORS[n]??"#71717a"));

    // Store poles for interactive hover hit-testing
    polesRef.current = names.map((name,i)=>({ name, pole: finalPoles[i] }));

    const FOV = 900;
    let raf: number;

    function draw() {
      const W = canvas!.width, H = canvas!.height;
      if (!W || !H) return;
      const ctx = canvas!.getContext("2d")!;
      // Sphere radius matches world/page.tsx exactly (0.38, no zoom on decorative)
      const R  = Math.min(W, H) * 0.38;
      const cx = W/2, cy = H/2;
      const rx = rotRef.current.x, ry = rotRef.current.y;
      const hovIdx = hoveredIdxRef.current;

      ctx.clearRect(0,0,W,H);

      // Atmosphere halo (same as world/page.tsx)
      const atmo = ctx.createRadialGradient(cx,cy,R*0.82,cx,cy,R*1.22);
      atmo.addColorStop(0,"rgba(70,70,180,0.13)");
      atmo.addColorStop(1,"rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(cx,cy,R*1.22,0,Math.PI*2);
      ctx.fillStyle=atmo; ctx.fill();

      // Project vertices
      const pv = verts.map(([x,y,z])=>{
        const x1=x*Math.cos(ry)+z*Math.sin(ry);
        const z1=-x*Math.sin(ry)+z*Math.cos(ry);
        const y2=y*Math.cos(rx)-z1*Math.sin(rx);
        const z2=y*Math.sin(rx)+z1*Math.cos(rx);
        const s=FOV/(FOV+z2);
        return { sx:cx+x1*R*s, sy:cy+y2*R*s, z:z2 };
      });

      // Sort back→front (painter's algorithm)
      const fd = faces.map((tri,i)=>({
        tri, ri:region[i],
        depth:(pv[tri[0]].z+pv[tri[1]].z+pv[tri[2]].z)/3
      })).sort((a,b)=>a.depth-b.depth);

      // ── Draw faces — rendering params identical to world/page.tsx (no selection) ──
      for (const { tri, ri, depth } of fd) {
        const [ia,ib,ic] = tri;
        const isHoveredGenre = interactive && ri === hovIdx;
        const [r,g,b] = rgbMap[ri];

        ctx.beginPath();
        ctx.moveTo(pv[ia].sx,pv[ia].sy);
        ctx.lineTo(pv[ib].sx,pv[ib].sy);
        ctx.lineTo(pv[ic].sx,pv[ic].sy);
        ctx.closePath();

        if (depth >= 0) {
          // Fill
          const fillAlpha = isHoveredGenre ? 0.15 : 0.02;
          ctx.fillStyle = `rgba(${r},${g},${b},${fillAlpha})`;
          ctx.fill();
          // Edge
          const edgeAlpha = isHoveredGenre ? 0.95 : 0.82;
          ctx.strokeStyle = `rgba(${r},${g},${b},${edgeAlpha})`;
          ctx.lineWidth   = isHoveredGenre ? 1.2 : 0.9;
          ctx.stroke();
        } else {
          // Back hemisphere: ghost wireframe fades toward south pole
          const t = Math.max(0,(depth+0.8)/0.8)*0.13;
          ctx.strokeStyle = `rgba(${r},${g},${b},${t.toFixed(3)})`;
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      }

      // ── Genre labels — same pill rendering as world/page.tsx ──────────────
      if (doLabels) {
        const acc: Record<number,{sx:number;sy:number;n:number}> = {};
        for (const { tri, ri, depth } of fd) {
          if (depth < 0) continue;
          const [ia,ib,ic] = tri;
          const lx=(pv[ia].sx+pv[ib].sx+pv[ic].sx)/3;
          const ly=(pv[ia].sy+pv[ib].sy+pv[ic].sy)/3;
          if (!acc[ri]) acc[ri]={sx:0,sy:0,n:0};
          acc[ri].sx+=lx; acc[ri].sy+=ly; acc[ri].n++;
        }
        ctx.textAlign="center"; ctx.textBaseline="middle";
        for (const [riStr, a] of Object.entries(acc)) {
          if (a.n < 4) continue;
          const ri  = Number(riStr);
          const lx  = a.sx/a.n, ly = a.sy/a.n;
          const name = names[ri];
          const [r,g,b] = rgbMap[ri];
          const isThisHov = interactive && ri === hovIdx;
          ctx.globalAlpha = isThisHov ? 1.0 : 1.0; // always full (no selection dimming)
          ctx.font = `700 13px system-ui, sans-serif`;
          const tw=ctx.measureText(name).width, pad=8, rad=8;
          const bx=lx-tw/2-pad, by=ly-13/2-pad, bw=tw+pad*2, bh=13+pad*2;
          ctx.save();
          ctx.shadowColor="rgba(0,0,0,0.75)"; ctx.shadowBlur=14;
          ctx.fillStyle="rgba(8,8,16,0.72)";
          ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,rad); ctx.fill();
          ctx.restore();
          ctx.fillStyle=`rgba(${r},${g},${b},${isThisHov?1.0:0.85})`;
          ctx.fillText(name,lx,ly);
        }
        ctx.globalAlpha=1.0; ctx.textBaseline="alphabetic";
      }

      // Auto-rotate when passive
      if (!interactive) rot.y += rotSpeed;
    }

    // Tiny shim: draw() above references `rot` via closure but we store in rotRef
    // so that interactive mouse handlers update the same object. Alias it here:
    const rot = rotRef.current;

    function loop() { draw(); raf = requestAnimationFrame(loop); }
    raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, doLabels, rotSpeed]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: "block",
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "grab" : "default",
      }}
      onMouseDown={interactive ? handleMouseDown : undefined}
      onMouseMove={interactive ? handleMouseMove : undefined}
      onMouseUp={interactive   ? handleMouseUp   : undefined}
      onMouseLeave={interactive ? handleMouseLeave : undefined}
    />
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { SPHERE_INIT_RX, SPHERE_INIT_RY } from "@/lib/sphereConfig";

// ── Short display labels ───────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

type TrackItem = {
  id: string; name: string; artist: string;
  album: string | null;
  imageUrl?: string | null; previewUrl?: string | null; spotifyId?: string | null;
  blueprintSubgenre: string;
  socialCount?: number;
  socialUsers?: { id: string; name: string | null }[];
};
type SubgenreItem = { name: string; count: number };
type V3  = [number, number, number];
type Tri = [number, number, number];

// ── Arcball math (identical to homepage) ──────────────────────────────────────

function matFromEuler(rx: number, ry: number): number[] {
  const cX = Math.cos(rx), sX = Math.sin(rx);
  const cY = Math.cos(ry), sY = Math.sin(ry);
  return [cY, 0, sY, sX*sY, cX, -sX*cY, -cX*sY, sX, cX*cY];
}

function arcballVec(px: number, py: number, cx: number, cy: number, r: number): V3 {
  const nx = (px - cx) / r, ny = (py - cy) / r;
  const d2 = nx * nx + ny * ny;
  if (d2 <= 0.5) return [nx, ny, Math.sqrt(1 - d2)];
  const z = 0.5 / Math.sqrt(d2), len = Math.sqrt(d2 + z * z);
  return [nx / len, ny / len, z / len];
}

function quatFromTo(a: V3, b: V3): [number, number, number, number] {
  const cx = a[1]*b[2]-a[2]*b[1], cy = a[2]*b[0]-a[0]*b[2], cz = a[0]*b[1]-a[1]*b[0];
  const w  = 1 + a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const len = Math.sqrt(w*w+cx*cx+cy*cy+cz*cz);
  if (len < 1e-10) return [1,0,0,0];
  return [w/len, cx/len, cy/len, cz/len];
}

function matFromQuat([w, x, y, z]: [number, number, number, number]): number[] {
  return [
    1-2*(y*y+z*z), 2*(x*y-w*z),   2*(x*z+w*y),
    2*(x*y+w*z),   1-2*(x*x+z*z), 2*(y*z-w*x),
    2*(x*z-w*y),   2*(y*z+w*x),   1-2*(x*x+y*y),
  ];
}

function mat3Premul(d: number[], c: number[]): number[] {
  return [
    d[0]*c[0]+d[1]*c[3]+d[2]*c[6], d[0]*c[1]+d[1]*c[4]+d[2]*c[7], d[0]*c[2]+d[1]*c[5]+d[2]*c[8],
    d[3]*c[0]+d[4]*c[3]+d[5]*c[6], d[3]*c[1]+d[4]*c[4]+d[5]*c[7], d[3]*c[2]+d[4]*c[5]+d[5]*c[8],
    d[6]*c[0]+d[7]*c[3]+d[8]*c[6], d[6]*c[1]+d[7]*c[4]+d[8]*c[7], d[6]*c[2]+d[7]*c[5]+d[8]*c[8],
  ];
}

function mat3Ortho(m: number[]): number[] {
  let [a0,a1,a2, b0,b1,b2] = m;
  let n = Math.sqrt(a0*a0+a1*a1+a2*a2); a0/=n; a1/=n; a2/=n;
  const dot = b0*a0+b1*a1+b2*a2; b0-=dot*a0; b1-=dot*a1; b2-=dot*a2;
  n = Math.sqrt(b0*b0+b1*b1+b2*b2); b0/=n; b1/=n; b2/=n;
  return [a0,a1,a2, b0,b1,b2, a1*b2-a2*b1, a2*b0-a0*b2, a0*b1-a1*b0];
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

const norm3 = ([x,y,z]: V3): V3 => { const l=Math.sqrt(x*x+y*y+z*z); return [x/l,y/l,z/l]; };

function buildIcosphere(s: number): { verts: V3[]; faces: Tri[] } {
  const φ = (1+Math.sqrt(5))/2;
  let verts: V3[] = ([[-1,φ,0],[1,φ,0],[-1,-φ,0],[1,-φ,0],[0,-1,φ],[0,1,φ],[0,-1,-φ],[0,1,-φ],[φ,0,-1],[φ,0,1],[-φ,0,-1],[-φ,0,1]] as V3[]).map(norm3);
  let faces: Tri[] = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for (let i=0;i<s;i++) {
    const cache = new Map<string,number>();
    const mid = (a:number,b:number) => { const k=a<b?`${a}:${b}`:`${b}:${a}`; if(cache.has(k))return cache.get(k)!; const[ax,ay,az]=verts[a],[bx,by,bz]=verts[b]; verts.push(norm3([(ax+bx)/2,(ay+by)/2,(az+bz)/2])); cache.set(k,verts.length-1); return verts.length-1; };
    const next: Tri[] = [];
    for (const [a,b,c] of faces) { const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a); next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]); }
    faces = next;
  }
  return { verts, faces };
}

function fiboPoles(n: number): V3[] {
  const phi = Math.PI*(3-Math.sqrt(5));
  return Array.from({length:n},(_,i)=>{const y=n>1?1-(i/(n-1))*2:0,r=Math.sqrt(Math.max(0,1-y*y)),t=phi*i;return[Math.cos(t)*r,y,Math.sin(t)*r] as V3;});
}

function triCentroid(verts: V3[], [a,b,c]: Tri): V3 {
  return norm3([(verts[a][0]+verts[b][0]+verts[c][0])/3,(verts[a][1]+verts[b][1]+verts[c][1])/3,(verts[a][2]+verts[b][2]+verts[c][2])/3]);
}

function assignVoronoi(cents: V3[], poles: V3[], bonuses: number[]): number[] {
  return cents.map(c => { let best=0,bs=Infinity; for(let i=0;i<poles.length;i++){const cos=Math.min(1,Math.max(-1,c[0]*poles[i][0]+c[1]*poles[i][1]+c[2]*poles[i][2]));const s=Math.acos(cos)-bonuses[i];if(s<bs){bs=s;best=i;}} return best; });
}

function lloydRelax(cents: V3[], p0: V3[], bonuses: number[], iters: number): {poles:V3[];region:number[]} {
  let poles=p0.map(p=>[...p] as V3), region=assignVoronoi(cents,poles,bonuses);
  for (let t=0;t<iters;t++) {
    const sum: V3[]=poles.map(()=>[0,0,0] as V3); const cnt=new Int32Array(poles.length);
    for(let fi=0;fi<cents.length;fi++){const ri=region[fi];sum[ri][0]+=cents[fi][0];sum[ri][1]+=cents[fi][1];sum[ri][2]+=cents[fi][2];cnt[ri]++;}
    for(let i=0;i<poles.length;i++){if(cnt[i]>0)poles[i]=norm3([sum[i][0]/cnt[i],sum[i][1]/cnt[i],sum[i][2]/cnt[i]]);}
    region=assignVoronoi(cents,poles,bonuses);
  }
  return {poles,region};
}

function buildAdjacency(faces: Tri[]): number[][] {
  const em=new Map<string,number[]>();
  for(let fi=0;fi<faces.length;fi++){const[a,b,c]=faces[fi];for(const[p,q] of[[a,b],[b,c],[c,a]] as [number,number][]){const k=p<q?`${p}:${q}`:`${q}:${p}`;if(!em.has(k))em.set(k,[]);em.get(k)!.push(fi);}}
  const adj: number[][]=Array.from({length:faces.length},()=>[]);
  for(const[,fl] of em){if(fl.length===2){adj[fl[0]].push(fl[1]);adj[fl[1]].push(fl[0]);}}
  return adj;
}

function removeIslands(region: number[], adj: number[][], ng: number): number[] {
  const result=[...region];
  for(let g=0;g<ng;g++){
    const members: number[]=[];
    for(let fi=0;fi<result.length;fi++){if(result[fi]===g)members.push(fi);}
    if(!members.length)continue;
    const visited=new Set<number>(), components: number[][]=[];
    for(const seed of members){if(visited.has(seed))continue;const comp: number[]=[],queue=[seed];visited.add(seed);while(queue.length){const fi=queue.shift()!;comp.push(fi);for(const ni of adj[fi]){if(!visited.has(ni)&&result[ni]===g){visited.add(ni);queue.push(ni);}}}components.push(comp);}
    if(components.length<=1)continue;
    const largest=components.reduce((a,b)=>b.length>a.length?b:a);
    for(const comp of components){if(comp===largest)continue;for(const fi of comp){const votes=new Map<number,number>();for(const ni of adj[fi]){const ng2=result[ni];if(ng2!==g)votes.set(ng2,(votes.get(ng2)??0)+1);}let winner=-1,top=0;for(const[ng2,v] of votes){if(v>top){top=v;winner=ng2;}}if(winner>=0)result[fi]=winner;}}
  }
  return result;
}

function hexRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
}

// ── SpotifyLogoButton ─────────────────────────────────────────────────────────

function SpotifyLogoButton({ track, size=26 }: { track:{name:string;spotifyId?:string|null}|null; size?:number }) {
  const active=!!track, canOpen=!!(track?.spotifyId);
  const handleClick=(e: React.MouseEvent)=>{
    e.stopPropagation(); if(!canOpen||!track?.spotifyId)return;
    const url=`https://open.spotify.com/track/${track.spotifyId}`;
    if(window.confirm(`Open "${track.name}" on Spotify?`))window.open(url,"_blank","noopener,noreferrer");
  };
  return (
    <button onClick={handleClick} aria-label={canOpen?`Open ${track?.name} on Spotify`:"Spotify"}
      style={{flexShrink:0,background:"none",border:"none",padding:0,cursor:canOpen?"pointer":"default",color:active?"#1DB954":"rgba(255,255,255,0.20)",transition:"color 0.25s ease",display:"flex",alignItems:"center",lineHeight:1}}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    </button>
  );
}

// ── BarChartButton ────────────────────────────────────────────────────────────

function BarChartButton({ active, onClick, color }: { active: boolean; onClick: () => void; color: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      aria-label={active ? "Clear social sort" : "Sort by social popularity"}
      title={active ? "Sorted by how many Midvale users share this track" : "Sort by Midvale popularity"}
      style={{
        flexShrink:  0,
        background:  "none",
        border:      "none",
        padding:     "2px",
        cursor:      "pointer",
        color:       active ? color : "rgba(255,255,255,0.22)",
        transition:  "color 0.20s ease",
        display:     "flex",
        alignItems:  "center",
        lineHeight:  1,
      }}
    >
      {/* Three ascending bars */}
      <svg width={19} height={17} viewBox="0 0 12 10" fill="currentColor" aria-hidden="true">
        <rect x="0"   y="5.5" width="2.8" height="4.5" rx="0.5"/>
        <rect x="4.6" y="2.5" width="2.8" height="7.5" rx="0.5"/>
        <rect x="9.2" y="0"   width="2.8" height="10"  rx="0.5"/>
      </svg>
    </button>
  );
}

// ── Tally marks ───────────────────────────────────────────────────────────────
// Renders n as classic tally groups (||||̶ per 5).
// Rendered as inline SVG so we get crisp diagonal on the 5th stroke.

function TallyMarks({ n, color }: { n: number; color: string }) {
  if (n <= 0) return null;

  // Build groups of up to 5
  const fullGroups = Math.floor(n / 5);
  const remainder  = n % 5;

  const STROKE = 1.5;
  const H      = 11;          // mark height
  const GAP    = 3;           // gap between marks within a group
  const W_MARK = 5;           // width of one vertical mark
  const GRP_W  = W_MARK * 4 + GAP * 3;   // width of one tally group (4 uprights)
  const GRP_GAP = 7;          // gap between complete groups and remainder

  // Calculate total SVG width
  const totalGroups = fullGroups + (remainder > 0 ? 1 : 0);
  const svgW = fullGroups * (GRP_W + GRP_GAP)
             + (remainder > 0 ? Math.max(1, remainder - 1) * (W_MARK + GAP) + W_MARK : 0)
             - (totalGroups > 0 ? GRP_GAP : 0)  // no trailing gap
             + 2;  // small padding

  const lines: React.ReactNode[] = [];
  let x = 1;

  const upright = (cx: number, key: string) => (
    <line key={key} x1={cx} y1={1} x2={cx} y2={H} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
  );

  for (let g = 0; g < fullGroups; g++) {
    // 4 vertical marks
    for (let i = 0; i < 4; i++) {
      lines.push(upright(x + i * (W_MARK + GAP), `g${g}u${i}`));
    }
    // diagonal slash across all 4 uprights + a bit beyond
    const x1d = x - 2, x2d = x + 3 * (W_MARK + GAP) + W_MARK + 2;
    lines.push(
      <line key={`g${g}d`} x1={x1d} y1={H + 1} x2={x2d} y2={-1}
        stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    );
    x += GRP_W + GRP_GAP;
  }

  // Remainder vertical marks (no diagonal)
  for (let i = 0; i < remainder; i++) {
    lines.push(upright(x + i * (W_MARK + GAP), `r${i}`));
  }

  return (
    <svg
      width={svgW}
      height={H + 2}
      viewBox={`0 0 ${svgW} ${H + 2}`}
      aria-label={`${n} other${n === 1 ? "" : "s"}`}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      {lines}
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface WorldSphereProps {
  /** If set, load data for this specific user instead of the session user. */
  userId?: string;
  /** If set, show a back-navigation button pointing at this href (e.g. "/midvale"). */
  backHref?: string;
  /**
   * Display name for the mobile headline ("Chris's Music" / "Chris' Music").
   * When omitted the headline is suppressed.
   */
  userName?: string;
}

/**
 * Formats a user's first name into possessive form:
 *   "Surya"  → "Surya's Music"
 *   "Chris"  → "Chris' Music"   (already ends in s)
 *   ""/ null → "Music"
 */
function possessiveHeadline(name: string | undefined): string {
  if (!name) return "Music";
  const first = name.split(" ")[0];
  return first.endsWith("s") ? `${first}' Music` : `${first}'s Music`;
}

export default function WorldSphere({ userId, backHref, userName }: WorldSphereProps = {}) {
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? null;

  // True when viewing our own world (no userId prop, or userId matches session).
  // Used to gate auto-sync — roommate worlds must never auto-sync.
  const isOwnWorld = !userId || userId === sessionUserId;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef               = useRef(false);
  refreshingRef.current             = refreshing;
  const [worlds,     setWorlds]     = useState<Record<string, number>>({});
  const [error,      setError]      = useState<string | null>(null);

  // ── Auto-sync state (homepage only) ──────────────────────────────────────
  const [syncStatus,    setSyncStatus]    = useState<"idle" | "syncing" | "synced">("idle");
  const syncStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffUntilRef    = useRef(0);      // epoch ms — respect Retry-After
  const lastSyncRef        = useRef(0);      // epoch ms — last successful sync
  const autoSyncRef        = useRef<() => Promise<void>>(async () => {});

  // ── Genre / subgenre state ────────────────────────────────────────────────
  const [selected,         setSelected]         = useState<string | null>(null);
  const [tracks,           setTracks]           = useState<TrackItem[]>([]);
  const [tracksLoading,    setTracksLoading]     = useState(false);
  const [subgenres,        setSubgenres]         = useState<SubgenreItem[]>([]);
  const [selectedSubgenre, setSelectedSubgenre]  = useState<string | null>(null);
  const [socialSort,        setSocialSort]        = useState(false);
  const [popoverData, setPopoverData] = useState<{
    trackId: string;
    users:   { id: string; name: string | null }[];
    top:     number;
    right:   number;
  } | null>(null);
  const selectedSubgenreRef = useRef<string | null>(null);
  const [zoomSubgenre,     setZoomSubgenre]      = useState<string | null>(null);
  const zoomSubgenreRef    = useRef<string | null>(null);
  const [hoveredSubgenre,  setHoveredSubgenre]   = useState<string | null>(null);
  const hoveredSubgRef     = useRef<string | null>(null);

  // ── Audio playback ────────────────────────────────────────────────────────
  const [nowPlayingId,   setNowPlayingId]   = useState<string | null>(null);
  const [audioPlaying,   setAudioPlaying]   = useState(false);          // eslint-disable-line @typescript-eslint/no-unused-vars
  const audioRef                            = useRef<HTMLAudioElement | null>(null);
  const nowPlayingIdRef                     = useRef<string | null>(null);
  nowPlayingIdRef.current                   = nowPlayingId;
  const [playingTrack,   setPlayingTrack]   = useState<{id:string;name:string;artist:string;spotifyId?:string|null}|null>(null);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const requestedTrackRef                   = useRef<string | null>(null);
  requestedTrackRef.current                 = pendingTrackId;
  const pendingAudioRef                     = useRef<HTMLAudioElement | null>(null);
  const [deezerPreviews, setDeezerPreviews] = useState<Record<string, string>>({});
  const deezerPreviewsRef                   = useRef<Record<string, string>>({});

  // ── Mobile state ──────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false);
  const isMobileRef             = useRef(false);
  isMobileRef.current           = isMobile;
  const [viewportH, setViewportH] = useState(0);
  const [sheetSnap, setSheetSnap] = useState<0|1|2>(0);
  const sheetSnapRef              = useRef<0|1|2>(0);
  sheetSnapRef.current            = sheetSnap;
  const mobileTracklistRef        = useRef<HTMLDivElement | null>(null);
  const sheetSwipeStartY          = useRef<number | null>(null);
  const sheetSwipeStartTime       = useRef<number>(0);
  const [zoomAbove2, setZoomAbove2] = useState(false);
  const zoomAbove2Ref               = useRef(false);

  // ── Rotation / zoom refs ──────────────────────────────────────────────────
  // Initial rotation: rx=0.3, ry=π — flipped 180° from y=0 so "Other" (which
  // lands near the default front face) is rotated to the back.
  const rotMatRef     = useRef<number[]>(matFromEuler(SPHERE_INIT_RX, SPHERE_INIT_RY));
  const grabVecRef    = useRef<V3 | null>(null);
  const pinchStateRef = useRef({ active: false, dist0: 0, zoom0: 1 });
  const zoomRef       = useRef(1);
  const zoomTargetRef = useRef(1);
  const subRegionRef  = useRef<Map<number, number>>(new Map());
  const activeSubsRef = useRef<SubgenreItem[]>([]);
  const subPolesRef   = useRef<{ name: string; pole: V3 }[]>([]);
  const dragRef       = useRef({ active: false, lx: 0, ly: 0, moved: false });
  const rafRef        = useRef<number>(0);
  const labelHitsRef  = useRef<{ name:string; subgenre?:string; x1:number; y1:number; x2:number; y2:number }[]>([]);
  const regionPolesRef = useRef<{ name:string; pole:V3 }[]>([]);
  const faceCentsRef   = useRef<V3[]>([]);
  const faceRegionRef  = useRef<number[]>([]);
  const hoveredRef     = useRef<{ genre:string; subgenre?:string } | null>(null);
  const autoSelectedRef = useRef(false);
  const selectedRef     = useRef<string | null>(null);
  selectedRef.current   = selected;

  // ── Mobile detection ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── Sheet ↔ selection sync (mobile only) ─────────────────────────────────
  useEffect(() => {
    if (!isMobile) return;
    if (selected !== null) setSheetSnap(prev => prev === 0 ? 1 : prev);
    else setSheetSnap(0);
  }, [selected, isMobile]);

  // ── Body scroll lock when exploring on mobile ────────────────────────────
  useEffect(() => {
    if (!isMobile) return;
    if (selected !== null) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow            = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow            = "";
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow            = "";
    };
  }, [isMobile, selected]);

  // ── Poll zoomRef → zoomAbove2 (mobile zoom pill stage) ───────────────────
  useEffect(() => {
    if (!isMobile) return;
    const id = setInterval(() => {
      const above = zoomRef.current >= 2.0;
      if (above !== zoomAbove2Ref.current) {
        zoomAbove2Ref.current = above;
        setZoomAbove2(above);
      }
    }, 100);
    return () => clearInterval(id);
  }, [isMobile]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  // Appends ?userId=<id> when this component is rendering a specific user's world.
  const userParam = userId ? `?userId=${encodeURIComponent(userId)}` : "";

  async function loadWorld() {
    try {
      setLoading(true); setError(null);
      const res = await fetch(`/api/world${userParam}`);
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

  // ── Auto-sync (homepage / own-world only, not Midvale roommate views) ─────
  //
  // autoSync is redefined on every render so it always closes over fresh state.
  // autoSyncRef.current is updated each render so interval/event handlers
  // always call the latest version without stale closures.

  const autoSync = async () => {
    if (!isOwnWorld) {
      console.log("[autoSync] blocked", { userId, sessionUserId, isOwnWorld });
      return;
    }
    if (refreshingRef.current) return;           // manual sync already running
    if (Date.now() < backoffUntilRef.current) return; // rate-limit backoff

    console.log("[autoSync] running");
    try {
      setSyncStatus("syncing");
      const r = await fetch("/api/spotify/sync", { method: "POST" });

      if (r.status === 429) {
        const retryAfter = parseInt(r.headers.get("Retry-After") ?? "60", 10);
        backoffUntilRef.current = Date.now() + retryAfter * 1_000;
        console.warn(`[autoSync] rate limited — backing off ${retryAfter}s`);
        setSyncStatus("idle");
        return;
      }

      if (!r.ok) { setSyncStatus("idle"); return; }

      // Refresh world counts (drives sphere geometry + desktop panel counts)
      await loadWorld();

      // If a genre is zoomed in, silently refresh its tracks + subgenres
      if (selectedRef.current) {
        const enc = encodeURIComponent(selectedRef.current);
        fetch(`/api/world/${enc}`)
          .then(res => res.json())
          .then(d  => setTracks(d.tracks ?? []))
          .catch(() => {});
        fetch(`/api/world/${enc}/subgenres`)
          .then(res => res.json())
          .then(d  => setSubgenres(d.subgenres ?? []))
          .catch(() => {});
      }

      lastSyncRef.current = Date.now();
      setSyncStatus("synced");
      if (syncStatusTimerRef.current) clearTimeout(syncStatusTimerRef.current);
      syncStatusTimerRef.current = setTimeout(() => setSyncStatus("idle"), 2_500);
    } catch {
      setSyncStatus("idle");
    }
  };
  // Keep ref up-to-date so interval/event callbacks always use the latest closure
  autoSyncRef.current = autoSync;

  // Poll every 90 s while page is visible — mount/teardown whenever isOwnWorld changes
  useEffect(() => {
    console.log("[autoSync] mounted", { userId, sessionUserId, isOwnWorld });
    if (!isOwnWorld) return; // roommate worlds — no polling
    const INTERVAL_MS = 90_000;
    const id = setInterval(() => {
      if (Date.now() - lastSyncRef.current >= INTERVAL_MS) {
        autoSyncRef.current();
      }
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [isOwnWorld]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger once when the tab becomes visible again (after switching away)
  useEffect(() => {
    if (!isOwnWorld) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" &&
          Date.now() - lastSyncRef.current >= 60_000) {
        autoSyncRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isOwnWorld]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch tracks + subgenres + Deezer previews when genre selected ────────
  useEffect(() => {
    hoveredSubgRef.current = null; setHoveredSubgenre(null);
    if (!selected) {
      setTracks([]); setSubgenres([]);
      setSelectedSubgenre(null); selectedSubgenreRef.current = null;
      setZoomSubgenre(null);     zoomSubgenreRef.current     = null;
      deezerPreviewsRef.current = {}; setDeezerPreviews({});
      setSocialSort(false);
      return;
    }
    setSocialSort(false);
    setSelectedSubgenre(null); selectedSubgenreRef.current = null;
    setZoomSubgenre(null);     zoomSubgenreRef.current     = null;
    deezerPreviewsRef.current = {}; setDeezerPreviews({});

    const enc = encodeURIComponent(selected);
    setTracksLoading(true);
    fetch(`/api/world/${enc}${userParam}`).then(r=>r.json()).then(d => {
      const loaded: TrackItem[] = d.tracks ?? [];
      setTracks(loaded);
      const fetchPrev = (t: TrackItem) =>
        fetch(`/api/preview?track=${encodeURIComponent(t.name)}&artist=${encodeURIComponent(t.artist)}`)
          .then(r=>r.json()).then((data:{previewUrl:string|null})=>{
            if(data.previewUrl){deezerPreviewsRef.current[t.id]=data.previewUrl;setDeezerPreviews(prev=>({...prev,[t.id]:data.previewUrl!}));}
          }).catch(()=>{});
      (async()=>{for(let i=0;i<loaded.length;i+=5)await Promise.all(loaded.slice(i,i+5).map(fetchPrev));})();
    }).catch(()=>setTracks([])).finally(()=>setTracksLoading(false));

    fetch(`/api/world/${enc}/subgenres${userParam}`).then(r=>r.json()).then(d=>setSubgenres(d.subgenres??[])).catch(()=>setSubgenres([]));
  }, [selected]);

  // ── Poll hoveredRef → hoveredSubgenre state ───────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const ns = zoomRef.current >= 2.0 ? (hoveredRef.current?.subgenre ?? null) : null;
      if (ns !== hoveredSubgRef.current) { hoveredSubgRef.current = ns; setHoveredSubgenre(ns); }
    }, 100);
    return () => clearInterval(id);
  }, []);

  // ── playTrack ─────────────────────────────────────────────────────────────
  const playTrack = (t: TrackItem) => {
    const previewUrl = deezerPreviewsRef.current[t.id] ?? t.previewUrl ?? null;
    if (!previewUrl) {
      if (nowPlayingIdRef.current === t.id) {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        setNowPlayingId(null); setAudioPlaying(false); setPlayingTrack(null); return;
      }
      if (requestedTrackRef.current === t.id) return;
      requestedTrackRef.current = t.id; setPendingTrackId(t.id);
      if (pendingAudioRef.current) { pendingAudioRef.current.src = ""; pendingAudioRef.current = null; }
      const pa = new Audio(); pa.volume = 0.8; pendingAudioRef.current = pa;
      fetch(`/api/preview?track=${encodeURIComponent(t.name)}&artist=${encodeURIComponent(t.artist)}`)
        .then(r=>r.json()).then((d:{previewUrl:string|null})=>{
          if (requestedTrackRef.current !== t.id) return;
          requestedTrackRef.current = null; setPendingTrackId(null);
          if (!d.previewUrl) return;
          deezerPreviewsRef.current[t.id] = d.previewUrl; setDeezerPreviews(p=>({...p,[t.id]:d.previewUrl!}));
          const audio = pendingAudioRef.current; if (!audio) return;
          audio.src = d.previewUrl;
          if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
          audio.addEventListener("ended",()=>{setAudioPlaying(false);setNowPlayingId(null);setPlayingTrack(null);});
          audio.addEventListener("error",()=>{delete deezerPreviewsRef.current[t.id];setDeezerPreviews(p=>{const n={...p};delete n[t.id];return n;});setAudioPlaying(false);setNowPlayingId(null);setPlayingTrack(null);});
          audioRef.current = audio; pendingAudioRef.current = null;
          setNowPlayingId(t.id); setPlayingTrack({id:t.id,name:t.name,artist:t.artist,spotifyId:t.spotifyId??null}); setAudioPlaying(true);
          const p = audio.play();
          if (p) p.catch(()=>{if(audioRef.current===audio)audioRef.current=null;setAudioPlaying(false);setNowPlayingId(null);setPlayingTrack(null);});
        }).catch(()=>{});
      return;
    }
    if (nowPlayingIdRef.current === t.id) {
      if (audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0;audioRef.current=null;}
      setAudioPlaying(false);setNowPlayingId(null);setPlayingTrack(null);return;
    }
    requestedTrackRef.current=null;setPendingTrackId(null);
    if(pendingAudioRef.current){pendingAudioRef.current.src="";pendingAudioRef.current=null;}
    if(audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0;}
    const audio=new Audio(previewUrl); audio.volume=0.8;
    audio.addEventListener("ended",()=>{setAudioPlaying(false);setNowPlayingId(null);setPlayingTrack(null);});
    audio.addEventListener("error",()=>{delete deezerPreviewsRef.current[t.id];setDeezerPreviews(p=>{const n={...p};delete n[t.id];return n;});setAudioPlaying(false);setNowPlayingId(null);setPlayingTrack(null);});
    audioRef.current=audio;setNowPlayingId(t.id);setPlayingTrack({id:t.id,name:t.name,artist:t.artist,spotifyId:t.spotifyId??null});setAudioPlaying(true);
    const p=audio.play();
    if(p)p.catch(err=>{if(err.name!=="AbortError"){delete deezerPreviewsRef.current[t.id];setDeezerPreviews(p2=>{const n={...p2};delete n[t.id];return n;});setNowPlayingId(null);setAudioPlaying(false);setPlayingTrack(null);}else{setAudioPlaying(false);}});
  };

  // ── Mobile zoom pill handlers ─────────────────────────────────────────────
  const handleZoomPlus = () => {
    if (!selectedRef.current || zoomAbove2Ref.current) return;
    zoomTargetRef.current = 2.5;
  };
  const handleZoomMinus = () => {
    if (!selectedRef.current) return;
    if (zoomAbove2Ref.current) {
      zoomTargetRef.current = 1.5;
      selectedSubgenreRef.current = null; setSelectedSubgenre(null);
      zoomSubgenreRef.current     = null; setZoomSubgenre(null);
    } else {
      zoomTargetRef.current = 1;
      autoSelectedRef.current = false;
      selectedSubgenreRef.current = null; setSelectedSubgenre(null);
      zoomSubgenreRef.current     = null; setZoomSubgenre(null);
      setSelected(null);
    }
  };

  // ── Canvas / render + interaction ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loading || Object.keys(worlds).length === 0) return;

    // High-DPI: cap at 2× to avoid wasting GPU fill-rate on 3× screens
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

    const { verts, faces } = buildIcosphere(2);
    const entries = Object.entries(worlds);
    const total   = entries.reduce((s,[,c])=>s+c,0) || 1;
    const names   = entries.map(([n])=>n);
    const bonuses = entries.map(([,c])=>(Math.PI/4)*Math.sqrt(c/total));
    const cents   = faces.map(f=>triCentroid(verts,f));

    const { region: rawRegion, poles: finalPoles } = lloydRelax(cents, fiboPoles(names.length), bonuses, 8);
    regionPolesRef.current = names.map((n,i)=>({name:n,pole:finalPoles[i]}));

    const adj    = buildAdjacency(faces);
    const region = removeIslands(rawRegion, adj, names.length);

    // Expose per-face data for accurate click/tap hit testing
    faceCentsRef.current  = cents;
    faceRegionRef.current = region;

    // ── Subgenre Voronoi ──────────────────────────────────────────────────
    subRegionRef.current = new Map(); activeSubsRef.current = []; subPolesRef.current = [];
    if (selected !== null && subgenres.length > 0) {
      const selIdx = names.indexOf(selected);
      if (selIdx >= 0) {
        const gfi = faces.map((_,i)=>i).filter(i=>region[i]===selIdx);
        if (gfi.length > 0) {
          const maxSubs = Math.max(1, Math.floor(gfi.length/3));
          const actSubs = subgenres.slice(0, maxSubs);
          activeSubsRef.current = actSubs;
          const n = actSubs.length;
          const gfiSet = new Set(gfi);
          const subAdj = new Map<number,number[]>(gfi.map(fi=>[fi,adj[fi].filter(ni=>gfiSet.has(ni))]));
          const subTotal = actSubs.reduce((s,sg)=>s+sg.count,0)||1;
          const targets  = actSubs.map(sg=>Math.max(1,Math.round((sg.count/subTotal)*gfi.length)));
          const tSum = targets.reduce((s,t)=>s+t,0); let surplus=gfi.length-tSum;
          if(surplus>0){for(let i=0;surplus>0;i=(i+1)%n){targets[i]++;surplus--;}}
          else if(surplus<0){for(let i=n-1;surplus<0;i=((i-1)+n)%n){if(targets[i]>1){targets[i]--;surplus++;}}}
          let psx=0,psy=0,psz=0;
          for(const fi of gfi){psx+=cents[fi][0];psy+=cents[fi][1];psz+=cents[fi][2];}
          psx/=gfi.length;psy/=gfi.length;psz/=gfi.length;
          let firstSeed=gfi[0],bestCentDot=-Infinity;
          for(const fi of gfi){const d=cents[fi][0]*psx+cents[fi][1]*psy+cents[fi][2]*psz;if(d>bestCentDot){bestCentDot=d;firstSeed=fi;}}
          const seedFaces=[firstSeed];
          const minDist=new Float32Array(gfi.length).fill(Infinity);
          const updateDists=(sf:number)=>{const[sx,sy,sz]=cents[sf];for(let j=0;j<gfi.length;j++){const[fx,fy,fz]=cents[gfi[j]];const dot=Math.min(1,Math.max(-1,fx*sx+fy*sy+fz*sz));const d=Math.acos(dot);if(d<minDist[j])minDist[j]=d;}};
          updateDists(firstSeed);
          for(let s=1;s<n;s++){let fj=0;for(let j=1;j<gfi.length;j++){if(minDist[j]>minDist[fj])fj=j;}seedFaces.push(gfi[fj]);updateDists(gfi[fj]);}
          const assignment=new Map<number,number>(),frontiers: number[][]=Array.from({length:n},()=>[]);
          const rCounts=new Array<number>(n).fill(0);
          for(let i=0;i<n;i++){assignment.set(seedFaces[i],i);frontiers[i].push(seedFaces[i]);rCounts[i]=1;}
          let totalA=n;
          while(totalA<gfi.length){let grew=false;for(let i=0;i<n;i++){if(rCounts[i]>=targets[i]||!frontiers[i].length)continue;let found=false;while(frontiers[i].length>0&&!found){const fi2=frontiers[i][0];let cl=false;for(const ni of(subAdj.get(fi2)??[])){if(!assignment.has(ni)){assignment.set(ni,i);rCounts[i]++;totalA++;frontiers[i].push(ni);cl=true;found=true;grew=true;break;}}if(!cl)frontiers[i].shift();}}if(!grew)break;}
          let mopping=true;while(mopping){mopping=false;for(const fi of gfi){if(assignment.has(fi))continue;for(const ni of(subAdj.get(fi)??[])){if(assignment.has(ni)){assignment.set(fi,assignment.get(ni)!);mopping=true;break;}}}}
          for(const fi of gfi){if(!assignment.has(fi))assignment.set(fi,0);}
          subRegionRef.current=assignment;
          const pAcc: V3[]=Array.from({length:n},()=>[0,0,0] as V3);const pCnt=new Int32Array(n);
          for(const[fi2,si] of assignment){pAcc[si][0]+=cents[fi2][0];pAcc[si][1]+=cents[fi2][1];pAcc[si][2]+=cents[fi2][2];pCnt[si]++;}
          subPolesRef.current=actSubs.map((sub,i)=>({name:sub.name,pole:pCnt[i]>0?norm3([pAcc[i][0]/pCnt[i],pAcc[i][1]/pCnt[i],pAcc[i][2]/pCnt[i]]):cents[seedFaces[i]]}));
        }
      }
    }

    const rgbMap: [number,number,number][] = names.map(n=>hexRgb(COLORS[n]??"#71717a"));
    const FOV = 900;
    const MIN_ZOOM = 1.0, MAX_ZOOM = 5.0;
    let snapZoom = false;  // set on mobile pinch-end for immediate snap

    // ── drawFrame ──────────────────────────────────────────────────────────
    function drawFrame() {
      // Zoom lerp (desktop) / snap (mobile pinch end)
      if (snapZoom) { zoomRef.current = zoomTargetRef.current; snapZoom = false; }
      else           { zoomRef.current += (zoomTargetRef.current - zoomRef.current) * 0.10; }

      const canvas = canvasRef.current; if (!canvas) return;
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      if (!W || !H) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);  // HiDPI

      const R = Math.min(W,H) * 0.34 * zoomRef.current;
      const cx = W/2, cy = H/2;
      const [m0,m1,m2,m3,m4,m5,m6,m7,m8] = rotMatRef.current;
      labelHitsRef.current = [];
      ctx.clearRect(0, 0, W, H);

      const atmo = ctx.createRadialGradient(cx,cy,R*0.82,cx,cy,R*1.22);
      atmo.addColorStop(0,"rgba(70,70,180,0.13)"); atmo.addColorStop(1,"rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(cx,cy,R*1.22,0,Math.PI*2); ctx.fillStyle=atmo; ctx.fill();

      const pv = verts.map(([x,y,z])=>{
        const xs=m0*x+m1*y+m2*z, ys=m3*x+m4*y+m5*z, zs=m6*x+m7*y+m8*z;
        const s=FOV/(FOV+zs);
        return {sx:cx+xs*R*s, sy:cy+ys*R*s, z:zs};
      });

      const fd=faces.map((tri,i)=>({tri,fi:i,depth:(pv[tri[0]].z+pv[tri[1]].z+pv[tri[2]].z)/3,ri:region[i]})).sort((a,b)=>a.depth-b.depth);
      const selectedIdx=selected!==null?names.indexOf(selected):-1;
      const hoveredGenre=hoveredRef.current?.genre??null;
      const hoveredSubName=hoveredRef.current?.subgenre??null;
      const hoveredIdx=hoveredGenre!==null?names.indexOf(hoveredGenre):-1;
      const subgReveal=Math.min(1,Math.max(0,(zoomRef.current-1.6)/0.5));

      for (const {tri,fi,depth,ri} of fd) {
        const [ia,ib,ic]=tri;
        const isFront=depth>=0, isSelected=ri===selectedIdx, isHovG=ri===hoveredIdx&&!isSelected;
        const subIdx=isSelected&&zoomRef.current>=1.6?subRegionRef.current.get(fi):undefined;
        const showSub=subIdx!==undefined;
        const subName=showSub?activeSubsRef.current[subIdx!]?.name:undefined;
        const isHovSub=showSub&&!!subName&&subName===hoveredSubName;
        const isClickSub=showSub&&!!subName&&subName===selectedSubgenreRef.current;
        const sibHov=showSub&&!!hoveredSubName&&!isHovSub;
        let [r,g,b]=rgbMap[ri];
        if(showSub){const sc=0.55;r=Math.round(r*sc);g=Math.round(g*sc);b=Math.round(b*sc);}
        ctx.beginPath();ctx.moveTo(pv[ia].sx,pv[ia].sy);ctx.lineTo(pv[ib].sx,pv[ib].sy);ctx.lineTo(pv[ic].sx,pv[ic].sy);ctx.closePath();
        if(isFront){
          const hs=selectedIdx>=0;
          const fa=isClickSub?0.52*subgReveal:isHovSub?0.35*subgReveal:sibHov?0.06*subgReveal:showSub?0.08*subgReveal:isSelected?0.28:isHovG?0.15:hs?0.015:0.02;
          ctx.fillStyle=`rgba(${r},${g},${b},${fa})`;ctx.fill();
          const ea=isClickSub?0.90*subgReveal:isHovSub?0.65*subgReveal:sibHov?0.03*subgReveal:showSub?0.05*subgReveal:isSelected?1.0:isHovG?0.95:hs?0.60:0.82;
          ctx.strokeStyle=`rgba(${r},${g},${b},${ea})`;
          ctx.lineWidth=isClickSub?0.70:isHovSub?0.55:showSub?0.30:isSelected?1.4:isHovG?1.2:hs?0.75:0.9;ctx.stroke();
        } else {
          const t=Math.max(0,(depth+0.8)/0.8)*0.13;ctx.strokeStyle=`rgba(${r},${g},${b},${t.toFixed(3)})`;ctx.lineWidth=0.4;ctx.stroke();
        }
      }

      // Subgenre boundary edges
      if (zoomRef.current>=1.6&&selectedIdx>=0&&subRegionRef.current.size>0) {
        const [br,bg,bb]=rgbMap[selectedIdx]; ctx.save();
        ctx.shadowColor=`rgba(${br},${bg},${bb},${(0.55*subgReveal).toFixed(3)})`;ctx.shadowBlur=5;
        ctx.strokeStyle=`rgba(${br},${bg},${bb},${(0.82*subgReveal).toFixed(3)})`;ctx.lineWidth=1.6;ctx.lineCap="round";
        const de=new Set<string>();
        for(const{fi,depth,ri} of fd){if(ri!==selectedIdx||depth<0)continue;const siA=subRegionRef.current.get(fi);if(siA===undefined)continue;for(const ni of adj[fi]){const siB=subRegionRef.current.get(ni);if(siB===undefined||siB===siA)continue;const fv=faces[fi],nv=faces[ni],sh=fv.filter(v=>nv.includes(v));if(sh.length!==2)continue;const k=sh[0]<sh[1]?`${sh[0]}:${sh[1]}`:`${sh[1]}:${sh[0]}`;if(de.has(k))continue;de.add(k);ctx.beginPath();ctx.moveTo(pv[sh[0]].sx,pv[sh[0]].sy);ctx.lineTo(pv[sh[1]].sx,pv[sh[1]].sy);ctx.stroke();}}
        ctx.restore();
      }

      // Main genre plate boundary
      if (selectedIdx>=0) {
        const [pr,pg,pb]=rgbMap[selectedIdx]; ctx.save();
        ctx.shadowColor=`rgba(${pr},${pg},${pb},0.85)`;ctx.shadowBlur=10;ctx.strokeStyle=`rgba(${pr},${pg},${pb},1.0)`;ctx.lineWidth=3.0;ctx.lineCap="round";
        const dp=new Set<string>();
        for(const{fi,depth,ri} of fd){if(ri!==selectedIdx||depth<0)continue;for(const ni of adj[fi]){if(region[ni]===selectedIdx)continue;const fv=faces[fi],nv=faces[ni],sh=fv.filter(v=>nv.includes(v));if(sh.length!==2)continue;const k=sh[0]<sh[1]?`${sh[0]}:${sh[1]}`:`${sh[1]}:${sh[0]}`;if(dp.has(k))continue;dp.add(k);ctx.beginPath();ctx.moveTo(pv[sh[0]].sx,pv[sh[0]].sy);ctx.lineTo(pv[sh[1]].sx,pv[sh[1]].sy);ctx.stroke();}}
        ctx.restore();
      }

      // Genre labels (short names)
      const acc: Record<number,{sx:number;sy:number;n:number}>={};
      for(const{tri,depth,ri} of fd){if(depth<0)continue;const[ia,ib,ic]=tri;const lx=(pv[ia].sx+pv[ib].sx+pv[ic].sx)/3,ly=(pv[ia].sy+pv[ib].sy+pv[ic].sy)/3;if(!acc[ri])acc[ri]={sx:0,sy:0,n:0};acc[ri].sx+=lx;acc[ri].sy+=ly;acc[ri].n++;}
      ctx.textAlign="center";ctx.textBaseline="middle";
      for(const[riStr,a] of Object.entries(acc)){
        if(a.n<4)continue;
        const ri=Number(riStr),isSelG=ri===selectedIdx;
        // On mobile, hide the selected genre label when deeply zoomed in (subgenre labels dominate)
        if(isMobileRef.current&&isSelG&&zoomRef.current>=1.9)continue;
        const rawLx=a.sx/a.n,rawLy=a.sy/a.n;
        const lx=isSelG?Math.max(80,Math.min(W-80,rawLx)):rawLx;
        const ly=isSelG?Math.max(24,Math.min(H*0.88,rawLy)):rawLy;
        const name=names[ri],label=shortLabel(name);
        const[r,g,b]=rgbMap[ri];
        const isThisHov=ri===hoveredIdx;
        const labelDim=isSelG||isThisHov?1.0:selectedIdx>=0?0.50:1.0;
        const fs=isMobileRef.current?(isSelG?15:13):(isSelG?15:13);
        ctx.globalAlpha=labelDim;ctx.font=`700 ${fs}px system-ui, sans-serif`;
        const tw=ctx.measureText(label).width,pad=8,rad=8;
        const bx=lx-tw/2-pad,by=ly-fs/2-pad,bw=tw+pad*2,bh=fs+pad*2;
        ctx.save();ctx.shadowColor="rgba(0,0,0,0.75)";ctx.shadowBlur=14;ctx.fillStyle=isSelG?"rgba(8,8,16,0.90)":"rgba(8,8,16,0.72)";ctx.beginPath();ctx.roundRect(bx,by,bw,bh,rad);ctx.fill();ctx.restore();
        if(isSelG){ctx.strokeStyle=`rgba(${r},${g},${b},0.7)`;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(bx,by,bw,bh,rad);ctx.stroke();}
        ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillText(label,lx,ly);ctx.globalAlpha=1.0;
        labelHitsRef.current.push({name,x1:bx,y1:by,x2:bx+bw,y2:by+bh});
      }

      // Subgenre labels
      if (zoomRef.current>=1.6&&selectedIdx>=0) {
        const stm=new Map<number,{sx:number;sy:number;n:number}>();
        for(const{tri,fi,depth,ri} of fd){if(ri!==selectedIdx||depth<-0.1)continue;const si=subRegionRef.current.get(fi);if(si===undefined)continue;const[ia,ib,ic]=tri;const tsx=(pv[ia].sx+pv[ib].sx+pv[ic].sx)/3,tsy=(pv[ia].sy+pv[ib].sy+pv[ic].sy)/3;const a=stm.get(si);if(a){a.sx+=tsx;a.sy+=tsy;a.n++;}else stm.set(si,{sx:tsx,sy:tsy,n:1});}
        // On mobile, subgenre labels appear later (zoom >= 1.9)
        const zoomThresh=isMobileRef.current?1.9:1.6;
        const labelReveal=Math.min(1,Math.max(0,(zoomRef.current-zoomThresh)/0.2));
        ctx.globalAlpha=labelReveal;
        activeSubsRef.current.forEach((sub,si)=>{
          const a=stm.get(si);if(!a)return;
          const lx=a.sx/a.n,ly=a.sy/a.n;
          const n2=activeSubsRef.current.length,t=n2>1?1-si/(n2-1):0.5,scale=0.45+0.55*t;
          const[pr,pg,pb]=rgbMap[selectedIdx];
          const cr=Math.round(pr*scale),cg=Math.round(pg*scale),cb=Math.round(pb*scale);
          const isAS=selectedSubgenreRef.current===sub.name,isHS=hoveredSubName===sub.name,subLit=isAS||isHS;
          const fs=isMobileRef.current?(subLit?14:12):(subLit?12:11);
          ctx.font=`${subLit?700:600} ${fs}px system-ui, sans-serif`;
          const tw=ctx.measureText(sub.name).width,pad=6,rad=6;
          const bx=lx-tw/2-pad,by=ly-fs/2-pad,bw=tw+pad*2,bh=fs+pad*2;
          ctx.save();ctx.shadowColor=isHS?`rgba(${cr},${cg},${cb},0.45)`:"rgba(0,0,0,0.55)";ctx.shadowBlur=isHS?12:8;
          ctx.fillStyle=isAS?`rgba(${cr},${cg},${cb},0.18)`:isHS?`rgba(${cr},${cg},${cb},0.12)`:"rgba(8,8,16,0.60)";
          ctx.beginPath();ctx.roundRect(bx,by,bw,bh,rad);ctx.fill();ctx.restore();
          if(isAS){ctx.strokeStyle=`rgba(${cr},${cg},${cb},1.0)`;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(bx,by,bw,bh,rad);ctx.stroke();}
          else if(isHS){ctx.strokeStyle=`rgba(${cr},${cg},${cb},0.60)`;ctx.lineWidth=1.0;ctx.beginPath();ctx.roundRect(bx,by,bw,bh,rad);ctx.stroke();}
          ctx.fillStyle=isHS?`rgb(${cr},${cg},${cb})`:`rgba(${cr},${cg},${cb},0.80)`;ctx.fillText(sub.name,lx,ly);
          labelHitsRef.current.push({name:selected!,subgenre:sub.name,x1:bx,y1:by,x2:bx+bw,y2:by+bh});
        });
        ctx.globalAlpha=1.0;
      }
      ctx.textBaseline="alphabetic";
    }

    // ── Shared zoom helper ────────────────────────────────────────────────
    const applyZoomDelta = (rawDelta: number) => {
      const cd=Math.max(-50,Math.min(50,rawDelta));
      const newT=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoomTargetRef.current*(1-cd*0.008)));
      zoomTargetRef.current=newT;
      if(newT>=1.2&&selectedRef.current===null&&regionPolesRef.current.length>0){
        const[,,,,,,rm6,rm7,rm8]=rotMatRef.current;
        let bn=regionPolesRef.current[0].name,bz=-Infinity;
        for(const{name,pole:[px,py,pz]} of regionPolesRef.current){const z2=rm6*px+rm7*py+rm8*pz;if(z2>bz){bz=z2;bn=name;}}
        autoSelectedRef.current=true;setSelected(bn);
      }
      if(newT<2.0){if(zoomSubgenreRef.current!==null){zoomSubgenreRef.current=null;setZoomSubgenre(null);}if(selectedSubgenreRef.current!==null){selectedSubgenreRef.current=null;setSelectedSubgenre(null);}}
      if(newT<=MIN_ZOOM+0.1&&selectedRef.current!==null){autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);setSelected(null);}
    };

    // ── Wheel handler ──────────────────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      const rect=canvas.getBoundingClientRect();
      const W2=canvas.clientWidth,H2=canvas.clientHeight;
      const R2=Math.min(W2,H2)*0.34*zoomRef.current;
      const dx=e.clientX-rect.left-W2/2,dy=e.clientY-rect.top-H2/2;
      const over=dx*dx+dy*dy<=R2*R2;
      if(e.ctrlKey&&over&&e.deltaY>0&&zoomTargetRef.current<=MIN_ZOOM+0.02){e.preventDefault();return;}
      if(!over)return;
      if(e.deltaY>0&&zoomTargetRef.current<=MIN_ZOOM+0.02)return;
      if(!(selectedRef.current!==null||zoomTargetRef.current>1.05)&&e.deltaY>0)return;
      e.preventDefault();applyZoomDelta(e.deltaY);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // ── Safari GestureEvent (trackpad pinch fallback) ─────────────────────
    let gestureStartScale=1;
    const onGestureStart=(e:Event)=>{gestureStartScale=(e as any).scale??1;};
    const onGestureChange=(e:Event)=>{const sc=(e as any).scale??1;if(sc<gestureStartScale&&zoomTargetRef.current<=MIN_ZOOM+0.02)e.preventDefault();};
    const onGestureEnd=(e:Event)=>{if(zoomTargetRef.current<=MIN_ZOOM+0.02)e.preventDefault();gestureStartScale=1;};
    canvas.addEventListener("gesturestart",  onGestureStart,  { passive: true  });
    canvas.addEventListener("gesturechange", onGestureChange, { passive: false });
    canvas.addEventListener("gestureend",    onGestureEnd,    { passive: false });

    // ── Touch handlers (mobile: arcball drag + pinch zoom) ─────────────────
    let touchDrag  = { active: false, lx: 0, ly: 0, moved: false };
    let touchGrabVec: V3 | null = null;
    let pinchActive = pinchStateRef.current.active;
    let pinchDist0  = pinchStateRef.current.dist0;
    let pinchZoom0  = pinchStateRef.current.zoom0;
    let lastTapTime = 0, lastTapX = 0, lastTapY = 0;

    const touchOverSphere = (cx2: number, cy2: number) => {
      const rect2=canvas.getBoundingClientRect();
      const mx2=cx2-rect2.left,my2=cy2-rect2.top;
      const W2=canvas.clientWidth,H2=canvas.clientHeight;
      const R2=Math.min(W2,H2)*0.40*zoomRef.current;
      const dx2=mx2-W2/2,dy2=my2-H2/2;
      return dx2*dx2+dy2*dy2<=R2*R2;
    };

    const onTouchStart=(e:TouchEvent)=>{
      const touches=e.touches;
      if(touches.length===1){
        const t=touches[0];
        if(!touchOverSphere(t.clientX,t.clientY))return;
        e.preventDefault();
        touchDrag={active:true,lx:t.clientX,ly:t.clientY,moved:false};
        {const rect2=canvas.getBoundingClientRect();const W2=canvas.clientWidth,H2=canvas.clientHeight;const R2=Math.min(W2,H2)*0.35*zoomRef.current;touchGrabVec=arcballVec(t.clientX-rect2.left,t.clientY-rect2.top,W2/2,H2/2,R2);}
        const now=performance.now(),dtx=t.clientX-lastTapX,dty=t.clientY-lastTapY;
        if(now-lastTapTime<320&&dtx*dtx+dty*dty<55*55)applyZoomDelta(-120);
      } else if(touches.length===2){
        e.preventDefault();
        pinchActive=true;
        const dx=touches[0].clientX-touches[1].clientX,dy=touches[0].clientY-touches[1].clientY;
        pinchDist0=Math.sqrt(dx*dx+dy*dy);pinchZoom0=zoomTargetRef.current;
        touchDrag.active=false;
        pinchStateRef.current={active:true,dist0:pinchDist0,zoom0:pinchZoom0};
      }
    };

    const onTouchMove=(e:TouchEvent)=>{
      const touches=e.touches;
      if(touches.length===1&&touchDrag.active){
        e.preventDefault();
        const t=touches[0];
        if(touchGrabVec){
          const rect2=canvas.getBoundingClientRect();const W2=canvas.clientWidth,H2=canvas.clientHeight;const R2=Math.min(W2,H2)*0.35*zoomRef.current;
          const nv=arcballVec(t.clientX-rect2.left,t.clientY-rect2.top,W2/2,H2/2,R2);
          const q=quatFromTo(touchGrabVec,nv);
          rotMatRef.current=mat3Ortho(mat3Premul(matFromQuat(q),rotMatRef.current));
          touchGrabVec=nv;
        }
        const dx=t.clientX-touchDrag.lx,dy=t.clientY-touchDrag.ly;
        touchDrag.lx=t.clientX;touchDrag.ly=t.clientY;
        if(Math.abs(dx)>3||Math.abs(dy)>3)touchDrag.moved=true;
        hoveredRef.current=null;
        if(selected!==null&&zoomRef.current>=1.1&&regionPolesRef.current.length>0){
          const se=regionPolesRef.current.find(r=>r.name===selected);
          if(se){const[px,py,pz]=se.pole;const[,,,,,,sm6,sm7,sm8]=rotMatRef.current;if(sm6*px+sm7*py+sm8*pz<0){autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);setSelected(null);}}
        }
      } else if(touches.length===2&&pinchActive){
        e.preventDefault();
        const dx=touches[0].clientX-touches[1].clientX,dy=touches[0].clientY-touches[1].clientY;
        const newDist=Math.sqrt(dx*dx+dy*dy);
        const newZoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,pinchZoom0*(newDist/pinchDist0)));
        // Write both so there's no lerp lag during pinch
        zoomTargetRef.current=newZoom;zoomRef.current=newZoom;
        if(newZoom>=1.2&&selectedRef.current===null&&regionPolesRef.current.length>0){
          const[,,,,,,pm6,pm7,pm8]=rotMatRef.current;let bn=regionPolesRef.current[0].name,bz=-Infinity;
          for(const{name,pole:[px,py,pz]} of regionPolesRef.current){const z2=pm6*px+pm7*py+pm8*pz;if(z2>bz){bz=z2;bn=name;}}
          autoSelectedRef.current=true;setSelected(bn);
        }
        if(newZoom<2.0){if(zoomSubgenreRef.current!==null){zoomSubgenreRef.current=null;setZoomSubgenre(null);}if(selectedSubgenreRef.current!==null){selectedSubgenreRef.current=null;setSelectedSubgenre(null);}}
        if(newZoom<=MIN_ZOOM+0.1&&selectedRef.current!==null){autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);setSelected(null);}
      }
    };

    const onTouchEnd=(e:TouchEvent)=>{
      const remaining=e.touches.length,wasPinching=pinchActive,wasDragging=touchDrag.active,wasMoved=touchDrag.moved;
      if(remaining===0){
        if(wasPinching)snapZoom=true;
        pinchActive=false;pinchStateRef.current.active=false;touchDrag.active=false;
        if(!wasPinching&&wasDragging&&!wasMoved){
          const ct=e.changedTouches[0];
          const rect3=canvas.getBoundingClientRect();const mx3=ct.clientX-rect3.left,my3=ct.clientY-rect3.top;
          lastTapTime=performance.now();lastTapX=ct.clientX;lastTapY=ct.clientY;
          // Label hit test with enlarged tap target
          for(const h of labelHitsRef.current){
            const E=10;
            if(mx3>=h.x1-E&&mx3<=h.x2+E&&my3>=h.y1-E&&my3<=h.y2+E){
              if(h.subgenre){const next=selectedSubgenreRef.current===h.subgenre?null:h.subgenre;selectedSubgenreRef.current=next;setSelectedSubgenre(next);}
              else{const isDe=selectedRef.current===h.name;autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);setSelected(prev=>prev===h.name?null:h.name);if(!isDe)zoomTargetRef.current=Math.max(zoomTargetRef.current,2.5);}
              return;
            }
          }
          // Sphere hit test
          const W3=canvas.clientWidth,H3=canvas.clientHeight,R3=Math.min(W3,H3)*0.35*zoomRef.current;
          const nx3=(mx3-W3/2)/R3,ny3=(my3-H3/2)/R3;
          if(nx3*nx3+ny3*ny3>1.0){autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);setSelected(null);}
          else {
            const nz3=Math.sqrt(Math.max(0,1-nx3*nx3-ny3*ny3));
            const[tm0,tm1,tm2,tm3,tm4,tm5,tm6,tm7,tm8]=rotMatRef.current;
            const x_w=tm0*nx3+tm3*ny3+tm6*nz3,y_w=tm1*nx3+tm4*ny3+tm7*nz3,z_w=tm2*nx3+tm5*ny3+tm8*nz3;
            const fCT=faceCentsRef.current,fRT=faceRegionRef.current;
            let bestTName: string;
            if(fCT.length>0&&fRT.length>0){let bi=0,bd=-Infinity;for(let i=0;i<fCT.length;i++){const d=fCT[i][0]*x_w+fCT[i][1]*y_w+fCT[i][2]*z_w;if(d>bd){bd=d;bi=i;}}bestTName=regionPolesRef.current[fRT[bi]]?.name??regionPolesRef.current[0].name;}
            else{let bt=regionPolesRef.current[0],bdot=-Infinity;for(const rd of regionPolesRef.current){const d=rd.pole[0]*x_w+rd.pole[1]*y_w+rd.pole[2]*z_w;if(d>bdot){bdot=d;bt=rd;}}bestTName=bt.name;}
            if(selected!==null&&zoomRef.current>=2.0&&bestTName===selected&&subPolesRef.current.length>0){
              const sft=[...subRegionRef.current.keys()];let bsf=sft[0]??-1,bsd=-Infinity;for(const fi of sft){const c=fCT[fi];if(!c)continue;const d=c[0]*x_w+c[1]*y_w+c[2]*z_w;if(d>bsd){bsd=d;bsf=fi;}}
              const si=subRegionRef.current.get(bsf)??0,sn=activeSubsRef.current[si]?.name??subPolesRef.current[0]?.name??"";
              const next=selectedSubgenreRef.current===sn?null:sn;selectedSubgenreRef.current=next;setSelectedSubgenre(next);
            } else {
              const isDe=selectedRef.current===bestTName;autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);setSelected(prev=>prev===bestTName?null:bestTName);
              if(!isDe)zoomTargetRef.current=Math.max(zoomTargetRef.current,2.5);
            }
          }
        }
      } else if(remaining===1&&wasPinching){
        pinchActive=false;pinchStateRef.current.active=false;snapZoom=true;
        const t=e.touches[0];touchDrag={active:true,lx:t.clientX,ly:t.clientY,moved:false};
        const rect2=canvas.getBoundingClientRect();const W2=canvas.clientWidth,H2=canvas.clientHeight;const R2=Math.min(W2,H2)*0.35*zoomRef.current;
        touchGrabVec=arcballVec(t.clientX-rect2.left,t.clientY-rect2.top,W2/2,H2/2,R2);
      }
    };

    const onTouchCancel=()=>{touchDrag.active=false;touchGrabVec=null;pinchActive=false;pinchStateRef.current.active=false;};

    canvas.addEventListener("touchstart",  onTouchStart,  { passive: false });
    canvas.addEventListener("touchmove",   onTouchMove,   { passive: false });
    canvas.addEventListener("touchend",    onTouchEnd,    { passive: false });
    canvas.addEventListener("touchcancel", onTouchCancel, { passive: true  });

    function animate() { drawFrame(); rafRef.current = requestAnimationFrame(animate); }
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("wheel",          onWheel);
      canvas.removeEventListener("gesturestart",   onGestureStart);
      canvas.removeEventListener("gesturechange",  onGestureChange);
      canvas.removeEventListener("gestureend",     onGestureEnd);
      canvas.removeEventListener("touchstart",     onTouchStart);
      canvas.removeEventListener("touchmove",      onTouchMove);
      canvas.removeEventListener("touchend",       onTouchEnd);
      canvas.removeEventListener("touchcancel",    onTouchCancel);
    };
  }, [worlds, loading, selected, subgenres]);

  // ── Desktop mouse handlers (arcball, same model as mobile) ────────────────

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY, moved: false };
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const R = Math.min(W, H) * 0.35 * zoomRef.current;
    grabVecRef.current = arcballVec(e.clientX - rect.left, e.clientY - rect.top, W/2, H/2, R);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active && grabVecRef.current) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const R = Math.min(W, H) * 0.35 * zoomRef.current;
      const nv = arcballVec(e.clientX - rect.left, e.clientY - rect.top, W/2, H/2, R);
      const q = quatFromTo(grabVecRef.current, nv);
      rotMatRef.current  = mat3Ortho(mat3Premul(matFromQuat(q), rotMatRef.current));
      grabVecRef.current = nv;
      dragRef.current.lx = e.clientX; dragRef.current.ly = e.clientY;
      dragRef.current.moved = true;
      hoveredRef.current = null;
      if (selected !== null && zoomRef.current >= 1.1 && regionPolesRef.current.length > 0) {
        const se = regionPolesRef.current.find(r => r.name === selected);
        if (se) { const [px,py,pz]=se.pole; const [,,,,,,dm6,dm7,dm8]=rotMatRef.current; if(dm6*px+dm7*py+dm8*pz<0){autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);setSelected(null);}}
      }
      return;
    }
    const canvas=canvasRef.current; if(!canvas)return;
    const rect=canvas.getBoundingClientRect();
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    for(const h of labelHitsRef.current){if(mx>=h.x1&&mx<=h.x2&&my>=h.y1&&my<=h.y2){hoveredRef.current=h.subgenre?{genre:h.name,subgenre:h.subgenre}:{genre:h.name};return;}}
    // Sphere hit test
    const W=canvas.clientWidth,H=canvas.clientHeight,R=Math.min(W,H)*0.35*zoomRef.current;
    const nx=(mx-W/2)/R,ny=(my-H/2)/R;
    if(nx*nx+ny*ny>1){hoveredRef.current=null;return;}
    const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const[hm0,hm1,hm2,hm3,hm4,hm5,hm6,hm7,hm8]=rotMatRef.current;
    const x_w=hm0*nx+hm3*ny+hm6*nz,y_w=hm1*nx+hm4*ny+hm7*nz,z_w=hm2*nx+hm5*ny+hm8*nz;
    const fC=faceCentsRef.current,fR=faceRegionRef.current;
    let genreName: string;
    if(fC.length>0&&fR.length>0){let bi=0,bd=-Infinity;for(let i=0;i<fC.length;i++){const d=fC[i][0]*x_w+fC[i][1]*y_w+fC[i][2]*z_w;if(d>bd){bd=d;bi=i;}}genreName=regionPolesRef.current[fR[bi]]?.name??"";}
    else{let bt=regionPolesRef.current[0],bdot=-Infinity;for(const rd of regionPolesRef.current){const d=rd.pole[0]*x_w+rd.pole[1]*y_w+rd.pole[2]*z_w;if(d>bdot){bdot=d;bt=rd;}}genreName=bt.name;}
    if(!genreName){hoveredRef.current=null;return;}
    if(selected!==null&&zoomRef.current>=2.0&&genreName===selected&&subPolesRef.current.length>0){
      const nx2=(mx-W/2)/R,ny2=(my-H/2)/R;
      if(nx2*nx2+ny2*ny2<=1){
        const nz2=Math.sqrt(Math.max(0,1-nx2*nx2-ny2*ny2));
        const[mm0,mm1,mm2,mm3,mm4,mm5,mm6,mm7,mm8]=rotMatRef.current;
        const x_w2=mm0*nx2+mm3*ny2+mm6*nz2,y_w2=mm1*nx2+mm4*ny2+mm7*nz2,z_w2=mm2*nx2+mm5*ny2+mm8*nz2;
        const sft=[...subRegionRef.current.keys()];let bsf=sft[0]??-1,bsd=-Infinity;
        for(const fi of sft){const c=fC[fi];if(!c)continue;const d=c[0]*x_w2+c[1]*y_w2+c[2]*z_w2;if(d>bsd){bsd=d;bsf=fi;}}
        const si=subRegionRef.current.get(bsf)??0;
        const sn=activeSubsRef.current[si]?.name??subPolesRef.current[0]?.name??"";
        hoveredRef.current={genre:genreName,subgenre:sn};return;
      }
    }
    hoveredRef.current={genre:genreName};
  };

  const stopDrag   = () => { dragRef.current.active = false; };
  const onMouseLeave = () => { dragRef.current.active = false; hoveredRef.current = null; };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.moved) return;
    const canvas=canvasRef.current!;const rect=canvas.getBoundingClientRect();
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    for(const h of labelHitsRef.current){if(mx>=h.x1&&mx<=h.x2&&my>=h.y1&&my<=h.y2){if(h.subgenre){const next=selectedSubgenreRef.current===h.subgenre?null:h.subgenre;selectedSubgenreRef.current=next;setSelectedSubgenre(next);}else{autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);setSelected(p=>p===h.name?null:h.name);}return;}}
    const W=canvas.clientWidth,H=canvas.clientHeight,R=Math.min(W,H)*0.35*zoomRef.current;
    const nx=(mx-W/2)/R,ny=(my-H/2)/R;
    if(nx*nx+ny*ny>1){autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);setSelected(null);return;}
    const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const[cm0,cm1,cm2,cm3,cm4,cm5,cm6,cm7,cm8]=rotMatRef.current;
    const x_w=cm0*nx+cm3*ny+cm6*nz,y_w=cm1*nx+cm4*ny+cm7*nz,z_w=cm2*nx+cm5*ny+cm8*nz;
    const fC=faceCentsRef.current,fR=faceRegionRef.current;
    let bestName: string;
    if(fC.length>0&&fR.length>0){let bi=0,bd=-Infinity;for(let i=0;i<fC.length;i++){const d=fC[i][0]*x_w+fC[i][1]*y_w+fC[i][2]*z_w;if(d>bd){bd=d;bi=i;}}bestName=regionPolesRef.current[fR[bi]]?.name??regionPolesRef.current[0].name;}
    else{let bt=regionPolesRef.current[0],bdot=-Infinity;for(const rd of regionPolesRef.current){const d=rd.pole[0]*x_w+rd.pole[1]*y_w+rd.pole[2]*z_w;if(d>bdot){bdot=d;bt=rd;}}bestName=bt.name;}
    if(selected!==null&&zoomRef.current>=2.0&&bestName===selected&&subPolesRef.current.length>0){
      const sft=[...subRegionRef.current.keys()];let bsf=sft[0]??-1,bsd=-Infinity;for(const fi of sft){const c=fC[fi];if(!c)continue;const d=c[0]*x_w+c[1]*y_w+c[2]*z_w;if(d>bsd){bsd=d;bsf=fi;}}
      const si=subRegionRef.current.get(bsf)??0,sn=activeSubsRef.current[si]?.name??subPolesRef.current[0]?.name??"";
      const next=selectedSubgenreRef.current===sn?null:sn;selectedSubgenreRef.current=next;setSelectedSubgenre(next);return;
    }
    autoSelectedRef.current=false;selectedSubgenreRef.current=null;setSelectedSubgenre(null);zoomSubgenreRef.current=null;setZoomSubgenre(null);
    setSelected(p=>p===bestName?null:bestName);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-xl">Loading your Music World...</p>
      </main>
    );
  }

  const selectedColor   = selected ? (COLORS[selected] ?? "#ffffff") : "#ffffff";
  const [sr, sg, sb]    = selected ? hexRgb(COLORS[selected] ?? "#ffffff") : [255, 255, 255];
  // On mobile the panel uses hoveredSubgenre only for hover preview; zoom never drives it.
  // On desktop, zoomSubgenre also feeds the panel.
  const focusedSubgenre = isMobile
    ? (hoveredSubgenre ?? selectedSubgenre)
    : (hoveredSubgenre ?? selectedSubgenre ?? zoomSubgenre);
  const displayedTracks = focusedSubgenre
    ? tracks.filter(t => t.blueprintSubgenre === focusedSubgenre)
    : tracks;

  // When social sort is on, re-order by descending cross-user popularity.
  // displayedTracks is kept as-is for the count display; sortedTracks drives the list.
  const sortedTracks = socialSort
    ? [...displayedTracks].sort((a, b) => (b.socialCount ?? 0) - (a.socialCount ?? 0))
    : displayedTracks;

  return (
    <main className="h-screen bg-black text-white flex flex-col overflow-hidden">

      {/* ── Back button — always-fixed, above every layer ────────────────────────
          Must NOT live inside the canvas div or any flex/overflow container.
          position:fixed anchors it to the viewport regardless of:
            - selected genre / subgenre
            - zoom level
            - mobile sheet snap state
            - canvas transforms
          z-index 210 > zoom pill (120) > mobile sheet (100). */}
      {backHref && (
        <Link
          href={backHref}
          aria-label="Back to Midvale"
          style={{
            // Sits flush below the fixed Navbar (height 56) with a 12 px gap.
            // left matches the Navbar's own paddingLeft so it aligns with the
            // Blueprint wordmark above it on every viewport width.
            position:      "fixed",
            top:           "calc(56px + 12px + env(safe-area-inset-top, 0px))",
            left:          "clamp(20px, 5vw, 56px)",
            zIndex:        210,
            display:       "flex",
            alignItems:    "center",
            justifyContent:"center",
            color:         "rgba(255,255,255,0.88)",
            textDecoration:"none",
            width:         36,
            height:        36,
            borderRadius:  "50%",
            background:    "rgba(0,0,0,0.80)",
            border:        "1px solid rgba(255,255,255,0.10)",
            backdropFilter:"blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            transition:    "background 0.15s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(50,50,50,0.90)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.80)"; }}
        >
          <svg width={13} height={13} viewBox="0 0 10 10" fill="none" stroke="currentColor"
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6.5,1.5 2.5,5 6.5,8.5" />
          </svg>
        </Link>
      )}

      {/* ── Utility bar ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-2.5">
        <span className="text-xs tracking-widest uppercase text-zinc-700 font-medium select-none">
          Blueprint
        </span>
        <div className="flex items-center gap-3">
          {error && <span className="text-red-500 text-xs">{error}</span>}
          {/* Auto-sync status pill — fades in when synced, hidden otherwise */}
          {!userId && syncStatus === "synced" && (
            <span
              className="text-zinc-600 text-xs select-none"
              style={{ transition: "opacity 0.4s ease" }}
            >
              synced
            </span>
          )}
          {/* Hide sync button when viewing someone else's world */}
          {!userId && (
            <button
              onClick={refreshFromSpotify}
              disabled={refreshing || syncStatus === "syncing"}
              className="text-zinc-600 hover:text-zinc-300 disabled:opacity-40 text-xs transition-colors"
            >
              {refreshing || syncStatus === "syncing" ? "syncing…" : "sync library"}
            </button>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Canvas area — full width on mobile, flex-1 on desktop */}
        <div className="flex-1 relative min-w-0">
          {Object.keys(worlds).length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-zinc-700 text-sm">Sync your library to begin</p>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-pointer"
              style={{
                display: "block",
                // Mobile: pull the sphere up by 15% — identical offset to homepage
                // so the sphere sits at the same vertical position on both pages.
                transform: isMobile ? "translateY(-15%)" : undefined,
                transition: "none",
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={stopDrag}
              onMouseLeave={onMouseLeave}
              onClick={handleClick}
            />
          )}

          {/* Mobile headline — "<Name>'s Music" anchored above the sphere midline.
              userName is passed from the server page (never hardcoded here).
              Rendered only when userName is provided. */}
          {isMobile && userName && (
            <div
              className="absolute z-10 flex flex-col pointer-events-none"
              style={{
                bottom:     "26%",
                left:       0,
                right:      0,
                alignItems: "center",
                textAlign:  "center",
                padding:    "0 24px",
              }}
            >
              <h1
                className="font-semibold leading-[1.06] text-white mb-3"
                style={{ letterSpacing: "-0.02em", fontSize: 19 }}
              >
                {possessiveHeadline(userName)}
              </h1>
            </div>
          )}

        </div>

        {/* ── Desktop right panel (hidden on mobile) ─────────────────────────── */}
        {!isMobile && (
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
                <div className="flex-shrink-0" style={{ height: 2, background: selectedColor, opacity: 0.85 }} />
                <div className="flex-shrink-0 px-7 pt-5 pb-4">
                  {focusedSubgenre ? (
                    <>
                      <button
                        onClick={() => { setSelectedSubgenre(null); selectedSubgenreRef.current = null; setZoomSubgenre(null); zoomSubgenreRef.current = null; }}
                        className="text-xs mb-3 flex items-center gap-1.5 transition-opacity hover:opacity-100"
                        style={{ color: `rgba(${sr},${sg},${sb},0.45)` }}
                      >← {shortLabel(selected)}</button>
                      <div className="flex items-center justify-between gap-4">
                        <h2 className="text-2xl font-bold leading-tight truncate" style={{ color: selectedColor }}>{focusedSubgenre}</h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <BarChartButton active={socialSort} onClick={() => setSocialSort(v => !v)} color={selectedColor} />
                          <SpotifyLogoButton track={playingTrack} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs tracking-widest uppercase mb-2" style={{ color: `rgba(${sr},${sg},${sb},0.38)` }}>Now exploring</p>
                      <div className="flex items-center justify-between gap-4">
                        <h2 className="text-2xl font-bold leading-tight truncate" style={{ color: selectedColor }}>{shortLabel(selected)}</h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <BarChartButton active={socialSort} onClick={() => setSocialSort(v => !v)} color={selectedColor} />
                          <SpotifyLogoButton track={playingTrack} />
                        </div>
                      </div>
                    </>
                  )}
                  <p className="text-zinc-600 text-xs mt-1.5">{tracksLoading ? "—" : `${displayedTracks.length} tracks`}</p>
                </div>
                {subgenres.length > 0 && (
                  <div className="flex-shrink-0 flex gap-1.5 px-7 pb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                    {subgenres.map(sub => {
                      const active = selectedSubgenre === sub.name;
                      return (
                        <button key={sub.name}
                          onClick={() => { const n = selectedSubgenre === sub.name ? null : sub.name; setSelectedSubgenre(n); selectedSubgenreRef.current = n; }}
                          className="flex-shrink-0 text-xs px-3 py-1 rounded-full whitespace-nowrap transition-all"
                          style={{ background: active ? `rgba(${sr},${sg},${sb},0.18)` : "transparent", color: active ? `rgb(${sr},${sg},${sb})` : "rgba(255,255,255,0.30)", border: `1px solid rgba(${sr},${sg},${sb},${active ? 0.45 : 0.10})` }}
                        >{sub.name}</button>
                      );
                    })}
                  </div>
                )}
                <div className="flex-shrink-0 mx-7" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
                <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
                  {tracksLoading ? (
                    <p className="text-zinc-700 text-xs px-7 py-8 text-center">—</p>
                  ) : displayedTracks.length === 0 ? (
                    <p className="text-zinc-700 text-xs px-7 py-8 text-center">No tracks</p>
                  ) : (
                    <div className="flex flex-col pt-1 pb-6">
                      {sortedTracks.map((t, idx) => {
                        const canPlay = !!(deezerPreviews[t.id] || t.previewUrl);
                        const isPending = pendingTrackId === t.id;
                        const isActive  = nowPlayingId === t.id || isPending;
                        return (
                          <div key={t.id} className="flex items-center gap-3 px-7 py-2 cursor-pointer" style={{ borderBottom: "1px solid rgba(255,255,255,0.035)" }} onClick={() => playTrack(t)}>
                            <span style={{ flexShrink: 0, width: 20, textAlign: "center", fontSize: 11, lineHeight: 1, userSelect: "none", color: isActive ? selectedColor : "rgba(255,255,255,0.22)" }}>{idx + 1}</span>
                            <div className="flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 4, overflow: "hidden", background: `rgba(${sr},${sg},${sb},0.10)` }}>
                              {t.imageUrl && <img src={t.imageUrl} alt="" width={36} height={36} style={{ width: 36, height: 36, objectFit: "cover", display: "block" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium truncate leading-snug flex-1" style={{ color: isActive ? selectedColor : "#ffffff" }}>{t.name}</span>
                                {socialSort && (t.socialCount ?? 0) > 0 && (
                                  <button
                                    aria-label={`${t.socialCount} other user${t.socialCount === 1 ? "" : "s"} have this track`}
                                    onClick={e => {
                                      e.stopPropagation();
                                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      setPopoverData({
                                        trackId: t.id,
                                        users:   t.socialUsers ?? [],
                                        top:     rect.bottom + 6,
                                        right:   window.innerWidth - rect.right,
                                      });
                                    }}
                                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}
                                  >
                                    <TallyMarks n={t.socialCount!} color={`rgba(${sr},${sg},${sb},0.55)`} />
                                  </button>
                                )}
                              </div>
                              <span className="text-zinc-500 text-xs truncate">{t.artist}{isPending ? <span style={{ color: "rgba(255,255,255,0.32)", marginLeft: 4 }}>(Loading…)</span> : !canPlay ? <span style={{ color: "rgba(255,255,255,0.22)", marginLeft: 4 }}>(No Preview)</span> : null}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 flex justify-end px-6 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <button onClick={() => { setSelected(null); setSelectedSubgenre(null); selectedSubgenreRef.current = null; setZoomSubgenre(null); zoomSubgenreRef.current = null; autoSelectedRef.current = false; if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } setNowPlayingId(null); setAudioPlaying(false); setPlayingTrack(null); }} className="text-zinc-700 hover:text-zinc-400 text-xs transition-colors">close ✕</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex-shrink-0 px-7 pt-6 pb-4">
                  <p className="text-xs tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.20)" }}>Your World</p>
                  <h2 className="text-2xl font-bold text-white leading-tight">All Music</h2>
                  <p className="text-zinc-600 text-xs mt-1.5">{Object.values(worlds).reduce((s, c) => s + c, 0)} tracks</p>
                </div>
                <div className="flex-shrink-0 mx-7" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
                <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
                  <div className="flex flex-col pt-1 pb-6">
                    {Object.entries(worlds).sort(([,a],[,b])=>b-a).map(([name, count]) => (
                      <div key={name} className="flex items-center gap-4 px-7 py-2.5 cursor-pointer hover:bg-white/[0.025]" style={{ borderBottom: "1px solid rgba(255,255,255,0.035)" }} onClick={() => { autoSelectedRef.current = false; setSelected(name); }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[name] ?? "#71717a" }} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-white text-sm font-medium truncate leading-snug">{shortLabel(name)}</span>
                          <span className="text-zinc-500 text-xs">{count} tracks</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile bottom sheet ───────────────────────────────────────────────── */}
      {isMobile && viewportH > 0 && (() => {
        const sheetH = Math.round(viewportH * 0.90);
        const snapTY = sheetSnap === 0 ? sheetH + 20 : sheetSnap === 1 ? sheetH - 200 : 0;
        return (
          <div
            onTouchStart={e => { if (mobileTracklistRef.current?.contains(e.target as Node)) return; sheetSwipeStartY.current = e.touches[0].clientY; sheetSwipeStartTime.current = Date.now(); }}
            onTouchEnd={e => {
              if (sheetSwipeStartY.current === null) return;
              const endY = e.changedTouches[0].clientY, deltaY = endY - sheetSwipeStartY.current;
              const vel  = deltaY / Math.max(Date.now() - sheetSwipeStartTime.current, 1);
              sheetSwipeStartY.current = null;
              if (vel < -0.3 || deltaY < -40) { setSheetSnap(2); return; }
              if (vel > 0.3  || deltaY > 40)  { if (sheetSnapRef.current === 2) setSheetSnap(1); return; }
            }}
            style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: sheetH, zIndex: 100, display: "flex", flexDirection: "column", overflow: "hidden", background: "rgba(4,4,8,0.97)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderTop: sheetSnap > 0 ? `1px solid rgba(${sr},${sg},${sb},0.18)` : "1px solid rgba(255,255,255,0.06)", borderTopLeftRadius: 18, borderTopRightRadius: 18, transform: `translateY(${snapTY}px)`, transition: "transform 0.36s cubic-bezier(0.32,0.72,0,1)", pointerEvents: sheetSnap === 0 ? "none" : "auto" } as React.CSSProperties}
          >
            {/* Accent line */}
            <div style={{ height: 2, background: selectedColor ?? "rgba(255,255,255,0.12)", opacity: 0.85, flexShrink: 0 }} />

            {/* Sheet header */}
            <div className="flex-shrink-0 pl-5 pr-4 pt-3 pb-2.5 flex items-center gap-2" style={{ minHeight: 56 }}>
              <div className="flex items-center min-w-0 flex-1">
                <h2 className="text-lg font-bold leading-tight truncate" style={{ color: selectedColor }}>
                  {focusedSubgenre ?? (selected ? shortLabel(selected) : "")}
                </h2>
                <span className="flex-shrink-0 text-xs" style={{ color: "rgba(255,255,255,0.30)", marginLeft: 8 }}>
                  {displayedTracks.length} tracks
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
                <BarChartButton active={socialSort} onClick={() => setSocialSort(v => !v)} color={selectedColor} />
                <SpotifyLogoButton track={playingTrack} size={36} />
                <button
                  onClick={() => setSheetSnap(sheetSnap === 1 ? 2 : 1)}
                  aria-label={sheetSnap === 1 ? "Expand to fullscreen" : "Collapse to preview"}
                  style={{ flexShrink: 0, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.60)", fontSize: 16, lineHeight: 1 }}
                >
                  {sheetSnap === 1 ? "↑" : "↓"}
                </button>
              </div>
            </div>

            {/* Tracklist */}
            <div ref={mobileTracklistRef} className="overflow-y-auto flex-1" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
              {displayedTracks.length === 0 ? (
                <p className="text-zinc-700 text-xs px-6 py-8 text-center">No tracks</p>
              ) : (
                <div className="flex flex-col pt-1 pb-8">
                  {sortedTracks.map((t, idx) => {
                    const canPlay   = !!(deezerPreviews[t.id] || t.previewUrl);
                    const isPending = pendingTrackId === t.id;
                    const isActive  = nowPlayingId === t.id || isPending;
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-5 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }} onClick={() => playTrack(t)}>
                        <span style={{ flexShrink: 0, width: 20, textAlign: "center", fontSize: 11, lineHeight: 1, userSelect: "none", color: isActive ? selectedColor : "rgba(255,255,255,0.22)" }}>{idx + 1}</span>
                        <div className="flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 4, overflow: "hidden", background: `rgba(${sr},${sg},${sb},0.10)` }}>
                          {t.imageUrl && <img src={t.imageUrl} alt="" width={36} height={36} style={{ width: 36, height: 36, objectFit: "cover", display: "block" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium truncate leading-snug flex-1" style={{ color: isActive ? selectedColor : "#ffffff" }}>{t.name}</span>
                            {socialSort && (t.socialCount ?? 0) > 0 && (
                              <button
                                aria-label={`${t.socialCount} other user${t.socialCount === 1 ? "" : "s"} have this track`}
                                onClick={e => {
                                  e.stopPropagation();
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  setPopoverData({
                                    trackId: t.id,
                                    users:   t.socialUsers ?? [],
                                    top:     rect.bottom + 6,
                                    right:   window.innerWidth - rect.right,
                                  });
                                }}
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}
                              >
                                <TallyMarks n={t.socialCount!} color={`rgba(${sr},${sg},${sb},0.55)`} />
                              </button>
                            )}
                          </div>
                          <span className="text-zinc-500 text-xs truncate">{t.artist}{isPending ? <span style={{ color: "rgba(255,255,255,0.32)", marginLeft: 4 }}>(Loading…)</span> : !canPlay ? <span style={{ color: "rgba(255,255,255,0.22)", marginLeft: 4 }}>(No Preview)</span> : null}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Mobile zoom pill ──────────────────────────────────────────────────── */}
      {isMobile && selected !== null && sheetSnap !== 2 && (
        <div style={{ position: "fixed", right: 12, bottom: sheetSnap === 1 ? 216 : 84, zIndex: 120, display: "flex", flexDirection: "column", alignItems: "center", borderRadius: zoomAbove2 ? "50%" : 24, width: zoomAbove2 ? 44 : undefined, height: zoomAbove2 ? 44 : undefined, overflow: "hidden", background: "rgba(0,0,0,0.80)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", transition: "bottom 0.3s ease, border-radius 0.2s ease, width 0.2s ease, height 0.2s ease", pointerEvents: "auto" } as React.CSSProperties}>
          {!zoomAbove2 && (
            <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); handleZoomPlus(); }} style={{ width: 44, height: 46, background: "none", border: "none", color: "rgba(255,255,255,0.88)", fontSize: 22, fontWeight: 300, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, userSelect: "none" }} aria-label="Zoom in">+</button>
          )}
          {!zoomAbove2 && <div style={{ width: 24, height: 1, background: "rgba(255,255,255,0.10)" }} />}
          <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); handleZoomMinus(); }} style={{ width: 44, height: zoomAbove2 ? 44 : 46, background: "none", border: "none", color: "rgba(255,255,255,0.88)", fontSize: 22, fontWeight: 300, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, userSelect: "none" }} aria-label="Zoom out">−</button>
        </div>
      )}

      {/* ── Social tally popover ─────────────────────────────────────────────── */}
      {popoverData && (
        <>
          {/* Invisible backdrop to close on outside click */}
          <div
            onClick={() => setPopoverData(null)}
            style={{ position: "fixed", inset: 0, zIndex: 300 }}
          />
          {/* Popover card */}
          <div
            style={{
              position:        "fixed",
              top:             popoverData.top,
              right:           popoverData.right,
              zIndex:          301,
              background:      "rgba(12,12,18,0.97)",
              border:          "1px solid rgba(255,255,255,0.10)",
              borderRadius:    10,
              padding:         "10px 14px",
              minWidth:        140,
              maxWidth:        220,
              backdropFilter:  "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow:       "0 8px 32px rgba(0,0,0,0.55)",
            }}
          >
            <p style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)", marginBottom: 8, lineHeight: 1 }}>
              Also in Midvale
            </p>
            {popoverData.users.length === 0 ? (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>No one else</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {popoverData.users.map(u => (
                  <Link
                    key={u.id}
                    href={`/midvale/${u.id}`}
                    onClick={() => setPopoverData(null)}
                    style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.88)", textDecoration: "none", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {u.name ?? "Unknown"}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}

    </main>
  );
}

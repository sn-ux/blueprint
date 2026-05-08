"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import SphereCanvas from "@/components/SphereCanvas";
import MiniSphere from "@/components/MiniSphere";
import MapVisual from "@/components/MapVisual";
import Footer from "@/components/Footer";
import { SPHERE_INIT_RX, SPHERE_INIT_RY } from "@/lib/sphereConfig";
import { PlaylistButton } from "@/components/PlaylistButton";

// ── Genre display-name overrides (short labels for sphere + UI) ───────────────
// Keys are the full canonical genre names used as data keys everywhere.
// Values are the shorter display strings shown on the sphere and in panels.

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

/** Returns the short display label for a genre, falling back to the full name. */
const shortLabel = (genre: string) => GENRE_SHORT[genre] ?? genre;

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

type LiveEvent = { artistName: string; eventName: string; city: string; venue: string; date: string; url: string; };
type TrackItem = { id: string; name: string; artist: string; album?: string | null; imageUrl?: string | null; previewUrl?: string | null; spotifyId?: string | null; blueprintSubgenre: string; socialCount?: number; socialUsers?: { id: string; name: string | null }[]; isUnheardForSelectedUser?: boolean; liveEvent?: LiveEvent; };
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

// Each entry maps 1-to-1 with COMPANIES by index.
// Order: Google, TikTok, Amazon, Spotify, YouTube, ChatGPT, DoorDash
const DISCOVERY: { line1: string; line2: string }[] = [
  { line1: "The information you need",    line2: "that you never thought to search for"      }, // Google   [0]
  { line1: "The creator you\u2019d love", line2: "that doesn\u2019t match what you engage with" }, // TikTok   [1]
  { line1: "The product you\u2019d buy",  line2: "that no one paid to show you"               }, // Amazon   [2]
  { line1: "The artist you\u2019d love",  line2: "that doesn\u2019t sound like what you listen to" }, // Spotify  [3]
  { line1: "The video you\u2019d love",   line2: "that\u2019s unlike what you watch"          }, // YouTube  [4]
  { line1: "The life changing idea",      line2: "that you never thought to ask for"          }, // ChatGPT  [5]
  { line1: "The dish you\u2019d love",    line2: "that\u2019s not what you usually order"     }, // DoorDash [6]
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

// ── Page 3 sphere platform colors — indexed to match COMPANIES order ──────────
// Same 7-platform sequence: Google, TikTok, Amazon, Spotify, YouTube, ChatGPT, DoorDash
const PAGE3_COLORS = [
  "#4285F4", // Google   [0]
  "#FE2C55", // TikTok   [1]
  "#FF9900", // Amazon   [2]
  "#1DB954", // Spotify  [3]
  "#FF0000", // YouTube  [4]
  "#10A37F", // ChatGPT  [5]
  "#EA4335", // DoorDash [6]
];

// ── Page 3 domain labels — indexed to match COMPANIES / PAGE3_COLORS order ───
const PAGE3_DOMAIN_LABELS = [
  "Information", // Google   [0]
  "Video",       // TikTok   [1]
  "Products",    // Amazon   [2]
  "Music",       // Spotify  [3]
  "Video",       // YouTube  [4]
  "Ideas",       // ChatGPT  [5]
  "Food",        // DoorDash [6]
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

// ── Spotify Web Playback SDK — loaded dynamically from Spotify's CDN ─────────
// Minimal ambient types so TypeScript accepts window.Spotify without a
// separate @types package.
interface SpotifySDKPlayer {
  connect:          ()                                              => Promise<boolean>;
  disconnect:       ()                                              => void;
  addListener:      (event: string, cb: (data: any) => void)       => boolean;
  getCurrentState:  ()                                              => Promise<{ paused: boolean } | null>;
  pause:            ()                                              => Promise<void>;
  resume:           ()                                              => Promise<void>;
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: {
      Player: new (opts: {
        name:            string;
        getOAuthToken:   (cb: (token: string) => void) => void;
        volume:          number;
      }) => SpotifySDKPlayer;
    } | undefined;
  }
}

// ── Sphere rotation math (module-level, no allocations on hot path) ──────────
// All matrices: flat 9-element row-major arrays, index = row*3+col.
// Convention matches the draw code: first rotate around Y (yaw), then X (pitch).

/** Build 3×3 rotation matrix from YX Euler angles (desktop sync). */
function matFromEuler(rx: number, ry: number): number[] {
  const cX = Math.cos(rx), sX = Math.sin(rx);
  const cY = Math.cos(ry), sY = Math.sin(ry);
  return [
     cY,      0,   sY,
     sX*sY,  cX,  -sX*cY,
    -cX*sY,  sX,   cX*cY,
  ];
}

/**
 * Project a 2-D canvas point onto the virtual trackball sphere.
 *
 * Uses the Shoemake hybrid model to eliminate edge snapping:
 *   d² ≤ 0.5  →  spherical hemisphere  z = √(1 − d²)
 *   d² > 0.5  →  hyperbolic sheet       z = 0.5 / d
 *
 * Both branches produce the same z at d² = 0.5 (= 1/√2) and the same
 * derivative there, giving a C¹-continuous surface with no snap at the
 * visible edge.  The old code hard-clamped z to 0 outside the unit circle,
 * which caused a discontinuous jump exactly at the sphere's silhouette.
 */
function arcballVec(
  px: number, py: number, cx: number, cy: number, r: number,
): [number, number, number] {
  const nx = (px - cx) / r;
  const ny = (py - cy) / r;   // screen Y increases downward, matching view-space Y convention
  const d2 = nx * nx + ny * ny;
  if (d2 <= 0.5) {
    // Inside the hemisphere: exact sphere projection, already unit length.
    return [nx, ny, Math.sqrt(1 - d2)];
  }
  // Outside the hemisphere midpoint: hyperbolic sheet, then normalize.
  const z   = 0.5 / Math.sqrt(d2);
  const len = Math.sqrt(d2 + z * z);
  return [nx / len, ny / len, z / len];
}

/** Unit quaternion [w,x,y,z] rotating unit vector a → unit vector b. */
function quatFromTo(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number, number] {
  const cx = a[1]*b[2] - a[2]*b[1];
  const cy = a[2]*b[0] - a[0]*b[2];
  const cz = a[0]*b[1] - a[1]*b[0];
  const w  = 1 + a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const len = Math.sqrt(w*w + cx*cx + cy*cy + cz*cz);
  if (len < 1e-10) return [1, 0, 0, 0];
  return [w / len, cx / len, cy / len, cz / len];
}

/** 3×3 rotation matrix from unit quaternion [w,x,y,z]. */
function matFromQuat([w, x, y, z]: [number, number, number, number]): number[] {
  return [
    1-2*(y*y+z*z),  2*(x*y-w*z),    2*(x*z+w*y),
      2*(x*y+w*z),  1-2*(x*x+z*z),  2*(y*z-w*x),
      2*(x*z-w*y),  2*(y*z+w*x),    1-2*(x*x+y*y),
  ];
}

/** Pre-multiply: M_new = delta · M_cur  (apply a screen-space rotation delta). */
function mat3Premul(d: number[], c: number[]): number[] {
  return [
    d[0]*c[0]+d[1]*c[3]+d[2]*c[6], d[0]*c[1]+d[1]*c[4]+d[2]*c[7], d[0]*c[2]+d[1]*c[5]+d[2]*c[8],
    d[3]*c[0]+d[4]*c[3]+d[5]*c[6], d[3]*c[1]+d[4]*c[4]+d[5]*c[7], d[3]*c[2]+d[4]*c[5]+d[5]*c[8],
    d[6]*c[0]+d[7]*c[3]+d[8]*c[6], d[6]*c[1]+d[7]*c[4]+d[8]*c[7], d[6]*c[2]+d[7]*c[5]+d[8]*c[8],
  ];
}

/** Gram-Schmidt orthonormalize a 3×3 matrix to prevent floating-point drift. */
function mat3Ortho(m: number[]): number[] {
  let [a0,a1,a2, b0,b1,b2] = m;
  let n = Math.sqrt(a0*a0+a1*a1+a2*a2);
  a0/=n; a1/=n; a2/=n;
  const dot = b0*a0+b1*a1+b2*a2;
  b0-=dot*a0; b1-=dot*a1; b2-=dot*a2;
  n = Math.sqrt(b0*b0+b1*b1+b2*b2);
  b0/=n; b1/=n; b2/=n;
  const c0=a1*b2-a2*b1, c1=a2*b0-a0*b2, c2=a0*b1-a1*b0;
  return [a0,a1,a2, b0,b1,b2, c0,c1,c2];
}

// ── SpotifyLogoButton ─────────────────────────────────────────────────────────
// Sits in the panel/sheet header next to the genre title.
// Dims when no track is selected; lights up green and becomes clickable when
// a track is active. Clicking opens that track on Spotify (new tab).

function SpotifyLogoButton({
  track,
  size = 22,
}: {
  track: { name: string; spotifyId?: string | null } | null;
  size?: number;
}) {
  // Light up whenever any track is selected (even no-preview); only clickable if spotifyId exists
  const active = !!track;
  const canOpen = !!(track?.spotifyId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canOpen || !track?.spotifyId) return;
    const url = `https://open.spotify.com/track/${track.spotifyId}`;
    const ok = window.confirm(`Open "${track.name}" on Spotify?`);
    if (ok) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      onClick={handleClick}
      aria-label={canOpen ? `Open ${track?.name} on Spotify` : "Spotify"}
      style={{
        flexShrink:      0,
        background:      "none",
        border:          "none",
        padding:         0,
        cursor:          canOpen ? "pointer" : "default",
        color:           active ? "#1DB954" : "rgba(255,255,255,0.20)",
        transition:      "color 0.25s ease",
        display:         "flex",
        alignItems:      "center",
        lineHeight:      1,
      }}
    >
      {/* Official Spotify "sound waves in a circle" mark */}
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    </button>
  );
}

// ── BarChartButton ────────────────────────────────────────────────────────────
function BarChartButton({ active, onClick, color }: { active: boolean; onClick: () => void; color: string }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }}
      aria-label={active ? "Clear social sort" : "Sort by social popularity"}
      title={active ? "Sorted by how many Friends users share this track" : "Sort by Friends popularity"}
      style={{ flexShrink: 0, background: "none", border: "none", padding: "2px", cursor: "pointer",
               color: active ? color : "rgba(255,255,255,0.22)", transition: "color 0.20s ease",
               display: "flex", alignItems: "center", lineHeight: 1 }}>
      <svg width={19} height={17} viewBox="0 0 12 10" fill="currentColor" aria-hidden="true">
        <rect x="0"   y="5.5" width="2.8" height="4.5" rx="0.5"/>
        <rect x="4.6" y="2.5" width="2.8" height="7.5" rx="0.5"/>
        <rect x="9.2" y="0"   width="2.8" height="10"  rx="0.5"/>
      </svg>
    </button>
  );
}

// ── PinButton ─────────────────────────────────────────────────────────────────
function PinButton({ active, loading, onClick, color }: { active: boolean; loading: boolean; onClick: () => void; color: string }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }}
      aria-label={active ? "Hide live events" : "Find live events in California"}
      title={loading ? "Searching for CA live events…" : active ? "Live events mode on — click to turn off" : "Find upcoming CA live events for these artists"}
      disabled={loading}
      style={{ flexShrink: 0, background: "none", border: "none", padding: "2px",
               cursor: loading ? "default" : "pointer",
               color: active ? color : "rgba(255,255,255,0.22)", opacity: loading ? 0.55 : 1,
               transition: "color 0.20s ease, opacity 0.20s ease", display: "flex", alignItems: "center", lineHeight: 1 }}>
      {loading ? (
        <svg width={19} height={17} viewBox="0 0 18 10" aria-hidden="true">
          {[0, 6, 12].map((cx, i) => (
            <circle key={i} cx={cx + 3} cy="5" r="1.6" fill="currentColor">
              <animate attributeName="opacity" values="0.25;1;0.25" dur="1.1s" repeatCount="indefinite" begin={`${i * 0.22}s`} />
            </circle>
          ))}
        </svg>
      ) : (
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      )}
    </button>
  );
}

// ── VennButton ────────────────────────────────────────────────────────────────
function VennButton({ href, color, disabled = false, onBeforeNavigate }: { href: string; color: string; disabled?: boolean; onBeforeNavigate?: () => void }) {
  const circles = (
    <svg width={20} height={14} viewBox="0 0 22 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7"  cy="7" r="6" />
      <circle cx="15" cy="7" r="6" />
    </svg>
  );
  if (disabled) {
    return <span aria-label="Not in Friends World" title="Not in Friends World"
      style={{ flexShrink: 0, display: "flex", alignItems: "center", lineHeight: 1, color: "rgba(255,255,255,0.18)", cursor: "default" }}>{circles}</span>;
  }
  return (
    <a href={href} onClick={e => { e.stopPropagation(); onBeforeNavigate?.(); }}
      aria-label="Compare in Friends World" title="Open this genre in Friends World"
      style={{ flexShrink: 0, display: "flex", alignItems: "center", color, lineHeight: 1, textDecoration: "none", transition: "color 0.20s ease" }}>
      {circles}
    </a>
  );
}

// ── UnheardButton ─────────────────────────────────────────────────────────────
function UnheardButton({ active, onClick, color }: { active: boolean; onClick: () => void; color: string }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onClick(); }}
      aria-label={active ? "Disable unheard filter" : "Show unheard tracks first"}
      title={active ? "Showing unheard tracks first" : "Sort unheard tracks to top"}
      style={{ flexShrink: 0, background: "none", border: "none", padding: "2px", cursor: "pointer",
               color: active ? color : "rgba(255,255,255,0.28)", transition: "color 0.20s ease",
               display: "flex", alignItems: "center", lineHeight: 1 }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      </svg>
    </button>
  );
}

// ── SocialBadge ───────────────────────────────────────────────────────────────
function SocialBadge({ count, color }: { count: number; color: string }) {
  return (
    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color,
                   background: `${color}22`, borderRadius: 4, padding: "1px 5px",
                   lineHeight: "16px", cursor: "pointer", userSelect: "none" }}>
      {count}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Auth session ──────────────────────────────────────────────────────────────
  const { data: session, status: sessionStatus } = useSession();

  // ── Audio playback ────────────────────────────────────────────────────────────
  // Preview: plain HTML5 Audio. Full: Spotify Web Playback SDK.
  const [nowPlayingId, setNowPlayingId] = useState<string | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef           = useRef<HTMLAudioElement | null>(null);
  const spotifyPlayerRef   = useRef<SpotifySDKPlayer | null>(null);
  const spotifyDeviceIdRef = useRef<string | null>(null);
  const spotifyTokenRef    = useRef<string | null>(null);
  const [spotifyReady,  setSpotifyReady]  = useState(false);
  const [spotifyMode,   setSpotifyMode]   = useState(false);  // true = SDK is active source
  const [notPremium,    setNotPremium]    = useState(false);

  // ── Playlist push ─────────────────────────────────────────────────────────
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistMsg,     setPlaylistMsg]     = useState<string | null>(null);
  // Persist created playlist keys for this session via sessionStorage.
  const [createdPlaylistKeys, setCreatedPlaylistKeys] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = sessionStorage.getItem("blueprint:createdPlaylists");
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });

  // ── Deezer preview URLs (fetched in background after track list loads) ────────
  // Record<trackId, deezer 30-second mp3 URL>. Ref is read synchronously in
  // playTrack (must stay inside the user-gesture activation context).
  const [deezerPreviews,    setDeezerPreviews]    = useState<Record<string, string>>({});
  const deezerPreviewsRef = useRef<Record<string, string>>({});

  // Stable ref to nowPlayingId — lets playTrack read the current playing track
  // without relying on a React closure that might be one render stale.
  const nowPlayingIdRef = useRef<string | null>(null);
  nowPlayingIdRef.current = nowPlayingId;

  // ── Stable playing-track metadata ────────────────────────────────────────────
  // Decoupled from `tracks` (the visible tracklist). Set when audio begins and
  // cleared only when audio ends, errors, or the user explicitly stops it.
  // Changing genre/subgenre does NOT clear this — the Spotify icon stays lit and
  // keeps its target for as long as the preview is actually playing.
  const [playingTrack, setPlayingTrack] = useState<{
    id: string;
    name: string;
    artist: string;
    spotifyId?: string | null;
  } | null>(null);

  // ── Pending-playback state ────────────────────────────────────────────────────
  // When the user clicks a track whose preview URL hasn't loaded yet we do NOT
  // interrupt the current audio. Instead we record the intent here and fire an
  // on-demand fetch. When the URL arrives we do a stale-check (requestedTrackRef)
  // before starting playback, so rapid clicks never start the wrong track.
  const [pendingTrackId,  setPendingTrackId]  = useState<string | null>(null);
  const requestedTrackRef = useRef<string | null>(null);
  requestedTrackRef.current = pendingTrackId;   // keep ref in sync each render
  const pendingAudioRef   = useRef<HTMLAudioElement | null>(null);

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

  // ── Mobile zoom stage — polled from zoomRef; drives the zoom pill ────────────
  // true  = zoom ≥ 2.0  →  subgenre stage (stage 2)
  // false = zoom <  2.0  →  genre stage    (stage 1), combined with selected state
  const [zoomAbove2, setZoomAbove2] = useState(false);
  const zoomAbove2Ref = useRef(false);

  // ── Company carousel ────────────────────────────────────────────────────────
  const [carouselIdx,   setCarouselIdx]   = useState(0);
  // discoveryIdx trails carouselIdx by 250ms so the right-side visual leads
  // and the left-side rotating line follows — feels deliberate, not abrupt.
  const [discoveryIdx,  setDiscoveryIdx]  = useState(0);

  // ── Page 3 label wipe ────────────────────────────────────────────────────
  // prevPage3LabelIdx holds the index being covered during the wipe.
  // page3LabelAnimKey increments each time the platform changes to re-trigger
  // the CSS clip-path animation on the incoming label layer.
  const page3PrevIdxRef                    = useRef<number | null>(null);
  const [prevPage3LabelIdx, setPrevPage3LabelIdx] = useState<number | null>(null);
  const [page3LabelAnimKey, setPage3LabelAnimKey] = useState(0);

  // ── Mobile layout detection ──────────────────────────────────────────────
  // Driven by matchMedia so it updates on orientation change / resize.
  const [isMobile, setIsMobile] = useState(false);
  const isMobileRef = useRef(false);
  isMobileRef.current = isMobile;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Viewport height (for sheet snap math) ────────────────────────────────
  const [viewportH, setViewportH] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ── 3-state bottom sheet (mobile only) ───────────────────────────────────
  // 0 = hidden, 1 = peek (200px visible), 2 = fullscreen (fills to nav)
  // Transitions fire via arrow button OR swipe gesture on the sheet header.
  const [sheetSnap, setSheetSnap] = useState<0|1|2>(0);
  const sheetSnapRef              = useRef<0|1|2>(0);
  sheetSnapRef.current            = sheetSnap;

  // Ref to the mobile tracklist scroll container — used to ignore
  // touch events that originate inside the list (internal scroll).
  const mobileTracklistRef = useRef<HTMLDivElement | null>(null);

  // ── Sheet swipe detection (mobile only) ──────────────────────────────────
  // Records the start Y and time of a touch on the sheet (not the tracklist).
  // No live dragging — direction is evaluated only on touchend, then the sheet
  // snaps to one of the two visible states (1 = peek, 2 = fullscreen).
  const sheetSwipeStartY    = useRef<number | null>(null);
  const sheetSwipeStartTime = useRef<number>(0);

  // ── Social / live / substitute state ────────────────────────────────────
  const [socialSort,    setSocialSort]   = useState(true);
  const [liveMode,      setLiveMode]     = useState(false);
  const [liveLoading,   setLiveLoading]  = useState(false);
  const [liveEventMap,  setLiveEventMap] = useState<Record<string, LiveEvent | null>>({});
  const [substituteProfile, setSubstituteProfile] = useState<{ userId: string; userName: string } | null>(() => {
    if (typeof window === "undefined") return null;
    try { const raw = sessionStorage.getItem("blueprint:substituteProfile"); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [unheardMode,   setUnheardMode]  = useState(false);
  const [friendsGenres, setFriendsGenres] = useState<Record<string, number> | null>(null);
  const [friendsSubgenres, setFriendsSubgenres] = useState<Record<string, string[]>>({});
  const [playlistAuthError, setPlaylistAuthError] = useState<"signin" | "reconnect" | null>(null);
  const [popoverData, setPopoverData] = useState<{ users: { id: string; name: string | null }[]; top: number; right: number } | null>(null);
  const friendsSubgenresFetchedRef = useRef<Set<string>>(new Set());
  const substituteProfileRef = useRef(substituteProfile);
  substituteProfileRef.current = substituteProfile;

  // ── Interaction refs ──────────────────────────────────────────────────────
  const zoomRef          = useRef(1);       // visual zoom — lerped each RAF frame
  const zoomTargetRef    = useRef(1);       // intended zoom — updated immediately by wheel
  const subRegionRef     = useRef<Map<number, number>>(new Map());
  const activeSubsRef    = useRef<SubItem[]>([]);
  const subPolesRef      = useRef<{ name: string; pole: V3 }[]>([]);
  const rotRef           = useRef({ x: SPHERE_INIT_RX, y: SPHERE_INIT_RY });
  // Full 3×3 rotation matrix — single source of truth for rendering & hit-tests.
  // Both desktop and mobile drag update this via the shared arcball model.
  const rotMatRef        = useRef<number[]>(matFromEuler(SPHERE_INIT_RX, SPHERE_INIT_RY));
  const dragRef          = useRef({ active: false, lx: 0, ly: 0, moved: false });
  // Arcball grab vector — the 3-D point on the unit sphere where the drag started.
  // Updated every pointer-move frame so each step is a small incremental rotation.
  const grabVecRef       = useRef<[number, number, number] | null>(null);
  // Pinch state persisted across effect re-runs.  When setSelected() fires mid-pinch
  // it causes [worlds, selected, subgenres] effect to restart, resetting all local
  // closure vars.  Storing pinch state here lets the new closure restore it so the
  // gesture continues without a freeze.
  const pinchStateRef    = useRef({ active: false, dist0: 0, zoom0: 1 });
  const rafRef           = useRef<number>(0);
  const labelHitsRef     = useRef<{ name: string; subgenre?: string; x1: number; y1: number; x2: number; y2: number }[]>([]);
  const regionPolesRef   = useRef<{ name: string; pole: V3 }[]>([]);
  // Per-face data exposed to click/hover handlers for exact region ownership
  const faceCentsRef     = useRef<V3[]>([]);      // centroid of each icosphere face
  const faceRegionRef    = useRef<number[]>([]);  // genre index for each face
  const hoveredRef       = useRef<{ genre: string; subgenre?: string } | null>(null);
  const autoSelectedRef  = useRef(false);
  // Sync ref so the wheel handler (stale closure) always reads the live selected value
  const selectedRef      = useRef<string | null>(null);
  selectedRef.current    = selected;

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

  // ── Blueprint logo reset — scroll to top + restore default sphere state ─────
  // Triggered by clicking the logo in Navbar (dispatches "blueprint-reset").
  // Works identically on desktop and mobile.
  //
  // Zoom animation: setting zoomTargetRef to 1 lets the existing RAF lerp
  // (factor 0.10/frame) smoothly animate the sphere back to its default size
  // over ~25 frames (~0.4 s) — gentle, not a hard snap.
  useEffect(() => {
    const onReset = () => {
      console.log("[blueprint-reset] logo tap — resetting sphere state");

      // ── Sphere zoom ─────────────────────────────────────────────────────────
      // Set the target; the render loop lerps zoomRef toward it each frame.
      zoomTargetRef.current = 1;

      // ── Genre / subgenre selection ───────────────────────────────────────────
      autoSelectedRef.current     = false;
      selectedSubgenreRef.current = null; setSelectedSubgenre(null);
      zoomSubgenreRef.current     = null; setZoomSubgenre(null);
      setSelected(null); // also triggers sheet-close via the sync effect

      // ── Mobile sheet ─────────────────────────────────────────────────────────
      // Collapse immediately rather than waiting for the selected→null sync tick.
      setSheetSnap(0);

      // ── Preview audio + pending state ───────────────────────────────────────
      requestedTrackRef.current = null; setPendingTrackId(null);
      if (pendingAudioRef.current) { pendingAudioRef.current.src = ""; pendingAudioRef.current = null; }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setNowPlayingId(null);
      setAudioPlaying(false);
      setPlayingTrack(null);

      // ── Scroll to top ────────────────────────────────────────────────────────
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("blueprint-reset", onReset);
    return () => window.removeEventListener("blueprint-reset", onReset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch tracks + subgenres when genre selected ──────────────────────────
  useEffect(() => {
    hoveredSubgRef.current = null;
    setHoveredSubgenre(null);
    if (!selected) {
      setTracks([]); setSubgenres([]);
      deezerPreviewsRef.current = {};
      setDeezerPreviews({});
      setSelectedSubgenre(null); selectedSubgenreRef.current = null;
      setZoomSubgenre(null);     zoomSubgenreRef.current = null;
      return;
    }
    setSelectedSubgenre(null); selectedSubgenreRef.current = null;
    setZoomSubgenre(null);     zoomSubgenreRef.current = null;

    // Reset preview cache when genre changes
    deezerPreviewsRef.current = {};
    setDeezerPreviews({});

    const enc = encodeURIComponent(selected);
    fetch(`/api/world/${enc}`)
      .then(r => r.json())
      .then(d => {
        const loadedTracks: TrackItem[] = d?.tracks ?? [];
        setTracks(loadedTracks);

        // Fetch preview URLs via our server-side proxy route (avoids CORS).
        // Fire requests in batches of 5 to avoid hammering Deezer.
        const batchSize = 5;
        const fetchPreview = (t: TrackItem) =>
          fetch(`/api/preview?track=${encodeURIComponent(t.name)}&artist=${encodeURIComponent(t.artist)}`)
            .then(r => r.json())
            .then((data: { previewUrl: string | null }) => {
              if (data.previewUrl) {
                deezerPreviewsRef.current[t.id] = data.previewUrl;
                setDeezerPreviews(prev => ({ ...prev, [t.id]: data.previewUrl! }));
              }
            })
            .catch(() => {});

        const runBatch = async (tracks: TrackItem[]) => {
          for (let i = 0; i < tracks.length; i += batchSize) {
            await Promise.all(tracks.slice(i, i + batchSize).map(fetchPreview));
          }
        };
        runBatch(loadedTracks);
      })
      .catch(() => setTracks([]));

    fetch(`/api/world/${enc}/subgenres`)
      .then(r => r.json())
      .then(d => setSubgenres(d?.subgenres ?? []))
      .catch(() => setSubgenres([]));
  }, [selected]);

  // ── Friends genres fetch (always once on mount) ───────────────────────────
  useEffect(() => {
    fetch("/api/world/friends")
      .then(r => r.json())
      .then(d => setFriendsGenres(d ?? {}))
      .catch(() => setFriendsGenres({}));
  }, []);

  // ── Friends subgenres lazy fetch ──────────────────────────────────────────
  useEffect(() => {
    if (!selected || !selectedSubgenre) return;
    if (friendsSubgenresFetchedRef.current.has(selected)) return;
    friendsSubgenresFetchedRef.current.add(selected);
    const enc = encodeURIComponent(selected);
    fetch(`/api/world/friends/${enc}/subgenres`)
      .then(r => r.json())
      .then(d => {
        const names = (d?.subgenres ?? []).map((s: { name: string }) => s.name);
        setFriendsSubgenres(prev => ({ ...prev, [selected]: names }));
      })
      .catch(() => {});
  }, [selected, selectedSubgenre]);

  // ── Substitute profile listener ───────────────────────────────────────────
  useEffect(() => {
    const onSubChange = (e: Event) => {
      const profile = (e as CustomEvent<{ userId: string; userName: string } | null>).detail;
      setSubstituteProfile(profile);
      setUnheardMode(false);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "blueprint:substituteProfile") return;
      try { const p = e.newValue ? JSON.parse(e.newValue) : null; setSubstituteProfile(p); setUnheardMode(false); } catch {}
    };
    window.addEventListener("blueprint:substituteChange", onSubChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("blueprint:substituteChange", onSubChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // ── Refetch tracks when substituteProfile changes ─────────────────────────
  useEffect(() => {
    if (!selected) return;
    const enc = encodeURIComponent(selected);
    const subId = substituteProfileRef.current?.userId;
    const url = subId
      ? `/api/world/${enc}?unheardForUserId=${encodeURIComponent(subId)}`
      : `/api/world/${enc}`;
    fetch(url).then(r => r.json()).then(d => { setTracks(d?.tracks ?? []); }).catch(() => {});
  }, [substituteProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-rotate company carousel ─────────────────────────────────────────
  // 5000ms per slide (up from 4200ms) — enough time to read both the right-side
  // UI mockup and the left-side rotating line.
  // discoveryIdx updates 250ms after carouselIdx so the right visual leads.
  useEffect(() => {
    const id = setInterval(() => {
      setCarouselIdx(i => {
        const next = (i + 1) % COMPANIES.length;
        setTimeout(() => setDiscoveryIdx(next), 250);
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // When carouselIdx changes: capture the outgoing label index as "prev" so
  // it can sit underneath while the new label wipes in left-to-right.
  // Skips the very first mount (ref starts null) so there's no wipe on load.
  useEffect(() => {
    if (page3PrevIdxRef.current === null) {
      page3PrevIdxRef.current = carouselIdx;
      return;
    }
    setPrevPage3LabelIdx(page3PrevIdxRef.current);
    setPage3LabelAnimKey(k => k + 1);
    page3PrevIdxRef.current = carouselIdx;
  }, [carouselIdx]);

  // ── Sheet ↔ selection sync (mobile only) ────────────────────────────────
  // When a genre is tapped → open sheet to MID (if not already open/higher).
  // When selection cleared → close sheet. Sheet state does NOT affect sphere.
  useEffect(() => {
    if (!isMobile) return;
    if (selected !== null) {
      setSheetSnap(prev => (prev === 0 ? 1 : prev));
    } else {
      setSheetSnap(0);
    }
  }, [selected, isMobile]);

  // ── Mobile body-scroll lock ───────────────────────────────────────────────
  // Locks the main page scroll whenever the user is in any exploration state
  // (genre selected → tracklist open → zoomed in). Prevents the underlying
  // homepage sections from scrolling beneath the fixed sphere and sheet.
  //
  // Condition: `selected !== null` — this is the single source of truth that
  // drives all exploration sub-states (sheetSnap, zoom, subgenre focus, etc.).
  //
  // Mechanism: overflow:hidden on BOTH <html> and <body> is the most reliable
  // cross-browser (including iOS Safari) way to suppress body scroll.
  //
  // The tracklist is position:fixed with its own overflow-y:auto — fixed
  // elements scroll independently of the document body, so locking the body
  // does NOT affect internal tracklist scrolling.
  //
  // On unlock (selected → null), both properties are cleared so the user can
  // scroll to sections 2–4 again.
  useEffect(() => {
    if (!isMobile) return;

    if (selected !== null) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow            = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow            = "";
    }

    // Always clean up on unmount so we never leave the page stuck.
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow            = "";
    };
  }, [isMobile, selected]);

  // ── Mobile scroll-down reset (mobile only) ───────────────────────────────
  // When the user is on page 1 (scrollY ≈ 0) and swipes downward, AND the
  // sphere is zoomed in or a genre/sheet is open, clear all exploration state
  // so normal page scrolling can continue to page 2+.
  //
  // Design constraints:
  //   • passive:true — we never call preventDefault, so scroll is never blocked.
  //   • resetFired — one reset per gesture; avoids repeated state flushes.
  //   • tracklist guard — ignore touches that begin inside the sheet's scroll
  //     list so the user can scroll through tracks without triggering a reset.
  //   • Desktop untouched — early return if !isMobile.
  useEffect(() => {
    if (!isMobile) return;

    let touchStartY   = 0;
    let touchStartTarget: EventTarget | null = null;
    let resetFired    = false;

    const onStart = (e: TouchEvent) => {
      touchStartY      = e.touches[0].clientY;
      touchStartTarget = e.touches[0].target;
      resetFired       = false;
    };

    const onMove = (e: TouchEvent) => {
      if (resetFired) return;

      const deltaY = e.touches[0].clientY - touchStartY;
      if (deltaY <= 20) return;                                 // not a downward swipe yet

      // Only act when near the top of the page (page 1 visible)
      if (window.scrollY > 80) return;

      // Ignore touches that started on the sphere canvas — that's a sphere
      // drag/rotate gesture, not a page-scroll-down intent.  Without this guard
      // any downward sphere drag > 20px would wrongly fire the reset.
      if (
        canvasRef.current &&
        touchStartTarget instanceof Node &&
        canvasRef.current.contains(touchStartTarget)
      ) {
        console.log("[scroll-reset] skipped — touch started on sphere canvas");
        return;
      }

      // Ignore touches that started inside the tracklist scroll container
      if (
        mobileTracklistRef.current &&
        touchStartTarget instanceof Node &&
        mobileTracklistRef.current.contains(touchStartTarget)
      ) return;

      // When the tracklist sheet is EXPANDED (state 2), a downward swipe means
      // "collapse the sheet to peek" — not "exit exploration entirely".
      // The sheet's own onTouchEnd handler (on the sheet container div) already
      // handles the 2 → 1 snap.  We must not also fire the full sphere reset here,
      // or the sphere zooms out and the genre selection is lost.
      // Only once the sheet is back at peek (state 1) does a further downward
      // swipe fall through to the reset path below.
      if (sheetSnapRef.current === 2) return;

      // Check whether there is any exploration state to clear
      const needsReset =
        zoomTargetRef.current > 1.05 ||
        selectedRef.current !== null ||
        sheetSnapRef.current > 0;

      if (!needsReset) return;

      resetFired = true; // run once per gesture
      console.log("[scroll-reset] downward page-swipe detected — resetting exploration state");

      // Reset zoom
      zoomTargetRef.current = 1;
      zoomRef.current       = 1;

      // Clear genre / subgenre selection
      autoSelectedRef.current     = false;
      selectedSubgenreRef.current = null; setSelectedSubgenre(null);
      zoomSubgenreRef.current     = null; setZoomSubgenre(null);
      setSelected(null);

      // Close the sheet (sheetSnap ↔ selected sync will also fire, but
      // calling setSheetSnap(0) directly ensures it collapses immediately)
      setSheetSnap(0);

      // Stop preview audio + discard any pending fetch
      requestedTrackRef.current = null; setPendingTrackId(null);
      if (pendingAudioRef.current) { pendingAudioRef.current.src = ""; pendingAudioRef.current = null; }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setNowPlayingId(null);
      setAudioPlaying(false);
      setPlayingTrack(null);

      // NOTE: we do NOT call e.preventDefault() — the scroll must be allowed
      // through so the page continues scrolling to section 2.
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove",  onMove,  { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove",  onMove);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // ── Spotify Web Playback SDK — initialize when user logs in ──────────────
  useEffect(() => {
    const userEmail = session?.user?.email;

    if (!userEmail) {
      // Logged out — disconnect SDK and reset state
      if (spotifyPlayerRef.current) {
        spotifyPlayerRef.current.disconnect();
        spotifyPlayerRef.current = null;
      }
      spotifyDeviceIdRef.current = null;
      setSpotifyReady(false);
      setSpotifyMode(false);
      return;
    }

    let cancelled = false;

    const initPlayer = async () => {
      try {
        const res = await fetch("/api/spotify/token");
        if (!res.ok || cancelled) return;
        const { accessToken, scope } = (await res.json()) as { accessToken: string; scope: string };
        if (!scope?.includes("streaming")) return; // needs re-auth for new scopes

        spotifyTokenRef.current = accessToken;

        const createPlayer = () => {
          if (cancelled || !window.Spotify) return;

          const player = new window.Spotify.Player({
            name: "Blueprint",
            getOAuthToken: async (cb) => {
              try {
                const r = await fetch("/api/spotify/token");
                if (!r.ok) return;
                const { accessToken: fresh } = (await r.json()) as { accessToken: string };
                spotifyTokenRef.current = fresh;
                cb(fresh);
              } catch { /* silent — preview fallback stays active */ }
            },
            volume: 0.8,
          });

          player.addListener("ready", (data: any) => {
            if (!cancelled) {
              spotifyDeviceIdRef.current = data.device_id;
              setSpotifyReady(true);
            }
          });
          player.addListener("not_ready",          () => setSpotifyReady(false));
          player.addListener("account_error",       () => { setNotPremium(true); setSpotifyReady(false); });
          player.addListener("authentication_error", () => setSpotifyReady(false));

          player.connect();
          spotifyPlayerRef.current = player;
        };

        if (window.Spotify) {
          createPlayer();
        } else {
          window.onSpotifyWebPlaybackSDKReady = createPlayer;
          if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
            const s = document.createElement("script");
            s.src   = "https://sdk.scdn.co/spotify-player.js";
            s.async = true;
            document.body.appendChild(s);
          }
        }
      } catch { /* silent — preview mode stays active */ }
    };

    initPlayer();

    return () => {
      cancelled = true;
      if (spotifyPlayerRef.current) {
        spotifyPlayerRef.current.disconnect();
        spotifyPlayerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

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

  // ── Canvas render loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || Object.keys(worlds).length === 0) return;

    // Cap DPR at 2 — anything higher (e.g. 3× mobile screens) hits diminishing
    // returns and wastes GPU fill-rate. 2× covers Retina Mac and every flagship phone.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // sync: sets the canvas BUFFER to physical pixels so there is a 1-to-1 mapping
    // between canvas pixels and screen pixels.  The CSS size (w-full h-full) stays
    // unchanged — only the internal resolution increases.
    const sync = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w === 0 || h === 0) return;
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
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
    // Expose per-face ownership to click/hover handlers for exact boundary resolution
    faceCentsRef.current  = cents;
    faceRegionRef.current = [...region];

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

    // On mobile, pinch end sets this flag so zoom snaps immediately (no glide).
    let snapZoom = false;

    function drawFrame() {
      // ── Zoom interpolation ──────────────────────────────────────────────────
      // Desktop: smooth lerp for Google Maps feel.
      // Mobile: snap immediately on pinch end (snapZoom flag) for direct feel;
      // normal lerp on wheel (desktop-only path) or between snap events.
      if (snapZoom) {
        zoomRef.current = zoomTargetRef.current;
        snapZoom = false;
      } else {
        zoomRef.current += (zoomTargetRef.current - zoomRef.current) * 0.10;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Work in CSS pixels so all geometry math, hit-test coords, and label
      // positions stay consistent with pointer/touch events (which are CSS px).
      // ctx.setTransform scales every draw call up to physical pixels internally.
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (!W || !H) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Scale context to physical pixels — this is what makes every stroke,
      // fill, and text render at full Retina / high-DPI sharpness.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const R   = Math.min(W, H) * 0.34 * zoomRef.current;
      const cx  = W / 2, cy = H / 2;
      const [m0,m1,m2,m3,m4,m5,m6,m7,m8] = rotMatRef.current;
      labelHitsRef.current = [];
      ctx.clearRect(0, 0, W, H);

      const atmo = ctx.createRadialGradient(cx, cy, R*0.82, cx, cy, R*1.22);
      atmo.addColorStop(0, "rgba(70,70,180,0.13)");
      atmo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath(); ctx.arc(cx, cy, R*1.22, 0, Math.PI*2);
      ctx.fillStyle = atmo; ctx.fill();

      const pv = verts.map(([x, y, z]) => {
        const xs = m0*x + m1*y + m2*z;
        const ys = m3*x + m4*y + m5*z;
        const zs = m6*x + m7*y + m8*z;
        const s  = FOV / (FOV + zs);
        return { sx: cx + xs*R*s, sy: cy + ys*R*s, z: zs };
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
        // On mobile, hide the selected-genre label once subgenres are revealed —
        // subgenre labels on the sphere surface replace it at that zoom level.
        if (isMobileRef.current && isSelG && zoomRef.current >= 1.9) continue;
        const rawLx=a.sx/a.n, rawLy=a.sy/a.n;
        const lx=isSelG?Math.max(80,Math.min(W-80,rawLx)):rawLx;
        const ly=isSelG?Math.max(24,Math.min(H*0.88,rawLy)):rawLy;
        const name=names[ri];
        const label=shortLabel(name); // short display name; full name kept for data lookups
        const [r,g,b]=rgbMap[ri];
        const isThisHov=ri===hoveredIdx;
        const labelDim=isSelG||isThisHov?1.0:selectedIdx>=0?0.28:0.75;
        const fs=isMobileRef.current ? (isSelG?15:13) : (isSelG?18:15);
        ctx.globalAlpha=labelDim;
        ctx.font=`700 ${fs}px system-ui, sans-serif`;
        const tw=ctx.measureText(label).width, pad=8, rad=8;
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
        ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillText(label,lx,ly);
        ctx.globalAlpha=1.0;
        // hit-box uses full `name` so tap/click lookups still resolve to the correct data key
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
          // Previous threshold was n<2, which silently dropped every single-triangle
          // subgenre region. Now we label every region that has at least 1 visible face.
          if(a.n<1)continue;
          const si=Number(siStr), sub=activeSubsRef.current[si]; if(!sub)continue;
          const lx=a.sx/a.n, ly=a.sy/a.n;
          const n2=activeSubsRef.current.length;
          const t2=n2>1?1-si/(n2-1):0.5;
          // Raised brightness floor: was 0.45+0.55*t2 (min 45%).
          // Now 0.82+0.18*t2 (min 82%) — every subgenre reads clearly.
          const scale2=0.82+0.18*t2;
          const [pr,pg,pb]=rgbMap[selectedIdx];
          const cr=Math.round(pr*scale2),cg=Math.round(pg*scale2),cb=Math.round(pb*scale2);
          const isActiveSub=selectedSubgenreRef.current===sub.name;
          const isHovSub=hoveredSubName===sub.name;
          const subLit=isActiveSub||isHovSub;
          // Scale font and padding down for tiny regions so the pill can still fit
          // inside a 1- or 2-triangle face without overflowing into a neighbour.
          const isTiny = a.n <= 1;
          const fs2  = isMobileRef.current
            ? (isTiny ? 8  : subLit ? 12 : 11)
            : (isTiny ? 9  : subLit ? 14 : 13);
          const pad2 = isTiny ? 3  : 6;
          const rad2 = isTiny ? 3  : 6;
          ctx.font=`${subLit?700:600} ${fs2}px system-ui, sans-serif`;
          const tw2=ctx.measureText(sub.name).width;
          const bx2=lx-tw2/2-pad2,by2=ly-fs2/2-pad2,bw2=tw2+pad2*2,bh2=fs2+pad2*2;
          ctx.save();
          // Color-tinted glow on all states (not just hover) lifts labels off
          // the dark sphere surface.  Hover gets a stronger glow.
          ctx.shadowColor=isHovSub?`rgba(${cr},${cg},${cb},0.70)`:`rgba(${cr},${cg},${cb},0.30)`;
          ctx.shadowBlur=isHovSub?16:10;
          // Darker pill background in default state for better text contrast.
          ctx.fillStyle=isActiveSub?`rgba(${cr},${cg},${cb},0.22)`:isHovSub?`rgba(${cr},${cg},${cb},0.15)`:"rgba(4,4,12,0.80)";
          ctx.beginPath();ctx.roundRect(bx2,by2,bw2,bh2,rad2);ctx.fill();
          ctx.restore();
          // Border on every label (not just active/hover) separates pill from surface.
          if(isActiveSub){
            ctx.strokeStyle=`rgba(${cr},${cg},${cb},1.0)`;ctx.lineWidth=1.5;
            ctx.beginPath();ctx.roundRect(bx2,by2,bw2,bh2,rad2);ctx.stroke();
          } else if(isHovSub){
            ctx.strokeStyle=`rgba(${cr},${cg},${cb},0.70)`;ctx.lineWidth=1.0;
            ctx.beginPath();ctx.roundRect(bx2,by2,bw2,bh2,rad2);ctx.stroke();
          } else {
            ctx.strokeStyle=`rgba(${cr},${cg},${cb},0.28)`;ctx.lineWidth=0.75;
            ctx.beginPath();ctx.roundRect(bx2,by2,bw2,bh2,rad2);ctx.stroke();
          }
          // Full opacity text — brightness is already managed by scale2.
          ctx.fillStyle=`rgb(${cr},${cg},${cb})`;
          ctx.fillText(sub.name,lx,ly);
          labelHitsRef.current.push({name:selected!,subgenre:sub.name,x1:bx2,y1:by2,x2:bx2+bw2,y2:by2+bh2});
        }
        ctx.globalAlpha=1.0;
      }
      ctx.textBaseline="alphabetic";
    }

    // ── Zoom constants ────────────────────────────────────────────────────────
    const MIN_ZOOM = 1.0;  // hero state is the hard floor — cannot zoom smaller
    const MAX_ZOOM = 5.0;

    // ── Shared zoom-apply helper (used by both wheel paths below) ────────────
    const applyZoomDelta = (rawDelta: number) => {
      const clampedDelta = Math.max(-50, Math.min(50, rawDelta));
      const prevTarget   = zoomTargetRef.current;
      const newTarget    = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prevTarget * (1 - clampedDelta * 0.008)));
      zoomTargetRef.current = newTarget;

      if (newTarget >= 1.2 && selectedRef.current === null && regionPolesRef.current.length > 0) {
        const [,,,,,,rm6,rm7,rm8] = rotMatRef.current;
        let bestName = regionPolesRef.current[0].name, bestZ = -Infinity;
        for (const { name, pole: [px, py, pz] } of regionPolesRef.current) {
          const z2 = rm6*px + rm7*py + rm8*pz;
          if (z2 > bestZ) { bestZ = z2; bestName = name; }
        }
        autoSelectedRef.current = true;
        setSelected(bestName);
      }
      if (newTarget < 2.0) {
        if (zoomSubgenreRef.current     !== null) { zoomSubgenreRef.current     = null; setZoomSubgenre(null); }
        if (selectedSubgenreRef.current !== null) { selectedSubgenreRef.current = null; setSelectedSubgenre(null); }
      }
      if (newTarget <= MIN_ZOOM + 0.1 && selectedRef.current !== null) {
        autoSelectedRef.current     = false;
        selectedSubgenreRef.current = null; setSelectedSubgenre(null);
        zoomSubgenreRef.current     = null; setZoomSubgenre(null);
        setSelected(null);
      }
    };

    // ── Wheel handler ─────────────────────────────────────────────────────────
    // Design rules:
    //   1. Outside sphere circle → let page scroll (never captured).
    //   2. At floor zoom scrolling down → let page scroll (escape to Page 2).
    //   3. Not in explore mode + scrolling down → let page scroll.
    //   4. selectedRef.current (sync) — never the stale closure `selected`.
    //   5. deltaY clamped to [-50, 50] to kill trackpad momentum/bounce spikes.
    //   6. Only zoomTargetRef is updated here — zoomRef lerps in drawFrame.
    //   7. Subgenres are NEVER auto-selected by zoom. Selection = explicit click only.
    //   8. Narrow edge-case block: pinch-zoom-out (ctrlKey) at MIN_ZOOM prevents
    //      the browser viewport from zooming. All other paths run normally.
    const onWheel = (e: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const W    = canvas.clientWidth, H = canvas.clientHeight;
      const R    = Math.min(W, H) * 0.34 * zoomRef.current;
      const dx   = mx - W / 2, dy = my - H / 2;
      const overSphere = dx * dx + dy * dy <= R * R;

      // ── Narrow fix: pinch-zoom-out (ctrlKey) when already at the floor ──────
      // ctrlKey+wheel is how macOS trackpad pinch fires. If the sphere is already
      // at MIN_ZOOM and the user pinches out, the browser would normally zoom the
      // viewport. Block ONLY that specific case — nothing else.
      if (e.ctrlKey && overSphere && e.deltaY > 0 && zoomTargetRef.current <= MIN_ZOOM + 0.02) {
        e.preventDefault();
        return;
      }

      // Gate 1: cursor outside visual sphere → let page scroll
      if (!overSphere) return;

      // Gate 2: at floor zoom scrolling down → let page scroll (escape to Page 2)
      if (e.deltaY > 0 && zoomTargetRef.current <= MIN_ZOOM + 0.02) return;

      // Gate 3: not in explore mode + scrolling down → let page scroll
      const inExploreMode = selectedRef.current !== null || zoomTargetRef.current > 1.05;
      if (!inExploreMode && e.deltaY > 0) return;

      e.preventDefault();
      applyZoomDelta(e.deltaY);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // ── Safari GestureEvent handling ──────────────────────────────────────────
    // Safari fires its own GestureEvent API (gesturestart / gesturechange /
    // gestureend) for trackpad pinch. On some Safari versions these fire instead
    // of ctrlKey+wheel; on others they fire alongside it. Either way, if we do
    // NOT prevent them, Safari uses them to zoom the browser viewport directly.
    //
    // We ONLY block them in the exact edge case:
    //   - sphere is already at MIN_ZOOM  (can't zoom out further)
    //   - AND the gesture is moving in the zoom-out direction (scale shrinking)
    //
    // All other gesture events are left unblocked so normal sphere zoom via the
    // ctrlKey+wheel path continues to work.
    let gestureStartScale = 1;

    const onGestureStart = (e: Event) => {
      // Record the reference scale at gesture start — no prevention needed here.
      gestureStartScale = (e as any).scale ?? 1;
    };

    const onGestureChange = (e: Event) => {
      const scale = (e as any).scale ?? 1;
      // If the pinch is opening (scale < gestureStartScale = zooming out) and
      // the sphere is already at the floor, block the browser from zooming.
      if (scale < gestureStartScale && zoomTargetRef.current <= MIN_ZOOM + 0.02) {
        e.preventDefault();
      }
    };

    const onGestureEnd = (e: Event) => {
      // Cover the tail of a zoom-out gesture that ends at the floor.
      if (zoomTargetRef.current <= MIN_ZOOM + 0.02) {
        e.preventDefault();
      }
      gestureStartScale = 1;
    };

    // gesturestart is passive — we only read the scale, never call preventDefault.
    // gesturechange / gestureend are non-passive so we can preventDefault when needed.
    canvas.addEventListener("gesturestart",  onGestureStart,  { passive: true  });
    canvas.addEventListener("gesturechange", onGestureChange, { passive: false });
    canvas.addEventListener("gestureend",    onGestureEnd,    { passive: false });

    // ── Touch handlers (mobile) ───────────────────────────────────────────────
    // Touch state is local to this effect instance. Re-created on every effect run
    // (which happens when worlds/selected/subgenres change), matching how the mouse
    // handlers rebuild their stale closures.
    let touchDrag    = { active: false, lx: 0, ly: 0, moved: false };
    let touchGrabVec: [number, number, number] | null = null;
    // Restore pinch state so a mid-pinch effect re-run doesn't freeze the gesture.
    let pinchActive  = pinchStateRef.current.active;
    let pinchDist0   = pinchStateRef.current.dist0;
    let pinchZoom0   = pinchStateRef.current.zoom0;
    let lastTapTime  = 0;
    let lastTapX     = 0;
    let lastTapY     = 0;
    // Returns true if a touch point is within the (slightly enlarged) sphere area.
    // The enlarged radius makes touch easier without changing the visual.
    const touchOverSphere = (clientX: number, clientY: number) => {
      const rect2 = canvas.getBoundingClientRect();
      const mx2   = clientX - rect2.left, my2 = clientY - rect2.top;
      const W2    = canvas.clientWidth,   H2  = canvas.clientHeight;
      const R2    = Math.min(W2, H2) * 0.40 * zoomRef.current; // 18% larger than visual radius
      const dx2   = mx2 - W2 / 2,        dy2 = my2 - H2 / 2;
      return dx2 * dx2 + dy2 * dy2 <= R2 * R2;
    };

    const onTouchStart = (e: TouchEvent) => {
      const touches = e.touches;

      if (touches.length === 1) {
        const t = touches[0];
        if (!touchOverSphere(t.clientX, t.clientY)) return; // outside sphere → let page scroll
        e.preventDefault();
        touchDrag = { active: true, lx: t.clientX, ly: t.clientY, moved: false };
        // Compute the 3-D grab point for arcball rotation
        {
          const rect2 = canvas.getBoundingClientRect();
          const W2 = canvas.clientWidth, H2 = canvas.clientHeight;
          const R2 = Math.min(W2, H2) * 0.35 * zoomRef.current;
          touchGrabVec = arcballVec(t.clientX - rect2.left, t.clientY - rect2.top, W2 / 2, H2 / 2, R2);
        }

        // Double-tap detection: second tap within 320 ms and 55 px → zoom in
        const now = performance.now();
        const dtx = t.clientX - lastTapX, dty = t.clientY - lastTapY;
        if (now - lastTapTime < 320 && dtx * dtx + dty * dty < 55 * 55) {
          applyZoomDelta(-120);
        }

      } else if (touches.length === 2) {
        e.preventDefault();
        pinchActive = true;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        pinchDist0       = Math.sqrt(dx * dx + dy * dy);
        pinchZoom0       = zoomTargetRef.current;
        touchDrag.active = false; // cancel any single-finger drag in progress
        // Persist so the gesture survives a mid-pinch effect re-run
        pinchStateRef.current = { active: true, dist0: pinchDist0, zoom0: pinchZoom0 };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const touches = e.touches;

      if (touches.length === 1 && touchDrag.active) {
        e.preventDefault();
        const t = touches[0];

        // ── Shared arcball model (same math as desktop) ─────────────────────
        // Project the new finger position onto the unit sphere and rotate
        // from the previous grab point to this new position.  No fixed
        // sensitivity constant — works equally well at any zoom level.
        if (touchGrabVec) {
          const rect2 = canvas.getBoundingClientRect();
          const W2 = canvas.clientWidth, H2 = canvas.clientHeight;
          const R2 = Math.min(W2, H2) * 0.35 * zoomRef.current;
          const newVec2 = arcballVec(t.clientX - rect2.left, t.clientY - rect2.top, W2 / 2, H2 / 2, R2);
          const q2 = quatFromTo(touchGrabVec, newVec2);
          rotMatRef.current = mat3Ortho(mat3Premul(matFromQuat(q2), rotMatRef.current));
          touchGrabVec = newVec2;
        }

        const dx = t.clientX - touchDrag.lx;
        const dy = t.clientY - touchDrag.ly;
        touchDrag.lx = t.clientX;
        touchDrag.ly = t.clientY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) touchDrag.moved = true;
        hoveredRef.current = null;

        // Auto-deselect when selected genre rotates to the back hemisphere.
        // Uses matrix row-2 (depth row) dotted with the pole — no Euler needed.
        if (selected !== null && zoomRef.current >= 1.1 && regionPolesRef.current.length > 0) {
          const selEntry = regionPolesRef.current.find(r => r.name === selected);
          if (selEntry) {
            const [px, py, pz] = selEntry.pole;
            const [,,,,,,sm6,sm7,sm8] = rotMatRef.current;
            if (sm6*px + sm7*py + sm8*pz < 0) {
              autoSelectedRef.current     = false;
              selectedSubgenreRef.current = null; setSelectedSubgenre(null);
              zoomSubgenreRef.current     = null; setZoomSubgenre(null);
              setSelected(null);
            }
          }
        }

      } else if (touches.length === 2 && pinchActive) {
        e.preventDefault();
        const dx      = touches[0].clientX - touches[1].clientX;
        const dy      = touches[0].clientY - touches[1].clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchZoom0 * (newDist / pinchDist0)));
        // Write to BOTH refs so zoomRef never lags behind zoomTargetRef during
        // the gesture.  This eliminates the lerp gap that caused post-pinch glide.
        zoomTargetRef.current = newZoom;
        zoomRef.current       = newZoom;

        // Same auto-select logic as applyZoomDelta — use matrix depth row
        if (newZoom >= 1.2 && selectedRef.current === null && regionPolesRef.current.length > 0) {
          const [,,,,,,pm6,pm7,pm8] = rotMatRef.current;
          let bestName = regionPolesRef.current[0].name, bestZ = -Infinity;
          for (const { name, pole: [px, py, pz] } of regionPolesRef.current) {
            const z2 = pm6*px + pm7*py + pm8*pz;
            if (z2 > bestZ) { bestZ = z2; bestName = name; }
          }
          autoSelectedRef.current = true;
          setSelected(bestName);
        }
        if (newZoom < 2.0) {
          if (zoomSubgenreRef.current     !== null) { zoomSubgenreRef.current     = null; setZoomSubgenre(null); }
          if (selectedSubgenreRef.current !== null) { selectedSubgenreRef.current = null; setSelectedSubgenre(null); }
        }
        if (newZoom <= MIN_ZOOM + 0.1 && selectedRef.current !== null) {
          autoSelectedRef.current     = false;
          selectedSubgenreRef.current = null; setSelectedSubgenre(null);
          zoomSubgenreRef.current     = null; setZoomSubgenre(null);
          setSelected(null);
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const remaining    = e.touches.length;
      const wasPinching  = pinchActive;
      const wasDragging  = touchDrag.active;
      const wasMoved     = touchDrag.moved;

      if (remaining === 0) {
        // All fingers lifted
        // On mobile: snap zoom immediately when pinch ends (no post-pinch glide)
        if (wasPinching) snapZoom = true;
        pinchActive                  = false;
        pinchStateRef.current.active = false;  // clear so restored closures know pinch is done
        touchDrag.active             = false;

        // A stationary single-finger tap → treat as click
        if (!wasPinching && wasDragging && !wasMoved) {
          const ct   = e.changedTouches[0];
          const rect3 = canvas.getBoundingClientRect();
          const mx3  = ct.clientX - rect3.left, my3 = ct.clientY - rect3.top;
          // Record for double-tap detection
          lastTapTime = performance.now();
          lastTapX    = ct.clientX;
          lastTapY    = ct.clientY;

          // ── Label hit test (10 px padding on each side = larger tap targets) ──
          for (const h of labelHitsRef.current) {
            const E = 10;
            if (mx3 >= h.x1 - E && mx3 <= h.x2 + E && my3 >= h.y1 - E && my3 <= h.y2 + E) {
              if (h.subgenre) {
                const next = selectedSubgenreRef.current === h.subgenre ? null : h.subgenre;
                selectedSubgenreRef.current = next; setSelectedSubgenre(next);
              } else {
                const isDeselectLabel = selectedRef.current === h.name;
                autoSelectedRef.current     = false;
                selectedSubgenreRef.current = null; setSelectedSubgenre(null);
                zoomSubgenreRef.current     = null; setZoomSubgenre(null);
                setSelected(prev => prev === h.name ? null : h.name);
                // Drive zoom to subgenre-reveal level in one continuous animation
                if (!isDeselectLabel) {
                  zoomTargetRef.current = Math.max(zoomTargetRef.current, 2.5);
                }
              }
              return;
            }
          }

          // ── Sphere hit test — snaps to nearest region automatically ──────────
          const W3  = canvas.clientWidth, H3 = canvas.clientHeight;
          const R3  = Math.min(W3, H3) * 0.35 * zoomRef.current;
          const nx3 = (mx3 - W3 / 2) / R3, ny3 = (my3 - H3 / 2) / R3;

          if (nx3 * nx3 + ny3 * ny3 > 1.0) {
            // Tapped outside sphere — clear selection
            autoSelectedRef.current     = false;
            selectedSubgenreRef.current = null; setSelectedSubgenre(null);
            zoomSubgenreRef.current     = null; setZoomSubgenre(null);
            setSelected(null);
          } else {
            const nz3 = Math.sqrt(Math.max(0, 1 - nx3 * nx3 - ny3 * ny3));
            // Unproject screen-space normal through M^T (transpose = inverse for rotation)
            const [tm0,tm1,tm2,tm3,tm4,tm5,tm6,tm7,tm8] = rotMatRef.current;
            const x_w = tm0*nx3 + tm3*ny3 + tm6*nz3;
            const y_w = tm1*nx3 + tm4*ny3 + tm7*nz3;
            const z_w = tm2*nx3 + tm5*ny3 + tm8*nz3;
            if (regionPolesRef.current.length === 0) return;

            // Per-face genre lookup for accurate boundary resolution
            const fCentsT  = faceCentsRef.current;
            const fRegionT = faceRegionRef.current;
            let bestTName: string;
            if (fCentsT.length > 0 && fRegionT.length > 0) {
              let bestTIdx = 0, bestTDot = -Infinity;
              for (let i = 0; i < fCentsT.length; i++) {
                const d = fCentsT[i][0]*x_w + fCentsT[i][1]*y_w + fCentsT[i][2]*z_w;
                if (d > bestTDot) { bestTDot = d; bestTIdx = i; }
              }
              bestTName = regionPolesRef.current[fRegionT[bestTIdx]]?.name ?? regionPolesRef.current[0].name;
            } else {
              let bestT = regionPolesRef.current[0], bestTDotFb = -Infinity;
              for (const rd of regionPolesRef.current) {
                const d = rd.pole[0]*x_w + rd.pole[1]*y_w + rd.pole[2]*z_w;
                if (d > bestTDotFb) { bestTDotFb = d; bestT = rd; }
              }
              bestTName = bestT.name;
            }

            if (selected !== null && zoomRef.current >= 2.0 && bestTName === selected && subPolesRef.current.length > 0) {
              // Per-face subgenre lookup — same principle as genre lookup
              const subFacesT = [...subRegionRef.current.keys()];
              let bestSFT = subFacesT[0] ?? -1, bestSDT = -Infinity;
              for (const fi of subFacesT) {
                const c = fCentsT[fi]; if (!c) continue;
                const d = c[0]*x_w + c[1]*y_w + c[2]*z_w;
                if (d > bestSDT) { bestSDT = d; bestSFT = fi; }
              }
              const sIdxT = subRegionRef.current.get(bestSFT) ?? 0;
              const sNameT = activeSubsRef.current[sIdxT]?.name ?? subPolesRef.current[0]?.name ?? "";
              const next = selectedSubgenreRef.current === sNameT ? null : sNameT;
              selectedSubgenreRef.current = next; setSelectedSubgenre(next);
            } else {
              const isDeselect = selectedRef.current === bestTName;
              autoSelectedRef.current     = false;
              selectedSubgenreRef.current = null; setSelectedSubgenre(null);
              zoomSubgenreRef.current     = null; setZoomSubgenre(null);
              setSelected(prev => prev === bestTName ? null : bestTName);
              // When selecting a genre, drive zoom deep enough to reveal subgenres
              // in one continuous animation.  Math.max keeps us from zooming out if
              // the user is already deeper than 2.5.
              if (!isDeselect) {
                zoomTargetRef.current = Math.max(zoomTargetRef.current, 2.5);
              }
            }
          }
        }

      } else if (remaining === 1 && wasPinching) {
        // Transition 2 → 1 fingers: stop pinch, snap zoom, hand off to drag.
        // Without snapZoom here the lerp would keep running after one finger lifts.
        pinchActive                  = false;
        pinchStateRef.current.active = false;
        snapZoom                     = true;
        const t = e.touches[0];
        touchDrag = { active: true, lx: t.clientX, ly: t.clientY, moved: false };
        // Re-establish arcball grab point for the remaining finger
        {
          const rect2 = canvas.getBoundingClientRect();
          const W2 = canvas.clientWidth, H2 = canvas.clientHeight;
          const R2 = Math.min(W2, H2) * 0.35 * zoomRef.current;
          touchGrabVec = arcballVec(t.clientX - rect2.left, t.clientY - rect2.top, W2 / 2, H2 / 2, R2);
        }
      }
    };

    const onTouchCancel = () => { touchDrag.active = false; touchGrabVec = null; pinchActive = false; pinchStateRef.current.active = false; };

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worlds, selected, subgenres]);

  // ── playTrack ─────────────────────────────────────────────────────────────
  // MUST remain synchronous. audio.play() must be called in the same
  // call stack as the user click — async/await before play() breaks
  // Chrome/Safari user-gesture activation.
  const playTrack = (t: TrackItem) => {

    // ── Step 1: click fired ──────────────────────────────────────────────
    console.log("[play] 1 clicked:", t.name, "—", t.artist);

    // ── Step 2: look up preview URL from ref (synchronous, no fetch) ────
    const previewUrl = deezerPreviewsRef.current[t.id] ?? t.previewUrl ?? null;
    console.log("[play] 2 previewUrl at click time:", previewUrl ? previewUrl.slice(0, 80) + "…" : "null");

    if (!previewUrl) {
      // ── Same currently-playing track clicked → deselect ─────────────────
      if (nowPlayingIdRef.current === t.id) {
        console.log("[play] 2 same no-preview track → deselect");
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        setNowPlayingId(null);
        setAudioPlaying(false);
        setPlayingTrack(null);
        return;
      }

      // ── Same track already pending → fetch already in flight, skip ──────
      if (requestedTrackRef.current === t.id) {
        console.log("[play] 2 same pending track — fetch already in flight, skip");
        return;
      }

      // ── Different track, no URL yet ──────────────────────────────────────
      // Do NOT stop the currently playing audio — the user hasn't confirmed a
      // playable track yet. Record intent, pre-create Audio in this gesture
      // context (gives the browser the best chance of honouring autoplay later),
      // then fire an on-demand URL fetch.
      console.log("[play] 2a no URL — pending intent for", t.name, "(audio continues)");
      requestedTrackRef.current = t.id;
      setPendingTrackId(t.id);

      if (pendingAudioRef.current) { pendingAudioRef.current.src = ""; pendingAudioRef.current = null; }
      const pendingAudio = new Audio();
      pendingAudio.volume = 0.8;
      pendingAudioRef.current = pendingAudio;

      fetch(`/api/preview?track=${encodeURIComponent(t.name)}&artist=${encodeURIComponent(t.artist)}`)
        .then(r => r.json())
        .then((d: { previewUrl: string | null }) => {
          // ── Stale check — user may have clicked elsewhere since ──────────
          if (requestedTrackRef.current !== t.id) {
            console.log("[play] 2b stale — user moved on from", t.name, ", ignoring");
            return;
          }
          requestedTrackRef.current = null;
          setPendingTrackId(null);

          if (!d.previewUrl) {
            console.log("[play] 2b no preview available for", t.name);
            return;
          }
          console.log("[play] 2b URL ready:", d.previewUrl.slice(0, 80) + "…");
          deezerPreviewsRef.current[t.id] = d.previewUrl;
          setDeezerPreviews(prev => ({ ...prev, [t.id]: d.previewUrl! }));

          // Attempt auto-play using the pre-created Audio element. Setting src
          // and calling play() from the async callback works on Chrome (MEI) and
          // modern Safari when the page has recent user-gesture activation.
          const audio = pendingAudioRef.current;
          if (!audio) return;
          audio.src = d.previewUrl;

          // Only now — URL is confirmed — stop the old audio
          if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }

          audio.addEventListener("ended", () => {
            console.log("[play] ← pending audio ended naturally");
            setAudioPlaying(false); setNowPlayingId(null); setPlayingTrack(null);
          });
          audio.addEventListener("error", () => {
            console.error("[play] ← pending audio error");
            delete deezerPreviewsRef.current[t.id];
            setDeezerPreviews(prev => { const n = { ...prev }; delete n[t.id]; return n; });
            setAudioPlaying(false); setNowPlayingId(null); setPlayingTrack(null);
          });

          audioRef.current = audio;
          pendingAudioRef.current = null;
          setNowPlayingId(t.id);
          setPlayingTrack({ id: t.id, name: t.name, artist: t.artist, spotifyId: t.spotifyId ?? null });
          setAudioPlaying(true);

          const p = audio.play();
          if (p !== undefined) {
            p.then(() => {
              console.log("[play] 2b ✓ auto-play resolved for pending track");
            }).catch(err => {
              console.warn("[play] 2b auto-play blocked (browser policy):", err.name);
              // URL is now cached — user can click the track to play it immediately.
              // Undo state so nothing appears stuck.
              if (audioRef.current === audio) audioRef.current = null;
              setAudioPlaying(false);
              setNowPlayingId(null);
              setPlayingTrack(null);
            });
          }
        })
        .catch(err => console.error("[play] 2b on-demand fetch error:", err));
      return;
    }

    // ── Step 3: same track clicked again → deselect completely ─────────
    // Previously this toggled pause/resume and kept nowPlayingId on pause
    // so the track stayed highlighted. The new requirement is a clean
    // toggle-off: second click always stops audio and clears selection,
    // returning the Spotify logo to inactive and removing the highlight.
    console.log("[play] 3 nowPlayingIdRef:", nowPlayingIdRef.current ?? "null");
    if (nowPlayingIdRef.current === t.id) {
      console.log("[play] 3 same track → stop + deselect");
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      setAudioPlaying(false);
      setNowPlayingId(null);
      setPlayingTrack(null);
      return;
    }

    // ── Step 4: cancel any pending fetch and stop current audio ─────────
    // Clicking a track that already has a URL is a confirmed choice — discard
    // any in-flight fetch for a different pending track.
    requestedTrackRef.current = null;
    setPendingTrackId(null);
    if (pendingAudioRef.current) { pendingAudioRef.current.src = ""; pendingAudioRef.current = null; }
    if (audioRef.current) {
      console.log("[play] 4 stopping previous audio");
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // ── Step 5: set audio src ────────────────────────────────────────────
    console.log("[play] 5 new Audio, src =", previewUrl.slice(0, 80) + "…");
    const audio = new Audio(previewUrl);
    audio.volume = 0.8;

    audio.addEventListener("ended", () => {
      console.log("[play] ← audio ended naturally");
      setAudioPlaying(false);
      setNowPlayingId(null);
      setPlayingTrack(null);
    });

    audio.addEventListener("error", () => {
      const err = audio.error;
      console.error("[play] ← audio element error — code:", err?.code, "msg:", err?.message);
      // Purge the bad URL from cache so the next click re-fetches a fresh one
      delete deezerPreviewsRef.current[t.id];
      setDeezerPreviews(prev => { const n = { ...prev }; delete n[t.id]; return n; });
      setAudioPlaying(false);
      setNowPlayingId(null);
      setPlayingTrack(null);
    });

    // ── Step 6: wire state BEFORE calling play() ─────────────────────────
    audioRef.current = audio;
    setNowPlayingId(t.id);
    setPlayingTrack({ id: t.id, name: t.name, artist: t.artist, spotifyId: t.spotifyId ?? null });
    setAudioPlaying(true);

    // ── Step 7 + 8: call play() and log outcome ──────────────────────────
    console.log("[play] 7 calling audio.play()");
    const p = audio.play();
    if (p !== undefined) {
      p.then(() => {
        console.log("[play] 8 ✓ play() resolved — audio is playing");
      }).catch(err => {
        console.error("[play] 8 play() rejected —", err.name + ":", err.message);
        if (err.name === "AbortError") {
          // We interrupted our own playback (e.g. rapid double-click).
          // Don't clear state — the user is in the middle of interacting.
          console.log("[play] 8a AbortError: self-interrupted, state preserved");
          setAudioPlaying(false);
        } else {
          // NotAllowedError, NotSupportedError, etc — clear everything
          delete deezerPreviewsRef.current[t.id];
          setDeezerPreviews(prev => { const n = { ...prev }; delete n[t.id]; return n; });
          setNowPlayingId(null);
          setAudioPlaying(false);
          setPlayingTrack(null);
        }
      });
    } else {
      // Safari (older) returns undefined from play()
      console.log("[play] 8 play() returned undefined — assuming Safari, audio started");
    }
  };

  // ── Mobile zoom pill handlers ─────────────────────────────────────────────
  // The pill cycles through 3 discrete stages (full sphere → genre → subgenre).
  // Stage is derived from selected (React state) + zoomAbove2Ref (polled ref).

  const handleZoomPlus = () => {
    if (!selectedRef.current) return;          // stage 0 — pill not shown anyway
    if (zoomAbove2Ref.current) return;          // already stage 2 — do nothing
    // Stage 1 → 2: zoom into subgenres
    zoomTargetRef.current = 2.5;
  };

  const handleZoomMinus = () => {
    if (!selectedRef.current) return;          // stage 0 — pill not shown anyway
    if (zoomAbove2Ref.current) {
      // Stage 2 → 1: back to main-genre view
      zoomTargetRef.current              = 1.5;
      selectedSubgenreRef.current        = null; setSelectedSubgenre(null);
      zoomSubgenreRef.current            = null; setZoomSubgenre(null);
    } else {
      // Stage 1 → 0: back to full sphere
      zoomTargetRef.current              = 1;
      autoSelectedRef.current            = false;
      selectedSubgenreRef.current        = null; setSelectedSubgenre(null);
      zoomSubgenreRef.current            = null; setZoomSubgenre(null);
      setSelected(null);
    }
  };

  // ── Mouse handlers ────────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const R = Math.min(W, H) * 0.35 * zoomRef.current;
    grabVecRef.current = arcballVec(e.clientX - rect.left, e.clientY - rect.top, W / 2, H / 2, R);
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY, moved: false };
  };

  // Converts screen (mx, my) → world-space unit vector, then finds the face
  // centroid with the highest dot product (= nearest face on the sphere to the
  // click ray). Resolves the face's region index → genre name for exact
  // boundary ownership rather than nearest-region-pole (which averages all
  // face centroids in a region and can misfire near boundaries).
  const hitTestSphere = (mx: number, my: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || regionPolesRef.current.length === 0) return null;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const R = Math.min(W, H) * 0.35 * zoomRef.current;
    const cx = W / 2, cy = H / 2;
    const nx = (mx - cx) / R, ny = (my - cy) / R;
    if (nx * nx + ny * ny > 1) return null;
    const nz  = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const [hm0,hm1,hm2,hm3,hm4,hm5,hm6,hm7,hm8] = rotMatRef.current;
    const x_w = hm0*nx + hm3*ny + hm6*nz;
    const y_w = hm1*nx + hm4*ny + hm7*nz;
    const z_w = hm2*nx + hm5*ny + hm8*nz;
    // Per-face lookup: 320 face centroids → exact region ownership
    const fCents  = faceCentsRef.current;
    const fRegion = faceRegionRef.current;
    if (fCents.length > 0 && fRegion.length > 0) {
      let bestIdx = 0, bestDot = -Infinity;
      for (let i = 0; i < fCents.length; i++) {
        const d = fCents[i][0] * x_w + fCents[i][1] * y_w + fCents[i][2] * z_w;
        if (d > bestDot) { bestDot = d; bestIdx = i; }
      }
      return regionPolesRef.current[fRegion[bestIdx]]?.name ?? null;
    }
    // Fallback: nearest-pole (used before face data is available)
    let best = regionPolesRef.current[0], bestDotFb = -Infinity;
    for (const rd of regionPolesRef.current) {
      const d = rd.pole[0] * x_w + rd.pole[1] * y_w + rd.pole[2] * z_w;
      if (d > bestDotFb) { bestDotFb = d; best = rd; }
    }
    return best.name;
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active && grabVecRef.current) {
      // ── Shared arcball model (same math as mobile) ──────────────────────────
      // Project the new pointer onto the unit sphere and compute the quaternion
      // that rotates the original grab point to this new position.  No fixed
      // sensitivity constant — the rotation follows the pointer exactly.
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const R = Math.min(W, H) * 0.35 * zoomRef.current;
      const newVec = arcballVec(e.clientX - rect.left, e.clientY - rect.top, W / 2, H / 2, R);
      const q = quatFromTo(grabVecRef.current, newVec);
      rotMatRef.current  = mat3Ortho(mat3Premul(matFromQuat(q), rotMatRef.current));
      grabVecRef.current = newVec;   // advance grab point for next frame
      dragRef.current.lx = e.clientX; dragRef.current.ly = e.clientY;
      dragRef.current.moved = true;
      hoveredRef.current = null;
      if (selected !== null && zoomRef.current >= 1.1 && regionPolesRef.current.length > 0) {
        const selEntry = regionPolesRef.current.find(r => r.name === selected);
        if (selEntry) {
          const [px,py,pz] = selEntry.pole;
          const [,,,,,,dm6,dm7,dm8] = rotMatRef.current;
          if (dm6*px + dm7*py + dm8*pz < 0) {
            autoSelectedRef.current = false;
            selectedSubgenreRef.current = null; setSelectedSubgenre(null);
            zoomSubgenreRef.current     = null; setZoomSubgenre(null);
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
      const R2=Math.min(W2,H2)*0.35*zoomRef.current;
      const nx2=(mx-W2/2)/R2, ny2=(my-H2/2)/R2;
      if (nx2*nx2+ny2*ny2<=1) {
        const nz2=Math.sqrt(Math.max(0,1-nx2*nx2-ny2*ny2));
        const [mm0,mm1,mm2,mm3,mm4,mm5,mm6,mm7,mm8] = rotMatRef.current;
        const x_w=mm0*nx2+mm3*ny2+mm6*nz2;
        const y_w=mm1*nx2+mm4*ny2+mm7*nz2;
        const z_w=mm2*nx2+mm5*ny2+mm8*nz2;
        // Per-face subgenre lookup: find nearest owned face, resolve its subgenre
        const subFacesHov = [...subRegionRef.current.keys()];
        let bestSFHov = subFacesHov[0] ?? -1, bestSDHov = -Infinity;
        for (const fi of subFacesHov) {
          const c = faceCentsRef.current[fi]; if (!c) continue;
          const d = c[0]*x_w + c[1]*y_w + c[2]*z_w;
          if (d > bestSDHov) { bestSDHov = d; bestSFHov = fi; }
        }
        const sIdxHov = subRegionRef.current.get(bestSFHov) ?? 0;
        const sNameHov = activeSubsRef.current[sIdxHov]?.name ?? subPolesRef.current[0]?.name ?? "";
        hoveredRef.current={genre:genreName,subgenre:sNameHov}; return;
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
          // Selection is purely click-driven: different subgenre → select it; same → deselect.
          const next = selectedSubgenreRef.current === h.subgenre ? null : h.subgenre;
          selectedSubgenreRef.current = next; setSelectedSubgenre(next);
          // zoomSubgenreRef is managed by the wheel handler independently
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
    const R=Math.min(W,H)*0.35*zoomRef.current;
    const cx=W/2, cy=H/2;
    const nx=(mx-cx)/R, ny=(my-cy)/R;
    if (nx*nx+ny*ny > 1) {
      autoSelectedRef.current=false;
      selectedSubgenreRef.current=null; setSelectedSubgenre(null);
      zoomSubgenreRef.current=null; setZoomSubgenre(null);
      setSelected(null); return;
    }
    const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
    const [cm0,cm1,cm2,cm3,cm4,cm5,cm6,cm7,cm8] = rotMatRef.current;
    const x_w=cm0*nx+cm3*ny+cm6*nz;
    const y_w=cm1*nx+cm4*ny+cm7*nz;
    const z_w=cm2*nx+cm5*ny+cm8*nz;
    if (regionPolesRef.current.length===0) return;
    // Per-face genre lookup: find nearest face centroid → resolve region index → genre name
    const fCentsC  = faceCentsRef.current;
    const fRegionC = faceRegionRef.current;
    let bestNameC: string;
    if (fCentsC.length > 0 && fRegionC.length > 0) {
      let bestCIdx = 0, bestCDot = -Infinity;
      for (let i = 0; i < fCentsC.length; i++) {
        const d = fCentsC[i][0]*x_w + fCentsC[i][1]*y_w + fCentsC[i][2]*z_w;
        if (d > bestCDot) { bestCDot = d; bestCIdx = i; }
      }
      bestNameC = regionPolesRef.current[fRegionC[bestCIdx]]?.name ?? regionPolesRef.current[0].name;
    } else {
      let best = regionPolesRef.current[0], bestDotFb = -Infinity;
      for (const rd of regionPolesRef.current) { const d = rd.pole[0]*x_w+rd.pole[1]*y_w+rd.pole[2]*z_w; if(d>bestDotFb){bestDotFb=d;best=rd;} }
      bestNameC = best.name;
    }
    if (selected!==null&&zoomRef.current>=2.0&&bestNameC===selected&&subPolesRef.current.length>0) {
      // Per-face subgenre lookup: find nearest genre-owned face → resolve subgenre index
      const subFacesC = [...subRegionRef.current.keys()];
      let bestSFC = subFacesC[0] ?? -1, bestSDC = -Infinity;
      for (const fi of subFacesC) {
        const c = fCentsC[fi]; if (!c) continue;
        const d = c[0]*x_w + c[1]*y_w + c[2]*z_w;
        if (d > bestSDC) { bestSDC = d; bestSFC = fi; }
      }
      const sIdxC = subRegionRef.current.get(bestSFC) ?? 0;
      const sNameC = activeSubsRef.current[sIdxC]?.name ?? subPolesRef.current[0]?.name ?? "";
      const next = selectedSubgenreRef.current === sNameC ? null : sNameC;
      selectedSubgenreRef.current = next; setSelectedSubgenre(next);
      return;
    }
    autoSelectedRef.current=false;
    selectedSubgenreRef.current=null; setSelectedSubgenre(null);
    zoomSubgenreRef.current=null; setZoomSubgenre(null);
    setSelected(prev=>prev===bestNameC?null:bestNameC);
  };

  // ── Derived display values ────────────────────────────────────────────────
  const totalTrackCount    = Object.values(worlds).reduce((s, c) => s + c, 0);
  const totalGenreCount    = Object.keys(worlds).length;
  const totalArtistCount   = new Set(allTracksData.map(t => t.artist)).size;
  const totalSubgenreCount = new Set(allTracksData.map(t => t.blueprintSubgenre).filter(Boolean)).size;
  const selectedColor   = selected ? (COLORS[selected] ?? "#ffffff") : "#ffffff";
  const [sr, sg, sb]    = selected ? hexRgb(COLORS[selected] ?? "#ffffff") : [255, 255, 255];
  // Panel only reflects explicit click selection (or hover preview).
  // zoomSubgenre is intentionally excluded — zoom never drives the panel.
  const focusedSubgenre = hoveredSubgenre ?? selectedSubgenre;
  const displayedTracks = focusedSubgenre ? tracks.filter(t => t.blueprintSubgenre === focusedSubgenre) : tracks;

  // ── Social sort tally helper ──────────────────────────────────────────────
  const tallyCount = (t: TrackItem) => t.socialUsers?.length ?? t.socialCount ?? 0;

  // ── Normalize artist name for live event lookup ───────────────────────────
  const normalizeArtist = (name: string) =>
    name.toLowerCase().replace(/\s+&\s+/g, " and ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

  // ── Venn navigation ───────────────────────────────────────────────────────
  const vennHref: string | null = selected
    ? focusedSubgenre
      ? `/midvale/friends?genre=${encodeURIComponent(selected)}&subgenre=${encodeURIComponent(focusedSubgenre)}`
      : `/midvale/friends?genre=${encodeURIComponent(selected)}`
    : null;

  const vennEnabled: boolean = (() => {
    if (!selected || friendsGenres === null) return false;
    if (!(selected in friendsGenres)) return false;
    if (!focusedSubgenre) return true;
    const subs = friendsSubgenres[selected];
    if (!subs) return false;
    return subs.includes(focusedSubgenre);
  })();

  const handleVennNavigate = () => {
    const subId   = session?.user?.id;
    const subName = session?.user?.name ?? "Surya";
    if (!subId) return;
    const profile = { userId: subId, userName: subName };
    try {
      sessionStorage.setItem("blueprint:substituteProfile", JSON.stringify(profile));
      window.dispatchEvent(new CustomEvent("blueprint:substituteChange", { detail: profile }));
    } catch {}
  };

  // ── sortedTracks ──────────────────────────────────────────────────────────
  const sortedTracks: TrackItem[] = (() => {
    if (!unheardMode && !liveMode && !socialSort) return displayedTracks;
    const withLive = displayedTracks.map(t => {
      if (!liveMode) return t;
      const ev = liveEventMap[normalizeArtist(t.artist)];
      return ev ? { ...t, liveEvent: ev } : { ...t, liveEvent: undefined };
    });
    if (!unheardMode && !liveMode && !socialSort) return withLive;
    return [...withLive].sort((a, b) => {
      // 1. Unheard first
      if (unheardMode) {
        const av = a.isUnheardForSelectedUser, bv = b.isUnheardForSelectedUser;
        if (av !== bv) {
          if (av === true) return -1; if (bv === true) return 1;
          if (av === false) return -1;
          return 1;
        }
      }
      // 2. Live events
      if (liveMode) {
        const aHas = !!a.liveEvent, bHas = !!b.liveEvent;
        if (aHas !== bHas) return aHas ? -1 : 1;
        if (aHas && bHas) return a.liveEvent!.date.localeCompare(b.liveEvent!.date);
      }
      // 3. Social
      if (socialSort) return tallyCount(b) - tallyCount(a);
      return 0;
    });
  })();

  // ── Playlist push handler ─────────────────────────────────────────────────
  // Scope key: "user:{userId}:{genre}:{subgenre|all}"
  const playlistKey: string | null = selected
    ? ["user", session?.user?.id ?? "me", selected, focusedSubgenre ?? "all"].join(":")
    : null;

  const handlePlaylistPush = async () => {
    if (!selected || playlistLoading) return;
    setPlaylistLoading(true);
    setPlaylistMsg(null);
    setPlaylistAuthError(null);
    if (sessionStatus === "unauthenticated") {
      setPlaylistLoading(false);
      setPlaylistAuthError("signin");
      return;
    }
    try {
      const body = {
        worldType: "user" as const,
        genre:     selected,
        ...(focusedSubgenre ? { subgenre: focusedSubgenre } : {}),
      };
      const res  = await fetch("/api/spotify/playlist-push", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || data.error === "Not authenticated") {
          setPlaylistAuthError("signin");
        } else if (res.status === 403 || data.error === "missing_scope") {
          setPlaylistAuthError("reconnect");
        } else {
          setPlaylistMsg(data.message ?? data.error ?? "Failed to create playlist.");
        }
        return;
      }
      window.open(data.playlistUrl, "_blank", "noopener,noreferrer");
      if (playlistKey) {
        setCreatedPlaylistKeys(prev => {
          const next = new Set(prev);
          next.add(playlistKey);
          try {
            sessionStorage.setItem("blueprint:createdPlaylists", JSON.stringify([...next]));
          } catch { /* sessionStorage unavailable */ }
          return next;
        });
      }
    } catch {
      setPlaylistMsg("Failed to create playlist.");
    } finally {
      setPlaylistLoading(false);
    }
  };

  // ── Live events toggle handler ────────────────────────────────────────────
  const handleLiveToggle = async () => {
    if (liveMode) { setLiveMode(false); return; }
    setLiveMode(true);
    const allArtists = [...new Set(displayedTracks.map(t => normalizeArtist(t.artist)))];
    const needed = allArtists.filter(a => !(a in liveEventMap));
    if (needed.length === 0) return;
    setLiveLoading(true);
    try {
      const res = await fetch(`/api/events/live?artists=${encodeURIComponent(needed.join(","))}`);
      if (!res.ok) return;
      const data: Record<string, LiveEvent | null> = await res.json();
      setLiveEventMap(prev => ({ ...prev, ...data }));
    } catch {} finally {
      setLiveLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-black text-white">

      {/* ══ SECTION 1 — The Constraint ════════════════════════════════════════ */}
      {/* Full-bleed: breaks out of the constrained rail so the canvas/sphere
          fill the full viewport width. Works because the rail is centered with
          flex justify-center, so 50% of the section = 50vw exactly.
          94vh (not 100vh) so the Page 2 headline peeks below the fold,
          signalling scroll naturally.                                           */}
      <section
        className="h-[94vh] overflow-hidden flex flex-col"
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
            style={{
              display:   "block",
              // Mobile: fixed upward offset — never changes, so the sheet
              // opening/closing cannot cause the sphere to shift position.
              // Desktop: slight upward nudge for visual centering.
              transform: isMobile ? "translateY(-15%)" : "translateY(-3%)",
              transition: "none",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={stopDrag}
            onMouseLeave={onMouseLeave}
            onClick={handleClick}
          />

          {/* Headline — desktop: top-left overlay; mobile: centered below sphere */}
          <div
            className="absolute z-10 flex flex-col pointer-events-none"
            style={isMobile ? {
              // Mobile: fixed position anchored below the sphere.
              // Does not react to sheet state — headline stays put.
              bottom:     "20%",
              left:       0,
              right:      0,
              alignItems: "center",
              textAlign:  "center",
              padding:    "0 24px",
              opacity:    textVisible ? 1 : 0,
              transition: "opacity 0.4s ease-in-out",
            } : {
              top:        "9%",
              left:       "8%",
              maxWidth:   420,
              opacity:    textVisible ? 1 : 0,
              transition: "opacity 0.4s ease-in-out",
            }}
          >
            <h1
              className="md:text-[52px] lg:text-[56px] font-semibold leading-[1.06] text-white mb-3"
              style={{ letterSpacing: "-0.02em", fontSize: isMobile ? 19 : undefined }}
            >
              {isMobile
                ? "This is what a music taste looks like"
                : "This is what a music taste looks like."}
            </h1>
            <p className="text-xs tracking-[0.22em] uppercase" style={{ color: "rgba(255,255,255,0.62)" }}>
              Click. Zoom. Discover.
            </p>
          </div>

          {/* Stats row — bottom-right, desktop only */}
          {totalTrackCount > 0 && !isMobile && (
            <div
              className="absolute bottom-[11vh] z-10 flex flex-row gap-8 pointer-events-none"
              style={{
                right:      selected ? "-3%" : "8%",
                opacity:    textVisible ? 1 : 0,
                transition: "opacity 0.4s ease-in-out, right 0.38s cubic-bezier(0.4,0,0.2,1)",
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


          {/* ── Desktop right panel (hidden on mobile) ──────────────────────── */}
          {selected && !isMobile && (
            <div
              className="absolute top-0 right-0 bottom-0 z-20 flex flex-col overflow-hidden"
              style={{
                width: 420,
                borderLeft: `1px solid rgba(${sr},${sg},${sb},0.14)`,
                background: "rgba(4,4,8,0.90)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="flex-shrink-0" style={{ height: 2, background: selectedColor, opacity: 0.85 }} />
              <div className="flex-shrink-0 px-7 pt-6 pb-4">
                {focusedSubgenre ? (
                  <>
                    <button
                      onClick={() => { setSelectedSubgenre(null); selectedSubgenreRef.current = null; setZoomSubgenre(null); zoomSubgenreRef.current = null; }}
                      className="text-xs mb-3 flex items-center gap-1.5 transition-opacity hover:opacity-100"
                      style={{ color: `rgba(${sr},${sg},${sb},0.45)` }}
                    >← {selected ? shortLabel(selected) : ""}</button>
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-2xl font-bold leading-tight truncate" style={{ color: selectedColor }}>{focusedSubgenre}</h2>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {substituteProfile && <UnheardButton active={unheardMode} onClick={() => setUnheardMode(v => !v)} color={selectedColor} />}
                        {vennHref && <VennButton href={vennHref} color={selectedColor} disabled={!vennEnabled} onBeforeNavigate={handleVennNavigate} />}
                        <BarChartButton active={socialSort} onClick={() => setSocialSort(v => !v)} color={selectedColor} />
                        <PinButton active={liveMode} loading={liveLoading} onClick={handleLiveToggle} color={selectedColor} />
                        <PlaylistButton loading={playlistLoading} success={!!(playlistKey && createdPlaylistKeys.has(playlistKey))} onClick={handlePlaylistPush} color={selectedColor} />
                        <SpotifyLogoButton track={playingTrack} />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs tracking-widest uppercase mb-2" style={{ color: `rgba(${sr},${sg},${sb},0.38)` }}>Now exploring</p>
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-2xl font-bold leading-tight truncate" style={{ color: selectedColor }}>{selected ? shortLabel(selected) : ""}</h2>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {substituteProfile && <UnheardButton active={unheardMode} onClick={() => setUnheardMode(v => !v)} color={selectedColor} />}
                        {vennHref && <VennButton href={vennHref} color={selectedColor} disabled={!vennEnabled} onBeforeNavigate={handleVennNavigate} />}
                        <BarChartButton active={socialSort} onClick={() => setSocialSort(v => !v)} color={selectedColor} />
                        <PinButton active={liveMode} loading={liveLoading} onClick={handleLiveToggle} color={selectedColor} />
                        <PlaylistButton loading={playlistLoading} success={!!(playlistKey && createdPlaylistKeys.has(playlistKey))} onClick={handlePlaylistPush} color={selectedColor} />
                        <SpotifyLogoButton track={playingTrack} />
                      </div>
                    </div>
                  </>
                )}
                <p className="text-zinc-600 text-xs mt-1.5">
                  {displayedTracks.length} tracks
                  {playlistAuthError === "signin" && (
                    <button type="button" onClick={() => signIn("spotify", { callbackUrl: window.location.href })}
                      style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#1db954",
                               background: "rgba(29,185,84,0.12)", border: "1px solid rgba(29,185,84,0.30)",
                               borderRadius: 6, padding: "2px 8px", cursor: "pointer", lineHeight: 1.5 }}>
                      Sign in with Spotify
                    </button>
                  )}
                  {playlistAuthError === "reconnect" && (
                    <button type="button" onClick={() => signIn("spotify", { callbackUrl: window.location.href })}
                      style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#fb923c",
                               background: "rgba(251,146,60,0.10)", border: "1px solid rgba(251,146,60,0.28)",
                               borderRadius: 6, padding: "2px 8px", cursor: "pointer", lineHeight: 1.5 }}>
                      Reconnect Spotify
                    </button>
                  )}
                  {!playlistAuthError && playlistMsg && (
                    <span style={{ marginLeft: 8, color: "#ef4444" }}>{playlistMsg}</span>
                  )}
                </p>
              </div>
              {subgenres.length > 0 && (
                <div className="flex-shrink-0 flex gap-1.5 px-7 pb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {subgenres.map(sub => {
                    const active = selectedSubgenre === sub.name;
                    return (
                      <button key={sub.name}
                        onClick={() => { const next = selectedSubgenre === sub.name ? null : sub.name; setSelectedSubgenre(next); selectedSubgenreRef.current = next; }}
                        className="flex-shrink-0 text-xs px-3 py-1 rounded-full whitespace-nowrap transition-all"
                        style={{ background: active ? `rgba(${sr},${sg},${sb},0.18)` : "transparent", color: active ? `rgb(${sr},${sg},${sb})` : "rgba(255,255,255,0.30)", border: `1px solid rgba(${sr},${sg},${sb},${active ? 0.45 : 0.10})` }}
                      >{sub.name}</button>
                    );
                  })}
                </div>
              )}
              <div className="flex-shrink-0 mx-7" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />
              {/* Non-premium notice */}
              {session?.user && notPremium && (
                <div className="flex-shrink-0 px-7 py-2">
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Full playback requires Spotify Premium</span>
                </div>
              )}
              <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
                {sortedTracks.length === 0 ? (
                  <p className="text-zinc-700 text-xs px-7 py-8 text-center">No tracks</p>
                ) : (
                  <div className="flex flex-col pt-1 pb-6">
                    {sortedTracks.map((t, idx) => {
                      const canPlay = !!(deezerPreviews[t.id] || t.previewUrl || (spotifyReady && !notPremium && t.spotifyId));
                      const isPending = pendingTrackId === t.id;
                      const isActive  = nowPlayingId === t.id || isPending;
                      return (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 px-7 py-2"
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.035)", cursor: "pointer" }}
                          onClick={() => playTrack(t)}
                        >
                          {/* Track number */}
                          <span
                            style={{
                              flexShrink: 0, width: 20, textAlign: "center",
                              fontSize: 11, lineHeight: 1, userSelect: "none",
                              color: isActive ? selectedColor : "rgba(255,255,255,0.22)",
                            }}
                          >
                            {idx + 1}
                          </span>
                          {/* Album art */}
                          <div className="flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 4, overflow: "hidden", background: `rgba(${sr},${sg},${sb},0.10)` }}>
                            {t.imageUrl && (
                              <img
                                src={t.imageUrl}
                                alt=""
                                width={36}
                                height={36}
                                style={{ width: 36, height: 36, objectFit: "cover", display: "block" }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                              />
                            )}
                          </div>
                          {/* Title / artist */}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span
                              className="text-sm font-medium truncate leading-snug"
                              style={{ color: isActive ? selectedColor : "#ffffff" }}
                            >{t.name}</span>
                            <span className="text-zinc-500 text-xs truncate">
                              {t.artist}
                              {isPending ? (
                                <span style={{ color: "rgba(255,255,255,0.32)", marginLeft: 4 }}>(Loading…)</span>
                              ) : !canPlay ? (
                                <span style={{ color: "rgba(255,255,255,0.22)", marginLeft: 4 }}>(No Preview)</span>
                              ) : null}
                            </span>
                          </div>
                          {/* Social badge + live pin */}
                          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                            {t.liveEvent && (
                              <a href={t.liveEvent.url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                title={`${t.liveEvent.eventName} · ${t.liveEvent.venue}, ${t.liveEvent.city} · ${t.liveEvent.date}`}
                                style={{ flexShrink: 0, color: selectedColor, display: "flex", alignItems: "center" }}>
                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                                </svg>
                              </a>
                            )}
                            {tallyCount(t) > 0 && (
                              <span onClick={e => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setPopoverData({ users: t.socialUsers ?? [], top: rect.top, right: window.innerWidth - rect.right + 28 });
                              }}>
                                <SocialBadge count={tallyCount(t)} color={`rgba(${sr},${sg},${sb},0.80)`} />
                              </span>
                            )}
                            {unheardMode && t.isUnheardForSelectedUser === true && (
                              <span aria-label="Not in selected user's library"
                                style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: selectedColor, opacity: 0.70, display: "inline-block" }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 flex justify-end px-6 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <button onClick={() => { setSelected(null); setSelectedSubgenre(null); selectedSubgenreRef.current = null; setZoomSubgenre(null); zoomSubgenreRef.current = null; autoSelectedRef.current = false; }}
                  className="text-zinc-700 hover:text-zinc-400 text-xs transition-colors">close ✕</button>
              </div>
            </div>
          )}

          {/* ── Mobile bottom sheet — preset-state only (peek / fullscreen) ──── */}
          {/* No drag handle, no free dragging. Transitions are driven entirely   */}
          {/* by the arrow toggle button and the close (✕) button.               */}
          {isMobile && viewportH > 0 && (() => {
            // Sheet fills from bottom to just below the nav (~60px reserved).
            const sheetH = Math.round(viewportH * 0.90);
            // translateY: positive = slide toward bottom (more hidden)
            const snapTY = sheetSnap === 0 ? sheetH + 20   // hidden: fully off-screen
                         : sheetSnap === 1 ? sheetH - 200   // peek: 200px visible
                         : 0;                               // fullscreen: full sheet

            return (
              <div
                // ── Swipe gesture detection ────────────────────────────────
                // touchstart / touchend on the sheet container detect swipe
                // direction. Touches that originate inside the scrollable
                // tracklist are ignored so list scrolling is unaffected.
                // No live translateY during the gesture — the sheet is
                // stationary while the user swipes; it only snaps on lift.
                onTouchStart={e => {
                  // Ignore: touch started inside the scrollable track list
                  if (mobileTracklistRef.current?.contains(e.target as Node)) return;
                  sheetSwipeStartY.current    = e.touches[0].clientY;
                  sheetSwipeStartTime.current = Date.now();
                }}
                onTouchEnd={e => {
                  if (sheetSwipeStartY.current === null) return;
                  const endY    = e.changedTouches[0].clientY;
                  const deltaY  = endY - sheetSwipeStartY.current;
                  const elapsed = Math.max(Date.now() - sheetSwipeStartTime.current, 1);
                  const vel     = deltaY / elapsed; // px / ms — positive = downward

                  sheetSwipeStartY.current = null;

                  // Swipe UP — fast flick (vel < −0.3) or slow drag > 40 px up
                  if (vel < -0.3 || deltaY < -40) {
                    setSheetSnap(2);
                    return;
                  }
                  // Swipe DOWN — snap to peek; never dismiss (state 0)
                  if (vel > 0.3 || deltaY > 40) {
                    if (sheetSnapRef.current === 2) setSheetSnap(1);
                    // Already at peek (1) — stay there, no dismiss
                    return;
                  }
                  // Sub-threshold movement — no snap change
                }}
                style={{
                  position:             "fixed",
                  bottom:               0,
                  left:                 0,
                  right:                0,
                  height:               sheetH,
                  zIndex:               100,
                  display:              "flex",
                  flexDirection:        "column",
                  overflow:             "hidden",
                  background:           "rgba(4,4,8,0.97)",
                  backdropFilter:       "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  borderTop:            sheetSnap > 0
                    ? `1px solid rgba(${sr},${sg},${sb},0.18)`
                    : "1px solid rgba(255,255,255,0.06)",
                  borderTopLeftRadius:  18,
                  borderTopRightRadius: 18,
                  transform:            `translateY(${snapTY}px)`,
                  transition:           "transform 0.36s cubic-bezier(0.32,0.72,0,1)",
                  // Pass touches through to sphere when fully hidden
                  pointerEvents: sheetSnap === 0 ? "none" : "auto",
                }}
              >
                {/* Color accent line — always present at top of sheet */}
                <div style={{ height: 2, background: selectedColor ?? "rgba(255,255,255,0.12)", opacity: 0.85, flexShrink: 0 }} />

                {/* ── Sheet header — left title / right button cluster ─────────── */}
                <div style={{ flexShrink: 0, padding: "12px 16px 10px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {/* LEFT — genre title + track count */}
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                    <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: selectedColor, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {focusedSubgenre ?? (selected ? shortLabel(selected) : "")}
                    </h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>{displayedTracks.length} tracks</span>
                      {playlistAuthError === "signin" && (
                        <button type="button" onClick={() => signIn("spotify", { callbackUrl: window.location.href })}
                          style={{ fontSize: 11, fontWeight: 600, color: "#1db954", background: "rgba(29,185,84,0.12)", border: "1px solid rgba(29,185,84,0.30)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", lineHeight: 1.5 }}>
                          Sign in with Spotify
                        </button>
                      )}
                      {playlistAuthError === "reconnect" && (
                        <button type="button" onClick={() => signIn("spotify", { callbackUrl: window.location.href })}
                          style={{ fontSize: 11, fontWeight: 600, color: "#fb923c", background: "rgba(251,146,60,0.10)", border: "1px solid rgba(251,146,60,0.28)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", lineHeight: 1.5 }}>
                          Reconnect Spotify
                        </button>
                      )}
                      {!playlistAuthError && playlistMsg && (
                        <span style={{ fontSize: 12, color: "#ef4444" }}>{playlistMsg}</span>
                      )}
                    </div>
                  </div>

                  {/* RIGHT — two-row button cluster */}
                  {(() => {
                    const W: React.CSSProperties = { flexShrink: 0, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "rgba(255,255,255,0.07)" };
                    return (
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        {/* Row 1: Playlist · Spotify · Collapse */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={W}><PlaylistButton loading={playlistLoading} success={!!(playlistKey && createdPlaylistKeys.has(playlistKey))} onClick={handlePlaylistPush} color={selectedColor} /></div>
                          <div style={W}><SpotifyLogoButton track={playingTrack} size={20} /></div>
                          <button onClick={() => setSheetSnap(sheetSnap === 1 ? 2 : 1)}
                            aria-label={sheetSnap === 1 ? "Expand to fullscreen" : "Collapse to preview"}
                            style={{ flexShrink: 0, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.60)", fontSize: 16, lineHeight: 1 }}>
                            {sheetSnap === 1 ? "↑" : "↓"}
                          </button>
                        </div>
                        {/* Row 2: [Unheard] · [Venn] · BarChart · Pin */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {substituteProfile && <div style={W}><UnheardButton active={unheardMode} onClick={() => setUnheardMode(v => !v)} color={selectedColor} /></div>}
                          {vennHref && <div style={W}><VennButton href={vennHref} color={selectedColor} disabled={!vennEnabled} onBeforeNavigate={handleVennNavigate} /></div>}
                          <div style={W}><BarChartButton active={socialSort} onClick={() => setSocialSort(v => !v)} color={selectedColor} /></div>
                          <div style={W}><PinButton active={liveMode} loading={liveLoading} onClick={handleLiveToggle} color={selectedColor} /></div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ── Track list — scrollable, shared between peek + fullscreen ─ */}
                <div
                  ref={mobileTracklistRef}
                  className="overflow-y-auto flex-1"
                  style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                >
                  {sortedTracks.length === 0 ? (
                    <p className="text-zinc-700 text-xs px-6 py-8 text-center">No tracks</p>
                  ) : (
                    <div className="flex flex-col pt-1 pb-8">
                      {sortedTracks.map((t, idx) => {
                        const canPlay = !!(deezerPreviews[t.id] || t.previewUrl || (spotifyReady && !notPremium && t.spotifyId));
                        const isPending = pendingTrackId === t.id;
                        const isActive  = nowPlayingId === t.id || isPending;
                        return (
                          <div
                            key={t.id}
                            className="flex items-center gap-3 px-5 py-2.5"
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                            onClick={() => playTrack(t)}
                          >
                            {/* Track number */}
                            <span
                              style={{
                                flexShrink: 0, width: 20, textAlign: "center",
                                fontSize: 11, lineHeight: 1, userSelect: "none",
                                color: isActive ? selectedColor : "rgba(255,255,255,0.22)",
                              }}
                            >
                              {idx + 1}
                            </span>
                            {/* Album art */}
                            <div className="flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 4, overflow: "hidden", background: `rgba(${sr},${sg},${sb},0.10)` }}>
                              {t.imageUrl && (
                                <img
                                  src={t.imageUrl}
                                  alt=""
                                  width={36}
                                  height={36}
                                  style={{ width: 36, height: 36, objectFit: "cover", display: "block" }}
                                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                />
                              )}
                            </div>
                            {/* Title / artist */}
                            <div className="flex flex-col min-w-0 flex-1">
                              <span
                                className="text-sm font-medium truncate leading-snug"
                                style={{ color: isActive ? selectedColor : "#ffffff" }}
                              >{t.name}</span>
                              <span className="text-zinc-500 text-xs truncate">
                                {t.artist}
                                {isPending ? (
                                  <span style={{ color: "rgba(255,255,255,0.32)", marginLeft: 4 }}>(Loading…)</span>
                                ) : !canPlay ? (
                                  <span style={{ color: "rgba(255,255,255,0.22)", marginLeft: 4 }}>(No Preview)</span>
                                ) : null}
                              </span>
                            </div>
                            {/* Social badge + live pin */}
                            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                              {t.liveEvent && (
                                <a href={t.liveEvent.url} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  title={`${t.liveEvent.eventName} · ${t.liveEvent.venue}, ${t.liveEvent.city} · ${t.liveEvent.date}`}
                                  style={{ flexShrink: 0, color: selectedColor, display: "flex", alignItems: "center" }}>
                                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
                                  </svg>
                                </a>
                              )}
                              {tallyCount(t) > 0 && (
                                <span onClick={e => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setPopoverData({ users: t.socialUsers ?? [], top: rect.top, right: window.innerWidth - rect.right + 28 });
                                }}>
                                  <SocialBadge count={tallyCount(t)} color={`rgba(${sr},${sg},${sb},0.80)`} />
                                </span>
                              )}
                              {unheardMode && t.isUnheardForSelectedUser === true && (
                                <span aria-label="Not in selected user's library"
                                  style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: selectedColor, opacity: 0.70, display: "inline-block" }} />
                              )}
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

          {/* ── Mobile zoom pill ──────────────────────────────────────────── */}
          {/* Fixed-position so it stays viewport-anchored above the sheet.   */}
          {/* Stage 1 (genre): vertical pill with + and −.                    */}
          {/* Stage 2 (subgenre): collapses to a circle with only −.          */}
          {isMobile && selected !== null && sheetSnap !== 2 && (
            <div
              style={{
                position:             "fixed",
                right:                12,
                bottom:               sheetSnap === 1 ? 216 : 84,
                zIndex:               120,
                display:              "flex",
                flexDirection:        "column",
                alignItems:           "center",
                // Circle at stage 2, pill at stage 1
                borderRadius:         zoomAbove2 ? "50%" : 24,
                width:                zoomAbove2 ? 44 : undefined,
                height:               zoomAbove2 ? 44 : undefined,
                overflow:             "hidden",
                background:           "rgba(0,0,0,0.80)",
                border:               "1px solid rgba(255,255,255,0.10)",
                backdropFilter:       "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                transition:           "bottom 0.3s ease, border-radius 0.2s ease, width 0.2s ease, height 0.2s ease",
                pointerEvents:        "auto",
              }}
            >
              {/* + button — only shown at stage 1 */}
              {!zoomAbove2 && (
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); handleZoomPlus(); }}
                  style={{
                    width:           44,
                    height:          46,
                    background:      "none",
                    border:          "none",
                    color:           "rgba(255,255,255,0.88)",
                    fontSize:        22,
                    fontWeight:      300,
                    cursor:          "pointer",
                    display:         "flex",
                    alignItems:      "center",
                    justifyContent:  "center",
                    lineHeight:      1,
                    userSelect:      "none",
                  }}
                  aria-label="Zoom in"
                >+</button>
              )}

              {/* Divider — only between + and − at stage 1 */}
              {!zoomAbove2 && (
                <div style={{ width: 24, height: 1, background: "rgba(255,255,255,0.10)" }} />
              )}

              {/* − button — always shown */}
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); handleZoomMinus(); }}
                style={{
                  width:           44,
                  height:          zoomAbove2 ? 44 : 46,
                  background:      "none",
                  border:          "none",
                  color:           "rgba(255,255,255,0.88)",
                  fontSize:        22,
                  fontWeight:      300,
                  cursor:          "pointer",
                  display:         "flex",
                  alignItems:      "center",
                  justifyContent:  "center",
                  lineHeight:      1,
                  userSelect:      "none",
                }}
                aria-label="Zoom out"
              >−</button>
            </div>
          )}

        </div>

        {/* Social tally popover */}
        {popoverData && (
          <>
            <div onClick={() => setPopoverData(null)} style={{ position: "fixed", inset: 0, zIndex: 300 }} />
            <div style={{ position: "fixed", top: popoverData.top, right: popoverData.right, zIndex: 301,
                          background: "rgba(12,12,18,0.97)", border: "1px solid rgba(255,255,255,0.10)",
                          borderRadius: 10, padding: "10px 14px", minWidth: 140, maxWidth: 220,
                          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.55)" }}>
              <p style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)", marginBottom: 8, lineHeight: 1 }}>Also in Friends</p>
              {popoverData.users.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>No one else</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {popoverData.users.map(u => (
                    <a key={u.id} href={`/midvale/${u.id}`} onClick={() => setPopoverData(null)}
                      style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.88)", textDecoration: "none", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {u.name ?? "Unknown"}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </section>

      {/* ══ SECTION 2 — The Problem ═══════════════════════════════════════════ */}
      <section className="min-h-screen bg-black flex flex-col md:flex-row overflow-hidden"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>

        {/* ── MOBILE ONLY: headline comes before the carousel ────────────────── */}
        {/* Rendered only on mobile (md:hidden). On desktop the heading lives      */}
        {/* inside the LEFT column below, which is the single source of truth.     */}
        <div
          className="md:hidden order-1 px-6 pt-[8vh] pb-4"
          style={{ width: "100%" }}
        >
          <h2
            className="text-[28px] font-semibold leading-[1.05] text-white"
            style={{ letterSpacing: "-0.02em", maxWidth: 600 }}
          >
            The internet runs on one bad model.
          </h2>
        </div>

        {/* ── LEFT: problem copy ──────────────────────────────────────────────── */}
        {/* Mobile: order-3 — appears below the carousel. Desktop: order-1 (left). */}
        <div
          className="flex flex-col order-2 md:order-1 px-6 md:px-12 pt-0 md:pt-[10vh] pb-4 md:pb-[8vh] overflow-hidden"
          style={{ width: isMobile ? "100%" : "54%", borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.05)" }}
        >

          {/* ── Group 1: Headline — desktop only (mobile version is above) ──────── */}
          <div className="hidden md:block" style={{ maxWidth: 600 }}>
            <h2
              className="md:text-[60px] lg:text-[64px] font-semibold leading-[1.05] text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              The internet runs on one bad model.
            </h2>
          </div>

          {/* ── Group 2: SEARCH / FEED — primary supporting argument ────────────
              Increased to 19/21px (+20%) to feel like thesis-level copy,
              not secondary footnotes.                                       */}
          <div className="mt-[3vh] md:mt-[6vh]" style={{ maxWidth: 600 }}>
            <div className="flex flex-col gap-2">
              {/* CSS grid: col1 = fixed-width label, col2 = arrow, col3 = description.
                  Guarantees → sits on exactly the same vertical axis for both rows. */}
              <p
                className="text-[15px] leading-[1.65] md:text-[22px] md:leading-[1.45] font-normal"
                style={{ display: "grid", gridTemplateColumns: "5em 2em 1fr", alignItems: "baseline" }}
              >
                <strong style={{ color: "rgba(255,255,255,0.97)", letterSpacing: "0.08em", fontFamily: "ui-monospace, monospace" }}>SEARCH</strong>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>→</span>
                <span style={{ color: "rgba(255,255,255,0.75)" }}>shows what you know to look for</span>
              </p>
              <p
                className="text-[15px] leading-[1.65] md:text-[22px] md:leading-[1.45] font-normal"
                style={{ display: "grid", gridTemplateColumns: "5em 2em 1fr", alignItems: "baseline" }}
              >
                <strong style={{ color: "rgba(255,255,255,0.97)", letterSpacing: "0.08em", fontFamily: "ui-monospace, monospace" }}>FEED</strong>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>→</span>
                <span style={{ color: "rgba(255,255,255,0.75)" }}>shows things similar to what you&apos;ve engaged with &amp; what companies pay to promote</span>
              </p>
            </div>
          </div>

          {/* ── Bridge: structural consequence ───────────────────────────────── */}
          {/* hidden on mobile — rendered in the mobile-only sibling below        */}
          <div className="hidden md:block mt-[6vh]" style={{ maxWidth: 600 }}>
            <p
              className="text-[14px] leading-relaxed md:text-[19px] font-normal"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              This structurally limits everything you see.
            </p>
          </div>

          {/* ── Group 3: SO YOU NEVER SEE + rotating line ────────────────────── */}
          {/* hidden on mobile — rendered in the mobile-only sibling below        */}
          <div className="hidden md:block mt-[4vh]" style={{ maxWidth: 600, minHeight: 130 }}>
            <p
              className="text-[15px] font-semibold uppercase"
              style={{ letterSpacing: "0.22em", color: "rgba(255,255,255,1.0)" }}
            >
              So you never see
            </p>
            <p
              key={discoveryIdx}
              className="text-[17px] md:text-[25px] font-semibold leading-snug mt-4"
              style={{
                color: COMPANIES[discoveryIdx].accent,
                animation: "fadeSlideUp 0.45s ease-out",
                letterSpacing: "-0.01em",
              }}
            >
              {DISCOVERY[discoveryIdx].line1}<br />
              {DISCOVERY[discoveryIdx].line2}
            </p>
          </div>

          {/* ── Group 4: Final tagline ────────────────────────────────────────── */}
          {/* hidden on mobile — rendered in the mobile-only sibling below        */}
          <div className="hidden md:block mt-8" style={{ maxWidth: 600 }}>
            <p
              className="text-[14px] leading-relaxed md:text-[19px] font-normal"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              We&apos;re living in algorithmic echo chambers.<br />
              Do you feel it?
            </p>
          </div>

        </div>

        {/* ── RIGHT: rotating company showcase ─────────────────────────────── */}
        {/* Mobile: order-2 — sits between the headline (order-1) and copy (order-3). */}
        <div className="flex flex-col order-3 md:order-2 pt-4 pb-2 md:py-8 px-6 md:px-7 overflow-hidden"
          style={{ width: isMobile ? "100%" : "46%", minHeight: isMobile ? "52vh" : undefined }}>

          {/* "Different content. Same model." — desktop only; redundant on mobile  */}
          {/* since the headline is directly above and the carousel follows right after. */}
          <p className="hidden md:block text-[11px] tracking-widest uppercase mb-4 select-none flex-shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>
            Different content.<br />Same model.
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

        {/* ── MOBILE ONLY: lower copy — appears after carousel (order-4) ─────── */}
        {/* Bridge, "So you never see", and final tagline are hidden inside the    */}
        {/* desktop LEFT column above. This sibling renders them only on mobile,   */}
        {/* after the carousel, completing the narrative sequence.                 */}
        <div className="md:hidden order-4 px-6 pt-[4vh] pb-[8vh]" style={{ width: "100%" }}>

          {/* Bridge */}
          <div style={{ maxWidth: 600 }}>
            <p
              className="text-[14px] leading-relaxed font-normal"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              This structurally limits everything you see.
            </p>
          </div>

          {/* So you never see */}
          <div className="mt-[4vh]" style={{ maxWidth: 600, minHeight: 80 }}>
            <p
              className="text-[15px] font-semibold uppercase"
              style={{ letterSpacing: "0.22em", color: "rgba(255,255,255,1.0)" }}
            >
              So you never see
            </p>
            {/* Fixed-height wrapper — reserves space for 3 visual lines of 17px/leading-snug
                text (3 × 23.4 px ≈ 72 px) so layout never shifts as the carousel rotates. */}
            <div className="mt-4" style={{ minHeight: 72 }}>
              <p
                key={`mob-${discoveryIdx}`}
                className="text-[17px] font-semibold leading-snug"
                style={{
                  color: COMPANIES[discoveryIdx].accent,
                  animation: "fadeSlideUp 0.45s ease-out",
                  letterSpacing: "-0.01em",
                }}
              >
                {DISCOVERY[discoveryIdx].line1}<br />
                {DISCOVERY[discoveryIdx].line2}
              </p>
            </div>
          </div>

          {/* Final tagline */}
          <div className="mt-8" style={{ maxWidth: 600 }}>
            <p
              className="text-[14px] leading-relaxed font-normal"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              We&apos;re living in algorithmic echo chambers.<br />
              Do you feel it?
            </p>
          </div>

        </div>

      </section>

      {/* ══ SECTION 3 — Friends ═══════════════════════════════════════════════ */}
      <section className="min-h-[90vh] bg-black flex flex-col md:flex-row md:items-center overflow-hidden"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>

        {/* ── MOBILE ONLY: headline above the sphere cluster ──────────────────── */}
        <div className="md:hidden order-1 px-6 pt-8 pb-2" style={{ width: "100%" }}>
          <h2 className="text-[24px] font-semibold leading-[1.07] text-white" style={{ letterSpacing: "-0.02em" }}>
            Turn your network into your algorithm.
          </h2>
        </div>

        {/* ── LEFT / TOP: spheres ─────────────────────────────────────────────── */}
        {/* On mobile: order-2, full-width, stacked below the headline.            */}
        {/* On desktop: left column (54%).                                         */}
        <div className="relative flex flex-col items-center justify-center py-8 flex-shrink-0 order-2"
          style={{ width: isMobile ? "100%" : "54%", alignSelf: isMobile ? undefined : "stretch",
                   paddingLeft: isMobile ? 16 : 24, paddingRight: isMobile ? 16 : 56,
                   // Mobile: tighten gap below cluster — override py-8 bottom (32px→12px)
                   paddingBottom: isMobile ? 12 : undefined }}>

          {/* Domain label */}
          {/* Mobile: left:24 matches px-6 (24px) of the headline above the sphere cluster,
              aligning the first character with the "T" in "Turn your network…".
              Font reduced from 17→13px (~24% smaller) on mobile only.              */}
          <div className="absolute select-none" style={{ top: isMobile ? 20 : 40, left: isMobile ? 24 : 40 }}>
            <span
              key={page3LabelAnimKey}
              style={{
                display: "block",
                fontSize: isMobile ? 13 : 17, fontWeight: 600, letterSpacing: "0.18em",
                textTransform: "uppercase", whiteSpace: "nowrap",
                ...(page3LabelAnimKey > 0 && prevPage3LabelIdx !== null ? {
                  background: `linear-gradient(to right, ${PAGE3_COLORS[carouselIdx]} 50%, ${PAGE3_COLORS[prevPage3LabelIdx]} 50%)`,
                  backgroundSize: "200% 100%",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  animation: "labelColorWipe 260ms ease-out forwards",
                } : {
                  color: PAGE3_COLORS[carouselIdx],
                }),
              }}
            >
              {PAGE3_DOMAIN_LABELS[carouselIdx]}
            </span>
          </div>

          {/* Circular arrangement — responsive sizes */}
          {(() => {
            const friends = [
              { name: "Chris",   seed:  1 },
              { name: "Adam",    seed:  5 },
              { name: "Ethan",   seed:  9 },
              { name: "Dole",    seed:  3 },
              { name: "UCLA",    seed:  7 },
              { name: "Atlanta", seed: 11 },
            ];
            // Scale the whole cluster down on mobile so it fits without overflow
            const SIZE          = isMobile ? 320 : 660;
            const CX            = SIZE / 2;
            const CY            = SIZE / 2;
            const ORBIT         = isMobile ? 108 : 240;
            const CENTER_R      = isMobile ? 110 : 240;
            const FRIEND_R      = isMobile ?  68 : 152;
            const N             = friends.length;
            const STAGGER_RANGE = 200;
            const minX          = CX - ORBIT;
            const maxX          = CX + ORBIT;
            const xToDelay      = (x: number) =>
              Math.round(((x - minX) / (maxX - minX)) * STAGGER_RANGE);
            return (
              <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0,
                            transform: isMobile ? undefined : "translateX(-16px)" }}>

                <div style={{
                  position: "absolute", left: CX, top: CY,
                  transform: "translate(-50%, -50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}>
                  <MiniSphere size={CENTER_R} seed={99}
                    platformColor={PAGE3_COLORS[carouselIdx]}
                    transitionDelay={xToDelay(CX)} />
                  <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)" }}>
                    Friends
                  </span>
                </div>

                {friends.map((f, i) => {
                  const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
                  const x = CX + ORBIT * Math.cos(angle);
                  const y = CY + ORBIT * Math.sin(angle);
                  return (
                    <div key={f.name} style={{
                      position: "absolute", left: x, top: y,
                      transform: "translate(-50%, -50%)",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    }}>
                      <MiniSphere size={FRIEND_R} seed={f.seed}
                        platformColor={PAGE3_COLORS[carouselIdx]}
                        transitionDelay={xToDelay(x)} />
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── RIGHT / BOTTOM: copy ────────────────────────────────────────────── */}
        {/* Mobile: order-3 — appears below the sphere cluster.                   */}
        {/* Desktop: right column (46%).                                           */}
        <div className="flex flex-col justify-center overflow-hidden order-3"
          style={{
            width:       isMobile ? "100%" : "46%",
            borderLeft:  isMobile ? "none" : "1px solid rgba(255,255,255,0.05)",
            alignSelf:   isMobile ? undefined : "stretch",
            padding:     isMobile ? "0 24px 56px" : "48px 40px 48px 64px",
          }}>

          {/* maxWidth 620 — wider than before so headline fits on one line */}
          <div style={{ maxWidth: 620 }}>

            {/* Headline — desktop only; mobile version lives in the sibling above */}
            <div className="hidden md:block">
              <h2 className="md:text-[42px] font-semibold leading-[1.07] text-white" style={{ letterSpacing: "-0.02em" }}>
                Turn your network into your algorithm.
              </h2>
            </div>

            {/* Sub-head */}
            <p className="text-[15px] leading-[1.65] md:text-[22px] md:leading-[1.45] font-normal"
              style={{ color: "rgba(255,255,255,0.75)", marginTop: isMobile ? 20 : 40 }}>
              The people you trust surface what you would never think to search for.
            </p>

            {/* Body line 1 */}
            <p className="text-[15px] leading-[1.65] md:text-[22px] md:leading-[1.45] font-normal"
              style={{ color: "rgba(255,255,255,0.75)", marginTop: isMobile ? 14 : 32 }}>
              Not what you already engage with.<br />
              Not what companies pay to promote.
            </p>

            {/* Body line 2 */}
            <p className="text-[15px] leading-[1.65] md:text-[22px] md:leading-[1.45] font-normal"
              style={{ color: "rgba(255,255,255,0.75)", marginTop: isMobile ? 14 : 24 }}>
              See more of what&apos;s out there.<br />
              Get closer in the process.
            </p>

            {/* Final lines — payoff */}
            <p className="text-[18px] md:text-[28px] font-semibold leading-[1.15] text-white"
              style={{ letterSpacing: "-0.01em", marginTop: isMobile ? 24 : 48 }}>
              A wider, reliable view of the internet.
            </p>

          </div>
        </div>

      </section>

      {/* ══ SECTION 4 — Places ═══════════════════════════════════════════════ */}
      {/* Mobile: flex-col — map appears first (order-1), text below (order-2). */}
      <section className="min-h-[90vh] bg-black flex flex-col md:flex-row overflow-hidden"
        style={{
          borderTop:  "1px solid rgba(255,255,255,0.04)",
          // Mobile: break out of the px-6 (24px) padded container so the map
          // is full-bleed. Same technique as Section 1. The copy block retains
          // its own padding: "40px 24px 56px" so text stays properly inset.
          width:      isMobile ? "100vw" : undefined,
          marginLeft: isMobile ? "calc(50% - 50vw)" : undefined,
        }}>

        {/* ── LEFT / BOTTOM: copy ─────────────────────────────────────────────── */}
        <div className="flex flex-col justify-center order-2 md:order-1 overflow-hidden"
          style={{
            width:        isMobile ? "100%" : "54%",
            borderRight:  isMobile ? "none" : "1px solid rgba(255,255,255,0.05)",
            padding:      isMobile ? "40px 24px 56px" : "48px",
          }}>

          <div style={{ maxWidth: isMobile ? "100%" : 540 }}>

            {/* Headline */}
            <h2 className="text-[24px] md:text-[42px] font-semibold leading-[1.07] text-white" style={{ letterSpacing: "-0.02em" }}>
              Every place has a taste.
            </h2>

            {/* Body line 1 */}
            <p className="text-[15px] leading-[1.65] md:text-[22px] md:leading-[1.45] font-normal"
              style={{ color: "rgba(255,255,255,0.75)", marginTop: isMobile ? 16 : 32 }}>
              Neighborhoods. Cities. Countries.<br />
              Each one surfaces something different.
            </p>

            {/* Body line 2 */}
            <p className="text-[15px] leading-[1.65] md:text-[22px] md:leading-[1.45] font-normal"
              style={{ color: "rgba(255,255,255,0.75)", marginTop: isMobile ? 12 : 24 }}>
              Each one sees what you don&apos;t.
            </p>

            {/* Body line 3 */}
            <p className="text-[15px] leading-[1.65] md:text-[22px] md:leading-[1.45] font-normal"
              style={{ color: "rgba(255,255,255,0.75)", marginTop: isMobile ? 12 : 24 }}>
              Step into them.
            </p>

            {/* Body line 4 */}
            <p className="text-[15px] leading-[1.65] md:text-[22px] md:leading-[1.45] font-normal"
              style={{ color: "rgba(255,255,255,0.75)", marginTop: isMobile ? 12 : 24 }}>
              You&apos;re no longer limited by what you know<br />
              or what you&apos;re shown.
            </p>

            {/* Final CTA — larger, semibold, full white */}
            <p className="text-[18px] md:text-[28px] font-semibold leading-[1.15] text-white"
              style={{ letterSpacing: "-0.01em", marginTop: isMobile ? 24 : 48 }}>
              Leave the limits of your algorithm behind.
            </p>

          </div>
        </div>

        {/* ── RIGHT / TOP: animated map visual ────────────────────────────────── */}
        {/* On mobile: full-width, 45vh tall, sits above the copy text.           */}
        <div className="relative overflow-hidden order-1 md:order-2"
          style={{
            width:      isMobile ? "100%" : "46%",
            height:     isMobile ? "45vh" : undefined,
            alignSelf:  isMobile ? undefined : "stretch",
          }}>
          {/* Rotating domain label — same gradient-wipe animation as the sphere section */}
          <div className="absolute top-8 left-7 select-none pointer-events-none" style={{ zIndex: 10 }}>
            <span
              key={page3LabelAnimKey}
              style={{
                display: "block",
                fontSize: 17, fontWeight: 600, letterSpacing: "0.18em",
                textTransform: "uppercase", whiteSpace: "nowrap",
                ...(page3LabelAnimKey > 0 && prevPage3LabelIdx !== null ? {
                  background: `linear-gradient(to right, ${PAGE3_COLORS[carouselIdx]} 50%, ${PAGE3_COLORS[prevPage3LabelIdx]} 50%)`,
                  backgroundSize: "200% 100%",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  animation: "labelColorWipe 260ms ease-out forwards",
                } : {
                  color: PAGE3_COLORS[carouselIdx],
                }),
              }}
            >
              {PAGE3_DOMAIN_LABELS[carouselIdx]}
            </span>
          </div>
          <MapVisual platformColor={PAGE3_COLORS[carouselIdx]} />
        </div>

      </section>

      <Footer />

    </div>
  );
}

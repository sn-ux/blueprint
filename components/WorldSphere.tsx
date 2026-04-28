"use client";

import { useEffect, useRef, useState } from "react";

// ── Short display labels for sphere (long names → readable at small sizes) ────

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

const shortLabel = (genre: string) => GENRE_SHORT[genre] ?? genre;

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
  imageUrl?: string | null;
  previewUrl?: string | null;
  spotifyId?: string | null;
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
    (verts[a][0] + verts[b][0] + verts[c][0]) / 3,
    (verts[a][1] + verts[b][1] + verts[c][1]) / 3,
    (verts[a][2] + verts[b][2] + verts[c][2]) / 3,
  ]);
}

function assignVoronoi(cents: V3[], poles: V3[], bonuses: number[]): number[] {
  return cents.map(c => {
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < poles.length; i++) {
      const cosA = Math.min(1, Math.max(-1,
        c[0] * poles[i][0] + c[1] * poles[i][1] + c[2] * poles[i][2]
      ));
      const score = Math.acos(cosA) - bonuses[i];
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  });
}

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

function removeIslands(region: number[], adj: number[][], numGenres: number): number[] {
  const result = [...region];

  for (let g = 0; g < numGenres; g++) {
    const members: number[] = [];
    for (let fi = 0; fi < result.length; fi++) {
      if (result[fi] === g) members.push(fi);
    }
    if (members.length === 0) continue;

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

    if (components.length <= 1) continue;

    const largest = components.reduce((a, b) => (b.length > a.length ? b : a));

    for (const comp of components) {
      if (comp === largest) continue;
      for (const fi of comp) {
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

function hexRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

// ── SpotifyLogoButton ─────────────────────────────────────────────────────────
// Dims when no track is active; lights up green and becomes clickable when
// a track is playing. Clicking opens that track on Spotify in a new tab.

function SpotifyLogoButton({
  track,
  size = 22,
}: {
  track: { name: string; spotifyId?: string | null } | null;
  size?: number;
}) {
  const active  = !!track;
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
        flexShrink: 0,
        background: "none",
        border:     "none",
        padding:    0,
        cursor:     canOpen ? "pointer" : "default",
        color:      active ? "#1DB954" : "rgba(255,255,255,0.20)",
        transition: "color 0.25s ease",
        display:    "flex",
        alignItems: "center",
        lineHeight: 1,
      }}
    >
      {/* Official Spotify sound-wave mark */}
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorldSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [worlds,     setWorlds]     = useState<Record<string, number>>({});
  const [error,      setError]      = useState<string | null>(null);

  // ── Genre selection + track list ──────────────────────────────────────────
  const [selected,          setSelected]          = useState<string | null>(null);
  const [tracks,            setTracks]            = useState<TrackItem[]>([]);
  const [tracksLoading,     setTracksLoading]     = useState(false);
  const [subgenres,         setSubgenres]         = useState<SubgenreItem[]>([]);
  const [selectedSubgenre,  setSelectedSubgenre]  = useState<string | null>(null);
  const selectedSubgenreRef = useRef<string | null>(null);
  const [zoomSubgenre,      setZoomSubgenre]      = useState<string | null>(null);
  const zoomSubgenreRef     = useRef<string | null>(null);
  const [hoveredSubgenre,   setHoveredSubgenre]   = useState<string | null>(null);
  const hoveredSubgRef      = useRef<string | null>(null);

  // ── Audio playback ────────────────────────────────────────────────────────
  const [nowPlayingId,   setNowPlayingId]   = useState<string | null>(null);
  const [audioPlaying,   setAudioPlaying]   = useState(false);
  const audioRef                            = useRef<HTMLAudioElement | null>(null);
  const nowPlayingIdRef                     = useRef<string | null>(null);
  nowPlayingIdRef.current                   = nowPlayingId;
  const [playingTrack,   setPlayingTrack]   = useState<{
    id: string; name: string; artist: string; spotifyId?: string | null;
  } | null>(null);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const requestedTrackRef                   = useRef<string | null>(null);
  requestedTrackRef.current                 = pendingTrackId;
  const pendingAudioRef                     = useRef<HTMLAudioElement | null>(null);

  // ── Deezer preview cache ──────────────────────────────────────────────────
  const [deezerPreviews,  setDeezerPreviews]  = useState<Record<string, string>>({});
  const deezerPreviewsRef                     = useRef<Record<string, string>>({});

  // ── Interaction refs ──────────────────────────────────────────────────────
  // Two zoom refs: target is updated immediately on wheel; visual lerps toward it.
  const zoomRef       = useRef(1);         // visual zoom — lerped each RAF frame
  const zoomTargetRef = useRef(1);         // intended zoom — updated by wheel/click
  const subRegionRef  = useRef<Map<number, number>>(new Map());
  const activeSubsRef = useRef<SubgenreItem[]>([]);
  const subPolesRef   = useRef<{ name: string; pole: V3 }[]>([]);
  const rotRef        = useRef({ x: 0.3, y: 0 });
  const dragRef       = useRef({ active: false, lx: 0, ly: 0, moved: false });
  const rafRef        = useRef<number>(0);

  const labelHitsRef = useRef<
    { name: string; subgenre?: string; x1: number; y1: number; x2: number; y2: number }[]
  >([]);
  const regionPolesRef  = useRef<{ name: string; pole: V3 }[]>([]);
  const hoveredRef      = useRef<{ genre: string; subgenre?: string } | null>(null);
  const autoSelectedRef = useRef(false);
  const selectedRef     = useRef<string | null>(null);
  selectedRef.current   = selected;

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

  // ── Fetch tracks + subgenres + Deezer previews when genre selected ────────

  useEffect(() => {
    hoveredSubgRef.current = null;
    setHoveredSubgenre(null);

    if (!selected) {
      setTracks([]);
      setSubgenres([]);
      setSelectedSubgenre(null);
      selectedSubgenreRef.current = null;
      zoomSubgenreRef.current     = null;
      setZoomSubgenre(null);
      deezerPreviewsRef.current   = {};
      setDeezerPreviews({});
      return;
    }
    setSelectedSubgenre(null);
    selectedSubgenreRef.current = null;
    zoomSubgenreRef.current     = null;
    setZoomSubgenre(null);
    deezerPreviewsRef.current   = {};
    setDeezerPreviews({});

    const encoded = encodeURIComponent(selected);

    setTracksLoading(true);
    fetch(`/api/world/${encoded}`)
      .then(r => r.json())
      .then(d => {
        const loadedTracks: TrackItem[] = d.tracks ?? [];
        setTracks(loadedTracks);

        // Fetch Deezer preview URLs in batches of 5 (server-side proxy avoids CORS).
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

        const runBatches = async (ts: TrackItem[]) => {
          for (let i = 0; i < ts.length; i += 5) {
            await Promise.all(ts.slice(i, i + 5).map(fetchPreview));
          }
        };
        runBatches(loadedTracks);
      })
      .catch(() => setTracks([]))
      .finally(() => setTracksLoading(false));

    fetch(`/api/world/${encoded}/subgenres`)
      .then(r => r.json())
      .then(d => setSubgenres(d.subgenres ?? []))
      .catch(() => setSubgenres([]));
  }, [selected]);

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

  // ── playTrack ─────────────────────────────────────────────────────────────
  // Must stay synchronous — audio.play() must be called in the same call-stack
  // as the user gesture to satisfy Chrome/Safari autoplay policies.

  const playTrack = (t: TrackItem) => {
    const previewUrl = deezerPreviewsRef.current[t.id] ?? t.previewUrl ?? null;

    if (!previewUrl) {
      // Same track → deselect
      if (nowPlayingIdRef.current === t.id) {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        setNowPlayingId(null); setAudioPlaying(false); setPlayingTrack(null);
        return;
      }
      // Same pending → already in-flight
      if (requestedTrackRef.current === t.id) return;

      // No URL yet — record intent + on-demand fetch
      requestedTrackRef.current = t.id;
      setPendingTrackId(t.id);
      if (pendingAudioRef.current) { pendingAudioRef.current.src = ""; pendingAudioRef.current = null; }
      const pendingAudio = new Audio();
      pendingAudio.volume = 0.8;
      pendingAudioRef.current = pendingAudio;

      fetch(`/api/preview?track=${encodeURIComponent(t.name)}&artist=${encodeURIComponent(t.artist)}`)
        .then(r => r.json())
        .then((d: { previewUrl: string | null }) => {
          if (requestedTrackRef.current !== t.id) return; // stale
          requestedTrackRef.current = null;
          setPendingTrackId(null);
          if (!d.previewUrl) return;
          deezerPreviewsRef.current[t.id] = d.previewUrl;
          setDeezerPreviews(prev => ({ ...prev, [t.id]: d.previewUrl! }));
          const audio = pendingAudioRef.current;
          if (!audio) return;
          audio.src = d.previewUrl;
          if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
          audio.addEventListener("ended", () => { setAudioPlaying(false); setNowPlayingId(null); setPlayingTrack(null); });
          audio.addEventListener("error", () => {
            delete deezerPreviewsRef.current[t.id];
            setDeezerPreviews(prev => { const n = { ...prev }; delete n[t.id]; return n; });
            setAudioPlaying(false); setNowPlayingId(null); setPlayingTrack(null);
          });
          audioRef.current = audio; pendingAudioRef.current = null;
          setNowPlayingId(t.id);
          setPlayingTrack({ id: t.id, name: t.name, artist: t.artist, spotifyId: t.spotifyId ?? null });
          setAudioPlaying(true);
          const p = audio.play();
          if (p) p.catch(() => { if (audioRef.current === audio) audioRef.current = null; setAudioPlaying(false); setNowPlayingId(null); setPlayingTrack(null); });
        })
        .catch(() => {});
      return;
    }

    // Same track again → stop
    if (nowPlayingIdRef.current === t.id) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; audioRef.current = null; }
      setAudioPlaying(false); setNowPlayingId(null); setPlayingTrack(null);
      return;
    }

    // Cancel pending + stop current
    requestedTrackRef.current = null; setPendingTrackId(null);
    if (pendingAudioRef.current) { pendingAudioRef.current.src = ""; pendingAudioRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }

    const audio = new Audio(previewUrl);
    audio.volume = 0.8;
    audio.addEventListener("ended", () => { setAudioPlaying(false); setNowPlayingId(null); setPlayingTrack(null); });
    audio.addEventListener("error", () => {
      delete deezerPreviewsRef.current[t.id];
      setDeezerPreviews(prev => { const n = { ...prev }; delete n[t.id]; return n; });
      setAudioPlaying(false); setNowPlayingId(null); setPlayingTrack(null);
    });
    audioRef.current = audio;
    setNowPlayingId(t.id);
    setPlayingTrack({ id: t.id, name: t.name, artist: t.artist, spotifyId: t.spotifyId ?? null });
    setAudioPlaying(true);
    const p = audio.play();
    if (p) p.catch(err => {
      if (err.name !== "AbortError") {
        delete deezerPreviewsRef.current[t.id];
        setDeezerPreviews(prev => { const n = { ...prev }; delete n[t.id]; return n; });
        setNowPlayingId(null); setAudioPlaying(false); setPlayingTrack(null);
      } else {
        setAudioPlaying(false);
      }
    });
  };

  // ── Canvas / render loop ───────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loading || Object.keys(worlds).length === 0) return;

    const sync = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);

    const { verts, faces } = buildIcosphere(2);

    const entries = Object.entries(worlds);
    const total   = entries.reduce((s, [, c]) => s + c, 0) || 1;
    const names   = entries.map(([n]) => n);

    const bonuses      = entries.map(([, c]) => (Math.PI / 4) * Math.sqrt(c / total));
    const initialPoles = fiboPoles(names.length);
    const cents        = faces.map(f => triCentroid(verts, f));

    const { region: rawRegion, poles: finalPoles } = lloydRelax(cents, initialPoles, bonuses, 8);
    regionPolesRef.current = names.map((n, i) => ({ name: n, pole: finalPoles[i] }));

    const adj    = buildAdjacency(faces);
    const region = removeIslands(rawRegion, adj, names.length);

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
          const subAdj = new Map<number, number[]>(
            gfi.map(fi => [fi, adj[fi].filter(ni => gfiSet.has(ni))])
          );

          const subTotal = actSubs.reduce((s, sg) => s + sg.count, 0) || 1;
          const targets  = actSubs.map(sg =>
            Math.max(1, Math.round((sg.count / subTotal) * gfi.length))
          );
          const tSum = targets.reduce((s, t) => s + t, 0);
          let surplus = gfi.length - tSum;
          if (surplus > 0) {
            for (let i = 0; surplus > 0; i = (i + 1) % n) { targets[i]++; surplus--; }
          } else if (surplus < 0) {
            for (let i = n - 1; surplus < 0; i = ((i - 1) + n) % n) {
              if (targets[i] > 1) { targets[i]--; surplus++; }
            }
          }

          let psx = 0, psy = 0, psz = 0;
          for (const fi of gfi) { psx += cents[fi][0]; psy += cents[fi][1]; psz += cents[fi][2]; }
          psx /= gfi.length; psy /= gfi.length; psz /= gfi.length;

          let firstSeed = gfi[0], bestCentDot = -Infinity;
          for (const fi of gfi) {
            const d = cents[fi][0]*psx + cents[fi][1]*psy + cents[fi][2]*psz;
            if (d > bestCentDot) { bestCentDot = d; firstSeed = fi; }
          }

          const seedFaces: number[] = [firstSeed];
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
            let farthestJ = 0;
            for (let j = 1; j < gfi.length; j++) {
              if (minDist[j] > minDist[farthestJ]) farthestJ = j;
            }
            seedFaces.push(gfi[farthestJ]);
            updateDists(gfi[farthestJ]);
          }

          const assignment = new Map<number, number>();
          const frontiers: number[][] = Array.from({ length: n }, () => []);
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
              let found = false;
              while (frontiers[i].length > 0 && !found) {
                const fi2 = frontiers[i][0];
                let claimedOne = false;
                for (const ni of (subAdj.get(fi2) ?? [])) {
                  if (!assignment.has(ni)) {
                    assignment.set(ni, i); regionCounts[i]++; totalAssigned++;
                    frontiers[i].push(ni); claimedOne = true; found = true; grewAny = true; break;
                  }
                }
                if (!claimedOne) frontiers[i].shift();
              }
            }
            if (!grewAny) break;
          }

          let mopping = true;
          while (mopping) {
            mopping = false;
            for (const fi of gfi) {
              if (assignment.has(fi)) continue;
              for (const ni of (subAdj.get(fi) ?? [])) {
                if (assignment.has(ni)) { assignment.set(fi, assignment.get(ni)!); mopping = true; break; }
              }
            }
          }
          for (const fi of gfi) { if (!assignment.has(fi)) assignment.set(fi, 0); }

          subRegionRef.current = assignment;

          const poleAcc: V3[] = Array.from({ length: n }, () => [0, 0, 0] as V3);
          const poleCnt = new Int32Array(n);
          for (const [fi2, si] of assignment) {
            poleAcc[si][0] += cents[fi2][0]; poleAcc[si][1] += cents[fi2][1]; poleAcc[si][2] += cents[fi2][2];
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

    const rgbMap: [number, number, number][] = names.map(n => hexRgb(COLORS[n] ?? "#71717a"));
    const FOV = 900;

    // ── Per-frame draw ─────────────────────────────────────────────────────
    function drawFrame() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.width, H = canvas.height;
      if (!W || !H) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // ── Zoom lerp: visual zoom smoothly tracks target (Google Maps feel) ──
      zoomRef.current += (zoomTargetRef.current - zoomRef.current) * 0.10;

      const R  = Math.min(W, H) * 0.38 * zoomRef.current;
      const cx = W / 2, cy = H / 2;
      const rx = rotRef.current.x, ry = rotRef.current.y;

      labelHitsRef.current = [];
      ctx.clearRect(0, 0, W, H);

      const atmo = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.22);
      atmo.addColorStop(0, "rgba(70,70,180,0.13)");
      atmo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2);
      ctx.fillStyle = atmo;
      ctx.fill();

      const pv = verts.map(([x, y, z]) => {
        const x1 = x * Math.cos(ry) + z * Math.sin(ry);
        const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
        const y2 = y * Math.cos(rx) - z1 * Math.sin(rx);
        const z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
        const s  = FOV / (FOV + z2);
        return { sx: cx + x1 * R * s, sy: cy + y2 * R * s, z: z2 };
      });

      const fd = faces.map((tri, i) => {
        const depth = (pv[tri[0]].z + pv[tri[1]].z + pv[tri[2]].z) / 3;
        return { tri, fi: i, depth, ri: region[i] };
      });
      fd.sort((a, b) => a.depth - b.depth);

      const selectedIdx    = selected !== null ? names.indexOf(selected) : -1;
      const hoveredGenre   = hoveredRef.current?.genre ?? null;
      const hoveredSubName = hoveredRef.current?.subgenre ?? null;
      const hoveredIdx     = hoveredGenre !== null ? names.indexOf(hoveredGenre) : -1;

      const subgReveal = Math.min(1, Math.max(0, (zoomRef.current - 1.6) / 0.5));

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
        if (showSub) { const sc = 0.55; r = Math.round(r*sc); g = Math.round(g*sc); b = Math.round(b*sc); }

        ctx.beginPath();
        ctx.moveTo(pv[ia].sx, pv[ia].sy);
        ctx.lineTo(pv[ib].sx, pv[ib].sy);
        ctx.lineTo(pv[ic].sx, pv[ic].sy);
        ctx.closePath();

        if (isFront) {
          const hasSel    = selectedIdx >= 0;
          const fillAlpha = isClickedSub ? 0.52*subgReveal : isHoveredSub ? 0.35*subgReveal
            : siblingHov ? 0.06*subgReveal : showSub ? 0.08*subgReveal
            : isSelected ? 0.28 : isHoveredGenre ? 0.15 : hasSel ? 0.015 : 0.02;
          ctx.fillStyle = `rgba(${r},${g},${b},${fillAlpha})`;
          ctx.fill();

          const edgeAlpha = isClickedSub ? 0.90*subgReveal : isHoveredSub ? 0.65*subgReveal
            : siblingHov ? 0.03*subgReveal : showSub ? 0.05*subgReveal
            : isSelected ? 1.0 : isHoveredGenre ? 0.95 : hasSel ? 0.60 : 0.82;
          ctx.strokeStyle = `rgba(${r},${g},${b},${edgeAlpha})`;
          ctx.lineWidth   = isClickedSub ? 0.70 : isHoveredSub ? 0.55 : showSub ? 0.30
            : isSelected ? 1.4 : isHoveredGenre ? 1.2 : hasSel ? 0.75 : 0.9;
          ctx.stroke();
        } else {
          const t = Math.max(0, (depth + 0.8) / 0.8) * 0.13;
          ctx.strokeStyle = `rgba(${r},${g},${b},${t.toFixed(3)})`;
          ctx.lineWidth   = 0.4;
          ctx.stroke();
        }
      }

      // Level 2: subgenre boundary edges
      if (zoomRef.current >= 1.6 && selectedIdx >= 0 && subRegionRef.current.size > 0) {
        const [br, bg, bb] = rgbMap[selectedIdx];
        ctx.save();
        ctx.shadowColor = `rgba(${br},${bg},${bb},${(0.55 * subgReveal).toFixed(3)})`;
        ctx.shadowBlur  = 5;
        ctx.strokeStyle = `rgba(${br},${bg},${bb},${(0.82 * subgReveal).toFixed(3)})`;
        ctx.lineWidth   = 1.6; ctx.lineCap = "round";
        const drawnEdges = new Set<string>();
        for (const { fi, depth, ri } of fd) {
          if (ri !== selectedIdx || depth < 0) continue;
          const siA = subRegionRef.current.get(fi);
          if (siA === undefined) continue;
          for (const ni of adj[fi]) {
            const siB = subRegionRef.current.get(ni);
            if (siB === undefined || siB === siA) continue;
            const fv = faces[fi], nv = faces[ni];
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

      // Level 1: main genre plate boundary
      if (selectedIdx >= 0) {
        const [pr, pg, pb] = rgbMap[selectedIdx];
        ctx.save();
        ctx.shadowColor = `rgba(${pr},${pg},${pb},0.85)`;
        ctx.shadowBlur  = 10;
        ctx.strokeStyle = `rgba(${pr},${pg},${pb},1.0)`;
        ctx.lineWidth   = 3.0; ctx.lineCap = "round";
        const drawnPlate = new Set<string>();
        for (const { fi, depth, ri } of fd) {
          if (ri !== selectedIdx || depth < 0) continue;
          for (const ni of adj[fi]) {
            if (region[ni] === selectedIdx) continue;
            const fv = faces[fi], nv = faces[ni];
            const shared = fv.filter(v => nv.includes(v));
            if (shared.length !== 2) continue;
            const key = shared[0] < shared[1] ? `${shared[0]}:${shared[1]}` : `${shared[1]}:${shared[0]}`;
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

      // ── Genre labels (short names) ────────────────────────────────────────
      const acc: Record<number, { sx: number; sy: number; n: number }> = {};
      for (const { tri, depth, ri } of fd) {
        if (depth < 0) continue;
        const [ia, ib, ic] = tri;
        const lx = (pv[ia].sx + pv[ib].sx + pv[ic].sx) / 3;
        const ly = (pv[ia].sy + pv[ib].sy + pv[ic].sy) / 3;
        if (!acc[ri]) acc[ri] = { sx: 0, sy: 0, n: 0 };
        acc[ri].sx += lx; acc[ri].sy += ly; acc[ri].n++;
      }

      ctx.textAlign = "center"; ctx.textBaseline = "middle";

      for (const [riStr, a] of Object.entries(acc)) {
        if (a.n < 4) continue;
        const ri         = Number(riStr);
        const isSelected = ri === selectedIdx;
        const rawLx = a.sx / a.n, rawLy = a.sy / a.n;
        const lx = isSelected ? Math.max(80, Math.min(W - 80, rawLx)) : rawLx;
        const ly = isSelected ? Math.max(24, Math.min(H * 0.88, rawLy)) : rawLy;
        const name    = names[ri];
        const label   = shortLabel(name); // ← short display name
        const [r, g, b] = rgbMap[ri];
        const isThisHov = ri === hoveredIdx;
        const labelDim  = isSelected || isThisHov ? 1.0 : selectedIdx >= 0 ? 0.50 : 1.0;
        const fs  = isSelected ? 15 : 13;

        ctx.globalAlpha = labelDim;
        ctx.font = `700 ${fs}px system-ui, sans-serif`;
        const tw  = ctx.measureText(label).width;
        const pad = 8, rad = 8;
        const bx = lx - tw/2 - pad, by = ly - fs/2 - pad;
        const bw = tw + pad*2,       bh = fs + pad*2;

        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.75)"; ctx.shadowBlur = 14;
        ctx.fillStyle   = isSelected ? "rgba(8,8,16,0.90)" : "rgba(8,8,16,0.72)";
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, rad); ctx.fill();
        ctx.restore();

        if (isSelected) {
          ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, rad); ctx.stroke();
        }

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillText(label, lx, ly);
        ctx.globalAlpha = 1.0;

        // Hit area uses full name for data lookups
        labelHitsRef.current.push({ name, x1: bx, y1: by, x2: bx + bw, y2: by + bh });
      }

      // ── Subgenre labels ───────────────────────────────────────────────────
      if (zoomRef.current >= 1.6 && selectedIdx >= 0) {
        const subTriMap = new Map<number, { sx: number; sy: number; n: number }>();
        for (const { tri, fi, depth, ri } of fd) {
          if (ri !== selectedIdx || depth < -0.1) continue;
          const si = subRegionRef.current.get(fi);
          if (si === undefined) continue;
          const [ia, ib, ic] = tri;
          const tsx = (pv[ia].sx + pv[ib].sx + pv[ic].sx) / 3;
          const tsy = (pv[ia].sy + pv[ib].sy + pv[ic].sy) / 3;
          const a = subTriMap.get(si);
          if (a) { a.sx += tsx; a.sy += tsy; a.n++; }
          else subTriMap.set(si, { sx: tsx, sy: tsy, n: 1 });
        }

        const labelReveal = Math.min(1, Math.max(0, (zoomRef.current - 1.6) / 0.3));
        ctx.globalAlpha = labelReveal;

        activeSubsRef.current.forEach((sub, si) => {
          const a = subTriMap.get(si);
          if (!a) return;
          const lx = a.sx / a.n, ly = a.sy / a.n;
          const n = activeSubsRef.current.length;
          const t = n > 1 ? 1 - si / (n - 1) : 0.5;
          const scale = 0.45 + 0.55 * t;
          const [pr, pg, pb] = rgbMap[selectedIdx];
          const cr = Math.round(pr * scale), cg = Math.round(pg * scale), cb = Math.round(pb * scale);
          const isActiveSub = selectedSubgenreRef.current === sub.name;
          const isHovSub    = hoveredSubName === sub.name;
          const subLit = isActiveSub || isHovSub;
          const fs  = subLit ? 12 : 11;
          ctx.font  = `${subLit ? 700 : 600} ${fs}px system-ui, sans-serif`;
          const tw = ctx.measureText(sub.name).width;
          const pad = 6, rad = 6;
          const bx = lx - tw/2 - pad, by = ly - fs/2 - pad;
          const bw = tw + pad*2,       bh = fs + pad*2;
          ctx.save();
          ctx.shadowColor = isHovSub ? `rgba(${cr},${cg},${cb},0.45)` : "rgba(0,0,0,0.55)";
          ctx.shadowBlur  = isHovSub ? 12 : 8;
          ctx.fillStyle   = isActiveSub ? `rgba(${cr},${cg},${cb},0.18)` : isHovSub ? `rgba(${cr},${cg},${cb},0.12)` : "rgba(8,8,16,0.60)";
          ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, rad); ctx.fill();
          ctx.restore();
          if (isActiveSub) {
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},1.0)`; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, rad); ctx.stroke();
          } else if (isHovSub) {
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.60)`; ctx.lineWidth = 1.0;
            ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, rad); ctx.stroke();
          }
          ctx.fillStyle = isHovSub ? `rgb(${cr},${cg},${cb})` : `rgba(${cr},${cg},${cb},0.80)`;
          ctx.fillText(sub.name, lx, ly);
          labelHitsRef.current.push({ name: selected!, subgenre: sub.name, x1: bx, y1: by, x2: bx + bw, y2: by + bh });
        });

        ctx.globalAlpha = 1.0;
      }

      ctx.textBaseline = "alphabetic";
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const prev   = zoomTargetRef.current;
      const next   = Math.max(0.5, Math.min(5, prev * (1 - e.deltaY * 0.004)));
      zoomTargetRef.current = next;

      // Auto-reveal: select most front-facing genre on zoom-in
      if (next >= 1.2 && selectedRef.current === null && regionPolesRef.current.length > 0) {
        const rx = rotRef.current.x, ry = rotRef.current.y;
        let bestName = regionPolesRef.current[0].name, bestZ = -Infinity;
        for (const { name, pole: [px, py, pz] } of regionPolesRef.current) {
          const x1 =  px * Math.cos(ry) + pz * Math.sin(ry);
          const z1 = -px * Math.sin(ry) + pz * Math.cos(ry);
          const z2 =  py * Math.sin(rx) + z1 * Math.cos(rx);
          if (z2 > bestZ) { bestZ = z2; bestName = name; }
        }
        autoSelectedRef.current = true;
        setSelected(bestName);
      }

      // Auto-focus subgenre at zoom >= 2.0
      if (next >= 2.0 && subPolesRef.current.length > 0) {
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
      } else if (next < 2.0) {
        if (zoomSubgenreRef.current !== null) { zoomSubgenreRef.current = null; setZoomSubgenre(null); }
        if (selectedSubgenreRef.current !== null) { selectedSubgenreRef.current = null; setSelectedSubgenre(null); }
      }

      // Deselect when zooming back out
      if (next < 1.1 && selectedRef.current !== null) {
        autoSelectedRef.current = false;
        selectedSubgenreRef.current = null; setSelectedSubgenre(null);
        zoomSubgenreRef.current     = null; setZoomSubgenre(null);
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
  }, [worlds, loading, selected, subgenres]);

  // ── Mouse drag + hover ────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY, moved: false };
  };

  const hitTestSphere = (mx: number, my: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || regionPolesRef.current.length === 0) return null;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const R = Math.min(W, H) * 0.38 * zoomRef.current;
    const cx = W / 2, cy = H / 2;
    const nx = (mx - cx) / R, ny = (my - cy) / R;
    if (nx * nx + ny * ny > 1) return null;
    const nz  = Math.sqrt(Math.max(0, 1 - nx*nx - ny*ny));
    const rx  = rotRef.current.x, ry = rotRef.current.y;
    const y_w = ny * Math.cos(rx) + nz * Math.sin(rx);
    const z1  = -ny * Math.sin(rx) + nz * Math.cos(rx);
    const x_w = nx * Math.cos(ry) - z1 * Math.sin(ry);
    const z_w = nx * Math.sin(ry) + z1 * Math.cos(ry);
    let best = regionPolesRef.current[0], bestDot = -Infinity;
    for (const rd of regionPolesRef.current) {
      const d = rd.pole[0]*x_w + rd.pole[1]*y_w + rd.pole[2]*z_w;
      if (d > bestDot) { bestDot = d; best = rd; }
    }
    return best.name;
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      rotRef.current.y += (e.clientX - dragRef.current.lx) * 0.005;
      rotRef.current.x -= (e.clientY - dragRef.current.ly) * 0.005;
      rotRef.current.x  = Math.max(-1.2, Math.min(1.2, rotRef.current.x));
      dragRef.current.lx = e.clientX; dragRef.current.ly = e.clientY;
      dragRef.current.moved = true;
      hoveredRef.current    = null;

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
            selectedSubgenreRef.current = null; setSelectedSubgenre(null);
            zoomSubgenreRef.current     = null; setZoomSubgenre(null);
            setSelected(null);
          }
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    for (const h of labelHitsRef.current) {
      if (mx >= h.x1 && mx <= h.x2 && my >= h.y1 && my <= h.y2) {
        hoveredRef.current = h.subgenre ? { genre: h.name, subgenre: h.subgenre } : { genre: h.name };
        return;
      }
    }

    const genreName = hitTestSphere(mx, my);
    if (!genreName) { hoveredRef.current = null; return; }

    if (selected !== null && zoomRef.current >= 2.0 &&
        genreName === selected && subPolesRef.current.length > 0) {
      const W2 = canvas.clientWidth, H2 = canvas.clientHeight;
      const R2 = Math.min(W2, H2) * 0.38 * zoomRef.current;
      const nx2 = (mx - W2/2) / R2, ny2 = (my - H2/2) / R2;
      if (nx2*nx2 + ny2*ny2 <= 1) {
        const nz2 = Math.sqrt(Math.max(0, 1 - nx2*nx2 - ny2*ny2));
        const rx2 = rotRef.current.x, ry2 = rotRef.current.y;
        const y_w = ny2 * Math.cos(rx2) + nz2 * Math.sin(rx2);
        const z1  = -ny2 * Math.sin(rx2) + nz2 * Math.cos(rx2);
        const x_w = nx2 * Math.cos(ry2) - z1 * Math.sin(ry2);
        const z_w = nx2 * Math.sin(ry2) + z1 * Math.cos(ry2);
        let bestSub = subPolesRef.current[0], bestDot = -Infinity;
        for (const sp of subPolesRef.current) {
          const d = sp.pole[0]*x_w + sp.pole[1]*y_w + sp.pole[2]*z_w;
          if (d > bestDot) { bestDot = d; bestSub = sp; }
        }
        hoveredRef.current = { genre: genreName, subgenre: bestSub.name };
        return;
      }
    }

    hoveredRef.current = { genre: genreName };
  };

  const stopDrag   = () => { dragRef.current.active = false; };
  const onMouseLeave = () => { dragRef.current.active = false; hoveredRef.current = null; };

  // ── Click → genre / subgenre selection ───────────────────────────────────

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.moved) return;

    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left, my = e.clientY - rect.top;

    for (const h of labelHitsRef.current) {
      if (mx >= h.x1 && mx <= h.x2 && my >= h.y1 && my <= h.y2) {
        if (h.subgenre) {
          const next = selectedSubgenreRef.current === h.subgenre ? null : h.subgenre;
          selectedSubgenreRef.current = next; setSelectedSubgenre(next);
        } else {
          autoSelectedRef.current = false;
          selectedSubgenreRef.current = null; setSelectedSubgenre(null);
          zoomSubgenreRef.current     = null; setZoomSubgenre(null);
          setSelected(prev => prev === h.name ? null : h.name);
        }
        return;
      }
    }

    const W = canvas.clientWidth, H = canvas.clientHeight;
    const R = Math.min(W, H) * 0.38 * zoomRef.current;
    const cx = W/2, cy = H/2;
    const nx = (mx - cx) / R, ny = (my - cy) / R;
    if (nx*nx + ny*ny > 1) {
      autoSelectedRef.current = false;
      selectedSubgenreRef.current = null; setSelectedSubgenre(null);
      zoomSubgenreRef.current     = null; setZoomSubgenre(null);
      setSelected(null);
      return;
    }

    const nz  = Math.sqrt(Math.max(0, 1 - nx*nx - ny*ny));
    const rx  = rotRef.current.x, ry = rotRef.current.y;
    const y_w = ny * Math.cos(rx) + nz * Math.sin(rx);
    const z1  = -ny * Math.sin(rx) + nz * Math.cos(rx);
    const x_w = nx * Math.cos(ry) - z1 * Math.sin(ry);
    const z_w = nx * Math.sin(ry) + z1 * Math.cos(ry);

    if (regionPolesRef.current.length === 0) return;

    let best = regionPolesRef.current[0], bestDot = -Infinity;
    for (const rd of regionPolesRef.current) {
      const d = rd.pole[0]*x_w + rd.pole[1]*y_w + rd.pole[2]*z_w;
      if (d > bestDot) { bestDot = d; best = rd; }
    }

    if (selected !== null && zoomRef.current >= 2.0 &&
        best.name === selected && subPolesRef.current.length > 0) {
      let bestSub = subPolesRef.current[0], bestSubDot = -Infinity;
      for (const sp of subPolesRef.current) {
        const d = sp.pole[0]*x_w + sp.pole[1]*y_w + sp.pole[2]*z_w;
        if (d > bestSubDot) { bestSubDot = d; bestSub = sp; }
      }
      const next = selectedSubgenreRef.current === bestSub.name ? null : bestSub.name;
      selectedSubgenreRef.current = next; setSelectedSubgenre(next);
      return;
    }

    autoSelectedRef.current = false;
    selectedSubgenreRef.current = null; setSelectedSubgenre(null);
    zoomSubgenreRef.current     = null; setZoomSubgenre(null);
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

  const selectedColor   = selected ? (COLORS[selected] ?? "#ffffff") : "#ffffff";
  const [sr, sg, sb]    = selected ? hexRgb(COLORS[selected] ?? "#ffffff") : [255, 255, 255];
  const focusedSubgenre = hoveredSubgenre ?? selectedSubgenre ?? zoomSubgenre;
  const displayedTracks = focusedSubgenre
    ? tracks.filter(t => t.blueprintSubgenre === focusedSubgenre)
    : tracks;

  return (
    <main className="h-screen bg-black text-white flex flex-col overflow-hidden">

      {/* ── Minimal utility bar ───────────────────────────────────────────── */}
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

        {/* RIGHT — content shelf */}
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{
            width:      "42%",
            borderLeft: `1px solid rgba(${sr},${sg},${sb},0.14)`,
            background: "rgba(4,4,8,0.98)",
          }}
        >
          {selected ? (
            <>
              {/* Thin genre-color accent strip */}
              <div className="flex-shrink-0" style={{ height: 2, background: selectedColor, opacity: 0.85 }} />

              {/* Shelf header */}
              <div className="flex-shrink-0 px-7 pt-5 pb-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {focusedSubgenre ? (
                    <>
                      <button
                        onClick={() => {
                          setSelectedSubgenre(null); selectedSubgenreRef.current = null;
                          setZoomSubgenre(null);     zoomSubgenreRef.current     = null;
                        }}
                        className="text-xs mb-3 flex items-center gap-1.5 transition-opacity hover:opacity-100"
                        style={{ color: `rgba(${sr},${sg},${sb},0.45)` }}
                      >
                        ← {shortLabel(selected)}
                      </button>
                      <div className="flex items-center justify-between gap-4">
                        <h2 className="text-2xl font-bold leading-tight truncate" style={{ color: selectedColor }}>
                          {focusedSubgenre}
                        </h2>
                        <SpotifyLogoButton track={playingTrack} />
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs tracking-widest uppercase mb-2"
                        style={{ color: `rgba(${sr},${sg},${sb},0.38)` }}>
                        Now exploring
                      </p>
                      <div className="flex items-center justify-between gap-4">
                        <h2 className="text-2xl font-bold leading-tight truncate" style={{ color: selectedColor }}>
                          {shortLabel(selected)}
                        </h2>
                        <SpotifyLogoButton track={playingTrack} />
                      </div>
                    </>
                  )}
                  <p className="text-zinc-600 text-xs mt-1.5">
                    {tracksLoading ? "—" : `${displayedTracks.length} tracks`}
                  </p>
                </div>
              </div>

              {/* Subgenre filter row */}
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
                          color:      active ? `rgb(${sr},${sg},${sb})` : "rgba(255,255,255,0.30)",
                          border:     `1px solid rgba(${sr},${sg},${sb},${active ? 0.45 : 0.10})`,
                        }}
                      >
                        {sub.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex-shrink-0 mx-7" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

              {/* Track shelf */}
              <div className="overflow-y-auto flex-1"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
              >
                {tracksLoading ? (
                  <p className="text-zinc-700 text-xs px-7 py-8 text-center">—</p>
                ) : displayedTracks.length === 0 ? (
                  <p className="text-zinc-700 text-xs px-7 py-8 text-center">No tracks</p>
                ) : (
                  <div className="flex flex-col pt-1 pb-6">
                    {displayedTracks.map((t, idx) => {
                      const canPlay  = !!(deezerPreviews[t.id] || t.previewUrl);
                      const isPending = pendingTrackId === t.id;
                      const isActive  = nowPlayingId === t.id || isPending;
                      return (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 px-7 py-2 cursor-pointer"
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.035)" }}
                          onClick={() => playTrack(t)}
                        >
                          {/* Track number */}
                          <span style={{
                            flexShrink: 0, width: 20, textAlign: "center",
                            fontSize: 11, lineHeight: 1, userSelect: "none",
                            color: isActive ? selectedColor : "rgba(255,255,255,0.22)",
                          }}>
                            {idx + 1}
                          </span>
                          {/* Album art */}
                          <div className="flex-shrink-0" style={{
                            width: 36, height: 36, borderRadius: 4, overflow: "hidden",
                            background: `rgba(${sr},${sg},${sb},0.10)`,
                          }}>
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
                            >
                              {t.name}
                            </span>
                            <span className="text-zinc-500 text-xs truncate">
                              {t.artist}
                              {isPending ? (
                                <span style={{ color: "rgba(255,255,255,0.32)", marginLeft: 4 }}>(Loading…)</span>
                              ) : !canPlay ? (
                                <span style={{ color: "rgba(255,255,255,0.22)", marginLeft: 4 }}>(No Preview)</span>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Close button */}
              <div className="flex-shrink-0 flex justify-end px-6 py-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <button
                  onClick={() => {
                    setSelected(null); setSelectedSubgenre(null); selectedSubgenreRef.current = null;
                    setZoomSubgenre(null); zoomSubgenreRef.current = null; autoSelectedRef.current = false;
                    // Stop audio when closing panel
                    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
                    setNowPlayingId(null); setAudioPlaying(false); setPlayingTrack(null);
                  }}
                  className="text-zinc-700 hover:text-zinc-400 text-xs transition-colors"
                >
                  close ✕
                </button>
              </div>
            </>
          ) : (
            /* Overview state */
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

              <div className="flex-shrink-0 mx-7" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

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
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-white text-sm font-medium truncate leading-snug">
                              {shortLabel(name)}
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

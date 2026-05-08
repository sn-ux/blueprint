"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import SphereCanvas from "./SphereCanvas";

// ── Genre palette — matches WorldSphere ───────────────────────────────────────
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

// Shortened display labels for genre breakdown text
const SHORT_GENRE: Record<string, string> = {
  "Rap / Hip-Hop":                  "Rap",
  "R&B / Soul / Funk":              "R&B",
  "Rock / Indie / Alternative":     "Rock",
  "Pop / Dance":                    "Pop",
  "Jazz / Blues":                   "Jazz",
  "Electronic / Ambient":           "Electronic",
  "Classical / Score / Soundtrack": "Classical",
  "World / Folk / Regional":        "World",
  "Other":                          "Other",
};

// ── Genre breakdown helpers ───────────────────────────────────────────────────

interface GenreSlice { genre: string; label: string; pct: number; color: string }

function calcGenres(worlds: Record<string, number>, topN = 4): GenreSlice[] {
  const total = Object.values(worlds).reduce((s, c) => s + c, 0) || 1;
  return Object.entries(worlds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([genre, count]) => ({
      genre,
      label: SHORT_GENRE[genre] ?? genre,
      pct:   Math.round((count / total) * 100),
      color: COLORS[genre] ?? "#71717a",
    }));
}

function GenreBreakdown({
  worlds,
  topN = 4,
  fontSize = 11,
}: {
  worlds: Record<string, number>;
  topN?: number;
  fontSize?: number;
}) {
  const genres = calcGenres(worlds, topN);
  return (
    <p style={{ margin: 0, fontSize, lineHeight: 1.7, color: "rgba(255,255,255,0.38)" }}>
      {genres.map((g, i) => (
        <span key={g.genre}>
          {i > 0 && <span style={{ opacity: 0.45 }}> · </span>}
          <span style={{ color: g.color, fontWeight: 500 }}>{g.label}</span>
          {" "}<span>{g.pct}%</span>
        </span>
      ))}
    </p>
  );
}

// ── WorldGalleryTile — user with an imported library ─────────────────────────
// Mobile  : sphere full-width (aspect-square) stacked above info.
// Desktop (sm+): compact row — small 150 px sphere on left, info on right.

function WorldGalleryTile({
  name,
  userId,
  worldHref,
  rotSeed = 0,
}: {
  name:      string;
  userId:    string;
  worldHref: string;
  rotSeed:   number;
}) {
  const [worlds,  setWorlds]  = useState<Record<string, number> | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    fetch(`/api/world?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then((d: Record<string, number>) => setWorlds(d))
      .catch(() => {});
  }, [userId]);

  const totalTracks = worlds
    ? Object.values(worlds).reduce((s, c) => s + c, 0)
    : null;

  return (
    <Link href={worldHref} style={{ textDecoration: "none", display: "block" }}>
      {/* Mobile: column stack. sm+: row with fixed-size sphere */}
      <div
        className="flex flex-col sm:flex-row sm:items-center"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor:     "pointer",
          gap:        12,
          transform:  hovered ? "translateY(-2px)" : "translateY(0)",
          transition: "transform 0.18s ease",
        }}
      >
        {/* ── Sphere preview ──────────────────────────────────────────────── */}
        {/* Mobile: full-width square. sm+: fixed 150 px square. */}
        <div
          className="relative w-full sm:w-[150px] sm:h-[150px] flex-shrink-0"
          style={{
            aspectRatio:  "1 / 1",
            borderRadius: 14,
            overflow:     "hidden",
          }}
        >
          <SphereCanvas
            className="absolute inset-0 w-full h-full"
            interactive={false}
            showLabels={false}
            rotSpeed={0.0018 + rotSeed * 0.0003}
            initialRotX={0.28 + rotSeed * 0.12}
            initialRotY={rotSeed * 1.4}
          />
          {/* Hover overlay */}
          <div style={{
            position:       "absolute",
            inset:          0,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            opacity:        hovered ? 1 : 0,
            transition:     "opacity 0.18s ease",
            pointerEvents:  "none",
          }}>
            <span style={{
              fontSize:      11,
              fontWeight:    500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color:         "rgba(255,255,255,0.80)",
              background:    "rgba(0,0,0,0.58)",
              padding:       "5px 11px",
              borderRadius:  20,
              backdropFilter:"blur(6px)",
            }}>
              Open →
            </span>
          </div>
        </div>

        {/* ── Info ────────────────────────────────────────────────────────── */}
        <div>
          <p style={{
            margin:        "0 0 3px",
            fontSize:      14,
            fontWeight:    600,
            letterSpacing: "-0.01em",
            color:         hovered ? "#ffffff" : "rgba(255,255,255,0.88)",
            transition:    "color 0.18s ease",
            lineHeight:    1.25,
          }}>
            {name}
          </p>
          {totalTracks !== null && (
            <p style={{
              margin:        "0 0 5px",
              fontSize:      11,
              color:         "rgba(255,255,255,0.38)",
              letterSpacing: "0.01em",
            }}>
              {totalTracks.toLocaleString()} tracks
            </p>
          )}
          {worlds && (
            <GenreBreakdown
              worlds={worlds}
              topN={4}
              fontSize={10}
            />
          )}
        </div>
      </div>
    </Link>
  );
}

// ── EmptyGallerySlot — placeholder for users who haven't connected ────────────
// Matches WorldGalleryTile layout: row on sm+, column on mobile.

function EmptyGallerySlot({ name, rotSeed = 0 }: { name: string; rotSeed: number }) {
  const [connecting, setConnecting] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleConnect = async () => {
    setConnecting(true);
    await signOut({ redirect: false });
    await signIn(
      "spotify",
      { callbackUrl: "/midvale/welcome" },
      { show_dialog: "true" },
    );
    setConnecting(false);
  };

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center"
      style={{ opacity: 0.40, gap: 12 }}
    >
      {/* ── Sphere preview — dimmed ──────────────────────────────────────── */}
      <div
        className="relative w-full sm:w-[150px] sm:h-[150px] flex-shrink-0"
        style={{
          aspectRatio:  "1 / 1",
          borderRadius: 14,
          overflow:     "hidden",
        }}
      >
        <SphereCanvas
          className="absolute inset-0 w-full h-full"
          interactive={false}
          showLabels={false}
          rotSpeed={0.0012}
          initialRotX={0.28 + rotSeed * 0.12}
          initialRotY={rotSeed * 1.4}
        />
        {/* Connect Spotify button overlay */}
        <div style={{
          position:       "absolute",
          inset:          0,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          background:     "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 75%)",
        }}>
          <button
            ref={btnRef}
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            style={{
              padding:       "6px 14px",
              background:    "rgba(255,255,255,0.07)",
              border:        "1px solid rgba(255,255,255,0.16)",
              borderRadius:  10,
              color:         "rgba(255,255,255,0.75)",
              fontSize:      11,
              fontFamily:    "inherit",
              fontWeight:    500,
              letterSpacing: "0.01em",
              cursor:        connecting ? "default" : "pointer",
              opacity:       connecting ? 0.50 : 1,
              transition:    "background 0.18s ease, border-color 0.18s ease",
            }}
          >
            {connecting ? "Connecting…" : "Connect Spotify"}
          </button>
        </div>
      </div>

      {/* ── Info ────────────────────────────────────────────────────────── */}
      <p style={{
        margin:        0,
        fontSize:      14,
        fontWeight:    600,
        letterSpacing: "-0.01em",
        color:         "rgba(255,255,255,0.40)",
        lineHeight:    1.25,
      }}>
        {name}
      </p>
    </div>
  );
}

// ── FriendsGalleryTile — combined world at the top of the Friends page ────────
// Rendered full-width above the individual world grid.
// On desktop: sphere left + info right (flex row).
// On mobile:  sphere top + info below (flex col, forced by className).

export function FriendsWorldCard() {
  const [worlds,  setWorlds]  = useState<Record<string, number> | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    fetch("/api/world/friends")
      .then(r => r.json())
      .then((d: Record<string, number>) => setWorlds(d))
      .catch(() => {});
  }, []);

  const totalTracks = worlds
    ? Object.values(worlds).reduce((s, c) => s + c, 0)
    : null;

  return (
    <Link href="/midvale/friends" style={{ textDecoration: "none", display: "block" }}>
      {/* Mobile: sphere top, info below.
          sm+: sphere left (320 px), info right.
          lg+: sphere grows to 420 px.
          xl+: sphere grows to 480 px. */}
      <div
        className="flex flex-col sm:flex-row sm:items-center"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor:     "pointer",
          gap:        "clamp(20px, 3vw, 44px)",
          transform:  hovered ? "translateY(-3px)" : "translateY(0)",
          transition: "transform 0.18s ease",
        }}
      >
        {/* ── Sphere
            Mobile : full-width square (aspect-ratio handles height).
            sm     : 320 × 320 px
            lg     : 420 × 420 px
            xl     : 480 × 480 px                                      ── */}
        <div
          className="relative w-full sm:w-[320px] sm:h-[320px] lg:w-[420px] lg:h-[420px] xl:w-[480px] xl:h-[480px] flex-shrink-0"
          style={{
            aspectRatio:  "1 / 1",
            borderRadius: 22,
            overflow:     "hidden",
          }}
        >
          <SphereCanvas
            className="absolute inset-0 w-full h-full"
            interactive={false}
            showLabels={false}
            rotSpeed={0.0014}
            initialRotX={0.35}
            initialRotY={0.9}
          />
          {/* Hover overlay */}
          <div style={{
            position:       "absolute",
            inset:          0,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            opacity:        hovered ? 1 : 0,
            transition:     "opacity 0.20s ease",
            pointerEvents:  "none",
          }}>
            <span style={{
              fontSize:      13,
              fontWeight:    500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color:         "rgba(255,255,255,0.80)",
              background:    "rgba(0,0,0,0.58)",
              padding:       "7px 16px",
              borderRadius:  20,
              backdropFilter:"blur(6px)",
            }}>
              Open →
            </span>
          </div>
        </div>

        {/* ── Info — sits beside the sphere on desktop ──────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{
            margin:        0,
            fontSize:      "clamp(26px, 4vw, 44px)",
            fontWeight:    700,
            letterSpacing: "-0.03em",
            color:         hovered ? "#ffffff" : "rgba(255,255,255,0.92)",
            transition:    "color 0.18s ease",
            lineHeight:    1.0,
          }}>
            Friends
          </p>
          {totalTracks !== null && (
            <p style={{
              margin:        0,
              fontSize:      "clamp(12px, 1.4vw, 14px)",
              color:         "rgba(255,255,255,0.38)",
              letterSpacing: "0.01em",
            }}>
              {totalTracks.toLocaleString()} tracks
            </p>
          )}
          {worlds && (
            <GenreBreakdown
              worlds={worlds}
              topN={5}
              fontSize={12}
            />
          )}
        </div>
      </div>
    </Link>
  );
}

// ── WorldCard — public default export ────────────────────────────────────────
// Routes to WorldGalleryTile (has world) or EmptyGallerySlot (no world yet).

interface Props {
  name:      string;
  userId?:   string | null;
  worldHref?: string;
  hasWorld?: boolean;
  rotSeed?:  number;
}

export default function WorldCard({
  name,
  userId,
  worldHref,
  hasWorld = false,
  rotSeed  = 0,
}: Props) {
  if (userId && hasWorld) {
    return (
      <WorldGalleryTile
        name={name}
        userId={userId}
        worldHref={worldHref ?? `/midvale/${userId}`}
        rotSeed={rotSeed}
      />
    );
  }
  return <EmptyGallerySlot name={name} rotSeed={rotSeed} />;
}

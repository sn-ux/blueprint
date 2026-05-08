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
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor:     "pointer",
          transform:  hovered ? "translateY(-3px)" : "translateY(0)",
          transition: "transform 0.18s ease",
        }}
      >
        {/* ── Sphere preview ──────────────────────────────────────────────── */}
        <div style={{
          position:     "relative",
          width:        "100%",
          aspectRatio:  "1 / 1",
          borderRadius: 16,
          overflow:     "hidden",
          marginBottom: 14,
        }}>
          <SphereCanvas
            className="absolute inset-0 w-full h-full"
            interactive={false}
            showLabels={false}
            rotSpeed={0.0018 + rotSeed * 0.0003}
            initialRotX={0.28 + rotSeed * 0.12}
            initialRotY={rotSeed * 1.4}
          />
          {/* Open-world hover label */}
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
              fontSize:      12,
              fontWeight:    500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color:         "rgba(255,255,255,0.80)",
              background:    "rgba(0,0,0,0.58)",
              padding:       "6px 14px",
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
            fontSize:      "clamp(13px, 1.8vw, 16px)",
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
              fontSize:      "clamp(11px, 1.4vw, 13px)",
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
              fontSize={11}
            />
          )}
        </div>
      </div>
    </Link>
  );
}

// ── EmptyGallerySlot — placeholder for users who haven't connected ────────────

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
    <div style={{ opacity: 0.40 }}>
      {/* ── Sphere preview — dimmed ──────────────────────────────────────── */}
      <div style={{
        position:     "relative",
        width:        "100%",
        aspectRatio:  "1 / 1",
        borderRadius: 16,
        overflow:     "hidden",
        marginBottom: 14,
      }}>
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
              padding:       "8px 18px",
              background:    "rgba(255,255,255,0.07)",
              border:        "1px solid rgba(255,255,255,0.16)",
              borderRadius:  10,
              color:         "rgba(255,255,255,0.75)",
              fontSize:      "clamp(11px, 1.4vw, 13px)",
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
        fontSize:      "clamp(13px, 1.8vw, 16px)",
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
      {/* Responsive flex: stacked on mobile → side-by-side on sm+ */}
      <div
        className="flex flex-col sm:flex-row sm:items-center"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          cursor:     "pointer",
          gap:        "clamp(16px, 3vw, 40px)",
          transform:  hovered ? "translateY(-3px)" : "translateY(0)",
          transition: "transform 0.18s ease",
        }}
      >
        {/* ── Sphere — full-width square on mobile, 240px square on sm+ ─── */}
        <div
          className="relative w-full sm:w-60 sm:h-60 flex-shrink-0"
          style={{
            aspectRatio:  "1 / 1",   /* respected on mobile (w-full, h auto) */
            borderRadius: 20,
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

        {/* ── Info ────────────────────────────────────────────────────────── */}
        <div>
          <p style={{
            margin:        "0 0 6px",
            fontSize:      "clamp(22px, 3.5vw, 36px)",
            fontWeight:    700,
            letterSpacing: "-0.025em",
            color:         hovered ? "#ffffff" : "rgba(255,255,255,0.92)",
            transition:    "color 0.18s ease",
            lineHeight:    1.1,
          }}>
            Friends
          </p>
          {totalTracks !== null && (
            <p style={{
              margin:        "0 0 8px",
              fontSize:      "clamp(12px, 1.5vw, 14px)",
              color:         "rgba(255,255,255,0.40)",
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

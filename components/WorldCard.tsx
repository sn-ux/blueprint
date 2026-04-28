"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SphereCanvas from "./SphereCanvas";

// ── Genre palette — matches world/page.tsx ────────────────────────────────────
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

interface Props {
  /** Display name shown in the card header. */
  name: string;
  /** If true, fetches real data from /api/world and shows the Explore link. */
  isSurya?: boolean;
  /**
   * Offsets the initial sphere rotation so each card looks distinct at mount.
   * Accepts a value in radians; different seeds give different initial orientations.
   */
  rotSeed?: number;
}

export default function WorldCard({ name, isSurya = false, rotSeed = 0 }: Props) {
  const [worlds, setWorlds] = useState<Record<string, number> | null>(null);

  // Fetch real genre data only for the Surya card
  useEffect(() => {
    if (!isSurya) return;
    fetch("/api/world")
      .then(r => r.json())
      .then((d: Record<string, number>) => setWorlds(d))
      .catch(() => {});
  }, [isSurya]);

  const totalTracks = worlds
    ? Object.values(worlds).reduce((s, c) => s + c, 0)
    : null;

  // Top genre for the subtle colour accent on Surya's card
  const topGenre = worlds
    ? Object.entries(worlds).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    : null;
  const accentColor = topGenre ? (COLORS[topGenre] ?? "rgba(255,255,255,0.12)") : "rgba(255,255,255,0.08)";

  return (
    <div
      style={{
        borderRadius:  20,
        border:        `1px solid rgba(255,255,255,${isSurya ? 0.10 : 0.05})`,
        background:    "rgba(255,255,255,0.015)",
        overflow:      "hidden",
        display:       "flex",
        flexDirection: "column",
        height:        380,
        opacity:       isSurya ? 1 : 0.45,
        position:      "relative",
        // Subtle top accent stripe — coloured for Surya, neutral for placeholders
        boxShadow:     isSurya
          ? `inset 0 1px 0 ${accentColor}`
          : "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* ── Card header ───────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink:  0,
          padding:     "15px 18px 0",
          display:     "flex",
          alignItems:  "center",
          justifyContent: "space-between",
          zIndex:      2,
        }}
      >
        <p style={{
          margin:        0,
          fontSize:      12,
          fontWeight:    600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color:         isSurya ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)",
        }}>
          {name}
        </p>

        {/* Small track-count badge — Surya only */}
        {isSurya && totalTracks !== null && (
          <span style={{
            fontSize:      11,
            color:         "rgba(255,255,255,0.22)",
            letterSpacing: "0.01em",
          }}>
            {totalTracks.toLocaleString()} tracks
          </span>
        )}
      </div>

      {/* ── Sphere ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        <SphereCanvas
          className="absolute inset-0 w-full h-full"
          interactive={false}
          showLabels={false}
          rotSpeed={isSurya ? 0.0020 : 0.0015}
          initialRotX={0.28 + rotSeed * 0.12}
          initialRotY={rotSeed * 1.4}
        />

        {/* ── Placeholder overlay (roommates) ───────────────────────────── */}
        {!isSurya && (
          <div style={{
            position:       "absolute",
            inset:          0,
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            padding:        "0 32px",
            // Subtle radial vignette so text reads over the sphere
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 72%)",
          }}>
            <p style={{
              margin:      0,
              fontSize:    13,
              color:       "rgba(255,255,255,0.28)",
              textAlign:   "center",
              lineHeight:  1.65,
            }}>
              Connect Spotify to build this world.
            </p>
          </div>
        )}
      </div>

      {/* ── Footer strip — Surya only ──────────────────────────────────── */}
      {isSurya && (
        <div style={{
          flexShrink:      0,
          padding:         "9px 18px 13px",
          borderTop:       "1px solid rgba(255,255,255,0.05)",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "space-between",
        }}>
          {/* Top genres colour dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {worlds && Object.entries(worlds)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([genre]) => (
                <div
                  key={genre}
                  title={genre}
                  style={{
                    width:        6,
                    height:       6,
                    borderRadius: "50%",
                    background:   COLORS[genre] ?? "#71717a",
                    opacity:      0.70,
                    flexShrink:   0,
                  }}
                />
              ))}
          </div>

          <Link
            href="/world"
            style={{
              fontSize:       12,
              color:          "rgba(255,255,255,0.40)",
              textDecoration: "none",
              letterSpacing:  "0.02em",
              transition:     "color 0.18s ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.40)")}
          >
            Explore →
          </Link>
        </div>
      )}
    </div>
  );
}

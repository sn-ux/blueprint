"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
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
  /**
   * If true: fetches real genre data from /api/world, makes the full card a
   * link to /world, and shows the track-count + genre-dot footer strip.
   */
  isSurya?: boolean;
  /**
   * Offsets each sphere's initial rotation so the four cards look distinct.
   * Value in radians; each card gets a different seed (0, 1, 2, 3).
   */
  rotSeed?: number;
}

// ── Surya card ────────────────────────────────────────────────────────────────
// The entire card is a <Link> that navigates to /world.  Hover state drives a
// subtle border + shadow lift so it reads as interactive without being flashy.

function SuryaCard({ name, rotSeed = 0 }: { name: string; rotSeed: number }) {
  const [worlds,  setWorlds]  = useState<Record<string, number> | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    fetch("/api/world")
      .then(r => r.json())
      .then((d: Record<string, number>) => setWorlds(d))
      .catch(() => {});
  }, []);

  const totalTracks = worlds
    ? Object.values(worlds).reduce((s, c) => s + c, 0)
    : null;

  const topGenre = worlds
    ? (Object.entries(worlds).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
    : null;
  const accentHex   = topGenre ? (COLORS[topGenre] ?? "#ffffff") : "#ffffff";
  // Box-shadow accent fades on hover to reinforce the lift
  const accentShadow = hovered
    ? `inset 0 1px 0 ${accentHex}55, 0 8px 28px rgba(0,0,0,0.35)`
    : `inset 0 1px 0 ${accentHex}33`;

  return (
    <Link
      href="/world"
      style={{ textDecoration: "none", display: "block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          borderRadius:  20,
          border:        `1px solid rgba(255,255,255,${hovered ? 0.18 : 0.10})`,
          background:    "rgba(255,255,255,0.015)",
          overflow:      "hidden",
          display:       "flex",
          flexDirection: "column",
          height:        380,
          cursor:        "pointer",
          boxShadow:     accentShadow,
          transform:     hovered ? "translateY(-2px)" : "translateY(0)",
          transition:    "border-color 0.18s ease, box-shadow 0.22s ease, transform 0.18s ease",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{
          flexShrink:     0,
          padding:        "15px 18px 0",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
        }}>
          <p style={{
            margin:        0,
            fontSize:      12,
            fontWeight:    600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color:         "rgba(255,255,255,0.55)",
          }}>
            {name}
          </p>
          {totalTracks !== null && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", letterSpacing: "0.01em" }}>
              {totalTracks.toLocaleString()} tracks
            </span>
          )}
        </div>

        {/* ── Sphere — auto-rotating, decorative ──────────────────────── */}
        <div style={{ flex: 1, position: "relative" }}>
          <SphereCanvas
            className="absolute inset-0 w-full h-full"
            interactive={false}
            showLabels={false}
            rotSpeed={0.0020}
            initialRotX={0.28 + rotSeed * 0.12}
            initialRotY={rotSeed * 1.4}
          />

          {/* Hover overlay: subtle "Explore" hint that fades in on hover */}
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
              color:         "rgba(255,255,255,0.70)",
              background:    "rgba(0,0,0,0.55)",
              padding:       "7px 16px",
              borderRadius:  20,
              backdropFilter:"blur(4px)",
            }}>
              Open World →
            </span>
          </div>
        </div>

        {/* ── Footer strip: genre dots + "Explore" label ──────────────── */}
        <div style={{
          flexShrink:     0,
          padding:        "9px 18px 13px",
          borderTop:      "1px solid rgba(255,255,255,0.05)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
        }}>
          {/* Top-4 genre colour dots */}
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
                    opacity:      hovered ? 0.90 : 0.60,
                    flexShrink:   0,
                    transition:   "opacity 0.18s ease",
                  }}
                />
              ))}
          </div>
          <span style={{
            fontSize:      12,
            color:         `rgba(255,255,255,${hovered ? 0.70 : 0.30})`,
            letterSpacing: "0.02em",
            transition:    "color 0.18s ease",
          }}>
            Explore →
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Roommate placeholder card ─────────────────────────────────────────────────
// Shows the auto-rotating sphere (dimmed) and a real "Connect Spotify" button
// that triggers the NextAuth Spotify OAuth flow.  callbackUrl returns the user
// to /midvale after they authenticate so they land back in context.

function RoommateCard({ name, rotSeed = 0 }: { name: string; rotSeed: number }) {
  const [connecting, setConnecting] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleConnect = async () => {
    setConnecting(true);
    // signIn starts the real Spotify OAuth flow via NextAuth.
    // PrismaAdapter will create a new User + Account row on first sign-in,
    // or find the existing User if this Spotify account has connected before.
    await signIn("spotify", { callbackUrl: "/midvale" });
    // signIn redirects away, so the line below only runs if it somehow resolves.
    setConnecting(false);
  };

  return (
    <div
      style={{
        borderRadius:  20,
        border:        "1px solid rgba(255,255,255,0.05)",
        background:    "rgba(255,255,255,0.010)",
        overflow:      "hidden",
        display:       "flex",
        flexDirection: "column",
        height:        380,
        opacity:       0.50,
        boxShadow:     "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "15px 18px 0" }}>
        <p style={{
          margin:        0,
          fontSize:      12,
          fontWeight:    600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color:         "rgba(255,255,255,0.22)",
        }}>
          {name}
        </p>
      </div>

      {/* ── Sphere — slow, dimmed ────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        <SphereCanvas
          className="absolute inset-0 w-full h-full"
          interactive={false}
          showLabels={false}
          rotSpeed={0.0014}
          initialRotX={0.28 + rotSeed * 0.12}
          initialRotY={rotSeed * 1.4}
        />

        {/* Overlay: radial vignette + Connect button */}
        <div style={{
          position:       "absolute",
          inset:          0,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            14,
          padding:        "0 28px",
          background:     "radial-gradient(ellipse at center, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 72%)",
        }}>
          <button
            ref={btnRef}
            onClick={handleConnect}
            disabled={connecting}
            style={{
              padding:       "9px 20px",
              background:    "rgba(255,255,255,0.06)",
              border:        "1px solid rgba(255,255,255,0.14)",
              borderRadius:  10,
              color:         "rgba(255,255,255,0.70)",
              fontSize:      13,
              fontFamily:    "inherit",
              fontWeight:    500,
              letterSpacing: "0.01em",
              cursor:        connecting ? "default" : "pointer",
              opacity:       connecting ? 0.50 : 1,
              transition:    "background 0.18s ease, border-color 0.18s ease, color 0.18s ease",
            }}
            onMouseEnter={e => {
              if (connecting) return;
              e.currentTarget.style.background    = "rgba(255,255,255,0.11)";
              e.currentTarget.style.borderColor   = "rgba(255,255,255,0.26)";
              e.currentTarget.style.color         = "rgba(255,255,255,0.92)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background    = "rgba(255,255,255,0.06)";
              e.currentTarget.style.borderColor   = "rgba(255,255,255,0.14)";
              e.currentTarget.style.color         = "rgba(255,255,255,0.70)";
            }}
          >
            {connecting ? "Connecting…" : "Connect Spotify"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Public export — routes to the correct card variant ───────────────────────

export default function WorldCard({ name, isSurya = false, rotSeed = 0 }: Props) {
  if (isSurya) return <SuryaCard name={name} rotSeed={rotSeed} />;
  return <RoommateCard name={name} rotSeed={rotSeed} />;
}

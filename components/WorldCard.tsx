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

interface Props {
  /** Display name shown in the card header. */
  name: string;
  /**
   * The userId this card represents.  When provided the card fetches real genre
   * data from /api/world?userId=<id> and, together with hasWorld=true, renders
   * the full interactive FullWorldCard variant.
   */
  userId?: string | null;
  /**
   * Where clicking the card should navigate.  Defaults to "/world" when
   * userId is not provided (legacy Surya behaviour preserved).
   */
  worldHref?: string;
  /**
   * True when this user has already imported their library.  Controls whether
   * a FullWorldCard or a RoommateCard (placeholder) is rendered.
   */
  hasWorld?: boolean;
  /**
   * Offsets each sphere's initial rotation so the four cards look distinct.
   * Value in radians; each card gets a different seed (0, 1, 2, 3).
   */
  rotSeed?: number;
}

// ── FullWorldCard — any user who has an imported library ──────────────────────
// The entire card is a <Link> that navigates to worldHref.

function FullWorldCard({
  name,
  userId,
  worldHref,
  rotSeed = 0,
}: {
  name: string;
  userId: string;
  worldHref: string;
  rotSeed: number;
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

  const topGenre    = worlds
    ? (Object.entries(worlds).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
    : null;
  const accentHex   = topGenre ? (COLORS[topGenre] ?? "#ffffff") : "#ffffff";
  const accentShadow = hovered
    ? `inset 0 1px 0 ${accentHex}55, 0 8px 28px rgba(0,0,0,0.35)`
    : `inset 0 1px 0 ${accentHex}33`;

  return (
    <Link
      href={worldHref}
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
        {/* ── Header ──────────────────────────────────────────────────────── */}
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

        {/* ── Sphere ──────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: "relative" }}>
          <SphereCanvas
            className="absolute inset-0 w-full h-full"
            interactive={false}
            showLabels={false}
            rotSpeed={0.0020}
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

        {/* ── Footer strip ────────────────────────────────────────────────── */}
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

// ── RoommateCard — placeholder for users who have not yet connected ────────────
// Shows the auto-rotating sphere (dimmed) and a "Connect Spotify" button that
// starts the NextAuth Spotify OAuth flow.  callbackUrl includes ?import=1 so
// that MidvaleAutoImport can trigger the library import automatically on return.

function RoommateCard({ name, rotSeed = 0 }: { name: string; rotSeed: number }) {
  const [connecting, setConnecting] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleConnect = async () => {
    setConnecting(true);

    // ── Clear any existing session first ─────────────────────────────────────
    // If Surya (or anyone) is currently logged in, their session must be ended
    // before we start the new OAuth.  Without this, NextAuth may receive the
    // callback and find an existing user that matches Spotify's silent re-auth,
    // leaving the browser in Surya's session instead of the new roommate's.
    // redirect: false keeps us on the page; signIn below immediately redirects.
    await signOut({ redirect: false });

    // ── Start Spotify OAuth with forced account chooser ───────────────────────
    // The third argument passes extra params to Spotify's authorization URL.
    // show_dialog=true forces Spotify to always present the account/permission
    // dialog, even when the user is already logged into Spotify in the browser.
    // This lets the roommate pick THEIR account instead of silently reusing
    // whatever Spotify session is active.
    //
    // callbackUrl includes ?import=1 so MidvaleAutoImport fires on return.
    await signIn(
      "spotify",
      { callbackUrl: "/midvale?import=1" },
      { show_dialog: "true" },
    );

    // signIn redirects; this line only runs if the redirect somehow resolves.
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
      {/* ── Header ──────────────────────────────────────────────────────────── */}
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

      {/* ── Sphere — slow, dimmed ────────────────────────────────────────────── */}
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
              e.currentTarget.style.background  = "rgba(255,255,255,0.11)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.26)";
              e.currentTarget.style.color       = "rgba(255,255,255,0.92)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background  = "rgba(255,255,255,0.06)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
              e.currentTarget.style.color       = "rgba(255,255,255,0.70)";
            }}
          >
            {connecting ? "Connecting…" : "Connect Spotify"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────
// Routes to the correct card variant:
//   • userId + hasWorld → FullWorldCard  (real genre data, clickable)
//   • otherwise          → RoommateCard  (placeholder, Connect Spotify button)

export default function WorldCard({
  name,
  userId,
  worldHref,
  hasWorld = false,
  rotSeed  = 0,
}: Props) {
  if (userId && hasWorld) {
    return (
      <FullWorldCard
        name={name}
        userId={userId}
        worldHref={worldHref ?? `/midvale/${userId}`}
        rotSeed={rotSeed}
      />
    );
  }
  return <RoommateCard name={name} rotSeed={rotSeed} />;
}

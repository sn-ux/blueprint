"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import SphereCanvas from "./SphereCanvas";

// ── WorldGalleryTile — user with an imported library ─────────────────────────
// Layout: sphere (square, centered in column) + centered text below.
// Both desktop and mobile use the same column stack.
// Sphere is constrained to max 240 px so it stays clearly secondary to
// the Friends sphere above (420–480 px on desktop).

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
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          cursor:         "pointer",
          transform:      hovered ? "translateY(-2px)" : "translateY(0)",
          transition:     "transform 0.18s ease",
        }}
      >
        {/* ── Sphere — fills column width up to 240 px, then centers ────── */}
        <div style={{
          position:     "relative",
          width:        "100%",
          maxWidth:     240,
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

        {/* ── Info — centered below sphere ────────────────────────────────── */}
        <div style={{ width: "100%", maxWidth: 240, textAlign: "center" }}>
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
              margin:        0,
              fontSize:      11,
              color:         "rgba(255,255,255,0.36)",
              letterSpacing: "0.01em",
            }}>
              {totalTracks.toLocaleString()} tracks
            </p>
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
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        opacity:       0.40,
      }}
    >
      {/* ── Sphere — same sizing as WorldGalleryTile ──────────────────────── */}
      <div style={{
        position:     "relative",
        width:        "100%",
        maxWidth:     240,
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
        {/* Connect Spotify overlay */}
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
              padding:       "6px 13px",
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

      {/* ── Name — centered ───────────────────────────────────────────────── */}
      <p style={{
        margin:        0,
        maxWidth:      240,
        fontSize:      14,
        fontWeight:    600,
        letterSpacing: "-0.01em",
        color:         "rgba(255,255,255,0.40)",
        lineHeight:    1.25,
        textAlign:     "center",
      }}>
        {name}
      </p>
    </div>
  );
}

// ── FriendsWorldCard — combined world at the top of the Friends page ──────────
// Always stacked (sphere above, text below), centered horizontally.
// Sphere: full-width on mobile, fixed sizes on sm/lg/xl.
// Text: center-aligned, constrained to sphere width.

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
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          cursor:        "pointer",
          transform:     hovered ? "translateY(-3px)" : "translateY(0)",
          transition:    "transform 0.18s ease",
        }}
      >
        {/* ── Sphere
            Mobile : full-width of the content column (bounded by px-6 global).
            sm     : 320 × 320 px, centered.
            lg     : 420 × 420 px, centered.
            xl     : 480 × 480 px, centered.                            ── */}
        <div
          className="relative w-full sm:w-[320px] sm:h-[320px] lg:w-[420px] lg:h-[420px] xl:w-[480px] xl:h-[480px]"
          style={{
            aspectRatio:  "1 / 1",
            borderRadius: 22,
            overflow:     "hidden",
            marginBottom: 20,
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

        {/* ── Info — centered below sphere, width matches sphere ────────── */}
        <div
          className="w-full sm:w-[320px] lg:w-[420px] xl:w-[480px]"
          style={{ textAlign: "center" }}
        >
          <p style={{
            margin:        "0 0 6px",
            fontSize:      "clamp(24px, 4vw, 40px)",
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
              fontSize:      "clamp(12px, 1.3vw, 14px)",
              color:         "rgba(255,255,255,0.36)",
              letterSpacing: "0.01em",
            }}>
              {totalTracks.toLocaleString()} tracks
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── WorldCard — public default export ────────────────────────────────────────
// Routes to WorldGalleryTile (has world) or EmptyGallerySlot (no world yet).

interface Props {
  name:       string;
  userId?:    string | null;
  worldHref?: string;
  hasWorld?:  boolean;
  rotSeed?:   number;
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

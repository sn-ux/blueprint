"use client";

import Link from "next/link";

// ── Inline Seed-of-Life logo ──────────────────────────────────────────────────
// Using an inline SVG with overflow="visible" is the only way to guarantee the
// strokes never get clipped: <img> always clips to its own box, but an inline
// SVG can bleed slightly past its layout dimensions without any parent cutting
// it off. The geometry occupies ~36×36 px of layout space and `overflow="visible"`
// lets the outer stroke edges render into the surrounding padding unobstructed.

function SeedOfLife({ size = 36 }: { size?: number }) {
  const r  = 21;    // circle radius (in 0-100 viewBox space)
  const sw = 3.8;   // stroke width
  const cx = 50, cy = 50;

  // 6 outer circles — Seed-of-Life condition: centre distance = r
  // Rotated 15° clockwise from the canonical top-pointing orientation
  // so the first outer circle sits at 75° (upper-right), matching the logo.
  const outerCentres = [75, 15, -45, -105, -165, 135].map(deg => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      // overflow="visible" lets strokes that approach the viewBox edge render
      // fully instead of being clipped to the SVG's bounding box.
      overflow="visible"
      style={{ display: "block", flexShrink: 0, transform: "scaleX(-1)" }}
      aria-hidden="true"
    >
      <circle cx={cx} cy={cy} r={r} stroke="white" strokeWidth={sw} />
      {outerCentres.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={r} stroke="white" strokeWidth={sw} />
      ))}
    </svg>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────

export default function Navbar() {
  return (
    <nav
      aria-label="Main navigation"
      style={{
        position:             "fixed",
        top:                  0,
        left:                 0,
        right:                0,
        zIndex:               200,
        height:               56,
        display:              "flex",
        alignItems:           "center",
        justifyContent:       "space-between",
        // clamp() keeps padding generous on desktop but readable on iPhone
        paddingLeft:          "clamp(20px, 5vw, 56px)",
        paddingRight:         "clamp(20px, 5vw, 64px)",
        background:           "rgba(0,0,0,0.38)",
        backdropFilter:       "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom:         "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* ── LEFT: logo + wordmark ────────────────────────────────────────── */}
      <Link
        href="/"
        onClick={() => window.dispatchEvent(new Event("blueprint-reset"))}
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            10,
          textDecoration: "none",
          flexShrink:     0,
        }}
      >
        <SeedOfLife size={36} />
        <span
          style={{
            color:         "#ffffff",
            fontSize:      15,
            fontWeight:    600,
            letterSpacing: "-0.01em",
            lineHeight:    1,
            userSelect:    "none",
          }}
        >
          Blueprint
        </span>
      </Link>

      {/* ── RIGHT: nav links ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        {[
          { label: "Philosophy", href: "/philosophy" },
          { label: "Connect",    href: "/connect" },
        ].map(({ label, href }) => (
          <Link
            key={label}
            href={href}
            style={{
              color:          "rgba(255,255,255,0.82)",
              fontSize:       14,
              fontWeight:     400,
              letterSpacing:  "0.01em",
              textDecoration: "none",
              transition:     "opacity 0.18s ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "")}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

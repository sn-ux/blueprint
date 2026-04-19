"use client";

import Link from "next/link";

// ── Seed-of-Life logo ─────────────────────────────────────────────────────────
// Seven equal circles: one centre + six outer circles whose centres sit exactly
// one radius away from the centre (at 60° intervals, starting at the top).
// Rendered as a pure SVG so no image file is needed and it scales perfectly.

function SeedOfLifeLogo({ size = 30 }: { size?: number }) {
  const r  = 21;   // circle radius in the 0–100 viewBox
  const cx = 50, cy = 50;
  const sw = 3.8;  // stroke width

  // 6 outer circle centres at 60° steps, first one pointing straight up (90°)
  const outerCentres = [90, 30, -30, -90, -150, 150].map(deg => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="4 4 92 92"
      fill="none"
      aria-hidden="true"
    >
      {/* centre circle */}
      <circle cx={cx} cy={cy} r={r} stroke="white" strokeWidth={sw} />
      {/* 6 outer circles */}
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
        position:            "fixed",
        top:                 0,
        left:                0,
        right:               0,
        zIndex:              200,
        height:              56,
        display:             "flex",
        alignItems:          "center",
        justifyContent:      "space-between",
        // Full-bleed padding mirrors the page's horizontal rhythm
        paddingLeft:         "clamp(24px, 5vw, 96px)",
        paddingRight:        "clamp(24px, 5vw, 96px)",
        // Almost-invisible bar — just enough to keep text readable over content
        background:          "rgba(0,0,0,0.38)",
        backdropFilter:      "blur(12px)",
        WebkitBackdropFilter:"blur(12px)",
        borderBottom:        "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* ── LEFT: logo + wordmark ── */}
      <Link
        href="/"
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:         10,
          textDecoration: "none",
          flexShrink:  0,
        }}
      >
        <SeedOfLifeLogo size={26} />
        <span
          style={{
            color:          "#ffffff",
            fontSize:       15,
            fontWeight:     600,
            letterSpacing:  "-0.01em",
            lineHeight:     1,
            userSelect:     "none",
          }}
        >
          Blueprint
        </span>
      </Link>

      {/* ── RIGHT: nav links ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        {[
          { label: "Philosophy", href: "#" },
          { label: "Connect",    href: "#" },
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

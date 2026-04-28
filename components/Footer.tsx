"use client";

import Link from "next/link";

// ── Seed-of-Life mark ─────────────────────────────────────────────────────────
// Identical geometry to the Navbar version (same viewBox, same angle offsets,
// same scaleX(-1) flip) — just rendered at a smaller size for the footer.

function SeedOfLife({ size = 28 }: { size?: number }) {
  const r = 21, sw = 3.8, cx = 50, cy = 50;
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

// ── Footer ────────────────────────────────────────────────────────────────────
// Uses the same full-bleed escape hatch as other sections (width: 100vw +
// negative margin) so it spans the full viewport regardless of the px-6
// padded layout container in layout.tsx.

export default function Footer() {
  return (
    <footer
      aria-label="Site footer"
      style={{
        width:          "100vw",
        marginLeft:     "calc(50% - 50vw)",
        borderTop:      "1px solid rgba(255,255,255,0.07)",
        padding:        "64px 24px 56px",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <Link
        href="/"
        aria-label="Blueprint homepage"
        style={{ display: "block", lineHeight: 0 }}
      >
        <SeedOfLife size={28} />
      </Link>

      {/* ── Address block ────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, textAlign: "center" }}>
        {/* © line — slightly more prominent than the address */}
        <p style={{
          margin:        "0 0 12px",
          fontSize:      13,
          fontWeight:    500,
          letterSpacing: "0.01em",
          color:         "rgba(255,255,255,0.72)",
        }}>
          © Blueprint Inc.
        </p>

        {/* Address — muted, stacked exactly as specified */}
        <p style={{
          margin:        0,
          fontSize:      12,
          fontWeight:    400,
          letterSpacing: "0.01em",
          lineHeight:    1.9,
          color:         "rgba(255,255,255,0.28)",
        }}>
          Menlo Park, CA
        </p>
      </div>

      {/* ── Navigation row ───────────────────────────────────────────────── */}
      <nav
        aria-label="Footer navigation"
        style={{
          marginTop:  40,
          display:    "flex",
          alignItems: "center",
          gap:        36,
          flexWrap:   "wrap",      // prevents overflow on very narrow screens
          justifyContent: "center",
        }}
      >
        {[
          { label: "Blueprint",  href: "/"            },
          { label: "Philosophy", href: "/philosophy"  },
          { label: "Connect",    href: "/connect"     },
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
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.5")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "")}
          >
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

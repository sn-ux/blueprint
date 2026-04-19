"use client";

import Link  from "next/link";
import Image from "next/image";

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
        // Small intentional margin on both sides, visually balanced
        paddingLeft:          28,
        paddingRight:         28,
        background:           "rgba(0,0,0,0.38)",
        backdropFilter:       "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom:         "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* ── LEFT: logo + wordmark ────────────────────────────────────────── */}
      <Link
        href="/"
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            10,
          textDecoration: "none",
          flexShrink:     0,
        }}
      >
        {/* SVG has a transparent background — white circles render cleanly
            over the dark nav with no blending tricks needed. */}
        <Image
          src="/logo.svg"
          alt="Blueprint logo"
          width={30}
          height={30}
          style={{ display: "block" }}
          priority
        />
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

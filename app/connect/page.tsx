"use client";

import React, { useRef, useState } from "react";

// ── Scroll-reveal ─────────────────────────────────────────────────────────────

function useInView(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const { ref, inView } = useInView(0.04);
  return (
    <div
      ref={ref}
      style={{
        opacity:    inView ? 1 : 0,
        transform:  inView ? "none" : "translateY(14px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConnectPage() {
  const [message, setMessage] = useState("");
  const [sent, setSent]       = useState(false);

  const handleSend = () => {
    const body = message.trim();
    const href = body
      ? `mailto:suryanathan@icloud.com?subject=Blueprint%20Inquiry&body=${encodeURIComponent(body)}`
      : "mailto:suryanathan@icloud.com?subject=Blueprint%20Inquiry";
    window.location.href = href;
    setSent(true);
    setTimeout(() => setSent(false), 2400);
  };

  return (
    <main
      style={{
        minHeight:      "100vh",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "96px 0 80px",
      }}
    >
      <div
        style={{
          width:    "100%",
          maxWidth: 520,
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <FadeIn delay={0}>
          <h1
            style={{
              fontSize:      "clamp(32px, 5vw, 48px)",
              fontWeight:    700,
              letterSpacing: "-0.03em",
              color:         "#ffffff",
              lineHeight:    1.1,
              margin:        0,
            }}
          >
            Connect
          </h1>
        </FadeIn>

        <FadeIn delay={80}>
          <p
            style={{
              marginTop:     10,
              marginBottom:  0,
              fontSize:      14,
              fontWeight:    400,
              letterSpacing: "0.01em",
              color:         "rgba(255,255,255,0.38)",
              lineHeight:    1.5,
            }}
          >
            Reach out directly.
          </p>
        </FadeIn>

        {/* ── Message box ────────────────────────────────────────────────── */}
        <FadeIn delay={160}>
          <div style={{ marginTop: 40 }}>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write your message…"
              rows={7}
              style={{
                width:            "100%",
                boxSizing:        "border-box",
                background:       "rgba(255,255,255,0.04)",
                border:           "1px solid rgba(255,255,255,0.10)",
                borderRadius:     14,
                padding:          "18px 20px",
                fontSize:         15,
                fontFamily:       "inherit",
                fontWeight:       400,
                color:            "#ffffff",
                lineHeight:       1.65,
                resize:           "none",
                outline:          "none",
                transition:       "border-color 0.2s ease, box-shadow 0.2s ease",
                caretColor:       "#ffffff",
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)";
                e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(255,255,255,0.04)";
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                e.currentTarget.style.boxShadow   = "none";
              }}
            />
          </div>
        </FadeIn>

        {/* ── Send button ────────────────────────────────────────────────── */}
        <FadeIn delay={240}>
          <div style={{ marginTop: 14 }}>
            <button
              onClick={handleSend}
              style={{
                width:          "100%",
                height:         50,
                background:     sent ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.07)",
                border:         "1px solid rgba(255,255,255,0.12)",
                borderRadius:   14,
                color:          sent ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.88)",
                fontSize:       15,
                fontFamily:     "inherit",
                fontWeight:     500,
                letterSpacing:  "0.01em",
                cursor:         "pointer",
                transition:     "background 0.2s ease, color 0.2s ease, border-color 0.2s ease",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            8,
              }}
              onMouseEnter={e => {
                if (!sent) {
                  e.currentTarget.style.background    = "rgba(255,255,255,0.11)";
                  e.currentTarget.style.borderColor   = "rgba(255,255,255,0.22)";
                }
              }}
              onMouseLeave={e => {
                if (!sent) {
                  e.currentTarget.style.background    = "rgba(255,255,255,0.07)";
                  e.currentTarget.style.borderColor   = "rgba(255,255,255,0.12)";
                }
              }}
            >
              {sent ? "Opening mail client…" : "Send"}
            </button>
          </div>
        </FadeIn>

        {/* ── Footer note ────────────────────────────────────────────────── */}
        <FadeIn delay={320}>
          <p
            style={{
              marginTop:     20,
              fontSize:      12,
              color:         "rgba(255,255,255,0.18)",
              textAlign:     "center",
              letterSpacing: "0.01em",
              lineHeight:    1.5,
            }}
          >
            Opens your default mail client.
          </p>
        </FadeIn>
      </div>
    </main>
  );
}

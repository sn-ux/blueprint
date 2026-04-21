"use client";

import { useEffect, useRef, useState } from "react";

// ── Scroll-reveal hook ─────────────────────────────────────────────────────
// Returns a ref + inView boolean. Once the element crosses the threshold it
// fires once and disconnects — elements never un-reveal on scroll back up.

function useInView(threshold = 0.15) {
  const ref  = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
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

// ── Reusable fade-in wrapper ───────────────────────────────────────────────
// Each instance owns its own IntersectionObserver — safe to use in .map().

function FadeIn({
  children, delay = 0, className, style,
}: {
  children: React.ReactNode;
  delay?:   number;
  className?: string;
  style?:   React.CSSProperties;
}) {
  const { ref, inView } = useInView(0.15);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity:    inView ? 1 : 0,
        transform:  inView ? "none" : "translateY(16px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Full-bleed helper ──────────────────────────────────────────────────────
// Breaks out of the layout's max-width rail so sections span the viewport.

const FB: React.CSSProperties = {
  width:      "100vw",
  marginLeft: "calc(50% - 50vw)",
};

// ── Philosopher data ───────────────────────────────────────────────────────

const PHILOSOPHERS = [
  {
    name:  "Plato",
    claim: "Knowledge is recollection.",
    note:  "You can only recognize what your soul already knew — discovery is remembering, not learning.",
  },
  {
    name:  "Aristotle",
    claim: "Begin with what is familiar.",
    note:  "Learning moves from the known to the unknown — but still needs a foothold to start.",
  },
  {
    name:  "Al-Farabi",
    claim: "The intellect must be prepared.",
    note:  "You cannot receive knowledge until your mind has been shaped to accept it.",
  },
  {
    name:  "Avicenna",
    claim: "Intuition bridges the gap.",
    note:  "Sudden illumination exists — but only for those already standing at the threshold.",
  },
  {
    name:  "Averroes",
    claim: "Understanding requires community.",
    note:  "No individual mind reaches truth alone — it needs the accumulated intellect of others.",
  },
  {
    name:  "Kant",
    claim: "The mind structures what it can see.",
    note:  "We only encounter what our categories allow — unknowns remain outside the frame.",
  },
  {
    name:  "Wittgenstein",
    claim: "The limits of language are the limits of the world.",
    note:  "If you lack the words for something, you cannot think — let alone search — for it.",
  },
  {
    name:  "Gadamer",
    claim: "Understanding requires a horizon.",
    note:  "What you can discover depends entirely on where you are standing when you look.",
  },
  {
    name:  "Foucault",
    claim: "Knowledge is shaped by power.",
    note:  "What gets surfaced, indexed, and recommended is never neutral.",
  },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────

export default function PhilosophyPage() {

  // ── Section 1: phased reveal of question → attribution → dialogue ────────
  const { ref: s1Ref, inView: s1InView } = useInView(0.05);
  const [s1Phase, setS1Phase] = useState(0);

  useEffect(() => {
    if (!s1InView) return;
    setS1Phase(1);
    const t1 = setTimeout(() => setS1Phase(2), 1100);
    const t2 = setTimeout(() => setS1Phase(3), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [s1InView]);

  // ── Section 4: two-phase equation animation ──────────────────────────────
  // Phase 0 → hidden  |  Phase 1 → first equation  |  Phase 2 → transformed
  const { ref: eqRef, inView: eqInView } = useInView(0.25);
  const [eqPhase, setEqPhase] = useState(0);

  useEffect(() => {
    if (!eqInView) return;
    const t1 = setTimeout(() => setEqPhase(1), 300);
    const t2 = setTimeout(() => setEqPhase(2), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [eqInView]);

  // ── Derived styles ────────────────────────────────────────────────────────

  // Per-line enter style for equation — staggered translateY + opacity
  const eqLineEnter = (delay: number): React.CSSProperties => ({
    opacity:    eqPhase >= 1 ? 1 : 0,
    transform:  eqPhase >= 1 ? "none" : "translateY(12px)",
    transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
  });

  return (
    <div className="bg-black text-white" style={{ overflowX: "hidden" }}>

      {/* ══ SECTION 1 — The Problem ══════════════════════════════════════════ */}
      <section
        ref={s1Ref}
        style={{
          ...FB,
          minHeight:      "100vh",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          textAlign:      "center",
          padding:        "120px 24px 80px",
          position:       "relative",
        }}
      >
        {/* Question */}
        <h1
          style={{
            fontSize:      "clamp(26px, 3.8vw, 52px)",
            fontWeight:    600,
            lineHeight:    1.1,
            letterSpacing: "-0.02em",
            color:         "#ffffff",
            maxWidth:      780,
            opacity:       s1Phase >= 1 ? 1 : 0,
            transform:     s1Phase >= 1 ? "none" : "translateY(22px)",
            transition:    "opacity 1s ease, transform 1s ease",
          }}
        >
          How do you find what you don&apos;t know to look for?
        </h1>

        {/* Attribution */}
        <p
          style={{
            marginTop:     36,
            fontSize:      11,
            fontWeight:    600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         "rgba(255,255,255,0.28)",
            opacity:       s1Phase >= 2 ? 1 : 0,
            transform:     s1Phase >= 2 ? "none" : "translateY(8px)",
            transition:    "opacity 0.7s ease, transform 0.7s ease",
          }}
        >
          Meno&apos;s Paradox — 385&nbsp;BC
        </p>

        {/* Dialogue */}
        <div
          style={{
            marginTop:  52,
            maxWidth:   540,
            opacity:    s1Phase >= 3 ? 1 : 0,
            transform:  s1Phase >= 3 ? "none" : "translateY(8px)",
            transition: "opacity 0.8s ease, transform 0.8s ease",
          }}
        >
          <p
            style={{
              fontSize:   "clamp(15px, 1.8vw, 19px)",
              fontWeight: 400,
              lineHeight: 1.75,
              color:      "rgba(255,255,255,0.50)",
              fontStyle:  "italic",
            }}
          >
            &ldquo;How can you look for something<br />
            when you don&apos;t know what it is?<br />
            And if you happened to find it —<br />
            how would you even recognize it?&rdquo;
          </p>
          <p
            style={{
              marginTop:     14,
              fontSize:      11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color:         "rgba(255,255,255,0.18)",
            }}
          >
            — Meno, to Socrates
          </p>
        </div>

        {/* Scroll cue */}
        <p
          style={{
            position:      "absolute",
            bottom:        28,
            fontSize:      10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         "rgba(255,255,255,0.14)",
            opacity:       s1Phase >= 3 ? 1 : 0,
            transition:    "opacity 1s ease 0.6s",
          }}
        >
          scroll
        </p>
      </section>

      {/* ══ SECTION 2 — 2,400 Years of Attempts ════════════════════════════ */}
      <section
        style={{
          ...FB,
          background: "#000",
          borderTop:  "1px solid rgba(255,255,255,0.04)",
          padding:    "100px 0 120px",
        }}
      >
        {/* Header */}
        <FadeIn style={{ textAlign: "center", marginBottom: 72, padding: "0 24px" }}>
          <p
            style={{
              fontSize:      11,
              fontWeight:    600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color:         "rgba(255,255,255,0.25)",
            }}
          >
            2,400 years of attempts
          </p>
          <h2
            style={{
              marginTop:     16,
              fontSize:      "clamp(26px, 3.2vw, 44px)",
              fontWeight:    600,
              lineHeight:    1.1,
              letterSpacing: "-0.02em",
              color:         "#fff",
            }}
          >
            Every answer raised the same question.
          </h2>
        </FadeIn>

        {/* 3-column philosopher grid — each card has its own IntersectionObserver */}
        <div
          style={{
            display:               "grid",
            gridTemplateColumns:   "repeat(3, 1fr)",
            maxWidth:              1200,
            margin:                "0 auto",
            padding:               "0 24px",
          }}
        >
          {PHILOSOPHERS.map((p, i) => (
            <FadeIn key={p.name} delay={(i % 3) * 90}>
              <div
                style={{
                  padding:     "34px 28px",
                  borderTop:   "1px solid rgba(255,255,255,0.06)",
                  borderLeft:  i % 3 !== 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  height:      "100%",
                }}
              >
                <p
                  style={{
                    fontSize:      10,
                    fontWeight:    600,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color:         "rgba(255,255,255,0.28)",
                    marginBottom:  14,
                  }}
                >
                  {p.name}
                </p>
                <p
                  style={{
                    fontSize:   "clamp(15px, 1.4vw, 18px)",
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color:      "#fff",
                    marginBottom: 12,
                  }}
                >
                  {p.claim}
                </p>
                <p
                  style={{
                    fontSize:   13,
                    fontWeight: 400,
                    lineHeight: 1.6,
                    color:      "rgba(255,255,255,0.42)",
                  }}
                >
                  {p.note}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Closing line */}
        <FadeIn style={{ textAlign: "center", marginTop: 80, padding: "0 24px" }}>
          <p
            style={{
              fontSize:  "clamp(15px, 1.6vw, 20px)",
              fontWeight: 400,
              lineHeight: 1.65,
              color:      "rgba(255,255,255,0.32)",
              maxWidth:   520,
              margin:     "0 auto",
            }}
          >
            None of them solved it.<br />
            They all agreed it was{" "}
            <span style={{ color: "rgba(255,255,255,0.62)" }}>the</span>{" "}
            central problem.
          </p>
        </FadeIn>
      </section>

      {/* ══ SECTION 3 — The Modern Failure ══════════════════════════════════ */}
      <section
        style={{
          ...FB,
          minHeight:      "80vh",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "100px 24px",
          textAlign:      "center",
          borderTop:      "1px solid rgba(255,255,255,0.04)",
          background:     "#000",
        }}
      >
        <FadeIn>
          <h2
            style={{
              fontSize:      "clamp(26px, 3.5vw, 48px)",
              fontWeight:    600,
              lineHeight:    1.1,
              letterSpacing: "-0.02em",
              color:         "#fff",
              maxWidth:      660,
            }}
          >
            We didn&apos;t solve discovery.<br />
            We just made the loop faster.
          </h2>
        </FadeIn>

        {/* SEARCH / FEED — mirrors main page styling */}
        <FadeIn delay={200} style={{ marginTop: 64 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
            {[
              { label: "SEARCH", desc: "shows what you know to look for" },
              { label: "FEED",   desc: "shows what you already engage with" },
            ].map(({ label, desc }) => (
              <p
                key={label}
                style={{
                  display:             "grid",
                  gridTemplateColumns: "6em 2em 1fr",
                  alignItems:          "baseline",
                  fontSize:            "clamp(15px, 1.6vw, 19px)",
                  fontWeight:          400,
                  lineHeight:          1.45,
                  textAlign:           "left",
                }}
              >
                <strong
                  style={{
                    color:       "rgba(255,255,255,0.95)",
                    letterSpacing: "0.08em",
                    fontFamily:  "ui-monospace, monospace",
                  }}
                >
                  {label}
                </strong>
                <span style={{ color: "rgba(255,255,255,0.28)" }}>→</span>
                <span style={{ color: "rgba(255,255,255,0.62)" }}>{desc}</span>
              </p>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={380} style={{ marginTop: 48 }}>
          <p
            style={{
              fontSize:   "clamp(14px, 1.4vw, 17px)",
              fontWeight: 400,
              lineHeight: 1.7,
              color:      "rgba(255,255,255,0.30)",
              maxWidth:   440,
              margin:     "0 auto",
            }}
          >
            Meno&apos;s paradox is still unsolved.<br />
            We&apos;ve only built faster loops.
          </p>
        </FadeIn>
      </section>

      {/* ══ SECTION 4 — The Equation ═════════════════════════════════════════ */}
      <section
        style={{
          ...FB,
          minHeight:      "100vh",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "100px 24px",
          textAlign:      "center",
          borderTop:      "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <FadeIn style={{ marginBottom: 60 }}>
          <p
            style={{
              fontSize:      11,
              fontWeight:    600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color:         "rgba(255,255,255,0.22)",
            }}
          >
            The insight
          </p>
        </FadeIn>

        {/*
          Both equation versions sit in the same grid cell so they cross-fade
          without any layout shift. The container height is determined by
          whichever version is taller (they're identical height by design).
        */}
        <div
          ref={eqRef}
          style={{
            display: "grid",
            width:   "100%",
            maxWidth: 700,
          }}
        >
          {/* ── Equation 1 ── */}
          <div
            style={{
              gridArea:   "1 / 1",
              opacity:    eqPhase === 1 ? 1 : 0,
              transition: "opacity 0.55s ease",
              pointerEvents: eqPhase !== 1 ? "none" : undefined,
            }}
          >
            {[
              { text: "Everything everyone knows",  delay:   0 },
              { text: "− Everything you know",       delay: 260 },
              { text: "= Everything you don't know", delay: 520 },
            ].map(({ text, delay }) => (
              <p
                key={text}
                style={{
                  fontSize:      "clamp(20px, 2.8vw, 38px)",
                  fontWeight:    300,
                  lineHeight:    1.45,
                  letterSpacing: "-0.01em",
                  color:         "#fff",
                  ...eqLineEnter(delay),
                }}
              >
                {text}
              </p>
            ))}
          </div>

          {/* ── Equation 2 (transformed) ── */}
          <div
            style={{
              gridArea:   "1 / 1",
              opacity:    eqPhase >= 2 ? 1 : 0,
              transition: "opacity 0.7s ease 0.35s",
              pointerEvents: eqPhase < 2 ? "none" : undefined,
            }}
          >
            {[
              { text: "Everything everyone searches + saves", delay: 350 },
              { text: "− Everything you search + save",        delay: 500 },
              { text: "≈ Everything you don't know",           delay: 650 },
            ].map(({ text, delay }) => (
              <p
                key={text}
                style={{
                  fontSize:      "clamp(20px, 2.8vw, 38px)",
                  fontWeight:    300,
                  lineHeight:    1.45,
                  letterSpacing: "-0.01em",
                  color:         "#fff",
                  opacity:       eqPhase >= 2 ? 1 : 0,
                  transform:     eqPhase >= 2 ? "none" : "translateY(10px)",
                  transition:    `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
                }}
              >
                {text}
              </p>
            ))}
          </div>
        </div>

        {/* Label that appears after transformation */}
        <FadeIn
          delay={0}
          style={{
            marginTop: 48,
            opacity:   eqPhase >= 2 ? 1 : 0,
            transition: "opacity 0.7s ease 1.1s",
          }}
        >
          <p
            style={{
              fontSize:      11,
              fontWeight:    600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color:         "rgba(255,255,255,0.22)",
            }}
          >
            This is the gap Blueprint maps.
          </p>
        </FadeIn>
      </section>

      {/* ══ SECTION 5 — The Conclusion ══════════════════════════════════════ */}
      <section
        style={{
          ...FB,
          minHeight:      "100vh",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "100px 24px",
          textAlign:      "center",
          borderTop:      "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <FadeIn>
          <h2
            style={{
              fontSize:      "clamp(30px, 4.5vw, 60px)",
              fontWeight:    600,
              lineHeight:    1.07,
              letterSpacing: "-0.02em",
              color:         "#fff",
              maxWidth:      580,
            }}
          >
            Discovery is not searching.<br />
            It&apos;s subtraction.
          </h2>
        </FadeIn>

        <FadeIn delay={220} style={{ marginTop: 52 }}>
          <p
            style={{
              fontSize:   "clamp(17px, 1.9vw, 23px)",
              fontWeight: 400,
              lineHeight: 1.6,
              color:      "rgba(255,255,255,0.62)",
              maxWidth:   460,
            }}
          >
            So we built a system that shows you<br />
            what hasn&apos;t been filtered to you yet.
          </p>
        </FadeIn>

        <FadeIn delay={440} style={{ marginTop: 52 }}>
          <a
            href="/"
            style={{
              display:       "inline-block",
              padding:       "12px 28px",
              fontSize:      12,
              fontWeight:    500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color:         "rgba(255,255,255,0.85)",
              border:        "1px solid rgba(255,255,255,0.16)",
              borderRadius:  2,
              textDecoration: "none",
              transition:    "border-color 0.2s ease, color 0.2s ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.48)";
              e.currentTarget.style.color       = "#fff";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)";
              e.currentTarget.style.color       = "rgba(255,255,255,0.85)";
            }}
          >
            See it →
          </a>
        </FadeIn>
      </section>

    </div>
  );
}

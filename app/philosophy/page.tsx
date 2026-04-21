"use client";

import { useEffect, useRef, useState } from "react";

// ── Scroll-reveal hook ─────────────────────────────────────────────────────
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
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
function FadeIn({
  children, delay = 0, className, style,
}: {
  children: React.ReactNode;
  delay?:   number;
  className?: string;
  style?:   React.CSSProperties;
}) {
  const { ref, inView } = useInView(0.08);
  return (
    <div
      ref={ref}
      className={className}
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

// ── Full-bleed helper ──────────────────────────────────────────────────────
const FB: React.CSSProperties = {
  width:      "100vw",
  marginLeft: "calc(50% - 50vw)",
};

// ── Shared SVG stroke props ────────────────────────────────────────────────
// Typed as a plain object (no ref) so it spreads cleanly onto any SVG element.
const SK = {
  stroke:         "rgba(255,255,255,0.55)",
  strokeWidth:    1.3,
  fill:           "none",
  strokeLinecap:  "round"  as const,
  strokeLinejoin: "round"  as const,
};

// ── Philosopher illustrations ──────────────────────────────────────────────
// Each is a minimal line-art face drawn on a 0 0 48 48 viewBox.
// All share: head circle + shoulder curve. Distinctive feature marks each one.

function PhilosopherIllustration({ id }: { id: string }) {
  // Common base elements
  const Head      = () => <circle cx="24" cy="16" r="9" {...SK} />;
  const Shoulders = () => (
    <path d="M 10 48 C 15 37 20 33 24 32 C 28 33 33 37 38 48" {...SK} />
  );

  const illustrations: Record<string, React.ReactNode> = {

    "socrates-meno": (
      // Large curly beard, snub nose bump — Socrates' signature look
      <>
        <Head /><Shoulders />
        <path d="M 16 22 Q 10 30 13 38 Q 18 44 24 44 Q 30 44 35 38 Q 38 30 32 22" {...SK} />
        <path d="M 21 18 Q 20 21 22 22" {...SK} />
      </>
    ),

    "plato": (
      // Broader forehead (ellipse), wide full beard
      <>
        <ellipse cx="24" cy="16" rx="11" ry="9" {...SK} />
        <path d="M 10 48 C 15 37 20 33 24 32 C 28 33 33 37 38 48" {...SK} />
        <path d="M 14 23 Q 8 33 13 41 Q 18 46 24 46 Q 30 46 35 41 Q 40 33 34 23" {...SK} />
      </>
    ),

    "aristotle": (
      // Short trimmed beard, neat hair — more refined than Plato
      <>
        <Head /><Shoulders />
        <path d="M 17 9 Q 24 6 31 9" {...SK} />
        <path d="M 18 23 Q 17 29 20 32 Q 24 34 28 32 Q 31 29 30 23" {...SK} />
      </>
    ),

    "al-farabi-avicenna": (
      // Domed turban above head, full beard
      <>
        <circle cx="24" cy="21" r="9" {...SK} />
        <path d="M 10 48 C 15 39 20 35 24 34 C 28 35 33 39 38 48" {...SK} />
        <path d="M 13 21 Q 15 6 24 5 Q 33 6 35 21" {...SK} />
        <line x1="12" y1="22" x2="36" y2="22" {...SK} />
        <path d="M 16 28 Q 13 36 17 41 Q 22 46 28 41 Q 33 36 32 28" {...SK} />
      </>
    ),

    "averroes": (
      // Horizontally wrapped turban (two arc bands), medium beard
      <>
        <circle cx="24" cy="21" r="9" {...SK} />
        <path d="M 10 48 C 15 39 20 35 24 34 C 28 35 33 39 38 48" {...SK} />
        <path d="M 14 16 Q 24 10 34 16" {...SK} />
        <path d="M 13 20 Q 24 14 35 20" {...SK} />
        <path d="M 17 28 Q 15 34 19 38 Q 24 41 29 38 Q 33 34 31 28" {...SK} />
      </>
    ),

    "kant": (
      // Powdered wig side curls, high cravat — 18th century formal
      <>
        <Head /><Shoulders />
        <path d="M 15 13 Q 8 18 10 27" {...SK} />
        <path d="M 33 13 Q 40 18 38 27" {...SK} />
        <path d="M 19 27 Q 24 30 29 27" {...SK} />
        <path d="M 22 27 L 24 31 L 26 27" {...SK} />
      </>
    ),

    "wittgenstein": (
      // Clean, minimal — no beard, just neat hair, modern collar
      <>
        <Head /><Shoulders />
        <path d="M 17 9 Q 24 6 31 9" {...SK} />
        <line x1="20" y1="27" x2="20" y2="34" {...SK} />
        <line x1="28" y1="27" x2="28" y2="34" {...SK} />
      </>
    ),

    "gadamer": (
      // Round glasses, soft features — 20th century academic
      <>
        <Head /><Shoulders />
        <circle cx="20" cy="16" r="3.5" {...SK} />
        <circle cx="28" cy="16" r="3.5" {...SK} />
        <path d="M 23.5 16 H 24.5" {...SK} />
        <line x1="14" y1="16" x2="16.5" y2="16" {...SK} />
        <line x1="31.5" y1="16" x2="34" y2="16" {...SK} />
      </>
    ),

    "foucault": (
      // Bald (no hair lines), round glasses — Foucault's iconic look
      <>
        <circle cx="24" cy="15" r="11" {...SK} />
        <path d="M 10 48 C 15 37 20 33 24 32 C 28 33 33 37 38 48" {...SK} />
        <circle cx="20" cy="15" r="3" {...SK} />
        <circle cx="28" cy="15" r="3" {...SK} />
        <path d="M 23 15 H 25" {...SK} />
      </>
    ),
  };

  return (
    <svg
      width={44}
      height={44}
      viewBox="0 0 48 48"
      fill="none"
      overflow="visible"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {illustrations[id] ?? null}
    </svg>
  );
}

// ── Blueprint mark — placed beside the internet paragraph ─────────────────
// Mirrors the Seed-of-Life logo from the Navbar, dimmed for subtle use.

function BlueprintMark() {
  const r  = 21;
  const sw = 3.8;
  const cx = 50, cy = 50;
  const angles = [75, 15, -45, -105, -165, 135];
  const centres = angles.map(deg => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  });
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 100 100"
      fill="none"
      overflow="visible"
      style={{ display: "block", flexShrink: 0, marginTop: 2 }}
      aria-hidden="true"
    >
      <circle cx={cx} cy={cy} r={r}
        stroke="rgba(255,255,255,0.28)" strokeWidth={sw} />
      {centres.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={r}
          stroke="rgba(255,255,255,0.28)" strokeWidth={sw} />
      ))}
    </svg>
  );
}

// ── Philosopher data ───────────────────────────────────────────────────────

const PHILOSOPHERS = [
  {
    id:       "socrates-meno",
    name:     "Socrates / Meno",
    quote:    "And how will you enquire, Socrates, into that which you do not know?",
    saying:   "You cannot search for something if you don't know it exists. Inquiry itself requires a starting point, and without that, discovery collapses.",
    adds:     "This defines the fundamental constraint. There are two categories: what you know, and what you don't. You can access what you know to look for, but you cannot access what you don't yet know exists.",
    internet: "Search engines inherit this exact limitation. They require a query, which means they can only return what you already know how to ask for. Anything outside your awareness is structurally inaccessible. The system is not occasionally failing to show you something — it is fundamentally incapable of surfacing what you don't know to look for.",
  },
  {
    id:       "plato",
    name:     "Plato",
    quote:    "Learning is recollection.",
    saying:   "Plato argues that all knowledge already exists within you, and discovery is simply remembering what your soul has already encountered.",
    adds:     "This reframes discovery as internal rather than external. But it only works if you have already experienced the thing you are trying to recall.",
    internet: "The internet may contain all information, but that does not make it accessible. If you have never encountered something, you cannot recall it, and therefore cannot search for it. The presence of information does not solve discovery — awareness still defines access.",
  },
  {
    id:       "aristotle",
    name:     "Aristotle",
    quote:    "From experience… comes the universal.",
    saying:   "Aristotle believed we discover new knowledge by observing many different things and extracting patterns from them.",
    adds:     "Discovery depends on exposure. Without a wide range of inputs, you cannot form new abstractions or arrive at new understanding.",
    internet: "Modern algorithms collapse variation instead of expanding it. They show you more of what you already engage with, reinforcing existing patterns instead of introducing new ones. This removes the diversity of input required to form new knowledge. You cannot discover something new if your inputs are filtered to resemble your past.",
  },
  {
    id:       "al-farabi-avicenna",
    name:     "Al-Farabi / Avicenna",
    quote:    "The intellect receives knowledge from a higher source.",
    saying:   "They argued that discovery requires connection to something beyond the individual mind — a broader intelligence that is not limited by personal experience.",
    adds:     "The self is not enough. To discover what you don't know, you need access to perspectives or knowledge outside your own history.",
    internet: "The modern internet does not expand you beyond yourself. It reinforces your past behavior, the behavior of people like you, and what has been paid to reach you. Instead of connecting you to a broader intelligence, it traps you inside your behavioral profile.",
  },
  {
    id:       "averroes",
    name:     "Averroes",
    quote:    "The intellect is shared.",
    saying:   "Knowledge emerges from participation in a shared system of reasoning across many minds.",
    adds:     "Discovery depends on a shared reality — a common set of inputs that people can reason from together.",
    internet: "Personalization fragments reality. Each user sees a different version of the world, shaped by their own behavior. Without shared exposure, there is no shared reasoning. The system produces isolated perspectives rather than collective understanding.",
  },
  {
    id:       "kant",
    name:     "Kant",
    quote:    "You see the world not as it is, but as you are.",
    saying:   "The mind structures reality. You do not perceive the world directly — you perceive it through your own cognitive framework.",
    adds:     "You cannot discover what falls outside your framework of thought. Your ability to know is constrained by how you interpret the world.",
    internet: "Algorithms now shape that framework. They learn what you are and feed it back to you continuously. Instead of expanding your perception, they stabilize it. You are not exposed to new categories of thought — only reinforced in existing ones.",
  },
  {
    id:       "wittgenstein",
    name:     "Wittgenstein",
    quote:    "The limits of my language mean the limits of my world.",
    saying:   "You cannot think beyond the words you have. Language defines the boundary of what you can understand.",
    adds:     "Discovery is constrained not just by knowledge, but by vocabulary. If you cannot name something, you cannot access it.",
    internet: "Search is entirely language-based. If you don't know the right words, you cannot find the idea. Entire domains of knowledge remain inaccessible simply because you lack the language to reach them.",
  },
  {
    id:       "gadamer",
    name:     "Gadamer",
    quote:    "Understanding is a fusion of horizons.",
    saying:   "Discovery happens through interaction with other perspectives. New understanding emerges when different viewpoints meet.",
    adds:     "You cannot discover alone. You need exposure to fundamentally different ways of thinking.",
    internet: "Modern feeds remove this interaction. They show you content similar to what you already engage with. Instead of exposing you to different perspectives, they keep you within your existing horizon. Without true contrast, discovery cannot occur.",
  },
  {
    id:       "foucault",
    name:     "Foucault",
    quote:    "Knowledge is shaped by systems of power.",
    saying:   "What you are able to know is determined by the structure of the system you are in.",
    adds:     "Discovery is not just a cognitive problem — it is a structural one. Systems define what can be seen, asked, and known.",
    internet: "The internet is not designed for discovery. It is designed for engagement and monetization. Search is constrained by what you can ask. Feeds are constrained by what keeps you engaged and what companies pay to promote. The system is not broken — it is working as intended, and that intention does not include helping you discover the unknown.",
  },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────

export default function PhilosophyPage() {

  // Equation animation: 0 = hidden, 1 = first eq, 2 = transformed
  const { ref: eqRef, inView: eqInView } = useInView(0.25);
  const [eqPhase, setEqPhase] = useState(0);

  useEffect(() => {
    if (!eqInView) return;
    const t1 = setTimeout(() => setEqPhase(1), 300);
    const t2 = setTimeout(() => setEqPhase(2), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [eqInView]);

  const eqLineEnter = (delay: number): React.CSSProperties => ({
    opacity:    eqPhase >= 1 ? 1 : 0,
    transform:  eqPhase >= 1 ? "none" : "translateY(12px)",
    transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
  });

  return (
    <div className="bg-black text-white" style={{ overflowX: "hidden" }}>

      {/* ══ PHILOSOPHER SECTIONS ═════════════════════════════════════════════ */}
      {PHILOSOPHERS.map((p, idx) => (
        <section
          key={p.id}
          style={{
            ...FB,
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding:   idx === 0 ? "120px 24px 88px" : "80px 24px 88px",
          }}
        >
          <FadeIn style={{ maxWidth: 760, margin: "0 auto" }}>

            {/* ── Name header: illustration + name side-by-side ──────────── */}
            <div
              style={{
                display:     "flex",
                alignItems:  "center",
                gap:         16,
                marginBottom: 28,
              }}
            >
              <PhilosopherIllustration id={p.id} />
              <h2
                style={{
                  fontSize:      "clamp(18px, 1.8vw, 22px)",
                  fontWeight:    600,
                  lineHeight:    1.2,
                  letterSpacing: "-0.01em",
                  color:         "rgba(255,255,255,0.92)",
                  margin:        0,
                }}
              >
                {p.name}
              </h2>
            </div>

            {/* ── Quote ──────────────────────────────────────────────────── */}
            <p
              style={{
                fontSize:     "clamp(17px, 1.8vw, 22px)",
                fontWeight:   400,
                lineHeight:   1.55,
                fontStyle:    "italic",
                color:        "rgba(255,255,255,0.80)",
                marginBottom: 36,
                paddingLeft:  60, // aligns with name text above
              }}
            >
              &ldquo;{p.quote}&rdquo;
            </p>

            {/* ── Three content paragraphs ────────────────────────────────
                Labels removed — presented as spaced paragraphs.
                The internet paragraph sits in a flex row with the Blueprint mark.
            ──────────────────────────────────────────────────────────────── */}
            <div style={{ paddingLeft: 60 }}>

              {/* Saying */}
              <p
                style={{
                  fontSize:     "clamp(14px, 1.35vw, 16px)",
                  fontWeight:   400,
                  lineHeight:   1.8,
                  color:        "rgba(255,255,255,0.60)",
                  marginBottom: 28,
                }}
              >
                {p.saying}
              </p>

              {/* Adds */}
              <p
                style={{
                  fontSize:     "clamp(14px, 1.35vw, 16px)",
                  fontWeight:   400,
                  lineHeight:   1.8,
                  color:        "rgba(255,255,255,0.60)",
                  marginBottom: 28,
                }}
              >
                {p.adds}
              </p>

              {/* Internet — Blueprint mark to the left */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <BlueprintMark />
                <p
                  style={{
                    fontSize:   "clamp(14px, 1.35vw, 16px)",
                    fontWeight: 400,
                    lineHeight: 1.8,
                    color:      "rgba(255,255,255,0.60)",
                    margin:     0,
                  }}
                >
                  {p.internet}
                </p>
              </div>

            </div>
          </FadeIn>
        </section>
      ))}

      {/* ══ FINAL SECTION ════════════════════════════════════════════════════ */}
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
          borderTop:      "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Opening question */}
        <FadeIn style={{ marginBottom: 72 }}>
          <h2
            style={{
              fontSize:      "clamp(24px, 3.2vw, 44px)",
              fontWeight:    600,
              lineHeight:    1.1,
              letterSpacing: "-0.02em",
              color:         "#fff",
              maxWidth:      680,
            }}
          >
            How do we find what we don&apos;t know to search for?
          </h2>
        </FadeIn>

        {/* Equation — two versions share same grid cell, cross-fade on phase change */}
        <div
          ref={eqRef}
          style={{ display: "grid", width: "100%", maxWidth: 680, marginBottom: 72 }}
        >
          {/* Equation 1 */}
          <div
            style={{
              gridArea:      "1 / 1",
              opacity:       eqPhase === 1 ? 1 : 0,
              transition:    "opacity 0.55s ease",
              pointerEvents: eqPhase !== 1 ? "none" : undefined,
            }}
          >
            {[
              { text: "everything everyone knows",       delay:   0 },
              { text: "− everything you know",            delay: 260 },
              { text: "= everything you don\u2019t know", delay: 520 },
            ].map(({ text, delay }) => (
              <p
                key={text}
                style={{
                  fontSize:      "clamp(18px, 2.4vw, 32px)",
                  fontWeight:    300,
                  lineHeight:    1.5,
                  letterSpacing: "-0.01em",
                  color:         "#fff",
                  ...eqLineEnter(delay),
                }}
              >
                {text}
              </p>
            ))}
          </div>

          {/* Equation 2 — transformed */}
          <div
            style={{
              gridArea:      "1 / 1",
              opacity:       eqPhase >= 2 ? 1 : 0,
              transition:    "opacity 0.7s ease 0.35s",
              pointerEvents: eqPhase < 2 ? "none" : undefined,
            }}
          >
            {[
              { text: "everything everyone searches + saves",  delay: 350 },
              { text: "− everything you search + save",         delay: 500 },
              { text: "\u2248 everything you don\u2019t know",  delay: 650 },
            ].map(({ text, delay }) => (
              <p
                key={text}
                style={{
                  fontSize:      "clamp(18px, 2.4vw, 32px)",
                  fontWeight:    300,
                  lineHeight:    1.5,
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

        {/* Closing — appears after equation transformation settles */}
        <div
          style={{
            opacity:    eqPhase >= 2 ? 1 : 0,
            transform:  eqPhase >= 2 ? "none" : "translateY(10px)",
            transition: "opacity 0.8s ease 1.1s, transform 0.8s ease 1.1s",
            maxWidth:   560,
          }}
        >
          <p
            style={{
              fontSize:   "clamp(18px, 2vw, 26px)",
              fontWeight: 400,
              lineHeight: 1.5,
              color:      "rgba(255,255,255,0.72)",
            }}
          >
            The internet never solved discovery.<br />
            It just made the loop faster.
          </p>
        </div>
      </section>

    </div>
  );
}

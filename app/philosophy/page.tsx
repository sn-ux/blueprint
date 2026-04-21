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
  const { ref, inView } = useInView(0.1);
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

// ── Shared typography constants ────────────────────────────────────────────

const NAME_STYLE: React.CSSProperties = {
  fontSize:      10,
  fontWeight:    600,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color:         "rgba(255,255,255,0.28)",
  marginBottom:  24,
};

const QUOTE_STYLE: React.CSSProperties = {
  fontSize:   "clamp(18px, 2vw, 24px)",
  fontWeight: 400,
  lineHeight: 1.55,
  fontStyle:  "italic",
  color:      "rgba(255,255,255,0.82)",
  marginBottom: 40,
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize:      9,
  fontWeight:    700,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color:         "rgba(255,255,255,0.22)",
  marginBottom:  10,
};

const BODY_STYLE: React.CSSProperties = {
  fontSize:   "clamp(14px, 1.4vw, 16px)",
  fontWeight: 400,
  lineHeight: 1.75,
  color:      "rgba(255,255,255,0.60)",
  marginBottom: 32,
};

// ── Page ──────────────────────────────────────────────────────────────────

export default function PhilosophyPage() {

  // Equation animation: phase 0 = hidden, 1 = first eq, 2 = transformed
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

      {/* ══ PHILOSOPHER SECTIONS ═════════════════════════════════════════════
          One section per philosopher. First section has extra top padding to
          clear the fixed 56 px navbar.                                       */}
      {PHILOSOPHERS.map((p, idx) => (
        <section
          key={p.id}
          style={{
            ...FB,
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding:   idx === 0 ? "120px 24px 80px" : "80px 24px",
          }}
        >
          <FadeIn
            style={{
              maxWidth: 760,
              margin:   "0 auto",
            }}
          >
            {/* Name */}
            <p style={NAME_STYLE}>{p.name}</p>

            {/* Quote */}
            <p style={QUOTE_STYLE}>&ldquo;{p.quote}&rdquo;</p>

            {/* Labeled sections */}
            <div>
              <p style={LABEL_STYLE}>What they&apos;re saying</p>
              <p style={BODY_STYLE}>{p.saying}</p>

              <p style={LABEL_STYLE}>What this adds to the problem of discovery</p>
              <p style={BODY_STYLE}>{p.adds}</p>

              <p style={LABEL_STYLE}>What this means for the internet</p>
              <p style={{ ...BODY_STYLE, marginBottom: 0 }}>{p.internet}</p>
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
              { text: "everything everyone knows",  delay:   0 },
              { text: "− everything you know",       delay: 260 },
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

          {/* Equation 2 — transformed version */}
          <div
            style={{
              gridArea:      "1 / 1",
              opacity:       eqPhase >= 2 ? 1 : 0,
              transition:    "opacity 0.7s ease 0.35s",
              pointerEvents: eqPhase < 2 ? "none" : undefined,
            }}
          >
            {[
              { text: "everything everyone searches + saves", delay: 350 },
              { text: "− everything you search + save",        delay: 500 },
              { text: "\u2248 everything you don\u2019t know", delay: 650 },
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

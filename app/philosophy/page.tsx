"use client";

import { useEffect, useRef, useState } from "react";

// ── Scroll-reveal hook ─────────────────────────────────────────────────────
function useInView(threshold = 0.08) {
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

function FadeIn({
  children, delay = 0, className, style,
}: {
  children: React.ReactNode; delay?: number;
  className?: string; style?: React.CSSProperties;
}) {
  const { ref, inView } = useInView(0.08);
  return (
    <div ref={ref} className={className} style={{
      opacity:    inView ? 1 : 0,
      transform:  inView ? "none" : "translateY(14px)",
      transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  );
}

const FB: React.CSSProperties = {
  width:      "100vw",
  marginLeft: "calc(50% - 50vw)",
};

// ── Blueprint mark ─────────────────────────────────────────────────────────
// Matches the Navbar logo exactly: same geometry, same size (36 px),
// horizontally mirrored via scaleX(-1), stroke white.

function BlueprintMark() {
  const r = 21, sw = 3.8, cx = 50, cy = 50;
  const centres = [75, 15, -45, -105, -165, 135].map(deg => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  });
  return (
    <svg
      width={36} height={36}
      viewBox="0 0 100 100"
      fill="none"
      overflow="visible"
      style={{ display: "block", flexShrink: 0, transform: "scaleX(-1)" }}
      aria-hidden="true"
    >
      <circle cx={cx} cy={cy} r={r} stroke="white" strokeWidth={sw} />
      {centres.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={r} stroke="white" strokeWidth={sw} />
      ))}
    </svg>
  );
}

// ── Layout constants ───────────────────────────────────────────────────────
// All body text (quote + paragraphs) aligns with the philosopher name — i.e.
// indented by image width (88) + gap (20) = 108 px from the section edge.
// The Blueprint mark sits in that 108 px gutter at left = −(36 logo + 12 gap).

const IMG_SIZE      = 88;   // px — portrait image (noticeably larger)
const IMG_GAP       = 20;   // px — between image and name
const INDENT        = IMG_SIZE + IMG_GAP; // 108 px
const LOGO_LEFT     = -(36 + 12);         // −48 px — logo in gutter

// ── Philosopher data ───────────────────────────────────────────────────────
// Al-Farabi and Avicenna are now separate entries.
// Fields are nullable — some philosophers carry only a subset of paragraphs
// after the split (Al-Farabi: saying + adds; Avicenna: internet only).

type Entry = {
  id:       string;
  name:     string;
  image:    string;
  quote:    string;
  saying:   string | null;
  adds:     string | null;
  internet: string | null;
};

// Special:FilePath redirects to the correct thumbnail without needing MD5 hashes.
// The ?width= param requests a specific thumbnail size from Wikimedia's servers.
const WM = (file: string, w = 160) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;

const PHILOSOPHERS: Entry[] = [
  {
    id:    "socrates-meno",
    name:  "Socrates / Meno",
    image: WM("Socrate_du_Louvre.jpg"),
    quote: "And how will you enquire, Socrates, into that which you do not know?",
    saying:   "You cannot search for something if you don't know it exists. Inquiry itself requires a starting point, and without that, discovery collapses.",
    adds:     "This defines the fundamental constraint. There are two categories: what you know, and what you don't. You can access what you know to look for, but you cannot access what you don't yet know exists.",
    internet: "Search engines inherit this exact limitation. They require a query, which means they can only return what you already know how to ask for. Anything outside your awareness is structurally inaccessible. The system is not occasionally failing to show you something — it is fundamentally incapable of surfacing what you don't know to look for.",
  },
  {
    id:    "plato",
    name:  "Plato",
    image: WM("Plato_Silanion_Musei_Capitolini_MC1377.jpg"),
    quote: "Learning is recollection.",
    saying:   "Plato argues that all knowledge already exists within you, and discovery is simply remembering what your soul has already encountered.",
    adds:     "This reframes discovery as internal rather than external. But it only works if you have already experienced the thing you are trying to recall.",
    internet: "The internet may contain all information, but that does not make it accessible. If you have never encountered something, you cannot recall it, and therefore cannot search for it. The presence of information does not solve discovery — awareness still defines access.",
  },
  {
    id:    "aristotle",
    name:  "Aristotle",
    image: WM("Aristotle_Altemps_Inv8575.jpg"),
    quote: "From experience… comes the universal.",
    saying:   "Aristotle believed we discover new knowledge by observing many different things and extracting patterns from them.",
    adds:     "Discovery depends on exposure. Without a wide range of inputs, you cannot form new abstractions or arrive at new understanding.",
    internet: "Modern algorithms collapse variation instead of expanding it. They show you more of what you already engage with, reinforcing existing patterns instead of introducing new ones. This removes the diversity of input required to form new knowledge. You cannot discover something new if your inputs are filtered to resemble your past.",
  },
  {
    id:    "al-farabi",
    name:  "Al-Farabi",
    image: WM("Al-Farabi.png"),
    quote: "The intellect receives knowledge from a higher source.",
    saying:   "They argued that discovery requires connection to something beyond the individual mind — a broader intelligence that is not limited by personal experience.",
    adds:     "The self is not enough. To discover what you don't know, you need access to perspectives or knowledge outside your own history.",
    internet: null,
  },
  {
    id:    "avicenna",
    name:  "Avicenna",
    image: WM("Avicenna-miniature.jpg"),
    quote: "The soul perceives itself without the body.",
    saying:   null,
    adds:     null,
    internet: "The modern internet does not expand you beyond yourself. It reinforces your past behavior, the behavior of people like you, and what has been paid to reach you. Instead of connecting you to a broader intelligence, it traps you inside your behavioral profile.",
  },
  {
    id:    "averroes",
    name:  "Averroes",
    image: WM("Averroes_by_Giambattista_Tiepolo.jpg"),
    quote: "The intellect is shared.",
    saying:   "Knowledge emerges from participation in a shared system of reasoning across many minds.",
    adds:     "Discovery depends on a shared reality — a common set of inputs that people can reason from together.",
    internet: "Personalization fragments reality. Each user sees a different version of the world, shaped by their own behavior. Without shared exposure, there is no shared reasoning. The system produces isolated perspectives rather than collective understanding.",
  },
  {
    id:    "kant",
    name:  "Kant",
    image: WM("Immanuel_Kant_(painted_portrait).jpg"),
    quote: "You see the world not as it is, but as you are.",
    saying:   "The mind structures reality. You do not perceive the world directly — you perceive it through your own cognitive framework.",
    adds:     "You cannot discover what falls outside your framework of thought. Your ability to know is constrained by how you interpret the world.",
    internet: "Algorithms now shape that framework. They learn what you are and feed it back to you continuously. Instead of expanding your perception, they stabilize it. You are not exposed to new categories of thought — only reinforced in existing ones.",
  },
  {
    id:    "wittgenstein",
    name:  "Wittgenstein",
    image: WM("Ludwig_Wittgenstein.jpg"),
    quote: "The limits of my language mean the limits of my world.",
    saying:   "You cannot think beyond the words you have. Language defines the boundary of what you can understand.",
    adds:     "Discovery is constrained not just by knowledge, but by vocabulary. If you cannot name something, you cannot access it.",
    internet: "Search is entirely language-based. If you don't know the right words, you cannot find the idea. Entire domains of knowledge remain inaccessible simply because you lack the language to reach them.",
  },
  {
    id:    "gadamer",
    name:  "Gadamer",
    image: WM("Hans-Georg_Gadamer.jpg"),
    quote: "Understanding is a fusion of horizons.",
    saying:   "Discovery happens through interaction with other perspectives. New understanding emerges when different viewpoints meet.",
    adds:     "You cannot discover alone. You need exposure to fundamentally different ways of thinking.",
    internet: "Modern feeds remove this interaction. They show you content similar to what you already engage with. Instead of exposing you to different perspectives, they keep you within your existing horizon. Without true contrast, discovery cannot occur.",
  },
  {
    id:    "foucault",
    name:  "Foucault",
    image: WM("Michel_Foucault_1974_Brasil.jpg"),
    quote: "Knowledge is shaped by systems of power.",
    saying:   "What you are able to know is determined by the structure of the system you are in.",
    adds:     "Discovery is not just a cognitive problem — it is a structural one. Systems define what can be seen, asked, and known.",
    internet: "The internet is not designed for discovery. It is designed for engagement and monetization. Search is constrained by what you can ask. Feeds are constrained by what keeps you engaged and what companies pay to promote. The system is not broken — it is working as intended, and that intention does not include helping you discover the unknown.",
  },
];

// ── Shared text styles ─────────────────────────────────────────────────────
const bodyStyle: React.CSSProperties = {
  fontSize:     "clamp(14px, 1.35vw, 16px)",
  fontWeight:   400,
  lineHeight:   1.85,
  color:        "rgba(255,255,255,0.60)",
  margin:       0,
};

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

      {/* ══ OPENING INTRO ════════════════════════════════════════════════════ */}
      <section
        style={{
          ...FB,
          padding: "120px 24px 80px",
        }}
      >
        <FadeIn style={{ maxWidth: 760, margin: "0 auto" }}>
          {[
            "An open society places an enormous intellectual responsibility on ordinary people.",
            "Through democracy, we govern ourselves by means of our opinions. We count them in votes to choose our politicians, who in turn determine the quality of our society.",
            "This means that the quality of our opinions—and by extension, the quality of our opinion formation—determines the quality of our society.",
            "The internet has become the machinery of opinion formation. As the quantity of information increases while the way we navigate it remains unchanged, the process by which we form opinions begins to collapse under its own weight. In the United States and across the world, we are already seeing the consequences of that collapse.",
            "Blueprint is an attempt to solve the problem of opinion formation at scale.",
          ].map((text, i) => (
            <p
              key={i}
              style={{
                fontSize:     "clamp(15px, 1.5vw, 18px)",
                fontWeight:   400,
                lineHeight:   1.8,
                color:        i === 4
                  ? "rgba(255,255,255,0.88)"   // last line slightly brighter
                  : "rgba(255,255,255,0.68)",
                margin:       0,
                marginBottom: i < 4 ? "1.5em" : 0,
              }}
            >
              {text}
            </p>
          ))}
        </FadeIn>
      </section>

      {/* ══ PHILOSOPHER SECTIONS ═════════════════════════════════════════════ */}
      {PHILOSOPHERS.map((p, idx) => (
        <section
          key={p.id}
          style={{
            ...FB,
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding:   idx === 0 ? "80px 24px 88px" : "80px 24px 88px",
          }}
        >
          <FadeIn style={{ maxWidth: 760, margin: "0 auto" }}>

            {/* ── Header: portrait + name ──────────────────────────────── */}
            <div style={{ display: "flex", alignItems: "center", gap: IMG_GAP, marginBottom: 28 }}>

              {/* B&W portrait — gray background shows through if image fails */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.image}
                alt={p.name}
                onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
                style={{
                  width:          IMG_SIZE,
                  height:         IMG_SIZE,
                  objectFit:      "cover",
                  objectPosition: "center top",
                  filter:         "grayscale(100%) contrast(1.55) brightness(1.12)",
                  background:     "rgba(255,255,255,0.07)",
                  flexShrink:     0,
                  display:        "block",
                }}
              />

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

            {/* ── All body content indented to align with name ─────────── */}
            <div style={{ paddingLeft: INDENT }}>

              {/* Quote */}
              <p
                style={{
                  fontSize:     "clamp(16px, 1.7vw, 20px)",
                  fontWeight:   400,
                  lineHeight:   1.55,
                  fontStyle:    "italic",
                  color:        "rgba(255,255,255,0.78)",
                  marginBottom: 36,
                }}
              >
                &ldquo;{p.quote}&rdquo;
              </p>

              {/* Saying */}
              {p.saying && (
                <p style={{ ...bodyStyle, marginBottom: 28 }}>{p.saying}</p>
              )}

              {/* Adds */}
              {p.adds && (
                <p style={{ ...bodyStyle, marginBottom: 28 }}>{p.adds}</p>
              )}

              {/* Internet — Blueprint mark sits in the 72 px gutter to the left.
                  Text is flush with saying/adds (no additional indent).       */}
              {p.internet && (
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      position:  "absolute",
                      left:      LOGO_LEFT,
                      top:       "50%",
                      transform: "translateY(-50%)",
                    }}
                  >
                    <BlueprintMark />
                  </div>
                  <p style={bodyStyle}>{p.internet}</p>
                </div>
              )}

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

        {/* Equation — two versions overlap in same grid cell, cross-fade */}
        <div
          ref={eqRef}
          style={{ display: "grid", width: "100%", maxWidth: 680, marginBottom: 72 }}
        >
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
              <p key={text} style={{ fontSize: "clamp(18px, 2.4vw, 32px)", fontWeight: 300, lineHeight: 1.5, letterSpacing: "-0.01em", color: "#fff", ...eqLineEnter(delay) }}>
                {text}
              </p>
            ))}
          </div>

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

        <div
          style={{
            opacity:    eqPhase >= 2 ? 1 : 0,
            transform:  eqPhase >= 2 ? "none" : "translateY(10px)",
            transition: "opacity 0.8s ease 1.1s, transform 0.8s ease 1.1s",
            maxWidth:   560,
          }}
        >
          <p style={{ fontSize: "clamp(18px, 2vw, 26px)", fontWeight: 400, lineHeight: 1.5, color: "rgba(255,255,255,0.72)" }}>
            The internet never solved discovery.<br />
            It just made the loop faster.
          </p>
        </div>
      </section>

    </div>
  );
}

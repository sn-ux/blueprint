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
// LOGO_LEFT removed — logo now lives in a flex column under the portrait.

// ── Philosopher data ───────────────────────────────────────────────────────
// Al-Farabi and Avicenna are now separate entries.
// Fields are nullable — some philosophers carry only a subset of paragraphs
// after the split (Al-Farabi: saying + adds; Avicenna: internet only).

type Entry = {
  id:          string;
  name:        string;
  image:       string;
  year:        string;
  quote:       string;
  attribution: string | null;
  saying:      string | null;
  adds:        string | null;
  internet:    string | null;
};

// Special:FilePath redirects to the correct thumbnail without needing MD5 hashes.
// The ?width= param requests a specific thumbnail size from Wikimedia's servers.
const WM = (file: string, w = 160) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;

const PHILOSOPHERS: Entry[] = [
  {
    id:          "socrates-meno",
    name:        "Socrates / Meno",
    image:       WM("Socrate_du_Louvre.jpg"),
    year:        "c. 470–399 BC",
    quote:       "And how will you enquire, Socrates, into that which you do not know?",
    attribution: "— Meno",
    saying:      "You cannot search for something if you do not know it exists. Inquiry requires a starting point, and without that, discovery collapses.",
    adds:        "This defines the fundamental constraint. There are two categories: what you know, and what you do not. You can access what you know to look for, but you cannot access what you do not yet know exists.",
    internet:    "Search engines inherit this limitation. They require a query, which means they can only return what you already know how to ask for. Anything outside your awareness is structurally inaccessible. The system is not occasionally failing to show you something. It is fundamentally incapable of surfacing what you do not know to look for.",
  },
  {
    id:          "plato",
    name:        "Plato",
    image:       WM("Plato_Silanion_Musei_Capitolini_MC1377.jpg"),
    year:        "c. 428–348 BC",
    quote:       "The soul, then, as being immortal, and having been born many times, and having seen all things both here and in the other world, has learned everything.",
    attribution: "— Meno",
    saying:      "Plato argues that knowledge already exists within the soul, and discovery is the act of remembering.",
    adds:        "This reframes discovery as internal rather than external. But it only works if you have already encountered the thing you are trying to recall.",
    internet:    "The internet may contain all information, but that does not make it accessible. If you have never encountered something, you cannot recall it, and therefore cannot search for it. The presence of information does not solve discovery. Awareness still defines access.",
  },
  {
    id:          "aristotle",
    name:        "Aristotle",
    image:       WM("Aristotle_Altemps_Inv8575.jpg"),
    year:        "384–322 BC",
    quote:       "From perception there comes memory, and from memory experience; and from experience the universal.",
    attribution: "— Posterior Analytics",
    saying:      "Aristotle believed we discover new knowledge by observing many different things and extracting patterns from them.",
    adds:        "Discovery depends on exposure. Without a wide range of inputs, you cannot form new abstractions or arrive at new understanding.",
    internet:    "Modern algorithms collapse variation instead of expanding it. They show you more of what you already engage with, reinforcing existing patterns instead of introducing new ones. This removes the diversity of input required to form new knowledge. You cannot discover something new if your inputs are filtered to resemble your past.",
  },
  {
    id:          "al-farabi",
    name:        "Al-Farabi",
    image:       WM("Alpharabius_in_Liber_Chronicarum_1493_AD.png"),
    year:        "c. 872–950",
    quote:       "Happiness consists in the assimilation of the human soul to the active intellect.",
    attribution: null,
    saying:      "Al-Farabi argues that discovery requires connection to something beyond the individual mind, a broader source of knowledge not limited by personal experience.",
    adds:        "The self is not enough. To discover what you do not know, you need access to perspectives or knowledge outside your own history.",
    internet:    null,
  },
  {
    id:          "avicenna",
    name:        "Avicenna",
    image:       WM("Portrait_of_Avicenna_Wellcome_M0000768.jpg"),
    year:        "980–1037",
    quote:       "The Agent Intellect makes knowledge exist by conferring forms upon prepared souls.",
    attribution: null,
    saying:      "Avicenna describes knowledge as something received rather than constructed.",
    adds:        null,
    internet:    "The modern internet does not expand you beyond yourself. It reinforces your past behavior, the behavior of people like you, and what has been paid to reach you. Instead of connecting you to a broader source of knowledge, it traps you inside your behavioral profile.",
  },
  {
    id:          "averroes",
    name:        "Averroes",
    image:       WM("Averroes_closeup.jpg"),
    year:        "1126–1198",
    quote:       "To think abstractly is to participate in the intellect.",
    attribution: null,
    saying:      "Averroes argues that knowledge emerges from participation in a shared intellectual system.",
    adds:        "Discovery depends on a shared reality, a common set of inputs that people can reason from together.",
    internet:    "Personalization fragments that reality. Each user sees a different version of the world shaped by their own behavior. Without shared exposure, there is no shared reasoning. The system produces isolated perspectives rather than collective understanding.",
  },
  {
    id:          "kant",
    name:        "Kant",
    image:       WM("Immanuel_Kant_by_Johann_Christoph_Frisch.jpg"),
    year:        "1724–1804",
    quote:       "Thoughts without content are empty, intuitions without concepts are blind.",
    attribution: "— Critique of Pure Reason (1781)",
    saying:      "The mind structures reality. You do not perceive the world directly. You perceive it through your own cognitive framework.",
    adds:        "You cannot discover what falls outside that framework. Your ability to know is constrained by how you interpret the world.",
    internet:    "Algorithms now shape that framework. They learn what you are and feed it back to you continuously. Instead of expanding your perception, they stabilize it. You are not exposed to new categories of thought, only reinforced in existing ones.",
  },
  {
    id:          "wittgenstein",
    name:        "Wittgenstein",
    image:       WM("Ludwig_Wittgenstein.jpg"),
    year:        "1889–1951",
    quote:       "The limits of my language mean the limits of my world.",
    attribution: "— Tractatus Logico-Philosophicus (1921)",
    saying:      "You cannot think beyond the words you have. Language defines the boundary of what you can understand.",
    adds:        "Discovery is constrained not just by knowledge, but by vocabulary. If you cannot name something, you cannot access it.",
    internet:    "Search is entirely language-based. If you do not know the right words, you cannot find the idea. Entire domains of knowledge remain inaccessible simply because you lack the language to reach them.",
  },
  {
    id:          "gadamer",
    name:        "Gadamer",
    image:       WM("Hans-Georg_Gadamer.jpg"),
    year:        "1900–2002",
    quote:       "Understanding is not a mere reproductive activity but a genuine event.",
    attribution: "— Truth and Method (1960)",
    saying:      "Discovery happens through interaction with other perspectives. New understanding emerges when different viewpoints meet.",
    adds:        "You cannot discover alone. You need exposure to fundamentally different ways of thinking.",
    internet:    "Modern feeds remove this interaction. They show you content similar to what you already engage with. Instead of exposing you to different perspectives, they keep you within your existing horizon. Without true contrast, discovery cannot occur.",
  },
  {
    id:          "foucault",
    name:        "Foucault",
    image:       WM("Michel_Foucault_1974_Brasil.jpg"),
    year:        "1926–1984",
    quote:       "Knowledge is not for knowing: knowledge is for cutting.",
    attribution: "— Discipline and Punish (1975)",
    saying:      "What you are able to know is shaped by the structure of the system you are in.",
    adds:        "Discovery is not just a cognitive problem. It is a structural one. Systems define what can be seen, asked, and known.",
    internet:    "The internet is not designed for discovery. It is designed for engagement and monetization. Search is constrained by what you can ask. Feeds are constrained by what keeps you engaged and what companies pay to promote. The system is not broken. It is working as intended, and that intention does not include helping you discover the unknown.",
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

// ── Card sub-components ────────────────────────────────────────────────────

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width={18} height={18} viewBox="0 0 18 18" fill="none"
      style={{
        transform:  open ? "rotate(180deg)" : "none",
        transition: "transform 0.35s ease",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <path
        d="M4 6.5L9 11.5L14 6.5"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CardArrow() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
      <svg width={18} height={32} viewBox="0 0 18 32" fill="none" aria-hidden="true">
        <line
          x1="9" y1="0" x2="9" y2="22"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M3 16L9 22L15 16"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PhilosophyPage() {

  // Which philosopher card is currently open (only one at a time)
  const [expandedId, setExpandedId] = useState<string | null>(null);


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

      {/* ══ PHILOSOPHER CARDS ════════════════════════════════════════════════ */}
      <section
        style={{
          ...FB,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          padding:   "48px 24px 80px",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {PHILOSOPHERS.map((p, idx) => {
            const isOpen  = expandedId === p.id;
            const TRUNC   = 90;
            const preview = p.quote.length > TRUNC
              ? p.quote.slice(0, TRUNC - 1).trimEnd() + "\u2026"
              : p.quote;

            return (
              <div key={p.id}>
                <FadeIn>

                  {/* ── Card ─────────────────────────────────────────── */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => setExpandedId(isOpen ? null : p.id)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(isOpen ? null : p.id);
                      }
                    }}
                    style={{
                      background:   "rgba(255,255,255,0.025)",
                      border:       `1px solid ${isOpen ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 10,
                      cursor:       "pointer",
                      userSelect:   "none",
                      outline:      "none",
                      overflow:     "hidden",
                      transition:   "border-color 0.25s ease",
                    }}
                  >

                    {/* ── Always-visible header ────────────────────── */}
                    <div style={{
                      display:    "flex",
                      alignItems: "flex-start",
                      gap:        IMG_GAP,
                      padding:    "20px",
                    }}>

                      {/* Portrait */}
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

                      {/* Name / year / preview */}
                      <div style={{ flex: 1, minWidth: 0 }}>

                        {/* Name row + chevron */}
                        <div style={{
                          display:        "flex",
                          alignItems:     "center",
                          justifyContent: "space-between",
                          gap:            12,
                          marginBottom:   4,
                        }}>
                          <h2 style={{
                            fontSize:      "clamp(16px, 1.6vw, 20px)",
                            fontWeight:    600,
                            lineHeight:    1.2,
                            letterSpacing: "-0.01em",
                            color:         "rgba(255,255,255,0.92)",
                            margin:        0,
                          }}>
                            {p.name}
                          </h2>
                          <ChevronDown open={isOpen} />
                        </div>

                        {/* Year */}
                        <p style={{
                          fontSize: "clamp(11px, 1vw, 12px)",
                          color:    "rgba(255,255,255,0.35)",
                          margin:   "0 0 10px",
                        }}>
                          {p.year}
                        </p>

                        {/* Quote preview — animates out when card opens */}
                        <div style={{
                          display:          "grid",
                          gridTemplateRows: isOpen ? "0fr" : "1fr",
                          transition:       "grid-template-rows 0.35s ease",
                        }}>
                          <div style={{ overflow: "hidden" }}>
                            <p style={{
                              fontSize:   "clamp(13px, 1.3vw, 15px)",
                              fontStyle:  "italic",
                              lineHeight: 1.55,
                              color:      "rgba(255,255,255,0.50)",
                              margin:     0,
                            }}>
                              &ldquo;{preview}&rdquo;
                            </p>
                          </div>
                        </div>

                      </div>
                    </div>{/* /header */}

                    {/* ── Expandable content ───────────────────────── */}
                    <div style={{
                      display:          "grid",
                      gridTemplateRows: isOpen ? "1fr" : "0fr",
                      transition:       "grid-template-rows 0.4s ease",
                    }}>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ padding: "0 20px 28px" }}>

                          {/* Divider */}
                          <div style={{
                            height:       1,
                            background:   "rgba(255,255,255,0.07)",
                            marginBottom: 24,
                          }} />

                          {/* Quote + attribution + earlier paragraphs */}
                          <div style={{ paddingLeft: INDENT }}>

                            <p style={{
                              fontSize:     "clamp(16px, 1.7vw, 20px)",
                              fontWeight:   400,
                              lineHeight:   1.55,
                              fontStyle:    "italic",
                              color:        "rgba(255,255,255,0.78)",
                              marginBottom: p.attribution ? 10 : 36,
                            }}>
                              &ldquo;{p.quote}&rdquo;
                            </p>

                            {p.attribution && (
                              <p style={{
                                fontSize:     "clamp(11px, 1vw, 12px)",
                                fontWeight:   400,
                                lineHeight:   1.5,
                                fontStyle:    "italic",
                                color:        "rgba(255,255,255,0.38)",
                                marginBottom: 36,
                              }}>
                                {p.attribution}
                              </p>
                            )}

                            {p.saying && (
                              <p style={{ ...bodyStyle, marginBottom: 28 }}>{p.saying}</p>
                            )}

                            {/* Adds only rendered here when internet follows */}
                            {p.adds && p.internet && (
                              <p style={{ ...bodyStyle, marginBottom: 28 }}>{p.adds}</p>
                            )}

                          </div>

                          {/* Last paragraph: Blueprint logo + text */}
                          {(p.internet ?? p.adds) && (
                            <div style={{ display: "flex", alignItems: "center", gap: IMG_GAP }}>
                              <div style={{
                                width:          IMG_SIZE,
                                flexShrink:     0,
                                display:        "flex",
                                justifyContent: "center",
                              }}>
                                <BlueprintMark />
                              </div>
                              <p style={{ ...bodyStyle, flex: 1 }}>{p.internet ?? p.adds}</p>
                            </div>
                          )}

                        </div>
                      </div>
                    </div>{/* /expandable */}

                  </div>{/* /card */}
                </FadeIn>

                {/* Downward arrow connector — not after the last card */}
                {idx < PHILOSOPHERS.length - 1 && <CardArrow />}

              </div>
            );
          })}
        </div>
      </section>

      {/* ══ CONCLUDING PARAGRAPHS ═══════════════════════════════════════════ */}
      <section
        style={{
          ...FB,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          padding:   "80px 24px 80px",
        }}
      >
        <FadeIn style={{ maxWidth: 760, margin: "0 auto" }}>
          {[
            "By engaging with this lineage of philosophical thought, we arrive at a different way of interacting with information. The search bar shows you what you know to ask for, and the feed shows you what it predicts you will engage with. Both are constrained by your prior knowledge, your past behavior, and what has been paid to reach you.",
            "If what people search for and save is a rough approximation of what they know, then the difference between what everyone searches for and saves and what you have searched for and saved approximates what you do not know.",
            "Blueprint is built around that difference. It organizes what people know into something you can explore, giving you access to what you do not yet know to search for.",
          ].map((text, i, arr) => (
            <p
              key={i}
              style={{
                fontSize:     "clamp(15px, 1.5vw, 18px)",
                fontWeight:   400,
                lineHeight:   1.8,
                color:        i === arr.length - 1
                  ? "rgba(255,255,255,0.88)"
                  : "rgba(255,255,255,0.68)",
                margin:       0,
                marginBottom: i < arr.length - 1 ? "1.5em" : 0,
              }}
            >
              {text}
            </p>
          ))}
        </FadeIn>
      </section>


    </div>
  );
}

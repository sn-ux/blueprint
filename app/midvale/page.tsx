import Footer from "@/components/Footer";
import WorldCard from "@/components/WorldCard";

// ── Roommate placeholders ──────────────────────────────────────────────────────
// rotSeed gives each sphere a distinct initial orientation + rotation phase.
const PLACEHOLDERS = [
  { name: "Roommate 1", rotSeed: 1 },
  { name: "Roommate 2", rotSeed: 2 },
  { name: "Roommate 3", rotSeed: 3 },
];

export default function MidvalePage() {
  return (
    <>
      <main style={{ minHeight: "100vh", paddingTop: 80, paddingBottom: 80 }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 52 }}>
          <h1
            style={{
              margin:        0,
              fontSize:      "clamp(36px, 5vw, 56px)",
              fontWeight:    700,
              letterSpacing: "-0.03em",
              color:         "#ffffff",
              lineHeight:    1.08,
            }}
          >
            Midvale
          </h1>
          <p
            style={{
              margin:        "10px 0 0",
              fontSize:      15,
              fontWeight:    400,
              letterSpacing: "0.01em",
              color:         "rgba(255,255,255,0.32)",
              lineHeight:    1.5,
            }}
          >
            Four music worlds under one roof.
          </p>
        </div>

        {/* ── 2 × 2 sphere grid ───────────────────────────────────────────── */}
        {/*
          Mobile  (< 640px): single column, cards stack vertically.
          Desktop (≥ 640px): two columns.
          We use a CSS custom property + media query via a <style> block so we
          can keep the rest of the layout in plain inline styles.
        */}
        <style>{`
          .midvale-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
          }
          @media (min-width: 640px) {
            .midvale-grid {
              grid-template-columns: repeat(2, 1fr);
              gap: 20px;
            }
          }
        `}</style>

        <div className="midvale-grid">

          {/* Surya — real data from /api/world */}
          <WorldCard name="Surya" isSurya rotSeed={0} />

          {/* Roommates — placeholders */}
          {PLACEHOLDERS.map(({ name, rotSeed }) => (
            <WorldCard key={name} name={name} rotSeed={rotSeed} />
          ))}

        </div>
      </main>

      <Footer />
    </>
  );
}

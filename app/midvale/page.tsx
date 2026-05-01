import { prisma } from "@/lib/prisma";
import Footer from "@/components/Footer";
import WorldCard from "@/components/WorldCard";

// Always fetch fresh data — never serve a cached version of this page.
export const dynamic = "force-dynamic";

// ── Slot config ───────────────────────────────────────────────────────────────
// Midvale shows up to MAX_SLOTS worlds.  Visible users (midvaleHidden=false) fill
// slots in registration order.  Empty slots show "Connect Spotify" placeholders.

const MAX_SLOTS  = 5;
const SLOT_NAMES = ["Surya", "Roommate 1", "Roommate 2", "Roommate 3", "Roommate 4"] as const;

export default async function MidvalePage() {
  // Fetch non-hidden users only, ordered by id (CUIDs are time-sortable).
  const users = await prisma.user.findMany({
    where:   { midvaleHidden: false },
    orderBy: { id: "asc" },
    select:  { id: true, name: true },
  });

  // Track counts per user — one grouped query is cheaper than N individual ones.
  const trackGroups =
    users.length > 0
      ? await prisma.track.groupBy({
          by:    ["userId"],
          _count: { id: true },
          where: { userId: { in: users.map(u => u.id) } },
        })
      : [];

  const countMap = new Map(trackGroups.map(t => [t.userId, t._count.id]));

  // Build MAX_SLOTS display slots regardless of how many users exist.
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => {
    const user       = users[i];
    const trackCount = user ? (countMap.get(user.id) ?? 0) : 0;
    return {
      name:     user?.name ?? SLOT_NAMES[i],
      userId:   user?.id   ?? null,
      hasWorld: trackCount > 0,
      rotSeed:  i,
    };
  });

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
            Five music worlds under one roof.
          </p>
        </div>

        {/* ── 2-column sphere grid (5 slots = 2+2+1) ──────────────────────── */}
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
            /* Centre the lone 5th card on desktop */
            .midvale-grid > *:last-child:nth-child(odd) {
              grid-column: 1 / -1;
              max-width: calc(50% - 10px);
              justify-self: center;
            }
          }
        `}</style>

        <div className="midvale-grid">
          {slots.map(slot => (
            <WorldCard
              key={slot.userId ?? slot.name}
              name={slot.name}
              userId={slot.userId}
              worldHref={slot.userId ? `/midvale/${slot.userId}` : undefined}
              hasWorld={slot.hasWorld}
              rotSeed={slot.rotSeed}
            />
          ))}
        </div>

      </main>

      <Footer />
    </>
  );
}

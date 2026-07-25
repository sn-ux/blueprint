import { prisma } from "@/lib/prisma";
import Footer from "@/components/Footer";
import WorldCard, { FriendsWorldCard } from "@/components/WorldCard";
import SubstituteSelector from "@/components/SubstituteSelector";

// Always fetch fresh data — never serve a cached version of this page.
export const dynamic = "force-dynamic";

// ── Slot config ───────────────────────────────────────────────────────────────
// Friends page shows up to MAX_SLOTS worlds.  Users fill slots in registration order.
// Empty slots show "Connect Spotify" placeholders.

const MAX_SLOTS  = 5;
const SLOT_NAMES = ["Surya", "Roommate 1", "Roommate 2", "Roommate 3", "Roommate 4"] as const;

export default async function MidvalePage() {
  // Fetch users ordered by id (CUIDs are time-sortable).
  // Excludes users flagged midvaleHidden — set automatically when their
  // Spotify access is no longer valid (e.g. removed from the Developer
  // Dashboard allowlist, or app access revoked) — see lib/spotify-import.ts.
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
      <main style={{ minHeight: "100vh", paddingTop: 80, paddingBottom: 100 }}>

        {/* ── "Viewing as" substitute profile selector ─────────────────────
            Only shows registered users (those with a real userId/account).
            Guests see no selector if no users have connected yet.          */}
        <SubstituteSelector
          users={slots
            .filter(s => s.userId !== null)
            .map(s => ({ id: s.userId!, name: s.name }))}
        />

        {/* ── Combined Friends world ────────────────────────────────────────
            Full-width tile linking to /midvale/friends.
            On desktop: sphere left, info right.
            On mobile:  sphere top, info below. */}
        <div style={{ marginBottom: 36 }}>
          <FriendsWorldCard />
        </div>

        {/* ── Divider ──────────────────────────────────────────────────────── */}
        <div style={{
          height:       1,
          background:   "rgba(255,255,255,0.07)",
          marginBottom: 28,
        }} />

        {/* ── Individual world gallery — always 2 columns ──────────────────
            grid-cols-2 (no md: prefix) enforces 2 cols on every breakpoint.
            Horizontal overflow is prevented by the global px-6 container.  */}
        <div
          className="grid grid-cols-2"
          style={{ gap: "clamp(24px, 4vw, 48px) clamp(12px, 3vw, 32px)" }}
        >
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

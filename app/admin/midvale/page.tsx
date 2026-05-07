// /admin/midvale — Midvale user removal (admin-only, fully server-rendered)

import { getCurrentUser } from "@/lib/current-user";
import { isAdmin }        from "@/lib/admin";
import { prisma }         from "@/lib/prisma";
import RemoveButton       from "./RemoveButton";

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = { fontFamily: "monospace", fontSize: 13 };

export default async function AdminMidvalePage() {
  const user = await getCurrentUser();

  if (!user || !isAdmin(user.id)) {
    return (
      <main style={{ ...mono, padding: "2rem", color: "#f87171", background: "#0a0a0a", minHeight: "100vh" }}>
        Not authorized.
      </main>
    );
  }

  // ── Fetch users + track counts directly (no API hop) ──────────────────────

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select:  { id: true, name: true, email: true, image: true },
  });

  const trackGroups = users.length > 0
    ? await prisma.track.groupBy({
        by:    ["userId"],
        _count: { id: true },
        where: { userId: { in: users.map(u => u.id) } },
      })
    : [];

  const countMap = new Map(trackGroups.map(g => [g.userId, g._count.id]));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main style={{ ...mono, padding: "2rem", maxWidth: 720, margin: "0 auto", color: "#e5e5e5", background: "#0a0a0a", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: "2rem" }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Midvale · Users</h2>
        <span style={{ color: "#333", fontSize: 11 }}>{users.length} user{users.length !== 1 ? "s" : ""}</span>
        <a href="/midvale" style={{ color: "#6366f1", fontSize: 12, marginLeft: "auto", textDecoration: "none" }}>
          ← Midvale
        </a>
      </div>

      {/* User rows */}
      {users.length === 0 && (
        <p style={{ color: "#555" }}>No users.</p>
      )}

      {users.map(u => {
        const isMe       = u.id === user.id;
        const trackCount = countMap.get(u.id) ?? 0;

        return (
          <div
            key={u.id}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          14,
              marginBottom: 8,
              padding:      "13px 16px",
              background:   "#111",
              border:       "1px solid #1e1e1e",
              borderRadius: 8,
            }}
          >
            {/* Avatar */}
            {u.image
              ? <img src={u.image} alt="" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} /> // eslint-disable-line @next/next/no-img-element
              : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#222", flexShrink: 0 }} />
            }

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: "#fff" }}>
                {u.name ?? "(no name)"}
                {isMe && <span style={{ marginLeft: 8, fontSize: 11, color: "#fbbf24", fontWeight: 400 }}>you</span>}
              </div>
              <div style={{ marginTop: 2, color: "#555", fontSize: 11 }}>
                {u.email && <span style={{ marginRight: 10 }}>{u.email}</span>}
                <span style={{ color: trackCount > 0 ? "#86efac" : "#444" }}>
                  {trackCount.toLocaleString()} tracks
                </span>
              </div>
              <div style={{ marginTop: 1, color: "#2a2a2a", fontSize: 10 }}>{u.id}</div>
            </div>

            {/* Remove button (client island — not shown for self) */}
            {!isMe && <RemoveButton userId={u.id} name={u.name ?? u.id} />}
          </div>
        );
      })}

      <p style={{ marginTop: 28, color: "#222", fontSize: 11 }}>
        Remove deletes all tracks, accounts, sessions, and the user row.
        The empty slot on /midvale will show a Connect Spotify card.
      </p>
    </main>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserRow = {
  slot:        number;
  id:          string;
  name:        string | null;
  email:       string | null;
  image:       string | null;
  trackCount:  number;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPanel({ adminId }: { adminId: string }) {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState<Record<string, boolean>>({});
  const [error,   setError]   = useState<Record<string, string>>({});

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/midvale/users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleRemove(u: UserRow) {
    if (!confirm("Remove this user from Midvale?")) return;

    setBusy(prev  => ({ ...prev,  [u.id]: true  }));
    setError(prev => ({ ...prev,  [u.id]: ""    }));

    try {
      const res  = await fetch(`/api/admin/midvale/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        await fetchUsers();
      } else {
        setError(prev => ({ ...prev, [u.id]: data.error ?? "Failed" }));
      }
    } catch {
      setError(prev => ({ ...prev, [u.id]: "Network error" }));
    } finally {
      setBusy(prev => ({ ...prev, [u.id]: false }));
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const mono: React.CSSProperties = { fontFamily: "monospace", fontSize: 13 };

  return (
    <main
      style={{
        ...mono,
        padding:    "2rem",
        maxWidth:   780,
        margin:     "0 auto",
        color:      "#e5e5e5",
        background: "#0a0a0a",
        minHeight:  "100vh",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: "2rem" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Midvale · Users</h2>
        <a
          href="/midvale"
          style={{ color: "#6366f1", fontSize: 12, marginLeft: "auto", textDecoration: "none" }}
        >
          ← Midvale
        </a>
      </div>

      {loading && <p style={{ color: "#555" }}>Loading…</p>}

      {!loading && users.length === 0 && (
        <p style={{ color: "#f87171" }}>No users found.</p>
      )}

      {!loading && users.map(u => {
        const isMe    = u.id === adminId;
        const isBusy  = !!busy[u.id];
        const errMsg  = error[u.id];

        return (
          <div
            key={u.id}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          16,
              marginBottom: 10,
              padding:      "14px 16px",
              background:   "#111",
              border:       "1px solid #1e1e1e",
              borderRadius: 8,
            }}
          >
            {/* Avatar */}
            {u.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={u.image}
                alt=""
                style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width:        32,
                  height:       32,
                  borderRadius: "50%",
                  background:   "#222",
                  flexShrink:   0,
                }}
              />
            )}

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {u.name ?? "(no name)"}
                {isMe && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "#fbbf24", fontWeight: 400 }}>
                    you
                  </span>
                )}
              </div>
              <div style={{ marginTop: 2, color: "#555", fontSize: 11 }}>
                {u.email && <span style={{ marginRight: 12 }}>{u.email}</span>}
                <span style={{ color: u.trackCount > 0 ? "#86efac" : "#555" }}>
                  {u.trackCount.toLocaleString()} tracks
                </span>
              </div>
              <div style={{ marginTop: 2, color: "#333", fontSize: 10 }}>{u.id}</div>
            </div>

            {/* Remove / error */}
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
              {errMsg && (
                <span style={{ fontSize: 11, color: "#f87171" }}>{errMsg}</span>
              )}
              {!isMe && (
                <button
                  onClick={() => handleRemove(u)}
                  disabled={isBusy}
                  style={{
                    ...mono,
                    padding:      "5px 14px",
                    background:   isBusy ? "#1a1a1a" : "#7f1d1d",
                    color:        isBusy ? "#555"    : "#fca5a5",
                    border:       "1px solid " + (isBusy ? "#222" : "#991b1b"),
                    borderRadius: 6,
                    cursor:       isBusy ? "default" : "pointer",
                    fontSize:     12,
                  }}
                >
                  {isBusy ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <p style={{ marginTop: 24, color: "#2a2a2a", fontSize: 11 }}>
        Remove deletes all tracks, accounts, sessions, and the user row. Cannot be undone.
        The empty slot on /midvale will show a Connect Spotify card.
      </p>
    </main>
  );
}

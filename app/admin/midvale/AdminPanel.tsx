"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserRow = {
  slot:            number;
  id:              string;
  name:            string | null;
  email:           string | null;
  image:           string | null;
  trackCount:      number;
  spotifyConnected: boolean;
  spotifyScope:    string | null;
  tokenExpiresAt:  number | null;
};

// ── Style helpers ─────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "monospace", fontSize: 13 };

function btn(color: string, disabled = false): React.CSSProperties {
  return {
    ...mono,
    background:    disabled ? "#2a2a2a" : color,
    color:         disabled ? "#555" : "#fff",
    border:        "none",
    borderRadius:  5,
    padding:       "4px 11px",
    cursor:        disabled ? "default" : "pointer",
    transition:    "opacity 0.15s",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPanel({ adminId }: { adminId: string }) {
  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState<Record<string, boolean>>({});
  const [log,     setLog]     = useState<Record<string, string>>({});

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/midvale/users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function setBusyFor(id: string, val: boolean) {
    setBusy(prev => ({ ...prev, [id]: val }));
  }
  function setLogFor(id: string, msg: string) {
    setLog(prev => ({ ...prev, [id]: msg }));
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleDelete(u: UserRow) {
    if (!confirm(`Delete ${u.name ?? u.id}?\nThis removes all their tracks, accounts, sessions, and user row. Cannot be undone.`)) return;
    setBusyFor(u.id, true);
    try {
      const res  = await fetch(`/api/admin/midvale/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setLogFor(u.id, `✓ Deleted. ${data.tracksRemoved} tracks removed.`);
        await fetchUsers();
      } else {
        setLogFor(u.id, `✗ ${data.error}`);
      }
    } finally {
      setBusyFor(u.id, false);
    }
  }

  async function handleRefresh(u: UserRow) {
    setBusyFor(u.id, true);
    setLogFor(u.id, "Importing…");
    try {
      const res  = await fetch(`/api/admin/midvale/users/${u.id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setLogFor(u.id,
          `✓ Done. liked=${data.likedSongsFetched} imported=${data.importedLikedTracks} ` +
          `purged=${data.removedNonLikedTracks} dbAfter=${data.dbTrackCountAfter}`
        );
        await fetchUsers();
      } else {
        setLogFor(u.id, `✗ ${data.error}`);
      }
    } finally {
      setBusyFor(u.id, false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main style={{ ...mono, padding: "2rem", maxWidth: 900, color: "#e5e5e5", background: "#0a0a0a", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: "1.5rem" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Blueprint · Midvale Admin</h2>
        <span style={{ color: "#555", fontSize: 12 }}>adminId: {adminId}</span>
        <a href="/midvale" style={{ color: "#6366f1", fontSize: 12, marginLeft: "auto" }}>← Midvale</a>
      </div>

      {loading && <p style={{ color: "#555" }}>Loading…</p>}

      {!loading && users.length === 0 && (
        <p style={{ color: "#f87171" }}>No users found.</p>
      )}

      {!loading && users.map(u => {
        const isBusy   = !!busy[u.id];
        const isAdmin  = u.id === adminId;
        const logMsg   = log[u.id];
        const tokenAge = u.tokenExpiresAt
          ? new Date(u.tokenExpiresAt * 1000).toISOString().slice(0, 16).replace("T", " ")
          : null;

        return (
          <div
            key={u.id}
            style={{
              marginBottom: 16,
              padding: "14px 16px",
              background:   "#141414",
              border:       "1px solid #222",
              borderRadius: 8,
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {u.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.image} alt="" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
              )}
              <span style={{ fontWeight: 700, color: "#fff" }}>{u.name ?? "(no name)"}</span>
              {isAdmin && <span style={{ color: "#fbbf24", fontSize: 11 }}>YOU</span>}
              <span style={{ color: "#555", fontSize: 11, marginLeft: "auto" }}>slot {u.slot}</span>
            </div>

            {/* Detail row */}
            <div style={{ marginTop: 6, color: "#888", fontSize: 12, display: "flex", flexWrap: "wrap", gap: "4px 20px" }}>
              <span>{u.email ?? "(no email)"}</span>
              <span>id: {u.id}</span>
              <span style={{ color: u.trackCount > 0 ? "#86efac" : "#f87171" }}>
                {u.trackCount.toLocaleString()} tracks
              </span>
              <span style={{ color: u.spotifyConnected ? "#86efac" : "#f87171" }}>
                Spotify: {u.spotifyConnected ? "connected" : "not connected"}
              </span>
              {tokenAge && <span>token expires: {tokenAge}</span>}
            </div>

            {/* Action row */}
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => handleRefresh(u)}
                disabled={isBusy || !u.spotifyConnected}
                style={btn("#6366f1", isBusy || !u.spotifyConnected)}
              >
                {isBusy ? "…" : "↻ Refresh"}
              </button>

              {!isAdmin && (
                <button
                  onClick={() => handleDelete(u)}
                  disabled={isBusy}
                  style={btn("#7f1d1d", isBusy)}
                >
                  Delete
                </button>
              )}

              {logMsg && (
                <span style={{ fontSize: 12, color: logMsg.startsWith("✓") ? "#86efac" : "#f87171" }}>
                  {logMsg}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 24, color: "#333", fontSize: 11 }}>
        Refresh re-runs liked-songs-only import for that user using their stored Spotify token. •
        Delete removes all data permanently.
      </div>
    </main>
  );
}

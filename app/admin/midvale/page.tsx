"use client";

// /admin/midvale — Midvale user removal
// Client component: fetches /api/admin/midvale/users directly.
// If the API returns 403 → "Not authorized."
// Never renders a blank page — every state has visible text.

import { useEffect, useState } from "react";

type User = {
  id:         string;
  name:       string | null;
  email:      string | null;
  image:      string | null;
  trackCount: number;
};

const S = {
  page: {
    fontFamily: "monospace",
    fontSize:   14,
    padding:    "2rem",
    maxWidth:   700,
    margin:     "0 auto",
    color:      "#e5e5e5",
    minHeight:  "80vh",
  } as React.CSSProperties,

  heading: {
    margin:     0,
    fontSize:   20,
    fontWeight: 700,
    color:      "#ffffff",
  } as React.CSSProperties,

  row: {
    display:      "flex",
    alignItems:   "center",
    gap:          14,
    marginBottom: 8,
    padding:      "14px 16px",
    background:   "#161616",
    border:       "1px solid #2a2a2a",
    borderRadius: 8,
  } as React.CSSProperties,

  name: {
    fontWeight: 600,
    color:      "#ffffff",
    fontSize:   14,
  } as React.CSSProperties,

  meta: {
    marginTop: 3,
    color:     "#666",
    fontSize:  12,
  } as React.CSSProperties,

  userId: {
    marginTop: 2,
    color:     "#333",
    fontSize:  10,
  } as React.CSSProperties,

  removeBtn: (busy: boolean) => ({
    fontFamily:   "monospace",
    fontSize:     12,
    padding:      "6px 16px",
    background:   busy ? "#1a1a1a" : "#7f1d1d",
    color:        busy ? "#555"    : "#fca5a5",
    border:       "1px solid " + (busy ? "#2a2a2a" : "#991b1b"),
    borderRadius: 6,
    cursor:       busy ? "default" : "pointer",
    flexShrink:   0,
  }) as React.CSSProperties,
};

export default function AdminMidvalePage() {
  const [status, setStatus] = useState<"loading" | "unauth" | "error" | "ok">("loading");
  const [users,  setUsers]  = useState<User[]>([]);
  const [errMsg, setErrMsg] = useState("");
  const [busy,   setBusy]   = useState<Record<string, boolean>>({});
  const [rowErr, setRowErr] = useState<Record<string, string>>({});

  async function load() {
    setStatus("loading");
    try {
      const res  = await fetch("/api/admin/midvale/users");
      if (!res.ok)            { setErrMsg(`HTTP ${res.status}`); setStatus("error"); return; }
      const data = await res.json();
      setUsers(data.users ?? []);
      setStatus("ok");
    } catch (e) {
      setErrMsg(String(e));
      setStatus("error");
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(u: User) {
    if (!confirm("Remove this user from Midvale?")) return;
    setBusy(p  => ({ ...p, [u.id]: true  }));
    setRowErr(p => ({ ...p, [u.id]: ""   }));
    try {
      const res  = await fetch(`/api/admin/midvale/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setUsers(prev => prev.filter(x => x.id !== u.id));
      } else {
        setRowErr(p => ({ ...p, [u.id]: data.error ?? "Failed" }));
      }
    } catch {
      setRowErr(p => ({ ...p, [u.id]: "Network error" }));
    } finally {
      setBusy(p => ({ ...p, [u.id]: false }));
    }
  }

  return (
    <div style={S.page}>

      {/* Always-visible heading */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <h1 style={S.heading}>Midvale Admin</h1>
        <a href="/midvale" style={{ marginLeft: "auto", color: "#6366f1", fontSize: 12, textDecoration: "none" }}>
          ← Midvale
        </a>
      </div>

      {status === "loading" && (
        <p style={{ color: "#888" }}>Loading users…</p>
      )}

      {status === "error" && (
        <p style={{ color: "#f87171" }}>Error loading users: {errMsg}</p>
      )}

      {status === "ok" && users.length === 0 && (
        <p style={{ color: "#888" }}>No users found.</p>
      )}

      {status === "ok" && users.map(u => (
        <div key={u.id} style={S.row}>

          {/* Avatar */}
          {u.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={u.image} alt="" style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0 }} />
            : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#2a2a2a", flexShrink: 0 }} />
          }

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.name}>{u.name ?? "(no name)"}</div>
            <div style={S.meta}>
              {u.email && <span style={{ marginRight: 10 }}>{u.email}</span>}
              <span style={{ color: u.trackCount > 0 ? "#86efac" : "#555" }}>
                {u.trackCount.toLocaleString()} tracks
              </span>
            </div>
            <div style={S.userId}>{u.id}</div>
          </div>

          {/* Remove */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
            {rowErr[u.id] && (
              <span style={{ fontSize: 11, color: "#f87171" }}>{rowErr[u.id]}</span>
            )}
            <button
              onClick={() => remove(u)}
              disabled={!!busy[u.id]}
              style={S.removeBtn(!!busy[u.id])}
            >
              {busy[u.id] ? "Removing…" : "Remove"}
            </button>
          </div>

        </div>
      ))}

      {status === "ok" && (
        <p style={{ marginTop: 24, color: "#333", fontSize: 11 }}>
          Remove deletes all tracks, accounts, sessions, and the user row.
          Empty slots on /midvale will show a Connect Spotify card.
        </p>
      )}

    </div>
  );
}

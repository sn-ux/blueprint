"use client";

// /admin/midvale — Midvale user management
// Shows each user's Spotify connection status, track count, and
// lets admins re-run the full import (Refresh) or remove users.

import { useEffect, useState } from "react";

type User = {
  id:               string;
  name:             string | null;
  email:            string | null;
  image:            string | null;
  trackCount:       number;
  spotifyConnected: boolean;
  hasRefreshToken:  boolean;
  missingScopes:    string[];
  midvaleHidden:    boolean;
};

type RefreshOutcome = {
  success:              boolean;
  error?:               string;
  missingScopes?:       string[];
  retryAfter?:          number;
  dbTrackCountAfter?:   number;
  likedSongsFetched?:   number;
  uniqueAllowedTracks?: number;
  noLikedSongs?:        boolean;
};

const S = {
  page: {
    fontFamily: "monospace",
    fontSize:   14,
    padding:    "2rem",
    maxWidth:   760,
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
    alignItems:   "flex-start",
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

  btn: (color: string, busy: boolean) => ({
    fontFamily:   "monospace",
    fontSize:     12,
    padding:      "5px 13px",
    background:   busy ? "#1a1a1a" : color,
    color:        busy ? "#555"    : "#fff",
    border:       "1px solid " + (busy ? "#2a2a2a" : color),
    borderRadius: 6,
    cursor:       busy ? "default" : "pointer",
    flexShrink:   0,
    opacity:      busy ? 0.6 : 1,
  }) as React.CSSProperties,
};

export default function AdminMidvalePage() {
  const [status,        setStatus]        = useState<"loading"|"unauth"|"error"|"ok">("loading");
  const [users,         setUsers]         = useState<User[]>([]);
  const [errMsg,        setErrMsg]        = useState("");
  const [removeBusy,    setRemoveBusy]    = useState<Record<string, boolean>>({});
  const [refreshBusy,   setRefreshBusy]   = useState<Record<string, boolean>>({});
  const [rowErr,        setRowErr]        = useState<Record<string, string>>({});
  const [refreshResult, setRefreshResult] = useState<Record<string, RefreshOutcome>>({});

  async function load() {
    setStatus("loading");
    try {
      const res  = await fetch("/api/admin/midvale/users");
      if (res.status === 403) { setStatus("unauth"); return; }
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
    if (!confirm(`Remove ${u.name ?? u.id} from Midvale?\nThis deletes all tracks, accounts, and sessions.`)) return;
    setRemoveBusy(p  => ({ ...p, [u.id]: true  }));
    setRowErr(p     => ({ ...p, [u.id]: ""      }));
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
      setRemoveBusy(p => ({ ...p, [u.id]: false }));
    }
  }

  async function refresh(u: User) {
    setRefreshBusy(p   => ({ ...p, [u.id]: true      }));
    setRefreshResult(p => ({ ...p, [u.id]: undefined! }));
    setRowErr(p        => ({ ...p, [u.id]: ""         }));
    try {
      const res  = await fetch(`/api/admin/midvale/users/${u.id}/refresh`, { method: "POST" });
      const data: RefreshOutcome = await res.json();
      if (res.ok) {
        // Update track count in local state so it reflects immediately.
        setUsers(prev => prev.map(x =>
          x.id === u.id ? { ...x, trackCount: data.dbTrackCountAfter ?? x.trackCount } : x
        ));
      }
      setRefreshResult(p => ({ ...p, [u.id]: data }));
    } catch {
      setRefreshResult(p => ({ ...p, [u.id]: { success: false, error: "Network error" } }));
    } finally {
      setRefreshBusy(p => ({ ...p, [u.id]: false }));
    }
  }

  return (
    <div style={S.page}>

      {/* Heading */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <h1 style={S.heading}>Midvale Admin</h1>
        <a href="/midvale" style={{ marginLeft: "auto", color: "#6366f1", fontSize: 12, textDecoration: "none" }}>
          ← Midvale
        </a>
      </div>

      {status === "loading" && <p style={{ color: "#888" }}>Loading users…</p>}
      {status === "unauth"  && <p style={{ color: "#f87171" }}>Not authorized.</p>}
      {status === "error"   && <p style={{ color: "#f87171" }}>Error: {errMsg}</p>}
      {status === "ok" && users.length === 0 && <p style={{ color: "#888" }}>No users found.</p>}

      {status === "ok" && users.map(u => {
        const lacking      = u.missingScopes;
        const needsReconn  = !u.hasRefreshToken || lacking.length > 0;
        const rBusy        = !!refreshBusy[u.id];
        const dBusy        = !!removeBusy[u.id];
        const outcome      = refreshResult[u.id];

        return (
          <div key={u.id} style={S.row}>

            {/* Avatar */}
            {u.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={u.image} alt="" style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, marginTop: 2 }} />
              : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#2a2a2a", flexShrink: 0, marginTop: 2 }} />
            }

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.name}>{u.name ?? "(no name)"}</div>

              <div style={S.meta}>
                {u.email && <span style={{ marginRight: 10 }}>{u.email}</span>}
                <span style={{ color: u.trackCount > 0 ? "#86efac" : "#ef4444", marginRight: 10 }}>
                  {u.trackCount.toLocaleString()} tracks
                </span>
                {!u.spotifyConnected && (
                  <span style={{ color: "#a16207" }}>⚠ no Spotify account</span>
                )}
                {u.midvaleHidden && (
                  <span style={{ color: "#f87171", marginRight: 10 }}>
                    ⊘ hidden from Friends (Spotify access invalid)
                  </span>
                )}
                {u.spotifyConnected && needsReconn && (
                  <span style={{ color: "#f97316" }}>
                    ⚠ needs reconnect
                    {lacking.length > 0 ? ` (missing: ${lacking.join(", ")})` : " (no refresh token)"}
                  </span>
                )}
              </div>

              <div style={S.userId}>{u.id}</div>

              {/* Refresh result / error */}
              {outcome && (
                <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6 }}>
                  {outcome.success ? (
                    <span style={{ color: "#86efac" }}>
                      ✓ {outcome.dbTrackCountAfter?.toLocaleString()} tracks in DB
                      {" · "}liked={outcome.likedSongsFetched}
                      {" · "}deduped={outcome.uniqueAllowedTracks}
                      {outcome.noLikedSongs && " · ⚠ Spotify returned 0 liked/playlist tracks"}
                    </span>
                  ) : (
                    <span style={{ color: "#f87171" }}>
                      ✗ {outcome.error}
                      {outcome.retryAfter !== undefined && (
                        <span style={{ color: "#fb923c" }}> (retry in {outcome.retryAfter}s)</span>
                      )}
                    </span>
                  )}
                </div>
              )}

              {rowErr[u.id] && (
                <div style={{ marginTop: 4, fontSize: 11, color: "#f87171" }}>{rowErr[u.id]}</div>
              )}
            </div>

            {/* Actions */}
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, marginTop: 2 }}>
              <button
                onClick={() => refresh(u)}
                disabled={rBusy || dBusy}
                style={S.btn("#1d4ed8", rBusy || dBusy)}
              >
                {rBusy ? "Refreshing…" : "Refresh"}
              </button>
              <button
                onClick={() => remove(u)}
                disabled={dBusy || rBusy}
                style={S.btn("#7f1d1d", dBusy || rBusy)}
              >
                {dBusy ? "Removing…" : "Remove"}
              </button>
            </div>

          </div>
        );
      })}

      {status === "ok" && (
        <p style={{ marginTop: 24, color: "#333", fontSize: 11 }}>
          Refresh re-runs the full Spotify import (liked songs + owned playlists) for that user.
          Remove deletes all tracks, accounts, sessions, and the user row.
        </p>
      )}

    </div>
  );
}

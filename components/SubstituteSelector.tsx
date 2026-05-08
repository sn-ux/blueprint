"use client";

// ── SubstituteSelector ────────────────────────────────────────────────────────
// Appears on the /midvale Friends page. Lets a visitor choose which registered
// user they "are" so that worldsphere Unheard sorting can highlight tracks the
// selected profile hasn't saved yet.
//
// Storage: sessionStorage key "blueprint:substituteProfile"
//   value: JSON { userId: string; userName: string } | absent (= Guest)
//
// When the selection changes a custom window event is dispatched so any open
// WorldSphere can refetch its tracklist without requiring a page reload.
// A native storage event is also fired for cross-tab awareness (rare, but free).

import { useEffect, useState } from "react";

export const SUBSTITUTE_SESSION_KEY = "blueprint:substituteProfile";

export interface SubstituteProfile {
  userId:   string;
  userName: string;
}

interface Props {
  users: { id: string; name: string }[];
}

export default function SubstituteSelector({ users }: Props) {
  const [selectedId, setSelectedId] = useState<string>("");

  // Read sessionStorage on mount (SSR-safe — effect only runs client-side)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SUBSTITUTE_SESSION_KEY);
      if (!raw) return;
      const { userId } = JSON.parse(raw) as SubstituteProfile;
      // Only restore if the user is still visible on this page
      if (users.some(u => u.id === userId)) setSelectedId(userId);
    } catch { /* malformed storage — ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (id: string) => {
    setSelectedId(id);

    if (!id) {
      sessionStorage.removeItem(SUBSTITUTE_SESSION_KEY);
      window.dispatchEvent(
        new CustomEvent("blueprint:substituteChange", { detail: null }),
      );
    } else {
      const user    = users.find(u => u.id === id);
      const profile: SubstituteProfile = { userId: id, userName: user?.name ?? "" };
      sessionStorage.setItem(SUBSTITUTE_SESSION_KEY, JSON.stringify(profile));
      window.dispatchEvent(
        new CustomEvent("blueprint:substituteChange", { detail: profile }),
      );
    }
  };

  if (users.length === 0) return null;

  return (
    <div style={{
      display:     "flex",
      alignItems:  "center",
      gap:         10,
      marginBottom: 28,
    }}>
      <span style={{
        fontSize:      11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight:    500,
        color:         "rgba(255,255,255,0.28)",
        userSelect:    "none",
      }}>
        Viewing as
      </span>

      <select
        value={selectedId}
        onChange={e => handleChange(e.target.value)}
        style={{
          background:  "rgba(255,255,255,0.05)",
          border:      "1px solid rgba(255,255,255,0.09)",
          borderRadius: 8,
          color:       selectedId ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.32)",
          fontSize:    13,
          fontFamily:  "inherit",
          fontWeight:  400,
          padding:     "4px 10px",
          cursor:      "pointer",
          outline:     "none",
          appearance:  "auto",   // keep native arrow for accessibility
        }}
      >
        <option value="" style={{ background: "#080810" }}>Guest</option>
        {users.map(u => (
          <option key={u.id} value={u.id} style={{ background: "#080810" }}>
            {u.name}
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RemoveButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  async function handleRemove() {
    if (!confirm("Remove this user from Midvale?")) return;

    setBusy(true);
    setError("");

    try {
      const res  = await fetch(`/api/admin/midvale/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        router.refresh();
      } else {
        setError(data.error ?? "Failed");
        setBusy(false);
      }
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      {error && <span style={{ fontSize: 11, color: "#f87171" }}>{error}</span>}
      <button
        onClick={handleRemove}
        disabled={busy}
        style={{
          fontFamily:   "monospace",
          fontSize:     12,
          padding:      "5px 14px",
          background:   busy ? "#1a1a1a" : "#7f1d1d",
          color:        busy ? "#555"    : "#fca5a5",
          border:       "1px solid " + (busy ? "#222" : "#991b1b"),
          borderRadius: 6,
          cursor:       busy ? "default" : "pointer",
        }}
      >
        {busy ? "Removing…" : "Remove"}
      </button>
    </div>
  );
}

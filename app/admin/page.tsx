"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, type CSSProperties } from "react";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [log, setLog]     = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);

  async function runImport() {
    setBusy(true);
    setLog("Running import…");
    try {
      const res  = await fetch("/api/spotify/import");
      const data = await res.json();
      setLog(JSON.stringify(data, null, 2));
    } catch (e) {
      setLog("Fetch error: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{
      fontFamily: "monospace",
      padding: "2rem",
      maxWidth: 560,
      color: "#e5e5e5",
      background: "#0a0a0a",
      minHeight: "100vh",
    }}>
      <h2 style={{ marginBottom: "1.5rem" }}>Blueprint · Admin</h2>

      {status === "loading" && <p>Checking session…</p>}

      {status === "unauthenticated" && (
        <>
          <p style={{ color: "#f87171" }}>Not signed in.</p>
          <button
            onClick={() => signIn("spotify")}
            style={btn("#1DB954")}
          >
            Sign in with Spotify
          </button>
        </>
      )}

      {status === "authenticated" && session?.user && (
        <>
          <p style={{ color: "#86efac" }}>
            Signed in as <strong>{session.user.email ?? session.user.name}</strong>
          </p>
          <button
            onClick={runImport}
            disabled={busy}
            style={btn(busy ? "#555" : "#6366f1")}
          >
            {busy ? "Importing…" : "Run Spotify Import"}
          </button>
          {"  "}
          <button
            onClick={() => signOut()}
            style={btn("#374151")}
          >
            Sign out
          </button>
        </>
      )}

      {log && (
        <pre style={{
          marginTop: "1.5rem",
          background: "#111",
          color: "#a3e635",
          padding: "1rem",
          borderRadius: 6,
          overflowX: "auto",
          fontSize: "0.85rem",
        }}>
          {log}
        </pre>
      )}
    </main>
  );
}

function btn(bg: string): CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "0.5rem 1.2rem",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "0.9rem",
  };
}

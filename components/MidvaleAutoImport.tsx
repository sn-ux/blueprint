"use client";

// MidvaleAutoImport — triggered when a roommate returns to /midvale after
// completing Spotify OAuth (?import=1 in the URL).
//
// Phases:
//   idle      — no import running (component renders nothing)
//   importing — fetch in progress
//   done      — tracks imported successfully
//   no_songs  — OAuth worked but 0 liked songs on Spotify
//   error     — network / auth failure
//
// Closure note: router.replace/refresh delays are scheduled inside .then/.catch
// rather than .finally so they use the correct outcome value, not stale state.

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

type Phase = "idle" | "importing" | "done" | "no_songs" | "error";

export default function MidvaleAutoImport() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const didImport    = useRef(false);
  const [phase, setPhase]   = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [imported, setImported] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (searchParams.get("import") !== "1") return;
    if (didImport.current) return;
    didImport.current = true;

    console.log("[MidvaleAutoImport] starting import for session user:", {
      name:  session?.user?.name  ?? "(no name)",
      email: session?.user?.email ?? "(no email)",
    });

    setPhase("importing");

    fetch("/api/spotify/import")
      .then(async r => {
        const body = await r.json();

        if (!r.ok) {
          // HTTP error (401 = no session, 400 = no token, 500 = server crash)
          const msg = body?.error ?? `HTTP ${r.status}`;
          console.error("[MidvaleAutoImport] import failed:", msg, body);
          setErrMsg(msg);
          setPhase("error");
          // Give user time to read error before redirecting
          setTimeout(() => { router.replace("/midvale"); router.refresh(); }, 4000);
          return;
        }

        console.log("[MidvaleAutoImport] import response:", {
          imported:     body.imported,
          dbTrackCount: body.dbTrackCount,
          noLikedSongs: body.noLikedSongs,
        });

        if (body.noLikedSongs || (body.imported ?? 0) === 0) {
          // OAuth worked but Spotify returned no saved tracks.
          // The user exists in DB but has 0 tracks → won't appear on Midvale.
          setPhase("no_songs");
          setTimeout(() => { router.replace("/midvale"); router.refresh(); }, 5000);
          return;
        }

        setImported(body.imported ?? 0);
        setPhase("done");
        // Short pause so "World created" is readable before the page refreshes
        setTimeout(() => { router.replace("/midvale"); router.refresh(); }, 1500);
      })
      .catch(err => {
        console.error("[MidvaleAutoImport] fetch error:", err);
        setErrMsg(String(err));
        setPhase("error");
        setTimeout(() => { router.replace("/midvale"); router.refresh(); }, 4000);
      });
  }, [status, searchParams, router, session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "idle") return null;

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         400,
        background:     "rgba(0,0,0,0.88)",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            20,
      }}
    >
      {phase === "importing" && (
        <>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#22d3ee",
            animation: "midvale-pulse 1.4s ease-in-out infinite",
          }} />
          <p style={{ color: "rgba(255,255,255,0.80)", fontSize: 17, fontWeight: 500, margin: 0 }}>
            Building your music world…
          </p>
          <p style={{ color: "rgba(255,255,255,0.30)", fontSize: 12, margin: 0 }}>
            Importing tracks · classifying genres · this takes a minute
          </p>
        </>
      )}

      {phase === "done" && (
        <>
          <p style={{ color: "rgba(255,255,255,0.80)", fontSize: 17, fontWeight: 500, margin: 0 }}>
            World created ✓
          </p>
          {imported > 0 && (
            <p style={{ color: "rgba(255,255,255,0.30)", fontSize: 12, margin: 0 }}>
              {imported.toLocaleString()} tracks imported
            </p>
          )}
        </>
      )}

      {phase === "no_songs" && (
        <>
          <p style={{ color: "#fbbf24", fontSize: 16, fontWeight: 500, margin: 0 }}>
            Spotify connected, but no liked songs found
          </p>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, margin: 0, maxWidth: 340, textAlign: "center" }}>
            Like songs on Spotify first, then reconnect. Only your Liked Songs library is imported.
          </p>
          <p style={{ color: "rgba(255,255,255,0.20)", fontSize: 11, margin: 0 }}>
            Returning to Midvale…
          </p>
        </>
      )}

      {phase === "error" && (
        <>
          <p style={{ color: "#f87171", fontSize: 16, fontWeight: 500, margin: 0 }}>
            Import failed
          </p>
          <p style={{ color: "rgba(255,255,255,0.30)", fontSize: 12, margin: 0, maxWidth: 320, textAlign: "center" }}>
            {errMsg || "Something went wrong. Try connecting again from Midvale."}
          </p>
          <p style={{ color: "rgba(255,255,255,0.20)", fontSize: 11, margin: 0 }}>
            Returning to Midvale…
          </p>
        </>
      )}

      <style>{`
        @keyframes midvale-pulse {
          0%, 100% { opacity: 0.25; transform: scale(0.8); }
          50%       { opacity: 1;    transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

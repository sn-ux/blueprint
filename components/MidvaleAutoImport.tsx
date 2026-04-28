"use client";

// MidvaleAutoImport — triggered when a roommate returns to /midvale after
// completing Spotify OAuth.  The flow that lands here:
//
//   RoommateCard clicks "Connect Spotify"
//     → signOut (clears existing session)
//     → signIn("spotify", { callbackUrl: "/midvale?import=1" }, { show_dialog: "true" })
//     → Spotify account chooser (forced by show_dialog)
//     → roommate picks their Spotify account
//     → NextAuth creates/finds User + Account for that Spotify profile
//     → browser session cookie is set for the NEW user
//     → redirect to /midvale?import=1
//     → this component detects ?import=1 + authenticated session
//     → calls /api/spotify/import (runs for the session user = the roommate)
//     → router.replace("/midvale") + router.refresh() → page shows new card

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

type Phase = "idle" | "importing" | "done" | "error";

export default function MidvaleAutoImport() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const didImport    = useRef(false);
  const [phase, setPhase]   = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    // Guard: only fire when authenticated and the ?import=1 flag is present.
    if (status !== "authenticated") return;
    if (searchParams.get("import") !== "1") return;
    if (didImport.current) return;
    didImport.current = true;

    // ── Debug: log exactly who we are about to import for ──────────────────
    // session.user doesn't expose `id` in the default NextAuth types, but the
    // name and email are enough to confirm the right account is active.
    console.log("[MidvaleAutoImport] session user:", {
      name:  session?.user?.name  ?? "(no name)",
      email: session?.user?.email ?? "(no email)",
    });

    setPhase("importing");

    fetch("/api/spotify/import")
      .then(async r => {
        const body = await r.json();
        if (!r.ok) {
          // 401 most likely means the OAuth didn't create a new session —
          // the browser still has no valid auth cookie.
          const msg = body?.error ?? `HTTP ${r.status}`;
          console.error("[MidvaleAutoImport] import failed:", msg, body);
          setErrMsg(msg);
          setPhase("error");
        } else {
          console.log("[MidvaleAutoImport] import complete:", {
            imported:          body.imported,
            uniqueArtists:     body.uniqueArtists,
            genreDistribution: body.genreDistribution,
          });
          setPhase("done");
        }
      })
      .catch(err => {
        console.error("[MidvaleAutoImport] fetch error:", err);
        setErrMsg(String(err));
        setPhase("error");
      })
      .finally(() => {
        // Clean the ?import=1 param and re-run the server component so the
        // new world card appears.  We do this even on error so the user is not
        // stuck on the import screen.
        setTimeout(() => {
          router.replace("/midvale");
          router.refresh();
        }, phase === "error" ? 3000 : 1200);
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
          <div
            style={{
              width:        8,
              height:       8,
              borderRadius: "50%",
              background:   "#22d3ee",
              animation:    "midvale-pulse 1.4s ease-in-out infinite",
            }}
          />
          <p style={{ color: "rgba(255,255,255,0.80)", fontSize: 17, fontWeight: 500, margin: 0 }}>
            Building your music world…
          </p>
          <p style={{ color: "rgba(255,255,255,0.30)", fontSize: 12, margin: 0 }}>
            Importing tracks · classifying genres · this takes a minute
          </p>
        </>
      )}

      {phase === "done" && (
        <p style={{ color: "rgba(255,255,255,0.80)", fontSize: 17, fontWeight: 500 }}>
          World created ✓
        </p>
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

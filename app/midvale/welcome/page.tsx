"use client";

// /midvale/welcome — landing page after Spotify OAuth for a new roommate.
//
// Why a dedicated page instead of a ?import=1 query-param trick:
//   • No session guard required. The import API handles 401 itself.
//   • No useSearchParams (no Suspense boundary, no SSR/hydration timing gap).
//   • No useSession race: fires on mount, not after status resolves.
//   • Easy to debug: it IS the import UI, not an overlay that might not mount.
//
// Flow:
//   RoommateCard → signOut + signIn(spotify, callbackUrl="/midvale/welcome")
//   → Spotify OAuth (show_dialog=true)
//   → NextAuth callback sets session cookie for new user
//   → browser navigates to /midvale/welcome
//   → this page mounts, fires fetch("/api/spotify/import") immediately
//   → on success: router.replace("/midvale")

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Phase = "importing" | "done" | "no_songs" | "error";

export default function MidvaleWelcomePage() {
  const { data: session } = useSession();
  const router  = useRouter();
  const didRun  = useRef(false);
  const [phase,    setPhase]    = useState<Phase>("importing");
  const [imported, setImported] = useState(0);
  const [errMsg,   setErrMsg]   = useState("");

  useEffect(() => {
    // Single-fire guard — React Strict Mode double-invokes effects in dev,
    // but refs survive the unmount/remount cycle so this stays true.
    if (didRun.current) return;
    didRun.current = true;

    console.log("[MidvaleWelcome] mounted — starting import", {
      sessionUser: session?.user?.name ?? "(session not yet loaded — that's fine, cookie is present)",
    });

    fetch("/api/spotify/import")
      .then(async r => {
        const body = await r.json();

        console.log("[MidvaleWelcome] import response:", {
          status:       r.status,
          imported:     body.imported,
          dbTrackCount: body.dbTrackCount,
          noLikedSongs: body.noLikedSongs,
          error:        body.error,
        });

        if (!r.ok) {
          setErrMsg(body?.error ?? `HTTP ${r.status}`);
          setPhase("error");
          setTimeout(() => router.replace("/midvale"), 5000);
          return;
        }

        if (body.noLikedSongs || (body.imported ?? 0) === 0) {
          setPhase("no_songs");
          router.refresh();
          setTimeout(() => router.replace("/midvale"), 6000);
          return;
        }

        setImported(body.imported ?? 0);
        setPhase("done");
        // Invalidate the Next.js router cache so Midvale re-fetches fresh
        // server-component data (track counts) when we navigate there.
        router.refresh();
        // Brief pause so "World created" is readable, then land on Midvale.
        setTimeout(() => router.replace("/midvale"), 1800);
      })
      .catch(err => {
        console.error("[MidvaleWelcome] fetch error:", err);
        setErrMsg(String(err));
        setPhase("error");
        setTimeout(() => router.replace("/midvale"), 5000);
      });
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         400,
        background:     "#000",
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
            width:        8,
            height:       8,
            borderRadius: "50%",
            background:   "#22d3ee",
            animation:    "welcome-pulse 1.4s ease-in-out infinite",
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
            Spotify connected — no liked songs found
          </p>
          <p style={{
            color:     "rgba(255,255,255,0.35)",
            fontSize:  13,
            margin:    0,
            maxWidth:  340,
            textAlign: "center",
          }}>
            Like songs on Spotify first, then reconnect from Midvale.
            Only your Liked Songs library is imported.
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
          <p style={{
            color:     "rgba(255,255,255,0.30)",
            fontSize:  12,
            margin:    0,
            maxWidth:  320,
            textAlign: "center",
          }}>
            {errMsg || "Something went wrong. Try connecting again from Midvale."}
          </p>
          <p style={{ color: "rgba(255,255,255,0.20)", fontSize: 11, margin: 0 }}>
            Returning to Midvale…
          </p>
        </>
      )}

      <style>{`
        @keyframes welcome-pulse {
          0%, 100% { opacity: 0.25; transform: scale(0.8); }
          50%       { opacity: 1;    transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

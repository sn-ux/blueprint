"use client";

// MidvaleAutoImport — triggered when a roommate returns to /midvale after
// completing Spotify OAuth.  The callbackUrl in RoommateCard is set to
// "/midvale?import=1".  This component detects that flag, runs the import
// for the now-authenticated user, then cleans the URL and refreshes the page
// so the updated world card appears.

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function MidvaleAutoImport() {
  const { status } = useSession();
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const didImport     = useRef(false);
  const [phase, setPhase] = useState<"idle" | "importing" | "done">("idle");

  useEffect(() => {
    // Only fire once; only when the user is authenticated and ?import=1 is set.
    if (status !== "authenticated") return;
    if (searchParams.get("import") !== "1") return;
    if (didImport.current) return;
    didImport.current = true;

    setPhase("importing");

    fetch("/api/spotify/import")
      .then(r => r.json())
      .then(() => setPhase("done"))
      .catch(() => setPhase("done"))
      .finally(() => {
        // Remove ?import=1 from the URL and re-run the server component so
        // the new user's WorldCard shows their real data.
        router.replace("/midvale");
        router.refresh();
      });
  }, [status, searchParams, router]);

  if (phase === "idle") return null;

  return (
    <div
      style={{
        position:        "fixed",
        inset:           0,
        zIndex:          400,
        background:      "rgba(0,0,0,0.88)",
        display:         "flex",
        flexDirection:   "column",
        alignItems:      "center",
        justifyContent:  "center",
        gap:             20,
      }}
    >
      {phase === "importing" ? (
        <>
          {/* Minimal pulsing dot */}
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
      ) : (
        <p style={{ color: "rgba(255,255,255,0.80)", fontSize: 17, fontWeight: 500 }}>
          World created ✓
        </p>
      )}

      {/* Keyframe — injected inline so no global CSS file is needed */}
      <style>{`
        @keyframes midvale-pulse {
          0%, 100% { opacity: 0.25; transform: scale(0.8); }
          50%       { opacity: 1;    transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

// components/PlaylistButton.tsx
// Reusable playlist-push button shared by WorldSphere and the homepage.
//
// States
//   idle    → ListPlus icon (dimmed in genre color)
//   loading → three animated dots
//   success → checkmark, auto-reset by caller after ~2.5 s

"use client";

export function PlaylistButton({
  loading,
  success,
  onClick,
  color,
}: {
  loading: boolean;
  success: boolean;
  onClick: () => void;
  color:   string;
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      aria-label="Create a Spotify playlist from this tracklist"
      title={loading ? "Creating playlist…" : success ? "Playlist created!" : "Save tracklist to Spotify playlist"}
      disabled={loading || success}
      style={{
        flexShrink: 0,
        background: "none",
        border:     "none",
        padding:    "2px",
        cursor:     (loading || success) ? "default" : "pointer",
        color:      loading ? "rgba(255,255,255,0.22)" : color,
        opacity:    loading ? 0.55 : 1,
        transition: "color 0.20s ease, opacity 0.20s ease",
        display:    "flex",
        alignItems: "center",
        lineHeight: 1,
      }}
    >
      {loading ? (
        /* Three animated dots while creating */
        <svg width={19} height={17} viewBox="0 0 18 10" aria-hidden="true">
          {[0, 6, 12].map((cx, i) => (
            <circle key={i} cx={cx + 3} cy="5" r="1.6" fill="currentColor">
              <animate
                attributeName="opacity"
                values="0.25;1;0.25"
                dur="1.1s"
                repeatCount="indefinite"
                begin={`${i * 0.22}s`}
              />
            </circle>
          ))}
        </svg>
      ) : success ? (
        /* Checkmark on success */
        <svg
          width={18} height={18} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        /* ListPlus — three list lines + plus sign */
        <svg
          width={18} height={18} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6"  x2="15" y2="6"  />
          <line x1="3" y1="12" x2="15" y2="12" />
          <line x1="3" y1="18" x2="11" y2="18" />
          <line x1="19" y1="11" x2="19" y2="17" />
          <line x1="16" y1="14" x2="22" y2="14" />
        </svg>
      )}
    </button>
  );
}

/**
 * LiveEventsIcon — shared ticket icon for every live-events button and track marker.
 *
 * Paths are the Lucide "Ticket" icon (https://lucide.dev/icons/ticket),
 * inlined so no lucide-react dependency is needed.
 *
 * Props:
 *   size  — rendered width AND height in px (default 17 for buttons, pass 12 for inline markers)
 */
export default function LiveEventsIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Ticket body — rectangle with semicircular notches on each side */}
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      {/* Perforation / tear line */}
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}

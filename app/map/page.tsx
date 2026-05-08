/**
 * /map — Cinematic world map experience.
 *
 * Full-screen ambient sphere with no interactive UI.
 * Designed for investor demos, trailers, social clips, and ambient displays.
 *
 * Query params:
 *   ?mode=ambient   → gentle 16-second seamless loop
 *   ?mode=investor  → 42-second presentation sweep (default)
 *   ?mode=fast      → 16-second punchy sequence
 *
 * Controls:
 *   Space           → pause / resume
 *   Mouse movement  → subtle parallax only
 */

import CinematicPlayer from "@/components/CinematicPlayer";

// Always server-render fresh — the page itself has no cacheable content.
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ mode?: string }>;
}

export default async function MapPage({ searchParams }: Props) {
  const { mode } = await searchParams;
  return <CinematicPlayer mode={mode ?? "investor"} />;
}

import { NextResponse } from "next/server";

/**
 * GET /api/preview?track=TRACK_NAME&artist=ARTIST_NAME
 *
 * Searches Deezer from the server (no CORS issues) and returns the 30-second
 * preview MP3 URL for the best matching track.
 *
 * Returns: { previewUrl: string | null }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const track  = searchParams.get("track")?.trim();
  const artist = searchParams.get("artist")?.trim();

  if (!track || !artist) {
    return NextResponse.json({ previewUrl: null }, { status: 400 });
  }

  try {
    const q   = encodeURIComponent(`track:"${track}" artist:"${artist}"`);
    const url = `https://api.deezer.com/search?q=${q}&limit=1`;
    // no-store: Deezer CDN URLs contain time-limited HMAC tokens.
    // Always fetch fresh so we never serve an expired signed URL from cache.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ previewUrl: null });
    }
    const data = await res.json();
    const previewUrl: string | null = data?.data?.[0]?.preview ?? null;
    return NextResponse.json({ previewUrl });
  } catch {
    return NextResponse.json({ previewUrl: null });
  }
}

// GET /api/events/live?artists=<comma-separated artist names>
//
// Proxies the Ticketmaster Discovery API for upcoming CA music events.
// Returns: Record<normalizedArtistName, LiveEvent | null>
//
// Caching  : in-memory Map, 24-hour TTL per artist (persists across requests
//            on the same server instance — best-effort, resets on cold start).
// Rate limit: Ticketmaster allows 5 req/s.  We fire all uncached artists in
//            parallel using Promise.allSettled so the 429s are caught and
//            returned as null.  For a small personal app (<10 concurrent users,
//            <50 unique artists per genre) this is well within limits.
// Dedup    : normalized to lowercase+trim before lookup & storage.
// Cap      : 50 artists max per call to prevent abuse.

import { NextRequest, NextResponse } from "next/server";

// ── Shared types (also exported for WorldSphere) ──────────────────────────────
export type LiveEvent = {
  artistName: string;
  eventName:  string;
  city:       string;
  venue:      string;
  date:       string;  // "YYYY-MM-DD"
  url:        string;
};

// ── In-memory cache ───────────────────────────────────────────────────────────

type CacheEntry = { event: LiveEvent | null; cachedAt: number };

const CACHE     = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1_000;  // 24 h in ms
const MAX_ARTISTS = 50;

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of CACHE) {
    if (now - entry.cachedAt > CACHE_TTL) CACHE.delete(key);
  }
}

// ── Ticketmaster fetch (one artist) ──────────────────────────────────────────

async function fetchArtistEvent(
  artist:  string,
  apiKey:  string,
): Promise<LiveEvent | null> {
  try {
    const url = new URL(
      "https://app.ticketmaster.com/discovery/v2/events.json",
    );
    url.searchParams.set("apikey",             apiKey);
    url.searchParams.set("classificationName", "music");
    url.searchParams.set("countryCode",        "US");
    url.searchParams.set("stateCode",          "CA");
    url.searchParams.set("keyword",            artist);
    url.searchParams.set("sort",               "date,asc");
    url.searchParams.set("size",               "5");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;

    const data  = await res.json();
    const events = data?._embedded?.events;
    if (!Array.isArray(events) || events.length === 0) return null;

    const ev     = events[0];
    const venue0 = ev._embedded?.venues?.[0];
    return {
      artistName: artist,
      eventName:  ev.name                 ?? "",
      city:       venue0?.city?.name      ?? "",
      venue:      venue0?.name            ?? "",
      date:       ev.dates?.start?.localDate ?? "",
      url:        ev.url                  ?? "",
    };
  } catch {
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TICKETMASTER_API_KEY not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("artists") ?? "")
    .split(",")
    .map(a => a.trim())
    .filter(Boolean);

  // Deduplicate by normalized key, cap at MAX_ARTISTS
  const seen      = new Set<string>();
  const artists: string[] = [];
  for (const a of raw) {
    const key = a.toLowerCase();
    if (!seen.has(key)) { seen.add(key); artists.push(a); }
    if (artists.length >= MAX_ARTISTS) break;
  }

  if (artists.length === 0) {
    return NextResponse.json({}, { headers: { "Cache-Control": "no-store" } });
  }

  evictExpired();

  // Split: serve cached immediately, fetch the rest in parallel
  const result: Record<string, LiveEvent | null> = {};
  const needed:  string[] = [];

  for (const artist of artists) {
    const key   = artist.toLowerCase();
    const entry = CACHE.get(key);
    if (entry) {
      result[key] = entry.event;
    } else {
      needed.push(artist);
    }
  }

  if (needed.length > 0) {
    const settled = await Promise.allSettled(
      needed.map(a => fetchArtistEvent(a, apiKey)),
    );

    for (let i = 0; i < needed.length; i++) {
      const key = needed[i].toLowerCase();
      const res = settled[i];

      if (res.status === "fulfilled") {
        // Cache both positive hits AND confirmed nulls (artist has no CA events)
        CACHE.set(key, { event: res.value, cachedAt: Date.now() });
        result[key] = res.value;
      } else {
        // Network/parse error — do NOT cache so we retry next time
        result[key] = null;
      }
    }
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

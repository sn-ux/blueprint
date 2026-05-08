// GET /api/events/live?artists=<comma-separated artist names>
//
// Multi-provider live event search for upcoming CA music events.
// Returns: Record<normalizedArtistName, LiveEvent | null>
//
// Providers : Ticketmaster, SeatGeek, Bandsintown, Eventbrite (enabled by env vars).
// Caching   : in-memory Map, 24-hour TTL per artist (persists across requests on
//             same server instance — best-effort, resets on cold start).
// Dedup     : events are deduped across providers by (normalizedArtist|venue|date).
//             The earliest bookable event wins per artist.
// Rate limit: all provider fetches run in parallel via Promise.allSettled.
// Cap       : 50 artists max per call.

import { NextRequest, NextResponse } from "next/server";
import { getEnabledProviders           } from "@/lib/events/providers";
import type { LiveEvent, ProviderSearchParams } from "@/lib/events/types";

// Re-export LiveEvent so WorldSphere can import the type from this route file
// (WorldSphere currently defines its own local type, but re-exporting keeps
// things tidy if a future import is added).
export type { LiveEvent };

// ── In-memory cache ───────────────────────────────────────────────────────────

type CacheEntry = { event: LiveEvent | null; cachedAt: number };

const CACHE       = new Map<string, CacheEntry>();
const CACHE_TTL   = 24 * 60 * 60 * 1_000;   // 24 h in ms
const MAX_ARTISTS = 50;

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of CACHE) {
    if (now - entry.cachedAt > CACHE_TTL) CACHE.delete(key);
  }
}

// ── Deduplication helpers ─────────────────────────────────────────────────────

/** Stable key for cross-provider event dedup: same artist at same venue on same date. */
function eventKey(ev: LiveEvent): string {
  return `${ev.artistName.toLowerCase()}|${ev.venue.toLowerCase().trim()}|${ev.date}`;
}

// ── Multi-provider search (one artist) ───────────────────────────────────────

async function searchArtistEvents(
  artistName: string,
  params:     Omit<ProviderSearchParams, "artistName">,
): Promise<LiveEvent | null> {
  const providers = getEnabledProviders();

  if (providers.length === 0) {
    console.log(`[events] no providers enabled — check env vars`);
    return null;
  }

  console.log(
    `[events] querying ${providers.map(p => p.name).join(", ")} for "${artistName}"`,
  );

  // Fire all providers in parallel; collect settled results
  const settled = await Promise.allSettled(
    providers.map(p => p.search({ artistName, ...params })),
  );

  // Merge all results, deduping by (artist|venue|date)
  const seen   = new Set<string>();
  const merged: LiveEvent[] = [];

  for (let i = 0; i < providers.length; i++) {
    const result = settled[i];
    if (result.status === "rejected") {
      console.warn(`[events] provider "${providers[i].name}" threw:`, result.reason);
      continue;
    }
    const events = result.value;
    console.log(`[events] "${providers[i].name}" → ${events.length} events for "${artistName}"`);

    for (const ev of events) {
      const key = eventKey(ev);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(ev);
    }
  }

  if (merged.length === 0) {
    console.log(`[events] no valid events for "${artistName}"`);
    return null;
  }

  // Sort by date asc; prefer providers with direct ticket URLs (Ticketmaster first
  // as a tiebreaker since it has the most reliable primary ticket links).
  const PROVIDER_RANK: Record<string, number> = {
    ticketmaster: 0,
    seatgeek:     1,
    bandsintown:  2,
    eventbrite:   3,
  };

  merged.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (PROVIDER_RANK[a.provider] ?? 99) - (PROVIDER_RANK[b.provider] ?? 99);
  });

  const best = merged[0];
  console.log(
    `[events] ✓ "${artistName}" → "${best.eventName}" on ${best.date} via ${best.provider}`,
  );
  return best;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("artists") ?? "")
    .split(",")
    .map(a => a.trim())
    .filter(Boolean);

  // Deduplicate by normalized key, cap at MAX_ARTISTS
  const seen      = new Set<string>();
  const artists:  string[] = [];
  for (const a of raw) {
    const key = a.toLowerCase();
    if (!seen.has(key)) { seen.add(key); artists.push(a); }
    if (artists.length >= MAX_ARTISTS) break;
  }

  if (artists.length === 0) {
    return NextResponse.json({}, { headers: { "Cache-Control": "no-store" } });
  }

  evictExpired();

  const now:    Date   = new Date();
  const params: Omit<ProviderSearchParams, "artistName"> = {
    stateCode:   "CA",
    countryCode: "US",
    now,
  };

  console.log(`[events] request for ${artists.length} artist(s):`, artists.slice(0, 10));

  // Split: serve cached immediately, fetch the rest
  const result: Record<string, LiveEvent | null> = {};
  const needed:  string[] = [];

  for (const artist of artists) {
    const key   = artist.toLowerCase();
    const entry = CACHE.get(key);
    if (entry) {
      console.log(`[events] cache hit: "${artist}" → ${entry.event ? `✓ ${entry.event.provider}` : "null"}`);
      result[key] = entry.event;
    } else {
      needed.push(artist);
    }
  }

  if (needed.length > 0) {
    console.log(`[events] cache misses: ${needed.length} artist(s) to fetch`);

    const settled = await Promise.allSettled(
      needed.map(a => searchArtistEvents(a, params)),
    );

    for (let i = 0; i < needed.length; i++) {
      const key = needed[i].toLowerCase();
      const res = settled[i];

      if (res.status === "fulfilled") {
        CACHE.set(key, { event: res.value, cachedAt: Date.now() });
        result[key] = res.value;
      } else {
        // Network/parse error — do NOT cache so we retry next time
        console.warn(`[events] search failed for "${needed[i]}":`, res.reason);
        result[key] = null;
      }
    }
  }

  const hits = Object.values(result).filter(Boolean).length;
  console.log(`[events] returning ${hits} events out of ${artists.length} artists`);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

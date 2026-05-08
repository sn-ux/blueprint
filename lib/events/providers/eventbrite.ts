// Eventbrite v3 API
// Docs: https://www.eventbrite.com/platform/api
// Auth: Private OAuth token (EVENTBRITE_TOKEN) — create at:
//       https://www.eventbrite.com/platform/api → "Create API Key"
//       Use the "Private Token" (no OAuth flow needed for server-to-server).
// Coverage: Independent/DIY shows, venue-promoted events; weaker for
//           major touring acts (those use Ticketmaster/AXS primarily).
// Notes: Music category ID on Eventbrite is "103". Keyword matching is
//        imprecise — results are filtered by keyword presence in title/description.

import { EventProvider, LiveEvent, ProviderSearchParams } from "../types";

// Eventbrite music category ID
const MUSIC_CATEGORY = "103";

// Eventbrite status values that mean the event is effectively gone
const BAD_STATUSES = new Set(["canceled", "deleted", "ended", "completed"]);

export function createEventbriteProvider(token: string): EventProvider {
  return {
    name: "eventbrite",

    async search({ artistName, stateCode, countryCode, now }: ProviderSearchParams): Promise<LiveEvent[]> {
      try {
        const todayDate = now.toISOString().slice(0, 10);
        // Eventbrite uses ISO 8601 with timezone offset; UTC is safest
        const startDT = now.toISOString().replace(/\.\d{3}Z$/, "Z");

        const url = new URL("https://www.eventbriteapi.com/v3/events/search/");
        url.searchParams.set("q",                        artistName);
        url.searchParams.set("location.address",         `California, ${countryCode}`);
        url.searchParams.set("categories",               MUSIC_CATEGORY);
        url.searchParams.set("start_date.range_start",   startDT);
        url.searchParams.set("sort_by",                  "date");
        url.searchParams.set("expand",                   "venue");
        url.searchParams.set("page_size",                "10");
        url.searchParams.set("include_all_series_instances", "false");

        const res = await fetch(url.toString(), {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];

        const data = await res.json();
        const events = data?.events;
        if (!Array.isArray(events)) return [];

        const results: LiveEvent[] = [];

        for (const ev of events) {
          const status = (ev.status as string | undefined)?.toLowerCase();
          if (status && BAD_STATUSES.has(status)) continue;

          // Eventbrite start.local: "2024-01-15T20:00:00"
          const localStart = ev.start?.local as string | undefined;
          if (!localStart) continue;
          const date = localStart.slice(0, 10);
          if (date < todayDate) continue;

          const evUrl = ev.url as string | undefined;
          if (!evUrl) continue;

          // Filter to the requested state via venue
          const venue = ev.venue;
          const venueStateCode = (
            venue?.address?.region as string | undefined
          )?.toUpperCase();
          const venueCountry = (
            venue?.address?.country as string | undefined
          )?.toUpperCase();

          const inCountry = !venueCountry || venueCountry === countryCode.toUpperCase();
          const inState   = !venueStateCode || venueStateCode === stateCode.toUpperCase();
          if (!inCountry || !inState) continue;

          results.push({
            provider:  "eventbrite",
            artistName,
            eventName: ev.name?.text ?? ev.name?.html ?? "",
            venue:     venue?.name ?? "",
            city:      venue?.address?.city ?? "",
            state:     venueStateCode ?? stateCode,
            date,
            url:       evUrl,
            status:    status ?? "onsale",
          });
        }

        return results;
      } catch {
        return [];
      }
    },
  };
}

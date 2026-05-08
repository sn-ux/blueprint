// Ticketmaster Discovery API v2
// Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
// Auth: API key (TICKETMASTER_API_KEY) — free tier available at developer.ticketmaster.com
// Coverage: primary tickets, broad US coverage, strong CA listings

import { EventProvider, LiveEvent, ProviderSearchParams } from "../types";

const BAD_STATUSES = new Set(["cancelled", "postponed", "rescheduled", "offsale"]);

export function createTicketmasterProvider(apiKey: string): EventProvider {
  return {
    name: "ticketmaster",

    async search({ artistName, stateCode, countryCode, now }: ProviderSearchParams): Promise<LiveEvent[]> {
      try {
        const startDT   = now.toISOString().replace(/\.\d{3}Z$/, "Z"); // ISO without ms
        const todayDate = now.toISOString().slice(0, 10);

        const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
        url.searchParams.set("apikey",             apiKey);
        url.searchParams.set("classificationName", "music");
        url.searchParams.set("countryCode",        countryCode);
        url.searchParams.set("stateCode",          stateCode);
        url.searchParams.set("keyword",            artistName);
        url.searchParams.set("sort",               "date,asc");
        url.searchParams.set("size",               "5");
        url.searchParams.set("startDateTime",      startDT);

        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return [];

        const data   = await res.json();
        const events = data?._embedded?.events;
        if (!Array.isArray(events)) return [];

        const results: LiveEvent[] = [];

        for (const ev of events) {
          const date   = ev.dates?.start?.localDate as string | undefined;
          const status = (ev.dates?.status?.code as string | undefined)?.toLowerCase();
          const evUrl  = ev.url as string | undefined;

          if (!date || date < todayDate)                continue;
          if (status && BAD_STATUSES.has(status))       continue;
          if (!evUrl)                                   continue;

          const venue0 = ev._embedded?.venues?.[0];
          results.push({
            provider:  "ticketmaster",
            artistName,
            eventName: ev.name ?? "",
            venue:     venue0?.name           ?? "",
            city:      venue0?.city?.name     ?? "",
            state:     venue0?.state?.stateCode ?? stateCode,
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

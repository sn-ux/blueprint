// SeatGeek Platform API v2
// Docs: https://platform.seatgeek.com/
// Auth: client_id required (SEATGEEK_CLIENT_ID), client_secret optional but recommended
//       Register at: https://seatgeek.com/account/develop
// Coverage: primary + resale tickets; strong concert coverage across CA
// Notes: Free tier available. client_secret unlocks higher rate limits.

import { EventProvider, LiveEvent, ProviderSearchParams } from "../types";

export function createSeatGeekProvider(clientId: string, clientSecret?: string): EventProvider {
  return {
    name: "seatgeek",

    async search({ artistName, stateCode, countryCode, now }: ProviderSearchParams): Promise<LiveEvent[]> {
      try {
        const todayDate = now.toISOString().slice(0, 10);
        // SeatGeek uses UTC datetime without ms: "YYYY-MM-DDTHH:MM:SS"
        const nowUTC = now.toISOString().slice(0, 19);

        const url = new URL("https://api.seatgeek.com/2/events");
        url.searchParams.set("client_id",            clientId);
        if (clientSecret) url.searchParams.set("client_secret", clientSecret);
        url.searchParams.set("q",                    artistName);
        url.searchParams.set("type",                 "concert");
        url.searchParams.set("datetime_utc.gte",     nowUTC);
        url.searchParams.set("sort",                 "datetime_utc.asc");
        url.searchParams.set("per_page",             "10"); // fetch more to filter CA
        url.searchParams.set("taxonomies.name",      "concert");

        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return [];

        const data = await res.json();
        const events = data?.events;
        if (!Array.isArray(events)) return [];

        const results: LiveEvent[] = [];

        for (const ev of events) {
          // SeatGeek datetime_local is "YYYY-MM-DDTHH:MM:SS" in venue local time
          const localDT = ev.datetime_local as string | undefined;
          if (!localDT) continue;
          const date = localDT.slice(0, 10);
          if (date < todayDate) continue;

          const venue = ev.venue;
          // Filter to the requested state — SeatGeek stores full state name ("California")
          // and a two-letter state_code. Accept either form.
          const venueState     = (venue?.state      as string | undefined)?.toLowerCase();
          const venueStateCode = (venue?.state_code as string | undefined)?.toUpperCase();
          const venueCountry   = (venue?.country    as string | undefined)?.toUpperCase();

          const inCountry = !venueCountry || venueCountry === countryCode.toUpperCase() || venueCountry === "US";
          const inState   =
            venueStateCode === stateCode.toUpperCase() ||
            (stateCode.toUpperCase() === "CA" && venueState === "california");

          if (!inCountry || !inState) continue;

          const evUrl = ev.url as string | undefined;
          if (!evUrl) continue;

          // visible=false means the event page is hidden / sold out entirely
          if (ev.visible === false) continue;

          results.push({
            provider:  "seatgeek",
            artistName,
            eventName: ev.title ?? ev.short_title ?? "",
            venue:     venue?.name ?? "",
            city:      venue?.city ?? "",
            state:     venueStateCode ?? stateCode,
            date,
            url:       evUrl,
            status:    "onsale",
          });
        }

        return results;
      } catch {
        return [];
      }
    },
  };
}

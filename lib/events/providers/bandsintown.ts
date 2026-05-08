// Bandsintown for Artists / Developers API v3
// Docs: https://app.swaggerhub.com/apis/Bandsintown/PublicAPI/3.0.0
// Auth: app_id (BANDSINTOWN_APP_ID) — obtained by registering your app at
//       https://bandsintown.com/contact (select "Developer / API" in subject)
// Coverage: artist-centric event data; strong indie/alternative coverage
// Notes: Artist lookup is by exact name (URL-encoded). Returns upcoming events
//        globally — we filter to CA state client-side.

import { EventProvider, LiveEvent, ProviderSearchParams } from "../types";

export function createBandsintownProvider(appId: string): EventProvider {
  return {
    name: "bandsintown",

    async search({ artistName, stateCode, countryCode, now }: ProviderSearchParams): Promise<LiveEvent[]> {
      try {
        const todayDate = now.toISOString().slice(0, 10);
        const encoded   = encodeURIComponent(artistName);

        const url =
          `https://rest.bandsintown.com/artists/${encoded}/events` +
          `?app_id=${encodeURIComponent(appId)}&date=upcoming`;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return [];

        const events = await res.json();
        // BIT returns a plain array; an error response is an object with .error_message
        if (!Array.isArray(events)) return [];

        const results: LiveEvent[] = [];

        for (const ev of events) {
          // BIT datetime: "2024-01-15T20:00:00" in local time
          const datetime = ev.datetime as string | undefined;
          if (!datetime) continue;
          const date = datetime.slice(0, 10);
          if (date < todayDate) continue;

          const venue = ev.venue;

          // BIT venue.region = 2-letter US state abbreviation
          // BIT venue.country = full country name ("United States")
          const region  = (venue?.region  as string | undefined)?.toUpperCase();
          const country = (venue?.country as string | undefined);

          const inCountry = !country || country === "United States";
          const inState   = region === stateCode.toUpperCase();
          if (!inCountry || !inState) continue;

          // BIT offers array: [{ type: "Tickets", url: "...", status: "available" | "unavailable" }]
          const offers = ev.offers as Array<{ type: string; url: string; status: string }> | undefined;
          const ticketOffer = Array.isArray(offers)
            ? offers.find(o => o.type === "Tickets" && o.status === "available")
            : undefined;

          const evUrl = ticketOffer?.url ?? (ev.url as string | undefined);
          if (!evUrl) continue;

          results.push({
            provider:  "bandsintown",
            artistName,
            eventName: ev.title?.trim()
              ? ev.title
              : `${artistName} at ${venue?.name ?? ""}`,
            venue:     venue?.name ?? "",
            city:      venue?.city ?? "",
            state:     region ?? stateCode,
            date,
            url:       evUrl,
            status:    ticketOffer ? "onsale" : "unknown",
          });
        }

        return results;
      } catch {
        return [];
      }
    },
  };
}

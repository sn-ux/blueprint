// Provider registry — reads env vars and returns only the enabled providers.
// Providers whose required env vars are missing are logged and skipped.

import { EventProvider } from "../types";
import { createTicketmasterProvider } from "./ticketmaster";
import { createSeatGeekProvider      } from "./seatgeek";
import { createBandsintownProvider   } from "./bandsintown";
import { createEventbriteProvider    } from "./eventbrite";

// Stubs imported only so their doc comments are accessible; they export nothing.
import "./songkick";
import "./axs";
import "./stubhub";
import "./dice";

export function getEnabledProviders(): EventProvider[] {
  const providers: EventProvider[] = [];
  const {
    TICKETMASTER_API_KEY,
    SEATGEEK_CLIENT_ID,
    SEATGEEK_CLIENT_SECRET,
    BANDSINTOWN_APP_ID,
    EVENTBRITE_TOKEN,
    SONGKICK_API_KEY,
  } = process.env;

  // ── Ticketmaster ─────────────────────────────────────────────────────────
  if (TICKETMASTER_API_KEY) {
    providers.push(createTicketmasterProvider(TICKETMASTER_API_KEY));
  } else {
    console.log("[events] provider skipped: ticketmaster — missing TICKETMASTER_API_KEY");
  }

  // ── SeatGeek ─────────────────────────────────────────────────────────────
  if (SEATGEEK_CLIENT_ID) {
    providers.push(createSeatGeekProvider(SEATGEEK_CLIENT_ID, SEATGEEK_CLIENT_SECRET));
  } else {
    console.log("[events] provider skipped: seatgeek — missing SEATGEEK_CLIENT_ID");
  }

  // ── Bandsintown ──────────────────────────────────────────────────────────
  if (BANDSINTOWN_APP_ID) {
    providers.push(createBandsintownProvider(BANDSINTOWN_APP_ID));
  } else {
    console.log("[events] provider skipped: bandsintown — missing BANDSINTOWN_APP_ID");
  }

  // ── Eventbrite ───────────────────────────────────────────────────────────
  if (EVENTBRITE_TOKEN) {
    providers.push(createEventbriteProvider(EVENTBRITE_TOKEN));
  } else {
    console.log("[events] provider skipped: eventbrite — missing EVENTBRITE_TOKEN");
  }

  // ── Songkick (closed API — not implemented) ──────────────────────────────
  if (SONGKICK_API_KEY) {
    console.log("[events] provider skipped: songkick — API closed to new developers since ~2017; key ignored");
  }

  // AXS, StubHub, DICE: no public API — not implemented (see stub files).

  return providers;
}

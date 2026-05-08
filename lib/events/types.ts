// Shared types for the multi-provider live events system.

export type LiveEvent = {
  provider:   string;    // "ticketmaster" | "seatgeek" | "bandsintown" | "eventbrite"
  artistName: string;
  eventName:  string;
  venue:      string;
  city:       string;
  state:      string;    // "CA"
  date:       string;    // "YYYY-MM-DD"
  url:        string;
  status?:    string;    // "onsale" | "offsale" | "cancelled" | etc.
};

export interface ProviderSearchParams {
  artistName:  string;
  stateCode:   string;   // "CA"
  countryCode: string;   // "US"
  now:         Date;
}

export interface EventProvider {
  name:   string;
  search: (params: ProviderSearchParams) => Promise<LiveEvent[]>;
}

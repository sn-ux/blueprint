// StubHub API — STUB (resale market only; no primary event data)
//
// Status: ❌ Not suitable for primary event discovery.
//
// StubHub does have a documented API (StubHub Partner API v3) accessible at
// https://developer.stubhub.com, but it is a secondary/resale ticket marketplace.
//
// Problems with using it here:
// 1. Returns resale inventory — the same event may appear hundreds of times
//    at wildly varying prices.
// 2. Application requires approval from StubHub Partner team (not self-serve).
// 3. The API is designed for integration into resale platforms, not for
//    discovering "is this artist playing in CA?"
//
// Required env var (if approved): STUBHUB_API_KEY
//
// If you obtain StubHub partner API access and want to integrate it, the
// search endpoint is:
//   GET https://api.stubhub.com/sellers/search/events/v3
//     ?q={artist}&venue.stateCode=CA&eventDateFrom={ISO}&sort=EventDate+asc
//     Authorization: Bearer {token}
//
// This stub is intentionally not implemented because the data model does not
// align with the "earliest bookable upcoming event" use case.

// No exports — provider is not registered.
export {};

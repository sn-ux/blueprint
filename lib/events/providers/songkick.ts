// Songkick API — STUB (API closed to new developers)
//
// Status: ❌ Not available for new integrations.
//
// Songkick had a public REST API (v3.0) but stopped accepting new API key
// requests around 2017 when they were acquired. Existing partners were
// grandfathered in, but there is no public signup path.
//
// Docs (archived): https://www.songkick.com/developer
// Required env var: SONGKICK_API_KEY
//
// If you have an existing Songkick API key from before the closure, set
// SONGKICK_API_KEY in your environment. This stub will activate the provider.
//
// Implementation sketch (if key available):
//   GET https://api.songkick.com/api/3.0/events.json
//     ?apikey={key}&location=sk:26330   // 26330 = Los Angeles metro area
//     &artist_name={artist}
//     &min_date={YYYY-MM-DD}
//     &type=Concert,Festival
//     &per_page=5
//
// The Songkick API is NOT being implemented here because there is no legal
// path for new developers to obtain an API key. This file is a documented
// placeholder in case access becomes available in the future.

// No exports — provider is intentionally not registered.
// The index.ts logs a skip message when SONGKICK_API_KEY is set.
export {};

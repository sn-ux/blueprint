/**
 * End-to-end trace for 21 Savage rawGenre="unknown".
 *
 * Step 1 — DB: get exact spotifyIds for 21 Savage tracks
 * Step 2 — /v1/tracks?ids: get full track objects → exact artist IDs
 * Step 3 — /v1/artists/{id} individual: log FULL raw JSON
 * Step 4 — /v1/artists?ids= batch: log FULL raw JSON, compare with step 3
 * Step 5 — Simulate both old and new import code paths
 * Step 6 — Try OAuth token (from stored refresh_token) vs Client Credentials
 *
 * Run: npx tsx scripts/trace-21-savage.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env") });

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

import { prisma } from "../lib/prisma";

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function getClientCredToken(): Promise<string> {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const d = await res.json() as any;
  if (!d.access_token) throw new Error("CC token failed: " + JSON.stringify(d));
  return d.access_token;
}

async function getOAuthToken(): Promise<string | null> {
  // Use the stored refresh_token from the DB (same path as the import route)
  const account = await prisma.account.findFirst({
    where: { provider: "spotify" },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });

  if (!account) { console.log("  [oauth] No Spotify account in DB"); return null; }
  console.log(`  [oauth] Account id=${account.id}`);
  console.log(`  [oauth] expires_at=${account.expires_at}  now=${Math.floor(Date.now()/1000)}`);
  console.log(`  [oauth] Token expired: ${account.expires_at ? account.expires_at < Math.floor(Date.now()/1000) : "unknown"}`);

  if (!account.refresh_token) { console.log("  [oauth] No refresh_token"); return null; }

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.refresh_token }).toString(),
  });
  const d = await res.json() as any;
  if (!d.access_token) { console.log("  [oauth] Refresh failed:", JSON.stringify(d)); return null; }
  console.log("  [oauth] Refreshed successfully");
  return d.access_token;
}

// ── Generic fetch ─────────────────────────────────────────────────────────────

async function sf(token: string, path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1 — DB: exact spotifyIds for 21 Savage tracks
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n╔══ STEP 1: DB rows for artist='21 Savage' ══╗");
  const dbTracks = await prisma.track.findMany({
    where: { artist: "21 Savage" },
    select: { spotifyId: true, name: true, rawGenre: true, blueprintWorld: true, blueprintSubgenre: true },
    take: 10,
  });
  console.log(`Found ${dbTracks.length} tracks with artist='21 Savage'`);
  dbTracks.forEach(t =>
    console.log(`  spotifyId=${t.spotifyId}  rawGenre="${t.rawGenre}"  world="${t.blueprintWorld}"  name="${t.name}"`)
  );

  const trackIds = dbTracks.map(t => t.spotifyId);
  if (!trackIds.length) { console.log("No tracks found — aborting"); process.exit(1); }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 2 — Get tokens
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n╔══ STEP 2: Tokens ══╗");
  const ccToken = await getClientCredToken();
  console.log("  [cc] Client Credentials token: OK");
  const oauthToken = await getOAuthToken();

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 3 — /v1/tracks?ids= → extract EXACT artist IDs Spotify gives us
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n╔══ STEP 3: /v1/tracks?ids= → extract artist IDs ══╗");
  const { status: tStatus, body: tBody } = await sf(
    ccToken,
    `/tracks?ids=${trackIds.slice(0, 5).join(",")}`
  );
  console.log(`  HTTP ${tStatus}`);

  const artistsOnTracks = new Map<string, string>(); // id → name
  for (const t of tBody?.tracks ?? []) {
    if (!t) continue;
    console.log(`\n  Track: "${t.name}"`);
    for (const a of t.artists ?? []) {
      console.log(`    artist: id=${a.id}  name="${a.name}"`);
      artistsOnTracks.set(a.id, a.name);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 4 — /v1/artists/{id} individually → log FULL raw JSON
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n╔══ STEP 4: /v1/artists/{id} — INDIVIDUAL calls, FULL response ══╗");

  for (const [id, name] of artistsOnTracks) {
    console.log(`\n  ── ${name} (${id}) ──`);

    // Client Credentials
    const { status: ccS, body: ccB } = await sf(ccToken, `/artists/${id}`);
    console.log(`  [CC]    HTTP ${ccS}`);
    console.log(`  [CC]    genres=${JSON.stringify(ccB?.genres)}`);
    console.log(`  [CC]    popularity=${ccB?.popularity}  followers=${ccB?.followers?.total}`);
    if (ccB?.genres === undefined) console.log(`  [CC]    ⚠ genres KEY IS MISSING from response`);
    if (ccB?.genres?.length === 0) console.log(`  [CC]    ⚠ genres[] IS EMPTY ARRAY`);

    // OAuth token (same path as import route)
    if (oauthToken) {
      const { status: oS, body: oB } = await sf(oauthToken, `/artists/${id}`);
      console.log(`  [OAuth] HTTP ${oS}`);
      console.log(`  [OAuth] genres=${JSON.stringify(oB?.genres)}`);
      if (JSON.stringify(ccB?.genres) !== JSON.stringify(oB?.genres)) {
        console.log(`  ⚠⚠ DIFFERENCE BETWEEN CC AND OAUTH TOKENS ⚠⚠`);
      } else {
        console.log(`  [same genres on both tokens]`);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 5 — /v1/artists?ids= BATCH → log FULL raw JSON, compare with step 4
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n╔══ STEP 5: /v1/artists?ids= — BATCH call, compare with individual ══╗");
  const allIds = Array.from(artistsOnTracks.keys());
  const { status: bStatus, body: bBody } = await sf(ccToken, `/artists?ids=${allIds.join(",")}`);
  console.log(`  HTTP ${bStatus}`);
  for (const a of bBody?.artists ?? []) {
    if (!a) { console.log("  ⚠ null artist in batch response"); continue; }
    const indivGenres = "see step 4"; // already logged above
    console.log(`  ${a.name.padEnd(25)} id=${a.id}  genres=${JSON.stringify(a.genres)}`);
    if (a.genres === undefined) console.log(`    ⚠ genres KEY MISSING in batch response for ${a.name}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 6 — Simulate OLD import code path (pre-fix)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n╔══ STEP 6: Simulate OLD import code path ══╗");
  console.log("  Old code: Map<string, string>, artistGenreMap.set(id, artist?.genres?.[0] || 'unknown')");
  const oldMap = new Map<string, string>();
  for (const a of bBody?.artists ?? []) {
    if (!a) continue;
    const val = a?.genres?.[0] || "unknown";
    oldMap.set(a.id, val);
    console.log(`  Old: ${a.name.padEnd(25)} → "${val}"`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 7 — Simulate NEW import code path (post-fix)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n╔══ STEP 7: Simulate NEW import code path ══╗");
  console.log("  New code: Map<string, string[]>, artistGenreMap.set(id, artist?.genres ?? [])");
  console.log("  Then: classifyGenres(allGenres) where allGenres = flatMap of all artists' genres");

  const { classifyGenres } = await import("../lib/blueprint-taxonomy");
  const newMap = new Map<string, string[]>();
  for (const a of bBody?.artists ?? []) {
    if (!a) continue;
    newMap.set(a.id, a?.genres ?? []);
    console.log(`  New map: ${a.name.padEnd(25)} → ${JSON.stringify(a?.genres ?? [])}`);
  }

  // For the first 21 Savage track, simulate classification
  const firstDbTrack = dbTracks[0];
  const { body: singleTrackBody } = await sf(ccToken, `/tracks/${firstDbTrack.spotifyId}`);
  const trackArtistIds: string[] = (singleTrackBody?.artists ?? []).map((a: any) => a.id);
  const allGenresForTrack = trackArtistIds.flatMap(id => newMap.get(id) ?? []);
  const classified = classifyGenres(allGenresForTrack);
  console.log(`\n  For track "${firstDbTrack.name}":`);
  console.log(`    Artist IDs: ${JSON.stringify(trackArtistIds)}`);
  console.log(`    Combined genres: ${JSON.stringify(allGenresForTrack)}`);
  console.log(`    classifyGenres result: ${JSON.stringify(classified)}`);
  console.log(`    DB currently stores: rawGenre="${firstDbTrack.rawGenre}", world="${firstDbTrack.blueprintWorld}"`);

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 8 — Check whether any 21 Savage artist ID has EVER had genres
  //          by looking at artists on 21 Savage-as-feature tracks
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n╔══ STEP 8: Are the 21 Savage artist IDs consistent across all his tracks? ══╗");
  const allDbTrackIds = dbTracks.map(t => t.spotifyId);
  const { body: allTracksBody } = await sf(ccToken, `/tracks?ids=${allDbTrackIds.join(",")}`);
  const artistIdSet = new Set<string>();
  for (const t of allTracksBody?.tracks ?? []) {
    for (const a of t?.artists ?? []) {
      if (a.name === "21 Savage") artistIdSet.add(a.id);
    }
  }
  console.log(`  Unique Spotify IDs used for "21 Savage" across his tracks:`);
  artistIdSet.forEach(id => console.log(`    ${id}`));
  if (artistIdSet.size > 1) {
    console.log("  ⚠⚠ MULTIPLE IDs — might explain discrepancy ⚠⚠");
  } else {
    console.log("  [single ID — consistent]");
  }

  console.log("\n╔══ SUMMARY ══╗");
  console.log("  DB rawGenre for 21 Savage tracks: 'unknown'");
  console.log("  API genres[] for 21 Savage ID:    " + JSON.stringify(bBody?.artists?.find((a: any) => a?.name === "21 Savage")?.genres));
  console.log("  Old code would store:              '" + (oldMap.get(Array.from(artistIdSet)[0]) ?? "—") + "'");
  console.log("  New code classifyGenres result:    " + classified.blueprintWorld);
}

main()
  .catch(e => { console.error("FATAL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

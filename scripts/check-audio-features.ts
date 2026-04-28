/**
 * Test whether /v1/audio-features works with the OAuth token from DB.
 * Also tests /v1/audio-features?ids= batch form.
 * Run: npx tsx scripts/check-audio-features.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env") });

import { prisma } from "../lib/prisma";

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

async function refreshToken(refreshTok: string): Promise<string> {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshTok }).toString(),
  });
  const d = await res.json() as any;
  if (!d.access_token) throw new Error("Refresh failed: " + JSON.stringify(d));
  return d.access_token;
}

async function sf(token: string, path: string) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return { status: res.status, body: (() => { try { return JSON.parse(text); } catch { return text; } })() };
}

async function main() {
  const account = await prisma.account.findFirst({
    where: { provider: "spotify" },
    select: { refresh_token: true, scope: true },
  });

  if (!account?.refresh_token) throw new Error("No Spotify account in DB");

  console.log("Scopes on file:", account.scope);
  const token = await refreshToken(account.refresh_token);
  console.log("OAuth token refreshed ✓\n");

  // ── Grab a few track IDs from DB ──────────────────────────────────────────
  const tracks = await prisma.track.findMany({ take: 5, select: { spotifyId: true, name: true } });
  const ids = tracks.map(t => t.spotifyId);

  console.log("=== Single track audio-features ===");
  const { status: s1, body: b1 } = await sf(token, `/audio-features/${ids[0]}`);
  console.log(`  /audio-features/${ids[0]} → HTTP ${s1}`);
  if (s1 === 200) {
    console.log(`  energy=${b1.energy}  danceability=${b1.danceability}  valence=${b1.valence}  tempo=${b1.tempo}`);
    console.log(`  All keys: ${Object.keys(b1).join(", ")}`);
  } else {
    console.log(`  Response:`, JSON.stringify(b1));
  }

  console.log("\n=== Batch audio-features (?ids=) ===");
  const { status: s2, body: b2 } = await sf(token, `/audio-features?ids=${ids.join(",")}`);
  console.log(`  HTTP ${s2}`);
  if (s2 === 200) {
    for (const f of b2?.audio_features ?? []) {
      if (!f) { console.log("  null entry"); continue; }
      const track = tracks.find(t => t.spotifyId === f.id);
      console.log(`  "${track?.name}" → energy=${f.energy}  danceability=${f.danceability}  valence=${f.valence}`);
    }
  } else {
    console.log(`  Response:`, JSON.stringify(b2));
  }
}

main()
  .catch(e => { console.error("FATAL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

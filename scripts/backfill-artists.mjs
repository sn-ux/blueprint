/**
 * Hydrates artist identity and profile images.
 *
 *   node --import ./scripts/register.mjs scripts/backfill-artists.mjs
 *
 * Two passes, both batched fifty at a time. GET /v1/tracks carries the artist
 * id the import discarded; GET /v1/artists carries the picture, which no track
 * payload ever contains. Images are stored on the rows rather than fetched per
 * card, so opening the feed makes no external calls at all.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function accessToken() {
  const accounts = await prisma.account.findMany({
    where: { provider: "spotify", refresh_token: { not: null } },
    select: { id: true, refresh_token: true },
  });
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");
  for (const a of accounts) {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: a.refresh_token }),
    });
    if (!res.ok) continue;
    const json = await res.json();
    if (json.access_token) {
      await prisma.account.update({
        where: { id: a.id },
        data: { access_token: json.access_token, refresh_token: json.refresh_token ?? a.refresh_token },
      });
      return json.access_token;
    }
  }
  throw new Error("no account could refresh a Spotify token");
}

const token = await accessToken();
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * Writes go one at a time with a retry.
 *
 * Fifty concurrent updateMany calls was enough to have Neon drop the
 * connection mid-run (P1001). Throughput here is bounded by Spotify's rate
 * limit anyway, so there is nothing to gain from parallel writes.
 */
async function write(fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await fn(); } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function spotify(url) {
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after") ?? "2");
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  return res.ok ? res.json() : null;
}

// ── Pass 1: artist ids from the track payload ───────────────────────────────
const needIds = [...new Set((await prisma.track.findMany({
  where: { artistId: null }, select: { spotifyId: true }, distinct: ["spotifyId"],
})).map((t) => t.spotifyId))];
console.log(`${needIds.length.toLocaleString()} tracks need an artist id`);

let linked = 0;
const batches = chunk(needIds, 50);
for (let i = 0; i < batches.length; i++) {
  const json = await spotify(`https://api.spotify.com/v1/tracks?ids=${batches[i].join(",")}`);
  if (!json) continue;
  const writes = [];
  for (const t of json.tracks ?? []) {
    const artistId = t?.artists?.[0]?.id;
    if (t?.id && artistId) writes.push({ spotifyId: t.id, artistId });
  }
  for (const w of writes) {
    await write(() => prisma.track.updateMany({ where: { spotifyId: w.spotifyId }, data: { artistId: w.artistId } }));
  }
  linked += writes.length;
  if (i % 50 === 0 || i === batches.length - 1) console.log(`  ids ${i + 1}/${batches.length} — ${linked.toLocaleString()} linked`);
}

// ── Pass 2: images from the artist endpoint ─────────────────────────────────
const artistIds = [...new Set((await prisma.track.findMany({
  where: { artistId: { not: null }, artistImageUrl: null },
  select: { artistId: true }, distinct: ["artistId"],
})).map((t) => t.artistId))];
console.log(`\n${artistIds.length.toLocaleString()} distinct artists need an image`);

let withImage = 0, withoutImage = 0;
const aBatches = chunk(artistIds, 50);
for (let i = 0; i < aBatches.length; i++) {
  const json = await spotify(`https://api.spotify.com/v1/artists?ids=${aBatches[i].join(",")}`);
  if (!json) continue;
  const writes = [];
  for (const a of json.artists ?? []) {
    if (!a?.id) continue;
    // Spotify returns images largest first; the middle one is plenty for a card.
    const img = a.images?.[1]?.url ?? a.images?.[0]?.url ?? null;
    if (img) { writes.push({ artistId: a.id, artistImageUrl: img }); withImage++; }
    else withoutImage++;
  }
  for (const w of writes) {
    await write(() => prisma.track.updateMany({ where: { artistId: w.artistId }, data: { artistImageUrl: w.artistImageUrl } }));
  }
  if (i % 25 === 0 || i === aBatches.length - 1) console.log(`  images ${i + 1}/${aBatches.length} — ${withImage.toLocaleString()} resolved`);
}

const total = await prisma.track.count();
const withArtistImg = await prisma.track.count({ where: { artistImageUrl: { not: null } } });
console.log(`\nartists with an image: ${withImage.toLocaleString()}, without: ${withoutImage.toLocaleString()}`);
console.log(`rows carrying an artist image: ${withArtistImg.toLocaleString()} / ${total.toLocaleString()}`);
await prisma.$disconnect();

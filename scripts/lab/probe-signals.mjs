/**
 * What the three behavioural endpoints actually return for these accounts.
 *
 * Read-only, with each person's own credentials, exactly as the importer
 * authenticates. Nothing is written.
 */
import axios from "axios";
import { getSpotifyToken } from "../../lib/spotify-token.ts";
import { prisma } from "../../lib/prisma.ts";

const users = await prisma.user.findMany({
  where: { midvaleHidden: false, tracks: { some: {} } },
  select: { id: true, name: true },
});

const get = async (token, url) => {
  try {
    const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
    return { ok: true, data: r.data };
  } catch (e) {
    return {
      ok: false,
      status: e?.response?.status,
      reason: e?.response?.data?.error?.message ?? String(e).slice(0, 80),
    };
  }
};

for (const u of users) {
  const got = await getSpotifyToken(u.id).catch(() => null);
  if (!got?.accessToken) { console.log(`${u.name}: no usable token`); continue; }
  const token = got.accessToken;
  console.log(`\n=== ${u.name} ===`);
  const scopes = (got.scope ?? "").split(/\s+/).filter(Boolean);
  console.log(`  granted scopes: ${scopes.join(" ") || "(none recorded)"}`);
  console.log(`  user-top-read: ${scopes.includes("user-top-read") ? "yes" : "NO"}   ` +
    `user-read-recently-played: ${scopes.includes("user-read-recently-played") ? "yes" : "NO"}`);

  for (const range of ["short_term", "medium_term", "long_term"]) {
    const a = await get(token, `https://api.spotify.com/v1/me/top/artists?limit=50&time_range=${range}`);
    const t = await get(token, `https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=${range}`);
    console.log(`  top artists ${range.padEnd(12)} ${a.ok ? `${a.data.items.length} of ${a.data.total}` : `FAILED ${a.status} ${a.reason}`}`);
    console.log(`  top tracks  ${range.padEnd(12)} ${t.ok ? `${t.data.items.length} of ${t.data.total}` : `FAILED ${t.status} ${t.reason}`}`);
    if (a.ok && a.data.items[0]) {
      const x = a.data.items[0];
      console.log(`      e.g. #1 ${x.name}  genres=[${(x.genres ?? []).slice(0, 3).join(", ")}]  popularity=${x.popularity}`);
    }
  }

  const rp = await get(token, "https://api.spotify.com/v1/me/player/recently-played?limit=50");
  console.log(`  recently played          ${rp.ok ? `${rp.data.items.length} items` : `FAILED ${rp.status} ${rp.reason}`}`);
  if (rp.ok && rp.data.items?.[0]) {
    const i = rp.data.items[0];
    console.log(`      e.g. ${i.track?.name} — ${i.track?.artists?.[0]?.name} at ${i.played_at}`);
    const times = rp.data.items.map((x) => x.played_at).sort();
    console.log(`      span ${times[0]} .. ${times[times.length - 1]}`);
  }
}

await prisma.$disconnect();

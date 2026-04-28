import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env") });
import { prisma } from "../lib/prisma";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

async function main() {
  const account = await prisma.account.findFirst({ where: { provider: "spotify" }, select: { refresh_token: true } });
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${account!.refresh_token}`,
  });
  const { access_token } = await tokenRes.json() as any;

  const res = await fetch("https://api.spotify.com/v1/me/tracks?limit=1", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const data = await res.json() as any;
  const item = data.items?.[0];
  console.log("Keys on track object from /v1/me/tracks:");
  console.log(JSON.stringify(Object.keys(item?.track ?? {}), null, 2));
  console.log("popularity:", item?.track?.popularity);
  console.log("explicit:", item?.track?.explicit);
  console.log("duration_ms:", item?.track?.duration_ms);
}
main().catch(console.error).finally(() => prisma.$disconnect());

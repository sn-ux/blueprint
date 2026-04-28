import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env") });

import { prisma } from "../lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  const accounts = await prisma.account.findMany({
    select: { userId: true, provider: true, providerAccountId: true, scope: true, expires_at: true },
  });

  const sessions = await prisma.session.findMany({
    select: { userId: true, expires: true },
    orderBy: { expires: "desc" },
    take: 5,
  });

  const trackCounts = await prisma.track.groupBy({
    by: ["userId"],
    _count: { id: true },
  });

  console.log("=== Users ===");
  users.forEach(u => console.log(`  id=${u.id}  name="${u.name}"  email="${u.email}"`));

  console.log("\n=== Accounts (OAuth rows) ===");
  accounts.forEach(a => console.log(`  userId=${a.userId}  provider=${a.provider}  providerAccountId=${a.providerAccountId}  scope="${a.scope}"  expires_at=${a.expires_at}`));

  console.log("\n=== Sessions (latest 5) ===");
  sessions.forEach(s => console.log(`  userId=${s.userId}  expires=${s.expires}`));

  console.log("\n=== Track counts per user ===");
  trackCounts.forEach(t => console.log(`  userId=${t.userId}  tracks=${t._count.id}`));

  console.log("\n=== Summary ===");
  console.log(`  ${users.length} user(s) in DB`);
  console.log(`  ${accounts.length} OAuth account(s) in DB`);
  const spotifyAccounts = accounts.filter(a => a.provider === "spotify");
  console.log(`  ${spotifyAccounts.length} Spotify account(s)`);
  console.log(`  Multiple users supported structurally: ${users.length > 1 || "yes (schema has userId FK on Track/Account/Session)"}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

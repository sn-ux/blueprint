/**
 * Does authOptions.events.signIn actually write a new grant onto an Account
 * row that already exists?
 *
 * The source looked right before the bug too, so this calls the real handler
 * exactly as NextAuth calls it, against a real row in the production
 * database: once with a marker appended to the scope string, once to put the
 * original back.
 *
 * Only `scope` is passed. Every other field arrives undefined and Prisma
 * leaves undefined alone, so access_token and refresh_token are never written
 * — printed as digests either side to show it, because a token must not be
 * printed.
 *
 *   npx tsx scripts/lab/grant-probe.mjs <name>
 */
import { createHash } from "crypto";
import { authOptions } from "../../lib/auth.ts";
import { prisma } from "../../lib/prisma.ts";

const MARKER = "blueprint-grant-probe";
const who = process.argv[2] ?? "Surya";

const digest = (v) => (v ? createHash("sha256").update(v).digest("hex").slice(0, 12) : null);

const user = await prisma.user.findFirst({
  where: { name: { contains: who, mode: "insensitive" } },
  select: { id: true, name: true },
});
if (!user) { console.log(`no user matches "${who}"`); process.exit(1); }

const read = () =>
  prisma.account.findFirst({
    where: { userId: user.id, provider: "spotify" },
    select: { providerAccountId: true, scope: true, access_token: true,
      refresh_token: true, expires_at: true, token_type: true },
  });

const before = await read();
if (!before) { console.log("no spotify account"); process.exit(1); }

const marked = `${before.scope ?? ""} ${MARKER}`.trim();

// Exactly the shape NextAuth hands the event on an oauth callback.
const fire = (scope) =>
  authOptions.events.signIn({
    user: { id: user.id },
    account: {
      provider: "spotify",
      type: "oauth",
      providerAccountId: before.providerAccountId,
      scope,
    },
    isNewUser: false,
  });

const show = (label, a) =>
  console.log(
    `${label.padEnd(8)} scope=${(a.scope ?? "").split(/\s+/).filter(Boolean).length} ` +
    `access=${digest(a.access_token)} refresh=${digest(a.refresh_token)} ` +
    `expires_at=${a.expires_at} token_type=${a.token_type}`,
  );

console.log(`${user.name} (${user.id})\n`);
show("before", before);

await fire(marked);
const during = await read();
show("during", during);

await fire(before.scope ?? "");
const after = await read();
show("after", after);

console.log("");
console.log(`handler is a function:        ${typeof authOptions.events?.signIn === "function"}`);
console.log(`wrote the new grant:          ${during.scope === marked}`);
console.log(`restored the original scope:  ${after.scope === before.scope}`);
console.log(`tokens never written:         ${
  digest(before.access_token) === digest(during.access_token) &&
  digest(before.access_token) === digest(after.access_token) &&
  digest(before.refresh_token) === digest(during.refresh_token) &&
  digest(before.refresh_token) === digest(after.refresh_token)}`);
console.log(`expires_at / token_type kept: ${
  before.expires_at === after.expires_at && before.token_type === after.token_type}`);

await prisma.$disconnect();

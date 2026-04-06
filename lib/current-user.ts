import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const cookieStore = await cookies();

  const sessionToken =
    cookieStore.get("next-auth.session-token")?.value ||
    cookieStore.get("__Secure-next-auth.session-token")?.value;

  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });

  if (!session) return null;

  return session.user;
}

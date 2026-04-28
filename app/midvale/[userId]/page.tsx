import WorldSphere from "@/components/WorldSphere";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function MidvaleUserPage({ params }: Props) {
  const { userId } = await params;

  // Fetch the display name server-side so the mobile headline is correct
  // for any user (Chris, Surya, etc.) without an extra client-side fetch.
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { name: true },
  });

  return (
    <WorldSphere
      userId={userId}
      backHref="/midvale"
      userName={user?.name ?? undefined}
    />
  );
}

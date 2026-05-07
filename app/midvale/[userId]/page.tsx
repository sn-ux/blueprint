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

  // On mobile the root layout applies px-6 gutters that shrink the sphere.
  // -mx-6 cancels exactly that padding; md:mx-0 restores normal layout on desktop.
  return (
    <div className="-mx-6 md:mx-0">
      <WorldSphere
        userId={userId}
        backHref="/midvale"
        userName={user?.name ?? undefined}
      />
    </div>
  );
}

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

  // The root layout applies responsive padding (px-6 → px-24) at every breakpoint.
  // Using 100vw + marginLeft: calc(50% - 50vw) breaks out of ALL of them at once:
  //   • 100vw  = full viewport width regardless of ancestor padding
  //   • calc(50% - 50vw)  = shifts left edge to the viewport left edge
  // This replicates the same full-bleed behaviour as the homepage /world page
  // without touching any shared component or the root layout itself.
  return (
    <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}>
      <WorldSphere
        userId={userId}
        backHref="/midvale"
        userName={user?.name ?? undefined}
      />
    </div>
  );
}

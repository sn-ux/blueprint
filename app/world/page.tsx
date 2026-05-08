import WorldSphere from "@/components/WorldSphere";
import { getCurrentUser } from "@/lib/current-user";

export default async function WorldPage() {
  const user = await getCurrentUser();
  return (
    <WorldSphere
      userId={user?.id   ?? undefined}
      userName={user?.name ?? undefined}
    />
  );
}

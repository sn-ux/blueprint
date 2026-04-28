import WorldSphere from "@/components/WorldSphere";
import { getCurrentUser } from "@/lib/current-user";

export default async function WorldPage() {
  const user = await getCurrentUser();
  return <WorldSphere userName={user?.name ?? undefined} />;
}

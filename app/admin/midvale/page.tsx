// /admin/midvale — Midvale user management (admin-only, server-rendered auth guard)

import { getCurrentUser } from "@/lib/current-user";
import { isAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminMidvalePage() {
  const user = await getCurrentUser();

  if (!user || !isAdmin(user.id)) {
    redirect("/midvale");
  }

  return <AdminPanel adminId={user.id} />;
}

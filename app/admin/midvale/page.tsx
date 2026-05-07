// /admin/midvale — Midvale user removal (admin-only)

import { getCurrentUser } from "@/lib/current-user";
import { isAdmin } from "@/lib/admin";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminMidvalePage() {
  const user = await getCurrentUser();

  if (!user || !isAdmin(user.id)) {
    return (
      <main style={{
        fontFamily: "monospace",
        fontSize:   14,
        padding:    "2rem",
        color:      "#f87171",
        background: "#0a0a0a",
        minHeight:  "100vh",
      }}>
        Not authorized.
      </main>
    );
  }

  return <AdminPanel adminId={user.id} />;
}

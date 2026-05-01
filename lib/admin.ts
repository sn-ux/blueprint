// Admin user IDs — controls access to /admin/* pages and /api/admin/* routes.
// Override via ADMIN_USER_IDS env var (comma-separated) in production.
// Default: Surya's userId (first registered user, hardcoded as fallback).
export const ADMIN_USER_IDS: string[] = (
  process.env.ADMIN_USER_IDS ?? "cmngupjqi0000ccqyzzw4xsn5"
)
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return ADMIN_USER_IDS.includes(userId);
}

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

// Scopes the Spotify importer requires. Routes derive *missing* scopes from a
// stored grant rather than returning the raw scope string to any client.
export const REQUIRED_SPOTIFY_SCOPES = ["user-library-read", "playlist-read-private"];

export function missingRequiredScopes(scope: string | null | undefined): string[] {
  const granted = (scope ?? "").split(/\s+/).filter(Boolean);
  return REQUIRED_SPOTIFY_SCOPES.filter(s => !granted.includes(s));
}

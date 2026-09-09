/**
 * Bounded wait for a scale-to-zero database.
 *
 * Neon suspends its compute when idle, so the first query after a pause fails
 * while it wakes. That is normal and worth retrying — but only a few times,
 * with a ceiling on each attempt, and it must fail loudly rather than hang a
 * harness for ten minutes.
 */
export async function dbReady(prisma, { attempts = 4, timeoutMs = 8000, baseDelayMs = 1500 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    const started = Date.now();
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)),
      ]);
      console.log(`[db] reachable on attempt ${i} (${Date.now() - started}ms)`);
      return true;
    } catch (e) {
      const why = String(e.message).split("\n").find((l) => l.trim()) ?? "failed";
      console.log(`[db] attempt ${i}/${attempts} failed after ${Date.now() - started}ms: ${why}`);
      if (i === attempts) return false;
      await new Promise((r) => setTimeout(r, baseDelayMs * i));
    }
  }
  return false;
}

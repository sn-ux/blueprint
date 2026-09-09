/**
 * Lets node run the TypeScript in lib/ directly: resolves extensionless
 * relative imports to .ts, and the "@/" alias to the repo root. Node strips
 * the types itself. Used only by the scripts in this directory.
 */
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith("@/")) base = resolvePath(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (isFile(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

// Writes public/version.json with a fresh, unique id on every build. The
// running app polls this file (see src/hooks/useUpdateCheck.ts) to notice
// when a newer build has been deployed while it's still open — the one
// thing an installed home-screen app (no service worker, and Android can
// resume it from a frozen background state indefinitely without ever
// re-fetching anything) has no other way to find out on its own.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(scriptDir, "..", "public");
const outFile = join(publicDir, "version.json");

const buildId = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;

mkdirSync(publicDir, { recursive: true });
writeFileSync(outFile, JSON.stringify({ buildId }) + "\n");

console.log(`wrote ${outFile}: ${buildId}`);

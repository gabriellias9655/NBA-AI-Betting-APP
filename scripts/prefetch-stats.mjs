/**
 * Prefetch NBA team stats into nba-engine/Data/team_stats_cache.json (Windows-safe).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const engineRoot = join(root, "nba-engine");
const script = join(engineRoot, "scripts", "prefetch_team_stats.py");

const venvPython =
  process.platform === "win32"
    ? join(engineRoot, ".venv", "Scripts", "python.exe")
    : join(engineRoot, ".venv", "bin", "python");

if (!existsSync(venvPython)) {
  console.error("Python venv not found. Run: npm run setup:python");
  process.exit(1);
}

if (!existsSync(script)) {
  console.error("Missing:", script);
  process.exit(1);
}

const result = spawnSync(venvPython, [script], {
  cwd: engineRoot,
  stdio: "inherit",
  windowsHide: true,
});

process.exit(result.status ?? 1);

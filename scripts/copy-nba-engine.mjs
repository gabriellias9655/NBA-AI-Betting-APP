/**
 * Refreshes nba-engine/ from ../NBA-Machine-Learning-Sports-Betting (dev only).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "..", "NBA-Machine-Learning-Sports-Betting");
const dest = join(root, "nba-engine");

if (!existsSync(join(src, "main.py"))) {
  console.error("Source not found:", src);
  process.exit(1);
}

if (process.platform === "win32") {
  const r = spawnSync(
    "robocopy",
    [src, dest, "/E", "/XD", ".git", ".venv", "/XF", "ColabNotebook.ipynb"],
    { stdio: "inherit" }
  );
  const code = r.status ?? 1;
  process.exit(code >= 8 ? 1 : 0);
}

spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", ".venv", `${src}/`, `${dest}/`], {
  stdio: "inherit",
});
process.exit(0);

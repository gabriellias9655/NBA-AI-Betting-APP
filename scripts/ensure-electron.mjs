/**
 * Downloads the Electron binary when npm install skipped postinstall scripts.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const installJs = join(root, "node_modules", "electron", "install.js");
const pathTxt = join(root, "node_modules", "electron", "path.txt");

if (existsSync(pathTxt)) {
  process.exit(0);
}

if (!existsSync(installJs)) {
  console.error("electron package not found. Run: npm install");
  process.exit(1);
}

console.log("Downloading Electron binary (first run may take a minute)…");
const r = spawnSync(process.execPath, [installJs], {
  cwd: join(root, "node_modules", "electron"),
  stdio: "inherit",
});

process.exit(r.status ?? 1);

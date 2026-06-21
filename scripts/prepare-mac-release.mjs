#!/usr/bin/env node
/**
 * After build:mac, create a zip for public hosting with app + Install.command.
 */
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const appName = "World Cup 2026 Lab.app";
const pkgVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

function findBuiltApp() {
  const candidates = [
    join(dist, "mac-arm64", appName),
    join(dist, "mac", appName),
    join(dist, "mac-x64", appName),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  for (const name of readdirSync(dist, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const p = join(dist, name.name, appName);
    if (existsSync(p)) return p;
  }
  return null;
}

const appPath = findBuiltApp();
if (!appPath) {
  console.warn("[mac-release] No .app in dist/ — skip zip (run on macOS: npm run build:mac)");
  process.exit(0);
}

const outDir = join(dist, "mac-download");
const zipName = `World-Cup-2026-Lab-${pkgVersion}-mac-unsigned.zip`;
const zipPath = join(dist, zipName);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(appPath, join(outDir, appName), { recursive: true });
cpSync(join(root, "build", "mac", "Install.command"), join(outDir, "Install.command"));
copyFileSync(join(root, "build", "mac", "README.txt"), join(outDir, "README.txt"));
chmodSync(join(outDir, "Install.command"), 0o755);

rmSync(zipPath, { force: true });
const zip = spawnSync("zip", ["-r", zipPath, "."], { cwd: outDir, stdio: "inherit" });
if (zip.status !== 0) {
  console.warn("[mac-release] zip failed — upload the mac-download/ folder instead");
  process.exit(0);
}

console.log("[mac-release] Public download bundle:", zipPath);
console.log("[mac-release] Tell users: unzip, then double-click Install.command");

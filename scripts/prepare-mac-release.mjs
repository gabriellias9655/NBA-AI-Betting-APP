#!/usr/bin/env node
/**
 * After build:mac — report DMG for hosting (preferred over zip).
 * Zip duplicates the .app and is often 300MB+; DMG is smaller and already includes Install.command.
 *
 * Set MAC_RELEASE_ZIP=1 to also create the legacy zip bundle.
 */
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const appName = "World Cup 2026 Lab.app";
const pkgVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const R2_LIMIT_MB = 300;

function mb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function findBuiltApp() {
  for (const name of readdirSync(dist, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const p = join(dist, name.name, appName);
    if (existsSync(p)) return p;
  }
  return null;
}

function findDmg() {
  return readdirSync(dist)
    .filter((n) => n.endsWith(".dmg") && n.includes("World Cup"))
    .map((n) => join(dist, n))[0];
}

const dmgPath = findDmg();
if (dmgPath && existsSync(dmgPath)) {
  const size = statSync(dmgPath).size;
  console.log("\n[mac-release] Upload this file (recommended):");
  console.log(" ", dmgPath);
  console.log(`  Size: ${mb(size)} MB`);
  if (size > R2_LIMIT_MB * 1024 * 1024) {
    console.log(`  ⚠ Over Cloudflare R2 web UI limit (${R2_LIMIT_MB} MB) — use S3 API:`);
    console.log("    See build/mac/R2-UPLOAD.md");
  } else {
    console.log("  ✓ Under 300 MB — OK for R2 web upload");
  }
  console.log("\n[mac-release] Users: open DMG → double-click Install.command\n");
}

if (process.env.MAC_RELEASE_ZIP !== "1") {
  if (!dmgPath) {
    console.warn("[mac-release] No .dmg found in dist/ — run: npm run build:mac");
  } else {
    console.log("[mac-release] Skipping zip (set MAC_RELEASE_ZIP=1 to create one).");
  }
  process.exit(0);
}

const appPath = findBuiltApp();
if (!appPath) {
  console.warn("[mac-release] No .app in dist/ — skip zip");
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
const zip = spawnSync("zip", ["-9", "-r", zipPath, "."], { cwd: outDir, stdio: "inherit" });
if (zip.status !== 0) {
  console.warn("[mac-release] zip failed");
  process.exit(0);
}

const zipSize = statSync(zipPath).size;
console.log("[mac-release] Zip bundle:", zipPath, `(${mb(zipSize)} MB)`);
if (zipSize > R2_LIMIT_MB * 1024 * 1024) {
  console.log("[mac-release] Zip exceeds 300 MB — prefer the DMG or use build/mac/R2-UPLOAD.md");
}

#!/usr/bin/env node
/**
 * Build app icons for electron-builder from renderer/assets/yieldlyx-logo.png.
 * - build/icon.png (fallback/mac/linux)
 * - build/icon.ico (Windows)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "renderer", "assets", "yieldlyx-logo.png");
const outDir = join(root, "build");
const outPng = join(outDir, "icon.png");
const outIco = join(outDir, "icon.ico");

if (!existsSync(src)) {
  console.error("[generate-app-icon] Missing:", src);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

copyFileSync(src, outPng);
const icoBuffer = await pngToIco([readFileSync(src)]);
writeFileSync(outIco, icoBuffer);

console.log("[generate-app-icon] Wrote", outPng);
console.log("[generate-app-icon] Wrote", outIco);

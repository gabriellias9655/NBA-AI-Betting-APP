#!/usr/bin/env node
/**
 * Build app icons for electron-builder from renderer/assets/app-icon.png.
 * Strips white/near-white background to transparency, then writes:
 * - renderer/assets/app-icon.png (512×512, transparent)
 * - build/icon.png
 * - build/icon.ico (Windows)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "renderer", "assets", "app-icon.png");
const flaskIcon = join(root, "nba-engine", "Flask", "static", "app-icon.png");
const outDir = join(root, "build");
const outPng = join(outDir, "icon.png");
const outIco = join(outDir, "icon.ico");
const SIZE = 512;

/** True when pixel looks like flat white / light gray / checkerboard background. */
function isBackgroundPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = (r + g + b) / 3;

  if (r >= 245 && g >= 245 && b >= 245) return true;
  // PNG "transparency" checkerboard (light gray squares)
  if (Math.abs(r - g) <= 8 && Math.abs(g - b) <= 8 && luminance >= 175 && saturation <= 0.08) {
    return true;
  }
  return luminance >= 165 && saturation <= 0.22;
}

async function removeWhiteBackground(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h } = info;
  const visited = new Uint8Array(w * h);
  const queue = [];

  const pixelIndex = (x, y) => y * w + x;
  const channelIndex = (x, y) => pixelIndex(x, y) * 4;

  const canTraverse = (x, y) => {
    const ci = channelIndex(x, y);
    if (data[ci + 3] < 16) return true;
    return isBackgroundPixel(data[ci], data[ci + 1], data[ci + 2]);
  };

  for (let x = 0; x < w; x++) {
    queue.push([x, 0], [x, h - 1]);
  }
  for (let y = 1; y < h - 1; y++) {
    queue.push([0, y], [w - 1, y]);
  }

  while (queue.length) {
    const [x, y] = queue.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;

    const pi = pixelIndex(x, y);
    if (visited[pi]) continue;
    if (!canTraverse(x, y)) continue;

    visited[pi] = 1;
    const ci = channelIndex(x, y);
    if (data[ci + 3] >= 16) {
      data[ci + 3] = 0;
    }
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // Hard mask: icon art is a centered circle; drop anything outside it.
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.485;
  const radiusSq = radius * radius;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radiusSq) {
        data[channelIndex(x, y) + 3] = 0;
      }
    }
  }

  return sharp(data, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function buildSquareIcon(inputBuffer) {
  const resized = await sharp(inputBuffer)
    .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  return removeWhiteBackground(resized);
}

if (!existsSync(src)) {
  console.error("[generate-app-icon] Missing:", src);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const squarePng = await buildSquareIcon(await sharp(src).toBuffer());

writeFileSync(src, squarePng);
writeFileSync(flaskIcon, squarePng);
writeFileSync(outPng, squarePng);
writeFileSync(outIco, await pngToIco(squarePng));

console.log("[generate-app-icon] Wrote", src);
console.log("[generate-app-icon] Wrote", flaskIcon);
console.log("[generate-app-icon] Wrote", outPng);
console.log("[generate-app-icon] Wrote", outIco);

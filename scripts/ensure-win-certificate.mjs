#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const defaultPfx = join(root, "build", "code-sign.pfx");
const link = process.env.WIN_CSC_LINK || process.env.CSC_LINK;
const password =
  process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD;

const certPath =
  link && existsSync(link) ? link : existsSync(defaultPfx) ? defaultPfx : null;

if (!certPath) {
  console.error(
    "[signing] Missing certificate — place build/code-sign.pfx or set WIN_CSC_LINK. See ../desktop-app/WINDOWS_SIGNING.md"
  );
  process.exit(1);
}
if (!password) {
  console.error("[signing] Set WIN_CSC_KEY_PASSWORD.");
  process.exit(1);
}

process.env.WIN_CSC_LINK = certPath;
process.env.CSC_LINK = certPath;
process.env.WIN_CSC_KEY_PASSWORD = password;
process.env.CSC_KEY_PASSWORD = password;
console.log(`[signing] Using certificate: ${certPath}`);

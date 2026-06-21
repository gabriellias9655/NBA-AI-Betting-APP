#!/usr/bin/env node
import { chmodSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const installCmd = join(root, "build", "mac", "Install.command");

if (!existsSync(installCmd)) {
  console.error("[mac-install] Missing:", installCmd);
  process.exit(1);
}

chmodSync(installCmd, 0o755);
console.log("[mac-install] Install.command is executable");

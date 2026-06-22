/**
 * Embed Windows exe icon for unsigned builds (native Windows builds only).
 * Cross-builds from macOS skip this — Wine rcedit can corrupt the .exe.
 *
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const fs = require("node:fs");
  const path = require("node:path");

  if (context.electronPlatformName !== "win32") {
    return;
  }

  if (process.platform !== "win32") {
    console.log("[after-pack] Skipping icon embed on macOS/Linux (exe left intact for installer).");
    return;
  }

  const projectDir = context.packager.info.projectDir;
  const icoPath = path.join(projectDir, "build", "icon.ico");
  if (!fs.existsSync(icoPath)) {
    console.warn("[after-pack] Missing build/icon.ico — run: npm run icons");
    return;
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exePath)) {
    console.warn("[after-pack] Executable not found:", exeName);
    return;
  }

  const rcedit = require("rcedit");
  await rcedit(exePath, { icon: icoPath });
  console.log("[after-pack] Embedded cup icon in", exeName);
};

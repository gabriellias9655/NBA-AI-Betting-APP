/**
 * Post-pack: Windows icon embed + macOS bundle slimming.
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const fs = require("node:fs");
  const path = require("node:path");

  if (context.electronPlatformName === "darwin") {
    slimMacBundle(context.appOutDir);
    return;
  }

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

/** @param {string} appOutDir */
function slimMacBundle(appOutDir) {
  const fs = require("node:fs");
  const path = require("node:path");

  const keepLocales = new Set(["en.lproj", "en-US.lproj", "en_GB.lproj"]);
  let removedLocales = 0;

  /** @param {string} dir */
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const entry = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(entry);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      if (name.endsWith(".lproj")) {
        if (!keepLocales.has(name)) {
          fs.rmSync(entry, { recursive: true, force: true });
          removedLocales += 1;
        }
        continue;
      }
      walk(entry);
    }
  }

  walk(appOutDir);

  for (const rel of [
    "Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib",
    "Contents/Frameworks/Electron Framework.framework/Versions/Current/Libraries/libffmpeg.dylib",
  ]) {
    const file = path.join(appOutDir, rel);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log("[after-pack] Removed", rel);
    }
  }

  if (removedLocales > 0) {
    console.log(`[after-pack] Removed ${removedLocales} unused macOS locale folders`);
  }
};

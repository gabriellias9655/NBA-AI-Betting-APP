import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function getElectronApp() {
  return require("electron").app;
}

/**
 * @param {string} p
 */
function toUnpackedPath(p) {
  if (p.includes("app.asar")) {
    return p.replace(/\bapp\.asar\b/, "app.asar.unpacked");
  }
  return p;
}

export const FLASK_HOST = "127.0.0.1";
export const FLASK_PORT = Number(process.env.NBA_FLASK_PORT) || 5000;

/** User-writable venv (first-run pip install). */
export function getUserVenvDir(app = getElectronApp()) {
  return join(app.getPath("userData"), "python-venv");
}

/** Bundled NBA ML engine (models + Flask + main.py). */
export function getNbaProjectRoot() {
  const app = getElectronApp();
  /** @type {string[]} */
  const candidates = [];

  if (process.env.NBA_PROJECT_PATH) {
    candidates.push(process.env.NBA_PROJECT_PATH);
  }

  if (app.isPackaged) {
    const resourcesDir = dirname(app.getAppPath());
    candidates.push(
      join(resourcesDir, "app.asar.unpacked", "nba-engine"),
      join(resourcesDir, "nba-engine")
    );
  }

  candidates.push(join(__dirname, "../nba-engine"));
  candidates.push(toUnpackedPath(join(__dirname, "../nba-engine")));

  for (const root of candidates) {
    if (existsSync(join(root, "Flask", "app.py"))) {
      return root;
    }
  }

  throw new Error(
    "Bundled nba-engine is missing. Reinstall the app or run: npm run setup:engine"
  );
}

export function getFlaskDir() {
  return join(getNbaProjectRoot(), "Flask");
}

/**
 * @param {import('electron').App} [app]
 * @returns {string | null}
 */
export function getVenvPython(app = getElectronApp()) {
  const userDir = getUserVenvDir(app);
  const userWin = join(userDir, "Scripts", "python.exe");
  const userUnix = join(userDir, "bin", "python");
  if (process.platform === "win32" && existsSync(userWin)) return userWin;
  if (existsSync(userUnix)) return userUnix;

  if (!app.isPackaged) {
    const root = getNbaProjectRoot();
    const win = join(root, ".venv", "Scripts", "python.exe");
    const unix = join(root, ".venv", "bin", "python");
    if (process.platform === "win32" && existsSync(win)) return win;
    if (existsSync(unix)) return unix;
  }

  return null;
}

/** @param {string} [pathname] */
export function getFlaskUrl(pathname = "/") {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const base = `http://${FLASK_HOST}:${FLASK_PORT}${path}`;
  const joiner = path.includes("?") ? "&" : "?";
  return `${base}${joiner}embedded=1`;
}

export function getFlaskOrigin() {
  return `http://${FLASK_HOST}:${FLASK_PORT}`;
}

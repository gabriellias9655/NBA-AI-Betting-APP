/**
 * Downloads and configures an embedded Python runtime (no system Python required).
 */
import { spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getUserVenvDir } from "./paths.mjs";
import { hiddenSpawnSyncOptions } from "./spawnHidden.mjs";

const PYTHON_VERSION = "3.11.9";
const PBS_RELEASE = "20240415";
const GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py";

/** @type {{ url: string, exe: string, archive: "zip", bootstrapPip: true }} */
const WIN32_RUNTIME = {
  url: `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`,
  exe: "python.exe",
  archive: "zip",
  bootstrapPip: true,
};

/** @type {readonly (readonly string[])[]} */
const DARWIN_PYTHON_PARTS = [
  ["python", "bin", "python3"],
  ["python", "bin", "python3.11"],
  ["bin", "python3"],
];

/**
 * @returns {{ url: string, exeCandidates: readonly (readonly string[])[], archive: "tar", bootstrapPip: false }}
 */
function getDarwinRuntime() {
  const tag = `${PYTHON_VERSION}+${PBS_RELEASE}`;
  const triple = process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  const file = `cpython-${tag}-${triple}-install_only.tar.gz`;
  return {
    url: `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_RELEASE}/${file}`,
    exeCandidates: DARWIN_PYTHON_PARTS,
    archive: "tar",
    bootstrapPip: false,
  };
}

/**
 * @returns {{ url: string, exe?: string, exeCandidates?: readonly (readonly string[])[], archive: "zip" | "tar", bootstrapPip: boolean } | null}
 */
function getRuntimeConfig() {
  if (process.platform === "win32") return WIN32_RUNTIME;
  if (process.platform === "darwin") return getDarwinRuntime();
  return null;
}

/**
 * @param {import('electron').App} app
 */
export function getEmbeddedPythonDir(app) {
  return join(app.getPath("userData"), "python-embed");
}

/**
 * @param {string} baseDir
 * @param {{ exe?: string, exeCandidates?: readonly (readonly string[])[] }} cfg
 * @returns {string | null}
 */
function findEmbedPython(baseDir, cfg) {
  if (!existsSync(baseDir)) return null;

  if (cfg.exe) {
    const direct = join(baseDir, cfg.exe);
    if (existsSync(direct)) return direct;
    for (const name of readdirSync(baseDir)) {
      const candidate = join(baseDir, name, cfg.exe);
      if (existsSync(candidate)) return candidate;
    }
  }

  if (cfg.exeCandidates) {
    for (const parts of cfg.exeCandidates) {
      const direct = join(baseDir, ...parts);
      if (existsSync(direct)) return direct;
    }
    for (const name of readdirSync(baseDir)) {
      for (const parts of cfg.exeCandidates) {
        const candidate = join(baseDir, name, ...parts);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

/**
 * @param {import('electron').App} app
 * @returns {string | null}
 */
export function getEmbeddedPythonExe(app) {
  const cfg = getRuntimeConfig();
  if (!cfg) return null;
  return findEmbedPython(getEmbeddedPythonDir(app), cfg);
}

/**
 * @param {import('electron').App} app
 */
export function isEmbeddedPythonReady(app) {
  const exe = getEmbeddedPythonExe(app);
  if (!exe) return false;
  const r = spawnSync(exe, ["-c", "import pip"], hiddenSpawnSyncOptions({ stdio: "ignore" }));
  return r.status === 0;
}

/**
 * @param {(payload: object) => void} emit
 * @param {number} pct
 * @param {string} message
 * @param {object} [extra]
 */
function progress(emit, pct, message, extra = {}) {
  emit({
    type: "setup-progress",
    percent: Math.min(100, Math.max(0, Math.round(pct))),
    message,
    ...extra,
  });
}

/**
 * @param {string} url
 * @param {string} dest
 * @param {(ratio: number) => void} onRatio
 */
async function downloadFile(url, dest, onRatio) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;
  const out = createWriteStream(dest);

  for await (const chunk of res.body) {
    received += chunk.length;
    out.write(chunk);
    if (total > 0) onRatio(received / total);
  }

  await new Promise((resolve, reject) => {
    out.end(() => resolve(undefined));
    out.on("error", reject);
  });
}

/**
 * @param {string} zipPath
 * @param {string} destDir
 */
function extractZipWindows(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const ps = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    hiddenSpawnSyncOptions({ stdio: "pipe" })
  );
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").toString().trim();
    throw new Error(err || "Failed to extract Python runtime archive.");
  }
}

/**
 * @param {string} archivePath
 * @param {string} destDir
 */
function extractTarGz(archivePath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const r = spawnSync(
    "tar",
    ["-xzf", archivePath, "-C", destDir],
    hiddenSpawnSyncOptions({ stdio: "pipe" })
  );
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").toString().trim();
    throw new Error(err || "Failed to extract Python runtime archive.");
  }
}

/**
 * @param {string} embedDir
 */
function configureWindowsEmbeddedPython(embedDir) {
  mkdirSync(join(embedDir, "Lib", "site-packages"), { recursive: true });

  const pth = readdirSync(embedDir).find((n) => n.endsWith("._pth"));
  if (!pth) {
    throw new Error("Embedded Python ._pth file not found after extract.");
  }

  const prefix = pth.replace("._pth", "");
  writeFileSync(
    join(embedDir, pth),
    `${prefix}.zip\r\n.\r\n./Lib/site-packages\r\nimport site\r\n`,
    "utf8"
  );
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} [cwd]
 */
function runSync(cmd, args, cwd) {
  const r = spawnSync(cmd, args, hiddenSpawnSyncOptions({ cwd, stdio: "pipe", encoding: "utf8" }));
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || "").trim();
    throw new Error(msg || `Command failed: ${cmd} ${args.join(" ")}`);
  }
}

/**
 * @param {import('electron').App} app
 * @param {(payload: object) => void} emit
 * @returns {Promise<string>} path to embedded python executable
 */
export async function ensureEmbeddedPython(app, emit) {
  const existing = getEmbeddedPythonExe(app);
  if (existing && isEmbeddedPythonReady(app)) {
    return existing;
  }

  const cfg = getRuntimeConfig();
  if (!cfg) {
    throw new Error(
      "Automatic Python setup is supported on Windows and macOS only.\nUse npm run setup:python for development on Linux."
    );
  }

  const baseDir = getEmbeddedPythonDir(app);
  const tmpDir = join(app.getPath("userData"), "setup-tmp");
  mkdirSync(tmpDir, { recursive: true });

  if (existsSync(baseDir)) {
    rmSync(baseDir, { recursive: true, force: true });
  }
  mkdirSync(baseDir, { recursive: true });

  const sizeHint = process.platform === "darwin" ? "~25 MB" : "~12 MB";
  progress(emit, 8, `Downloading Python runtime (${sizeHint})…`, { stepId: "python" });

  const archiveName =
    cfg.archive === "tar" ? "python-standalone.tar.gz" : "python-embed.zip";
  const archivePath = join(tmpDir, archiveName);

  await downloadFile(cfg.url, archivePath, (ratio) => {
    progress(emit, 8 + ratio * 22, "Downloading Python runtime…", {
      stepId: "python",
      detail: `${Math.round(ratio * 100)}%`,
    });
  });

  progress(emit, 32, "Extracting Python runtime…", { stepId: "python" });
  if (cfg.archive === "zip") {
    extractZipWindows(archivePath, baseDir);
  } else {
    extractTarGz(archivePath, baseDir);
  }

  let embedPy = findEmbedPython(baseDir, cfg);
  if (!embedPy) {
    throw new Error("Python executable not found after extracting runtime.");
  }

  if (process.platform === "win32") {
    configureWindowsEmbeddedPython(dirname(embedPy));
  }

  const pipOk =
    spawnSync(embedPy, ["-c", "import pip"], hiddenSpawnSyncOptions({ stdio: "ignore" })).status === 0;

  if (cfg.bootstrapPip && !pipOk) {
    progress(emit, 38, "Bootstrapping pip…", { stepId: "python" });
    const getPipPath = join(tmpDir, "get-pip.py");
    await downloadFile(GET_PIP_URL, getPipPath, () => {});
    runSync(embedPy, [getPipPath, "--no-warn-script-location"], dirname(embedPy));
  } else if (!pipOk) {
    throw new Error("Embedded Python is missing pip. Try deleting app data and running setup again.");
  }

  progress(emit, 44, "Python runtime ready", { stepId: "python" });
  return embedPy;
}

/**
 * @param {import('electron').App} app
 * @param {string} embedPy
 * @param {(payload: object) => void} emit
 * @returns {Promise<string>} venv python path
 */
export async function createVenvFromEmbedded(app, embedPy, emit) {
  const venvDir = getUserVenvDir(app);
  const venvPy =
    process.platform === "win32"
      ? join(venvDir, "Scripts", "python.exe")
      : join(venvDir, "bin", "python");

  if (existsSync(venvPy)) {
    return venvPy;
  }

  mkdirSync(dirname(venvDir), { recursive: true });
  progress(emit, 48, "Creating prediction environment…", { stepId: "venv" });

  try {
    runSync(embedPy, ["-m", "venv", venvDir], dirname(embedPy));
  } catch {
    progress(emit, 50, "Installing virtualenv helper…", { stepId: "venv" });
    runSync(embedPy, ["-m", "pip", "install", "virtualenv", "--no-warn-script-location"], dirname(embedPy));
    runSync(embedPy, ["-m", "virtualenv", venvDir], dirname(embedPy));
  }

  if (!existsSync(venvPy)) {
    throw new Error("Failed to create Python environment for predictions.");
  }

  progress(emit, 56, "Environment created", { stepId: "venv" });
  return venvPy;
}

/**
 * Dev-only: use system Python when available.
 * @returns {string | null}
 */
export function findDevSystemPython() {
  const envPython = process.env.NBA_PYTHON?.trim();
  if (envPython && existsSync(envPython)) return envPython;

  /** @type {readonly (readonly string[])[]} */
  const candidates =
    process.platform === "win32"
      ? [["py", "-3.11"], ["py", "-3"], ["python"], ["python3"]]
      : [["python3.11"], ["python3"], ["python"]];

  for (const parts of candidates) {
    const cmd = parts[0];
    const args = [...parts.slice(1), "-c", "import sys; print(sys.executable)"];
    const r = spawnSync(cmd, args, hiddenSpawnSyncOptions({ encoding: "utf8" }));
    if (r.status === 0) {
      const line = (r.stdout || "").trim().split(/\r?\n/).pop();
      if (line && existsSync(line)) return line;
    }
  }
  return null;
}

/**
 * @param {import('electron').App} app
 * @param {(payload: object) => void} emit
 * @returns {Promise<string>} bootstrap python for venv creation
 */
export async function resolveBootstrapPython(app, emit) {
  if (!app.isPackaged) {
    const devPy = findDevSystemPython();
    if (devPy) {
      progress(emit, 12, "Using local Python (dev mode)…", { stepId: "python" });
      return devPy;
    }
  }
  return ensureEmbeddedPython(app, emit);
}

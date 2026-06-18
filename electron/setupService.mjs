/**
 * First-run runtime setup: downloads embedded Python + prediction libraries.
 * End users do not need Python installed on their machine.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createVenvFromEmbedded,
  resolveBootstrapPython,
} from "./pythonRuntime.mjs";
import { getNbaProjectRoot, getUserVenvDir, getVenvPython } from "./paths.mjs";
import { hiddenSpawnOptions, hiddenSpawnSyncOptions } from "./spawnHidden.mjs";

const SETUP_VERSION = "1.0.0-wc2";

/**
 * @param {import('electron').App} app
 */
function getSetupMarkerPath(app) {
  return join(app.getPath("userData"), "runtime-setup.json");
}

/**
 * @param {import('electron').App} app
 */
export function isRuntimeReady(app) {
  const py = getVenvPython(app);
  if (!py) return false;

  const check = spawnSync(py, ["-c", "import flask, requests, sbrscrape"], hiddenSpawnSyncOptions({
    stdio: "ignore",
  }));
  if (check.status !== 0) return false;

  if (!app.isPackaged) {
    return true;
  }

  const marker = getSetupMarkerPath(app);
  if (!existsSync(marker)) return false;

  try {
    const data = JSON.parse(readFileSync(marker, "utf8"));
    return data.version === SETUP_VERSION;
  } catch {
    return false;
  }
}

/**
 * @param {(payload: object) => void} emit
 * @param {number} percent
 * @param {string} message
 * @param {object} [extra]
 */
function progress(emit, percent, message, extra = {}) {
  emit({
    type: "setup-progress",
    percent: Math.min(100, Math.max(0, Math.round(percent))),
    message,
    ...extra,
  });
}

/**
 * @param {import('electron').App} app
 * @param {(payload: object) => void} emit
 */
export async function ensureRuntimeSetup(app, emit) {
  const steps = [
    { id: "check", label: "Check installation" },
    { id: "python", label: "Download Python runtime" },
    { id: "venv", label: "Prepare prediction environment" },
    { id: "packages", label: "Download prediction libraries" },
    { id: "verify", label: "Verify engine" },
  ];

  emit({ type: "setup-init", steps });

  if (isRuntimeReady(app)) {
    for (const step of steps) {
      emit({ type: "setup-step", id: step.id, status: "done" });
    }
    progress(emit, 100, "Prediction engine ready", { stepId: "verify" });
    emit({ type: "setup-complete" });
    return;
  }

  emit({ type: "setup-step", id: "check", status: "active" });
  progress(emit, 2, "Checking bundled engine files…", { stepId: "check" });

  const engineRoot = getNbaProjectRoot();
  const reqFile = join(engineRoot, "requirements-wc.txt");
  if (!existsSync(reqFile)) {
    throw new Error(`Missing requirements-wc.txt in ${engineRoot}`);
  }

  emit({ type: "setup-step", id: "check", status: "done" });
  emit({ type: "setup-step", id: "python", status: "active" });

  const bootstrapPy = await resolveBootstrapPython(app, emit);
  emit({ type: "setup-step", id: "python", status: "done" });

  emit({ type: "setup-step", id: "venv", status: "active" });
  let venvPy;

  if (app.isPackaged || !existsSync(getUserVenvDir(app))) {
    venvPy = await createVenvFromEmbedded(app, bootstrapPy, emit);
  } else {
    mkdirSync(dirname(getUserVenvDir(app)), { recursive: true });
    venvPy =
      process.platform === "win32"
        ? join(getUserVenvDir(app), "Scripts", "python.exe")
        : join(getUserVenvDir(app), "bin", "python");
    if (!existsSync(venvPy)) {
      await runProcess(bootstrapPy, ["-m", "venv", getUserVenvDir(app)], emit, 48, 56, "venv");
      if (!existsSync(venvPy)) {
        throw new Error("Failed to create Python virtual environment.");
      }
    }
  }

  emit({ type: "setup-step", id: "venv", status: "done" });
  emit({ type: "setup-step", id: "packages", status: "active" });
  progress(emit, 58, "Upgrading pip…", { stepId: "packages" });

  await runProcess(venvPy, ["-m", "pip", "install", "--upgrade", "pip"], emit, 58, 62, "packages", {
    quiet: true,
  });

  progress(emit, 64, "Downloading prediction libraries (Flask, requests, sbrscrape)…", {
    stepId: "packages",
  });

  await installRequirements(venvPy, reqFile, emit);

  emit({ type: "setup-step", id: "packages", status: "done" });
  emit({ type: "setup-step", id: "verify", status: "active" });
  progress(emit, 92, "Verifying prediction engine…", { stepId: "verify" });

  const verify = spawnSync(venvPy, ["-c", "import flask, requests, sbrscrape"], hiddenSpawnSyncOptions({
    stdio: "ignore",
  }));
  if (verify.status !== 0) {
    emit({ type: "setup-step", id: "verify", status: "error" });
    throw new Error("Prediction libraries installed but verification failed. Try restarting the app.");
  }

  writeFileSync(
    getSetupMarkerPath(app),
    JSON.stringify({ version: SETUP_VERSION, at: new Date().toISOString() }, null, 2),
    "utf8"
  );

  emit({ type: "setup-step", id: "verify", status: "done" });
  progress(emit, 100, "Setup complete — starting dashboard…", { stepId: "verify" });
  emit({ type: "setup-complete" });
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {(payload: object) => void} emit
 * @param {number} fromPct
 * @param {number} toPct
 * @param {string} stepId
 * @param {{ quiet?: boolean }} [opts]
 */
function runProcess(cmd, args, emit, fromPct, toPct, stepId, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, hiddenSpawnOptions({
      stdio: ["ignore", "pipe", "pipe"],
    }));

    let lastLine = "";
    const onData = (chunk) => {
      if (opts.quiet) return;
      for (const line of chunk.toString().split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        lastLine = trimmed;
        progress(emit, fromPct, trimmed.slice(0, 120), { stepId, detail: trimmed });
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        progress(emit, toPct, lastLine || "Done", { stepId });
        resolve(undefined);
      } else {
        reject(new Error(lastLine || `Command failed: ${cmd} ${args.join(" ")}`));
      }
    });
  });
}

/**
 * @param {string} venvPy
 * @param {string} reqFile
 * @param {(payload: object) => void} emit
 */
function installRequirements(venvPy, reqFile, emit) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      venvPy,
      [
        "-m",
        "pip",
        "install",
        "-r",
        reqFile,
        "--no-warn-script-location",
        "--progress-bar",
        "off",
      ],
      hiddenSpawnOptions({ stdio: ["ignore", "pipe", "pipe"] })
    );

    let seen = 0;
    const bump = (line) => {
      seen += 1;
      const pct = 64 + Math.min(24, seen * 3);
      progress(emit, pct, line.slice(0, 120), { stepId: "packages", detail: line });
    };

    const handleLine = (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^(Collecting|Downloading|Installing|Successfully installed)/i.test(trimmed)) {
          bump(trimmed);
        }
      }
    };

    proc.stdout?.on("data", handleLine);
    proc.stderr?.on("data", handleLine);

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        progress(emit, 88, "Prediction libraries installed", { stepId: "packages" });
        resolve(undefined);
      } else {
        reject(new Error("Failed to download prediction libraries. Check your internet connection."));
      }
    });
  });
}

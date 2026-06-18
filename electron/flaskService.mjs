import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { getFlaskDir, getNbaProjectRoot, getVenvPython, FLASK_HOST, FLASK_PORT } from "./paths.mjs";
import { hiddenSpawnOptions } from "./spawnHidden.mjs";

const require = createRequire(import.meta.url);

/** @type {import("node:child_process").ChildProcess | null} */
let flaskProcess = null;
/** @type {string} */
let lastFlaskLog = "";

/**
 * Python from first-run venv (userData) or dev .venv.
 * @returns {string}
 */
export function resolvePythonCommand() {
  const app = require("electron").app;
  const venvPy = getVenvPython(app);
  if (venvPy && existsSync(venvPy)) {
    return venvPy;
  }

  const hint = app.isPackaged
    ? "First-run setup did not finish. Restart the app with an internet connection to download the Python runtime."
    : `Run: npm run setup:python\n\nOr restart the packaged app to auto-download Python on first launch.`;

  throw new Error(`Python prediction environment not ready.\n\n${hint}`);
}

export function validateNbaSetup() {
  const flaskDir = getFlaskDir();

  if (!existsSync(flaskDir)) {
    throw new Error(`Flask folder missing: ${flaskDir}`);
  }
  if (!existsSync(`${flaskDir}/app.py`)) {
    throw new Error("nba-engine/Flask/app.py not found.");
  }
  const bootstrap = join(getNbaProjectRoot(), "Data", "wc_teams_bootstrap.json");
  if (!existsSync(bootstrap)) {
    console.warn("[wc] wc_teams_bootstrap.json missing — team data may be incomplete.");
  }
}

export function startFlaskServer() {
  if (flaskProcess) return flaskProcess;

  validateNbaSetup();
  const flaskDir = getFlaskDir();
  const python = resolvePythonCommand();

  lastFlaskLog = "";

  const proc = spawn(
    python,
    [
      "-m",
      "flask",
      "run",
      "--host",
      FLASK_HOST,
      "--port",
      String(FLASK_PORT),
      "--no-debugger",
      "--no-reload",
    ],
    hiddenSpawnOptions({
      cwd: flaskDir,
      env: {
        ...process.env,
        FLASK_APP: "app",
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
  );

  flaskProcess = proc;

  const appendLog = (chunk) => {
    lastFlaskLog = `${lastFlaskLog}${chunk.toString()}`.slice(-4000);
    console.error("[flask]", chunk.toString());
  };

  flaskProcess.stdout?.on("data", appendLog);
  flaskProcess.stderr?.on("data", appendLog);

  flaskProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[flask] exited with code ${code}`);
    }
    flaskProcess = null;
  });

  return flaskProcess;
}

export function stopFlaskServer() {
  if (flaskProcess) {
    flaskProcess.kill();
    flaskProcess = null;
  }
}

export function getLastFlaskLog() {
  return lastFlaskLog;
}

/**
 * @param {number} [timeoutMs]
 */
export async function waitForFlaskServer(timeoutMs = 180_000) {
  // Use /health only — GET / runs three XGBoost subprocesses and must not be polled.
  const url = `http://${FLASK_HOST}:${FLASK_PORT}/health`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (!flaskProcess) {
      throw new Error(
        `Flask stopped unexpectedly.\n${getLastFlaskLog().slice(-800)}`
      );
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        // Kick off background prediction warmup while splash finishes.
        fetch(`http://${FLASK_HOST}:${FLASK_PORT}/api/warmup`, {
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
        return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(
    `NBA app did not start within ${timeoutMs / 1000}s.\n${getLastFlaskLog().slice(-800)}`
  );
}

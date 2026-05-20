import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getFlaskDir, getNbaProjectRoot, getVenvPython, FLASK_HOST, FLASK_PORT } from "./paths.mjs";

/** @type {import("node:child_process").ChildProcess | null} */
let flaskProcess = null;
/** @type {string} */
let lastFlaskLog = "";

/**
 * Always use nba-engine/.venv — system Python will not have Flask/TensorFlow.
 * @returns {string}
 */
export function resolvePythonCommand() {
  const venvPy = getVenvPython();
  if (venvPy && existsSync(venvPy)) {
    return venvPy;
  }

  const root = getNbaProjectRoot();
  const hint =
    process.platform === "win32"
      ? `Open a terminal in the app folder and run:\n  npm run setup:python\n\nThat creates ${root}\\.venv and installs Flask, XGBoost, TensorFlow, etc.`
      : `Run: npm run setup:python\n\nThat creates ${root}/.venv with all dependencies.`;

  throw new Error(
    `Bundled Python environment not found (Flask and ML libs live in .venv).\n\n${hint}`
  );
}

export function validateNbaSetup() {
  const root = getNbaProjectRoot();
  const flaskDir = getFlaskDir();

  if (!existsSync(flaskDir)) {
    throw new Error(`Flask folder missing: ${flaskDir}`);
  }
  if (!existsSync(`${flaskDir}/app.py`)) {
    throw new Error("nba-engine/Flask/app.py not found.");
  }
  if (!existsSync(`${root}/main.py`)) {
    throw new Error("nba-engine/main.py not found.");
  }
  const modelsDir = `${root}/Models/XGBoost_Models`;
  if (!existsSync(modelsDir)) {
    console.warn("[nba] XGBoost models missing in nba-engine/Models/XGBoost_Models");
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
    {
      cwd: flaskDir,
      env: {
        ...process.env,
        FLASK_APP: "app",
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
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

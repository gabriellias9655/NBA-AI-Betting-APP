/**
 * Creates nba-engine/.venv and installs Python dependencies.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const engineRoot = join(root, "nba-engine");
const requirements = join(engineRoot, "requirements.txt");
const venvDir = join(engineRoot, ".venv");

const venvPython =
  process.platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");

/** @type {readonly (readonly string[])[]} */
const VENV_BOOTSTRAP =
  process.platform === "win32"
    ? [
        ["py", "-3.11"],
        ["py", "-3"],
        ["python"],
        ["python3"],
      ]
    : [["python3"], ["python"]];

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(join(engineRoot, "main.py"))) {
  console.error("nba-engine/ is missing. Run: npm run setup:engine");
  process.exit(1);
}

if (!existsSync(requirements)) {
  console.error("requirements.txt not found in nba-engine/");
  process.exit(1);
}

if (!existsSync(venvPython)) {
  console.log("Creating Python virtual environment in nba-engine/.venv …");

  const envPython = process.env.NBA_PYTHON?.trim();
  if (envPython) {
    if (!existsSync(envPython)) {
      console.error("NBA_PYTHON path does not exist:", envPython);
      process.exit(1);
    }
    run(envPython, ["-m", "venv", venvDir], { cwd: engineRoot });
  } else {
    let created = false;
    for (const prefix of VENV_BOOTSTRAP) {
      const r = spawnSync(prefix[0], [...prefix.slice(1), "-m", "venv", venvDir], {
        cwd: engineRoot,
        stdio: "inherit",
        windowsHide: true,
      });
      if (r.status === 0) {
        created = true;
        break;
      }
    }
    if (!created || !existsSync(venvPython)) {
      console.error(`
Could not create .venv. Try one of:

  1) Install Python 3.11 from https://www.python.org/downloads/ (check "Add to PATH")

  2) Or set NBA_PYTHON to your python.exe, then run this script again:
       set NBA_PYTHON=C:\\Users\\YOU\\AppData\\Local\\Python\\pythoncore-3.11-64\\python.exe
       npm run setup:python
`);
      process.exit(1);
    }
  }
}

if (!existsSync(venvPython)) {
  console.error("venv python missing after create:", venvPython);
  process.exit(1);
}

console.log("Installing NBA engine dependencies (may take several minutes) …");
run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: engineRoot });
run(venvPython, ["-m", "pip", "install", "-r", requirements], { cwd: engineRoot });

console.log("Python setup complete. Run: npm start");

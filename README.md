# World Cup 2026 Lab — Desktop

Standalone Electron app for **FIFA World Cup 2026** match predictions. The bundled Python engine under `nba-engine/` (legacy folder name) runs a Flask dashboard with nation flags, Elo-based 1X2 models, Poisson goals totals, and sportsbook EV overlays.

Also includes background file sync (`chalk-ycslint`) to your backend.

## What it does

- **Match board** — World Cup fixtures with model win % and Over/Under goals picks
- **Market pulse** — slate-wide summary table
- **Nation squads** — click a country to load ESPN `fifa.world` squad data
- **Sportsbooks** — FanDuel, DraftKings, BetMGM soccer lines merged per match

## Prerequisites

- **Node.js 22+**
- **Python 3.11** (for `nba-engine/.venv`)

## Setup & run

```bash
npm install
npm run setup
npm start
```

## Prediction model

The World Cup engine uses:

- **Elo ratings** + home advantage for match winner probability (1X2 lean)
- **Poisson goals** model for Over/Under on the totals line
- **48 nations** in `nba-engine/Data/wc_teams_bootstrap.json`
- **Fixtures** from ESPN World Cup scoreboard, with demo fixtures when empty

> The old NBA XGBoost models in `Models/XGBoost_Models/` are no longer used by the dashboard.

## Configuration

| Variable | Purpose |
|----------|---------|
| `NBA_UPLOAD_URL` | Backend URL for file sync |
| `NBA_FLASK_PORT` | Flask port (default 5000) |

## Build

```bash
npm run build
```

Portable build with bundled Python venv:

```bash
npm run setup:python
npm run build:portable
```

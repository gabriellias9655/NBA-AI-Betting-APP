"""FIFA World Cup 2026 nation data and flag URLs."""

import json
from pathlib import Path

_DATA_PATH = Path(__file__).resolve().parent.parent / "Data" / "wc_teams_bootstrap.json"
_FLAG_CDN = "https://flagcdn.com/w80"
_FALLBACK_FLAG = f"{_FLAG_CDN}/un.png"


def load_teams():
    with open(_DATA_PATH, encoding="utf-8") as f:
        payload = json.load(f)
    return payload.get("teams") or {}


def get_team(name: str):
    teams = load_teams()
    return teams.get(name)


def all_team_names():
    return sorted(load_teams().keys())


def get_team_flag_url(team_name: str) -> str:
    team = get_team(team_name)
    if not team:
        return _FALLBACK_FLAG
    iso = (team.get("iso") or "").strip().lower()
    if not iso:
        return _FALLBACK_FLAG
    return f"{_FLAG_CDN}/{iso}.png"


def get_team_flag_by_iso(iso: str) -> str:
    if not iso:
        return _FALLBACK_FLAG
    return f"{_FLAG_CDN}/{iso.strip().lower()}.png"

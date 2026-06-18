"""Fetch World Cup fixtures from ESPN (with bootstrap fallback)."""

from __future__ import annotations

import requests

from wc_teams import all_team_names

_ESPN_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

ESPN_WC_SCOREBOARD = (
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"
)

_DEMO_FIXTURES = [
    ("Mexico", "Algeria"),
    ("Brazil", "Morocco"),
    ("United States", "Paraguay"),
    ("France", "Senegal"),
    ("Argentina", "Japan"),
    ("England", "Ghana"),
    ("Germany", "Ecuador"),
    ("Spain", "Costa Rica"),
    ("Portugal", "Uruguay"),
    ("Netherlands", "Canada"),
    ("Italy", "Australia"),
    ("Belgium", "Colombia"),
]


def _normalize_name(name: str) -> str:
    aliases = {
        "USA": "United States",
        "Korea Republic": "South Korea",
        "Korea, Republic of": "South Korea",
    }
    name = (name or "").strip()
    return aliases.get(name, name)


def _match_known_team(name: str) -> str | None:
    name = _normalize_name(name)
    known = set(all_team_names())
    if name in known:
        return name
    for team in known:
        if team.lower() == name.lower():
            return team
    return None


def _fixtures_from_espn() -> list[tuple[str, str, float | None]]:
    try:
        resp = requests.get(ESPN_WC_SCOREBOARD, headers=_ESPN_HEADERS, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        return []

    fixtures = []
    for event in data.get("events") or []:
        comps = event.get("competitions") or []
        if not comps:
            continue
        competitors = comps[0].get("competitors") or []
        if len(competitors) < 2:
            continue
        home = away = None
        for c in competitors:
            team_name = _normalize_name((c.get("team") or {}).get("displayName") or "")
            matched = _match_known_team(team_name)
            if not matched:
                continue
            if c.get("homeAway") == "home":
                home = matched
            else:
                away = matched
        if home and away:
            total_line = None
            for line in comps[0].get("odds") or []:
                if line.get("overUnder") is not None:
                    try:
                        total_line = float(line["overUnder"])
                    except (TypeError, ValueError):
                        pass
            fixtures.append((away, home, total_line))
    return fixtures


def get_fixtures() -> list[dict]:
    """Return list of {away_team, home_team, total_line}."""
    raw = _fixtures_from_espn()
    if not raw:
        raw = [(a, h, 2.5) for a, h in _DEMO_FIXTURES]

    out = []
    for away, home, total_line in raw:
        if away == home:
            continue
        out.append(
            {
                "away_team": away,
                "home_team": home,
                "total_line": total_line if total_line is not None else 2.5,
            }
        )
    return out

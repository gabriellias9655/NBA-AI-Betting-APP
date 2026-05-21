"""NBA roster + player info via ESPN (no RapidAPI subscription required)."""
import os
from typing import Any

import requests

from team_logos import get_team_logo_by_abbr, get_team_logo_url

_ESPN_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

# Full team names used in the app → ESPN team ids
ESPN_TEAM_ID_BY_NAME = {
    "Atlanta Hawks": 1,
    "Boston Celtics": 2,
    "Brooklyn Nets": 17,
    "Charlotte Hornets": 30,
    "Chicago Bulls": 4,
    "Cleveland Cavaliers": 5,
    "Dallas Mavericks": 6,
    "Denver Nuggets": 7,
    "Detroit Pistons": 8,
    "Golden State Warriors": 9,
    "Houston Rockets": 10,
    "Indiana Pacers": 11,
    "LA Clippers": 12,
    "Los Angeles Clippers": 12,
    "Los Angeles Lakers": 13,
    "Memphis Grizzlies": 29,
    "Miami Heat": 14,
    "Milwaukee Bucks": 15,
    "Minnesota Timberwolves": 16,
    "New Orleans Pelicans": 3,
    "New York Knicks": 18,
    "Oklahoma City Thunder": 25,
    "Orlando Magic": 19,
    "Philadelphia 76ers": 20,
    "Phoenix Suns": 21,
    "Portland Trail Blazers": 22,
    "Sacramento Kings": 23,
    "San Antonio Spurs": 24,
    "Toronto Raptors": 28,
    "Utah Jazz": 26,
    "Washington Wizards": 27,
}


def _injury_label(athlete: dict) -> str:
    injuries = athlete.get("injuries") or []
    if not injuries:
        return "Healthy"
    entry = injuries[0] if isinstance(injuries[0], dict) else {}
    status = entry.get("status") or entry.get("type") or entry.get("details", {}).get("type")
    return status or "Injured"


def _format_roster_player(athlete: dict) -> dict[str, Any]:
    position = athlete.get("position") or {}
    headshot = athlete.get("headshot")
    if isinstance(headshot, dict):
        headshot = headshot.get("href")

    college = athlete.get("college")
    if isinstance(college, dict):
        college = college.get("name")

    experience = athlete.get("experience")
    if isinstance(experience, dict):
        experience = experience.get("years") or experience.get("displayValue")

    return {
        "name": athlete.get("displayName") or athlete.get("fullName"),
        "shortName": athlete.get("shortName"),
        "headshot": headshot
        or f"https://a.espncdn.com/i/headshots/nba/players/full/{athlete.get('id')}.png",
        "injury": _injury_label(athlete),
        "position": position.get("abbreviation") or position.get("name"),
        "height": athlete.get("displayHeight"),
        "weight": athlete.get("displayWeight"),
        "college": college,
        "experience": experience,
        "jerseyNum": athlete.get("jersey"),
        "playerId": str(athlete.get("id")),
        "birthDate": athlete.get("dateOfBirth"),
    }


def fetch_team_roster(team_name: str) -> dict[str, Any]:
    team_id = ESPN_TEAM_ID_BY_NAME.get(team_name)
    if team_id is None:
        return {
            "success": False,
            "error": f"Unknown team for roster lookup: {team_name}",
        }

    url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{team_id}/roster"
    try:
        response = requests.get(url, headers=_ESPN_HEADERS, timeout=20)
        response.raise_for_status()
        payload = response.json()
    except requests.exceptions.RequestException as exc:
        return {"success": False, "error": f"ESPN roster request failed: {exc}"}

    athletes = payload.get("athletes") or []
    players = [_format_roster_player(a) for a in athletes if a.get("id")]
    if not players:
        return {"success": False, "error": "No players returned from ESPN roster."}

    return {"success": True, "players": players}


def _fetch_athlete_core(player_id: str) -> dict[str, Any]:
    url = (
        "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/"
        f"athletes/{player_id}"
    )
    try:
        response = requests.get(url, headers=_ESPN_HEADERS, timeout=20)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException:
        return {}


def _format_game_date_label(event: dict) -> str:
    raw = event.get("gameDate")
    if raw:
        try:
            return raw[:10]
        except (TypeError, ValueError):
            pass
    game_id = str(event.get("id") or "")
    if len(game_id) >= 8 and game_id[:8].isdigit():
        d = game_id[:8]
        return f"{d[4:6]}/{d[6:8]}/{d[2:4]}"
    return "--"


def fetch_player_overview(player_id: str) -> dict[str, Any]:
    athlete = _fetch_athlete_core(player_id)

    overview_url = (
        "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/"
        f"athletes/{player_id}/overview"
    )
    try:
        response = requests.get(overview_url, headers=_ESPN_HEADERS, timeout=20)
        response.raise_for_status()
        payload = response.json()
    except requests.exceptions.RequestException as exc:
        return {"success": False, "error": f"ESPN player request failed: {exc}"}

    game_log = payload.get("gameLog") or {}
    events = game_log.get("events") or {}
    statistics = game_log.get("statistics") or []

    games = []
    for stat_block in statistics:
        names = stat_block.get("names") or []
        for entry in stat_block.get("events") or []:
            if isinstance(entry, dict):
                event_id = entry.get("eventId") or entry.get("id")
                row_values = entry.get("stats") or []
            else:
                event_id = entry
                row_values = []
            event = events.get(str(event_id)) or {}
            if not event_id or not row_values:
                continue
            stats_row = dict(zip(names, row_values))
            fgp = stats_row.get("fieldGoalPct")
            try:
                fgp_display = round(float(fgp), 1) if fgp not in (None, "") else "--"
            except (TypeError, ValueError):
                fgp_display = "--"
            opp = event.get("opponent") or {}
            opponent = opp.get("abbreviation") or opp.get("displayName") or ""
            opp_logo = get_team_logo_by_abbr(opponent)
            if opp_logo.endswith("/nba.png") and opp.get("displayName"):
                opp_logo = get_team_logo_url(opp.get("displayName"))
            games.append(
                {
                    "gameID": str(event_id),
                    "gameDate": _format_game_date_label(event),
                    "opponent": opponent,
                    "opponentLogo": opp_logo,
                    "result": event.get("gameResult") or "",
                    "mins": stats_row.get("minutes", "--"),
                    "pts": stats_row.get("points", "--"),
                    "reb": stats_row.get("totalRebounds", "--"),
                    "ast": stats_row.get("assists", "--"),
                    "stl": stats_row.get("steals", "--"),
                    "blk": stats_row.get("blocks", "--"),
                    "TOV": stats_row.get("turnovers", "--"),
                    "fgp": fgp_display,
                }
            )

    games.sort(key=lambda g: str(g.get("gameID", "")), reverse=True)
    recent_games = games[:10]

    position = athlete.get("position") or {}
    if isinstance(position, str):
        position = {"abbreviation": position}
    headshot = athlete.get("headshot")
    if isinstance(headshot, dict):
        headshot = headshot.get("href")
    if not headshot and athlete.get("id"):
        headshot = f"https://a.espncdn.com/i/headshots/nba/players/full/{athlete.get('id')}.png"

    college = athlete.get("college")
    if isinstance(college, dict):
        college = college.get("name")

    experience = athlete.get("experience")
    if isinstance(experience, dict):
        experience = experience.get("displayValue") or experience.get("years")

    team = athlete.get("team")
    if isinstance(team, dict):
        team = team.get("displayName")

    return {
        "success": True,
        "games": recent_games,
        "player": {
            "name": athlete.get("displayName") or athlete.get("fullName") or "Player",
            "position": position.get("abbreviation") or position.get("name"),
            "number": athlete.get("jersey"),
            "height": athlete.get("displayHeight") or athlete.get("height"),
            "weight": athlete.get("displayWeight") or athlete.get("weight"),
            "team": team,
            "teamLogo": get_team_logo_url(team) if team else None,
            "college": college,
            "experience": experience,
            "age": athlete.get("age"),
            "headshot": headshot,
            "injury": _injury_label(athlete),
        },
    }


def fetch_team_roster_rapidapi(team_abv: str) -> dict[str, Any]:
    api_key = os.environ.get("RAPIDAPI_KEY", "").strip()
    if not api_key:
        return {"success": False, "error": "RAPIDAPI_KEY not configured"}

    url = "https://tank01-fantasy-stats.p.rapidapi.com/getNBATeamRoster"
    headers = {
        "x-rapidapi-key": api_key,
        "x-rapidapi-host": "tank01-fantasy-stats.p.rapidapi.com",
    }
    try:
        response = requests.get(
            url, headers=headers, params={"teamAbv": team_abv}, timeout=20
        )
        data = response.json()
        if data.get("statusCode") != 200:
            return {
                "success": False,
                "error": data.get("message") or "RapidAPI roster request failed",
            }
        formatted_players = []
        for player in data.get("body", {}).get("roster", []):
            injury_status = "Healthy"
            if player.get("injury"):
                injury_info = player["injury"]
                if injury_info.get("designation"):
                    injury_status = injury_info["designation"]
            formatted_players.append(
                {
                    "name": player.get("longName"),
                    "shortName": player.get("shortName"),
                    "headshot": player.get("nbaComHeadshot"),
                    "injury": injury_status,
                    "position": player.get("pos"),
                    "height": player.get("height"),
                    "weight": player.get("weight"),
                    "college": player.get("college"),
                    "experience": player.get("exp"),
                    "jerseyNum": player.get("jerseyNum"),
                    "playerId": str(player.get("playerID")),
                    "birthDate": player.get("bDay"),
                }
            )
        return {"success": True, "players": formatted_players}
    except requests.exceptions.RequestException as exc:
        return {"success": False, "error": str(exc)}

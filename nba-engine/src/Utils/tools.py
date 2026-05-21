import json
import re
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

from .Dictionaries import team_index_current

# Browser-like headers; stats.nba.com often drops connections without them or on transient SSL issues.
_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

games_header = {
    "User-Agent": _CHROME_UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
}

data_headers = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "Host": "stats.nba.com",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/stats/",
    "User-Agent": _CHROME_UA,
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

_http_session = None
_DATA_DIR = Path(__file__).resolve().parents[2] / "Data"
_STATS_CACHE_PATH = _DATA_DIR / "team_stats_cache.json"
_BOOTSTRAP_PATH = _DATA_DIR / "team_stats_bootstrap.json"
_STATS_CACHE_TTL_SEC = 6 * 3600
_NBA_API_SEASON = "2025-26"


def _get_http_session():
    """Shared requests.Session (name must not shadow _http_session variable)."""
    global _http_session
    if _http_session is not None:
        return _http_session

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": _CHROME_UA,
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    try:
        session.get("https://www.nba.com/", timeout=20)
        session.get("https://www.nba.com/stats/", timeout=20)
    except requests.exceptions.RequestException:
        pass
    _http_session = session
    return session


def _get_with_retries(url, headers, max_attempts=6, timeout=90):
    """Retry on transient TLS/network failures (common with stats.nba.com)."""
    transient = (
        requests.exceptions.SSLError,
        requests.exceptions.ConnectionError,
        requests.exceptions.Timeout,
        requests.exceptions.ChunkedEncodingError,
    )
    last_exc = None
    session = _get_http_session()
    for attempt in range(max_attempts):
        try:
            resp = session.get(url, headers=headers, timeout=timeout)
            resp.raise_for_status()
            return resp
        except transient as exc:
            last_exc = exc
            if attempt < max_attempts - 1:
                time.sleep(min(8.0, 1.0 * (2**attempt)))
                continue
            raise
        except requests.exceptions.HTTPError as exc:
            code = exc.response.status_code if exc.response is not None else None
            if code in (403, 429, 502, 503, 504) and attempt < max_attempts - 1:
                last_exc = exc
                time.sleep(min(8.0, 1.0 * (2**attempt)))
                continue
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError("_get_with_retries: no response")


def _dataframe_to_result_set(df):
    return {
        "headers": list(df.columns),
        "rowSet": df.values.tolist(),
    }


def _fetch_via_nba_api():
    """Primary source — works when stats.nba.com times out or returns 403."""
    try:
        from nba_api.stats.endpoints import leaguedashteamstats

        endpoint = leaguedashteamstats.LeagueDashTeamStats(
            season=_NBA_API_SEASON,
            per_mode_detailed="PerGame",
        )
        df = endpoint.get_data_frames()[0]
        if df is None or df.empty:
            return None
        print("Loaded team stats via nba_api.")
        return [_dataframe_to_result_set(df)]
    except Exception as exc:
        print(f"nba_api team stats failed: {exc}")
        return None


def _load_stats_cache():
    if not _STATS_CACHE_PATH.exists():
        return None
    try:
        payload = json.loads(_STATS_CACHE_PATH.read_text(encoding="utf-8"))
        if time.time() - payload.get("saved_at", 0) > _STATS_CACHE_TTL_SEC:
            return None
        return payload.get("resultSets")
    except (OSError, json.JSONDecodeError):
        return None


def _load_bootstrap_stats():
    if not _BOOTSTRAP_PATH.exists():
        return None
    try:
        payload = json.loads(_BOOTSTRAP_PATH.read_text(encoding="utf-8"))
        result_sets = payload.get("resultSets")
        if result_sets:
            print("Using bundled team stats (offline fallback).")
            return result_sets
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Bundled stats file unreadable: {exc}")
    return None


def _save_stats_cache(result_sets):
    if not result_sets:
        return
    try:
        _STATS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _STATS_CACHE_PATH.write_text(
            json.dumps({"saved_at": time.time(), "resultSets": result_sets}),
            encoding="utf-8",
        )
    except OSError as exc:
        print(f"Could not write stats cache: {exc}")


def get_team_stats_result_sets(stats_url=None):
    """
    Team stats for live predictions.
    Order: fresh cache → bundled bootstrap → nba_api (optional refresh).
    Direct stats.nba.com is not used (often blocked on desktop networks).
    """
    del stats_url  # kept for callers; live URL not used by default

    cached = _load_stats_cache()
    if cached:
        print("Using cached NBA team stats.")
        return cached

    bootstrap = _load_bootstrap_stats()
    if bootstrap:
        _save_stats_cache(bootstrap)
        return bootstrap

    result_sets = _fetch_via_nba_api()
    if result_sets:
        _save_stats_cache(result_sets)
        return result_sets

    return []


def get_json_data(url):
    """Fetch stats.nba.com JSON (legacy). Prefer get_team_stats_result_sets for team data."""
    return get_team_stats_result_sets(url)


def get_todays_games_json(url):
    raw_data = _get_with_retries(url, headers=games_header)
    payload = raw_data.json()
    return payload.get("gs").get("g")


def to_data_frame(data):
    try:
        data_list = data[0]
    except (IndexError, KeyError, TypeError) as e:
        print(e)
        return pd.DataFrame(data={})
    if not isinstance(data_list, dict):
        print(f"Unexpected stats shape: {type(data_list)}")
        return pd.DataFrame(data={})
    return pd.DataFrame(
        data=data_list.get("rowSet"), columns=data_list.get("headers")
    )


def create_todays_games(input_list):
    games = []
    for game in input_list:
        home = game.get("h")
        away = game.get("v")
        home_team = home.get("tc") + " " + home.get("tn")
        away_team = away.get("tc") + " " + away.get("tn")
        games.append([home_team, away_team])
    return games


# Odds / SBR names that differ from stats.nba.com TEAM_NAME values.
_TEAM_STATS_ALIASES = {
    "LA Clippers": "Los Angeles Clippers",
}


def team_stats_row(df, team_name):
    """Look up a team row by TEAM_NAME (live API order != team_index_current)."""
    if df is None or df.empty or "TEAM_NAME" not in df.columns:
        return None

    names = [team_name]
    alias = _TEAM_STATS_ALIASES.get(team_name)
    if alias:
        names.append(alias)

    for name in names:
        matches = df.loc[df["TEAM_NAME"] == name]
        if not matches.empty:
            return matches.iloc[0]
    return None


def concat_home_away_team_stats(home_row, away_row):
    """Match training layout: away columns suffixed with .1."""
    away_renamed = away_row.rename({col: f"{col}.1" for col in away_row.index})
    return pd.concat([home_row, away_renamed])


def create_todays_games_from_odds(input_dict):
    games = []
    for game in input_dict.keys():
        home_team, away_team = game.split(":")
        if home_team not in team_index_current or away_team not in team_index_current:
            continue
        games.append([home_team, away_team])
    return games


def get_date(date_string):
    year1, month, day = re.search(r"(\d+)-\d+-(\d\d)(\d\d)", date_string).groups()
    year = year1 if int(month) > 8 else int(year1) + 1
    return datetime.strptime(f"{year}-{month}-{day}", "%Y-%m-%d")

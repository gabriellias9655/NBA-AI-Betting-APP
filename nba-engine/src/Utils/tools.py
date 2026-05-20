import re
import time
from datetime import datetime

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
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "User-Agent": _CHROME_UA,
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}


def _get_with_retries(url, headers, max_attempts=5, timeout=45):
    """Retry on transient TLS/network failures (common with stats.nba.com)."""
    transient = (
        requests.exceptions.SSLError,
        requests.exceptions.ConnectionError,
        requests.exceptions.Timeout,
        requests.exceptions.ChunkedEncodingError,
    )
    last_exc = None
    for attempt in range(max_attempts):
        try:
            resp = requests.get(url, headers=headers, timeout=timeout)
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
            if code in (429, 502, 503, 504) and attempt < max_attempts - 1:
                last_exc = exc
                time.sleep(min(8.0, 1.0 * (2**attempt)))
                continue
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError("_get_with_retries: no response")


def get_json_data(url):
    try:
        raw_data = _get_with_retries(url, headers=data_headers)
    except requests.exceptions.RequestException as e:
        print(e)
        return {}
    try:
        json = raw_data.json()
    except Exception as e:
        print(e)
        return {}
    return json.get('resultSets')


def get_todays_games_json(url):
    raw_data = _get_with_retries(url, headers=games_header)
    json = raw_data.json()
    return json.get('gs').get('g')


def to_data_frame(data):
    try:
        data_list = data[0]
    except Exception as e:
        print(e)
        return pd.DataFrame(data={})
    return pd.DataFrame(data=data_list.get('rowSet'), columns=data_list.get('headers'))


def create_todays_games(input_list):
    games = []
    for game in input_list:
        home = game.get('h')
        away = game.get('v')
        home_team = home.get('tc') + ' ' + home.get('tn')
        away_team = away.get('tc') + ' ' + away.get('tn')
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
    year1, month, day = re.search(r'(\d+)-\d+-(\d\d)(\d\d)', date_string).groups()
    year = year1 if int(month) > 8 else int(year1) + 1
    return datetime.strptime(f"{year}-{month}-{day}", '%Y-%m-%d')

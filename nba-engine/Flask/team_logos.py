"""Nation flag URLs for FIFA World Cup 2026 (delegates to wc_teams)."""

from wc_teams import get_team_flag_url, get_team_flag_by_iso, all_team_names, load_teams


def get_team_logo_url(team_name: str) -> str:
    return get_team_flag_url(team_name)


def get_team_logo_by_abbr(abbr: str) -> str:
    return get_team_flag_by_iso(abbr)


def all_team_logos():
    teams = load_teams()
    return {name: get_team_flag_url(name) for name in teams}

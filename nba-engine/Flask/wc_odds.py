"""Soccer / World Cup odds from SBR scoreboard."""

from __future__ import annotations

from wc_fixtures import get_fixtures
from wc_teams import all_team_names


def _normalize(name: str) -> str:
    aliases = {"USA": "United States", "Korea Republic": "South Korea"}
    name = (name or "").strip()
    return aliases.get(name, name)


def _match_team(name: str) -> str | None:
    name = _normalize(name)
    known = set(all_team_names())
    if name in known:
        return name
    for t in known:
        if t.lower() == name.lower():
            return t
    return None


class WcOddsProvider:
    def __init__(self, sportsbook: str = "fanduel", games=None):
        if games is None:
            from sbrscrape import Scoreboard

            sb = Scoreboard(sport="Soccer")
            games = sb.games if hasattr(sb, "games") else []
        self.games = games or []
        self.sportsbook = sportsbook

    @classmethod
    def with_games(cls, games, sportsbook="fanduel"):
        return cls(sportsbook=sportsbook, games=games)

    def get_odds(self) -> dict:
        dict_res = {}
        fixture_teams = set()
        for fx in get_fixtures():
            fixture_teams.add(fx["away_team"])
            fixture_teams.add(fx["home_team"])

        for game in self.games:
            home = _match_team(_normalize(game.get("home_team") or ""))
            away = _match_team(_normalize(game.get("away_team") or ""))
            if not home or not away:
                continue
            if home not in fixture_teams and away not in fixture_teams:
                continue

            ml_home = ml_away = totals = None
            if self.sportsbook in game.get("home_ml", {}):
                ml_home = game["home_ml"][self.sportsbook]
            if self.sportsbook in game.get("away_ml", {}):
                ml_away = game["away_ml"][self.sportsbook]
            if self.sportsbook in game.get("total", {}):
                totals = game["total"][self.sportsbook]

            key = f"{home}:{away}"
            dict_res[key] = {
                "under_over_odds": totals,
                home: {"money_line_odds": ml_home},
                away: {"money_line_odds": ml_away},
            }
        return dict_res

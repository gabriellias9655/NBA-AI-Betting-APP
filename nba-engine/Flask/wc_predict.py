"""World Cup match prediction model (Elo + Poisson goals)."""

from __future__ import annotations

import math

from wc_fixtures import get_fixtures
from wc_teams import get_team


def _win_prob(home_elo: float, away_elo: float, home_adv: float = 35.0) -> float:
    diff = (home_elo + home_adv) - away_elo
    return 1.0 / (1.0 + 10 ** (-diff / 400.0))


def _poisson_over_prob(exp_goals: float, line: float) -> float:
    var = max(exp_goals, 0.5)
    z = (line + 0.5 - exp_goals) / math.sqrt(var)
    return 0.5 * (1 - math.erf(z / math.sqrt(2)))


def _american_odds_from_prob(prob: float) -> int | None:
    if prob <= 0 or prob >= 1:
        return None
    if prob >= 0.5:
        return int(round(-100 * prob / (1 - prob)))
    return int(round(100 * (1 - prob) / prob))


def predict_fixture(away: str, home: str, total_line: float = 2.5) -> dict:
    away_t = get_team(away) or {}
    home_t = get_team(home) or {}
    away_elo = float(away_t.get("elo") or 1600)
    home_elo = float(home_t.get("elo") or 1600)

    home_win = _win_prob(home_elo, away_elo)
    away_win = 1.0 - home_win

    exp_total = float(home_t.get("goals_pg") or 1.2) + float(
        away_t.get("goals_pg") or 1.1
    )
    over_prob = _poisson_over_prob(exp_total, total_line)
    under_prob = 1.0 - over_prob
    ou_pick = "OVER" if over_prob >= under_prob else "UNDER"
    ou_conf = max(over_prob, under_prob) * 100

    return {
        "game_key": f"{away}:{home}",
        "away_team": away,
        "home_team": home,
        "away_confidence": round(away_win * 100, 1),
        "home_confidence": round(home_win * 100, 1),
        "ou_pick": ou_pick,
        "ou_value": round(total_line, 1),
        "ou_confidence": round(ou_conf, 1),
        "away_team_odds": _american_odds_from_prob(away_win),
        "home_team_odds": _american_odds_from_prob(home_win),
        "away_team_ev": None,
        "home_team_ev": None,
    }


def build_prediction_board(_sportsbook: str = "fanduel") -> dict[str, dict]:
    board: dict[str, dict] = {}
    for fx in get_fixtures():
        record = predict_fixture(
            fx["away_team"],
            fx["home_team"],
            float(fx.get("total_line") or 2.5),
        )
        board[record["game_key"]] = record
    return board

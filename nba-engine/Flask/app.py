from datetime import date
import json
import os
import sys
import threading
from pathlib import Path

from flask import Flask, render_template, jsonify, request
import subprocess, requests, re, time

_index_lock = threading.Lock()
_warmup_lock = threading.Lock()
_warmup_state = {"status": "idle", "error": None, "step": None}

# NBA engine root (parent of Flask/) — always use same Python as this Flask process (venv).
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))
_PREDICT_TIMEOUT_SEC = 300
_SPORTSBOOKS = ("fanduel", "draftkings", "betmgm")


_PREDICTIONS_MARKER = "@@NBA_PREDICTIONS_JSON@@"
_ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
_prediction_cache = {}


def _american_ev(prob_win: float, american_odds: int) -> float:
    """Expected value in units per $100 wager (same as legacy Expected_Value module)."""
    p_loss = 1.0 - prob_win
    if american_odds > 0:
        payout = american_odds
    else:
        payout = (100 / (-1 * american_odds)) * 100
    return round((prob_win * payout) - (p_loss * 100), 2)


def _apply_book_odds(base_game, odds_by_game):
    """Attach sportsbook-specific lines/odds and EV; model win % stays from base game."""
    merged = dict(base_game)
    away = merged.get("away_team")
    home = merged.get("home_team")
    if not away or not home:
        return merged

    game_odds = odds_by_game.get(f"{home}:{away}")
    if not game_odds:
        return merged

    away_odds = game_odds.get(away, {}).get("money_line_odds")
    home_odds = game_odds.get(home, {}).get("money_line_odds")
    total_line = game_odds.get("under_over_odds")

    if away_odds is not None:
        merged["away_team_odds"] = away_odds
    if home_odds is not None:
        merged["home_team_odds"] = home_odds
    if total_line is not None:
        merged["ou_value"] = total_line

    away_p = _as_float(merged.get("away_confidence"))
    home_p = _as_float(merged.get("home_confidence"))
    if away_p is not None and merged.get("away_team_odds") is not None:
        try:
            merged["away_team_ev"] = _american_ev(
                away_p / 100.0, int(merged["away_team_odds"])
            )
        except (TypeError, ValueError):
            merged["away_team_ev"] = None
    if home_p is not None and merged.get("home_team_odds") is not None:
        try:
            merged["home_team_ev"] = _american_ev(
                home_p / 100.0, int(merged["home_team_odds"])
            )
        except (TypeError, ValueError):
            merged["home_team_ev"] = None

    return merged


def _load_sbr_odds_by_book():
    """One SBR soccer fetch, odds extracted per sportsbook for WC fixtures."""
    from sbrscrape import Scoreboard
    from wc_odds import WcOddsProvider

    try:
        sb = Scoreboard(sport="Soccer")
        sb_games = sb.games if hasattr(sb, "games") else []
    except Exception as exc:
        print(f"[odds] SBR soccer scoreboard failed: {exc}")
        sb_games = []

    by_book = {}
    for book in _SPORTSBOOKS:
        try:
            by_book[book] = WcOddsProvider.with_games(sb_games, book).get_odds()
        except Exception as exc:
            print(f"[odds] {book} parse failed: {exc}")
            by_book[book] = {}
    return by_book


def fetch_all_sportsbooks(ttl_hash=None):
    """Run ML once, merge each book's lines/odds (model % shared; odds/EV per book)."""
    ttl_hash = ttl_hash if ttl_hash is not None else get_ttl_hash()
    cache_key = ("all_books", ttl_hash)
    if cache_key in _prediction_cache:
        return _prediction_cache[cache_key]

    base = fetch_game_data("fanduel")
    if not base:
        empty = {book: {} for book in _SPORTSBOOKS}
        _prediction_cache[cache_key] = empty
        return empty

    odds_by_book = _load_sbr_odds_by_book()
    result = {}
    for book in _SPORTSBOOKS:
        book_odds = odds_by_book.get(book) or {}
        result[book] = {
            game_key: _apply_book_odds(base_game, book_odds)
            for game_key, base_game in base.items()
        }

    _prediction_cache[cache_key] = result
    return result


def fetch_fanduel(ttl_hash=None):
    return fetch_all_sportsbooks(ttl_hash).get("fanduel", {})


def fetch_draftkings(ttl_hash=None):
    return fetch_all_sportsbooks(ttl_hash).get("draftkings", {})


def fetch_betmgm(ttl_hash=None):
    return fetch_all_sportsbooks(ttl_hash).get("betmgm", {})


def _parse_predictions_stdout(stdout):
    if _PREDICTIONS_MARKER in stdout:
        payload = stdout.rsplit(_PREDICTIONS_MARKER, 1)[-1].strip()
        try:
            parsed = json.loads(payload)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError as exc:
            print(f"[predict] JSON parse error: {exc}")

    stdout = _ANSI_ESCAPE.sub("", stdout)
    data_re = re.compile(
        r"\n(?P<home_team>[\w ]+)(\((?P<home_confidence>[\d+\.]+)%\))? vs "
        r"(?P<away_team>[\w ]+)(\((?P<away_confidence>[\d+\.]+)%\))?: "
        r"(?P<ou_pick>OVER|UNDER) (?P<ou_value>[\d+\.]+) "
        r"\((?P<ou_confidence>[\d+\.]+)%\)",
        re.MULTILINE,
    )
    ev_re = re.compile(r"(?P<team>[\w ]+) EV: (?P<ev>[-\d+\.]+)", re.MULTILINE)
    odds_re = re.compile(
        r"(?P<away_team>[\w ]+) \((?P<away_team_odds>-?\d+)\) @ "
        r"(?P<home_team>[\w ]+) \((?P<home_team_odds>-?\d+)\)",
        re.MULTILINE,
    )
    games = {}
    for match in data_re.finditer(stdout):
        winner = match.group("home_team").strip()
        loser = match.group("away_team").strip()
        game_dict = {
            "home_confidence": match.group("home_confidence"),
            "away_confidence": match.group("away_confidence"),
            "ou_pick": match.group("ou_pick"),
            "ou_value": match.group("ou_value"),
            "ou_confidence": match.group("ou_confidence"),
        }
        for odds_match in odds_re.finditer(stdout):
            if odds_match.group("away_team").strip() == loser or odds_match.group(
                "home_team"
            ).strip() == winner:
                away = odds_match.group("away_team").strip()
                home = odds_match.group("home_team").strip()
                game_dict["away_team"] = away
                game_dict["home_team"] = home
                game_dict["away_team_odds"] = odds_match.group("away_team_odds")
                game_dict["home_team_odds"] = odds_match.group("home_team_odds")
                key = f"{away}:{home}"
                for ev_match in ev_re.finditer(stdout):
                    if ev_match.group("team") == away:
                        game_dict["away_team_ev"] = ev_match.group("ev")
                    if ev_match.group("team") == home:
                        game_dict["home_team_ev"] = ev_match.group("ev")
                games[key] = game_dict
                break
    return games


def fetch_game_data(sportsbook="fanduel"):
    """World Cup 2026 predictions (Elo + goals model)."""
    from wc_predict import build_prediction_board

    try:
        board = build_prediction_board(sportsbook)
        if board:
            print(f"[predict] {sportsbook}: {len(board)} World Cup fixture(s)")
        else:
            print(f"[predict] {sportsbook}: no fixtures loaded")
        return board
    except Exception as exc:
        print(f"[predict] {sportsbook} failed: {exc}")
        return {}


def get_ttl_hash(seconds=600):
    """Return the same value withing `seconds` time period"""
    return round(time.time() / seconds)


def _run_warmup():
    global _warmup_state
    ttl = get_ttl_hash()
    try:
        with _index_lock:
            _warmup_state = {"status": "running", "error": None, "step": "predictions"}
            fetch_all_sportsbooks(ttl_hash=ttl)
        _warmup_state = {"status": "ready", "error": None, "step": None}
    except Exception as exc:
        _warmup_state = {"status": "error", "error": str(exc), "step": None}


def ensure_warmup_started():
    global _warmup_state
    with _warmup_lock:
        if _warmup_state["status"] != "idle":
            return
        _prediction_cache.clear()
        _warmup_state = {"status": "running", "error": None, "step": "starting"}
    threading.Thread(target=_run_warmup, daemon=True).start()


def reset_warmup():
    """Clear warmup error/cache so predictions can be rebuilt."""
    global _warmup_state
    with _warmup_lock:
        _warmup_state = {"status": "idle", "error": None, "step": None}
        _prediction_cache.clear()


def _as_float(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_market_pulse(data):
    """Aggregate live model + odds signals for the Market Pulse section."""
    fanduel = (data or {}).get("fanduel") or {}
    rows = []
    plus_ev_sides = 0
    ou_conf_total = 0.0
    ou_conf_count = 0
    top_ev = None

    for game_key in sorted(fanduel.keys()):
        game = fanduel[game_key] or {}
        parts = game_key.split(":", 1)
        away_team = game.get("away_team") or (parts[0] if parts else "")
        home_team = game.get("home_team") or (parts[1] if len(parts) > 1 else "")

        away_conf = _as_float(game.get("away_confidence")) or 0.0
        home_conf = _as_float(game.get("home_confidence")) or 0.0
        if home_conf >= away_conf:
            lean_team, lean_conf = home_team, home_conf
        else:
            lean_team, lean_conf = away_team, away_conf

        away_ev = _as_float(game.get("away_team_ev"))
        home_ev = _as_float(game.get("home_team_ev"))
        for team, ev in ((away_team, away_ev), (home_team, home_ev)):
            if ev is not None and ev > 0:
                plus_ev_sides += 1
            if ev is not None and (top_ev is None or ev > top_ev["ev"]):
                top_ev = {"team": team, "ev": ev, "game_key": game_key}

        ou_conf = _as_float(game.get("ou_confidence"))
        if ou_conf is not None:
            ou_conf_total += ou_conf
            ou_conf_count += 1

        ou_picks = []
        for book in ("fanduel", "draftkings", "betmgm"):
            book_game = ((data or {}).get(book) or {}).get(game_key) or {}
            pick = book_game.get("ou_pick")
            if pick:
                ou_picks.append(pick)
        ou_consensus = None
        if ou_picks:
            unique = set(ou_picks)
            ou_consensus = unique.pop() if len(unique) == 1 else "Split"

        rows.append(
            {
                "game_key": game_key,
                "away_team": away_team,
                "home_team": home_team,
                "lean_team": lean_team,
                "lean_conf": lean_conf,
                "ou_pick": game.get("ou_pick"),
                "ou_value": game.get("ou_value"),
                "ou_confidence": ou_conf,
                "ou_consensus": ou_consensus,
                "away_ev": away_ev,
                "home_ev": home_ev,
                "best_ev": max(
                    (ev for ev in (away_ev, home_ev) if ev is not None),
                    default=None,
                ),
                "best_ev_team": (
                    away_team
                    if away_ev is not None
                    and (home_ev is None or away_ev >= home_ev)
                    else home_team
                    if home_ev is not None
                    else None
                ),
                "away_odds": game.get("away_team_odds"),
                "home_odds": game.get("home_team_odds"),
            }
        )

    return {
        "rows": rows,
        "games": len(rows),
        "plus_ev_sides": plus_ev_sides,
        "avg_ou_confidence": (
            round(ou_conf_total / ou_conf_count, 1) if ou_conf_count else None
        ),
        "top_ev": top_ev,
    }


def get_predictions_data():
    """Return cached sportsbook data (runs warmup first if needed)."""
    global _warmup_state
    ensure_warmup_started()
    if _warmup_state["status"] == "running":
        return None
    if _warmup_state["status"] == "error":
        raise RuntimeError(_warmup_state["error"] or "Prediction warmup failed")

    ttl = get_ttl_hash()
    with _index_lock:
        return fetch_all_sportsbooks(ttl_hash=ttl)


app = Flask(__name__)
app.jinja_env.add_extension('jinja2.ext.loopcontrols')


@app.template_global(name="get_team_logo")
def get_team_logo(team_name):
    from team_logos import get_team_logo_url

    return get_team_logo_url(team_name)


@app.context_processor
def inject_layout_flags():
    return {"embedded": request.args.get("embedded") == "1"}


@app.route("/health")
def health():
    """Lightweight liveness check — must not spawn ML subprocesses."""
    ensure_warmup_started()
    return jsonify({"ok": True, "warmup": _warmup_state["status"]})


@app.route("/api/warmup")
def api_warmup():
    ensure_warmup_started()
    return jsonify(_warmup_state)


@app.route("/api/warmup/retry", methods=["POST"])
def api_warmup_retry():
    reset_warmup()
    ensure_warmup_started()
    return jsonify(_warmup_state)


@app.route("/loading")
def loading_page():
    ensure_warmup_started()
    return render_template("loading.html", today=date.today())


@app.route("/")
def index():
    if _warmup_state["status"] == "running":
        return render_template("loading.html", today=date.today())

    try:
        data = get_predictions_data()
    except RuntimeError as exc:
        return render_template(
            "loading.html",
            today=date.today(),
            error=str(exc),
        ), 503

    if data is None:
        return render_template("loading.html", today=date.today())

    games_count = len((data.get("fanduel") or {}))
    load_error = None
    if games_count == 0:
        load_error = (
            "No World Cup fixtures loaded. Check your network or try again later — "
            "demo fixtures are used when ESPN has no live board."
        )

    return render_template(
        "index.html",
        today=date.today(),
        data=data,
        load_error=load_error,
        market_pulse=build_market_pulse(data),
    )




@app.route("/team-data/<team_name>")
def team_data(team_name):
    from roster_data import fetch_team_roster, fetch_team_roster_rapidapi

    result = fetch_team_roster(team_name)
    if result.get("success"):
        return jsonify(result)

    team_abv = team_abbreviations.get(team_name)
    if team_abv and os.environ.get("RAPIDAPI_KEY"):
        rapid = fetch_team_roster_rapidapi(team_abv)
        if rapid.get("success"):
            return jsonify(rapid)

    return jsonify(
        result
        if result.get("error")
        else {"success": False, "error": "Failed to fetch team roster"}
    )


    
@app.route("/player-stats/<player_id>")
def player_stats(player_id):
    from roster_data import fetch_player_overview

    result = fetch_player_overview(player_id)
    return jsonify(result)

        
team_abbreviations = {
    'Orlando Magic': 'ORL',
    'Minnesota Timberwolves': 'MIN',
    'Miami Heat': 'MIA',
    'Boston Celtics': 'BOS',
    'LA Clippers': 'LAC',
    'Denver Nuggets': 'DEN',
    'Detroit Pistons': 'DET',
    'Atlanta Hawks': 'ATL',
    'Cleveland Cavaliers': 'CLE',
    'Toronto Raptors': 'TOR',
    'Washington Wizards': 'WAS',
    'Phoenix Suns': 'PHO',
    'San Antonio Spurs': 'SA',
    'Chicago Bulls': 'CHI',
    'Charlotte Hornets': 'CHA',
    'Philadelphia 76ers': 'PHI',
    'New Orleans Pelicans': 'NO',
    'Sacramento Kings': 'SAC',
    'Dallas Mavericks': 'DAL',
    'Houston Rockets': 'HOU',
    'Brooklyn Nets': 'BKN',
    'New York Knicks': 'NY',
    'Utah Jazz': 'UTA',
    'Oklahoma City Thunder': 'OKC',
    'Portland Trail Blazers': 'POR',
    'Indiana Pacers': 'IND',
    'Milwaukee Bucks': 'MIL',
    'Golden State Warriors': 'GS',
    'Memphis Grizzlies': 'MEM',
    'Los Angeles Lakers': 'LAL'
}
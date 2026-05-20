from datetime import date
import json
import sys
import threading
from pathlib import Path

from flask import Flask, render_template, jsonify
from functools import lru_cache
import subprocess, requests, re, time

_index_lock = threading.Lock()
_warmup_lock = threading.Lock()
_warmup_state = {"status": "idle", "error": None, "step": None}

# NBA engine root (parent of Flask/) — always use same Python as this Flask process (venv).
_ROOT_DIR = Path(__file__).resolve().parent.parent
_PREDICT_TIMEOUT_SEC = 300


@lru_cache()
def fetch_fanduel(ttl_hash=None):
    del ttl_hash
    return fetch_game_data(sportsbook="fanduel")

@lru_cache()
def fetch_draftkings(ttl_hash=None):
    del ttl_hash
    return fetch_game_data(sportsbook="draftkings")

@lru_cache()
def fetch_betmgm(ttl_hash=None):
    del ttl_hash
    return fetch_game_data(sportsbook="betmgm")

def fetch_game_data(sportsbook="fanduel"):
    cmd = [sys.executable, str(_ROOT_DIR / "main.py"), "-xgb", f"-odds={sportsbook}"]
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(_ROOT_DIR),
            capture_output=True,
            text=True,
            timeout=_PREDICT_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        print(f"[predict] {sportsbook} timed out after {_PREDICT_TIMEOUT_SEC}s")
        return {}
    except Exception as exc:
        print(f"[predict] {sportsbook} failed: {exc}")
        return {}

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        print(f"[predict] {sportsbook} exit {proc.returncode}: {err[-2000:]}")
        return {}

    stdout = proc.stdout
    data_re = re.compile(r'\n(?P<home_team>[\w ]+)(\((?P<home_confidence>[\d+\.]+)%\))? vs (?P<away_team>[\w ]+)(\((?P<away_confidence>[\d+\.]+)%\))?: (?P<ou_pick>OVER|UNDER) (?P<ou_value>[\d+\.]+) (\((?P<ou_confidence>[\d+\.]+)%\))?', re.MULTILINE)
    ev_re = re.compile(r'(?P<team>[\w ]+) EV: (?P<ev>[-\d+\.]+)', re.MULTILINE)
    odds_re = re.compile(r'(?P<away_team>[\w ]+) \((?P<away_team_odds>-?\d+)\) @ (?P<home_team>[\w ]+) \((?P<home_team_odds>-?\d+)\)', re.MULTILINE)
    games = {}
    for match in data_re.finditer(stdout):
        game_dict = {'away_team': match.group('away_team').strip(),
                     'home_team': match.group('home_team').strip(),
                     'away_confidence': match.group('away_confidence'),
                     'home_confidence': match.group('home_confidence'),
                     'ou_pick': match.group('ou_pick'),
                     'ou_value': match.group('ou_value'),
                     'ou_confidence': match.group('ou_confidence')}
        for ev_match in ev_re.finditer(stdout):
            if ev_match.group('team') == game_dict['away_team']:
                game_dict['away_team_ev'] = ev_match.group('ev')
            if ev_match.group('team') == game_dict['home_team']:
                game_dict['home_team_ev'] = ev_match.group('ev')
        for odds_match in odds_re.finditer(stdout):
            if odds_match.group('away_team') == game_dict['away_team']:
                game_dict['away_team_odds'] = odds_match.group('away_team_odds')
            if odds_match.group('home_team') == game_dict['home_team']:
                game_dict['home_team_odds'] = odds_match.group('home_team_odds')

        print(json.dumps(game_dict, sort_keys=True, indent=4))
        games[f"{game_dict['away_team']}:{game_dict['home_team']}"] = game_dict
    return games


def get_ttl_hash(seconds=600):
    """Return the same value withing `seconds` time period"""
    return round(time.time() / seconds)


def _run_warmup():
    global _warmup_state
    books = [
        ("fanduel", fetch_fanduel),
        ("draftkings", fetch_draftkings),
        ("betmgm", fetch_betmgm),
    ]
    ttl = get_ttl_hash()
    try:
        with _index_lock:
            for name, fetcher in books:
                _warmup_state = {"status": "running", "error": None, "step": name}
                fetcher(ttl_hash=ttl)
        _warmup_state = {"status": "ready", "error": None, "step": None}
    except Exception as exc:
        _warmup_state = {"status": "error", "error": str(exc), "step": None}


def ensure_warmup_started():
    global _warmup_state
    with _warmup_lock:
        if _warmup_state["status"] != "idle":
            return
        _warmup_state = {"status": "running", "error": None, "step": "starting"}
    threading.Thread(target=_run_warmup, daemon=True).start()


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
        return {
            "fanduel": fetch_fanduel(ttl_hash=ttl),
            "draftkings": fetch_draftkings(ttl_hash=ttl),
            "betmgm": fetch_betmgm(ttl_hash=ttl),
        }


app = Flask(__name__)
app.jinja_env.add_extension('jinja2.ext.loopcontrols')


@app.route("/health")
def health():
    """Lightweight liveness check — must not spawn ML subprocesses."""
    ensure_warmup_started()
    return jsonify({"ok": True, "warmup": _warmup_state["status"]})


@app.route("/api/warmup")
def api_warmup():
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

    return render_template(
        "index.html",
        today=date.today(),
        data=data,
    )




def get_player_data(team_abv):
    """Fetch player data for a given team abbreviation"""
    url = "https://tank01-fantasy-stats.p.rapidapi.com/getNBATeamRoster"
    headers = {
        "x-rapidapi-key": "a0f0cd0b5cmshfef96ed37a9cda6p1f67bajsnfcdd16f37df8",
        "x-rapidapi-host": "tank01-fantasy-stats.p.rapidapi.com"
    }
    querystring = {"teamAbv": team_abv}
    
    try:
        response = requests.get(url, headers=headers, params=querystring)
        data = response.json()
        
        if data.get('statusCode') == 200:
            formatted_players = []
            roster = data.get('body', {}).get('roster', [])
            
            for player in roster:
                # Format injury status
                injury_status = "Healthy"
                if player.get('injury'):
                    injury_info = player['injury']
                    if injury_info.get('designation'):
                        injury_status = injury_info['designation']
                        if injury_info.get('description'):
                            injury_status += f" - {injury_info['description']}"
                
                formatted_player = {
                    'name': player.get('longName'),
                    'shortName': player.get('shortName'),
                    'headshot': player.get('nbaComHeadshot'),
                    'injury': injury_status,
                    'position': player.get('pos'),
                    'height': player.get('height'),
                    'weight': player.get('weight'),
                    'college': player.get('college'),
                    'experience': player.get('exp'),
                    'jerseyNum': player.get('jerseyNum'),
                    'playerId': player.get('playerID'),
                    'birthDate': player.get('bDay')
                }
                formatted_players.append(formatted_player)
            
            return {
                'success': True,
                'players': formatted_players
            }
        
        return {
            'success': False,
            'error': 'Failed to fetch team data'
        }
        
    except Exception as e:
        print(f"Error in get_player_data: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }


@app.route("/team-data/<team_name>")
def team_data(team_name):
    # Convert full team name to abbreviation using the existing dictionary
    team_abv = team_abbreviations.get(team_name)
    
    if not team_abv:
        return jsonify({
            'success': False,
            'error': f'Team abbreviation not found for {team_name}'
        })
    
    # Fetch and return the player data
    result = get_player_data(team_abv)
    return jsonify(result)


    
@app.route("/player-stats/<player_id>")
def player_stats(player_id):
    headers = {
        "x-rapidapi-key": "a0f0cd0b5cmshfef96ed37a9cda6p1f67bajsnfcdd16f37df8",
        "x-rapidapi-host": "tank01-fantasy-stats.p.rapidapi.com"
    }
    
    # First get player info
    info_url = "https://tank01-fantasy-stats.p.rapidapi.com/getNBAPlayerInfo"
    info_querystring = {"playerID": player_id}
    
    # Then get game stats
    games_url = "https://tank01-fantasy-stats.p.rapidapi.com/getNBAGamesForPlayer"
    games_querystring = {
        "playerID": player_id,
        "season": "2024",
    }
    
    try:
        # Get both responses
        info_response = requests.get(info_url, headers=headers, params=info_querystring)
        games_response = requests.get(games_url, headers=headers, params=games_querystring)
        
        info_data = info_response.json()
        games_data = games_response.json()
        
        if info_data.get('statusCode') == 200 and games_data.get('statusCode') == 200:
            # Process games data
            games = list(games_data['body'].values())
            games.sort(key=lambda x: x['gameID'], reverse=True)
            recent_games = games[:10]
            
            # Get player info
            player_info = info_data['body']
            
            # Format injury info
            injury_status = "Healthy"
            if player_info.get('injury'):
                injury_info = player_info['injury']
                injury_status = injury_info

            # Combine and return all data
            return jsonify({
                'success': True,
                'games': recent_games,
                'player': {
                    'name': player_info.get('longName'),
                    'position': player_info.get('pos'),
                    'number': player_info.get('jerseyNum'),
                    'height': player_info.get('height'),
                    'weight': player_info.get('weight'),
                    'team': player_info.get('team'),
                    'college': player_info.get('college'),
                    'experience': player_info.get('exp'),
                    'headshot': player_info.get('nbaComHeadshot'),
                    'injury': injury_status
                }
            })
            
        return jsonify({
            'success': False,
            'error': 'Failed to fetch player data'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

        
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
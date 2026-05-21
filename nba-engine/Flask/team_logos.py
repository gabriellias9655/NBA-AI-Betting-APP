"""NBA team logo URLs (ESPN CDN)."""

# Full team name → ESPN logo slug (https://a.espncdn.com/i/teamlogos/nba/500/{slug}.png)
TEAM_LOGO_SLUG = {
    "Atlanta Hawks": "atl",
    "Boston Celtics": "bos",
    "Brooklyn Nets": "bkn",
    "Charlotte Hornets": "cha",
    "Chicago Bulls": "chi",
    "Cleveland Cavaliers": "cle",
    "Dallas Mavericks": "dal",
    "Denver Nuggets": "den",
    "Detroit Pistons": "det",
    "Golden State Warriors": "gs",
    "Houston Rockets": "hou",
    "Indiana Pacers": "ind",
    "LA Clippers": "lac",
    "Los Angeles Clippers": "lac",
    "Los Angeles Lakers": "lal",
    "Memphis Grizzlies": "mem",
    "Miami Heat": "mia",
    "Milwaukee Bucks": "mil",
    "Minnesota Timberwolves": "min",
    "New Orleans Pelicans": "no",
    "New York Knicks": "ny",
    "Oklahoma City Thunder": "okc",
    "Orlando Magic": "orl",
    "Philadelphia 76ers": "phi",
    "Phoenix Suns": "phx",
    "Portland Trail Blazers": "por",
    "Sacramento Kings": "sac",
    "San Antonio Spurs": "sa",
    "Toronto Raptors": "tor",
    "Utah Jazz": "utah",
    "Washington Wizards": "wsh",
}

# ESPN / broadcast abbreviations → logo slug
TEAM_ABBR_TO_SLUG = {
    "ATL": "atl",
    "BOS": "bos",
    "BKN": "bkn",
    "BRK": "bkn",
    "CHA": "cha",
    "CHI": "chi",
    "CLE": "cle",
    "DAL": "dal",
    "DEN": "den",
    "DET": "det",
    "GS": "gs",
    "GSW": "gs",
    "HOU": "hou",
    "IND": "ind",
    "LAC": "lac",
    "LAL": "lal",
    "MEM": "mem",
    "MIA": "mia",
    "MIL": "mil",
    "MIN": "min",
    "NO": "no",
    "NOP": "no",
    "NY": "ny",
    "NYK": "ny",
    "OKC": "okc",
    "ORL": "orl",
    "PHI": "phi",
    "PHX": "phx",
    "POR": "por",
    "SAC": "sac",
    "SA": "sa",
    "SAS": "sa",
    "TOR": "tor",
    "UTA": "utah",
    "UTAH": "utah",
    "WSH": "wsh",
    "WAS": "wsh",
}

_LOGO_CDN = "https://a.espncdn.com/i/teamlogos/nba/500"
_FALLBACK_LOGO = f"{_LOGO_CDN}/nba.png"


# Odds / display aliases → canonical TEAM_LOGO_SLUG key
_TEAM_LOGO_ALIASES = {
    "LA Clippers": "Los Angeles Clippers",
}


def get_team_logo_by_abbr(abbr: str) -> str:
    if not abbr:
        return _FALLBACK_LOGO
    slug = TEAM_ABBR_TO_SLUG.get(abbr.strip().upper())
    if slug:
        return f"{_LOGO_CDN}/{slug}.png"
    return _FALLBACK_LOGO


def get_team_logo_url(team_name: str) -> str:
    if not team_name:
        return _FALLBACK_LOGO
    name = team_name.strip()
    slug = TEAM_LOGO_SLUG.get(name)
    if not slug:
        canonical = _TEAM_LOGO_ALIASES.get(name)
        if canonical:
            slug = TEAM_LOGO_SLUG.get(canonical)
    if slug:
        return f"{_LOGO_CDN}/{slug}.png"
    return _FALLBACK_LOGO


def all_team_logos():
    """All known teams and logo URLs (for debugging or pickers)."""
    return {name: get_team_logo_url(name) for name in TEAM_LOGO_SLUG}

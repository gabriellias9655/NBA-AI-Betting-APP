"""Refresh NBA team stats cache (uses nba_api — does not require stats.nba.com)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from main import DATA_URL  # noqa: E402
from src.Utils.tools import (  # noqa: E402
    _STATS_CACHE_PATH,
    _save_stats_cache,
    get_team_stats_result_sets,
    to_data_frame,
)


def main():
    print("Fetching team stats (nba_api, then fallbacks)…")
    result_sets = get_team_stats_result_sets(DATA_URL)
    df = to_data_frame(result_sets)
    if df.empty:
        print("Failed — no team stats. Run: npm run setup:python")
        sys.exit(1)
    _save_stats_cache(result_sets)
    print(f"OK: {len(df)} teams cached at {_STATS_CACHE_PATH}")


if __name__ == "__main__":
    main()

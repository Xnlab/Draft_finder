import json
from pathlib import Path

import pytest

from src.build_site import build
from src.demo import make_demo_games

COLUMNS = Path(__file__).resolve().parent.parent / "columns"


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("site")
    df = make_demo_games(n=60, seed=3)
    stats = build(df, out, demo=True, columns_dir=COLUMNS, download_icons=False)   # 테스트는 네트워크를 쓰지 않는다
    load = lambda n: json.loads((out / n).read_text(encoding="utf-8"))  # noqa: E731
    return df, stats, {n: load(n) for n in ("champs.json", "games.json", "meta.json", "columns.json", "stats.json")}


def test_counts_and_files(built):
    df, stats, d = built
    assert stats["games"] == len(df) == len(d["games.json"])
    assert d["meta.json"] == {"demo": True}
    assert stats["columns"] == len(d["columns.json"]) >= 3


def test_game_records_reference_valid_champions(built):
    _, _, d = built
    n = len(d["champs.json"])
    for g in d["games.json"]:
        assert len(g["b"]) == len(g["r"]) == 5
        assert all(-1 <= c < n for c in g["b"] + g["r"] + g["bb"] + g["rb"])
        assert g["w"] in ("b", "r") and g["sg"] >= g["s"] >= 1


def test_champion_roles_and_pick_counts(built):
    df, _, d = built
    champs = d["champs.json"]
    assert [c["id"] for c in champs] == list(range(len(champs)))
    total = sum(c["n"] for c in champs)
    picks = sum(df[f"{s}_{p}"].notna().sum() for s in ("blue", "red") for p in ["top", "jng", "mid", "bot", "sup"])
    assert total == picks                                    # 픽 횟수 합이 실제 픽 수와 같다
    assert all(c["roles"] and c["roles"][0] in c["rc"] for c in champs if c["n"])


def test_series_fields_are_consistent(built):
    _, _, d = built
    by = {}
    for g in d["games.json"]:
        by.setdefault(g["sid"], []).append(g)
    for games in by.values():
        assert len(games) == games[0]["sg"]
        assert sorted(g["s"] for g in games) == list(range(1, len(games) + 1))


def test_missing_gold_diff_stays_null(built, tmp_path):
    df, _, _ = built
    df = df.copy()
    df.loc[df.index[0], "gd15"] = float("nan")
    build(df, tmp_path, demo=True, download_icons=False)
    g = json.loads((tmp_path / "games.json").read_text(encoding="utf-8"))
    assert any(x["gd"] is None for x in g)                   # 0이 아니라 null


def test_stats_json_lines_up_with_games(built):
    """stats.json은 games.json과 같은 순서로 [블루 팀, 레드 팀, 블루 선수 5명, 레드 선수 5명]을 담는다."""
    _, _, d = built
    st, games = d["stats.json"], d["games.json"]
    assert len(st["rows"]) == len(games)
    for row in st["rows"]:
        assert len(row) == 4 and len(row[0]) == len(row[1]) == len(st["team"])
        assert len(row[2]) == len(row[3]) == 5 and all(len(p) == len(st["player"]) for p in row[2] + row[3])
    ti, pi = st["team"].index("k"), st["player"].index("dmg")
    assert all(r[0][ti] is not None and r[1][ti] is not None for r in st["rows"])
    assert all(0 < p[pi] < 1 for r in st["rows"] for p in r[2] + r[3])     # 피해 비중은 0~1


def test_no_stats_file_without_stat_columns(built, tmp_path):
    df, _, _ = built
    plain = df[[c for c in df.columns if "_t_" not in c and not c.endswith(("_k", "_d", "_a", "_dmg", "_gsh", "_vspm", "_cspm", "_dpm", "_csd15"))]]
    build(plain, tmp_path, demo=True, download_icons=False)
    assert not (tmp_path / "stats.json").exists()                  # 지표가 없는 표면 파일을 만들지 않는다

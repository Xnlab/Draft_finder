"""전처리 테스트. 실제 CSV 없이, 원본과 같은 모양(경기당 12줄)의 가짜 원본을 직접 만들어 쓴다."""
import numpy as np
import pandas as pd
import pytest

from src import prepare as P

POS = ["top", "jng", "mid", "bot", "sup"]


def raw_game(gid, date, game, blue, red, blue_champs, red_champs, winner="blue", patch="16.10",
             league="LCK", gd15=500.0, complete="complete", bans_blue=None, blue_key=None, red_key=None,
             year=2026):
    """원본 CSV 한 경기(12줄)를 만든다. 팀 줄의 gd15는 각 팀 기준이라 레드는 부호가 반대."""
    rows = []
    for side, team, champs, key in (("Blue", blue, blue_champs, blue_key), ("Red", red, red_champs, red_key)):
        for i, (pos, c) in enumerate(zip(POS, champs)):
            rows.append(dict(gameid=gid, datacompleteness=complete, league=league, year=year, split="Spring",
                             playoffs=0, date=date, game=game, patch=patch, side=side, position=pos,
                             playername=f"{team}_{pos}", teamname=team, teamid=key, champion=c))
    for side, team, champs, key, win, gd in (
            ("Blue", blue, blue_champs, blue_key, winner == "blue", gd15),
            ("Red", red, red_champs, red_key, winner == "red", -gd15)):
        r = dict(gameid=gid, datacompleteness=complete, league=league, year=year, split="Spring", playoffs=0,
                 date=date, game=game, patch=patch, side=side, position="team", teamname=team, teamid=key,
                 firstPick=1.0 if side == "Blue" else 0.0, result=int(win), gamelength=1900,
                 firstdragon=1.0 if side == "Blue" else 0.0, firstherald=0.0 if side == "Blue" else 1.0,
                 firstbaron=np.nan, firsttower=1.0 if side == "Blue" else 0.0,
                 golddiffat10=gd / 2, golddiffat15=gd, golddiffat20=gd * 2, golddiffat25=gd * 3)
        bans = (bans_blue or ["B1", "B2", "B3", "B4", "B5"]) if side == "Blue" else ["R1", "R2", "R3", "R4", "R5"]
        for i in range(5):
            r[f"ban{i + 1}"] = bans[i]
            r[f"pick{i + 1}"] = champs[i]
        rows.append(r)
    return pd.DataFrame(rows)


def make_raw(*games):
    df = pd.concat(games, ignore_index=True)
    for c in P.NEEDED:
        if c not in df:
            df[c] = np.nan
    return df


A = ["Aatrox", "Vi", "Orianna", "Jinx", "Lulu"]
B = ["Gnar", "Sejuani", "Azir", "Kai'Sa", "Nautilus"]
C = ["Camille", "Lee Sin", "Ahri", "Varus", "Thresh"]
D = ["Jax", "Viego", "Syndra", "Aphelios", "Alistar"]


def test_one_row_per_game_with_expected_columns():
    raw = make_raw(raw_game("g1", "2026-03-01 10:00:00", 1, "T1", "GEN", A, B),
                   raw_game("g2", "2026-03-02 10:00:00", 1, "HLE", "KT", C, D))
    games, rep = P.build_games(raw)
    assert len(games) == raw["gameid"].nunique() == 2
    g = games[games["game_id"] == "g1"].iloc[0]
    assert [g[f"blue_{p}"] for p in POS] == A and [g[f"red_{p}"] for p in POS] == B
    assert g["blue_team"] == "T1" and g["winner"] == "blue" and g["set_no"] == 1
    assert g["blue_top_player"] == "T1_top"
    assert g["blue_bans"] == ["B1", "B2", "B3", "B4", "B5"] and g["blue_pick_order"] == A
    assert g["date"] == "2026-03-01"


def test_gold_diff_is_blue_based_and_winner_from_result():
    raw = make_raw(raw_game("g1", "2026-03-01 10:00:00", 1, "T1", "GEN", A, B, winner="red", gd15=-700.0))
    g = P.build_games(raw)[0].iloc[0]
    assert g["winner"] == "red" and g["gd15"] == -700 and g["gd10"] == -350 and g["gd25"] == -2100


def test_first_objectives_resolve_to_side_or_none():
    g = P.build_games(make_raw(raw_game("g1", "2026-03-01 10:00:00", 1, "T1", "GEN", A, B)))[0].iloc[0]
    assert g["first_dragon"] == "blue" and g["first_herald"] == "red" and g["first_tower"] == "blue"
    assert pd.isna(g["first_baron"]) and g["first_pick"] == "blue"  # 값이 없으면 어느 쪽도 아님


def test_patch_read_as_text_keeps_two_digit_patches(tmp_path):
    raw = make_raw(raw_game("g1", "2026-03-01 10:00:00", 1, "T1", "GEN", A, B, patch="16.10"),
                   raw_game("g2", "2026-03-02 10:00:00", 1, "HLE", "KT", C, D, patch="16.01"))
    f = tmp_path / "x.csv"
    raw.to_csv(f, index=False)
    games, _ = P.build_games(P.load_raw(f))
    assert sorted(games["patch"]) == ["16.01", "16.10"]  # 숫자로 읽으면 둘 다 16.1이 된다


def test_missing_values_stay_missing_and_flag_incomplete():
    raw = make_raw(raw_game("g1", "2026-03-01 10:00:00", 1, "T1", "GEN", A, B, complete="partial",
                            bans_blue=["B1", np.nan, "B3", np.nan, np.nan]))
    raw.loc[(raw.position == "team"), "golddiffat15"] = np.nan
    g = P.build_games(raw)[0].iloc[0]
    assert g["blue_bans"] == ["B1", "B3"]          # 빈 밴은 목록에서만 빠진다
    assert np.isnan(g["gd15"])                       # 0으로 채우지 않는다
    assert not g["data_complete"]


def test_missing_champion_makes_game_incomplete_but_keeps_it():
    raw = make_raw(raw_game("g1", "2026-03-01 10:00:00", 1, "T1", "GEN", A, B))
    raw.loc[(raw.side == "Blue") & (raw.position == "jng"), "champion"] = np.nan
    games, _ = P.build_games(raw)
    assert len(games) == 1 and not games.iloc[0]["data_complete"] and pd.isna(games.iloc[0]["blue_jng"])


def test_malformed_game_is_dropped_and_reported():
    good = raw_game("g1", "2026-03-01 10:00:00", 1, "T1", "GEN", A, B)
    bad = raw_game("g2", "2026-03-02 10:00:00", 1, "HLE", "KT", C, D)
    bad = bad[bad["side"].ne("Red") | bad["position"].ne("team")]  # 레드 팀 줄이 없다
    games, rep = P.build_games(make_raw(good, bad))
    assert list(games["game_id"]) == ["g1"] and rep["dropped"]


def test_series_grouping():
    t = "2026-03-01 1{}:00:00"
    raw = make_raw(
        # 시리즈 1: T1 vs GEN, 3세트 (블루/레드가 바뀌어도 같은 시리즈)
        raw_game("a1", t.format(0), 1, "T1", "GEN", A, B, blue_key="t1", red_key="gen"),
        raw_game("a2", t.format(1), 2, "GEN", "T1", C, D, blue_key="gen", red_key="t1"),
        raw_game("a3", t.format(2), 3, "T1", "GEN", ["Jax", "Elise", "Ryze", "Zeri", "Rell"],
                 ["Ornn", "Nidalee", "Hwei", "Ashe", "Karma"], blue_key="t1", red_key="gen"),
        # 같은 날 다른 팀의 단판
        raw_game("b1", t.format(0), 1, "HLE", "KT", ["Gwen", "Maokai", "Sylas", "Xayah", "Rakan"],
                 ["Rumble", "Wukong", "Viktor", "Lucian", "Braum"], blue_key="hle", red_key="kt"),
        # T1 vs GEN을 다음 달에 다시 만남 (새 시리즈)
        raw_game("c1", "2026-04-20 10:00:00", 1, "T1", "GEN", ["Sion", "Rek'Sai", "Taliyah", "Sivir", "Milio"],
                 ["Kennen", "Xin Zhao", "Corki", "Smolder", "Pyke"], blue_key="t1", red_key="gen"),
    )
    games, _ = P.build_games(raw)
    s = games.set_index("game_id")
    assert s.loc["a1", "series_id"] == s.loc["a2", "series_id"] == s.loc["a3", "series_id"]
    assert s.loc["a1", "series_games"] == 3 and s.loc["a1", "series_ok"]
    assert len({s.loc[x, "series_id"] for x in ("a1", "b1", "c1")}) == 3
    assert s.loc["b1", "series_games"] == 1


def test_series_without_game_one_is_flagged_not_ok():
    raw = make_raw(raw_game("x2", "2026-03-01 10:00:00", 2, "T1", "GEN", A, B, blue_key="t1", red_key="gen"),
                   raw_game("x3", "2026-03-01 11:00:00", 3, "T1", "GEN", C, D, blue_key="t1", red_key="gen"))
    games, _ = P.build_games(raw)
    assert not games["series_ok"].any()


def test_load_raw_rejects_files_missing_columns(tmp_path):
    f = tmp_path / "bad.csv"
    pd.DataFrame({"gameid": ["g1"]}).to_csv(f, index=False)
    with pytest.raises(ValueError, match="필요한 열"):
        P.load_raw(f)

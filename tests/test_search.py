import pandas as pd
import pytest

from src.search import (
    apply_filters, find_matchup, find_same_champions, game_picks,
    similar_both, similar_one_side, similar_to_game, summarize, summary_line,
)


def ids(df):
    return set(df["game_id"])


# ---- 3. 같은 챔피언 찾기
def test_same_champions_finds_both_sides(games):
    res = find_same_champions(games, ["Orianna", "Vi"])
    assert ids(res) == {"G1", "G2", "G3"}
    sides = dict(zip(res["game_id"], res["side"]))
    assert sides == {"G1": "blue", "G2": "red", "G3": "red"}


def test_same_champions_requires_same_team(games):
    # 오리아나(블루)와 아지르(레드)는 같은 팀에 있던 적이 없다
    assert find_same_champions(games, ["Orianna", "Azir"]).empty


def test_same_champions_empty_pick_shows_missing_label(games):
    res = find_same_champions(games, ["Aatrox"])
    g5 = res[res["game_id"] == "G5"].iloc[0]
    assert g5["jng"] == "없음"  # 빈 칸도 경기는 결과에 남는다


def test_same_champions_needs_input(games):
    with pytest.raises(ValueError):
        find_same_champions(games, [])


# ---- 4. 같은 맞대결 찾기
def test_matchup_finds_both_sides(games):
    res = find_matchup(games, "mid", "Azir", "Orianna")
    assert ids(res) == {"G1", "G2", "G3", "G6"}
    # champ_a(아지르)를 쓴 쪽 기준: 블루인 경기도, 레드인 경기도 있다
    assert dict(zip(res["game_id"], res["side"])) == {
        "G1": "red", "G2": "blue", "G3": "blue", "G6": "red",
    }
    assert (res["mid"] == "Azir").all()


def test_matchup_is_position_specific(games):
    assert find_matchup(games, "top", "Azir", "Orianna").empty


def test_matchup_mirror_counted_once():
    row = {"game_id": "M", "league": "LCK", "date": "2026-01-01", "patch": "16.1",
           "set_no": 1, "blue_team": "A", "red_team": "B", "winner": "blue", "gd15": 0}
    for s in ("blue", "red"):
        for p, c in zip(["top", "jng", "mid", "bot", "sup"],
                        ["Gnar", "Vi", "Ahri", "Jinx", "Lulu"]):
            row[f"{s}_{p}"] = c
    res = find_matchup(pd.DataFrame([row]), "mid", "Ahri", "Ahri")
    assert len(res) == 1


def test_matchup_rejects_bad_position(games):
    with pytest.raises(ValueError):
        find_matchup(games, "middle", "Azir", "Orianna")


# ---- 5. 유사 조합 + 필터
def test_one_side_ranking_and_scores(games):
    q = ["Aatrox", "Vi", "Orianna", "Jinx", "Lulu"]
    res = similar_one_side(games, q)
    assert list(res["game_id"]) == ["G3", "G1", "G5", "G2", "G6", "G4"]
    scores = dict(zip(res["game_id"], res["score"]))
    assert scores["G1"] == scores["G3"] == 1.0
    assert scores["G5"] == pytest.approx(4 / 5)
    assert scores["G2"] == pytest.approx(3 / 7)  # 겹침 3개 ÷ 합집합 7개


def test_one_side_picks_better_team_and_reports_it(games):
    res = similar_one_side(games, ["Aatrox", "Vi", "Orianna", "Jinx", "Lulu"])
    sides = dict(zip(res["game_id"], res["side"]))
    assert sides["G3"] == "red"   # G3은 진영이 반대라 레드 쪽이 매칭
    assert sides["G1"] == "blue"
    assert sides["G2"] == "blue"  # 블루(3/7)가 레드(2/8)보다 비슷


def test_one_side_top_n(games):
    assert len(similar_one_side(games, ["Orianna"], top_n=2)) == 2


def test_both_sides_handles_swapped_sides(games):
    res = similar_both(games, ["Aatrox", "Vi", "Orianna", "Jinx", "Lulu"],
                       ["Gnar", "Sejuani", "Azir", "Kai'Sa", "Nautilus"])
    top = res[res["score"] == 1.0]
    assert ids(top) == {"G1", "G3"}
    assert dict(zip(top["game_id"], top["a_side"])) == {"G1": "blue", "G3": "red"}


def test_both_sides_partial_game_scored_not_dropped(games):
    res = similar_both(games, ["Aatrox", "Vi", "Orianna", "Jinx", "Lulu"],
                       ["Gnar", "Sejuani", "Azir", "Kai'Sa", "Nautilus"])
    g5 = res[res["game_id"] == "G5"].iloc[0]
    assert g5["score"] == pytest.approx((4 / 5 + 4 / 6) / 2)
    assert g5["blue_jng"] == "없음"


def test_similar_to_game_includes_itself_with_score_one(games):
    for side in (None, "blue", "red"):
        res = similar_to_game(games, "G1", side=side)
        row = res[res["game_id"] == "G1"].iloc[0]
        assert row["score"] == 1.0
        assert res.iloc[0]["score"] == 1.0


def test_similar_to_game_unknown_id(games):
    with pytest.raises(KeyError):
        game_picks(games, "NOPE")


def test_filters_patch_league_sets(games):
    assert ids(apply_filters(games, patch_min="16.2", patch_max="16.3")) == {"G2", "G3", "G4", "G6"}
    assert ids(apply_filters(games, leagues=["LCK"])) == {"G1", "G4", "G6"}
    assert ids(apply_filters(games, sets=[4, 5])) == {"G3", "G5", "G6"}


def test_patch_filter_compares_numerically(games):
    g = games.copy()
    g.loc[g["game_id"] == "G1", "patch"] = "16.10"
    assert "G1" in ids(apply_filters(g, patch_min="16.9"))
    assert "G1" not in ids(apply_filters(g, patch_max="16.9"))


def test_filters_applied_before_similarity(games):
    res = similar_one_side(games, ["Aatrox", "Vi", "Orianna", "Jinx", "Lulu"],
                           sets=[4, 5])
    assert ids(res) == {"G3", "G5", "G6"}


# ---- 결과 요약
def test_summary_counts_matched_team_wins(games):
    res = find_matchup(games, "mid", "Azir", "Orianna")
    assert summarize(res) == {"games": 4, "wins": 0, "losses": 4, "unknown": 0}
    both = similar_both(games, ["Aatrox", "Vi", "Orianna", "Jinx", "Lulu"],
                        ["Gnar", "Sejuani", "Azir", "Kai'Sa", "Nautilus"], top_n=2)
    assert summarize(both)["games"] == 2
    assert "검색된 4경기" in summary_line(res)

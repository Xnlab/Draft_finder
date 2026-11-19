"""검색 함수: 같은 챔피언 / 같은 맞대결 / 유사 조합 + 필터.

입력은 "경기 하나당 한 줄" 표(`games`)이고, 챔피언은 영문 이름이다
(한글 변환은 names.py). 열 구성은 기획서 "전처리로 만들 표"를 따른다.

    game_id, league, date, patch, set_no, blue_team, red_team,
    winner("blue"/"red"), blue_top..blue_sup, red_top..red_sup, gd15(블루 기준)
    (선택) data_complete

빈 챔피언(None/NaN/"")은 검색에서 빼지 않고, 유사도 집합에서만 제외하며
결과 표에는 "없음"으로 보여 준다.
"""
from __future__ import annotations

import pandas as pd

POSITIONS = ["top", "jng", "mid", "bot", "sup"]
MISSING = "없음"

META_COLS = ["game_id", "league", "date", "patch", "set_no"]


# ---------------------------------------------------------------- 공통 도구
def _is_missing(v) -> bool:
    return bool(pd.isna(v)) or v == "" or v == MISSING


def _patch_key(p):
    """'16.10' -> (16, 10). 숫자로 비교해야 16.10 > 16.9가 맞는다."""
    if p is None or pd.isna(p):
        return None
    return tuple(int(x) for x in str(p).split("."))


def _as_set(picks) -> frozenset:
    s = frozenset(c for c in picks if not _is_missing(c))
    if not s:
        raise ValueError("챔피언을 하나 이상 넣어야 합니다.")
    return s


def jaccard(a: frozenset, b: frozenset) -> float:
    union = len(a | b)
    return len(a & b) / union if union else 0.0


def apply_filters(df, patch_min=None, patch_max=None, leagues=None, sets=None):
    """패치 범위(양끝 포함), 리그 목록, 세트 번호 목록으로 경기를 거른다."""
    out = df
    if patch_min is not None:
        lo = _patch_key(patch_min)
        out = out[out["patch"].map(lambda p: (k := _patch_key(p)) is not None and k >= lo)]
    if patch_max is not None:
        hi = _patch_key(patch_max)
        out = out[out["patch"].map(lambda p: (k := _patch_key(p)) is not None and k <= hi)]
    if leagues is not None:
        out = out[out["league"].isin(list(leagues))]
    if sets is not None:
        out = out[out["set_no"].isin(list(sets))]
    return out


def team_rows(df) -> pd.DataFrame:
    """경기 표를 "팀 한 줄" 표로 펼친다 (경기당 2줄). win/gd15는 그 팀 기준."""
    parts = []
    for side, other in (("blue", "red"), ("red", "blue")):
        t = df[META_COLS].copy()
        t["side"] = side
        t["team"] = df[f"{side}_team"]
        t["opponent"] = df[f"{other}_team"]
        win = (df["winner"] == side).astype(object)
        t["win"] = win.where(df["winner"].notna(), None)
        t["gd15"] = df["gd15"] if side == "blue" else -df["gd15"]
        for p in POSITIONS:
            t[p] = df[f"{side}_{p}"]
            t[f"opp_{p}"] = df[f"{other}_{p}"]
        if "data_complete" in df:
            t["data_complete"] = df["data_complete"]
        parts.append(t)
    out = pd.concat(parts, ignore_index=True)
    out["pickset"] = [
        frozenset(c for c in row if not _is_missing(c))
        for row in zip(*(out[p] for p in POSITIONS))
    ]
    return out


def _team_result(t, extra=(), sort_by_date=True) -> pd.DataFrame:
    """팀 한 줄 결과 표 정리: 보여 줄 열만 고르고, 빈 챔피언은 "없음"으로."""
    cols = META_COLS + ["team", "side", "opponent", "win", "gd15"] + list(extra)
    opp = [f"opp_{p}" for p in POSITIONS]  # 상대 팀 챔피언 (화면의 드래프트 보드용)
    cols += POSITIONS + ["data_complete"] + opp
    out = t[[c for c in cols if c in t]].copy()
    out[POSITIONS + opp] = out[POSITIONS + opp].fillna(MISSING)
    if sort_by_date:
        out = out.sort_values("date", ascending=False, kind="stable")
    return out.reset_index(drop=True)


# ---------------------------------------------------------------- 검색 1·2
def find_same_champions(df, champs, **filters) -> pd.DataFrame:
    """주어진 챔피언이 모두 같은 팀에 있었던 경기. 팀 한 줄씩(양 진영 모두) 돌려준다."""
    need = _as_set(champs)
    t = team_rows(apply_filters(df, **filters))
    return _team_result(t[t["pickset"].map(lambda s: need <= s)])


def find_matchup(df, position, champ_a, champ_b, **filters) -> pd.DataFrame:
    """`position`에서 champ_a(한 진영) 대 champ_b(상대 진영)가 맞붙은 경기.

    진영은 가리지 않는다. 결과의 팀 한 줄은 champ_a를 쓴 쪽 기준이다.
    """
    if position not in POSITIONS:
        raise ValueError(f"position은 {POSITIONS} 중 하나여야 합니다: {position!r}")
    t = team_rows(apply_filters(df, **filters))
    hit = t[(t[position] == champ_a) & (t[f"opp_{position}"] == champ_b)]
    hit = hit.drop_duplicates("game_id")  # 같은 챔피언끼리(미러)일 때 한 번만
    hit = hit.assign(opp_champ=champ_b)
    return _team_result(hit, extra=["opp_champ"])


# ---------------------------------------------------------------- 검색 3
def _finish_scored(t, top_n) -> pd.DataFrame:
    t = t.sort_values(
        ["score", "date", "game_id"], ascending=[False, False, True], kind="stable"
    )
    return t.head(top_n).reset_index(drop=True)


def similar_one_side(df, picks, top_n=10, **filters) -> pd.DataFrame:
    """한 팀 조합과 비슷한 경기. 후보 경기의 두 팀 중 더 비슷한 쪽의 점수를 쓴다.

    점수가 같으면 블루 쪽을 택하고, 정렬은 점수 → 최근 날짜 순.
    """
    q = _as_set(picks)
    t = team_rows(apply_filters(df, **filters))
    t["score"] = t["pickset"].map(lambda s: jaccard(q, s))
    t = t.sort_values(["game_id", "score", "side"], ascending=[True, False, True])
    best = t.drop_duplicates("game_id")
    res = _finish_scored(best, top_n)
    return _team_result(res, extra=["score"], sort_by_date=False)


def _side_sets(g, side) -> list[frozenset]:
    return [
        frozenset(c for c in row if not _is_missing(c))
        for row in zip(*(g[f"{side}_{p}"] for p in POSITIONS))
    ]


def similar_both(df, picks_a, picks_b, top_n=10, **filters) -> pd.DataFrame:
    """두 팀 조합이 모두 비슷한 경기. 경기 한 줄씩 돌려준다.

    A-B / B-A 두 짝(진영이 바뀐 경우)을 다 계산해 더 높은 쪽을 쓴다.
    `a_side`는 조합 A에 대응된 후보 경기의 진영이다.
    """
    a, b = _as_set(picks_a), _as_set(picks_b)
    g = apply_filters(df, **filters).copy()
    bs, rs = _side_sets(g, "blue"), _side_sets(g, "red")
    straight = [(jaccard(a, x) + jaccard(b, y)) / 2 for x, y in zip(bs, rs)]
    swapped = [(jaccard(a, y) + jaccard(b, x)) / 2 for x, y in zip(bs, rs)]
    g["score"] = [max(s, w) for s, w in zip(straight, swapped)]
    g["a_side"] = ["blue" if s >= w else "red" for s, w in zip(straight, swapped)]
    g = _finish_scored(g, top_n)
    cols = META_COLS + ["blue_team", "red_team", "winner", "gd15", "a_side", "score"]
    champ_cols = [f"{s}_{p}" for s in ("blue", "red") for p in POSITIONS]
    out = g[[c for c in cols + champ_cols + ["data_complete"] if c in g]].copy()
    out[champ_cols] = out[champ_cols].fillna(MISSING)
    return out


def game_picks(df, game_id) -> tuple[list[str], list[str]]:
    """경기 ID의 (블루 픽, 레드 픽). 빈 칸은 뺀다."""
    rows = df[df["game_id"] == game_id]
    if rows.empty:
        raise KeyError(f"경기 ID를 찾을 수 없습니다: {game_id!r}")
    r = rows.iloc[0]
    pick = lambda side: [r[f"{side}_{p}"] for p in POSITIONS if not _is_missing(r[f"{side}_{p}"])]
    return pick("blue"), pick("red")


def similar_to_game(df, game_id, side=None, top_n=10, **filters) -> pd.DataFrame:
    """분석 중인 경기와 비슷한 경기. side가 None이면 양쪽, 'blue'/'red'면 그 팀만."""
    blue, red = game_picks(df, game_id)
    if side is None:
        return similar_both(df, blue, red, top_n=top_n, **filters)
    if side not in ("blue", "red"):
        raise ValueError("side는 None, 'blue', 'red' 중 하나여야 합니다.")
    return similar_one_side(df, blue if side == "blue" else red, top_n=top_n, **filters)


# ---------------------------------------------------------------- 결과 요약
def summarize(result: pd.DataFrame) -> dict:
    """검색된 경기 수와 매칭된 팀의 승패. 표본이 작을 때를 대비해 N을 항상 함께 낸다."""
    if "win" in result:
        wins = result["win"]
    elif {"winner", "a_side"} <= set(result):
        wins = (result["winner"] == result["a_side"]).astype(object).where(
            result["winner"].notna(), None
        )
    else:
        raise ValueError("승패를 알 수 없는 결과 표입니다.")
    known = wins.dropna()
    return {
        "games": len(result),
        "wins": int(known.sum()),
        "losses": int((~known.astype(bool)).sum()),
        "unknown": len(result) - len(known),
    }


def matched_gd15(result: pd.DataFrame) -> pd.Series:
    """15분 골드차를 '매칭된 팀' 기준으로 맞춘다 (양쪽 비교는 조합 A에 대응된 팀 기준)."""
    if "win" in result:  # 팀 한 줄 결과: 이미 그 팀 기준
        return result["gd15"]
    sign = result["a_side"].map({"blue": 1, "red": -1})
    return result["gd15"] * sign


def summary_line(result: pd.DataFrame) -> str:
    s = summarize(result)
    line = f"검색된 {s['games']}경기, 매칭된 팀 {s['wins']}승 {s['losses']}패"
    return line + (f" (결과 미상 {s['unknown']})" if s["unknown"] else "")

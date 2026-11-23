"""Oracle's Elixir CSV -> 경기 하나당 한 줄짜리 표 (data/games.parquet).

원본은 경기당 12줄(선수 10 + 팀 2)이다. 열 구성은 2026 파일을 직접 확인해 정했다
(docs/기획서.md "데이터" 참고). CSV를 바꾼 때만 다시 실행한다.

    python -m src.prepare                       # data/raw/*OraclesElixir.csv -> data/games.parquet
    python -m src.prepare --raw 파일.csv --out 결과.parquet
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

POSITIONS = ["top", "jng", "mid", "bot", "sup"]
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_PATH = ROOT / "data" / "games.parquet"
FULL_PATH = ROOT / "data" / "players.parquet"   # 원본 165개 열 전부 (분석용, 경기당 12줄)

NEEDED = (
    ["gameid", "datacompleteness", "league", "year", "split", "playoffs", "date", "game",
     "patch", "side", "position", "playername", "teamname", "teamid", "firstPick",
     "champion", "gamelength", "result", "firstdragon", "firstherald", "firstbaron",
     "firsttower", "golddiffat10", "golddiffat15", "golddiffat20", "golddiffat25"]
    + [f"ban{i}" for i in range(1, 6)] + [f"pick{i}" for i in range(1, 6)]
)
# 팀 지표(경기마다 팀 줄의 값). 키는 사이트 JSON에서 쓰는 짧은 이름이다.
TEAM_STATS = {
    "k": "teamkills", "d": "teamdeaths", "fb": "firstblood", "drg": "dragons",
    "inf": "infernals", "mtn": "mountains", "cld": "clouds", "ocn": "oceans", "chm": "chemtechs", "hex": "hextechs",
    "eld": "elders", "her": "heralds", "grub": "void_grubs", "bar": "barons", "tow": "towers", "plt": "turretplates",
    "gold": "totalgold", "dpm": "dpm", "wpm": "wpm", "wcpm": "wcpm", "vspm": "vspm", "csd15": "csdiffat15",
    # 경기 흐름: 10·15분 시점 차이, 15분 킬, 포탑 흐름, 억제기, 골드 지출 차이
    "csd10": "csdiffat10", "xpd10": "xpdiffat10", "xpd15": "xpdiffat15", "k15": "killsat15",
    "fmt": "firstmidtower", "f3t": "firsttothreetowers", "inh": "inhibitors", "gspd": "gspd",
}
# 선수 지표(경기마다 선수 줄의 값). 팀 CS/분은 선수 cspm의 합으로 만든다(팀 줄의 cspm은 7% 비어 있다).
PLAYER_STATS = {
    "k": "kills", "d": "deaths", "a": "assists", "dmg": "damageshare", "gsh": "earnedgoldshare",
    "vspm": "vspm", "cspm": "cspm", "dpm": "dpm", "csd15": "csdiffat15",
    # 스타일: 15분 시점(골드·경험치 차이, 킬·어시스트·데스), 첫 킬 관여, 받은·경감한 피해, 시야, 상대 정글 몬스터, 포탑 방패
    "gd15": "golddiffat15", "xpd15": "xpdiffat15", "k15": "killsat15", "a15": "assistsat15", "d15": "deathsat15",
    "fbk": "firstbloodkill", "fba": "firstbloodassist", "fbv": "firstbloodvictim",
    "dtpm": "damagetakenperminute", "dmpm": "damagemitigatedperminute", "wpm": "wpm", "wcpm": "wcpm",
    "cwb": "controlwardsbought", "mej": "monsterkillsenemyjungle", "plt": "turretplates",
}
NEEDED += sorted((set(TEAM_STATS.values()) | set(PLAYER_STATS.values())) - set(NEEDED))
SERIES_GAP_HOURS = 36  # 같은 시리즈로 볼 세트 사이의 최대 간격


def find_raw_csv(raw_dir: Path = RAW_DIR) -> Path:
    files = sorted(raw_dir.glob("*OraclesElixir*.csv"))
    if not files:
        raise FileNotFoundError(f"{raw_dir} 에 Oracle's Elixir CSV가 없습니다.")
    return files[-1]


def load_raw(path: Path) -> pd.DataFrame:
    """CSV를 읽는다. patch는 반드시 글자로 읽는다: 숫자로 읽으면 '16.10'이 '16.1'이 되어 '16.01'과 섞인다."""
    head = pd.read_csv(path, nrows=0)
    missing = [c for c in NEEDED if c not in head.columns]
    if missing:
        raise ValueError(f"CSV에 필요한 열이 없습니다: {missing}")
    return pd.read_csv(
        path, usecols=NEEDED, low_memory=False,
        dtype={"patch": str, "gameid": str, "playername": str, "teamid": str},
    )


def _first_side(blue: pd.Series, red: pd.Series) -> pd.Series:
    """팀 줄의 0/1 표시(첫 드래곤 등)를 'blue'/'red'/None으로."""
    out = pd.Series(None, index=blue.index, dtype=object)
    out[red == 1] = "red"
    out[blue == 1] = "blue"
    return out


def assign_series(g: pd.DataFrame) -> pd.DataFrame:
    """시리즈(Bo3/Bo5) 묶기. 원본에 시리즈 ID가 없어서 추정한다.

    같은 리그, 같은 팀 쌍에서 세트 번호가 1부터 1씩 늘고 간격이 36시간 이내이면 한 시리즈.
    2026 파일에서는 4,523개 중 99.7%가 1세트부터 빠짐없이 이어졌다.
    """
    keys = pd.DataFrame({
        "pair": [tuple(sorted(x)) for x in zip(g["_blue_key"], g["_red_key"])],
        "league": g["league"], "ts": pd.to_datetime(g["datetime"]), "set_no": g["set_no"],
    }, index=g.index).sort_values(["league", "pair", "ts"])
    series, cur, prev = [], -1, None
    for r in keys.itertuples():
        new = (prev is None or r.league != prev.league or r.pair != prev.pair
               or r.set_no != prev.set_no + 1 or r.set_no == 1
               or (r.ts - prev.ts).total_seconds() > SERIES_GAP_HOURS * 3600)
        if new:
            cur += 1
        series.append(cur)
        prev = r
    g = g.copy()
    g["series_id"] = pd.Series(series, index=keys.index)
    grp = g.groupby("series_id")["set_no"]
    g["series_games"] = grp.transform("size")
    g["series_ok"] = (grp.transform("min") == 1) & (grp.transform("max") == g["series_games"])
    return g


def _stat_columns(blue: pd.DataFrame, red: pd.DataFrame, players: pd.DataFrame, gid) -> pd.DataFrame:
    """팀 지표(blue_t_k ...)와 선수 지표(blue_mid_dmg ...) 열. 빈 값은 NaN으로 둔다."""
    cols = {}
    for side, t in (("blue", blue), ("red", red)):
        for key, col in TEAM_STATS.items():
            cols[f"{side}_t_{key}"] = pd.to_numeric(t[col], errors="coerce")
    for key, col in PLAYER_STATS.items():
        v = players.pivot(index="gameid", columns=["side", "position"], values=col).loc[gid]
        for side in ("blue", "red"):
            for pos in POSITIONS:
                cols[f"{side}_{pos}_{key}"] = pd.to_numeric(v[(side, pos)], errors="coerce")
    out = pd.DataFrame(cols, index=gid)
    for side in ("blue", "red"):
        out[f"{side}_t_cspm"] = out[[f"{side}_{p}_cspm" for p in POSITIONS]].sum(axis=1, min_count=5)
    return out


def build_games(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """경기 하나당 한 줄 표와, 걸러진 경기 수 같은 보고를 돌려준다."""
    raw = raw.copy()
    raw["side"] = raw["side"].str.lower()
    players = raw[raw["position"] != "team"]
    teams = raw[raw["position"] == "team"]
    report = {"raw_games": raw["gameid"].nunique(), "dropped": {}}

    # 한 경기에 같은 진영·포지션이 둘 이상이거나 팀 줄이 모자란 경우는 걸러낸다 (이유와 함께 보고)
    dup = players.groupby(["gameid", "side", "position"]).size()
    bad_players = set(dup[dup > 1].reset_index()["gameid"])
    tcount = teams.groupby(["gameid", "side"]).size().unstack(fill_value=0)
    bad_teams = set(tcount.index[(tcount.get("blue", 0) != 1) | (tcount.get("red", 0) != 1)])
    no_team = set(raw["gameid"]) - set(tcount.index)
    bad = bad_players | bad_teams | no_team
    if bad:
        report["dropped"] = {"포지션 중복": len(bad_players), "팀 줄 이상": len(bad_teams | no_team)}
    players, teams = players[~players["gameid"].isin(bad)], teams[~teams["gameid"].isin(bad)]

    blue = teams[teams["side"] == "blue"].set_index("gameid")
    red = teams[teams["side"] == "red"].set_index("gameid")
    champ = players.pivot(index="gameid", columns=["side", "position"], values="champion")
    name = players.pivot(index="gameid", columns=["side", "position"], values="playername")
    gid = blue.index.intersection(red.index).intersection(champ.index)
    blue, red, champ, name = blue.loc[gid], red.loc[gid], champ.loc[gid], name.loc[gid]

    g = pd.DataFrame(index=gid)
    dt = pd.to_datetime(blue["date"])
    g["league"], g["year"], g["split"] = blue["league"], blue["year"], blue["split"]
    g["playoffs"] = blue["playoffs"] == 1
    g["datetime"] = dt.dt.strftime("%Y-%m-%d %H:%M:%S")
    g["date"] = dt.dt.strftime("%Y-%m-%d")
    g["patch"] = blue["patch"]
    g["set_no"] = blue["game"].astype(int)
    g["blue_team"], g["red_team"] = blue["teamname"], red["teamname"]
    g["winner"] = None
    g.loc[blue["result"] == 1, "winner"] = "blue"
    g.loc[red["result"] == 1, "winner"] = "red"
    for side in ("blue", "red"):
        for pos in POSITIONS:
            g[f"{side}_{pos}"] = champ[(side, pos)]
            g[f"{side}_{pos}_player"] = name[(side, pos)]
    for side, t in (("blue", blue), ("red", red)):
        g[f"{side}_bans"] = t[[f"ban{i}" for i in range(1, 6)]].apply(lambda r: [x for x in r if pd.notna(x)], axis=1)
        g[f"{side}_pick_order"] = t[[f"pick{i}" for i in range(1, 6)]].apply(lambda r: [x for x in r if pd.notna(x)], axis=1)
    g["first_pick"] = _first_side(blue["firstPick"], red["firstPick"])
    # 골드차는 블루 기준 (팀 줄은 각 팀 기준이라 블루 줄을 쓴다). 빈 값은 0이 아니라 NaN으로 둔다.
    for m in (10, 15, 20, 25):
        g[f"gd{m}"] = blue[f"golddiffat{m}"]
    g["length_sec"] = blue["gamelength"]
    for k, col in (("first_dragon", "firstdragon"), ("first_herald", "firstherald"),
                   ("first_baron", "firstbaron"), ("first_tower", "firsttower")):
        g[k] = _first_side(blue[col], red[col])
    g = pd.concat([g, _stat_columns(blue, red, players, gid)], axis=1)
    picks_ok = g[[f"{s}_{p}" for s in ("blue", "red") for p in POSITIONS]].notna().all(axis=1)
    g["data_complete"] = (blue["datacompleteness"] == "complete") & picks_ok
    g["_blue_key"] = blue["teamid"].fillna(blue["teamname"])
    g["_red_key"] = red["teamid"].fillna(red["teamname"])

    g = g.reset_index(names="game_id").sort_values(["datetime", "game_id"]).reset_index(drop=True)
    g = assign_series(g).drop(columns=["_blue_key", "_red_key"])
    report["games"] = len(g)
    return g, report


def warn_unknown_names(games: pd.DataFrame) -> list[str]:
    """데이터의 챔피언 이름 중 Data Dragon 대응표에 없는 것 (캐시가 없으면 건너뜀)."""
    try:
        from src.names import NameResolver, load_name_map
        resolver = NameResolver(load_name_map())
    except Exception:
        return []
    cols = [f"{s}_{p}" for s in ("blue", "red") for p in POSITIONS]
    names = set(games[cols].stack().dropna()) | {b for c in ("blue_bans", "red_bans") for l in games[c] for b in l}
    return resolver.unknown_in_data(names)


def save_full(raw_path: Path, out_path: Path = FULL_PATH) -> int:
    """원본의 모든 열을 그대로 parquet으로 저장한다 (화면에 안 쓰는 지표도 분석에서 쓸 수 있게).
    patch와 ID 열은 글자로 읽는다."""
    full = pd.read_csv(raw_path, low_memory=False,
                       dtype={"patch": str, "gameid": str, "playername": str, "teamid": str, "playerid": str})
    out_path.parent.mkdir(parents=True, exist_ok=True)
    full.to_parquet(out_path, index=False)
    return len(full)


def prepare(raw_path: Path | None = None, out_path: Path = OUT_PATH, full_path: Path | None = FULL_PATH) -> pd.DataFrame:
    raw_path = Path(raw_path) if raw_path else find_raw_csv()
    if full_path is not None:
        n = save_full(raw_path, full_path)
        print(f"원본 전체 열 {n:,}줄 -> {full_path}")
    games, report = build_games(load_raw(raw_path))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    games.to_parquet(out_path, index=False)
    unknown = warn_unknown_names(games)
    print(f"원본 {raw_path.name}: 고유 경기 {report['raw_games']:,} -> 결과 {report['games']:,}경기 ({out_path})")
    if report["dropped"]:
        print("걸러진 경기:", report["dropped"])
    if unknown:
        print("⚠ 이름 대응표에 없는 챔피언:", unknown)
    print(f"일부 누락 경기 {int((~games['data_complete']).sum()):,}개, 시리즈 {games['series_id'].nunique():,}개 "
          f"(이상 {int((~games.drop_duplicates('series_id')['series_ok']).sum())}개)")
    return games


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path)
    ap.add_argument("--out", type=Path, default=OUT_PATH)
    a = ap.parse_args()
    prepare(a.raw, a.out)

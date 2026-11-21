"""사이트가 읽는 데이터 파일을 만든다 (champs.json, games.json, meta.json, columns.json, icons/).

    python -m src.build_site --demo --out workbench   # 가짜 경기로 (저장소에 올려도 되는 데모)
    python -m src.build_site --out site            # data/games.parquet로 (실제 데이터. 저장소에 올리지 않는다)

화면(index.html, app.js)은 `workbench/` 폴더에 있고, 이 스크립트는 같은 폴더 안에 데이터만 채운다.
실제 데이터는 `site/`로 만들고 화면 파일을 함께 복사한다(--with-app).
"""
from __future__ import annotations

import argparse
import io
import json
import shutil
from collections import Counter
from pathlib import Path

import pandas as pd

from src.columns import load_columns

ROOT = Path(__file__).resolve().parent.parent
POS = ["top", "jng", "mid", "bot", "sup"]
APP_DIR = ROOT / "workbench"
ICON_CACHE = ROOT / "data" / "icon_cache"
ICON_PX = 72


def _num(x):
    return None if pd.isna(x) else int(round(float(x)))


def _side(v):
    return {"blue": "b", "red": "r"}.get(v)


def champion_table(df: pd.DataFrame, ko_by_en: dict, icon_files: dict, version: str, out: Path,
                   download_icons: bool = True) -> tuple[list[dict], dict]:
    """경기 표에 나온 챔피언(픽+밴)마다 한글 이름, 주로 쓴 포지션, 시즌 픽 횟수, 아이콘 경로를 정한다."""
    from src.names import normalize
    pick_cols = [f"{s}_{p}" for s in ("blue", "red") for p in POS]
    names = sorted(set(df[pick_cols].stack().dropna()) | {b for c in ("blue_bans", "red_bans") for l in df[c] for b in l})
    counts = {n: Counter() for n in names}
    for p in POS:
        for side in ("blue", "red"):
            for en in df[f"{side}_{p}"].dropna():
                counts[en][p] += 1
    files = {normalize(n): f for n, f in icon_files.items()}
    champs, idx = [], {}
    (out / "icons").mkdir(parents=True, exist_ok=True)
    for en in names:
        cnt = counts[en]
        tot = sum(cnt.values())
        roles = [r for r, k in cnt.most_common() if tot and k / tot >= 0.05] or ["mid"]
        icon = ""
        f = files.get(normalize(en))
        if f and download_icons:
            icon = _icon(f, version, out)
        idx[en] = len(champs)
        champs.append({"id": idx[en], "en": en, "ko": ko_by_en.get(en, en), "roles": roles,
                       "rc": dict(cnt.most_common()), "n": tot, "icon": icon})
    return champs, idx


def _icon(filename: str, version: str, out: Path) -> str:
    import requests
    from PIL import Image
    stem = Path(filename).stem
    cached = ICON_CACHE / f"{stem}.jpg"
    if not cached.exists():
        ICON_CACHE.mkdir(parents=True, exist_ok=True)
        r = requests.get(f"https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{filename}", timeout=30)
        r.raise_for_status()
        Image.open(io.BytesIO(r.content)).convert("RGB").resize((ICON_PX, ICON_PX), Image.LANCZOS).save(cached, "JPEG", quality=84)
    (out / "icons" / f"{stem}.jpg").write_bytes(cached.read_bytes())
    return f"icons/{stem}.jpg"


def game_records(df: pd.DataFrame, idx: dict) -> list[dict]:
    rows = []
    for d in df.to_dict("records"):
        ids = lambda side: [idx[d[f"{side}_{p}"]] if pd.notna(d[f"{side}_{p}"]) else -1 for p in POS]  # noqa: E731
        players = lambda side: [d.get(f"{side}_{p}_player") for p in POS]  # noqa: E731
        has_players = any(isinstance(x, str) for x in players("blue") + players("red"))
        rec = {
            "id": d["game_id"], "lg": d["league"], "d": d["date"], "p": d["patch"], "s": int(d["set_no"]),
            "bt": d["blue_team"], "rt": d["red_team"], "w": _side(d["winner"]),
            "gd": _num(d["gd15"]), "g10": _num(d["gd10"]), "g20": _num(d["gd20"]), "g25": _num(d["gd25"]),
            "len": None if pd.isna(d["length_sec"]) else int(d["length_sec"]) // 60,
            "fd": _side(d["first_dragon"]), "fh": _side(d["first_herald"]),
            "fb": _side(d["first_baron"]), "ft": _side(d["first_tower"]),
            "b": ids("blue"), "r": ids("red"),
            "bb": [idx[x] for x in d["blue_bans"]], "rb": [idx[x] for x in d["red_bans"]],
            "inc": not bool(d["data_complete"]),
            "sid": int(d["series_id"]), "sg": int(d["series_games"]), "so": bool(d["series_ok"]),
        }
        if has_players:
            rec["bp"] = [x if isinstance(x, str) else "" for x in players("blue")]
            rec["rp"] = [x if isinstance(x, str) else "" for x in players("red")]
        rows.append(rec)
    return rows


# stats.json의 열 순서와 반올림 자릿수 (None = 정수). 화면은 열 이름으로 찾아 쓴다.
TEAM_FIELDS = [("k", None), ("d", None), ("fb", None), ("drg", None), ("inf", None), ("mtn", None), ("cld", None),
               ("ocn", None), ("chm", None), ("hex", None), ("eld", None), ("her", None), ("grub", None),
               ("bar", None), ("tow", None), ("plt", None), ("gpm", None), ("dpm", None), ("wpm", 2),
               ("wcpm", 2), ("vspm", 2), ("cspm", 1), ("csd15", None),
               ("csd10", None), ("xpd10", None), ("xpd15", None), ("k15", None), ("fmt", None), ("f3t", None),
               ("inh", None), ("gspd", 3)]
PLAYER_FIELDS = [("k", None), ("d", None), ("a", None), ("dmg", 3), ("gsh", 3), ("vspm", 2), ("cspm", 1),
                 ("dpm", None), ("csd15", None)]


def _r(x, nd):
    if x is None or pd.isna(x):
        return None
    return int(round(float(x))) if nd is None else round(float(x), nd)


def stat_rows(df: pd.DataFrame) -> list | None:
    """경기마다 [블루 팀, 레드 팀, 블루 선수 5명, 레드 선수 5명] 지표. 지표 열이 없는 표면 None."""
    if "blue_t_k" not in df.columns:
        return None
    rows = []
    for d in df.to_dict("records"):
        mins = d["length_sec"] / 60 if d.get("length_sec") and not pd.isna(d["length_sec"]) else None
        row = []
        for side in ("blue", "red"):
            vals = dict(d)
            vals[f"{side}_t_gpm"] = d[f"{side}_t_gold"] / mins if mins and not pd.isna(d[f"{side}_t_gold"]) else None
            row.append([_r(vals.get(f"{side}_t_{k}"), nd) for k, nd in TEAM_FIELDS])
        for side in ("blue", "red"):
            row.append([[_r(d.get(f"{side}_{p}_{k}"), nd) for k, nd in PLAYER_FIELDS] for p in POS])
        rows.append(row)
    return rows


def build(df: pd.DataFrame, out: Path, demo: bool, columns_dir: Path | None = None, ko_by_en: dict | None = None,
          icon_files: dict | None = None, version: str = "", download_icons: bool = True) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    df = df.sort_values(["datetime", "game_id"]).reset_index(drop=True)
    champs, idx = champion_table(df, ko_by_en or {}, icon_files or {}, version, out, download_icons)
    games = game_records(df, idx)
    (out / "champs.json").write_text(json.dumps(champs, ensure_ascii=False), encoding="utf-8")
    # 경기 하나가 한 줄인 JSON 배열 (사람이 diff로 보기 쉽고, 브라우저는 한 번에 읽는다)
    (out / "games.json").write_text(
        "[\n" + ",\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in games) + "\n]", encoding="utf-8")
    st = stat_rows(df)
    if st is not None:   # 팀·선수 지표: 팀 페이지와 챔피언 통계를 열 때만 읽는다 (첫 화면을 가볍게)
        (out / "stats.json").write_text(json.dumps(
            {"team": [k for k, _ in TEAM_FIELDS], "player": [k for k, _ in PLAYER_FIELDS], "rows": st},
            ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    cols = load_columns(columns_dir) if columns_dir and Path(columns_dir).exists() else []
    (out / "columns.json").write_text(json.dumps(cols, ensure_ascii=False), encoding="utf-8")
    (out / "meta.json").write_text(json.dumps({"demo": demo}), encoding="utf-8")
    return {"champions": len(champs), "games": len(games), "series": int(df["series_id"].nunique()), "columns": len(cols)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="가짜 경기(저장소에 올려도 되는 데모)로 만든다")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--with-app", action="store_true", help="index.html, app.js도 함께 복사한다")
    ap.add_argument("--columns", type=Path, default=ROOT / "columns")
    ap.add_argument("--demo-games", type=int, default=900)
    a = ap.parse_args()

    from src.names import load_icon_info, load_name_map
    if a.demo:
        from src.demo import make_demo_games
        df = make_demo_games(n=a.demo_games, seed=11)
    else:
        df = pd.read_parquet(ROOT / "data" / "games.parquet")
    info = load_icon_info()
    ko_by_en = {en: ko for ko, en in load_name_map().items()}
    stats = build(df, a.out, a.demo, a.columns, ko_by_en, info["files"], info["version"])
    if a.with_app:
        for f in ("index.html", "app.js", "teams.json"):
            shutil.copy(APP_DIR / f, a.out / f)
    print(("데모" if a.demo else "실제 데이터"), "->", a.out, stats)


if __name__ == "__main__":
    main()

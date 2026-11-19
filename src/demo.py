"""화면 확인용 데모 데이터 (실제 경기가 아님).

실제 data/games.parquet가 없을 때 app.py가 대신 쓴다. 챔피언 이름은 실제 이름이지만
조합·팀·승패는 모두 무작위로 만든 가짜다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

POSITIONS = ["top", "jng", "mid", "bot", "sup"]

POOL = {
    "top": ["Aatrox", "Gnar", "Ornn", "Jax", "Camille", "K'Sante", "Renekton",
            "Sion", "Gwen", "Rumble", "Kennen", "Malphite"],
    "jng": ["Vi", "Sejuani", "Lee Sin", "Viego", "Nidalee", "Elise", "Maokai",
            "Jarvan IV", "Xin Zhao", "Rek'Sai", "Wukong", "Nocturne"],
    "mid": ["Orianna", "Azir", "Ahri", "Syndra", "Taliyah", "Corki", "Viktor",
            "Cassiopeia", "Ryze", "Hwei", "Aurora", "Sylas"],
    "bot": ["Jinx", "Kai'Sa", "Ezreal", "Varus", "Aphelios", "Zeri", "Ashe",
            "Lucian", "Xayah", "Sivir", "Smolder", "Miss Fortune"],
    "sup": ["Lulu", "Nautilus", "Rakan", "Braum", "Alistar", "Karma", "Thresh",
            "Renata Glasc", "Leona", "Rell", "Milio", "Pyke"],
}

TEAMS = {
    "LCK": ["T1", "GEN", "HLE", "KT", "DK", "NS", "BRO", "DRX"],
    "LPL": ["BLG", "JDG", "TES", "WBG", "LNG", "AL"],
    "LEC": ["G2", "FNC", "KC", "MKOI", "VIT"],
    "LCS": ["C9", "TL", "FLY", "100T"],
}

PATCHES = [f"16.{i}" for i in range(1, 9)]


def make_demo_games(n: int = 400, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    # 인기 챔피언이 반복해서 나오도록 앞쪽 챔피언에 가중치를 둔다
    weights = np.array([1 / (i + 1) ** 0.8 for i in range(12)])
    weights /= weights.sum()

    rows = []
    for i in range(n):
        league = rng.choice(list(TEAMS))
        blue_team, red_team = rng.choice(TEAMS[league], size=2, replace=False)
        patch_idx = min(int(i / n * len(PATCHES)), len(PATCHES) - 1)
        date = pd.Timestamp("2026-01-14") + pd.Timedelta(days=int(i / n * 120))
        gd15 = int(round(rng.normal(0, 1200), -1))
        row = dict(
            game_id=f"DEMO-{i + 1:04d}", league=str(league),
            date=date.strftime("%Y-%m-%d"), patch=PATCHES[patch_idx],
            set_no=int(rng.integers(1, 6)),
            blue_team=str(blue_team), red_team=str(red_team),
            winner="blue" if gd15 + rng.normal(0, 1500) > 0 else "red",
            gd15=gd15, data_complete=True,
        )
        for side in ("blue", "red"):
            for pos in POSITIONS:
                row[f"{side}_{pos}"] = str(rng.choice(POOL[pos], p=weights))
        # LPL 일부 경기는 픽 하나가 비어 있는 것처럼 만든다
        if league == "LPL" and rng.random() < 0.15:
            row[f"{rng.choice(['blue', 'red'])}_{rng.choice(POSITIONS)}"] = None
            row["data_complete"] = False
        rows.append(row)
    return pd.DataFrame(rows)

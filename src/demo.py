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

# 돌려쓰는(플렉스) 픽: 원래 포지션이 아닌 곳에서도 가끔 나오게 한다 (값은 상대적 빈도)
FLEX_EXTRA = {
    "top": {"Aurora": .5, "Ryze": .5, "Sylas": .4, "Maokai": .5, "Viktor": .3},
    "jng": {"Sylas": .5, "Rumble": .5, "Gwen": .5},
    "mid": {"Karma": .5, "Lulu": .3, "Nidalee": .3, "Rumble": .3},
    "bot": {"Hwei": .4, "Viktor": .4, "Karma": .2},
    "sup": {"Maokai": .4},
}

TEAMS = {
    "LCK": ["T1", "GEN", "HLE", "KT", "DK", "NS", "BRO", "DRX"],
    "LPL": ["BLG", "JDG", "TES", "WBG", "LNG", "AL"],
    "LEC": ["G2", "FNC", "KC", "MKOI", "VIT"],
    "LCS": ["C9", "TL", "FLY", "100T"],
}

PATCHES = [f"16.{i}" for i in range(1, 9)]
ALL_CHAMPS = sorted({c for pool in POOL.values() for c in pool})


def _pools():
    """포지션별 (챔피언 목록, 선택 확률). 인기 챔피언이 반복해서 나오도록 앞쪽에 가중치를 둔다."""
    out = {}
    for pos in POSITIONS:
        names = list(POOL[pos])
        w = [1 / (i + 1) ** 0.8 for i in range(len(names))]
        for name, mult in FLEX_EXTRA.get(pos, {}).items():
            names.append(name)
            w.append(0.25 * mult)
        w = np.array(w)
        out[pos] = (names, w / w.sum())
    return out


def make_demo_games(n: int = 400, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    pools = _pools()

    rows = []
    for i in range(n):
        league = rng.choice(list(TEAMS))
        blue_team, red_team = rng.choice(TEAMS[league], size=2, replace=False)
        patch_idx = min(int(i / n * len(PATCHES)), len(PATCHES) - 1)
        date = pd.Timestamp("2026-01-14") + pd.Timedelta(days=int(i / n * 120))
        gd15 = int(round(rng.normal(0, 1200), -1))
        winner = "blue" if gd15 + rng.normal(0, 1500) > 0 else "red"
        row = dict(
            game_id=f"DEMO-{i + 1:04d}", league=str(league),
            date=date.strftime("%Y-%m-%d"), patch=PATCHES[patch_idx],
            set_no=int(rng.integers(1, 6)),
            blue_team=str(blue_team), red_team=str(red_team),
            winner=winner, gd15=gd15, data_complete=True,
        )
        used: set[str] = set()  # 한 경기 안에서는 같은 챔피언이 두 번 나오지 않는다
        for side in ("blue", "red"):
            for pos in POSITIONS:
                names, p = pools[pos]
                champ = str(rng.choice(names, p=p))
                while champ in used:
                    champ = str(rng.choice(names, p=p))
                used.add(champ)
                row[f"{side}_{pos}"] = champ
        # 밴 5개씩 (뽑힌 챔피언은 제외)
        bans = rng.choice([c for c in ALL_CHAMPS if c not in used], size=10, replace=False)
        row["blue_bans"], row["red_bans"] = [str(b) for b in bans[:5]], [str(b) for b in bans[5:]]
        # 경기 시간, 10분 골드차, 첫 오브젝트 (이긴 쪽이 가져갔을 확률이 조금 높다)
        row["length_min"] = int(np.clip(round(rng.normal(32, 5)), 22, 48))
        row["gd10"] = int(round(gd15 * 0.55 + rng.normal(0, 250), -1))
        loser = "red" if winner == "blue" else "blue"
        for key in ("first_dragon", "first_herald", "first_tower"):
            row[key] = winner if rng.random() < 0.6 else loser
        # LPL 일부 경기는 픽 하나가 비어 있는 것처럼 만든다
        if league == "LPL" and rng.random() < 0.15:
            row[f"{rng.choice(['blue', 'red'])}_{rng.choice(POSITIONS)}"] = None
            row["data_complete"] = False
        rows.append(row)
    return pd.DataFrame(rows)

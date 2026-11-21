"""화면 확인용 데모 데이터 (실제 경기가 아님).

실제 data/games.parquet가 없을 때 app.py가 대신 쓴다. 챔피언 이름은 실제 이름이지만
조합·팀·승패는 모두 무작위로 만든 가짜다. 실제 2026 데이터처럼 시리즈(1~5세트)로 묶이고,
같은 시리즈에서는 이미 쓴 챔피언을 다시 쓰지 않는 피어리스 방식이다.
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

# 실제 데이터와 같은 팀 이름을 쓴다 (칼럼의 @team name="Gen.G" 같은 상자가 데모에서도 그대로 돌게)
TEAMS = {
    "LCK": ["T1", "Gen.G", "Hanwha Life Esports", "KT Rolster", "Dplus Kia", "Nongshim RedForce", "HANJIN BRION", "Kiwoom DRX"],
    "LPL": ["Bilibili Gaming", "JD Gaming", "Top Esports", "Weibo Gaming", "Anyone's Legend"],
    "LEC": ["G2 Esports", "Fnatic", "Karmine Corp", "Team Vitality"],
    "LCS": ["Cloud9", "Team Liquid"],
}

PLAYER_KO = {"top": "탑", "jng": "정글", "mid": "미드", "bot": "원딜", "sup": "서폿"}
PATCHES = [f"16.{i:02d}" for i in range(1, 9)]
ALL_CHAMPS = sorted({c for pool in POOL.values() for c in pool})
SERIES_LEN = [1, 2, 3, 4, 5]
SERIES_P = [.22, .24, .22, .17, .15]


def _pools():
    """포지션별 (챔피언 목록, 가중치). 인기 챔피언이 반복해서 나오도록 앞쪽에 가중치를 둔다."""
    out = {}
    for pos in POSITIONS:
        names = list(POOL[pos])
        w = [1 / (i + 1) ** 0.8 for i in range(len(names))]
        for name, mult in FLEX_EXTRA.get(pos, {}).items():
            names.append(name)
            w.append(0.25 * mult)
        out[pos] = (names, np.array(w))
    return out


def _game_winners(rng, k: int, a_wins_series: bool) -> list[bool]:
    """시리즈 k세트에서 각 세트를 A팀이 이겼는지. 마지막 세트는 시리즈 승자가 이긴다."""
    need = {1: 1, 2: 2, 3: int(rng.choice([2, 3])), 4: 3, 5: 3}[k]  # 3세트는 Bo3 2-1 또는 Bo5 3-0
    loser_wins = {1: 0, 2: 0, 4: 1, 5: 2}.get(k, 1 if need == 2 else 0)
    seq = [True] * (need - 1) + [False] * loser_wins
    rng.shuffle(seq)
    seq = seq + [True]
    return seq if a_wins_series else [not x for x in seq]


DRAKES = ["inf", "mtn", "cld", "ocn", "chm", "hex"]


def _fake_stats(rng, row: dict, winner: str) -> None:
    """팀·선수 지표 가짜 값 (화면 확인용). 이긴 팀이 대체로 더 많이 가져가게만 맞춘다."""
    mins = row["length_sec"] / 60
    share = {"top": .22, "jng": .17, "mid": .26, "bot": .28, "sup": .07}
    gshare = {"top": .22, "jng": .19, "mid": .23, "bot": .25, "sup": .11}
    kills = {}
    for side in ("blue", "red"):
        w = side == winner
        kills[side] = int(max(0, rng.normal(19 if w else 10, 5)))
    for side in ("blue", "red"):
        w, other = side == winner, ("red" if side == "blue" else "blue")
        t = lambda k, v: row.__setitem__(f"{side}_t_{k}", v)  # noqa: E731
        t("k", kills[side]); t("d", kills[other])
        t("fb", int(row["first_tower"] == side))
        drg = int(rng.integers(2, 5) if w else rng.integers(0, 3))
        t("drg", drg)
        types = rng.choice(DRAKES, size=drg)
        for dk in DRAKES:
            t(dk, int((types == dk).sum()))
        t("eld", int(w and rng.random() < .15))
        t("her", int(rng.random() < (.6 if w else .4)))
        t("grub", int(rng.integers(2, 4) if w else rng.integers(0, 3)))
        t("bar", int(rng.integers(1, 3) if w else rng.random() < .25))
        t("tow", int(rng.integers(8, 12) if w else rng.integers(1, 6)))
        t("plt", int(rng.integers(10, 25)))
        t("gold", round(mins * rng.normal(2000 if w else 1750, 80)))
        t("dpm", round(rng.normal(2600 if w else 2200, 300)))
        t("wpm", round(rng.normal(3.8, .3), 2)); t("wcpm", round(rng.normal(1.7, .25), 2))
        t("vspm", round(rng.normal(10, .8), 2))
        t("csd15", int(rng.normal(25 if w else -25, 40)))
        t("csd10", int(rng.normal(10 if w else -10, 25))); t("xpd10", int(rng.normal(150 if w else -150, 300)))
        t("xpd15", int(rng.normal(300 if w else -300, 500))); t("k15", int(max(0, rng.normal(5 if w else 3, 2))))
        t("fmt", int(row["first_tower"] == side)); t("f3t", int(w if rng.random() < .75 else not w))
        t("inh", int(rng.integers(1, 3) if w else 0)); t("gspd", round(rng.normal(.04 if w else -.04, .03), 3))
        tk = max(kills[side], 1)
        csum = 0.0
        for pos in POSITIONS:
            p = lambda k, v: row.__setitem__(f"{side}_{pos}_{k}", v)  # noqa: E731
            p("k", int(tk * share[pos] * rng.uniform(.4, 1.6))); p("d", int(rng.integers(0, 6)))
            p("a", int(tk * rng.uniform(.3, .8)))
            p("dmg", round(share[pos] * rng.uniform(.8, 1.2), 3)); p("gsh", round(gshare[pos] * rng.uniform(.9, 1.1), 3))
            p("vspm", round(rng.normal(3.5 if pos == "sup" else 1.2, .2), 2))
            cs = 0.9 if pos == "sup" else 6 if pos == "jng" else 8.5
            p("cspm", round(rng.normal(cs, .5), 1)); csum += row[f"{side}_{pos}_cspm"]
            p("dpm", round(rng.normal(800 * share[pos] / .2, 120))); p("csd15", int(rng.normal(0, 12)))
        t("cspm", round(csum, 1))


def make_demo_games(n: int = 400, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    pools = _pools()
    rows, sid = [], 0
    while len(rows) < n:
        league = str(rng.choice(list(TEAMS)))
        team_a, team_b = (str(x) for x in rng.choice(TEAMS[league], size=2, replace=False))
        k = int(rng.choice(SERIES_LEN, p=SERIES_P))
        progress = len(rows) / n
        patch = PATCHES[min(int(progress * len(PATCHES)), len(PATCHES) - 1)]
        day = pd.Timestamp("2026-01-14") + pd.Timedelta(days=int(progress * 120))
        winners = _game_winners(rng, k, bool(rng.random() < 0.5))
        spent: set[str] = set()  # 피어리스: 이 시리즈에서 이미 쓴 챔피언
        a_blue = bool(rng.random() < 0.5)
        for s in range(1, k + 1):
            a_won = winners[s - 1]
            margin = abs(rng.normal(900, 900))
            gd_a = margin if rng.random() < 0.72 else -margin * 0.5
            gd_a = gd_a if a_won else -abs(gd_a) if gd_a > 0 else abs(gd_a)
            blue_team, red_team = (team_a, team_b) if a_blue else (team_b, team_a)
            gd15 = int(round(gd_a if a_blue else -gd_a, -1))
            winner = "blue" if (a_won == a_blue) else "red"
            when = day + pd.Timedelta(hours=17 + 2 * (s - 1))
            row = dict(
                game_id=f"DEMO-{len(rows) + 1:04d}", league=league, year=2026, split="Demo", playoffs=k >= 3,
                datetime=when.strftime("%Y-%m-%d %H:%M:%S"), date=when.strftime("%Y-%m-%d"), patch=patch,
                set_no=s, blue_team=blue_team, red_team=red_team, winner=winner,
                gd15=gd15, data_complete=True, series_id=sid, series_games=k, series_ok=True,
            )
            used = set(spent)
            for side in ("blue", "red"):
                for pos in POSITIONS:
                    names, w = pools[pos]
                    ok = [i for i, c in enumerate(names) if c not in used]
                    if ok:
                        p = w[ok] / w[ok].sum()
                        champ = names[int(rng.choice(ok, p=p))]
                    else:  # 포지션 풀이 바닥나면 아무 챔피언이나 (피어리스 후반의 억지 픽)
                        champ = str(rng.choice([c for c in ALL_CHAMPS if c not in used]))
                    used.add(champ)
                    row[f"{side}_{pos}"] = champ
                    row[f"{side}_{pos}_player"] = f"{row[side + '_team']} {PLAYER_KO[pos]}"  # 가상 이름
            spent |= {row[f"{s_}_{p}"] for s_ in ("blue", "red") for p in POSITIONS}
            # 밴 5개씩 (뽑힌 챔피언은 제외, 피어리스에서도 밴은 소진되지 않는다)
            bans = rng.choice([c for c in ALL_CHAMPS if c not in used], size=10, replace=False)
            row["blue_bans"], row["red_bans"] = [str(b) for b in bans[:5]], [str(b) for b in bans[5:]]
            row["length_sec"] = int(np.clip(round(rng.normal(32, 5)), 22, 48)) * 60
            row["gd10"] = int(round(gd15 * 0.55 + rng.normal(0, 250), -1))
            row["gd20"] = int(round(gd15 * 1.4 + rng.normal(0, 600), -1))
            row["gd25"] = int(round(gd15 * 1.8 + rng.normal(0, 900), -1))
            loser = "red" if winner == "blue" else "blue"
            for key in ("first_dragon", "first_herald", "first_baron", "first_tower"):
                row[key] = winner if rng.random() < 0.6 else loser
            row["first_pick"] = "blue"
            _fake_stats(rng, row, winner)
            # LPL 일부 경기는 픽 하나가 비어 있는 것처럼 만든다
            if league == "LPL" and rng.random() < 0.12:
                row[f"{rng.choice(['blue', 'red'])}_{rng.choice(POSITIONS)}"] = None
                row["data_complete"] = False
            rows.append(row)
            a_blue = not a_blue  # 세트마다 진영이 바뀐다
        sid += 1
    return pd.DataFrame(rows)

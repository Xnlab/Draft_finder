"""가짜 경기 fixture. 실제 데이터 없이도 테스트가 돌아가게 한다."""
import pandas as pd
import pytest

POS = ["top", "jng", "mid", "bot", "sup"]


def _game(game_id, league, date, patch, set_no, blue_team, red_team, winner,
          blue, red, gd15, complete=True):
    row = dict(game_id=game_id, league=league, date=date, patch=patch,
               set_no=set_no, blue_team=blue_team, red_team=red_team,
               winner=winner, gd15=gd15, data_complete=complete)
    for p, c in zip(POS, blue):
        row[f"blue_{p}"] = c
    for p, c in zip(POS, red):
        row[f"red_{p}"] = c
    return row


G1_BLUE = ["Aatrox", "Vi", "Orianna", "Jinx", "Lulu"]
G1_RED = ["Gnar", "Sejuani", "Azir", "Kai'Sa", "Nautilus"]


@pytest.fixture
def games():
    rows = [
        # G1: 오리아나+바이가 블루, 미드는 오리아나(블루) vs 아지르(레드)
        _game("G1", "LCK", "2026-03-01", "16.1", 1, "T1", "GEN", "blue",
              G1_BLUE, G1_RED, 500),
        # G2: 오리아나+바이가 레드, 미드는 아지르(블루) vs 오리아나(레드)
        _game("G2", "LPL", "2026-03-10", "16.2", 2, "BLG", "JDG", "red",
              ["Aatrox", "Sejuani", "Azir", "Jinx", "Lulu"],
              ["Ornn", "Vi", "Orianna", "Ezreal", "Karma"], -300),
        # G3: G1과 같은 픽, 진영만 반대
        _game("G3", "LEC", "2026-03-20", "16.3", 5, "G2", "FNC", "red",
              G1_RED, G1_BLUE, 100),
        # G4: 아무것도 안 겹침
        _game("G4", "LCK", "2026-03-12", "16.2", 3, "HLE", "KT", "blue",
              ["Camille", "Lee Sin", "Ahri", "Varus", "Thresh"],
              ["Jax", "Viego", "Syndra", "Aphelios", "Alistar"], 0),
        # G5: 블루 정글 픽이 비어 있음 (데이터 불완전)
        _game("G5", "LPL", "2026-03-05", "16.1", 4, "LNG", "WBG", "blue",
              ["Aatrox", None, "Orianna", "Jinx", "Lulu"],
              ["Gnar", "Sejuani", "Syndra", "Kai'Sa", "Nautilus"], 200,
              complete=False),
        # G6: 미드 오리아나(블루) vs 아지르(레드)
        _game("G6", "LCK", "2026-03-25", "16.3", 4, "DK", "NS", "blue",
              ["Gwen", "Nidalee", "Orianna", "Ashe", "Rakan"],
              ["Rumble", "Elise", "Azir", "Zeri", "Braum"], 800),
    ]
    return pd.DataFrame(rows)

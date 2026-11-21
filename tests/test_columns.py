from pathlib import Path

import pytest

from src.columns import ColumnError, load_columns, parse_column

OK = """---
title: 제목
date: 2026-11-19
kick: 예시
lede: 요약
teams: T1, Gen.G
---
첫 문단
이어지는 줄

## 소제목

@search blue.mid=Azir red.mid=Orianna sets=late leagues=LCK,LPL

@series pick=longest set=4

@game nth=40
"""


def test_parses_front_matter_paragraphs_and_embeds():
    c = parse_column(OK, "a")
    assert (c["title"], c["date"], c["kick"], c["lede"], c["slug"]) == ("제목", "2026-11-19", "예시", "요약", "a")
    assert c["teams"] == ["T1", "Gen.G"]
    kinds = [b["type"] for b in c["blocks"]]
    assert kinds == ["p", "h", "search", "series", "game"]
    assert c["blocks"][0]["text"] == "첫 문단 이어지는 줄"      # 줄바꿈은 한 문단으로
    s = c["blocks"][2]
    assert s["board"] == {"blue": {"mid": "Azir"}, "red": {"mid": "Orianna"}}
    assert s["sets"] == "late" and s["leagues"] == ["LCK", "LPL"]
    assert c["blocks"][3] == {"type": "series", "pick": "longest", "set": 4}
    assert c["blocks"][4] == {"type": "game", "nth": 40}


@pytest.mark.parametrize("body, msg", [
    ("@search blue.middle=Azir", "알 수 없는 포지션"),
    ("@search sets=late", "챔피언이 하나 이상"),
    ("@search blue.mid=Azir sets=never", "중 하나여야"),
    ("@search blue.mid=Azir foo=1", "알 수 없는 인자"),
    ("@series pick=best", "longest 또는 latest"),
    ("@game", "nth=N 또는 id"),
    ("@video x=1", "알 수 없는 상자"),
    ("@search blue.mid", "key=value"),
    ("@team", "name="),
    ("@form n=5", "team="),
    ("@form team=T1 n=99", "3~30"),
    ("@form team=T1 until=11/14", "until"),
    ("@flow", "id=게임ID, nth=N, team"),
    ("@flow team=T1 last=0", "1 이상"),
    ("@game nth=abc", "숫자여야"),
    ("@search blue.mid=Azir games=20", "0~10"),
    ("@team name=T1 show=gd15,foo", "알 수 없는 지표"),
])
def test_bad_embeds_give_clear_errors_with_location(body, msg):
    text = "---\ntitle: t\ndate: 2026-01-01\n---\n본문\n\n" + body + "\n"
    with pytest.raises(ColumnError, match=msg) as e:
        parse_column(text, "slug")
    assert "slug 2번째 문단" in str(e.value)       # 어디가 틀렸는지 알려 준다


@pytest.mark.parametrize("text, msg", [
    ("본문만 있음", "머리말"),
    ("---\ndate: 2026-01-01\n---\n본문", "title"),
    ("---\ntitle: t\ndate: 2026/01/01\n---\n본문", "date"),
])
def test_front_matter_is_required(text, msg):
    with pytest.raises(ColumnError, match=msg):
        parse_column(text, "x")


def test_repo_example_columns_parse_and_sort_newest_first():
    cols = load_columns(Path(__file__).resolve().parent.parent / "columns")
    assert len(cols) >= 3 and [c["date"] for c in cols] == sorted((c["date"] for c in cols), reverse=True)
    assert all(c["blocks"] for c in cols)


def test_new_boxes_and_quoted_values():
    text = """---
title: t
date: 2026-11-21
kind: note
draft: true
---
@team name="Hanwha Life Esports"

@form team=Gen.G n=12 until=2026-11-14

@flow id=ABC_123 team="T1"

@search blue.bot=Kai'Sa games=3
"""
    c = parse_column(text, "n")
    assert c["kind"] == "note" and c["draft"] is True
    assert c["blocks"][0] == {"type": "team", "name": "Hanwha Life Esports"}
    assert c["blocks"][1] == {"type": "form", "team": "Gen.G", "n": 12, "until": "2026-11-14"}
    assert c["blocks"][2] == {"type": "flow", "id": "ABC_123", "team": "T1"}
    assert c["blocks"][3]["board"]["blue"] == {"bot": "Kai'Sa"}       # 작은따옴표가 든 이름도 그대로
    assert c["blocks"][3]["games"] == 3


def test_kind_and_draft_defaults_and_errors():
    base = "---\ntitle: t\ndate: 2026-01-01\n{}---\n본문\n"
    c = parse_column(base.format(""), "x")
    assert c["kind"] == "column" and c["draft"] is False
    with pytest.raises(ColumnError, match="kind"):
        parse_column(base.format("kind: essay\n"), "x")
    with pytest.raises(ColumnError, match="draft"):
        parse_column(base.format("draft: yes\n"), "x")


def test_heading_and_box_lines_need_no_blank_line():
    c = parse_column("---\ntitle: t\ndate: 2026-01-01\n---\n## 제목\n@team name=T1\n문단 한 줄\n## 다음\n끝", "x")
    assert [b["type"] for b in c["blocks"]] == ["h", "team", "p", "h", "p"]
    assert c["blocks"][0]["text"] == "제목"


def test_team_filters_for_search_and_flow():
    c = parse_column('---\ntitle: t\ndate: 2026-01-01\n---\n@search team="Gen.G" blue.mid=Orianna\n\n@flow team="Gen.G"\n\n@flow team=T1 last=3', "x")
    assert c["blocks"][0]["team"] == "Gen.G" and c["blocks"][0]["board"]["blue"] == {"mid": "Orianna"}
    assert c["blocks"][1] == {"type": "flow", "last": 1, "team": "Gen.G"}
    assert c["blocks"][2] == {"type": "flow", "last": 3, "team": "T1"}


def test_team_show_picks_metrics():
    c = parse_column('---\ntitle: t\ndate: 2026-01-01\n---\n@team name="Gen.G" show=gd15,barS', "x")
    assert c["blocks"][0] == {"type": "team", "name": "Gen.G", "show": ["gd15", "barS"]}

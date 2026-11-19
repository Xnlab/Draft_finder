from pathlib import Path

import pytest

from src.columns import ColumnError, load_columns, parse_column

OK = """---
title: 제목
date: 2026-11-19
kick: 예시
lede: 요약
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

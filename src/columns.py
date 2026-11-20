"""칼럼(markdown) -> 화면이 읽는 블록 목록 (columns.json).

칼럼은 `columns/*.md` 파일 하나가 글 하나다. 글 중간에 검색 결과나 시리즈, 경기를 "근거 상자"로
끼워 넣을 수 있고, 상자는 사이트에서 실제 데이터를 검색해 만들어진다 (숫자를 손으로 옮겨 적지 않는다).

    ---
    title: 글 제목                (필수)
    date: 2026-11-19              (필수)
    kick: 예시                    (선택, 제목 위에 붙는 짧은 말)
    lede: 목록에 보일 한두 문장   (선택)
    teams: T1, Gen.G              (선택, 이 글과 관련된 팀의 영문 이름. 그 팀의 마이 팀 화면에 글이 나온다)
    ---

    본문 문단. 빈 줄로 문단을 나눈다.

    ## 소제목

    @search blue.mid=Azir red.mid=Orianna sets=late
    @series pick=longest set=4
    @game nth=40            (또는 id=게임ID)

`@search` 인자: `blue.<포지션>=챔피언(영문)`, `red.<포지션>=...`, `sets=all|early|late`,
`patch=all|latest|last3`, `leagues=LCK,LPL`, `pos=any|exact`.
`@series` 인자: `pick=longest|latest`, `set=N`(몇 세트 후 상태를 보여 줄지).
"""
from __future__ import annotations

import re
from pathlib import Path

POSITIONS = ["top", "jng", "mid", "bot", "sup"]
EMBEDS = {"search", "series", "game"}
SEARCH_KEYS = {"sets": {"all", "early", "late"}, "patch": {"all", "latest", "last3"}, "pos": {"any", "exact"}}
_EMBED_LINE = re.compile(r"^@(\w+)\b(.*)$")


class ColumnError(ValueError):
    """칼럼 문법 오류. 어느 파일 몇 번째 문단인지 메시지에 담는다."""


def _args(raw: str) -> dict[str, str]:
    out = {}
    for tok in raw.split():
        if "=" not in tok:
            raise ColumnError(f"'{tok}'는 key=value 모양이어야 합니다")
        k, v = tok.split("=", 1)
        out[k] = v
    return out


def _check_embed(kind: str, args: dict) -> dict:
    if kind == "search":
        board = {"blue": {}, "red": {}}
        opts: dict = {}
        for k, v in args.items():
            if k.startswith(("blue.", "red.")):
                side, role = k.split(".", 1)
                if role not in POSITIONS:
                    raise ColumnError(f"알 수 없는 포지션 '{role}' (top/jng/mid/bot/sup 중 하나)")
                board[side][role] = v
            elif k == "leagues":
                opts["leagues"] = [x for x in v.split(",") if x]
            elif k in SEARCH_KEYS:
                if v not in SEARCH_KEYS[k]:
                    raise ColumnError(f"{k}={v}: {sorted(SEARCH_KEYS[k])} 중 하나여야 합니다")
                opts[k] = v
            else:
                raise ColumnError(f"@search에 알 수 없는 인자 '{k}'")
        if not (board["blue"] or board["red"]):
            raise ColumnError("@search에는 챔피언이 하나 이상 필요합니다 (예: blue.mid=Azir)")
        return {"board": board, **opts}
    if kind == "series":
        extra = set(args) - {"pick", "set"}
        if extra:
            raise ColumnError(f"@series에 알 수 없는 인자 {sorted(extra)}")
        pick = args.get("pick", "longest")
        if pick not in {"longest", "latest"}:
            raise ColumnError("@series pick은 longest 또는 latest")
        return {"pick": pick, "set": int(args["set"]) if "set" in args else None}
    extra = set(args) - {"nth", "id"}
    if extra or not args:
        raise ColumnError("@game에는 nth=N 또는 id=게임ID 중 하나가 필요합니다")
    return {"nth": int(args["nth"])} if "nth" in args else {"id": args["id"]}


def parse_column(text: str, slug: str = "") -> dict:
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text.strip() + "\n", re.S)
    if not m:
        raise ColumnError(f"{slug}: 맨 위에 --- 로 둘러싼 머리말(title, date)이 필요합니다")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    for need in ("title", "date"):
        if not meta.get(need):
            raise ColumnError(f"{slug}: 머리말에 {need}가 없습니다")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["date"]):
        raise ColumnError(f"{slug}: date는 2026-11-19 모양이어야 합니다")
    blocks = []
    for i, para in enumerate(re.split(r"\n\s*\n", m.group(2).strip()), 1):
        para = para.strip()
        if not para:
            continue
        lines = para.splitlines()
        em = _EMBED_LINE.match(lines[0])
        if em:
            kind = em.group(1)
            if kind not in EMBEDS:
                raise ColumnError(f"{slug} {i}번째 문단: 알 수 없는 상자 @{kind} (search/series/game)")
            try:
                blocks.append({"type": kind, **_check_embed(kind, _args(em.group(2)))})
            except ColumnError as e:
                raise ColumnError(f"{slug} {i}번째 문단: {e}") from None
        elif para.startswith("## "):
            blocks.append({"type": "h", "text": para[3:].strip()})
        else:
            blocks.append({"type": "p", "text": " ".join(x.strip() for x in lines)})
    teams = [t.strip() for t in meta.get("teams", "").split(",") if t.strip()]
    return {"slug": slug, "title": meta["title"], "date": meta["date"], "kick": meta.get("kick", ""),
            "lede": meta.get("lede", ""), "teams": teams, "blocks": blocks}


def load_columns(folder: Path) -> list[dict]:
    """folder의 *.md를 읽어 최신 글이 먼저 오게 정렬한다."""
    cols = [parse_column(f.read_text(encoding="utf-8"), f.stem) for f in sorted(Path(folder).glob("*.md"))]
    return sorted(cols, key=lambda c: (c["date"], c["slug"]), reverse=True)

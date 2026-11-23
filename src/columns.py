"""칼럼(markdown) -> 화면이 읽는 블록 목록 (columns.json).

칼럼은 `columns/*.md` 파일 하나가 글 하나다. 글 중간에 검색 결과나 시리즈, 경기를 "근거 상자"로
끼워 넣을 수 있고, 상자는 사이트에서 실제 데이터를 검색해 만들어진다 (숫자를 손으로 옮겨 적지 않는다).

    ---
    title: 글 제목                (필수)
    date: 2026-11-19              (필수)
    kick: 예시                    (선택, 제목 위에 붙는 짧은 말)
    lede: 목록에 보일 한두 문장   (선택)
    teams: T1, Gen.G              (선택, 이 글과 관련된 팀의 영문 이름)
    kind: column                  (선택, column=칼럼 / note=분석 노트)
    draft: true                   (선택, true면 공개 사이트에 싣지 않는다. 작업실에서는 보인다)
    ---

    본문 문단. 빈 줄로 문단을 나눈다.

    ## 소제목

    @search blue.mid=Azir red.mid=Orianna sets=late
    @series pick=longest set=4
    @game nth=40            (또는 id=게임ID)
    @draft teams="Gen.G,BLG" set=2 upto=6 hl="Cassiopeia,Nautilus"   (한 세트 밴픽 보드. upto=그 선택까지만, hl=강조)
    @team name="Gen.G"      (팀 지표를 리그 평균·순위와 비교. show=gd15,barS 로 고른 지표만 카드로)
    @rank stat=barS team="Gen.G"                (지표 하나로 리그 전체 팀 순위표, 그 팀 강조)
    @form team="Gen.G" n=10 until=2026-11-14   (최근 n경기 15분 골드 차이와 승패)
    @flow team="Gen.G" last=1                  (그 팀의 최근 경기 흐름. id=게임ID로 경기를 지정할 수도 있다)

값에 빈칸이 있으면 큰따옴표로 감싼다: name="Hanwha Life Esports".

`@search` 인자: `blue.<포지션>=챔피언(영문)`, `red.<포지션>=...`, `sets=all|early|late`,
`patch=all|latest|last3`, `leagues=LCK,LPL`, `pos=any|exact`, `team="Gen.G"`(그 팀이 고른 경기만), `games=N`(경기 목록을 N개까지 함께 보여 줌, 기본 0).
`@series` 인자: `pick=longest|latest`, `set=N`(몇 세트 후 상태를 보여 줄지).
"""
from __future__ import annotations

import re
from pathlib import Path

POSITIONS = ["top", "jng", "mid", "bot", "sup"]
EMBEDS = {"search", "series", "game", "draft", "team", "form", "flow", "rank"}
KINDS = {"column", "note"}
# @team show= 에 쓸 수 있는 지표 키 (workbench/app.js의 EARLY, WHOLE과 같다)
TEAM_METRICS = ["gd15", "xpd15", "csd15", "fb", "ft", "plt", "grub", "her",
                "gpm", "cspm", "dpm", "vspm", "wcpm", "k", "d", "drgS", "barS", "ahead"]
_TOKEN = re.compile(r'(\S+?)=("([^"]*)"|\S+)|(\S+)')
SEARCH_KEYS = {"sets": {"all", "early", "late"}, "patch": {"all", "latest", "last3"}, "pos": {"any", "exact"}}
_EMBED_LINE = re.compile(r"^@(\w+)\b(.*)$")


class ColumnError(ValueError):
    """칼럼 문법 오류. 어느 파일 몇 번째 문단인지 메시지에 담는다."""


def _args(raw: str) -> dict[str, str]:
    """key=value 목록. 값에 빈칸이 있으면 큰따옴표로 감싼다 (name="Hanwha Life Esports")."""
    out = {}
    for m in _TOKEN.finditer(raw):
        if m.group(4) is not None:
            raise ColumnError(f"'{m.group(4)}'는 key=value 모양이어야 합니다")
        out[m.group(1)] = m.group(3) if m.group(3) is not None else m.group(2)
    return out


def _int(key: str, v: str) -> int:
    try:
        return int(v)
    except ValueError:
        raise ColumnError(f"{key}={v}: 숫자여야 합니다") from None


def _only(kind: str, args: dict, allowed: set) -> None:
    extra = set(args) - allowed
    if extra:
        raise ColumnError(f"@{kind}에 알 수 없는 인자 {sorted(extra)}")


def _game_ref(kind: str, args: dict) -> dict:
    if "nth" in args:
        return {"nth": _int("nth", args["nth"])}
    if "id" in args:
        return {"id": args["id"]}
    raise ColumnError(f"@{kind}에는 nth=N 또는 id=게임ID 중 하나가 필요합니다")


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
            elif k == "team":
                opts["team"] = v
            elif k == "games":
                n = _int("games", v)
                if not 0 <= n <= 10:
                    raise ColumnError("games는 0~10 사이여야 합니다")
                opts["games"] = n
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
        return {"pick": pick, "set": _int("set", args["set"]) if "set" in args else None}
    if kind == "team":
        _only(kind, args, {"name", "show"})
        if not args.get("name"):
            raise ColumnError('@team에는 name="팀 영문 이름"이 필요합니다')
        out = {"name": args["name"]}
        if "show" in args:
            keys = [k for k in args["show"].split(",") if k]
            bad = [k for k in keys if k not in TEAM_METRICS]
            if bad or not keys:
                raise ColumnError(f"@team show에 알 수 없는 지표 {bad} (쓸 수 있는 것: {', '.join(TEAM_METRICS)})")
            out["show"] = keys
        return out
    if kind == "rank":
        _only(kind, args, {"stat", "team", "league"})
        if args.get("stat") not in TEAM_METRICS:
            raise ColumnError(f"@rank에는 stat=지표가 필요합니다 (쓸 수 있는 것: {', '.join(TEAM_METRICS)})")
        out = {"stat": args["stat"]}
        for k in ("team", "league"):
            if args.get(k):
                out[k] = args[k]
        if "team" not in out and "league" not in out:
            raise ColumnError('@rank에는 team="팀" 또는 league=LCK 중 하나가 필요합니다')
        return out
    if kind == "form":
        _only(kind, args, {"team", "n", "until"})
        if not args.get("team"):
            raise ColumnError('@form에는 team="팀 영문 이름"이 필요합니다')
        n = _int("n", args.get("n", "10"))
        if not 3 <= n <= 30:
            raise ColumnError("@form n은 3~30 사이여야 합니다")
        out = {"team": args["team"], "n": n}
        if "until" in args:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args["until"]):
                raise ColumnError("@form until은 2026-11-14 모양이어야 합니다")
            out["until"] = args["until"]
        return out
    if kind == "flow":
        _only(kind, args, {"nth", "id", "team", "last"})
        if "id" in args or "nth" in args:
            out = _game_ref(kind, args)
        elif args.get("team"):
            out = {"last": _int("last", args.get("last", "1"))}   # 그 팀의 최근 N번째 경기 (1 = 가장 최근)
            if out["last"] < 1:
                raise ColumnError("@flow last는 1 이상이어야 합니다")
        else:
            raise ColumnError('@flow에는 id=게임ID, nth=N, team="팀" 중 하나가 필요합니다')
        if args.get("team"):
            out["team"] = args["team"]
        return out
    if kind == "draft":
        _only(kind, args, {"nth", "id", "teams", "set", "date", "upto", "hl"})
        if "id" in args or "nth" in args:
            out = _game_ref(kind, args)
        elif args.get("teams"):
            teams = [x.strip() for x in args["teams"].split(",") if x.strip()]
            if len(teams) != 2:
                raise ColumnError('@draft teams는 "젠지,BLG"처럼 두 팀이어야 합니다')
            out = {"teams": teams, "set": _int("set", args.get("set", "1"))}
            if "date" in args:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args["date"]):
                    raise ColumnError("@draft date는 2026-11-14 모양이어야 합니다")
                out["date"] = args["date"]
        else:
            raise ColumnError('@draft에는 teams="팀1,팀2" set=N 또는 id=게임ID가 필요합니다')
        if "upto" in args:
            out["upto"] = _int("upto", args["upto"])
            if not 1 <= out["upto"] <= 20:
                raise ColumnError("@draft upto는 1~20 사이여야 합니다 (밴·픽 선택 순서)")
        if args.get("hl"):
            out["hl"] = [x.strip() for x in args["hl"].split(",") if x.strip()]
        return out
    _only(kind, args, {"nth", "id"})
    return _game_ref(kind, args)


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
    # 소제목 줄과 상자 줄은 빈 줄 없이 붙여 써도 따로 떼어 읽는다
    body = re.sub(r"^(#{2,3} .*|@\w+.*)$", r"\n\1\n", m.group(2), flags=re.M)
    blocks = []
    for i, para in enumerate(re.split(r"\n\s*\n", body.strip()), 1):
        para = para.strip()
        if not para:
            continue
        lines = para.splitlines()
        em = _EMBED_LINE.match(lines[0])
        if em:
            kind = em.group(1)
            if kind not in EMBEDS:
                raise ColumnError(f"{slug} {i}번째 문단: 알 수 없는 상자 @{kind} ({'/'.join(sorted(EMBEDS))})")
            try:
                blocks.append({"type": kind, **_check_embed(kind, _args(em.group(2)))})
            except ColumnError as e:
                raise ColumnError(f"{slug} {i}번째 문단: {e}") from None
        elif para.startswith("### "):
            blocks.append({"type": "h3", "text": para[4:].strip()})
        elif para.startswith("## "):
            blocks.append({"type": "h", "text": para[3:].strip()})
        else:
            blocks.append({"type": "p", "text": " ".join(x.strip() for x in lines)})
    teams = [t.strip() for t in meta.get("teams", "").split(",") if t.strip()]
    kind = meta.get("kind", "column")
    if kind not in KINDS:
        raise ColumnError(f"{slug}: kind는 column 또는 note여야 합니다")
    draft = meta.get("draft", "false").lower()
    if draft not in {"true", "false"}:
        raise ColumnError(f"{slug}: draft는 true 또는 false여야 합니다")
    return {"slug": slug, "title": meta["title"], "date": meta["date"], "kick": meta.get("kick", ""),
            "lede": meta.get("lede", ""), "teams": teams, "kind": kind, "draft": draft == "true", "blocks": blocks}


def load_columns(folder: Path) -> list[dict]:
    """folder의 *.md를 읽어 최신 글이 먼저 오게 정렬한다."""
    cols = [parse_column(f.read_text(encoding="utf-8"), f.stem) for f in sorted(Path(folder).glob("*.md"))]
    return sorted(cols, key=lambda c: (c["date"], c["slug"]), reverse=True)

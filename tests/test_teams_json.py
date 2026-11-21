"""workbench/teams.json(팀 엠블럼 색·한글 이름 표)이 깨지지 않았는지 확인한다. 직접 고쳐 쓰는 파일이라 실수를 막아 준다."""
import json
import re
from pathlib import Path

TEAMS = json.loads((Path(__file__).resolve().parent.parent / "workbench" / "teams.json").read_text(encoding="utf-8"))
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def entries():
    return {k: v for k, v in TEAMS.items() if not k.startswith("_")}


def test_every_entry_has_required_fields_and_valid_colors():
    for name, st in entries().items():
        assert set(st) >= {"short", "ko", "c", "c2"}, name
        assert HEX.match(st["c"]) and HEX.match(st["c2"]), f"{name}: 색은 #RRGGBB 모양이어야 합니다"
        assert 1 <= len(st["short"]) <= 4 and st["ko"], name


def test_lck_teams_present_with_korean_names():
    ko = {st["ko"] for st in entries().values()}
    for need in ("T1", "젠지", "한화생명e스포츠", "디플러스 기아", "KT 롤스터", "농심 레드포스", "한진 브리온", "키움 DRX", "BNK 피어엑스"):
        assert need in ko, f"{need} 항목이 없습니다"


def test_secondary_color_is_darker_than_primary():
    """엠블럼과 배너는 c(밝은 쪽)에서 c2(어두운 쪽)로 내려가는 그라데이션이라, c2가 더 어두워야 글자가 읽힌다."""
    def lum(h):
        r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    for name, st in entries().items():
        assert lum(st["c2"]) <= lum(st["c"]) + 1, name

"""공개 칼럼 사이트 빌드. 헤드리스 브라우저(Node + Playwright)가 있어야 돌아서, 없으면 건너뛴다."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from src.build_public import build_public
from src.demo import make_demo_games

ROOT = Path(__file__).resolve().parent.parent


def _has_playwright() -> bool:
    if not shutil.which("node"):
        return False
    return subprocess.run(["node", "-e", "require('playwright')"], capture_output=True).returncode == 0


pytestmark = pytest.mark.skipif(not _has_playwright(), reason="node + playwright 필요")


@pytest.fixture(scope="module")
def site(tmp_path_factory):
    out = tmp_path_factory.mktemp("pub")
    cols = tmp_path_factory.mktemp("cols")
    for f in (ROOT / "columns").glob("*.md"):
        shutil.copy(f, cols / f.name)
    (cols / "2026-11-20-draft.md").write_text(
        "---\ntitle: 초안 글\ndate: 2026-11-20\ndraft: true\n---\n@team name=\"Gen.G\"\n", encoding="utf-8")
    stats = build_public(make_demo_games(n=300, seed=5), out, demo=True, columns_dir=cols, download_icons=False)
    return out, stats, json.loads((out / "posts.json").read_text(encoding="utf-8"))


def test_public_site_has_only_rendered_posts_not_game_data(site):
    out, stats, data = site
    names = {p.name for p in out.iterdir()}
    assert {"index.html", "site.js", "posts.json"} <= names
    assert not names & {"games.json", "stats.json", "champs.json", "app.js"}      # 경기 데이터는 싣지 않는다
    assert "@@WORKBENCH_CSS@@" not in (out / "index.html").read_text(encoding="utf-8")


def test_drafts_and_templates_are_left_out(site):
    _, stats, data = site
    slugs = {p["slug"] for p in data["posts"]}
    assert "2026-11-20-draft" not in slugs and not any(s.startswith("_") for s in slugs)
    assert all(not p["draft"] for p in data["posts"]) and stats["drafts_skipped"] >= 1


def test_boxes_are_prerendered_without_buttons(site):
    _, _, data = site
    html = "".join(p["html"] for p in data["posts"])
    assert 'class="dbox"' in html                          # 데이터 상자가 계산돼 들어 있다
    for gone in ("data-wsearch", "data-wseries", "data-again", "data-open", "검색기에서 열기"):
        assert gone not in html                            # 작업실로 가는 버튼은 없다

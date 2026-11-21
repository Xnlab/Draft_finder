"""공개 칼럼 사이트를 만든다: 칼럼·분석 노트와 미리 계산한 근거 상자만 싣는다.

    python -m src.build_public --out public              # 실제 데이터 (data/games.parquet)
    python -m src.build_public --demo --out public_demo   # 가짜 데이터
    python -m src.build_public --demo --drafts --out x    # 초안(draft: true)까지 넣어 미리 보기

방법: 작업실(workbench/)을 임시 폴더에 전체 데이터로 만든 뒤, 헤드리스 브라우저(Node + Playwright,
tools/render_columns.js)로 열어 칼럼마다 근거 상자까지 계산된 HTML을 뽑는다. 검색·계산은 작업실과
같은 코드라 숫자가 다를 수 없다. 공개 폴더에는 그 HTML과 쓰인 챔피언 아이콘만 들어가고,
경기 데이터 파일(games.json, stats.json)은 들어가지 않는다.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

import pandas as pd

from src.build_site import APP_DIR, build
from src.columns import load_columns

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_SRC = ROOT / "site_public"
RENDER_JS = ROOT / "tools" / "render_columns.js"
ICON_RE = re.compile(r"icons/[\w.\-]+\.jpg")


def workbench_css() -> str:
    html = (APP_DIR / "index.html").read_text(encoding="utf-8")
    m = re.search(r"<style>(.*?)</style>", html, re.S)
    if not m:
        raise ValueError("workbench/index.html에서 <style>을 찾지 못했습니다")
    return m.group(1)


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # 요청마다 찍히는 로그를 숨긴다
        pass


def render_columns(site_dir: Path) -> list[dict]:
    """site_dir(작업실 + 데이터)을 로컬 서버로 띄우고, Node 스크립트로 칼럼 본문을 뽑는다."""
    handler = functools.partial(_QuietHandler, directory=str(site_dir))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    out = site_dir / "_export.json"
    try:
        r = subprocess.run(["node", str(RENDER_JS), f"http://127.0.0.1:{server.server_address[1]}/", str(out)],
                           capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            raise RuntimeError(f"칼럼 렌더링 실패: {r.stderr.strip() or r.stdout.strip()}")
        return json.loads(out.read_text(encoding="utf-8"))
    finally:
        server.shutdown()


def reading_minutes(col: dict) -> int:
    """한글 기준 1분에 약 500자, 근거 상자 하나에 30초로 잡는다."""
    chars = sum(len(b.get("text", "").replace(" ", "")) for b in col["blocks"] if b["type"] in ("p", "h"))
    boxes = sum(1 for b in col["blocks"] if b["type"] not in ("p", "h"))
    return max(1, round(chars / 500 + boxes * 0.5))


def team_names_ko() -> dict:
    data = json.loads((APP_DIR / "teams.json").read_text(encoding="utf-8"))
    return {k: v.get("ko", k) for k, v in data.items() if not k.startswith("_")}


def build_public(df: pd.DataFrame, out: Path, demo: bool, columns_dir: Path, drafts: bool = False,
                 ko_by_en: dict | None = None, icon_files: dict | None = None, version: str = "",
                 download_icons: bool = True) -> dict:
    cols = load_columns(columns_dir)
    keep = [c for c in cols if drafts or (not c["draft"] and not c["slug"].startswith("_"))]
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        build(df, work, demo, columns_dir, ko_by_en, icon_files, version, download_icons)
        for f in ("index.html", "app.js", "teams.json"):
            shutil.copy(APP_DIR / f, work / f)
        rendered = {r["slug"]: r["html"] for r in render_columns(work)}
        posts, icons, ko = [], set(), team_names_ko()
        for c in keep:
            html = rendered[c["slug"]]
            used = ICON_RE.findall(html)
            icons.update(used)
            posts.append({k: c[k] for k in ("slug", "title", "date", "kick", "lede", "kind", "draft")}
                         | {"html": html, "icons": list(dict.fromkeys(used))[:6], "minutes": reading_minutes(c),
                            "tags": [ko.get(t, t) for t in c["teams"]]})
        (out / "icons").mkdir(exist_ok=True)
        for rel in icons:
            if (work / rel).exists():
                shutil.copy(work / rel, out / rel)
    page = (PUBLIC_SRC / "index.html").read_text(encoding="utf-8").replace("/*@@WORKBENCH_CSS@@*/", workbench_css())
    (out / "index.html").write_text(page, encoding="utf-8")
    shutil.copy(PUBLIC_SRC / "site.js", out / "site.js")
    author = {k: v for k, v in json.loads((PUBLIC_SRC / "author.json").read_text(encoding="utf-8")).items()
              if not k.startswith("_")}
    (out / "posts.json").write_text(json.dumps({"meta": {"demo": demo, "author": author}, "posts": posts}, ensure_ascii=False),
                                    encoding="utf-8")
    return {"posts": len(posts), "drafts_skipped": len(cols) - len(keep), "icons": len(icons)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--demo", action="store_true", help="가짜 경기 데이터로 만든다")
    ap.add_argument("--drafts", action="store_true", help="초안(draft: true)과 견본(_로 시작하는 파일)도 넣는다")
    ap.add_argument("--columns", type=Path, default=ROOT / "columns")
    a = ap.parse_args()

    from src.names import load_icon_info, load_name_map
    if a.demo:
        from src.demo import make_demo_games
        df = make_demo_games(n=900, seed=11)
    else:
        df = pd.read_parquet(ROOT / "data" / "games.parquet")
    info = load_icon_info()
    ko_by_en = {en: ko for ko, en in load_name_map().items()}
    stats = build_public(df, a.out, a.demo, a.columns, a.drafts, ko_by_en, info["files"], info["version"])
    print(("데모" if a.demo else "실제 데이터"), "공개 사이트 ->", a.out, stats)


if __name__ == "__main__":
    main()

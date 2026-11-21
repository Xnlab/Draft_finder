# Draft Finder

LoL e스포츠 **칼럼 사이트**와, 칼럼을 쓰기 위한 **개인 분석 작업실**. 공개하는 것은 칼럼과 분석 노트뿐이고, 글 안의 근거 상자(검색 결과, 피어리스 시리즈, 팀 지표, 경기 흐름)는 사이트를 만들 때 실제 데이터로 미리 계산해 싣는다.

> 이 저장소는 개발 중이다. 화면 예시는 모두 **가짜 데이터**로 만든 것이고, 실제 경기 데이터는 저장소에 없다. 팬용 대시보드 버전(마이 팀 테마, 팀 대시보드, 챔피언 순위 화면)은 태그 `v0-fan-dashboard` 시점에 그대로 남아 있고, 지금도 작업실 안에 있다.

- 기획과 결정 과정: [`docs/기획서.md`](docs/기획서.md)
- 기술 스택 결정: [`docs/기술스택.md`](docs/기술스택.md)
- 칼럼 쓰는 법: [`docs/칼럼-작성법.md`](docs/칼럼-작성법.md)

## 두 부분
| | 공개 칼럼 사이트 (`site_public/`) | 작업실 (`workbench/`, 나만 쓴다) |
| --- | --- | --- |
| 내용 | 칼럼, 분석 노트, 글 안의 근거 상자 | 밴픽 검색기, 경기 상세·밴픽 쌍둥이, 피어리스 복기, 팀 대시보드, 챔피언 순위, 흐름 유형, 칼럼 미리 보기 |
| 데이터 | 글에 쓰인 계산 결과와 챔피언 아이콘만 (실제 데이터로 약 0.4MB) | 전체 경기 데이터 (`games.json`, `stats.json`) |
| 여는 곳 | 공개 주소 | 내 컴퓨터(`127.0.0.1`)에서만. 인터넷에 올리지 않는다 |

### 칼럼 근거 상자
| 상자 | 보여 주는 것 |
| --- | --- |
| `@search` | 같은 픽·맞대결이 나온 경기 수, 승률, 15분 골드 차이, 경기 카드 |
| `@series` | 피어리스 시리즈의 세트별 소진 챔피언, 인기 픽 소진 |
| `@game` | 경기 하나의 밴픽 |
| `@team` | 팀 지표(경제·교전·오브젝트·시야)를 같은 리그 안 순위·평균과 비교, 레이더 |
| `@form` | 팀의 최근 n경기 15분 골드 차이와 승패 |
| `@flow` | 경기 하나의 시간대별 골드 차이, 10·15분 골드·경험치·CS 차이, 먼저 가져간 오브젝트, 최종 수치 |

글의 머리말에 `kind: note`를 쓰면 분석 노트, `draft: true`면 초안(공개 사이트에 안 실림)이다. 스카우팅 리포트 견본은 `columns/_template-scouting.md`.

## 데이터
Oracle's Elixir의 시즌별 CSV를 쓴다. **원본 CSV와 전처리 결과는 저장소에 올리지 않는다**(`data/`는 `.gitignore`). 받는 곳과 이용 조건은 [Oracle's Elixir 다운로드 페이지](https://oracleselixir.com/tools/downloads)에서 확인한다. 데이터 이용 조건 확인 전에는 사이트를 공개하지 않는다.

## 실행
```bash
pip install -r requirements.txt
python -m pytest -q                                          # 테스트 (실제 데이터 없이 돈다)
python -m src.build_site --demo --out workbench              # 작업실에 데모 데이터 채우기
python -m http.server 8000 --bind 127.0.0.1 --directory workbench   # 작업실 http://127.0.0.1:8000
python -m src.build_public --demo --drafts --out public_demo # 공개 사이트 미리 보기 (초안 포함)
```
공개 사이트 빌드는 헤드리스 브라우저로 작업실을 열어 근거 상자를 계산하므로 Node와 Playwright가 필요하다.
실제 데이터로 만들려면 CSV를 `data/raw/`에 넣고 다음을 실행한다.
```bash
python -m src.prepare                                 # CSV -> data/games.parquet, data/players.parquet(원본 165개 열 전부)
python -m src.build_site --out site --with-app        # 작업실 (저장소에 올리지 않음)
python -m src.build_public --out public               # 공개 칼럼 사이트 (저장소에 올리지 않음)
```

## 폴더
```
src/prepare.py       CSV -> 경기당 한 줄 표 + 원본 전체 열 보존
src/build_site.py    작업실이 읽는 JSON과 아이콘
src/build_public.py  공개 칼럼 사이트 (근거 상자를 미리 계산)
src/columns.py       칼럼 markdown 파서
src/search.py        검색 로직(파이썬 구현, 테스트 기준)
workbench/           작업실 화면(index.html, app.js)과 데모 데이터
site_public/         공개 사이트 틀(index.html, site.js)
tools/               render_columns.js (작업실에서 칼럼 본문을 뽑는 Node 스크립트)
columns/             칼럼·분석 노트 원고(markdown)
tests/               테스트
```

"""유사 밴픽 검색기 화면 (Streamlit).  실행: streamlit run app.py"""
import html
from pathlib import Path

import pandas as pd
import streamlit as st

from src import search as S
from src.demo import make_demo_games
from src.names import IconResolver, NameResolver, load_icon_info, load_name_map

DATA_PATH = Path(__file__).parent / "data" / "games.parquet"
POS_KO = {"top": "탑", "jng": "정글", "mid": "미드", "bot": "원딜", "sup": "서폿"}
SIDE_KO = {"blue": "블루", "red": "레드"}
MAX_CARDS = 24

st.set_page_config(page_title="유사 밴픽 검색기", page_icon="🔍", layout="wide")

CSS = """
<style>
.block-container{padding-top:2.2rem;max-width:1280px}
.hero{display:flex;align-items:baseline;gap:12px;margin-bottom:4px}
.hero h1{font-size:1.7rem;margin:0;padding:0}
.pill{font-size:.72rem;padding:2px 9px;border-radius:99px;background:#3a2d12;color:#f2c55c;border:1px solid #5b4516}
.sub{color:#8b98a9;font-size:.9rem;margin-bottom:14px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:6px 0 14px}
.kpi{background:#161c26;border:1px solid #263040;border-radius:12px;padding:14px 18px}
.k-label{color:#8b98a9;font-size:.78rem;letter-spacing:.02em}
.k-val{font-size:1.9rem;font-weight:700;line-height:1.25;margin-top:2px}
.k-sub{color:#8b98a9;font-size:.8rem;margin-top:2px}
.pos{color:#3fb950}.neg{color:#f85149}.warn{color:#f2c55c}
.badge{display:inline-block;font-size:.7rem;padding:1px 8px;border-radius:99px;background:#3a2d12;color:#f2c55c;margin-left:6px;vertical-align:middle}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:12px}
.card{background:#161c26;border:1px solid #263040;border-radius:12px;padding:12px 14px}
.hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:.8rem;color:#8b98a9;flex-wrap:wrap}
.lg{background:#243049;color:#9cc2ff;border-radius:6px;padding:1px 8px;font-weight:600}
.gdv{margin-left:auto;font-weight:600}
.team{border-radius:8px;padding:6px 8px;margin-top:6px;border-left:3px solid #2a3547;background:#121823}
.team.blue{border-left-color:#4f8cff}.team.red{border-left-color:#ff6b6b}
.team.matched{background:#17233a}
.tn{font-size:.82rem;font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:6px}
.win-tag{font-size:.65rem;font-weight:700;color:#3fb950;border:1px solid #2a6b36;border-radius:4px;padding:0 5px}
.ab{font-size:.65rem;font-weight:700;color:#9cc2ff;background:#243049;border-radius:4px;padding:0 5px}
.picks{display:flex;gap:6px}
.ch{width:64px;text-align:center}
.ico{width:44px;height:44px;border-radius:8px;display:block;margin:0 auto;border:2px solid transparent;background:#222b3a}
.ico.hl{border-color:#f2c55c;box-shadow:0 0 0 1px #f2c55c55}
.ico.fb{display:flex;align-items:center;justify-content:center;font-weight:700;color:#9cc2ff}
.ico.empty{border:2px dashed #3a465a;background:transparent;color:#6b7788;display:flex;align-items:center;justify-content:center}
.cn{font-size:.68rem;color:#aab6c6;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.score{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:.78rem;color:#8b98a9}
.bar{flex:1;height:6px;background:#263040;border-radius:99px;overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#4f8cff,#7fb0ff)}
.more{color:#8b98a9;font-size:.85rem;margin-top:10px}
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)


# ---------------------------------------------------------------- 데이터·이름·아이콘
@st.cache_data
def load_games():
    if DATA_PATH.exists():
        return pd.read_parquet(DATA_PATH), False
    return make_demo_games(), True


@st.cache_resource
def load_resolver(champs: tuple):
    try:
        return NameResolver(load_name_map())
    except Exception:  # 오프라인 등: 영문 이름 그대로 쓴다
        return NameResolver({c: c for c in champs})


@st.cache_resource
def load_icons():
    try:
        return IconResolver(load_icon_info())
    except Exception:  # 아이콘을 못 받으면 글자 칩으로 대신한다
        return IconResolver(None)


def champs_in(games):
    cols = [f"{s}_{p}" for s in ("blue", "red") for p in S.POSITIONS]
    return sorted({c for col in cols for c in games[col].dropna().unique()})


games, is_demo = load_games()
resolver = load_resolver(tuple(champs_in(games)))
icons = load_icons()
ko_to_en = {resolver.to_korean(c): c for c in champs_in(games)}
ko_options = sorted(ko_to_en)


def to_en(ko_list):
    return [ko_to_en[k] for k in ko_list]


# ---------------------------------------------------------------- HTML 조각 (들여쓰기·빈 줄 없이)
def esc(x) -> str:
    return html.escape(str(x))


def champ_html(en, pos, hl: set) -> str:
    if en is None or pd.isna(en) or en == S.MISSING:
        return f'<div class="ch" title="{POS_KO[pos]} · 없음"><div class="ico empty">?</div><div class="cn">없음</div></div>'
    ko = resolver.to_korean(en)
    cls = "ico hl" if en in hl else "ico"
    url = icons.url(en)
    if url:
        img = f'<img class="{cls}" src="{url}" alt="{esc(ko)}" loading="lazy">'
    else:
        img = f'<div class="{cls} fb">{esc(ko[:1])}</div>'
    return f'<div class="ch" title="{POS_KO[pos]} · {esc(ko)}">{img}<div class="cn">{esc(ko)}</div></div>'


def team_html(side, name, champs, hl, won, matched=False, tag="") -> str:
    cls = f"team {side}" + (" matched" if matched else "")
    win = '<span class="win-tag">WIN</span>' if won else ""
    picks = "".join(champ_html(c, p, hl) for p, c in zip(S.POSITIONS, champs))
    return (f'<div class="{cls}"><div class="tn">{tag}{esc(name)}{win}</div>'
            f'<div class="picks">{picks}</div></div>')


def gd_html(v, label) -> str:
    if v is None or pd.isna(v):
        return ""
    cls = "pos" if v > 0 else "neg" if v < 0 else ""
    return f'<span class="gdv {cls}">{label} {v:+,.0f}</span>'


def card_html(r: dict, hl: set) -> str:
    if "team" in r:  # 팀 한 줄 결과: 매칭된 팀이 위쪽 강조
        side = r["side"]
        other = "red" if side == "blue" else "blue"
        mine = [r[p] for p in S.POSITIONS]
        theirs = [r[f"opp_{p}"] for p in S.POSITIONS]
        teams = {side: (r["team"], mine), other: (r["opponent"], theirs)}
        win = r["win"]
        winner = None if win is None or pd.isna(win) else (side if win else other)
        matched, tags = side, {}
        gd = gd_html(r["gd15"], "15분 골드차(검색 팀)")
    else:  # 경기 한 줄 결과 (양쪽 비교 / 기준 경기)
        teams = {s: (r[f"{s}_team"], [r[f"{s}_{p}"] for p in S.POSITIONS]) for s in ("blue", "red")}
        winner = r["winner"] if isinstance(r["winner"], str) else None
        a = r.get("a_side")
        matched = a if isinstance(a, str) else None
        tags = {}
        if matched:
            tags = {matched: '<span class="ab">A</span>',
                    ("red" if matched == "blue" else "blue"): '<span class="ab">B</span>'}
        gd = gd_html(r.get("gd15"), "15분 골드차(블루 기준)")
    head = (f'<div class="hd"><span class="lg">{esc(r["league"])}</span>'
            f'<span>{esc(r["date"])} · 패치 {esc(r["patch"])} · 세트 {esc(r["set_no"])}</span>'
            + ('<span class="badge">일부 누락</span>' if r.get("data_complete") is False else "")
            + gd + "</div>")
    body = "".join(
        team_html(s, teams[s][0], teams[s][1], hl, winner == s,
                  matched == s and "team" in r, tags.get(s, ""))
        for s in ("blue", "red"))
    score = ""
    if r.get("score") is not None and not pd.isna(r.get("score")):
        sc = float(r["score"])
        score = (f'<div class="score">유사도<div class="bar"><i style="width:{sc * 100:.0f}%"></i></div>'
                 f'<b>{sc:.2f}</b></div>')
    return f'<div class="card">{head}{body}{score}</div>'


def kpi_html(res: pd.DataFrame) -> str:
    s = S.summarize(res)
    decided = s["wins"] + s["losses"]
    rate = f'{s["wins"] / decided * 100:.0f}%' if decided else "-"
    small = '<span class="badge">표본 적음</span>' if 0 < s["games"] < 10 else ""
    gd = S.matched_gd15(res).dropna()
    gd_txt, gd_cls = ("-", "") if gd.empty else (f"{gd.mean():+,.0f}", "pos" if gd.mean() > 0 else "neg")
    return (
        '<div class="kpis">'
        f'<div class="kpi"><div class="k-label">검색된 경기</div><div class="k-val">{s["games"]:,}{small}</div>'
        '<div class="k-sub">필터를 통과한 후보 중</div></div>'
        f'<div class="kpi"><div class="k-label">매칭 팀 승률</div><div class="k-val">{rate}</div>'
        f'<div class="k-sub">{s["wins"]}승 {s["losses"]}패' + (f' · 미상 {s["unknown"]}' if s["unknown"] else "") + '</div></div>'
        f'<div class="kpi"><div class="k-label">평균 15분 골드차</div><div class="k-val {gd_cls}">{gd_txt}</div>'
        '<div class="k-sub">매칭 팀 기준</div></div></div>')


# ---------------------------------------------------------------- 표 꾸미기
def pretty(res: pd.DataFrame) -> pd.DataFrame:
    out = res.drop(columns=[f"opp_{p}" for p in S.POSITIONS if f"opp_{p}" in res]).copy()
    champ_cols = [c for c in out if c in S.POSITIONS or c.split("_")[-1] in S.POSITIONS and c != "set_no"]
    for c in champ_cols:
        out[c] = out[c].map(resolver.to_korean)
    if "win" in out:
        out["win"] = out["win"].map({True: "승", False: "패"}).fillna("미상")
    if "winner" in out:
        out["winner"] = out["winner"].map(SIDE_KO).fillna("미상")
    for c in ("side", "a_side"):
        if c in out:
            out[c] = out[c].map(SIDE_KO)
    if "data_complete" in out:
        out["data_complete"] = out["data_complete"].map(lambda v: "" if v is not False else "일부 누락")
    if "opp_champ" in out:
        out["opp_champ"] = out["opp_champ"].map(resolver.to_korean)
    names = {
        "league": "리그", "date": "날짜", "patch": "패치", "set_no": "세트",
        "game_id": "경기 ID", "team": "팀", "side": "진영", "opponent": "상대",
        "win": "승패", "gd15": "15분 골드차", "score": "유사도",
        "opp_champ": "상대 챔피언", "blue_team": "블루팀", "red_team": "레드팀",
        "winner": "승리 진영", "a_side": "조합 A 진영", "data_complete": "데이터",
    }
    if "gd15" in out and "blue_team" in out:
        names["gd15"] = "15분 골드차(블루 기준)"
    for p, ko in POS_KO.items():
        names[p] = ko
        names[f"blue_{p}"] = f"블루 {ko}"
        names[f"red_{p}"] = f"레드 {ko}"
    return out.rename(columns=names)


def show(res: pd.DataFrame, hl: set, key: str):
    if res.empty:
        st.warning("조건에 맞는 경기가 없습니다. 필터를 넓혀 보세요.")
        return
    st.markdown(kpi_html(res), unsafe_allow_html=True)
    view = st.segmented_control("보기", ["카드", "표"], default="카드", key=f"view_{key}",
                                label_visibility="collapsed") or "카드"
    if view == "카드":
        recs = res.head(MAX_CARDS).to_dict("records")
        st.markdown('<div class="grid">' + "".join(card_html(r, hl) for r in recs) + "</div>",
                    unsafe_allow_html=True)
        if len(res) > MAX_CARDS:
            st.markdown(f'<div class="more">상위 {MAX_CARDS}개만 카드로 보여 줍니다. 전체 {len(res)}경기는 "표"에서 볼 수 있어요.</div>',
                        unsafe_allow_html=True)
    else:
        st.dataframe(
            pretty(res), hide_index=True, width="stretch",
            column_config={"유사도": st.column_config.ProgressColumn(
                "유사도", min_value=0.0, max_value=1.0, format="%.2f")},
        )


# ---------------------------------------------------------------- 머리말 + 필터 막대
demo_pill = '<span class="pill">DEMO DATA · 가짜 경기</span>' if is_demo else ""
st.markdown(f'<div class="hero"><h1>🔍 유사 밴픽 검색기</h1>{demo_pill}</div>'
            '<div class="sub">같은 픽, 같은 맞대결, 비슷한 조합이 나온 2026 시즌 경기를 리그 구분 없이 찾습니다.</div>',
            unsafe_allow_html=True)

with st.container(border=True):
    f1, f2, f3 = st.columns([3, 3, 2.4])
    patches = sorted(games["patch"].dropna().unique(), key=S._patch_key)
    with f1:
        p_lo, p_hi = st.select_slider("패치 범위", options=patches, value=(patches[0], patches[-1]))
    with f2:
        league_opts = sorted(games["league"].unique())
        leagues = st.multiselect("리그", league_opts, default=league_opts)
    with f3:
        set_opts = sorted(games["set_no"].dropna().unique())
        sets = st.multiselect("세트 번호", set_opts, default=set_opts,
                              help="피어리스 방식 대회의 후반 세트만 보려면 4, 5만 선택하세요. 밴은 유사도에 넣지 않습니다.")

filters = dict(patch_min=p_lo, patch_max=p_hi, leagues=leagues, sets=sets)
n_ok = len(S.apply_filters(games, **filters))
st.caption(f"필터를 통과한 경기 {n_ok:,} / 전체 {len(games):,}")

tab1, tab2, tab3 = st.tabs(["같은 챔피언", "같은 맞대결", "비슷한 조합"])

# ---------------------------------------------------------------- 1. 같은 챔피언
with tab1:
    picked = st.multiselect("챔피언을 고르면, 모두 같은 팀에 있던 경기를 찾습니다 (한글로 검색)",
                            ko_options, default=[c for c in ("오리아나", "바이") if c in ko_options],
                            key="same")
    if picked:
        show(S.find_same_champions(games, to_en(picked), **filters), set(to_en(picked)), "same")
    else:
        st.info("챔피언을 하나 이상 골라 주세요.")

# ---------------------------------------------------------------- 2. 같은 맞대결
with tab2:
    c1, c2, c3 = st.columns([1, 2, 2])
    pos = c1.selectbox("포지션", S.POSITIONS, index=2, format_func=POS_KO.get)
    a = c2.selectbox("챔피언 A", ko_options,
                     index=ko_options.index("아지르") if "아지르" in ko_options else 0)
    b = c3.selectbox("챔피언 B", ko_options,
                     index=ko_options.index("오리아나") if "오리아나" in ko_options else 0)
    st.caption("진영은 가리지 않습니다. 강조된 팀과 승패·골드차는 **챔피언 A를 쓴 팀** 기준입니다.")
    show(S.find_matchup(games, pos, ko_to_en[a], ko_to_en[b], **filters),
         {ko_to_en[a], ko_to_en[b]}, "match")

# ---------------------------------------------------------------- 3. 비슷한 조합
with tab3:
    m1, m2 = st.columns([2, 3])
    mode = m1.radio("입력 방식", ["경기 ID로", "직접 입력"], horizontal=True)
    top_n = m2.slider("결과 개수", 5, 30, 10)

    if mode == "경기 ID로":
        gid = st.selectbox(
            "기준 경기", games["game_id"],
            format_func=lambda g: (lambda r: f"{g} · {r.date} · {r.league} · "
                                   f"{r.blue_team} vs {r.red_team} (세트 {r.set_no})")(
                games.loc[games["game_id"] == g].iloc[0]),
        )
        side_label = st.radio("비교 대상", ["양쪽 팀", "블루 팀만", "레드 팀만"], horizontal=True)
        side = {"양쪽 팀": None, "블루 팀만": "blue", "레드 팀만": "red"}[side_label]
        blue, red = S.game_picks(games, gid)
        hl = set(blue if side == "blue" else red if side == "red" else blue + red)
        st.caption("기준 경기 (노란 테두리 = 검색에 쓰이는 픽)")
        base = games[games["game_id"] == gid].to_dict("records")[0]
        st.markdown('<div class="grid">' + card_html(base, hl) + "</div>", unsafe_allow_html=True)
        st.markdown("&nbsp;", unsafe_allow_html=True)
        show(S.similar_to_game(games, gid, side=side, top_n=top_n, **filters), hl, "sim")
    else:
        ca, cb = st.columns(2)
        pa = ca.multiselect("조합 A (최대 5개)", ko_options, max_selections=5, key="simA")
        pb = cb.multiselect("조합 B (비우면 A 한 팀만 비교)", ko_options, max_selections=5, key="simB")
        if not pa:
            st.info("조합 A에 챔피언을 고르면 검색합니다.")
        elif pb:
            show(S.similar_both(games, to_en(pa), to_en(pb), top_n=top_n, **filters),
                 set(to_en(pa + pb)), "sim")
        else:
            show(S.similar_one_side(games, to_en(pa), top_n=top_n, **filters),
                 set(to_en(pa)), "sim")

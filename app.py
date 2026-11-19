"""유사 밴픽 검색기 화면 (Streamlit).  실행: streamlit run app.py"""
from pathlib import Path

import pandas as pd
import streamlit as st

from src import search as S
from src.demo import make_demo_games
from src.names import NameResolver, load_name_map

DATA_PATH = Path(__file__).parent / "data" / "games.parquet"
POS_KO = {"top": "탑", "jng": "정글", "mid": "미드", "bot": "원딜", "sup": "서폿"}
SIDE_KO = {"blue": "블루", "red": "레드"}

st.set_page_config(page_title="유사 밴픽 검색기", page_icon="🔍", layout="wide")


# ---------------------------------------------------------------- 데이터·이름
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


def champs_in(games):
    cols = [f"{s}_{p}" for s in ("blue", "red") for p in S.POSITIONS]
    return sorted({c for col in cols for c in games[col].dropna().unique()})


games, is_demo = load_games()
resolver = load_resolver(tuple(champs_in(games)))
ko_to_en = {resolver.to_korean(c): c for c in champs_in(games)}
ko_options = sorted(ko_to_en)


def to_en(ko_list):
    return [ko_to_en[k] for k in ko_list]


# ---------------------------------------------------------------- 표 꾸미기
def pretty(res: pd.DataFrame) -> pd.DataFrame:
    """결과 표를 한글 열 이름·한글 챔피언 이름으로 바꾼다."""
    out = res.copy()
    champ_cols = [c for c in out if c.split("_")[-1] in S.POSITIONS or c in S.POSITIONS]
    champ_cols = [c for c in champ_cols if c != "set_no"]
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
    names = {
        "league": "리그", "date": "날짜", "patch": "패치", "set_no": "세트",
        "game_id": "경기 ID", "team": "팀", "side": "진영", "opponent": "상대",
        "win": "승패", "gd15": "15분 골드차", "score": "유사도",
        "opp_champ": "상대 챔피언", "blue_team": "블루팀", "red_team": "레드팀",
        "winner": "승리 진영", "a_side": "조합 A 진영", "data_complete": "데이터",
    }
    if "gd15" in out and "blue_team" in out:
        names["gd15"] = "15분 골드차(블루 기준)"
    if "opp_champ" in out:
        out["opp_champ"] = out["opp_champ"].map(resolver.to_korean)
    for p, ko in POS_KO.items():
        names[p] = ko
        names[f"blue_{p}"] = f"블루 {ko}"
        names[f"red_{p}"] = f"레드 {ko}"
    return out.rename(columns=names)


def show(res: pd.DataFrame):
    if res.empty:
        st.warning("조건에 맞는 경기가 없습니다. 필터를 넓혀 보세요.")
        return
    st.success(S.summary_line(res))
    st.dataframe(
        pretty(res),
        hide_index=True,
        width="stretch",
        column_config={"유사도": st.column_config.ProgressColumn(
            "유사도", min_value=0.0, max_value=1.0, format="%.2f")},
    )


# ---------------------------------------------------------------- 사이드바 필터
st.title("🔍 유사 밴픽 검색기")
if is_demo:
    st.info("⚠️ **데모 데이터**입니다. 실제 경기가 아니라 무작위로 만든 가짜 경기예요. "
            "`data/games.parquet`를 만들면 자동으로 실제 데이터로 바뀝니다.")

with st.sidebar:
    st.header("필터")
    patches = sorted(games["patch"].dropna().unique(), key=S._patch_key)
    p_lo, p_hi = st.select_slider("패치 범위", options=patches, value=(patches[0], patches[-1]))
    leagues = st.multiselect("리그", sorted(games["league"].unique()),
                             default=sorted(games["league"].unique()))
    set_opts = sorted(games["set_no"].dropna().unique())
    sets = st.multiselect("세트 번호", set_opts, default=set_opts,
                          help="피어리스 방식 대회에서 4~5세트만 보려면 4, 5만 선택하세요.")
    st.caption("밴은 유사도에 넣지 않고, 세트 번호 필터로 대신 다룹니다.")

filters = dict(patch_min=p_lo, patch_max=p_hi, leagues=leagues, sets=sets)
n_filtered = len(S.apply_filters(games, **filters))
st.caption(f"필터를 통과한 경기: {n_filtered:,} / 전체 {len(games):,}")

tab1, tab2, tab3 = st.tabs(["같은 챔피언", "같은 맞대결", "비슷한 조합"])

# ---------------------------------------------------------------- 1. 같은 챔피언
with tab1:
    st.write("고른 챔피언이 **모두 같은 팀**에 있었던 경기를 찾습니다. (양쪽 진영 모두)")
    picked = st.multiselect("챔피언 (한글로 입력해 검색)", ko_options,
                            default=[c for c in ("오리아나", "바이") if c in ko_options],
                            key="same")
    if picked:
        show(S.find_same_champions(games, to_en(picked), **filters))
    else:
        st.info("챔피언을 하나 이상 골라 주세요.")

# ---------------------------------------------------------------- 2. 같은 맞대결
with tab2:
    st.write("같은 라인에서 두 챔피언이 맞붙은 경기를 찾습니다. 어느 진영이든 상관없습니다.")
    c1, c2, c3 = st.columns(3)
    pos = c1.selectbox("포지션", S.POSITIONS, index=2, format_func=POS_KO.get)
    a = c2.selectbox("챔피언 A", ko_options,
                     index=ko_options.index("아지르") if "아지르" in ko_options else 0)
    b = c3.selectbox("챔피언 B", ko_options,
                     index=ko_options.index("오리아나") if "오리아나" in ko_options else 0)
    st.caption("결과의 팀·승패·골드차는 **챔피언 A를 쓴 팀** 기준입니다.")
    show(S.find_matchup(games, pos, ko_to_en[a], ko_to_en[b], **filters))

# ---------------------------------------------------------------- 3. 비슷한 조합
with tab3:
    st.write("픽이 겹치는 정도(자카드 유사도: 겹침 ÷ 합집합)로 비슷한 경기를 찾습니다.")
    mode = st.radio("입력 방식", ["경기 ID로", "직접 입력"], horizontal=True)
    top_n = st.slider("결과 개수", 5, 30, 10)

    if mode == "경기 ID로":
        gid = st.selectbox(
            "기준 경기", games["game_id"],
            format_func=lambda g: (lambda r: f"{g} · {r.date} · {r.league} · "
                                   f"{r.blue_team} vs {r.red_team} (세트 {r.set_no})")(
                games.loc[games["game_id"] == g].iloc[0]),
        )
        blue, red = S.game_picks(games, gid)
        st.write("**블루**: " + ", ".join(resolver.to_korean(c) for c in blue))
        st.write("**레드**: " + ", ".join(resolver.to_korean(c) for c in red))
        side_label = st.radio("비교 대상", ["양쪽 팀", "블루 팀만", "레드 팀만"], horizontal=True)
        side = {"양쪽 팀": None, "블루 팀만": "blue", "레드 팀만": "red"}[side_label]
        show(S.similar_to_game(games, gid, side=side, top_n=top_n, **filters))
    else:
        ca, cb = st.columns(2)
        pa = ca.multiselect("조합 A (최대 5개)", ko_options, max_selections=5, key="simA")
        pb = cb.multiselect("조합 B (비우면 A 한 팀만 비교)", ko_options, max_selections=5, key="simB")
        if not pa:
            st.info("조합 A에 챔피언을 고르면 검색합니다.")
        elif pb:
            show(S.similar_both(games, to_en(pa), to_en(pb), top_n=top_n, **filters))
        else:
            show(S.similar_one_side(games, to_en(pa), top_n=top_n, **filters))

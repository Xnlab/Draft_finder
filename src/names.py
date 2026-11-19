"""한글 ↔ 영문 챔피언 이름 대응.

Data Dragon의 챔피언 id로 ko_KR / en_US `name`을 이어 붙여 대응표를 만든다.
입력은 한글이든 영문이든 받고, 띄어쓰기·대소문자·아포스트로피는 무시한다.
"""
from __future__ import annotations

import json
from difflib import get_close_matches
from pathlib import Path

import requests

DDRAGON = "https://ddragon.leagueoflegends.com"
CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "names.json"


class UnknownChampionError(KeyError):
    """대응표에 없는 챔피언 이름."""


def normalize(text: str) -> str:
    """비교용 정규화: 소문자로 바꾸고 글자·숫자 외의 문자를 모두 지운다."""
    return "".join(ch for ch in str(text).lower() if ch.isalnum())


def fetch_name_map(version: str | None = None, timeout: int = 20) -> dict[str, str]:
    """Data Dragon에서 {한글 이름: 영문 이름} 대응표를 받아 온다."""
    if version is None:
        res = requests.get(f"{DDRAGON}/api/versions.json", timeout=timeout)
        res.raise_for_status()
        version = res.json()[0]

    def names(locale: str) -> dict[str, str]:
        r = requests.get(
            f"{DDRAGON}/cdn/{version}/data/{locale}/champion.json", timeout=timeout
        )
        r.raise_for_status()
        return {cid: c["name"] for cid, c in r.json()["data"].items()}

    ko, en = names("ko_KR"), names("en_US")
    return {ko[cid]: en[cid] for cid in ko if cid in en}


def load_name_map(refresh: bool = False) -> dict[str, str]:
    """캐시(data/names.json)가 있으면 그것을, 없거나 refresh면 새로 받아 저장한다."""
    if CACHE_PATH.exists() and not refresh:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    mapping = fetch_name_map()
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return mapping


class NameResolver:
    def __init__(self, ko_to_en: dict[str, str]):
        self.ko_to_en = dict(ko_to_en)
        self.en_to_ko = {en: ko for ko, en in self.ko_to_en.items()}
        self._lookup: dict[str, str] = {}
        for ko, en in self.ko_to_en.items():
            self._lookup[normalize(ko)] = en
            self._lookup[normalize(en)] = en

    def resolve(self, name: str) -> str:
        """한글 또는 영문 입력을 데이터에 쓰이는 영문 이름으로 바꾼다."""
        key = normalize(name)
        if key in self._lookup:
            return self._lookup[key]
        close = get_close_matches(key, list(self._lookup), n=3, cutoff=0.6)
        hint = ", ".join(dict.fromkeys(self._lookup[c] for c in close))
        msg = f"알 수 없는 챔피언 이름: {name!r}"
        raise UnknownChampionError(msg + (f" (혹시: {hint})" if hint else ""))

    def resolve_many(self, names) -> list[str]:
        return [self.resolve(n) for n in names]

    def to_korean(self, english: str) -> str:
        """화면 표시용. 대응표에 없으면 입력을 그대로 돌려준다."""
        return self.en_to_ko.get(english, english)

    def unknown_in_data(self, english_names) -> list[str]:
        """데이터에 있는데 대응표에 없는 영문 이름 (전처리에서 경고용)."""
        known = {normalize(en) for en in self.en_to_ko}
        return sorted({n for n in english_names if normalize(n) not in known})

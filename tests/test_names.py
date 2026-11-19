import pytest

from src.names import IconResolver, NameResolver, UnknownChampionError, normalize

MAP = {"오리아나": "Orianna", "카이사": "Kai'Sa", "누누와 윌럼프": "Nunu & Willump"}


@pytest.fixture
def resolver():
    return NameResolver(MAP)


def test_korean_and_english_both_resolve(resolver):
    assert resolver.resolve("오리아나") == "Orianna"
    assert resolver.resolve("orianna") == "Orianna"


def test_spacing_case_and_apostrophe_ignored(resolver):
    assert resolver.resolve("카이 사") == "Kai'Sa"
    assert resolver.resolve("KAISA") == "Kai'Sa"
    assert resolver.resolve("누누와윌럼프") == "Nunu & Willump"
    assert resolver.resolve("nunu willump") == "Nunu & Willump"


def test_unknown_name_suggests_close_match(resolver):
    with pytest.raises(UnknownChampionError) as e:
        resolver.resolve("오리아")
    assert "Orianna" in str(e.value)


def test_to_korean_roundtrip(resolver):
    assert resolver.to_korean("Orianna") == "오리아나"
    assert resolver.to_korean("Zzz") == "Zzz"


def test_unknown_in_data_warns_about_missing_names(resolver):
    assert resolver.unknown_in_data(["Orianna", "KaiSa", "Brand New"]) == ["Brand New"]


def test_icon_url():
    icons = IconResolver({"version": "16.1.1", "files": {"Kai'Sa": "Kaisa.png"}})
    assert icons.url("Kai'Sa").endswith("/cdn/16.1.1/img/champion/Kaisa.png")
    assert icons.url("kaisa") == icons.url("Kai'Sa")
    assert icons.url("Nobody") is None
    assert IconResolver(None).url("Kai'Sa") is None  # 아이콘 정보를 못 받으면 None


def test_normalize():
    assert normalize("Kai'Sa") == "kaisa"

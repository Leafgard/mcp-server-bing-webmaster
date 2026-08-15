"""Tests for the Bing API client's response handling.

These cover the two things that silently corrupt or crash tool output: the
.NET date serialization the API returns, and the SDK import that moved between
mcp 1.x and 2.x.
"""

import importlib

import pytest

from mcp_server_bwt.main import BingWebmasterAPI


@pytest.fixture
def api() -> BingWebmasterAPI:
    return BingWebmasterAPI("test-key")


class TestDateNormalization:
    def test_converts_epoch_millis_to_iso(self, api: BingWebmasterAPI) -> None:
        assert api._normalize_dates("/Date(1786828998000)/") == "2026-08-15T21:23:18+00:00"

    def test_keeps_sub_second_precision(self, api: BingWebmasterAPI) -> None:
        assert api._normalize_dates("/Date(1786828998316)/") == "2026-08-15T21:23:18.316000+00:00"

    def test_honours_a_timezone_offset(self, api: BingWebmasterAPI) -> None:
        # Same instant, rendered in -0700: the offset must survive the round trip.
        assert api._normalize_dates("/Date(1786828998000-0700)/").endswith("-07:00")

    @pytest.mark.parametrize(
        "sentinel",
        ["/Date(-62135596800000)/", "/Date(-62135568000000-0800)/"],
    )
    def test_min_value_sentinel_becomes_none(self, api: BingWebmasterAPI, sentinel: str) -> None:
        # DateTime.MinValue is the API's "never". Returning a year-1 date would
        # be reported downstream as a real timestamp.
        assert api._normalize_dates(sentinel) is None

    def test_leaves_ordinary_strings_alone(self, api: BingWebmasterAPI) -> None:
        for value in ["Success", "https://example.com/Date(123)/extra", "", "/Date(abc)/"]:
            assert api._normalize_dates(value) == value

    def test_walks_nested_structures(self, api: BingWebmasterAPI) -> None:
        payload = {
            "Feeds": [
                {"Url": "https://example.com/sitemap.xml", "LastCrawled": "/Date(1786828998000)/"},
                {"Url": "https://example.com/other.xml", "LastCrawled": "/Date(-62135596800000)/"},
            ],
            "Count": 2,
        }
        result = api._normalize_dates(payload)
        assert result["Feeds"][0]["LastCrawled"] == "2026-08-15T21:23:18+00:00"
        assert result["Feeds"][1]["LastCrawled"] is None
        assert result["Count"] == 2

    def test_preserves_non_string_scalars(self, api: BingWebmasterAPI) -> None:
        for value in [0, 1786828998000, True, None, 3.5]:
            assert api._normalize_dates(value) == value


class TestTypeField:
    def test_adds_type_to_a_dict(self, api: BingWebmasterAPI) -> None:
        assert api._ensure_type_field({}, "Site")["__type"].startswith("Site:#")

    def test_adds_type_to_every_list_item(self, api: BingWebmasterAPI) -> None:
        result = api._ensure_type_field([{}, {}], "Site")
        assert all(item["__type"].startswith("Site:#") for item in result)

    def test_does_not_overwrite_an_existing_type(self, api: BingWebmasterAPI) -> None:
        assert api._ensure_type_field({"__type": "Kept"}, "Site")["__type"] == "Kept"

    def test_tolerates_an_empty_list(self, api: BingWebmasterAPI) -> None:
        # Bing returns [] for a site with no data yet; this must not raise.
        assert api._ensure_type_field([], "Site") == []


def test_server_imports_on_the_installed_sdk() -> None:
    """The FastMCP import must work on both mcp 1.x and 2.x.

    mcp 2.0 removed ``mcp.server.fastmcp``; importing the module at all proves
    the fallback resolved against whichever SDK is installed.
    """
    module = importlib.import_module("mcp_server_bwt.main")
    assert module.mcp is not None

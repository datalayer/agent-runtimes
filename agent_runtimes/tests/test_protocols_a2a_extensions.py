# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2A Agent Card extensions: read, published from contributions, negotiated (AGENT_PROTOCOLS PR-02)."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from reactor import PluginManifest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.a2a import (
    FACE_URI,
    OTHER,
    CardContext,
    CardExtension,
    card_extensions,
    extensions_of,
    find_extension,
    merge_extensions,
    negotiate_extensions,
    unsupported_required,
)
from agent_runtimes.protocols.a2a.plugin import ORCHESTRATION

CARD = {
    "name": "Shop",
    "capabilities": {
        "extensions": [
            {"uri": FACE_URI, "params": {"emoji": "🛍"}},
            {"uri": "https://example.com/ext/loyalty/v1", "required": True},
        ]
    },
}


@dataclass(frozen=True)
class Loyalty:
    uri: str = "https://example.com/ext/loyalty/v1"
    description: str = "Points for each order."
    required: bool = False

    def params(self, context):
        return {"program": f"{context.agent_id}-points"}


class _Contributes:
    def __init__(self, point, value, order=50):
        self.point, self.value, self.order = point, value, order

    def provide_contributions(self, contributions):
        contributions.contribute(
            self.point, self.value, contribution_id=self.value.uri, order=self.order
        )


def test_reading_card_extensions():
    assert [e.uri for e in extensions_of(CARD)] == [
        FACE_URI,
        "https://example.com/ext/loyalty/v1",
    ]
    assert find_extension(CARD, FACE_URI).params == {"emoji": "🛍"}
    assert find_extension(CARD, "https://nope.test/x") is None
    assert unsupported_required(CARD, []) == ["https://example.com/ext/loyalty/v1"]
    assert extensions_of({"capabilities": {}}) == []
    with pytest.raises(ValueError, match="twice"):
        extensions_of(
            {"capabilities": {"extensions": [{"uri": "https://a.test/x"}] * 2}}
        )
    with pytest.raises(ValueError, match="URI"):
        CardExtension(uri="loyalty")


def test_reading_a_fasta2a_card():
    from fasta2a.schema import AgentExtension

    card = {
        "capabilities": {
            "extensions": [AgentExtension(uri="https://a.test/x", required=False)]
        }
    }
    assert [e.uri for e in extensions_of(card)] == ["https://a.test/x"]


def test_a_card_publishes_what_is_contributed():
    platform = build_protocols_reactor()
    plain = card_extensions(
        platform, CardContext(agent_id="shop", api_prefix="/api/v1")
    )
    assert [e.uri for e in plain] == [
        "https://datalayer.ai/extensions/orchestration/v1"
    ]
    assert plain[0].params == {
        "pause": "/api/v1/a2a/pause",
        "steer": "/api/v1/a2a/steer",
    }
    faced = card_extensions(platform, CardContext(agent_id="shop", face={"emoji": "🛍"}))
    assert [e.uri for e in faced][1] == FACE_URI
    platform.register_plugin(
        PluginManifest(name="loyalty", version="1"), _Contributes(OTHER, Loyalty())
    )
    published = card_extensions(
        platform, CardContext(agent_id="shop"), [{"uri": "https://b.test/x"}]
    )
    assert [e.uri for e in published] == [
        "https://datalayer.ai/extensions/orchestration/v1",
        "https://example.com/ext/loyalty/v1",
        "https://b.test/x",
    ]
    assert published[1].params == {"program": "shop-points"}
    with pytest.raises(ValueError, match="published twice"):
        card_extensions(
            platform,
            CardContext(agent_id="shop"),
            [{"uri": FACE_URI}, {"uri": FACE_URI}],
        )


def test_a_host_replaces_an_extension_by_a_lower_order():
    @dataclass(frozen=True)
    class NoSteer:
        uri: str = "https://datalayer.ai/extensions/orchestration/v1"
        description: str = "Pause only."
        required: bool = False

        def params(self, context):
            return {"pause": "/pause"}

    platform = build_protocols_reactor(
        plugins=[
            (
                PluginManifest(name="host", version="1"),
                _Contributes(ORCHESTRATION, NoSteer()),
            )
        ]
    )
    [orchestration] = card_extensions(platform, CardContext(agent_id="a"))
    assert orchestration.params == {"pause": "/pause"}


def test_negotiating_with_an_agent():
    platform = build_protocols_reactor()
    with pytest.raises(ValueError, match="loyalty"):
        negotiate_extensions(CARD, platform)
    platform.register_plugin(
        PluginManifest(name="loyalty", version="1"), _Contributes(OTHER, Loyalty())
    )
    assert negotiate_extensions(CARD, platform) == [
        FACE_URI,
        "https://example.com/ext/loyalty/v1",
    ]


def test_publishing_refuses_a_uri_twice():
    builtin = [CardExtension(uri=FACE_URI)]
    merged = merge_extensions(
        builtin, [{"uri": "https://example.com/ext/loyalty/v1", "required": True}]
    )
    assert merged[1].to_json() == {
        "uri": "https://example.com/ext/loyalty/v1",
        "required": True,
    }
    with pytest.raises(ValueError, match="published twice"):
        merge_extensions(builtin, [{"uri": FACE_URI}])

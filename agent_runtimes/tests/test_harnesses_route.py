# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The harness catalogue over HTTP (VSCODE VS-03): ``GET /api/v1/harnesses``
answers what ``loop harnesses`` prints — the accepted ``harness``
contributions with their terms, register entry, capabilities and ACP launch
— and ``GET /api/v1/harnesses/{id}`` one of them, or a refusal in a sentence.
"""

from __future__ import annotations

from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from reactor import PluginPlatform

from agent_runtimes.apps import plugins
from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    from agent_runtimes.app import create_app

    monkeypatch.setattr(plugins, "PLATFORM", PluginPlatform())
    with TestClient(create_app()) as made:
        yield made


def test_the_catalogue_is_listed_with_terms_register_and_capabilities(
    client: TestClient,
) -> None:
    answer = client.get("/api/v1/harnesses")
    assert answer.status_code == 200
    listed = {harness["id"]: harness for harness in answer.json()["harnesses"]}
    # The offered ones alone (the restriction to four, META_HARNESS): a harness the
    # catalogue describes and does not offer is not listed, and named is refused below.
    served = {
        spec.id
        for spec in HARNESS_CATALOGUE.values()
        if spec.acp is not None and spec.enabled
    }
    assert set(listed) == served == {"claude-code", "codex", "opencode", "pi"}
    claude = listed["claude-code"]
    assert claude["name"] == "Claude Code"
    assert claude["requires"]["secrets"] == ["ANTHROPIC_API_KEY"]
    assert claude["registered"]["adapter"] == "@agentclientprotocol/claude-agent-acp"
    assert claude["terms"]["served_to_third_parties"] == "api_key_only"
    assert claude["capabilities"]["resume"] in {"none", "load", "native"}
    assert claude["acp"]["command"] == "npx"
    assert claude["contributed_by"] == "agent-runtimes.sessions"


def test_one_harness_is_answered_and_an_unknown_one_refused_in_a_sentence(
    client: TestClient,
) -> None:
    assert client.get("/api/v1/harnesses/codex").json()["id"] == "codex"
    refused = client.get("/api/v1/harnesses/no-such-harness")
    assert refused.status_code == 404
    assert "GET /api/v1/harnesses lists them" in refused.json()["detail"]
    not_offered = client.get("/api/v1/harnesses/goose")
    assert not_offered.status_code == 404
    assert not_offered.json()["detail"].startswith(
        "The harness 'goose' (goose) is not offered: the catalogue offers four harnesses today"
    )


def test_on_datalayer_only_what_goes_through_ai_inference_is_offered(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", "datalayer")
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://r1.example")
    listed = {item["id"] for item in client.get("/api/v1/harnesses").json()["harnesses"]}
    assert listed == {"claude-code", "opencode", "pi"}
    refused = client.get("/api/v1/harnesses/codex")
    assert refused.status_code == 404
    assert "not offered on Datalayer" in refused.json()["detail"]
    assert "Responses API" in refused.json()["detail"]

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Reactor tool bundles: the decks spec, and its backend half as pydantic-ai tools."""

from __future__ import annotations

import json

import httpx
import pytest

from agent_runtimes.services.reactor_tools import (
    build_reactor_backend_request,
    reactor_backend_toolset,
    reactor_tool_names,
    reactor_tools_requiring_approval,
    resolve_reactor_backend_url,
)
from agent_runtimes.specs.agents.agents import AGENTSPECS
from agent_runtimes.specs.reactor_tools import get_reactor_tool_spec, list_reactor_tool_specs


class TestCatalog:
    def test_the_decks_bundle_is_generated_with_both_halves(self) -> None:
        spec = get_reactor_tool_spec("decks")
        assert spec is not None
        assert spec.plugin == "@datalayer/decks"
        assert [e.command for e in spec.frontend][:3] == ["decks.list", "decks.open", "decks.goToSlide"]
        assert spec.backend is not None
        assert {e.name for e in spec.backend.tools} == {
            "decks_list_decks",
            "decks_get_deck",
            "decks_create_deck",
            "decks_update_deck",
            "decks_delete_deck",
        }

    def test_a_versioned_reference_resolves(self) -> None:
        assert get_reactor_tool_spec("decks:0.0.1") is get_reactor_tool_spec("decks")
        assert get_reactor_tool_spec("nope") is None
        assert any(s.id == "decks" for s in list_reactor_tool_specs())

    def test_the_decks_worker_takes_the_bundle(self) -> None:
        worker = next(a for a in AGENTSPECS.values() if a.id == "worker-decks")
        assert worker.reactor_tools == ["decks:0.0.1"]

    def test_names_and_approvals(self) -> None:
        names = reactor_tool_names(["decks:0.0.1", "unknown"])
        assert "decks_open" in names["frontend"]
        assert "decks_create_deck" in names["backend"]
        assert reactor_tools_requiring_approval(["decks"]) == ["decks_delete_deck"]


class TestBackendUrl:
    def test_override_then_envvar_then_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        spec = get_reactor_tool_spec("decks")
        assert spec is not None
        monkeypatch.delenv("DATALAYER_DECKS_URL", raising=False)
        assert resolve_reactor_backend_url(spec) == "http://127.0.0.1:8797"
        monkeypatch.setenv("DATALAYER_DECKS_URL", "http://decks.internal/")
        assert resolve_reactor_backend_url(spec) == "http://decks.internal"
        assert resolve_reactor_backend_url(spec, "http://x") == "http://x"


class TestRequests:
    def test_path_params_then_query_or_body(self) -> None:
        spec = get_reactor_tool_spec("decks")
        assert spec is not None and spec.backend is not None
        by_name = {t.name: t for t in spec.backend.tools}
        method, url, query, body = build_reactor_backend_request(
            by_name["decks_get_deck"], "http://b", {"id": "startups/seed"}
        )
        assert (method, url, query, body) == ("GET", "http://b/decks/startups/seed", {}, None)
        method, url, query, body = build_reactor_backend_request(
            by_name["decks_create_deck"], "http://b", {"slug": "hi", "spec": {"deck": {}}}
        )
        assert method == "POST" and url == "http://b/decks"
        assert body == {"slug": "hi", "spec": {"deck": {}}}
        method, url, query, body = build_reactor_backend_request(
            by_name["decks_delete_deck"], "http://b", {"id": "x", "force": True}
        )
        assert (method, url, query, body) == ("DELETE", "http://b/decks/x", {"force": True}, None)


class TestToolset:
    @pytest.mark.asyncio
    async def test_the_toolset_calls_the_backend(self) -> None:
        seen: list[httpx.Request] = []

        def handle(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.method == "GET":
                return httpx.Response(200, json=[{"id": "a"}])
            if request.method == "DELETE":
                return httpx.Response(204)
            return httpx.Response(404, text="no such deck")

        factory = lambda: httpx.AsyncClient(transport=httpx.MockTransport(handle))  # noqa: E731
        toolset = reactor_backend_toolset(["decks:0.0.1"], client_factory=factory)
        assert toolset is not None
        tools = {tool.name: tool for tool in toolset.tools.values()}
        assert set(tools) == {
            "decks_list_decks",
            "decks_get_deck",
            "decks_create_deck",
            "decks_update_deck",
            "decks_delete_deck",
        }
        # The schema the model sees is the spec's, not one inferred from **kwargs.
        assert "slug" in tools["decks_create_deck"].function_schema.json_schema["properties"]

        assert await tools["decks_list_decks"].function() == [{"id": "a"}]
        assert await tools["decks_delete_deck"].function(id="a") == {"ok": True}
        failed = await tools["decks_update_deck"].function(id="a", slug="a", spec={})
        assert failed["error"].startswith("PUT http://127.0.0.1:8797/decks/a answered 404")
        assert seen[-1].method == "PUT"
        assert json.loads(seen[-1].content) == {"slug": "a", "spec": {}}

    def test_no_bundles_means_no_toolset(self) -> None:
        assert reactor_backend_toolset([]) is None
        assert reactor_backend_toolset(["unknown"]) is None

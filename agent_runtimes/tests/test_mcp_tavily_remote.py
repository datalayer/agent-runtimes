# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tavily is reached at its hosted server, its key a header of the request.

The catalogue's ``tavily`` ran ``npx -y tavily-mcp`` with the key in the
process's environment; it is Tavily's own server now
(``https://mcp.tavily.com/mcp/``, Streamable HTTP), the key sent as
``Authorization: Bearer ${TAVILY_API_KEY}``. For a runtime that holds the
person's key nothing changes but where the server runs: the key comes from the
same variable, the server is refused in the same kind of sentence when it is
missing, and the secret it declares is the one it declared. A runtime whose
sandbox holds no secret (Kagent) sends a placeholder in that header, which its
egress gateway replaces.
"""

from __future__ import annotations

from typing import Any

import pytest

from agent_runtimes.guardrails.credentials import redact
from agent_runtimes.guardrails.declared_secrets import (
    declared_secrets,
    server_env_names,
)
from agent_runtimes.mcp import lifecycle
from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG
from agent_runtimes.mcp.lifecycle import MCPLifecycleManager
from agent_runtimes.specs.actions import SERVER_ACTIONS

TAVILY = MCP_SERVER_CATALOG["tavily"]
KEY = "tvly-a-key-of-the-person-0123456789"


class _Toolset:
    async def __aenter__(self) -> "_Toolset":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        return None

    async def list_tools(self) -> list[Any]:
        return []


@pytest.fixture()
def started(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    """A fresh manager whose remote servers are built here: what each was built with."""
    monkeypatch.setattr(lifecycle, "_lifecycle_manager", MCPLifecycleManager())
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    built: list[Any] = []

    def remote_toolset(
        server_id: str, url: str, headers: Any, timeout: float, auth: Any = None
    ) -> Any:
        built.append((server_id, url, dict(headers), auth))
        return _Toolset()

    monkeypatch.setattr(lifecycle, "remote_toolset", remote_toolset)

    def no_process(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("Tavily is remote: no process is started for it.")

    import fastmcp.client.transports as transports

    monkeypatch.setattr(transports, "StdioTransport", no_process)
    return built


def test_the_catalogue_s_tavily_is_the_hosted_server() -> None:
    assert TAVILY.transport == "streamable-http"
    assert TAVILY.url == "https://mcp.tavily.com/mcp/"
    assert TAVILY.headers == {"Authorization": "Bearer ${TAVILY_API_KEY}"}
    assert not TAVILY.command and not TAVILY.args and not TAVILY.env
    assert TAVILY.required_env_vars == ["TAVILY_API_KEY:0.0.1"]
    # The key is in no address.
    assert "${" not in TAVILY.url and "tavilyApiKey" not in TAVILY.url


def test_its_tools_are_the_ones_the_specs_and_the_approvals_name() -> None:
    assert set(SERVER_ACTIONS["tavily"].tools) == {
        "tavily_search",
        "tavily_extract",
        "tavily_crawl",
        "tavily_map",
        "tavily_research",
    }


@pytest.mark.asyncio
async def test_it_starts_with_the_person_s_key_in_the_header(
    started: list[Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", KEY)
    manager = lifecycle.get_mcp_lifecycle_manager()
    instance = await manager.start_server("tavily", TAVILY)
    assert instance is not None and instance.is_running
    assert started == [
        (
            "tavily",
            "https://mcp.tavily.com/mcp/",
            {"Authorization": f"Bearer {KEY}"},
            None,
        )
    ]
    # Held: never shown to the model, nor written in a log line.
    assert KEY not in redact(f"it answered {KEY}")
    assert "tavily" not in manager.get_failed_servers()


@pytest.mark.asyncio
async def test_a_key_given_with_the_agent_is_the_one_sent(started: list[Any]) -> None:
    manager = lifecycle.get_mcp_lifecycle_manager()
    instance = await manager.start_server(
        "tavily", TAVILY, extra_env={"TAVILY_API_KEY": KEY}
    )
    assert instance is not None
    assert started[0][2] == {"Authorization": f"Bearer {KEY}"}


@pytest.mark.asyncio
async def test_without_the_key_it_is_not_started_and_says_which_variable(
    started: list[Any],
) -> None:
    manager = lifecycle.get_mcp_lifecycle_manager()
    assert await manager.start_server("tavily", TAVILY) is None
    # Nothing was sent: no request leaves with an empty bearer.
    assert started == []
    assert manager.get_failed_servers()["tavily"] == (
        "MCP server 'tavily' is not started: TAVILY_API_KEY is not set, and "
        "it would send an empty bearer token."
    )


@pytest.mark.asyncio
async def test_a_sandbox_without_secrets_sends_its_placeholder_in_that_header(
    started: list[Any],
) -> None:
    """On Kagent the variable holds a public placeholder, and the egress
    gateway replaces the header for mcp.tavily.com: the runtime sends the
    header as it would the key."""
    manager = lifecycle.get_mcp_lifecycle_manager()
    instance = await manager.start_server(
        "tavily", TAVILY, extra_env={"TAVILY_API_KEY": "ate-egress-injected"}
    )
    assert instance is not None
    assert started[0][1:3] == (
        "https://mcp.tavily.com/mcp/",
        {"Authorization": "Bearer ate-egress-injected"},
    )


def test_the_secret_it_declares_is_still_the_person_s_tavily_key() -> None:
    assert server_env_names(TAVILY) == {"TAVILY_API_KEY"}
    declared = declared_secrets({"id": "probe", "mcp_servers": ["tavily:0.0.1"]})
    assert declared.consumers["the MCP server tavily"] == {"TAVILY_API_KEY"}
    assert "TAVILY_API_KEY" in declared.runtime

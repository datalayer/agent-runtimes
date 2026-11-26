# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tavily is a local process again, and optional for the agents that name it.

agentspecs 0.1.22 made the catalogue's ``tavily`` Tavily's hosted server
(Streamable HTTP, the key in a header). Codemode's registry takes a server's
address only for ``transport == "http"`` and agent-codemode's server config
carries no headers, so every codemode agent saw Tavily with no tool
(``worker-crawler``, ``example-codemode``). agentspecs 0.1.24 puts back
``npx -y tavily-mcp`` with ``TAVILY_API_KEY`` in its environment (the user,
26 November 2026), and every agent that names it lists it optional: started
whenever the key is there, left out without it, never refused.
"""

from __future__ import annotations

from typing import Any

import pytest

from agent_runtimes.guardrails.declared_secrets import declared_secrets
from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG
from agent_runtimes.services.agent_factory import create_codemode_toolset
from agent_runtimes.specs.actions import SERVER_ACTIONS
from agent_runtimes.specs.agents import get_agent_spec
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401
    _DummyRequest,
    creation_spy,
)

TAVILY = MCP_SERVER_CATALOG["tavily"]
KEY = "tvly-a-key-of-the-person-0123456789"
TOOLS = [
    "tavily_search",
    "tavily_extract",
    "tavily_crawl",
    "tavily_map",
    "tavily_research",
]


def _having(*names: str):
    given = set(names)
    return lambda name: name in given


def test_the_catalogue_s_tavily_is_a_local_process_reading_its_key() -> None:
    assert TAVILY.transport == "stdio"
    assert TAVILY.command == "npx"
    assert TAVILY.args == ["-y", "tavily-mcp"]
    assert TAVILY.env == {"TAVILY_API_KEY": "${TAVILY_API_KEY}"}
    assert not TAVILY.url and not TAVILY.headers
    assert TAVILY.required_env_vars == ["TAVILY_API_KEY:0.0.1"]


def test_its_tools_are_the_ones_the_specs_and_the_approvals_name() -> None:
    assert set(SERVER_ACTIONS["tavily"].tools) == set(TOOLS)


@pytest.mark.asyncio
async def test_a_codemode_registry_has_tavily_s_tools_when_the_key_is_there(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    """The regression of 1.8.8: the registry's client for Tavily must reach a server.

    agent-codemode's MCPClient is replaced by one that answers like the
    package when it is started as the catalogue says (``npx -y tavily-mcp``
    with the key in its environment) and fails, as the real client does,
    when it is given neither a command nor an address.
    """
    import agent_codemode.discovery.registry as registry_module

    built: list[dict[str, Any]] = []

    class _Client:
        def __init__(self, **kwargs: Any) -> None:
            built.append(kwargs)
            self.kwargs = kwargs

        async def list_tools(self) -> list[dict[str, Any]]:
            if not self.kwargs.get("command") and not self.kwargs.get("url"):
                raise RuntimeError("neither a command nor an address")
            assert self.kwargs["command"] == "npx"
            assert self.kwargs["args"] == ["-y", "tavily-mcp"]
            assert self.kwargs["env"].get("TAVILY_API_KEY") == KEY
            return [
                {"name": name, "description": name, "inputSchema": {}} for name in TOOLS
            ]

    monkeypatch.setattr(registry_module, "MCPClient", _Client)
    monkeypatch.setenv("TAVILY_API_KEY", KEY)

    toolset = create_codemode_toolset(
        mcp_servers=[TAVILY],
        workspace_path=str(tmp_path / "workspace"),
        generated_path=str(tmp_path / "generated"),
        skills_path=str(tmp_path / "skills"),
        sandbox_variant="eval",
    )
    assert toolset is not None
    discovered = await toolset.registry.discover_all()
    assert sorted(tool.name for tool in discovered["tavily"]) == sorted(
        f"tavily__{name}" for name in TOOLS
    )
    assert built == [
        {
            "name": "tavily",
            "url": "",
            "command": "npx",
            "args": ["-y", "tavily-mcp"],
            "env": {"TAVILY_API_KEY": KEY},
        }
    ]


@pytest.mark.parametrize("agent_id", ["worker-crawler", "example-codemode"])
def test_an_agent_that_names_it_starts_it_with_the_key_and_without_it_otherwise(
    agent_id: str,
) -> None:
    spec = get_agent_spec(agent_id)
    assert spec is not None and spec.optional is not None
    assert spec.optional.mcp_servers == ["tavily"]
    declared = declared_secrets(spec)
    assert declared.consumers["the MCP server tavily"] == {"TAVILY_API_KEY"}
    every = set(declared.runtime) | {"TAVILY_API_KEY"}
    # With the key: nothing is left out, nothing refused; it is started as before.
    assert "tavily" not in declared.left_out(_having(*every)).servers
    assert not declared.missing(_having(*every), who=agent_id)
    # Without it (no key, or an engine whose sandbox holds no secret): left
    # out and said, never a refusal.
    without = every - {"TAVILY_API_KEY"}
    assert declared.left_out(_having(*without)).servers["tavily"] == ["TAVILY_API_KEY"]
    assert not [
        sentence
        for sentence in declared.missing(_having(*without), who=agent_id)
        if "TAVILY_API_KEY" in sentence
    ]


def test_every_catalogue_agent_that_names_tavily_may_start_without_it() -> None:
    from agent_runtimes.specs.agents import list_agentspecs

    naming = [
        spec
        for spec in list_agentspecs()
        if "tavily"
        in [getattr(server, "id", server) for server in spec.mcp_servers or []]
    ]
    assert len(naming) >= 37
    for spec in naming:
        assert spec.optional is not None and "tavily" in spec.optional.mcp_servers, (
            spec.id
        )


@pytest.mark.asyncio
async def test_a_tavily_only_codemode_agent_without_the_key_reaches_no_server(
    monkeypatch: pytest.MonkeyPatch,
    creation_spy: dict[str, object],  # noqa: F811
) -> None:
    """Left out, Tavily empties the selection: codemode is built with no MCP
    server, never with every server the runtime knows (review of 1.8.10)."""
    from agent_runtimes.routes import agents as agents_route
    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent

    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    built: list[dict[str, Any]] = []

    class _Toolset:
        pass

    def build(*_args: Any, **kwargs: Any) -> Any:
        built.append(kwargs)
        return _Toolset()

    monkeypatch.setattr(agents_route, "_build_codemode_toolset", build)
    request = CreateAgentRequest(
        name="Searcher",
        agent_spec={
            "systemPrompt": "You search.",
            "mcpServers": [{"id": "tavily", "origin": "catalog"}],
            "optional": {"mcpServers": ["tavily"]},
        },
        enable_codemode=True,
    )
    await create_agent(request, _DummyRequest())
    assert built and all(call["disable_mcp_servers"] is True for call in built)
    pydantic_kwargs = creation_spy["pydantic_kwargs"]
    assert isinstance(pydantic_kwargs, dict)
    instructions = " ".join(str(part) for part in pydantic_kwargs["instructions"])
    assert "the MCP server tavily (no TAVILY_API_KEY)" in instructions


def test_serve_with_an_agent_leaves_tavily_out_without_the_key_and_says_so(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The process's own agent (``serve --agent-id``) leaves out what a created one does."""
    from agent_runtimes.app import startup_left_out

    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    monkeypatch.setenv("GITHUB_TOKEN", "a-token")
    spec = get_agent_spec("worker-crawler")
    assert spec is not None
    left_out, skills, sentence = startup_left_out(spec, list(spec.skills))
    assert left_out.servers == {"tavily": ["TAVILY_API_KEY"]}
    assert skills == list(spec.skills)
    assert "the MCP server tavily (no TAVILY_API_KEY)" in sentence


def test_serve_with_an_agent_keeps_tavily_with_the_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.app import startup_left_out

    monkeypatch.setenv("TAVILY_API_KEY", KEY)
    monkeypatch.setenv("GITHUB_TOKEN", "a-token")
    spec = get_agent_spec("worker-crawler")
    assert spec is not None
    left_out, _, sentence = startup_left_out(spec, list(spec.skills))
    assert not left_out and sentence == ""


def test_the_crawler_cog_leaves_tavily_out_without_the_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An application's cog reaches the runtime as its agent's spec: its optional Tavily is left out the same way."""
    from agent_runtimes.specs.cogs import get_cog

    crawler = get_cog("cog-crawler")
    assert crawler is not None
    cog = crawler.spec
    assert cog.optional is not None and cog.optional.mcp_servers == ["tavily"]
    declared = declared_secrets(cog)
    assert declared.left_out(_having()).servers["tavily"] == ["TAVILY_API_KEY"]
    assert not [s for s in declared.missing(_having(), who="cog") if "TAVILY" in s]
    assert "tavily" not in declared.left_out(_having("TAVILY_API_KEY")).servers

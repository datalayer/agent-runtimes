# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""${VAR} and ${VAR:-default} in an MCP server's args, wherever it is started.

Bluesky's server is at ``${BLUESKY_MCP_SERVER_DIR:-/opt/mcp-servers/bsky-mcp-server}``:
Codemode's registry handed the placeholder to node as it was (10 November 2026).
"""

from __future__ import annotations

from types import SimpleNamespace

from agent_runtimes.mcp.env_expansion import expand_env_vars

ARG = "${BLUESKY_MCP_SERVER_DIR:-/opt/mcp-servers/bsky-mcp-server}/build/src/index.js"


def test_a_default_when_unset_or_empty_the_value_otherwise():
    assert (
        expand_env_vars(ARG, {})
        == "/opt/mcp-servers/bsky-mcp-server/build/src/index.js"
    )
    assert expand_env_vars(ARG, {"BLUESKY_MCP_SERVER_DIR": ""}).startswith("/opt/")
    assert (
        expand_env_vars(ARG, {"BLUESKY_MCP_SERVER_DIR": "/home/me/bsky"})
        == "/home/me/bsky/build/src/index.js"
    )
    assert expand_env_vars("Bearer ${TOKEN}", {}) == "Bearer "


def test_a_value_put_in_is_told_a_default_is_not():
    told: list[tuple[str, str]] = []
    expand_env_vars(
        "${A}-${B:-b}", {"A": "secret"}, on_value=lambda n, v: told.append((n, v))
    )
    assert told == [("A", "secret")]


def test_codemode_hands_the_server_its_expanded_args(monkeypatch):
    from agent_runtimes.integrations.codemode import CodemodeIntegration

    monkeypatch.setenv("BLUESKY_MCP_SERVER_DIR", "/home/me/bsky")
    from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG

    server = MCP_SERVER_CATALOG["bluesky"]
    config = CodemodeIntegration._convert_server_config(
        object.__new__(CodemodeIntegration), server
    )
    assert config.args == ["/home/me/bsky/build/src/index.js"]


def test_the_lifecycle_manager_expands_as_codemode_does(monkeypatch):
    from agent_runtimes.mcp.lifecycle import MCPLifecycleManager

    manager = MCPLifecycleManager.__new__(MCPLifecycleManager)
    assert (
        manager._expand_env_vars(ARG, {})
        == "/opt/mcp-servers/bsky-mcp-server/build/src/index.js"
    )
    assert manager._expand_env_vars("t=${TOK}", {"TOK": "v"}) == "t=v"

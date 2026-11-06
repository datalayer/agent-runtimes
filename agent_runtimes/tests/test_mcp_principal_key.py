# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A server of the catalogue asking for ``${DATALAYER_API_KEY}`` on a runtime
launched without one sends the served deployment's principal token.

Seen 6 November 2026: the home page's Accounting agent, on a pool runtime a
hosted page gave its deployment, could not open `odoo-accounting` — the
runtime held no key, the server was not started, and the agent answered
that no tools were connected. The principal's token is what such a runtime
acts with (`apps/principal`), the gateway included.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from agent_runtimes.apps import principal  # noqa: E402
from agent_runtimes.mcp import lifecycle  # noqa: E402
from agent_runtimes.mcp.lifecycle import MCPLifecycleManager  # noqa: E402
from agent_runtimes.types import MCPServer  # noqa: E402

from test_mcp_start_fails_closed import _Toolset  # noqa: E402

SERVER = "odoo-accounting"


def _asking() -> MCPServer:
    return MCPServer(
        id=SERVER,
        name="Odoo Accounting",
        transport="streamable-http",
        url="https://mcp.example/mcp?only=odoo-accounting",
        headers={"Authorization": "Bearer ${DATALAYER_API_KEY}"},
    )


@pytest.fixture(autouse=True)
def no_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    yield
    for uid in list(principal._HELD):
        principal.forget_principal_token(uid)


def _serving(monkeypatch: pytest.MonkeyPatch, *uids: str) -> None:
    monkeypatch.setattr(principal, "deployments_served", lambda: list(uids))


def test_one_served_deployment_lends_its_principal(monkeypatch: pytest.MonkeyPatch) -> None:
    _serving(monkeypatch, "dep-1")
    principal.give_principal_token("dep-1", "principal-token-1", expires_in=3600)
    assert MCPLifecycleManager._principal_key(SERVER, _asking(), {}) == "principal-token-1"


def test_a_key_of_the_runtimes_own_is_kept(monkeypatch: pytest.MonkeyPatch) -> None:
    _serving(monkeypatch, "dep-1")
    principal.give_principal_token("dep-1", "principal-token-1", expires_in=3600)
    assert MCPLifecycleManager._principal_key(SERVER, _asking(), {"DATALAYER_API_KEY": "own"}) == ""


def test_a_server_not_asking_gets_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    _serving(monkeypatch, "dep-1")
    principal.give_principal_token("dep-1", "principal-token-1", expires_in=3600)
    other = MCPServer(id="x", name="X", transport="streamable-http", url="https://x.example/mcp", headers={"Authorization": "Bearer ${OTHER}"})
    assert MCPLifecycleManager._principal_key("x", other, {}) == ""


def test_no_deployment_or_two_with_different_principals_choose_none(monkeypatch: pytest.MonkeyPatch) -> None:
    _serving(monkeypatch)
    assert MCPLifecycleManager._principal_key(SERVER, _asking(), {}) == ""
    _serving(monkeypatch, "dep-1", "dep-2")
    principal.give_principal_token("dep-1", "principal-token-1", expires_in=3600)
    principal.give_principal_token("dep-2", "principal-token-2", expires_in=3600)
    assert MCPLifecycleManager._principal_key(SERVER, _asking(), {}) == ""
    # An expired principal is no key either: the server fails closed, as before.
    _serving(monkeypatch, "dep-3")
    principal.give_principal_token("dep-3", "principal-token-3", expires_in=0)
    assert MCPLifecycleManager._principal_key(SERVER, _asking(), {}) == ""


@pytest.mark.asyncio
async def test_the_server_starts_with_the_principal_as_its_bearer(monkeypatch: pytest.MonkeyPatch) -> None:
    _serving(monkeypatch, "dep-1")
    principal.give_principal_token("dep-1", "principal-token-1", expires_in=3600)
    seen: dict[str, str] = {}

    def remote_toolset(server_id: str, url: str, headers: dict[str, str], timeout: float):
        seen.update(headers)
        return _Toolset()

    monkeypatch.setattr(lifecycle, "remote_toolset", remote_toolset)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_STARTUP_TIMEOUT", 0.5)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_HANDSHAKE_TIMEOUT", 0.5)
    manager = MCPLifecycleManager()
    await manager.start_server(SERVER, _asking())
    assert seen.get("Authorization") == "Bearer principal-token-1"
    assert SERVER not in manager._failed_servers

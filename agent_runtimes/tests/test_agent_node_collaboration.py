# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the Agent Node collaboration room provisioning helper.

Covers :func:`ensure_collaboration_room`: library-space resolution, notebook
creation, idempotency (no network when a uid is already persisted), and the
graceful skip when credentials/spacer URL are unavailable.
"""

from __future__ import annotations

from typing import Callable

import httpx
import pytest

from agent_runtimes.nodes import agent_node_collaboration as collab
from agent_runtimes.routes import agent_node as node_cfg


def _reset_config(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Isolate the module-level configuration + on-disk state for a test."""
    monkeypatch.setenv("AGENT_NODE_STATE_PATH", str(tmp_path / "agent-node.json"))
    monkeypatch.setattr(
        node_cfg,
        "_CURRENT_CONFIGURATION",
        node_cfg.AgentNodeConfiguration(),
    )
    # Clear any UI-supplied credentials so env vars are the only source.
    node_cfg.set_runtime_credentials(None, None)


def _install_mock_client(
    monkeypatch: pytest.MonkeyPatch,
    handler: Callable[[httpx.Request], httpx.Response],
) -> None:
    """Patch the module's ``httpx.AsyncClient`` to use a MockTransport."""
    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def _factory(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(collab.httpx, "AsyncClient", _factory)


@pytest.mark.asyncio
async def test_ensure_collaboration_room_provisions_and_persists(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Resolve the library space, create a notebook, and persist its uid."""
    _reset_config(tmp_path, monkeypatch)
    monkeypatch.setenv("DATALAYER_SPACER_URL", "https://spacer.example")
    monkeypatch.setenv("DATALAYER_API_KEY", "test-token")

    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/spaces/users/me"):
            assert request.headers["authorization"] == "Bearer test-token"
            return httpx.Response(
                200,
                json={
                    "spaces": [
                        {"handle_s": "other", "uid": "space-other"},
                        {"handle_s": "library", "uid": "space-lib"},
                    ]
                },
            )
        if request.url.path.endswith("/notebooks"):
            body = request.content.decode()
            assert "space-lib" in body
            return httpx.Response(200, json={"notebook": {"uid": "nb-room-123"}})
        return httpx.Response(404)

    _install_mock_client(monkeypatch, handler)

    result = await collab.ensure_collaboration_room("node-1")

    assert result == "nb-room-123"
    assert (
        node_cfg.get_agent_node_configuration().collaboration_notebook_uid
        == "nb-room-123"
    )
    # Exactly the two expected calls: space resolution then notebook creation.
    assert [r.method for r in requests] == ["GET", "POST"]


@pytest.mark.asyncio
async def test_ensure_collaboration_room_is_idempotent_without_network(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Return the persisted uid without any HTTP call when already provisioned."""
    _reset_config(tmp_path, monkeypatch)
    monkeypatch.setenv("DATALAYER_SPACER_URL", "https://spacer.example")
    monkeypatch.setenv("DATALAYER_API_KEY", "test-token")
    node_cfg.set_collaboration_notebook_uid("existing-room")

    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("no network call expected when uid already set")

    _install_mock_client(monkeypatch, handler)

    result = await collab.ensure_collaboration_room("node-1")

    assert result == "existing-room"


@pytest.mark.asyncio
async def test_ensure_collaboration_room_skips_without_credentials(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Return ``None`` (skip) when neither spacer URL nor token is available."""
    _reset_config(tmp_path, monkeypatch)
    monkeypatch.delenv("DATALAYER_SPACER_URL", raising=False)
    monkeypatch.delenv("DATALAYER_URL", raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)

    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("no network call expected without credentials")

    _install_mock_client(monkeypatch, handler)

    result = await collab.ensure_collaboration_room("node-1")

    assert result is None
    assert (
        node_cfg.get_agent_node_configuration().collaboration_notebook_uid is None
    )


@pytest.mark.asyncio
async def test_ensure_collaboration_room_falls_back_to_first_space(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Use the first space when no space carries the ``library`` handle."""
    _reset_config(tmp_path, monkeypatch)
    monkeypatch.setenv("DATALAYER_SPACER_URL", "https://spacer.example")
    monkeypatch.setenv("DATALAYER_API_KEY", "test-token")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/spaces/users/me"):
            return httpx.Response(
                200,
                json={"spaces": [{"handle_s": "workspace", "uid": "space-first"}]},
            )
        if request.url.path.endswith("/notebooks"):
            assert "space-first" in request.content.decode()
            return httpx.Response(200, json={"notebook": {"uid": "nb-first"}})
        return httpx.Response(404)

    _install_mock_client(monkeypatch, handler)

    result = await collab.ensure_collaboration_room()

    assert result == "nb-first"

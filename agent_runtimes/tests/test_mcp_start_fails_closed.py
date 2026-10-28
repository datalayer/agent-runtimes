# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An MCP server start that never ends is failed, and started again later.

On r1 (28 October 2026) a runtime's ``odoo-accounting`` logged *Creating MCP
server* and nothing after — no attempt, no failure — and an hour later every
turn still answered "the Odoo MCP server is not available in this session",
none starting it again: a start that ended without a result (its task
cancelled with the request that spawned it, its handshake hung past the
timeout that was meant to end it) left the server neither running, nor
failed, nor starting, and the retry path had nothing to go on.

Now every way a start can end is said in ``_failed_servers``: its own
deadline, its cancellation, an exception outside the attempts. The lock is
released, the server is no longer starting, and the next turn that needs it
starts it again. The three attempts at a broken pipe are kept.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from agent_runtimes.mcp import lifecycle
from agent_runtimes.mcp.lifecycle import MCPLifecycleManager
from agent_runtimes.types import MCPServer

SERVER = "odoo-accounting"


def _remote() -> MCPServer:
    return MCPServer(
        id=SERVER,
        name="Odoo Accounting",
        transport="streamable-http",
        url="https://mcp.example/mcp?only=odoo-accounting",
        headers={"Authorization": "Bearer a-key-0123456789"},
    )


class _Toolset:
    """A toolset whose handshake behaves as the test says.

    ``hangs``: its enter never returns, and it swallows every cancellation
    until ``release`` is set — the client that does not end on the
    cancellation its timeout sends it. ``waits``: its enter waits, cancellable,
    until ``release`` is set. Else it enters at once.
    """

    def __init__(self, *, hangs: bool = False, waits: bool = False) -> None:
        self.hangs = hangs
        self.waits = waits
        self.release = asyncio.Event()
        self.entered = asyncio.Event()
        self.exited = 0

    async def __aenter__(self) -> "_Toolset":
        self.entered.set()
        if self.hangs:
            while not self.release.is_set():
                try:
                    await self.release.wait()
                except asyncio.CancelledError:
                    continue
        elif self.waits:
            await self.release.wait()
        return self

    async def __aexit__(self, *exc: Any) -> None:
        self.exited += 1

    async def list_tools(self) -> list[Any]:
        return []


@pytest.fixture()
def manager(monkeypatch: pytest.MonkeyPatch) -> MCPLifecycleManager:
    fresh = MCPLifecycleManager()
    monkeypatch.setattr(lifecycle, "MCP_SERVER_STARTUP_TIMEOUT", 0.05)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_HANDSHAKE_TIMEOUT", 0.05)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_START_GRACE", 0.1)
    monkeypatch.setattr(lifecycle, "start_deadline", lambda: 0.5)
    monkeypatch.setattr(lifecycle, "_lifecycle_manager", fresh)
    return fresh


def _toolsets(monkeypatch: pytest.MonkeyPatch, *toolsets: _Toolset) -> list[Any]:
    """Each start builds the next toolset; what each was built with is kept."""
    queue = list(toolsets)
    built: list[Any] = []

    def remote_toolset(server_id: str, url: str, headers: Any, timeout: float) -> Any:
        built.append((server_id, url, dict(headers)))
        return queue.pop(0)

    monkeypatch.setattr(lifecycle, "remote_toolset", remote_toolset)
    return built


@pytest.mark.asyncio
async def test_a_handshake_that_never_ends_is_failed_at_the_deadline_and_started_again(
    manager: MCPLifecycleManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    hung = _Toolset(hangs=True)
    well = _Toolset()
    _toolsets(monkeypatch, hung, well)
    try:
        await _the_hung_start_is_failed_and_the_next_turn_starts_it(manager, hung, well)
    finally:
        # Whatever the test said, the hung start is released: the loop's
        # teardown would otherwise wait on a task that ignores cancellation.
        hung.release.set()


async def _the_hung_start_is_failed_and_the_next_turn_starts_it(
    manager: MCPLifecycleManager, hung: _Toolset, well: _Toolset
) -> None:
    started = asyncio.get_running_loop().time()
    assert await manager.start_server(SERVER, _remote()) is None
    elapsed = asyncio.get_running_loop().time() - started
    # Ended at the deadline, with the grace, not at the handshake's timeout
    # the client ignored, and not never.
    assert 0.5 <= elapsed < 3.0
    said = manager.get_failed_servers()[SERVER]
    assert said == (
        f"MCP server '{SERVER}' did not start within 0.5s: its start was ended"
    )
    assert SERVER not in manager._starting_servers
    assert not manager._lock_for(SERVER).locked()
    assert manager.get_running_server(SERVER) is None
    assert manager.get_server_status(SERVER)["status"] == "failed"
    # Its start, still ending, is left to end on its own, held meanwhile.
    (abandoned,) = manager._abandoned
    assert not abandoned.done()

    # A turn that needs it does not wait on it: the failure is known at once.
    assert await manager.wait_until_ready(SERVER, timeout=5.0) is False

    # The next turn starts it again, and it runs.
    assert manager.retry_in_background(SERVER) is True
    await asyncio.sleep(0)
    assert await manager.wait_until_ready(SERVER, timeout=5.0) is True
    instance = manager.get_running_server(SERVER)
    assert instance is not None and instance.pydantic_server is well
    assert SERVER not in manager.get_failed_servers()

    # The hung start, released at last, keeps nothing: the server running is
    # the one the retry started.
    hung.release.set()
    await asyncio.wait({abandoned}, timeout=5.0)
    assert abandoned.done()
    assert hung.exited == 1
    assert manager.get_running_server(SERVER) is instance
    assert not manager._abandoned
    assert await manager.stop_server(SERVER)


@pytest.mark.asyncio
async def test_a_start_cancelled_with_its_request_is_said_and_started_again(
    manager: MCPLifecycleManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    waiting = _Toolset(waits=True)
    well = _Toolset()
    _toolsets(monkeypatch, waiting, well)

    start = asyncio.create_task(manager.start_server(SERVER, _remote()))
    await asyncio.wait_for(waiting.entered.wait(), timeout=5.0)
    assert SERVER in manager._starting_servers
    assert manager.get_server_status(SERVER)["status"] == "starting"

    # The request that spawned the start ends: its task is cancelled.
    start.cancel()
    with pytest.raises(asyncio.CancelledError):
        await start
    assert manager.get_failed_servers()[SERVER] == (
        f"MCP server '{SERVER}' start was cancelled before it ended"
    )
    assert SERVER not in manager._starting_servers
    assert not manager._lock_for(SERVER).locked()
    assert not manager._starts
    assert await manager.wait_until_ready(SERVER, timeout=5.0) is False

    # The next turn starts it again.
    assert manager.retry_in_background(SERVER) is True
    assert len(manager._tasks) == 1
    await asyncio.sleep(0)
    assert await manager.wait_until_ready(SERVER, timeout=5.0) is True
    instance = manager.get_running_server(SERVER)
    assert instance is not None and instance.pydantic_server is well
    assert SERVER not in manager.get_failed_servers()
    await asyncio.sleep(0)
    assert not manager._tasks
    assert await manager.stop_server(SERVER)


@pytest.mark.asyncio
async def test_an_exception_outside_the_attempts_is_said(
    manager: MCPLifecycleManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def inner(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("the catalogue could not be read")

    monkeypatch.setattr(manager, "_start_server_inner", inner)
    assert await manager.start_server(SERVER, _remote()) is None
    said = manager.get_failed_servers()[SERVER]
    assert said.startswith(f"MCP server '{SERVER}' failed to start: ")
    assert "the catalogue could not be read" in said
    assert SERVER not in manager._starting_servers
    assert not manager._lock_for(SERVER).locked()
    assert await manager.wait_until_ready(SERVER, timeout=5.0) is False


@pytest.mark.asyncio
async def test_a_broken_pipe_is_tried_three_times(
    manager: MCPLifecycleManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Broken(_Toolset):
        attempts = 0

        async def __aenter__(self) -> "_Toolset":
            Broken.attempts += 1
            raise RuntimeError("BrokenResourceError: the pipe closed")

    _toolsets(monkeypatch, Broken())
    monkeypatch.setattr(lifecycle, "MCP_SERVER_RETRY_BACKOFF", 0.01)
    monkeypatch.setattr(lifecycle, "start_deadline", lambda: 5.0)
    assert await manager.start_server(SERVER, _remote()) is None
    assert Broken.attempts == lifecycle.MCP_SERVER_MAX_ATTEMPTS == 3
    assert "BrokenResourceError" in manager.get_failed_servers()[SERVER]
    assert SERVER not in manager._starting_servers


def test_the_deadline_covers_every_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AGENT_RUNTIMES_MCP_START_DEADLINE", raising=False)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_STARTUP_TIMEOUT", 45.0)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_RETRY_BACKOFF", 5.0)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_START_GRACE", 5.0)
    # Three attempts, each a handshake and a tool listing at 45 s with 5 s
    # between them, and the grace.
    assert lifecycle.start_deadline() == 3 * (2 * 45.0 + 5.0) + 5.0
    monkeypatch.setenv("AGENT_RUNTIMES_MCP_START_DEADLINE", "120")
    assert lifecycle.start_deadline() == 120.0

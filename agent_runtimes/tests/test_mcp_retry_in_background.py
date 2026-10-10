# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A catalog MCP server that is not running is started again for the next turn.

Disaster Assessment's `earthdata` started 11 ms before the runtime's key was in
its environment, failed, and every turn after skipped it (STUDIO H-03).
"""

from __future__ import annotations

import asyncio

import pytest

from agent_runtimes.mcp import lifecycle
from agent_runtimes.mcp.lifecycle import MCPLifecycleManager


@pytest.mark.asyncio
async def test_a_stopped_server_is_started_again_once_a_minute(monkeypatch) -> None:
    manager = MCPLifecycleManager()
    started: list[tuple[str, dict | None]] = []

    async def start_server(server_id, config=None, extra_env=None):
        started.append((server_id, extra_env))
        return None

    monkeypatch.setattr(manager, "start_server", start_server)
    manager._extra_envs["earthdata"] = {"EARTHDATA_TOKEN": "x"}
    clock = [1000.0]
    monkeypatch.setattr(lifecycle.time, "monotonic", lambda: clock[0])

    assert manager.retry_in_background("earthdata") is True
    await asyncio.sleep(0)
    # Started the way it was first started.
    assert started == [("earthdata", {"EARTHDATA_TOKEN": "x"})]
    # Not again within the minute, nor while it is starting.
    assert manager.retry_in_background("earthdata") is False
    clock[0] += lifecycle.RETRY_SECONDS
    manager._starting_servers.add("earthdata")
    assert manager.retry_in_background("earthdata") is False
    manager._starting_servers.discard("earthdata")
    assert manager.retry_in_background("earthdata") is True
    await asyncio.sleep(0)
    assert len(started) == 2


def test_outside_a_loop_nothing_is_started() -> None:
    assert MCPLifecycleManager().retry_in_background("earthdata") is False

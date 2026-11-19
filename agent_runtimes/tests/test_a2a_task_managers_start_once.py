# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An A2A agent whose lifespan already runs is not started a second time.

The agent of ``serve --agent-id`` registers while the server is starting, and
its FastA2A lifespan runs in a task of its own. When the server's startup then
starts every registered agent, entering that lifespan again left the agent's
TaskManager uninitialized and every A2A request answered 500.
"""

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

from agent_runtimes.routes import a2a


def _app(entered: list[str], name: str, running: bool) -> SimpleNamespace:
    @asynccontextmanager
    async def lifespan(_app):
        entered.append(name)
        yield

    app = SimpleNamespace(router=SimpleNamespace(lifespan_context=lifespan))
    if running:
        app._lifespan_task = object()
    return app


def test_starts_only_the_agents_whose_lifespan_is_not_running(monkeypatch):
    entered: list[str] = []
    agents = {
        "running": SimpleNamespace(app=_app(entered, "running", running=True)),
        "idle": SimpleNamespace(app=_app(entered, "idle", running=False)),
    }
    monkeypatch.setattr(a2a, "_a2a_agents", agents)

    asyncio.run(a2a.start_a2a_task_managers())

    assert entered == ["idle"]
    assert not hasattr(agents["running"].app, "_lifespan_context")
    assert hasattr(agents["idle"].app, "_lifespan_context")

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's sandbox never starts on the event loop.

Starting a Jupyter server sandbox takes seconds. Started inside an async
route, it held the event loop for that long: the runtime answered nothing,
not even its readiness probe. These tests use the real
:class:`CodeSandboxManager` and a real ``code_sandboxes`` sandbox whose start
is slowed down, and watch the loop with a ticker while the start happens.
"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any, Iterator

import pytest
from code_sandboxes.sandboxes.eval.eval import EvalSandbox

from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
from agent_runtimes.services import code_sandbox_manager as manager_module
from agent_runtimes.services.code_sandbox_manager import CodeSandboxManager

# Reuse the creation fixture and request double of the creation tests.
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401
    _DummyRequest,
    creation_spy,
)

START_SECONDS = 0.6
# The loop must keep turning: no gap between two ticks may come near the start.
MAX_TICK_GAP = START_SECONDS / 3


class _SlowSandbox(EvalSandbox):
    """A real sandbox whose start takes as long as a Jupyter server's (scaled)."""

    starts = 0
    starts_lock = threading.Lock()

    def start(self) -> None:
        if self._started:
            return
        with _SlowSandbox.starts_lock:
            _SlowSandbox.starts += 1
        time.sleep(START_SECONDS)
        super().start()


@pytest.fixture
def manager(monkeypatch: pytest.MonkeyPatch) -> Iterator[CodeSandboxManager]:
    """A fresh real manager whose sandboxes are slow to start.

    Yields
    ------
    CodeSandboxManager
        The manager, its agent sandboxes stopped after the test.
    """
    monkeypatch.delenv("DATALAYER_RUNTIME_JUPYTER_SIDECAR", raising=False)
    # A started sandbox writes its variant into the environment: give it back.
    monkeypatch.setenv("DATALAYER_CODE_SANDBOX_VARIANT", "eval")
    _SlowSandbox.starts = 0
    made = CodeSandboxManager()
    monkeypatch.setattr(made, "_create_sandbox", lambda variant=None: _SlowSandbox())
    monkeypatch.setattr(manager_module, "get_code_sandbox_manager", lambda: made)
    yield made
    made.stop_all_agent_sandboxes()


async def _ticking(work: Any) -> float:
    """Run *work* while a ticker runs on the same loop; answer the widest gap."""
    gaps: list[float] = []
    done = asyncio.Event()

    async def ticker() -> None:
        last = time.monotonic()
        while not done.is_set():
            await asyncio.sleep(0.01)
            now = time.monotonic()
            gaps.append(now - last)
            last = now

    task = asyncio.create_task(ticker())
    try:
        await work
    finally:
        done.set()
        await task
    return max(gaps) if gaps else float("inf")


@pytest.mark.asyncio
async def test_creating_a_jupyter_agent_keeps_the_loop_answering(
    manager: CodeSandboxManager,
    creation_spy: dict[str, object],  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    handed: dict[str, Any] = {}

    def _capture_build(*_args: object, sandbox: Any = None, **_kwargs: object) -> Any:
        handed["sandbox"] = sandbox
        return object()

    monkeypatch.setattr(agents_route, "_build_codemode_toolset", _capture_build)

    request = CreateAgentRequest(
        name="Slow Sandbox Agent",
        sandbox_variant="jupyter-server",
        enable_codemode=False,
    )

    widest = await _ticking(create_agent(request, _DummyRequest()))

    assert widest < MAX_TICK_GAP, (
        f"the event loop stood still {widest:.2f}s while the sandbox started"
    )
    # One sandbox for the agent, started once, and the toolset holds the
    # agent's proxy rather than the raw sandbox.
    assert _SlowSandbox.starts == 1
    assert manager.get_agent_sandbox("slow-sandbox-agent") is not None
    assert handed["sandbox"]._agent_id == "slow-sandbox-agent"


@pytest.mark.asyncio
async def test_first_async_runs_start_the_sandbox_once_off_the_loop(
    manager: CodeSandboxManager,
) -> None:
    proxy = manager.get_agent_managed_sandbox("a1", variant="jupyter-server")
    assert manager.get_agent_sandbox("a1") is None

    async def two_first_runs() -> tuple[Any, Any]:
        return await asyncio.gather(
            proxy.run_code_async("x = 1"),
            proxy.run_code_async("y = 2"),
        )

    widest = await _ticking(two_first_runs())

    assert widest < MAX_TICK_GAP, (
        f"the event loop stood still {widest:.2f}s while the sandbox started"
    )
    assert _SlowSandbox.starts == 1
    assert manager.get_agent_sandbox("a1") is not None


@pytest.mark.asyncio
async def test_start_async_starts_off_the_loop(manager: CodeSandboxManager) -> None:
    proxy = manager.get_agent_managed_sandbox("a2", variant="jupyter-server")

    widest = await _ticking(proxy.start_async())

    assert widest < MAX_TICK_GAP
    assert _SlowSandbox.starts == 1


def test_two_threads_first_runs_start_one_sandbox(
    manager: CodeSandboxManager,
) -> None:
    proxy = manager.get_agent_managed_sandbox("a3", variant="jupyter-server")
    errors: list[BaseException] = []

    def first_run() -> None:
        try:
            proxy.run_code("z = 3")
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=first_run) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert _SlowSandbox.starts == 1


def test_a_proxy_makes_the_sandbox_of_the_agent_variant(
    manager: CodeSandboxManager,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    made: list[str | None] = []

    def create(variant: str | None = None) -> _SlowSandbox:
        made.append(variant)
        return _SlowSandbox()

    monkeypatch.setattr(manager, "_create_sandbox", create)
    manager.configure(variant="eval")
    proxy = manager.get_agent_managed_sandbox("a4", variant="jupyter-server")

    proxy.start()

    assert made == ["jupyter-server"]

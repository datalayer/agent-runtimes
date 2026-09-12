# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A runtime that was booked is given back, however the start went.

Written after nine runtimes were found alive on the shared test account, all of
them named by tests. `_start` books the runtime first and connects to it
second; `_stop` used to terminate it only when there was a client to stop, and
`__enter__` re-raised without cleaning up — and Python does not call `__exit__`
when `__enter__` raises. So every failure to connect burned a slot in the
environment for good, which made the next start likelier to fail and the one
after that certain to. The suite exhausted its own capacity.

These use a fake runtimes API rather than the cloud: what is under test is
which calls are made, and that is exactly what a live account cannot show
deterministically.
"""

from __future__ import annotations

from typing import Any

import pytest

from agent_runtimes.runtimes.runtime_service import RuntimeService


class _FakeRuntimes:
    """Records terminations, and can be told to refuse one."""

    def __init__(self, succeed: bool = True) -> None:
        self.stopped: list[str] = []
        self._succeed = succeed

    def stop(self, runtime_name: str) -> dict[str, Any]:
        self.stopped.append(runtime_name)
        return (
            {"success": True}
            if self._succeed
            else {"success": False, "message": "nope"}
        )


class _FakeClient:
    """A sandbox client, optionally one that will not shut down."""

    def __init__(self, raises: bool = False) -> None:
        self.raises = raises
        self.stopped = False

    def stop(self) -> None:
        if self.raises:
            raise RuntimeError("the client is wedged")
        self.stopped = True


class _Service(RuntimeService):
    """`RuntimeService` with its `runtimes` client injectable.

    The real one is a read-only property built from credentials; these tests
    are about which calls `_stop` makes, so the client is the thing to stand
    in for.
    """

    runtimes: Any = None  # type: ignore[assignment]


def _service(**model: Any) -> RuntimeService:
    """A service with its model pre-set, without touching the network."""
    service = _Service.__new__(_Service)
    service._model = type("_Model", (), {})()
    service._model.sandbox_client = None
    service._model.kernel_id = None
    service._model.runtime_name = None
    for key, value in model.items():
        setattr(service._model, key, value)
    return service


class TestStopGivesTheRuntimeBack:
    def test_terminates_a_runtime_that_never_connected(self):
        # The failure that caused the leak: booked, never reached.
        runtimes = _FakeRuntimes()
        service = _service(runtime_name="runtime-1")
        service.runtimes = runtimes

        assert service._stop() is True
        assert runtimes.stopped == ["runtime-1"]

    def test_terminates_a_runtime_that_did_connect(self):
        runtimes = _FakeRuntimes()
        client = _FakeClient()
        service = _service(runtime_name="runtime-2", sandbox_client=client)
        service.runtimes = runtimes

        assert service._stop() is True
        assert client.stopped is True
        assert runtimes.stopped == ["runtime-2"]

    def test_terminates_even_when_the_client_will_not_stop(self):
        # A client that cannot be shut down is not a reason to keep paying for
        # the runtime behind it.
        runtimes = _FakeRuntimes()
        service = _service(
            runtime_name="runtime-3", sandbox_client=_FakeClient(raises=True)
        )
        service.runtimes = runtimes

        assert service._stop() is True
        assert runtimes.stopped == ["runtime-3"]

    def test_does_not_terminate_twice(self):
        runtimes = _FakeRuntimes()
        service = _service(runtime_name="runtime-4")
        service.runtimes = runtimes

        service._stop()
        service._stop()

        assert runtimes.stopped == ["runtime-4"]

    def test_reports_a_refused_termination(self):
        runtimes = _FakeRuntimes(succeed=False)
        service = _service(runtime_name="runtime-5")
        service.runtimes = runtimes

        assert service._stop() is False
        assert runtimes.stopped == ["runtime-5"]

    def test_nothing_booked_means_nothing_to_give_back(self):
        runtimes = _FakeRuntimes()
        service = _service()
        service.runtimes = runtimes

        assert service._stop() is False
        assert runtimes.stopped == []


class TestEnterCleansUpAfterItself:
    def test_a_failed_start_gives_the_runtime_back(self, monkeypatch):
        runtimes = _FakeRuntimes()
        service = _service()
        service.runtimes = runtimes

        def _start_that_books_then_fails() -> None:
            # Exactly what `_start` does: reserve, then fail to connect.
            service._model.runtime_name = "runtime-6"
            raise RuntimeError("Failed to start code sandbox client")

        monkeypatch.setattr(service, "_start", _start_that_books_then_fails)

        with pytest.raises(RuntimeError, match="code sandbox client"):
            with service:
                pass

        # `__exit__` never runs when `__enter__` raises, so this is the only
        # place the slot can be handed back.
        assert runtimes.stopped == ["runtime-6"]

    def test_a_start_that_books_nothing_terminates_nothing(self, monkeypatch):
        runtimes = _FakeRuntimes()
        service = _service()
        service.runtimes = runtimes
        monkeypatch.setattr(
            service, "_start", lambda: (_ for _ in ()).throw(RuntimeError("no quota"))
        )

        with pytest.raises(RuntimeError, match="no quota"):
            with service:
                pass

        assert runtimes.stopped == []

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for sandbox interrupt and execution status features."""

import asyncio
import sys
import types
from typing import Any, AsyncGenerator

import pytest

from agent_runtimes.services.code_sandbox_manager import (
    CodeSandboxManager,
    ManagedSandbox,
)


class DummySandbox:
    """Minimal sandbox that tracks is_executing and interrupt calls."""

    def __init__(self, executing: bool = False) -> None:
        self._started = True
        self._executing = executing
        self.interrupt_called = False
        self._namespaces: dict[str, dict[str, object]] = {}  # marks as eval-like

    @property
    def is_executing(self) -> bool:
        return self._executing

    def interrupt(self) -> bool:
        if not self._executing:
            return False
        self.interrupt_called = True
        self._executing = False
        return True

    async def run_code_streaming_async(
        self, *args: Any, **kwargs: Any
    ) -> AsyncGenerator[str, None]:
        _ = (args, kwargs)
        for item in ["a", "b", "c"]:
            await asyncio.sleep(0)
            yield item


class TestManagedSandboxInterrupt:
    """Tests for ManagedSandbox.is_executing and interrupt()."""

    def _make_manager_with_sandbox(self, sandbox: Any) -> CodeSandboxManager:
        manager = CodeSandboxManager()
        manager._sandbox = sandbox
        return manager

    def test_is_executing_delegates_to_sandbox(self) -> None:
        sandbox = DummySandbox(executing=True)
        manager = self._make_manager_with_sandbox(sandbox)
        managed = ManagedSandbox(manager)
        assert managed.is_executing is True

    def test_is_executing_false_when_idle(self) -> None:
        sandbox = DummySandbox(executing=False)
        manager = self._make_manager_with_sandbox(sandbox)
        managed = ManagedSandbox(manager)
        assert managed.is_executing is False

    def test_is_executing_false_when_no_sandbox(self) -> None:
        manager = CodeSandboxManager()
        managed = ManagedSandbox(manager)
        assert managed.is_executing is False

    def test_interrupt_delegates_to_sandbox(self) -> None:
        sandbox = DummySandbox(executing=True)
        manager = self._make_manager_with_sandbox(sandbox)
        managed = ManagedSandbox(manager)
        result = managed.interrupt()
        assert result is True
        assert sandbox.interrupt_called is True
        assert sandbox.is_executing is False

    def test_interrupt_returns_false_when_idle(self) -> None:
        sandbox = DummySandbox(executing=False)
        manager = self._make_manager_with_sandbox(sandbox)
        managed = ManagedSandbox(manager)
        result = managed.interrupt()
        assert result is False

    def test_interrupt_returns_false_when_no_sandbox(self) -> None:
        manager = CodeSandboxManager()
        managed = ManagedSandbox(manager)
        result = managed.interrupt()
        assert result is False

    @pytest.mark.asyncio
    async def test_run_code_streaming_async_yields_items(self) -> None:
        sandbox = DummySandbox(executing=False)
        manager = self._make_manager_with_sandbox(sandbox)
        managed = ManagedSandbox(manager)

        observed = []
        async for item in managed.run_code_streaming_async("print('hi')"):
            observed.append(item)

        assert observed == ["a", "b", "c"]


class TestSandboxStatusEndpoint:
    """Tests for the /sandbox/interrupt configure endpoint and SandboxStatus model."""

    def test_sandbox_status_model_has_is_executing(self) -> None:
        from agent_runtimes.routes.configure import SandboxStatus

        status = SandboxStatus(
            variant="eval",
            sandbox_running=True,
            is_executing=True,
        )
        assert status.is_executing is True

    def test_sandbox_status_model_default_not_executing(self) -> None:
        from agent_runtimes.routes.configure import SandboxStatus

        status = SandboxStatus(variant="eval")
        assert status.is_executing is False


class TestCodeSandboxManagerSidecarGuard:
    """Tests for sidecar-specific sandbox safety behavior."""

    def test_jupyter_without_url_raises_in_sidecar(self, monkeypatch: Any) -> None:
        manager = CodeSandboxManager()
        manager.configure(variant="jupyter-server", jupyter_url=None)
        monkeypatch.setenv("DATALAYER_RUNTIME_JUPYTER_SIDECAR", "true")

        with pytest.raises(
            ValueError,
            match="requires jupyter_url",
        ):
            manager._create_sandbox()

    @staticmethod
    def _fake_client(monkeypatch: Any, created: list[dict[str, Any]]) -> Any:
        """A `code_sandboxes` whose client records what it was asked to create."""

        class DummySandbox:
            pass

        class DummyClient:
            def __init__(self) -> None:
                self.sandbox = DummySandbox()

            @classmethod
            def create(cls, *, variant: str, **options: Any) -> "DummyClient":
                created.append({"variant": variant, **options})
                return cls()

        fake_package = types.ModuleType("code_sandboxes")
        fake_package.CodeSandboxClient = DummyClient  # type: ignore[attr-defined]
        monkeypatch.setitem(sys.modules, "code_sandboxes", fake_package)
        return DummySandbox

    def test_jupyter_without_url_allowed_outside_sidecar(
        self, monkeypatch: Any
    ) -> None:
        """Without a URL, `code_sandboxes` starts its own Jupyter server."""
        manager = CodeSandboxManager()
        manager.configure(variant="jupyter-server", jupyter_url=None)
        monkeypatch.delenv("DATALAYER_RUNTIME_JUPYTER_SIDECAR", raising=False)
        created: list[dict[str, Any]] = []
        dummy_sandbox = self._fake_client(monkeypatch, created)

        sandbox = manager._create_sandbox()

        assert isinstance(sandbox, dummy_sandbox)
        assert created == [{"variant": "jupyter-server"}]

    def test_jupyter_with_url_goes_through_the_client(self, monkeypatch: Any) -> None:
        manager = CodeSandboxManager()
        manager.configure(
            variant="jupyter-server",
            jupyter_url="http://localhost:8888",
            jupyter_token="MY_TOKEN",
        )
        created: list[dict[str, Any]] = []
        dummy_sandbox = self._fake_client(monkeypatch, created)

        sandbox = manager._create_sandbox()

        assert isinstance(sandbox, dummy_sandbox)
        assert created == [
            {
                "variant": "jupyter-server",
                "server_url": "http://localhost:8888",
                "token": "MY_TOKEN",
            }
        ]

    def test_every_variant_goes_through_the_client(self, monkeypatch: Any) -> None:
        """No variant reaches for an adapter: `eval` included.

        `code_sandboxes.eval_sandbox` and `code_sandboxes.jupyter_server_sandbox`
        were imported directly when the package looked incomplete, which bound
        this module to the adapters the provider boundary keeps services out
        of. A package without the client has no adapters either.
        """
        manager = CodeSandboxManager()
        created: list[dict[str, Any]] = []
        self._fake_client(monkeypatch, created)

        manager._create_sandbox(variant="eval")
        manager._create_sandbox(variant="modal")

        assert [item["variant"] for item in created] == ["eval", "modal"]

    def test_a_package_without_the_client_is_an_import_error(
        self, monkeypatch: Any
    ) -> None:
        manager = CodeSandboxManager()
        monkeypatch.setitem(sys.modules, "code_sandboxes", types.ModuleType("code_sandboxes"))

        with pytest.raises(ImportError):
            manager._create_sandbox(variant="eval")

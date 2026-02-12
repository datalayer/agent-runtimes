# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for sandbox interrupt and execution status features."""

from typing import Any

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
        self._namespaces: dict[str, dict[str, object]] = {}  # marks as local-eval-like

    @property
    def is_executing(self) -> bool:
        return self._executing

    def interrupt(self) -> bool:
        if not self._executing:
            return False
        self.interrupt_called = True
        self._executing = False
        return True


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


class TestSandboxStatusEndpoint:
    """Tests for the /sandbox-status and /sandbox/interrupt configure endpoints."""

    def test_sandbox_status_model_has_is_executing(self) -> None:
        from agent_runtimes.routes.configure import SandboxStatus

        status = SandboxStatus(
            variant="local-eval",
            sandbox_running=True,
            is_executing=True,
        )
        assert status.is_executing is True

    def test_sandbox_status_model_default_not_executing(self) -> None:
        from agent_runtimes.routes.configure import SandboxStatus

        status = SandboxStatus(variant="local-eval")
        assert status.is_executing is False

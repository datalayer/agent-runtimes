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


class TestSandboxStatusCarriesConnectionDetails:
    """What a browser needs to reach the sandbox it is being told about.

    The editors of the LOOP workspace connect to the sandbox's Jupyter server
    directly. Reporting the URL and withholding the token told them where to go
    and not how to get in: every request came back 403, and because Jupyter
    rejects a cross-origin write before attaching CORS headers, the browser
    reported a missing `Access-Control-Allow-Origin` instead — two messages,
    neither naming the cause. A cell ran and produced nothing.
    """

    def test_the_model_carries_the_token_and_kernel(self):
        from agent_runtimes.routes.configure import SandboxStatus

        status = SandboxStatus(
            variant="jupyter-server",
            jupyter_url="http://127.0.0.1:42233",
            jupyter_token="secret",
            kernel_id="k-1",
            kernel_name="python3",
        )

        assert status.jupyter_token == "secret"
        assert status.kernel_id == "k-1"
        assert status.kernel_name == "python3"

    def test_they_are_optional_for_a_sandbox_that_has_none(self):
        from agent_runtimes.routes.configure import SandboxStatus

        status = SandboxStatus(variant="eval")

        assert status.jupyter_token is None
        assert status.kernel_id is None

    def test_the_manager_reports_them_for_the_model_to_carry(self):
        """The two halves have to agree, or the field is plumbed to nothing."""
        from agent_runtimes.routes.configure import SandboxStatus
        from agent_runtimes.services.code_sandbox_manager import (
            get_code_sandbox_manager,
        )

        reported = set(get_code_sandbox_manager().get_status())
        carried = set(SandboxStatus.model_fields)

        # Every connection detail the manager knows reaches the model. Named
        # explicitly rather than comparing whole key sets: the manager also
        # reports things a browser has no business with.
        for field in ("jupyter_url", "jupyter_token", "kernel_id", "kernel_name"):
            assert field in reported, f"{field} is not reported by the manager"
            assert field in carried, f"{field} is not carried by SandboxStatus"


class TestSandboxWebSocketStatus:
    """The payload the browser actually receives.

    Written because the previous fix went to the wrong place. `SandboxStatus`
    is the REST model; the workspace reads its sandbox over
    `/configure/sandbox/ws`, which builds its own dict — so adding a field to
    the model changed nothing the browser could see, and the editors went on
    connecting to a tokened server with no token.
    """

    def test_carries_the_token_and_kernel_beside_the_url(self):
        from agent_runtimes.routes.configure import _build_sandbox_ws_status

        payload = _build_sandbox_ws_status()

        # Present as keys whatever their values: a sandbox that is not running
        # reports None, and the browser has to be able to tell "no token" from
        # "this server never mentions tokens".
        for field in ("jupyter_url", "jupyter_token", "kernel_id", "kernel_name"):
            assert field in payload, f"{field} is missing from the WS payload"

    def test_reports_what_the_manager_knows(self, monkeypatch):
        from agent_runtimes.routes import configure
        from agent_runtimes.services import code_sandbox_manager

        class _Manager:
            def get_status(self):
                return {
                    "variant": "jupyter-server",
                    "sandbox_running": True,
                    "jupyter_url": "http://127.0.0.1:42489",
                    "jupyter_token": "secret",
                    "kernel_id": "k-1",
                    "kernel_name": "python3",
                }

            _sandbox = None

        monkeypatch.setattr(
            code_sandbox_manager, "get_code_sandbox_manager", lambda: _Manager()
        )

        payload = configure._build_sandbox_ws_status()

        assert payload["jupyter_url"] == "http://127.0.0.1:42489"
        assert payload["jupyter_token"] == "secret"
        assert payload["kernel_id"] == "k-1"

    def test_the_rest_model_and_the_socket_agree(self):
        """Two builders, one contract — the split is what caused this bug."""
        from agent_runtimes.routes.configure import (
            SandboxStatus,
            _build_sandbox_ws_status,
        )

        over_the_socket = set(_build_sandbox_ws_status())
        over_rest = set(SandboxStatus.model_fields)

        for field in ("jupyter_url", "jupyter_token", "kernel_id", "kernel_name"):
            assert field in over_the_socket, f"{field} not sent over the socket"
            assert field in over_rest, f"{field} not served over REST"


class TestRestartCoversEverySandbox:
    """Switching where code runs must not leave the old sandbox advertised.

    The status WebSocket reports the *agent's* sandbox when a caller asks about
    an agent, but `restart()` only replaced the global one. So switching the
    workspace from Browser to Local built a fresh global sandbox and went on
    handing the browser the old agent sandbox's address — a port that was dead
    or about to be. The notebook polled it forever.
    """

    def test_restart_stops_the_agent_sandboxes_too(self, monkeypatch):
        from agent_runtimes.services.code_sandbox_manager import CodeSandboxManager

        manager = CodeSandboxManager.__new__(CodeSandboxManager)
        calls: list[str] = []
        monkeypatch.setattr(manager, "stop", lambda: calls.append("global"))
        monkeypatch.setattr(
            manager, "stop_all_agent_sandboxes", lambda: calls.append("agents")
        )
        monkeypatch.setattr(
            manager, "get_sandbox", lambda: calls.append("create") or "sandbox"
        )

        assert manager.restart() == "sandbox"

        # Both stopped before anything is built, so the new sandbox is the only
        # one alive when the next status goes out.
        assert calls == ["global", "agents", "create"]


class TestEnsureAgentSandbox:
    """An agent can outlive its sandbox, and must be able to get one back.

    `restart()` stops the per-agent sandboxes because they were built under the
    previous configuration. Without a way to ask for one back, coming back to a
    target that reuses an existing agent found the agent alive and nothing
    behind it: no kernel, no Jupyter URL, and a workspace that looked dead.
    """

    def test_the_route_exists_and_takes_an_agent(self):
        from agent_runtimes.routes.agents import router

        routes = {
            (route.path, frozenset(route.methods))
            for route in router.routes
            if hasattr(route, "methods")
        }
        assert ("/agents/{agent_id}/sandbox/ensure", frozenset({"POST"})) in routes

    def test_creates_a_sandbox_when_the_agent_has_none(self, monkeypatch):
        import asyncio

        from agent_runtimes.routes import agents as agents_routes
        from agent_runtimes.services import code_sandbox_manager

        created: list[tuple[str, str]] = []

        class _Manager:
            def get_agent_sandbox(self, agent_id):
                return None

            def create_agent_sandbox(self, agent_id, variant):
                created.append((agent_id, variant))

            def get_status(self):
                return {"variant": "jupyter-server", "sandbox_running": True}

        monkeypatch.setattr(
            code_sandbox_manager, "get_code_sandbox_manager", lambda: _Manager()
        )

        asyncio.run(agents_routes.ensure_agent_sandbox("a1"))

        assert created == [("a1", "jupyter-server")]

    def test_leaves_an_agent_that_already_has_one_alone(self, monkeypatch):
        import asyncio

        from agent_runtimes.routes import agents as agents_routes
        from agent_runtimes.services import code_sandbox_manager

        created: list[str] = []

        class _Manager:
            def get_agent_sandbox(self, agent_id):
                return object()

            def create_agent_sandbox(self, agent_id, variant):
                created.append(agent_id)

            def get_status(self):
                return {"variant": "jupyter-server", "sandbox_running": True}

        monkeypatch.setattr(
            code_sandbox_manager, "get_code_sandbox_manager", lambda: _Manager()
        )

        asyncio.run(agents_routes.ensure_agent_sandbox("a1"))

        # Idempotent: selecting Local twice must not build a second sandbox.
        assert created == []

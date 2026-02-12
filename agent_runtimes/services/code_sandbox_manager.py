# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""
Code Sandbox Manager for Agent Runtimes.

This module provides a centralized manager for code sandbox instances,
allowing runtime configuration of the sandbox variant (local-eval or local-jupyter).

It also provides :class:`ManagedSandbox`, a transparent proxy that
delegates every call to the manager's current sandbox.  All consumers
(CodemodeToolset, SandboxExecutor, …) should receive a ``ManagedSandbox``
instead of a concrete sandbox so that when the manager is reconfigured
(e.g. switching from ``local-eval`` to ``local-jupyter`` via the
``/mcp-servers/start`` API), every component automatically uses the
new sandbox without being rebuilt.

Usage:
    from agent_runtimes.services.code_sandbox_manager import (
        get_code_sandbox_manager,
        CodeSandboxManager,
    )

    # Get the singleton manager
    manager = get_code_sandbox_manager()

    # Configure for Jupyter sandbox
    manager.configure(
        variant="local-jupyter",
        jupyter_url="http://localhost:8888",
        jupyter_token="my-token",
    )

    # Get a managed proxy — safe to hold long-term
    sandbox = manager.get_managed_sandbox()
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from threading import Lock
from typing import TYPE_CHECKING, Any, Literal, Optional
from urllib.parse import parse_qs, urlparse

if TYPE_CHECKING:
    from code_sandboxes import ExecutionResult, Sandbox

logger = logging.getLogger(__name__)


SandboxVariant = Literal["local-eval", "local-jupyter"]


@dataclass
class SandboxConfig:
    """
    Configuration for the code sandbox.

    Attributes:
        variant: The sandbox variant to use.
        jupyter_url: The Jupyter server URL (only for local-jupyter variant).
        jupyter_token: The Jupyter server token (only for local-jupyter variant).
        mcp_proxy_url: The MCP tool proxy URL for two-container setups.
            When set, remote sandboxes will call tools via HTTP to this URL
            instead of trying to use stdio MCP processes directly.

            Example for local dev: "http://localhost:8765/api/v1/mcp/proxy"
            Example for K8s: "http://agent-runtimes:8765/api/v1/mcp/proxy"
    """

    variant: SandboxVariant = "local-eval"
    jupyter_url: str | None = None
    jupyter_token: str | None = None
    mcp_proxy_url: str | None = None
    env_vars: dict[str, str] | None = None


class ManagedSandbox:
    """
    Transparent proxy that always delegates to the manager's current sandbox.

    When the :class:`CodeSandboxManager` is reconfigured (e.g. switching
    from ``local-eval`` to ``local-jupyter``), the proxy automatically
    picks up the new sandbox.  Consumers that hold a reference to this
    proxy never need to be rebuilt or notified.

    This class implements the same interface as :class:`code_sandboxes.Sandbox`
    so it is a drop-in replacement everywhere a ``Sandbox`` is expected
    (``CodemodeToolset``, ``SandboxExecutor``, etc.).
    """

    def __init__(self, manager: CodeSandboxManager) -> None:
        # Use object.__setattr__ to avoid triggering our __setattr__ override
        # before _manager is available.
        object.__setattr__(self, "_manager", manager)

    # -- Transparent attribute forwarding --------------------------------

    def __getattr__(self, name: str) -> Any:
        """
        Forward any attribute not found on the proxy to the current sandbox.

        This catches attributes like ``_default_context``, ``config``,
        ``_started``, ``_tool_caller``, ``_tags``, ``_namespaces``,
        ``_execution_count``, etc. that the concrete sandbox sets in its
        ``__init__`` / ``start()`` and that consumers access directly.

        ``__getattr__`` is only called when normal lookup fails, so explicit
        methods and properties defined on this class take precedence.
        """
        return getattr(self._sandbox(), name)

    def __setattr__(self, name: str, value: Any) -> None:
        """
        Forward attribute writes to the current sandbox.

        Attributes that belong to the proxy itself (``_manager``) are stored
        on the proxy; everything else is forwarded.
        """
        if name == "_manager":
            object.__setattr__(self, name, value)
        else:
            setattr(self._sandbox(), name, value)

    # -- helpers ---------------------------------------------------------

    def _sandbox(self) -> Sandbox:
        """Return the manager's current (started) sandbox."""
        return self._manager.get_sandbox()

    # -- Sandbox interface -----------------------------------------------

    def start(self) -> None:
        # get_sandbox() already starts the sandbox if needed
        self._sandbox()

    async def start_async(self) -> None:
        self._sandbox()

    def stop(self) -> None:
        # Stopping is managed by the manager — not by individual consumers
        pass

    async def stop_async(self) -> None:
        pass

    def run_code(
        self,
        code: str,
        language: str = "python",
        context: Optional[Any] = None,
        on_stdout: Any = None,
        on_stderr: Any = None,
        on_result: Any = None,
        on_error: Any = None,
        envs: Optional[dict[str, str]] = None,
        timeout: Optional[float] = None,
    ) -> ExecutionResult:
        kwargs: dict[str, Any] = {"language": language}
        if context is not None:
            kwargs["context"] = context
        if on_stdout is not None:
            kwargs["on_stdout"] = on_stdout
        if on_stderr is not None:
            kwargs["on_stderr"] = on_stderr
        if on_result is not None:
            kwargs["on_result"] = on_result
        if on_error is not None:
            kwargs["on_error"] = on_error
        if envs is not None:
            kwargs["envs"] = envs
        if timeout is not None:
            kwargs["timeout"] = timeout
        return self._sandbox().run_code(code, **kwargs)

    async def run_code_async(
        self,
        code: str,
        language: str = "python",
        context: Optional[Any] = None,
        on_stdout: Any = None,
        on_stderr: Any = None,
        on_result: Any = None,
        on_error: Any = None,
        envs: Optional[dict[str, str]] = None,
        timeout: Optional[float] = None,
    ) -> ExecutionResult:
        kwargs: dict[str, Any] = {"language": language}
        if context is not None:
            kwargs["context"] = context
        if on_stdout is not None:
            kwargs["on_stdout"] = on_stdout
        if on_stderr is not None:
            kwargs["on_stderr"] = on_stderr
        if on_result is not None:
            kwargs["on_result"] = on_result
        if on_error is not None:
            kwargs["on_error"] = on_error
        if envs is not None:
            kwargs["envs"] = envs
        if timeout is not None:
            kwargs["timeout"] = timeout
        return await self._sandbox().run_code_async(code, **kwargs)

    def run_code_streaming(
        self,
        code: str,
        language: str = "python",
        context: Optional[Any] = None,
        envs: Optional[dict[str, str]] = None,
        timeout: Optional[float] = None,
    ) -> Iterator[Any]:
        return self._sandbox().run_code_streaming(
            code, language=language, context=context, envs=envs, timeout=timeout
        )

    async def run_code_streaming_async(
        self,
        code: str,
        language: str = "python",
        context: Optional[Any] = None,
        envs: Optional[dict[str, str]] = None,
        timeout: Optional[float] = None,
    ) -> AsyncIterator[Any]:
        return await self._sandbox().run_code_streaming_async(
            code, language=language, context=context, envs=envs, timeout=timeout
        )

    def create_context(self, name: Optional[str] = None) -> Any:
        return self._sandbox().create_context(name=name)

    def get_variable(self, name: str, context: Optional[Any] = None) -> Any:
        return self._sandbox().get_variable(name, context=context)

    def set_variable(
        self, name: str, value: Any, context: Optional[Any] = None
    ) -> None:
        self._sandbox().set_variable(name, value, context=context)

    def set_variables(
        self, variables: dict[str, Any], context: Optional[Any] = None
    ) -> None:
        self._sandbox().set_variables(variables, context=context)

    def install_packages(
        self, packages: list[str], timeout: Optional[float] = None
    ) -> Any:
        return self._sandbox().install_packages(packages, timeout=timeout)

    def upload_file(self, local_path: str, remote_path: str) -> None:
        self._sandbox().upload_file(local_path, remote_path)

    def download_file(self, remote_path: str, local_path: str) -> None:
        self._sandbox().download_file(remote_path, local_path)

    def register_tool_caller(self, tool_caller: Any) -> None:
        self._sandbox().register_tool_caller(tool_caller)

    def set_tags(self, tags: dict[str, str]) -> None:
        self._sandbox().set_tags(tags)

    # -- Properties that consumers might inspect -------------------------

    @property
    def is_started(self) -> bool:
        return self._manager._sandbox is not None

    @property
    def is_executing(self) -> bool:
        """Check if the sandbox is currently executing code."""
        if not self.is_started:
            return False
        return self._sandbox().is_executing

    def interrupt(self) -> bool:
        """Interrupt the currently running code."""
        if not self.is_started:
            return False
        return self._sandbox().interrupt()

    @property
    def info(self) -> Any:
        return self._sandbox().info if self.is_started else None

    @property
    def sandbox_id(self) -> Optional[str]:
        return self._sandbox().sandbox_id if self.is_started else None

    # NOTE: _server_url, _namespaces, _default_context, and other
    # variant-specific attributes are intentionally NOT defined as
    # explicit properties here.  They are handled by __getattr__ which
    # delegates to the underlying sandbox.  This is critical because
    # consumers (e.g. CodeModeExecutor) use ``hasattr(sandbox, '_namespaces')``
    # to decide the execution path.  An explicit property would always
    # make ``hasattr`` return True (even when the underlying sandbox
    # doesn't have the attribute), causing the wrong code-path to be taken.

    # -- Context-manager support -----------------------------------------

    def __enter__(self) -> ManagedSandbox:
        self.start()
        return self

    def __exit__(self, *args: Any) -> None:
        self.stop()

    async def __aenter__(self) -> ManagedSandbox:
        await self.start_async()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.stop_async()

    # -- repr / str ------------------------------------------------------

    def __repr__(self) -> str:
        variant = self._manager.variant
        has_sandbox = self._manager._sandbox is not None
        return f"<ManagedSandbox variant={variant} active={has_sandbox}>"


class CodeSandboxManager:
    """
    Manages the lifecycle of code sandbox instances.

    This manager provides:
    - Singleton pattern for global access
    - Runtime configuration of sandbox variant
    - Thread-safe sandbox creation and access
    - Automatic sandbox lifecycle management (start/stop)

    The manager supports two sandbox variants:
    - local-eval: Uses Python exec() for code execution (default)
    - local-jupyter: Connects to a Jupyter server for persistent kernel state
    """

    _instance: CodeSandboxManager | None = None
    _lock: Lock = Lock()

    def __init__(self) -> None:
        """Initialize the manager with default configuration."""
        self._config = SandboxConfig()
        self._sandbox: Sandbox | None = None
        self._sandbox_lock = Lock()

    @classmethod
    def get_instance(cls) -> CodeSandboxManager:
        """
        Get the singleton instance of the manager.

        Returns:
            The CodeSandboxManager singleton instance.
        """
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """
        Reset the singleton instance (primarily for testing).

        This stops any running sandbox and clears the instance.
        """
        with cls._lock:
            if cls._instance is not None:
                cls._instance.stop()
                cls._instance = None

    @property
    def config(self) -> SandboxConfig:
        """Get the current sandbox configuration."""
        return self._config

    @property
    def variant(self) -> SandboxVariant:
        """Get the current sandbox variant."""
        return self._config.variant

    @property
    def is_jupyter(self) -> bool:
        """Check if the current variant is Jupyter-based."""
        return self._config.variant == "local-jupyter"

    def configure(
        self,
        variant: SandboxVariant | None = None,
        jupyter_url: str | None = None,
        jupyter_token: str | None = None,
        mcp_proxy_url: str | None = None,
        env_vars: dict[str, str] | None = None,
    ) -> None:
        """
        Configure the sandbox settings.

        If the sandbox is running and the variant changes, the existing
        sandbox will be stopped and a new one will be created on next access.

        Args:
            variant: The sandbox variant to use. If None, keeps current.
            jupyter_url: The Jupyter server URL. Can include token as query param.
            jupyter_token: The Jupyter server token. Overrides token in URL.
            mcp_proxy_url: The MCP tool proxy URL for two-container setups.
                When set, remote sandboxes will call tools via HTTP to this URL.
            env_vars: Environment variables to inject into the sandbox.
                For local-jupyter, these are set in the Jupyter kernel's
                os.environ so that executed code can access them (e.g. API keys).
        """
        with self._sandbox_lock:
            old_variant = self._config.variant

            # Parse jupyter_url if it contains a token query parameter
            if jupyter_url:
                parsed = urlparse(jupyter_url)
                query_params = parse_qs(parsed.query)

                # Extract token from URL if present
                url_token = query_params.get("token", [None])[0]

                # Use explicit token if provided, otherwise use URL token
                final_token = jupyter_token if jupyter_token else url_token

                # Reconstruct URL without token query param
                clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                if clean_url.endswith("/"):
                    clean_url = clean_url[:-1]

                self._config.jupyter_url = clean_url
                self._config.jupyter_token = final_token
            elif jupyter_token is not None:
                self._config.jupyter_token = jupyter_token

            if variant is not None:
                self._config.variant = variant

            # Set MCP proxy URL if provided
            if mcp_proxy_url is not None:
                self._config.mcp_proxy_url = mcp_proxy_url

            # Store env vars for injection into the sandbox after start
            if env_vars is not None:
                if self._config.env_vars is None:
                    self._config.env_vars = {}
                self._config.env_vars.update(env_vars)

            # If variant changed or we're reconfiguring jupyter, stop existing sandbox
            if self._sandbox is not None:
                config_changed = old_variant != self._config.variant or (
                    self._config.variant == "local-jupyter" and jupyter_url
                )
                if config_changed:
                    logger.info(
                        f"Sandbox configuration changed, stopping existing {old_variant} sandbox"
                    )
                    try:
                        self._sandbox.stop()
                    except Exception as e:
                        logger.warning(f"Error stopping sandbox: {e}")
                    self._sandbox = None

            logger.info(
                f"Sandbox configured: variant={self._config.variant}, "
                f"jupyter_url={self._config.jupyter_url}, "
                f"mcp_proxy_url={self._config.mcp_proxy_url}"
            )

    def configure_from_url(
        self,
        jupyter_sandbox_url: str,
        mcp_proxy_url: str | None = None,
        env_vars: dict[str, str] | None = None,
    ) -> None:
        """
        Configure for Jupyter sandbox from a URL with optional token.

        This is a convenience method for CLI/API usage where the URL format
        is: <URL>?token=<TOKEN>

        For two-container setups (Kubernetes), the mcp_proxy_url should be
        set to the agent-runtimes container's MCP proxy endpoint.

        Args:
            jupyter_sandbox_url: The Jupyter server URL, optionally with token.
            mcp_proxy_url: The MCP tool proxy URL for two-container setups.
                If not provided, will default to http://127.0.0.1:8765/api/v1/mcp/proxy
                for local-jupyter variant (assumes colocated containers).
            env_vars: Environment variables to inject into the sandbox kernel
                (e.g. API keys decoded by the companion service).
        """
        # Default to local agent-runtimes URL for Jupyter sandboxes
        # Use 127.0.0.1 for local development (works for both local process and container)
        # In K8s, this should be explicitly set to the service name (e.g., http://agent-runtimes:8765)
        if mcp_proxy_url is None:
            mcp_proxy_url = "http://127.0.0.1:8765/api/v1/mcp/proxy"

        self.configure(
            variant="local-jupyter",
            jupyter_url=jupyter_sandbox_url,
            mcp_proxy_url=mcp_proxy_url,
            env_vars=env_vars,
        )

    def get_sandbox(self) -> Sandbox:
        """
        Get the current sandbox instance, creating one if needed.

        The sandbox will be started automatically if not already running.

        Returns:
            The configured Sandbox instance.

        Raises:
            ImportError: If required sandbox dependencies are not installed.
        """
        with self._sandbox_lock:
            if self._sandbox is None:
                logger.info(
                    f"Creating new {self._config.variant} sandbox "
                    f"(url={self._config.jupyter_url})"
                )
                self._sandbox = self._create_sandbox()
                self._sandbox.start()
                logger.info(f"Started {self._config.variant} sandbox")
                # Inject env vars into the sandbox after start.
                # For local-jupyter this sets os.environ inside the
                # Jupyter kernel (which runs in a separate container).
                # For local-eval this sets them in the agent process.
                self._inject_env_vars(self._sandbox)
            else:
                logger.debug(
                    f"Returning existing {self._config.variant} sandbox "
                    f"(url={self._config.jupyter_url})"
                )
            return self._sandbox

    def get_or_create_sandbox(self, start: bool = True) -> Sandbox:
        """
        Get existing sandbox or create a new one.

        This method allows getting an unstarted sandbox if needed,
        which can be useful when the sandbox will be started later
        or when passing to components that manage their own lifecycle.

        Args:
            start: Whether to start the sandbox if creating new one.
                   Default is True for backward compatibility.

        Returns:
            The configured Sandbox instance.
        """
        with self._sandbox_lock:
            if self._sandbox is None:
                logger.info(
                    f"Creating new {self._config.variant} sandbox "
                    f"(url={self._config.jupyter_url}, start={start})"
                )
                self._sandbox = self._create_sandbox()
                if start:
                    self._sandbox.start()
                    logger.info(f"Started {self._config.variant} sandbox")
                    self._inject_env_vars(self._sandbox)
                else:
                    logger.info(f"Created {self._config.variant} sandbox (not started)")
            return self._sandbox

    def get_managed_sandbox(self) -> ManagedSandbox:
        """
        Return a :class:`ManagedSandbox` proxy bound to this manager.

        The proxy delegates every call to whatever concrete sandbox the
        manager currently holds.  When the manager is reconfigured
        (e.g. ``configure_from_url`` switches from ``local-eval`` to
        ``local-jupyter``), the proxy automatically picks up the new
        sandbox — consumers never need to be rebuilt.

        This is the **recommended** way to obtain a sandbox for long-lived
        components (``CodemodeToolset``, ``SandboxExecutor``, …).

        Returns:
            A ``ManagedSandbox`` proxy that is safe to hold indefinitely.
        """
        return ManagedSandbox(self)

    def _inject_env_vars(self, sandbox: Sandbox) -> None:
        """
        Inject configured env vars into the sandbox.

        For ``local-jupyter`` this runs a small code snippet in the Jupyter
        kernel to set ``os.environ`` — necessary because the kernel runs in
        a different container and does **not** share the agent-runtimes
        process environment.

        For ``local-eval`` this is a no-op because the eval sandbox shares
        the agent-runtimes process, so env vars already set on
        ``os.environ`` by the route handler are visible to executed code.
        """
        env_vars = self._config.env_vars
        if not env_vars:
            return

        if self._config.variant == "local-jupyter":
            # Build a Python snippet that sets every env var in the kernel.
            lines = ["import os"]
            for name, value in env_vars.items():
                lines.append(f"os.environ[{name!r}] = {value!r}")
            code = "\n".join(lines)
            try:
                result = sandbox.run_code(code)
                if result.execution_ok:
                    logger.info(
                        f"Injected {len(env_vars)} env var(s) into Jupyter kernel: "
                        f"{list(env_vars.keys())}"
                    )
                else:
                    logger.warning(
                        f"Failed to inject env vars into Jupyter kernel: "
                        f"{result.execution_error}"
                    )
            except Exception as e:
                logger.warning(f"Error injecting env vars into sandbox: {e}")
        else:
            # local-eval: env vars are already on os.environ
            logger.debug(
                f"Skipping env var injection for {self._config.variant} sandbox "
                f"(process env is shared)"
            )

    def _create_sandbox(self) -> Sandbox:
        """
        Create a new sandbox instance based on current configuration.

        Returns:
            A new Sandbox instance (not yet started).

        Raises:
            ImportError: If required sandbox dependencies are not installed.
            ValueError: If configuration is invalid.
        """
        if self._config.variant == "local-eval":
            from code_sandboxes import LocalEvalSandbox

            return LocalEvalSandbox()

        elif self._config.variant == "local-jupyter":
            from code_sandboxes import LocalJupyterSandbox

            if not self._config.jupyter_url:
                raise ValueError(
                    "Jupyter URL is required for local-jupyter sandbox variant"
                )

            return LocalJupyterSandbox(
                server_url=self._config.jupyter_url,
                token=self._config.jupyter_token,
            )

        else:
            raise ValueError(f"Unknown sandbox variant: {self._config.variant}")

    def stop(self) -> None:
        """Stop the current sandbox if running."""
        with self._sandbox_lock:
            if self._sandbox is not None:
                try:
                    self._sandbox.stop()
                    logger.info(f"Stopped {self._config.variant} sandbox")
                except Exception as e:
                    logger.warning(f"Error stopping sandbox: {e}")
                finally:
                    self._sandbox = None

    def restart(self) -> Sandbox:
        """
        Restart the sandbox with current configuration.

        Returns:
            The new Sandbox instance.
        """
        self.stop()
        return self.get_sandbox()

    def get_status(self) -> dict[str, Any]:
        """
        Get the current status of the sandbox manager.

        Returns:
            A dictionary with status information including paths.
        """
        import os
        from pathlib import Path

        # Get paths from environment or use defaults
        repo_root = Path(__file__).resolve().parents[2]
        generated_path = os.getenv(
            "AGENT_RUNTIMES_GENERATED_CODE_FOLDER",
            str((repo_root / "generated").resolve()),
        )
        skills_path = os.getenv(
            "AGENT_RUNTIMES_SKILLS_FOLDER",
            str((repo_root / "skills").resolve()),
        )

        # Compute python_path (what gets added to sys.path)
        # For Jupyter/remote sandboxes, it's /tmp
        # For local-eval, it's the parent of generated_path
        if self._config.variant in ("local-jupyter", "datalayer-runtime"):
            python_path = "/tmp"  # nosec B108
        else:
            python_path = str(Path(generated_path).resolve().parent)

        return {
            "variant": self._config.variant,
            "jupyter_url": self._config.jupyter_url,
            "jupyter_token_set": self._config.jupyter_token is not None,
            "sandbox_running": self._sandbox is not None,
            "generated_path": generated_path,
            "skills_path": skills_path,
            "python_path": python_path,
            "mcp_proxy_url": self._config.mcp_proxy_url,
        }


# Module-level convenience function
def get_code_sandbox_manager() -> CodeSandboxManager:
    """
    Get the global CodeSandboxManager singleton.

    Returns:
        The CodeSandboxManager instance.
    """
    return CodeSandboxManager.get_instance()

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""
Code Sandbox Manager for Agent Runtimes.

This module provides a centralized manager for code sandbox instances,
allowing runtime configuration of the sandbox variant (local-eval or local-jupyter).

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

    # Get the current sandbox for use with toolsets
    sandbox = manager.get_sandbox()
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from threading import Lock
from typing import TYPE_CHECKING, Literal
from urllib.parse import parse_qs, urlparse

if TYPE_CHECKING:
    from code_sandboxes import Sandbox

logger = logging.getLogger(__name__)


SandboxVariant = Literal["local-eval", "local-jupyter"]


@dataclass
class SandboxConfig:
    """Configuration for the code sandbox.
    
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


class CodeSandboxManager:
    """Manages the lifecycle of code sandbox instances.
    
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
        """Get the singleton instance of the manager.
        
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
        """Reset the singleton instance (primarily for testing).
        
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
    ) -> None:
        """Configure the sandbox settings.
        
        If the sandbox is running and the variant changes, the existing
        sandbox will be stopped and a new one will be created on next access.
        
        Args:
            variant: The sandbox variant to use. If None, keeps current.
            jupyter_url: The Jupyter server URL. Can include token as query param.
            jupyter_token: The Jupyter server token. Overrides token in URL.
            mcp_proxy_url: The MCP tool proxy URL for two-container setups.
                When set, remote sandboxes will call tools via HTTP to this URL.
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
            
            # If variant changed or we're reconfiguring jupyter, stop existing sandbox
            if self._sandbox is not None:
                config_changed = (
                    old_variant != self._config.variant
                    or (self._config.variant == "local-jupyter" and jupyter_url)
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
    ) -> None:
        """Configure for Jupyter sandbox from a URL with optional token.
        
        This is a convenience method for CLI/API usage where the URL format
        is: <URL>?token=<TOKEN>
        
        For two-container setups (Kubernetes), the mcp_proxy_url should be
        set to the agent-runtimes container's MCP proxy endpoint.
        
        Args:
            jupyter_sandbox_url: The Jupyter server URL, optionally with token.
            mcp_proxy_url: The MCP tool proxy URL for two-container setups.
                If not provided, will default to http://0.0.0.0:8765/api/v1/mcp/proxy
                for local-jupyter variant (assumes colocated containers).
        """
        # Default to local agent-runtimes URL for Jupyter sandboxes
        # In K8s, containers in the same pod can reach each other via 0.0.0.0
        if mcp_proxy_url is None:
            mcp_proxy_url = "http://0.0.0.0:8765/api/v1/mcp/proxy"
        
        self.configure(
            variant="local-jupyter",
            jupyter_url=jupyter_sandbox_url,
            mcp_proxy_url=mcp_proxy_url,
        )
    
    def get_sandbox(self) -> Sandbox:
        """Get the current sandbox instance, creating one if needed.
        
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
            else:
                logger.debug(
                    f"Returning existing {self._config.variant} sandbox "
                    f"(url={self._config.jupyter_url})"
                )
            return self._sandbox
    
    def get_or_create_sandbox(self, start: bool = True) -> Sandbox:
        """Get existing sandbox or create a new one.
        
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
                else:
                    logger.info(f"Created {self._config.variant} sandbox (not started)")
            return self._sandbox
    
    def _create_sandbox(self) -> Sandbox:
        """Create a new sandbox instance based on current configuration.
        
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
        """Restart the sandbox with current configuration.
        
        Returns:
            The new Sandbox instance.
        """
        self.stop()
        return self.get_sandbox()
    
    def get_status(self) -> dict:
        """Get the current status of the sandbox manager.
        
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
            python_path = "/tmp"
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
    """Get the global CodeSandboxManager singleton.
    
    Returns:
        The CodeSandboxManager instance.
    """
    return CodeSandboxManager.get_instance()

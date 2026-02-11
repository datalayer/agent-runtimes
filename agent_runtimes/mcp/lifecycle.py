# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP Server Lifecycle Manager.

Centralized manager for MCP server lifecycle (start/stop/state tracking).
Integrates with the MCP catalog to use predefined commands when available.
"""

import asyncio
import json
import logging
import os
import traceback
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any

from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG
from agent_runtimes.types import MCPServer, MCPServerTool

logger = logging.getLogger(__name__)

# Startup timeout for each MCP server (in seconds)
MCP_SERVER_STARTUP_TIMEOUT = 300  # 5 minutes
MCP_SERVER_HANDSHAKE_TIMEOUT = 180
MCP_SERVER_MAX_ATTEMPTS = 3

try:  # Python 3.11+
    from builtins import BaseExceptionGroup
    from builtins import ExceptionGroup as _ExceptionGroup
except (ImportError, AttributeError):  # pragma: no cover - Python <3.11
    # ExceptionGroup doesn't exist in Python <3.11
    # Create a dummy type that will never match in isinstance checks
    class BaseExceptionGroup(BaseException):  # type: ignore[no-redef]
        """Dummy BaseExceptionGroup for Python <3.11 compatibility."""

        pass

    _ExceptionGroup = BaseExceptionGroup  # type: ignore[misc,assignment]


class MCPServerInstance:
    """Represents a running MCP server instance."""

    def __init__(
        self,
        server_id: str,
        config: MCPServer,
        pydantic_server: Any,
        exit_stack: AsyncExitStack,
        tools: list[MCPServerTool] | None = None,
    ):
        self.server_id = server_id
        self.config = config
        self.pydantic_server = pydantic_server
        self.exit_stack = exit_stack
        self.tools = tools or []
        self.is_running = True
        self.error: str | None = None


class MCPLifecycleManager:
    """
    Centralized manager for MCP server lifecycle.

    Handles:
    - Starting/stopping MCP servers
    - Tracking running state (separately for config and catalog servers)
    - Merging mcp.json config with catalog commands
    - Tool discovery from running servers

    Config servers (from mcp.json) and catalog servers (predefined) are managed
    in separate data structures so the same server ID can exist in both.
    """

    def __init__(self) -> None:
        """Initialize the lifecycle manager."""
        # Separate storage for config (mcp.json) vs catalog servers
        self._config_servers: dict[str, MCPServerInstance] = {}  # From mcp.json
        self._catalog_servers: dict[str, MCPServerInstance] = {}  # From catalog
        self._failed_servers: dict[str, str] = {}  # server_id -> error message
        self._initialization_event: asyncio.Event | None = None
        self._initialization_started: bool = False
        self._lock = asyncio.Lock()
        logger.info("MCPLifecycleManager initialized (separate config/catalog storage)")

    def get_mcp_config_path(self) -> Path:
        """Get the path to the MCP configuration file."""
        return Path.home() / ".datalayer" / "mcp.json"

    def _expand_env_vars(
        self, value: str, lookup_env: dict[str, str] | None = None
    ) -> str:
        """
        Expand environment variables in a string (${VAR_NAME} syntax).

        Args:
            value: The string containing ``${VAR_NAME}`` placeholders.
            lookup_env: Optional env dict to resolve variables from.
                Falls back to ``os.environ`` if not provided.
        """
        import re

        env_source = lookup_env if lookup_env is not None else os.environ
        pattern = r"\$\{([^}]+)\}"

        def replace(match: re.Match[str]) -> str:
            var_name = match.group(1)
            env_value = env_source.get(var_name, "")
            if not env_value:
                logger.warning(
                    f"Environment variable '{var_name}' not found or empty during expansion"
                )
            return env_value

        return re.sub(pattern, replace, value)

    def _expand_config_env_vars(self, config: dict[str, Any]) -> dict[str, Any]:
        """Recursively expand environment variables in a config dictionary."""
        result: dict[str, Any] = {}
        for key, value in config.items():
            if isinstance(value, str):
                result[key] = self._expand_env_vars(value)
            elif isinstance(value, list):
                result[key] = [
                    self._expand_env_vars(v) if isinstance(v, str) else v for v in value
                ]
            elif isinstance(value, dict):
                result[key] = self._expand_config_env_vars(value)
            else:
                result[key] = value
        return result

    def _load_mcp_config(self) -> dict[str, Any]:
        """Load MCP configuration from mcp.json file."""
        config_path = self.get_mcp_config_path()

        if not config_path.exists():
            logger.info(f"MCP config file not found at {config_path}")
            return {"mcpServers": {}}

        try:
            with open(config_path, "r") as f:
                config = json.load(f)
                logger.info(f"Loaded MCP config from {config_path}")
                return config
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in MCP config file: {e}")
            return {"mcpServers": {}}
        except Exception as e:
            logger.error(f"Error reading MCP config file: {e}")
            return {"mcpServers": {}}

    def get_server_config_from_file(self, server_id: str) -> MCPServer | None:
        """
        Get config specifically from mcp.json for a server.

        Args:
            server_id: The server identifier to look up in mcp.json

        Returns:
            MCPServer config if found in mcp.json, None otherwise.
            The returned config will have is_config=True.
        """
        config_data = self._load_mcp_config()
        mcp_servers = config_data.get("mcpServers", {})

        if server_id in mcp_servers:
            return self.get_merged_server_config(
                server_id, user_config=mcp_servers[server_id], from_config_file=True
            )
        return None

    def get_merged_server_config(
        self,
        server_id: str,
        user_config: dict[str, Any] | None = None,
        from_config_file: bool = False,
    ) -> MCPServer | None:
        """
        Get server config, merging mcp.json with catalog if available.

        Priority:
        1. If user_config has a 'command', use user config entirely (they know what they want)
        2. If server_id matches a catalog server and no user command, use catalog command
        3. Env vars from user_config are always merged in

        Args:
            server_id: The server identifier
            user_config: Optional user-provided config overrides
            from_config_file: True if this server is from mcp.json (marks as config server)

        Returns:
            MCPServer config or None if not found
        """
        # If user provides a command, use their config entirely
        if user_config:
            expanded = self._expand_config_env_vars(user_config)
            if "command" in expanded:
                logger.info(f"Using user-provided command for MCP server '{server_id}'")

                # Get any additional info from catalog (like name) if available
                catalog_server = MCP_SERVER_CATALOG.get(server_id)

                return MCPServer(
                    id=server_id,
                    name=expanded.get(
                        "name",
                        catalog_server.name
                        if catalog_server
                        else server_id.replace("-", " ").replace("_", " ").title(),
                    ),
                    description=expanded.get(
                        "description",
                        catalog_server.description if catalog_server else "",
                    ),
                    command=expanded["command"],
                    args=expanded.get("args", []),
                    env=expanded.get("env", {}),
                    transport=expanded.get("transport", "stdio"),
                    enabled=True,
                    tools=[],
                    is_config=from_config_file,  # Mark as config server if from mcp.json
                )

        # No user command - check if server is in catalog
        catalog_server = MCP_SERVER_CATALOG.get(server_id)

        if catalog_server:
            # Start with catalog config
            config = catalog_server.model_copy(deep=True)

            # Mark as config server if loaded from mcp.json
            config.is_config = from_config_file

            # Apply user env overrides if provided
            if user_config:
                expanded = self._expand_config_env_vars(user_config)
                if "env" in expanded:
                    # Merge env vars
                    config.env = {**(config.env or {}), **expanded["env"]}

            logger.info(f"Using catalog config for MCP server '{server_id}'")
            return config

        logger.warning(f"No config found for MCP server '{server_id}'")
        return None

    def _format_exception(self, exc: BaseException) -> str:
        """Format exception with traceback details."""
        formatted = "".join(
            traceback.format_exception(type(exc), exc, exc.__traceback__)
        ).strip()
        return formatted or f"{type(exc).__name__}: (no message)"

    def _format_exception_group(self, exc_group: BaseException) -> list[str]:
        """Recursively format an ExceptionGroup into readable lines."""
        if not hasattr(exc_group, "exceptions"):
            return [self._format_exception(exc_group)]
        details: list[str] = []
        for idx, exc in enumerate(getattr(exc_group, "exceptions", [])):
            if isinstance(exc, (_ExceptionGroup, BaseExceptionGroup)):
                nested_lines = self._format_exception_group(exc)
                for nested_line in nested_lines:
                    details.append(f"[{idx}] {nested_line}")
            else:
                details.append(f"[{idx}] {self._format_exception(exc)}")
        return details

    async def start_server(
        self,
        server_id: str,
        config: MCPServer | None = None,
        extra_env: dict[str, str] | None = None,
    ) -> MCPServerInstance | None:
        """
        Start an MCP server.

        Args:
            server_id: The server identifier
            config: Optional MCPServer config. If not provided, will try to
                   get from catalog or mcp.json.
            extra_env: Additional environment variables to pass to the server
                subprocess. These are merged on top of ``os.environ`` and
                ``config.env``, and are also available for ``${VAR}``
                expansion in server args and config env values.

        Returns:
            MCPServerInstance if started successfully, None otherwise
        """
        logger.info(f"🔄 start_server called for '{server_id}'")

        async with self._lock:
            logger.debug(f"Acquired lock for '{server_id}'")

            # Determine which storage to use based on config.is_config
            # (we need config first to know this)

            # Get config
            if config is None:
                config = self.get_merged_server_config(server_id)

            if config is None:
                error = f"No configuration found for MCP server '{server_id}'"
                logger.error(error)
                self._failed_servers[server_id] = error
                return None

            # Select the appropriate storage based on whether it's a config or catalog server
            storage = (
                self._config_servers if config.is_config else self._catalog_servers
            )
            storage_name = "config" if config.is_config else "catalog"

            # Check if already running in the appropriate storage
            if server_id in storage:
                instance = storage[server_id]
                if instance.is_running:
                    logger.info(
                        f"MCP server '{server_id}' is already running (in {storage_name})"
                    )
                    return instance

            logger.info(
                f"🔧 Creating MCP server '{server_id}' ({storage_name}) with command: {config.command} {config.args}"
            )

            # Import pydantic_ai MCP support
            try:
                from pydantic_ai.mcp import MCPServerStdio
            except ImportError as e:
                error = f"pydantic_ai.mcp not available: {e}"
                logger.error(error)
                self._failed_servers[server_id] = error
                return None

            # Create the pydantic MCP server
            try:
                # Build env dict:
                #  1. Start with the current process environment
                #  2. Layer extra_env (from API request body, e.g. decoded secrets)
                #  3. Layer config.env (from catalog/mcp.json, may contain ${VAR} refs)
                # This ordering lets config.env reference extra_env values via ${VAR}.
                env = {**os.environ}

                if extra_env:
                    env.update(extra_env)
                    logger.debug(
                        f"  Merged {len(extra_env)} extra env var(s): "
                        f"{list(extra_env.keys())}"
                    )

                if config.env:
                    # Expand environment variables in the env dict.
                    # Use the combined env for expansion so ${VAR} can
                    # resolve values from extra_env as well.
                    expanded_env = {
                        key: self._expand_env_vars(value, lookup_env=env)
                        if isinstance(value, str)
                        else value
                        for key, value in config.env.items()
                    }
                    logger.debug(f"  Expanded config.env: {list(expanded_env.keys())}")
                    env.update(expanded_env)

                # Expand environment variables in args (e.g., ${KAGGLE_TOKEN}).
                # Use the combined env so args can reference extra_env values.
                expanded_args = [
                    self._expand_env_vars(arg, lookup_env=env)
                    if isinstance(arg, str)
                    else arg
                    for arg in (config.args or [])
                ]

                # Use tool_prefix to avoid name conflicts if the same server type
                # is selected multiple times (e.g., from both config and catalog)
                tool_prefix = f"{server_id}_"

                pydantic_server = MCPServerStdio(
                    config.command,
                    args=expanded_args,
                    env=env,
                    tool_prefix=tool_prefix,
                    id=server_id,  # Pass id in constructor
                )

                # Log the env vars that will be available in the subprocess.
                # For npx-based servers (e.g., tavily, kaggle) this is the
                # ONLY source of env vars — MCPServerStdio does not inherit
                # from the parent process.
                if extra_env:
                    logger.info(
                        f"  MCP server '{server_id}' ({config.command}) subprocess env "
                        f"includes {len(extra_env)} injected var(s): "
                        f"{sorted(extra_env.keys())}"
                    )

                # Adjust timeout if supported
                if hasattr(pydantic_server, "timeout"):
                    try:
                        current_timeout = getattr(pydantic_server, "timeout")
                        if (
                            current_timeout is None
                            or current_timeout < MCP_SERVER_HANDSHAKE_TIMEOUT
                        ):
                            setattr(
                                pydantic_server, "timeout", MCP_SERVER_HANDSHAKE_TIMEOUT
                            )
                    except Exception as timeout_error:
                        logger.debug(
                            f"Unable to adjust timeout for '{server_id}': {timeout_error}"
                        )

            except Exception as e:
                error = f"Failed to create MCP server: {e}"
                logger.error(f"✗ MCP server '{server_id}' creation failed: {error}")
                self._failed_servers[server_id] = error
                return None

            # Start the server
            exit_stack = AsyncExitStack()
            await exit_stack.__aenter__()

            attempt = 1
            while attempt <= MCP_SERVER_MAX_ATTEMPTS:
                try:
                    logger.info(
                        f"⏳ Starting MCP server '{server_id}' (attempt {attempt}/{MCP_SERVER_MAX_ATTEMPTS})..."
                    )
                    await asyncio.wait_for(
                        exit_stack.enter_async_context(pydantic_server),
                        timeout=MCP_SERVER_STARTUP_TIMEOUT,
                    )
                    await asyncio.sleep(0)

                    # Get tools
                    tools: list[MCPServerTool] = []
                    try:
                        running_tools = await pydantic_server.list_tools()
                        for tool in running_tools:
                            input_schema = getattr(tool, "input_schema", None)
                            if input_schema is None and hasattr(tool, "inputSchema"):
                                input_schema = getattr(tool, "inputSchema")
                            tools.append(
                                MCPServerTool(
                                    name=tool.name,
                                    description=getattr(tool, "description", "") or "",
                                    enabled=True,
                                    input_schema=input_schema,
                                )
                            )
                        tool_names = [t.name for t in tools]
                        logger.info(
                            f"✓ MCP server '{server_id}' started with tools: {tool_names}"
                        )
                    except Exception as e:
                        logger.warning(f"Failed to list tools for '{server_id}': {e}")
                        logger.info(
                            f"✓ MCP server '{server_id}' started (tools unavailable)"
                        )

                    # Update config with discovered tools
                    config.tools = tools
                    config.is_available = True
                    config.is_running = True

                    # Create instance
                    instance = MCPServerInstance(
                        server_id=server_id,
                        config=config,
                        pydantic_server=pydantic_server,
                        exit_stack=exit_stack,
                        tools=tools,
                    )
                    # Store in appropriate dict based on is_config
                    storage = (
                        self._config_servers
                        if config.is_config
                        else self._catalog_servers
                    )
                    storage[server_id] = instance
                    self._failed_servers.pop(server_id, None)
                    logger.info(
                        f"✓ MCP server '{server_id}' stored in {'config' if config.is_config else 'catalog'} servers"
                    )
                    return instance

                except asyncio.TimeoutError:
                    error_detail = f"Timeout after {MCP_SERVER_STARTUP_TIMEOUT}s"
                    logger.error(
                        f"✗ MCP server '{server_id}' startup timed out on attempt {attempt}: {error_detail}"
                    )
                    if attempt >= MCP_SERVER_MAX_ATTEMPTS:
                        await exit_stack.__aexit__(None, None, None)
                        self._failed_servers[server_id] = error_detail
                        return None
                    await asyncio.sleep(min(2 * attempt, 5))
                    attempt += 1
                    continue

                except (_ExceptionGroup, BaseExceptionGroup) as eg:
                    error_lines = self._format_exception_group(eg)
                    for line in error_lines:
                        logger.error(f"✗ MCP server '{server_id}' exception: {line}")
                    error_detail = (
                        error_lines[0] if error_lines else "Unknown error in TaskGroup"
                    )

                    if (
                        "BrokenResourceError" in error_detail
                        and attempt < MCP_SERVER_MAX_ATTEMPTS
                    ):
                        logger.warning(
                            f"MCP server '{server_id}' hit BrokenResourceError; retrying"
                        )
                        await asyncio.sleep(min(2 * attempt, 5))
                        attempt += 1
                        continue

                    await exit_stack.__aexit__(None, None, None)
                    self._failed_servers[server_id] = error_detail
                    return None

                except Exception as e:
                    error_detail = self._format_exception(e)
                    if (
                        "BrokenResourceError" in error_detail
                        and attempt < MCP_SERVER_MAX_ATTEMPTS
                    ):
                        logger.warning(
                            f"MCP server '{server_id}' hit BrokenResourceError; retrying"
                        )
                        await asyncio.sleep(min(2 * attempt, 5))
                        attempt += 1
                        continue

                    await exit_stack.__aexit__(None, None, None)
                    logger.error(
                        f"✗ MCP server '{server_id}' startup failed: {error_detail}"
                    )
                    self._failed_servers[server_id] = error_detail
                    return None

            return None

    async def stop_server(self, server_id: str, is_config: bool = False) -> bool:
        """
        Stop a running MCP server.

        Args:
            server_id: The server identifier
            is_config: Whether this is a config server (from mcp.json) or catalog server

        Returns:
            True if stopped successfully, False otherwise
        """
        async with self._lock:
            # Select the appropriate storage
            storage = self._config_servers if is_config else self._catalog_servers
            storage_name = "config" if is_config else "catalog"

            instance = storage.pop(server_id, None)
            if instance is None:
                logger.warning(
                    f"MCP server '{server_id}' is not running in {storage_name}"
                )
                return False

            try:
                await instance.exit_stack.__aexit__(None, None, None)
                instance.is_running = False
                instance.config.is_running = False
                logger.info(f"✓ Stopped MCP server '{server_id}' ({storage_name})")
                return True
            except RuntimeError as e:
                if "cancel scope" in str(e).lower():
                    logger.debug(
                        f"MCP server '{server_id}' stopped (cancel scope closed)"
                    )
                else:
                    logger.warning(f"Error stopping MCP server '{server_id}': {e}")
                return True
            except Exception as e:
                logger.warning(f"Error stopping MCP server '{server_id}': {e}")
                return True

    def get_running_server(
        self, server_id: str, is_config: bool | None = None
    ) -> MCPServerInstance | None:
        """
        Get a running server instance by ID.

        Args:
            server_id: The server identifier
            is_config: If True, only check config servers. If False, only check catalog.
                      If None, check both (catalog first, then config).
        """
        if is_config is True:
            return self._config_servers.get(server_id)
        elif is_config is False:
            return self._catalog_servers.get(server_id)
        else:
            # Check catalog first, then config
            return self._catalog_servers.get(server_id) or self._config_servers.get(
                server_id
            )

    def get_config_servers(self) -> list[MCPServerInstance]:
        """
        Get all running config server instances (from mcp.json).
        """
        return list(self._config_servers.values())

    def get_catalog_servers(self) -> list[MCPServerInstance]:
        """
        Get all running catalog server instances.
        """
        return list(self._catalog_servers.values())

    def get_all_running_servers(self) -> list[MCPServerInstance]:
        """
        Get all running server instances (both config and catalog).
        """
        return list(self._config_servers.values()) + list(
            self._catalog_servers.values()
        )

    def get_running_server_ids(self) -> list[str]:
        """
        Get IDs of all running servers (combined, may have duplicates).
        """
        return list(self._config_servers.keys()) + list(self._catalog_servers.keys())

    def get_config_server_ids(self) -> list[str]:
        """
        Get IDs of running config servers.
        """
        return list(self._config_servers.keys())

    def get_catalog_server_ids(self) -> list[str]:
        """
        Get IDs of running catalog servers.
        """
        return list(self._catalog_servers.keys())

    def is_server_running(self, server_id: str, is_config: bool | None = None) -> bool:
        """
        Check if a server is running.

        Args:
            server_id: The server identifier
            is_config: If True, only check config servers. If False, only check catalog.
                      If None, check both.
        """
        instance = self.get_running_server(server_id, is_config)
        return instance is not None and instance.is_running

    def is_config_server_running(self, server_id: str) -> bool:
        """
        Check if a config server (from mcp.json) is running.
        """
        return self.is_server_running(server_id, is_config=True)

    def is_catalog_server_running(self, server_id: str) -> bool:
        """
        Check if a catalog server is running.
        """
        return self.is_server_running(server_id, is_config=False)

    def get_failed_servers(self) -> dict[str, str]:
        """
        Get dict of failed server IDs to error messages.
        """
        return self._failed_servers.copy()

    def get_server_status(
        self, server_id: str, is_config: bool | None = None
    ) -> dict[str, Any]:
        """Get status of a specific server."""
        instance = self.get_running_server(server_id, is_config)
        if instance:
            return {
                "id": server_id,
                "status": "running" if instance.is_running else "stopped",
                "tools_count": len(instance.tools),
                "error": instance.error,
                "is_config": instance.config.is_config,
            }
        elif server_id in self._failed_servers:
            return {
                "id": server_id,
                "status": "failed",
                "error": self._failed_servers[server_id],
            }
        else:
            return {
                "id": server_id,
                "status": "stopped",
            }

    def get_pydantic_toolsets(
        self, include_config: bool = True, include_catalog: bool = True
    ) -> list[Any]:
        """
        Get running MCP servers as pydantic_ai toolsets.

        Args:
            include_config: Whether to include config servers (from mcp.json)
            include_catalog: Whether to include catalog servers

        Returns:
            List of pydantic MCP server instances for use with Agent(toolsets=...)
        """
        toolsets = []
        if include_config:
            toolsets.extend(
                [
                    instance.pydantic_server
                    for instance in self._config_servers.values()
                    if instance.is_running
                ]
            )
        if include_catalog:
            toolsets.extend(
                [
                    instance.pydantic_server
                    for instance in self._catalog_servers.values()
                    if instance.is_running
                ]
            )
        return toolsets

    async def initialize_from_config(self) -> None:
        """
        Initialize MCP servers from mcp.json config file.

        For each server in the config:
        - If it matches a library server, use the library command
        - Otherwise use the command from mcp.json
        """
        if self._initialization_started:
            logger.warning("MCP lifecycle initialization already started")
            return

        self._initialization_started = True
        self._initialization_event = asyncio.Event()

        config = self._load_mcp_config()
        mcp_servers = config.get("mcpServers", {})

        if not mcp_servers:
            logger.info("No MCP servers in config file")
            self._initialization_event.set()
            return

        logger.info(f"📦 Initializing {len(mcp_servers)} MCP server(s) from config")

        success_count = 0
        for server_id, server_config in mcp_servers.items():
            logger.info(f"Processing MCP server '{server_id}'...")
            try:
                # Get merged config (library + user overrides)
                # Mark as from_config_file=True since these are from mcp.json
                merged_config = self.get_merged_server_config(
                    server_id, server_config, from_config_file=True
                )

                if merged_config:
                    logger.info(
                        f"Starting MCP server '{server_id}' (is_config={merged_config.is_config})..."
                    )
                    instance = await self.start_server(server_id, merged_config)
                    if instance:
                        success_count += 1
                        logger.info(f"✓ MCP server '{server_id}' started successfully")
                    else:
                        logger.warning(f"✗ MCP server '{server_id}' failed to start")
                else:
                    logger.warning(f"No config available for MCP server '{server_id}'")
            except Exception as e:
                logger.error(
                    f"Exception starting MCP server '{server_id}': {e}", exc_info=True
                )
                self._failed_servers[server_id] = str(e)

        logger.info(
            f"🎉 MCP initialization complete: {success_count}/{len(mcp_servers)} servers started"
        )
        self._initialization_event.set()

    async def shutdown(self) -> None:
        """Shutdown all running MCP servers."""
        # Stop config servers
        config_ids = list(self._config_servers.keys())
        for server_id in config_ids:
            await self.stop_server(server_id, is_config=True)

        # Stop catalog servers
        catalog_ids = list(self._catalog_servers.keys())
        for server_id in catalog_ids:
            await self.stop_server(server_id, is_config=False)

        self._failed_servers.clear()
        self._initialization_started = False
        self._initialization_event = None
        logger.info("MCP lifecycle shutdown complete")

    async def wait_for_initialization(self, timeout: float | None = None) -> bool:
        """Wait for initialization to complete."""
        if self._initialization_event is None:
            return False

        try:
            if timeout is None:
                await self._initialization_event.wait()
            else:
                await asyncio.wait_for(
                    self._initialization_event.wait(), timeout=timeout
                )
            return True
        except asyncio.TimeoutError:
            return False

    def is_initialized(self) -> bool:
        """Check if initialization has completed."""
        return (
            self._initialization_event is not None
            and self._initialization_event.is_set()
        )


# Global singleton instance
_lifecycle_manager: MCPLifecycleManager | None = None


def get_mcp_lifecycle_manager() -> MCPLifecycleManager:
    """Get the global MCP lifecycle manager instance."""
    global _lifecycle_manager
    if _lifecycle_manager is None:
        _lifecycle_manager = MCPLifecycleManager()
    return _lifecycle_manager


def set_mcp_lifecycle_manager(manager: MCPLifecycleManager) -> None:
    """Set the global MCP lifecycle manager instance."""
    global _lifecycle_manager
    _lifecycle_manager = manager

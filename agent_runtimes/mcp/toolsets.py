# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP Toolsets management for Pydantic AI agents.

This module provides server-level MCP toolset management that loads
MCP servers once at server startup and makes them available to all agents.

MCP servers are managed using an AsyncExitStack to properly maintain their
async context managers. This is necessary because Pydantic AI's MCP servers
(MCPServerStdio, etc.) use anyio cancel scopes that must remain active
for the duration of their use.

Uses Pydantic AI's built-in MCP client support (MCPServerStdio, MCPServerStreamableHTTP)
which automatically detects the transport type from the config:
- `command` field → MCPServerStdio (stdio transport)
- `url` field ending with `/sse` → MCPServerSSE (deprecated SSE transport)
- `url` field (not `/sse`) → MCPServerStreamableHTTP (recommended HTTP transport)
"""

import asyncio
import logging
import traceback
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any

try:  # Python 3.11+
    BaseExceptionGroup  # type: ignore[name-defined]
except NameError:  # pragma: no cover - earlier Python versions
    BaseExceptionGroup = ExceptionGroup  # type: ignore

logger = logging.getLogger(__name__)

# Startup timeout for each MCP server (in seconds)
# This is long to allow for first-time package downloads (e.g., uvx, npx)
MCP_SERVER_STARTUP_TIMEOUT = 300  # 5 minutes
MCP_SERVER_HANDSHAKE_TIMEOUT = 180
MCP_SERVER_MAX_ATTEMPTS = 3

# Global storage for Pydantic AI MCP toolsets
_mcp_toolsets: list[Any] = []
_initialization_started: bool = False
_failed_servers: dict[str, str] = {}  # server_id -> error message

# Separate exit stack per server (required for parallel startup with different tasks)
_exit_stacks: list[AsyncExitStack] = []
_initialization_event: asyncio.Event | None = None


def get_mcp_config_path() -> Path:
    """
    Get the path to the MCP configuration file.

    Returns:
        Path to mcp.json file
    """
    return Path.home() / ".datalayer" / "mcp.json"


def ensure_mcp_toolsets_event() -> None:
    """Ensure the initialization event exists for external waiters."""
    global _initialization_event

    if _initialization_event is None:
        _initialization_event = asyncio.Event()


def _format_exception(exc: BaseException) -> str:
    """Format exception with traceback details."""
    formatted = ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__)).strip()
    return formatted or f"{type(exc).__name__}: (no message)"


def _format_exception_group(exc_group: BaseException) -> list[str]:
    """Recursively format an ExceptionGroup into readable lines."""
    if not hasattr(exc_group, "exceptions"):
        return [_format_exception(exc_group)]
    details: list[str] = []
    for idx, exc in enumerate(getattr(exc_group, "exceptions", [])):
        if isinstance(exc, ExceptionGroup):
            nested_lines = _format_exception_group(exc)
            for nested_line in nested_lines:
                details.append(f"[{idx}] {nested_line}")
        elif isinstance(exc, BaseExceptionGroup):  # type: ignore[name-defined]
            nested_lines = _format_exception_group(exc)
            for nested_line in nested_lines:
                details.append(f"[{idx}] {nested_line}")
        else:
            details.append(f"[{idx}] {_format_exception(exc)}")
    return details


async def _start_single_server(server: Any, exit_stack: AsyncExitStack) -> bool:
    """
    Start a single MCP server with timeout using an exit stack.
    
    The exit_stack manages the async context so the server stays running
    until the exit_stack is closed.
    
    Args:
        server: The MCP server instance to start
        exit_stack: AsyncExitStack to manage the server's context
        
    Returns:
        True if server started successfully, False otherwise
    """
    global _mcp_toolsets, _failed_servers
    
    server_id = getattr(server, 'id', str(server))
    
    try:
        logger.info(f"⏳ Starting MCP server '{server_id}'... (timeout: {MCP_SERVER_STARTUP_TIMEOUT}s)")
        
        # Enter the server's async context via the exit stack
        # This keeps the context open until we close the exit stack
        await asyncio.wait_for(
            exit_stack.enter_async_context(server),
            timeout=MCP_SERVER_STARTUP_TIMEOUT
        )
        
        # Successfully started - add to toolsets
        _mcp_toolsets.append(server)
        
        # Try to list tools for logging
        try:
            tools = await server.list_tools()
            tool_names = [t.name for t in tools]
            logger.info(f"✓ MCP server '{server_id}' started with tools: {tool_names}")
        except Exception:
            logger.info(f"✓ MCP server '{server_id}' started successfully")
        
        return True
        
    except asyncio.TimeoutError:
        logger.error(f"✗ MCP server '{server_id}' startup timed out after {MCP_SERVER_STARTUP_TIMEOUT}s")
        _failed_servers[server_id] = f"Timeout after {MCP_SERVER_STARTUP_TIMEOUT}s"
        return False
    
    except ExceptionGroup as eg:  # Standard ExceptionGroup (Exception)
        # Handle TaskGroup exceptions (Python 3.11+)
        error_lines = _format_exception_group(eg)
        for line in error_lines:
            logger.error(f"✗ MCP server '{server_id}' exception: {line}")
        error_detail = error_lines[0] if error_lines else "Unknown error in TaskGroup"
        logger.error(f"✗ MCP server '{server_id}' failed: {error_detail}")
        _failed_servers[server_id] = error_detail
        return False
    except BaseExceptionGroup as beg:  # type: ignore[name-defined]
        error_lines = _format_exception_group(beg)
        for line in error_lines:
            logger.error(f"✗ MCP server '{server_id}' exception: {line}")
        error_detail = error_lines[0] if error_lines else "Unknown error in TaskGroup"
        logger.error(f"✗ MCP server '{server_id}' failed: {error_detail}")
        _failed_servers[server_id] = error_detail
        return False
        
    except Exception as e:
        error_detail = _format_exception(e)
        logger.error(f"✗ MCP server '{server_id}' startup failed: {error_detail}")
        _failed_servers[server_id] = error_detail
        return False


async def initialize_mcp_toolsets() -> None:
    """
    Initialize MCP toolsets at server startup.
    
    This loads MCP servers from the config file and starts them all
    in parallel, each with its own AsyncExitStack. Using separate exit
    stacks is required because parallel startup creates separate tasks
    and anyio cancel scopes must be entered/exited from the same task.
    
    Note: Servers are started in parallel for faster startup.
    """
    global _initialization_started, _exit_stacks, _mcp_toolsets, _failed_servers, _initialization_event
    
    if _initialization_started:
        logger.warning("MCP toolsets initialization already started")
        return
    
    _initialization_started = True
    
    mcp_config_path = get_mcp_config_path()
    
    if not mcp_config_path.exists():
        logger.info(f"MCP config file not found at {mcp_config_path}")
        if _initialization_event is not None:
            _initialization_event.set()
        return
    
    try:
        if _initialization_event is None:
            _initialization_event = asyncio.Event()

        from pydantic_ai.mcp import load_mcp_servers
        
        # Load MCP servers from config (automatically detects transport type)
        servers = load_mcp_servers(str(mcp_config_path))
        logger.info(f"📦 Loaded {len(servers)} MCP server(s) from {mcp_config_path}")
        
        if not servers:
            logger.info("No MCP servers configured")
            if _initialization_event is not None:
                _initialization_event.set()
            return
        
        # Start servers sequentially to avoid anyio cancel-scope conflicts
        success_count = 0
        for server in servers:
            server_id = getattr(server, "id", str(server))
            attempt = 1

            # Increase per-server handshake timeout when supported (default is 60s)
            if hasattr(server, "timeout"):
                try:
                    current_timeout = getattr(server, "timeout")
                    if current_timeout is None or current_timeout < MCP_SERVER_HANDSHAKE_TIMEOUT:
                        setattr(server, "timeout", MCP_SERVER_HANDSHAKE_TIMEOUT)
                        logger.debug(
                            f"Adjusted MCP server '{server_id}' handshake timeout to {MCP_SERVER_HANDSHAKE_TIMEOUT}s"
                        )
                except Exception as timeout_error:  # pragma: no cover - non-critical
                    logger.debug(
                        f"Unable to adjust handshake timeout for MCP server '{server_id}': {timeout_error}"
                    )

            while attempt <= MCP_SERVER_MAX_ATTEMPTS:
                stack = AsyncExitStack()
                await stack.__aenter__()

                try:
                    logger.info(
                        f"⏳ Starting MCP server '{server_id}' (attempt {attempt}/{MCP_SERVER_MAX_ATTEMPTS})..."
                    )
                    await asyncio.wait_for(
                        stack.enter_async_context(server),
                        timeout=MCP_SERVER_STARTUP_TIMEOUT,
                    )
                    await asyncio.sleep(0)
                    tools = await server.list_tools()
                    tool_names = [t.name for t in tools]
                    logger.info(
                        f"✓ MCP server '{server_id}' started with tools: {tool_names}"
                    )
                    _mcp_toolsets.append(server)
                    _exit_stacks.append(stack)
                    _failed_servers.pop(server_id, None)
                    success_count += 1
                    break

                except asyncio.TimeoutError:
                    error_detail = f"Timeout after {MCP_SERVER_STARTUP_TIMEOUT}s"
                    logger.error(
                        f"✗ MCP server '{server_id}' startup timed out on attempt {attempt}: {error_detail}"
                    )
                    await stack.__aexit__(None, None, None)
                    if attempt >= MCP_SERVER_MAX_ATTEMPTS:
                        _failed_servers[server_id] = error_detail
                        break
                    logger.info(
                        f"Retrying MCP server '{server_id}' after timeout (attempt {attempt + 1})"
                    )
                    await asyncio.sleep(min(2 * attempt, 5))
                    attempt += 1
                    continue

                except ExceptionGroup as eg:
                    error_lines = _format_exception_group(eg)
                    for line in error_lines:
                        logger.error(f"✗ MCP server '{server_id}' exception: {line}")
                    error_detail = (
                        error_lines[0] if error_lines else "Unknown error in TaskGroup"
                    )
                    await stack.__aexit__(None, None, None)
                    if "BrokenResourceError" in error_detail and attempt < MCP_SERVER_MAX_ATTEMPTS:
                        logger.warning(
                            f"MCP server '{server_id}' hit BrokenResourceError; retrying (attempt {attempt + 1})"
                        )
                        await asyncio.sleep(min(2 * attempt, 5))
                        attempt += 1
                        continue
                    logger.error(f"✗ MCP server '{server_id}' failed: {error_detail}")
                    _failed_servers[server_id] = error_detail
                    break

                except BaseExceptionGroup as beg:  # type: ignore[name-defined]
                    error_lines = _format_exception_group(beg)
                    for line in error_lines:
                        logger.error(f"✗ MCP server '{server_id}' exception: {line}")
                    error_detail = (
                        error_lines[0] if error_lines else "Unknown error in TaskGroup"
                    )
                    await stack.__aexit__(None, None, None)
                    if "BrokenResourceError" in error_detail and attempt < MCP_SERVER_MAX_ATTEMPTS:
                        logger.warning(
                            f"MCP server '{server_id}' hit BrokenResourceError; retrying (attempt {attempt + 1})"
                        )
                        await asyncio.sleep(min(2 * attempt, 5))
                        attempt += 1
                        continue
                    logger.error(f"✗ MCP server '{server_id}' failed: {error_detail}")
                    _failed_servers[server_id] = error_detail
                    break

                except Exception as e:
                    error_detail = _format_exception(e)
                    await stack.__aexit__(None, None, None)
                    if "BrokenResourceError" in error_detail and attempt < MCP_SERVER_MAX_ATTEMPTS:
                        logger.warning(
                            f"MCP server '{server_id}' hit BrokenResourceError; retrying (attempt {attempt + 1})"
                        )
                        await asyncio.sleep(min(2 * attempt, 5))
                        attempt += 1
                        continue
                    logger.error(
                        f"✗ MCP server '{server_id}' startup failed: {error_detail}"
                    )
                    _failed_servers[server_id] = error_detail
                    break

                else:
                    # Should never reach here because of break above
                    await stack.__aexit__(None, None, None)
                    break
        
        logger.info(
            f"🎉 MCP toolsets initialization complete: {success_count}/{len(servers)} servers started"
        )
        if _initialization_event is not None:
            _initialization_event.set()
        
    except Exception as e:
        logger.error(f"Failed to load MCP servers: {e}")
        if _initialization_event is not None:
            _initialization_event.set()


async def shutdown_mcp_toolsets() -> None:
    """
    Shutdown MCP toolsets at server shutdown.
    
    This closes all exit stacks which properly close the running
    MCP server connections/subprocesses.
    Note: Some errors during shutdown are expected and suppressed (e.g.,
    cancel scope errors from anyio when the event loop is closing).
    """
    global _mcp_toolsets, _initialization_started, _failed_servers, _exit_stacks
    
    # Close all exit stacks
    for i, stack in enumerate(_exit_stacks):
        try:
            await stack.__aexit__(None, None, None)
        except RuntimeError as e:
            # Suppress cancel scope errors during shutdown - these are expected
            if "cancel scope" in str(e).lower():
                logger.debug(f"MCP exit stack {i} closed (cancel scope closed)")
            else:
                logger.warning(f"Error closing MCP exit stack {i}: {e}")
        except Exception as e:
            logger.warning(f"Error closing MCP exit stack {i}: {e}")
    
    if _exit_stacks:
        logger.info(f"Closed {len(_exit_stacks)} MCP server context(s)")
    
    _exit_stacks.clear()
    _mcp_toolsets = []
    _failed_servers.clear()
    _initialization_started = False
    _initialization_event = None
    logger.info("MCP toolsets shutdown complete")


def get_mcp_toolsets() -> list[Any]:
    """
    Get the list of successfully started MCP toolsets.
    
    These can be passed directly to Pydantic AI Agent(toolsets=...).
    
    Note: This returns only the servers that have successfully started.
    Servers still starting up in the background will not be included.
    
    Returns:
        List of MCP server toolsets
    """
    return _mcp_toolsets.copy()


def get_mcp_toolsets_status() -> dict[str, Any]:
    """
    Get the status of MCP toolsets initialization.
    
    Returns:
        Dict with status information including:
        - initialized: Whether initialization has completed
        - ready_count: Number of servers ready
        - failed_count: Number of servers that failed to start
        - ready_servers: List of server IDs that are ready
        - failed_servers: Dict of server ID -> error message for failed servers
    """
    ready = [
        getattr(server, 'id', str(server))
        for server in _mcp_toolsets
    ]
    
    return {
        "initialized": _initialization_started,
        "ready_count": len(_mcp_toolsets),
        "failed_count": len(_failed_servers),
        "ready_servers": ready,
        "failed_servers": _failed_servers.copy(),
    }


async def wait_for_mcp_toolsets(timeout: float | None = None) -> bool:
    """Wait until MCP toolsets initialization completes."""
    global _initialization_event

    if _initialization_event is None:
        return False

    try:
        if timeout is None:
            await _initialization_event.wait()
        else:
            await asyncio.wait_for(_initialization_event.wait(), timeout=timeout)
        return True
    except asyncio.TimeoutError:
        return False


def get_mcp_toolsets_info() -> list[dict[str, Any]]:
    """
    Get information about the loaded MCP toolsets.
    
    Returns:
        List of dicts with toolset info (type, id, command/url)
        Note: Sensitive information like cookies/tokens in args are redacted.
    """
    info = []
    for server in _mcp_toolsets:
        server_info = {
            "type": type(server).__name__,
        }
        if hasattr(server, "id"):
            server_info["id"] = server.id
        if hasattr(server, "command"):
            server_info["command"] = server.command
        if hasattr(server, "args"):
            # Redact potentially sensitive args (anything that looks like a token/cookie)
            args = []
            for arg in server.args:
                if isinstance(arg, str) and len(arg) > 50:
                    # Long strings are likely tokens/cookies - redact them
                    args.append(f"{arg[:10]}...{arg[-4:]}")
                else:
                    args.append(arg)
            server_info["args"] = args
        if hasattr(server, "url"):
            server_info["url"] = server.url
        info.append(server_info)
    return info


def is_mcp_toolsets_initialized() -> bool:
    """Return True when MCP toolsets initialization has completed."""
    return _initialization_event is not None and _initialization_event.is_set()

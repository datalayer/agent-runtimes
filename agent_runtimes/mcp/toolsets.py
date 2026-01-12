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
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Startup timeout for each MCP server (in seconds)
# This is long to allow for first-time package downloads (e.g., uvx, npx)
MCP_SERVER_STARTUP_TIMEOUT = 300  # 5 minutes

# Global storage for Pydantic AI MCP toolsets
_mcp_toolsets: list[Any] = []
_initialization_started: bool = False
_failed_servers: dict[str, str] = {}  # server_id -> error message

# Separate exit stack per server (required for parallel startup with different tasks)
_exit_stacks: list[AsyncExitStack] = []


def get_mcp_config_path() -> Path:
    """
    Get the path to the MCP configuration file.

    Returns:
        Path to mcp.json file
    """
    return Path.home() / ".datalayer" / "mcp.json"


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
    
    except ExceptionGroup as eg:
        # Handle TaskGroup exceptions (Python 3.11+)
        error_messages = []
        for exc in eg.exceptions:
            exc_str = str(exc).strip()
            if exc_str:
                error_messages.append(f"{type(exc).__name__}: {exc_str}")
            else:
                if isinstance(exc, ExceptionGroup):
                    for nested in exc.exceptions:
                        nested_str = str(nested).strip()
                        error_messages.append(f"{type(nested).__name__}: {nested_str}" if nested_str else type(nested).__name__)
                else:
                    error_messages.append(type(exc).__name__)
        error_detail = '; '.join(error_messages) if error_messages else "Unknown error in TaskGroup"
        logger.error(f"✗ MCP server '{server_id}' failed: {error_detail}")
        _failed_servers[server_id] = error_detail
        return False
        
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e).strip()
        
        if hasattr(e, '__cause__') and e.__cause__:
            cause_type = type(e.__cause__).__name__
            cause_msg = str(e.__cause__).strip()
            error_detail = f"{error_type}: {error_msg} (caused by {cause_type}: {cause_msg})"
        elif hasattr(e, 'exceptions'):
            nested_msgs = [f"{type(exc).__name__}: {str(exc).strip()}" for exc in e.exceptions]
            error_detail = f"{error_type}: {'; '.join(nested_msgs)}"
        elif error_msg:
            error_detail = f"{error_type}: {error_msg}"
        else:
            error_detail = error_type
            
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
    global _initialization_started, _exit_stacks, _mcp_toolsets, _failed_servers
    
    if _initialization_started:
        logger.warning("MCP toolsets initialization already started")
        return
    
    _initialization_started = True
    
    mcp_config_path = get_mcp_config_path()
    
    if not mcp_config_path.exists():
        logger.info(f"MCP config file not found at {mcp_config_path}")
        return
    
    try:
        from pydantic_ai.mcp import load_mcp_servers
        
        # Load MCP servers from config (automatically detects transport type)
        servers = load_mcp_servers(str(mcp_config_path))
        logger.info(f"📦 Loaded {len(servers)} MCP server(s) from {mcp_config_path}")
        
        if not servers:
            logger.info("No MCP servers configured")
            return
        
        # Start all servers in parallel, each with its own exit stack
        async def start_one(server):
            server_id = getattr(server, 'id', str(server))
            stack = AsyncExitStack()
            await stack.__aenter__()
            try:
                logger.info(f"⏳ Starting MCP server '{server_id}'...")
                await asyncio.wait_for(
                    stack.enter_async_context(server),
                    timeout=MCP_SERVER_STARTUP_TIMEOUT
                )
                tools = await server.list_tools()
                tool_names = [t.name for t in tools]
                logger.info(f"✓ MCP server '{server_id}' started with tools: {tool_names}")
                return (server_id, True, server, stack)
            except asyncio.TimeoutError:
                logger.error(f"✗ MCP server '{server_id}' startup timed out")
                try:
                    await stack.__aexit__(None, None, None)
                except:
                    pass
                return (server_id, False, f"Timeout after {MCP_SERVER_STARTUP_TIMEOUT}s", None)
            except Exception as e:
                error_msg = f"{type(e).__name__}: {str(e)[:100]}"
                logger.error(f"✗ MCP server '{server_id}' failed: {error_msg}")
                try:
                    await stack.__aexit__(None, None, None)
                except:
                    pass
                return (server_id, False, error_msg, None)
        
        results = await asyncio.gather(*[start_one(s) for s in servers], return_exceptions=True)
        
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Unexpected error during MCP startup: {result}")
            elif result[1]:  # Success
                _mcp_toolsets.append(result[2])
                _exit_stacks.append(result[3])
            else:  # Failure
                _failed_servers[result[0]] = result[2]
        
        logger.info(f"🎉 MCP toolsets initialization complete: {len(_mcp_toolsets)}/{len(servers)} servers started")
        
    except Exception as e:
        logger.error(f"Failed to load MCP servers: {e}")


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

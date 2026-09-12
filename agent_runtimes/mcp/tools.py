# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Tools integration for agent-runtimes using MCP (Model Context Protocol).

This module provides MCP tools integration that can be used by both
Jupyter and FastAPI servers.
"""

import logging
from typing import Any
from urllib.parse import urljoin

from pydantic_ai.mcp import MCPToolset

from agent_runtimes.mcp.tracing import tracing_client

from agent_runtimes.types import BuiltinTool

logger = logging.getLogger(__name__)


def generate_name_from_id(tool_id: str) -> str:
    """
    Generate a display name from a tool ID.

    Replaces underscores with spaces and capitalizes the first letter.

    Args:
        tool_id: Tool identifier (e.g., "notebook_run-all-cells")

    Returns:
        Formatted name (e.g., "Notebook run-all-cells")
    """
    if not tool_id:
        return ""

    # Replace underscores with spaces
    name = tool_id.replace("_", " ")

    # Capitalize first letter
    if name:
        name = name[0].upper() + name[1:]

    return name


def tools_to_builtin_list(tools: list[dict[str, Any]]) -> list[BuiltinTool]:
    """
    Convert tool dictionaries to BuiltinTool objects.

    Args:
        tools: List of tool dictionaries with 'name' and optional 'description'

    Returns:
        List of BuiltinTool objects
    """
    builtin_tools = []
    for tool in tools:
        tool_id = tool.get("name", "")
        tool_name = tool.get("description", "")

        # If name is empty, generate from ID
        if not tool_name or not tool_name.strip():
            tool_name = generate_name_from_id(tool_id)

        builtin_tools.append(BuiltinTool(id=tool_id, name=tool_name))

    return builtin_tools


def create_mcp_server(
    base_url: str,
    token: str | None = None,
) -> MCPToolset:
    """
    Create an MCP server connection.

    The MCP server runs on the same server and exposes tools via
    the MCP protocol over HTTP.

    Args:
        base_url: Server base URL (e.g., "http://localhost:8888")
        token: Authentication token

    Returns:
        MCPToolset instance connected to the MCP server
    """
    # Construct the MCP endpoint URL
    mcp_url = urljoin(base_url.rstrip("/") + "/", "mcp")

    logger.info(f"Creating MCP server connection to {mcp_url}")

    # One client, carrying the credential and the trace. `MCPToolset` refuses
    # `headers` beside an `http_client` — deliberately, since two sources of
    # headers is one of them silently losing — so the token goes on the client.
    #
    # The trace goes with every *request* rather than being fixed here: an MCP
    # session is long-lived and spans many of the agent's own spans, so a
    # header set at construction would file every call in the session under
    # whichever trace happened to be current when the connection opened.
    headers = {"Authorization": f"token {token}"} if token else {}
    server = MCPToolset(mcp_url, http_client=tracing_client(headers=headers))
    logger.info(
        "MCP server connection created successfully %s",
        "with authentication" if token else "without authentication",
    )

    return server


async def get_tools_from_mcp(
    base_url: str,
    token: str | None = None,
) -> list[dict[str, Any]]:
    """
    Get available tools from an MCP server.

    Connects to the MCP server using pydantic-ai's MCP client
    and queries tools through the standard MCP protocol.

    Args:
        base_url: Server base URL
        token: Authentication token

    Returns:
        List of tool dictionaries with name, description, and inputSchema
    """
    try:
        server = create_mcp_server(base_url, token)

        # Use the MCP server as a context manager to connect and disconnect
        async with server:
            # List all available tools from the MCP server
            logger.info("Listing tools from MCP server...")
            tools = await server.list_tools()

            logger.info(f"MCP server returned {len(tools)} tools")

            # Convert MCP tool definitions to our internal format
            converted_tools = []
            for tool in tools:
                tool_dict: dict[str, Any] = {
                    "name": tool.name,
                    "description": tool.description or "",
                }

                # Include inputSchema if available. The key stays camelCase —
                # it is the wire name and what the callers read — while the
                # attribute is snake_case since mcp 2.
                if getattr(tool, "input_schema", None):
                    tool_dict["inputSchema"] = tool.input_schema
                elif (
                    hasattr(tool, "parameters_json_schema")
                    and tool.parameters_json_schema
                ):
                    tool_dict["inputSchema"] = tool.parameters_json_schema
                else:
                    tool_dict["inputSchema"] = {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    }

                converted_tools.append(tool_dict)
                logger.debug(f"Converted tool: {tool.name}")

            logger.info(
                f"Successfully retrieved {len(converted_tools)} tools from MCP server"
            )
            return converted_tools

    except Exception as e:
        logger.error(
            f"Error connecting to MCP server at {base_url}: {e}", exc_info=True
        )
        return []


async def get_available_tools(
    base_url: str,
    token: str | None = None,
    enabled_only: bool = True,
) -> list[dict[str, Any]]:
    """
    Get available tools (backward compatible wrapper).

    Args:
        base_url: Server base URL
        token: Authentication token
        enabled_only: Ignored (kept for backward compatibility)

    Returns:
        List of tool dictionaries
    """
    # Note: enabled_only is ignored as MCP server manages this internally
    return await get_tools_from_mcp(base_url, token)


def extract_tool_names(tools: list[dict[str, Any]]) -> list[str]:
    """
    Extract tool names from tools list.

    Args:
        tools: List of tool dictionaries

    Returns:
        List of tool names/IDs
    """
    return [tool.get("name", "") for tool in tools if tool.get("name")]

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pydantic models for chat functionality."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    """Chat request from frontend."""

    model: Optional[str] = Field(None, description="Model to use for this request")
    builtin_tools: List[str] = Field(
        default_factory=list, description="Enabled builtin tools"
    )
    messages: List[Dict[str, Any]] = Field(
        default_factory=list, description="Conversation messages"
    )


class AIModel(BaseModel):
    """Configuration for an AI model."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(
        ..., description="Model identifier (e.g., 'anthropic:claude-sonnet-4-5')"
    )
    name: str = Field(..., description="Display name for the model")
    builtin_tools: List[str] = Field(
        default_factory=list,
        description="List of builtin tool IDs",
        serialization_alias="builtinTools",
    )
    required_env_vars: List[str] = Field(
        default_factory=list,
        description="Required environment variables for this model",
        serialization_alias="requiredEnvVars",
    )
    is_available: bool = Field(
        default=True,
        description="Whether the model is available (based on env vars)",
        serialization_alias="isAvailable",
    )


class BuiltinTool(BaseModel):
    """Configuration for a builtin tool."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Tool identifier")
    name: str = Field(..., description="Display name for the tool")


class MCPServerTool(BaseModel):
    """A tool provided by an MCP server."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    name: str = Field(..., description="Tool name/identifier")
    description: str = Field(default="", description="Tool description")
    enabled: bool = Field(default=True, description="Whether the tool is enabled")
    input_schema: Optional[Dict[str, Any]] = Field(
        default=None,
        description="JSON schema for tool input parameters",
        serialization_alias="inputSchema",
    )


class MCPServer(BaseModel):
    """Configuration for an MCP server."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique server identifier")
    name: str = Field(..., description="Display name for the server")
    url: str = Field(default="", description="Server URL (for HTTP-based servers)")
    enabled: bool = Field(default=True, description="Whether the server is enabled")
    tools: List[MCPServerTool] = Field(
        default_factory=list, description="List of available tools"
    )
    # Fields for stdio-based MCP servers
    command: Optional[str] = Field(
        default=None,
        description="Command to run the MCP server (e.g., 'npx', 'uvx')",
    )
    args: List[str] = Field(
        default_factory=list,
        description="Command arguments for the MCP server",
    )
    is_available: bool = Field(
        default=False,
        description="Whether the server is available (based on tool discovery)",
        serialization_alias="isAvailable",
    )
    transport: str = Field(
        default="stdio",
        description="Transport type: 'stdio' or 'http'",
    )


class FrontendConfig(BaseModel):
    """Configuration returned to frontend."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    models: List[AIModel] = Field(
        default_factory=list, description="Available AI models"
    )
    builtin_tools: List[BuiltinTool] = Field(
        default_factory=list,
        description="Available builtin tools",
        serialization_alias="builtinTools",
    )
    mcp_servers: List[MCPServer] = Field(
        default_factory=list,
        description="Configured MCP servers",
        serialization_alias="mcpServers",
    )

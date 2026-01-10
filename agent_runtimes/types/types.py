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


class MCPServer(BaseModel):
    """Configuration for an MCP server."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Unique server identifier")
    name: str = Field(..., description="Display name for the server")
    url: str = Field(..., description="Server URL")
    enabled: bool = Field(default=True, description="Whether the server is enabled")
    tools: List[str] = Field(
        default_factory=list, description="List of available tool names"
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

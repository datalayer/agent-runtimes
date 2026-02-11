# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pydantic models for chat functionality and agent specifications."""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class EnvvarSpec(BaseModel):
    """
    Specification for an environment variable.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique environment variable identifier")
    name: str = Field(..., description="Display name for the environment variable")
    description: str = Field(default="", description="Environment variable description")
    registration_url: Optional[str] = Field(
        default=None,
        description="URL where users can register to obtain this variable",
        alias="registrationUrl",
    )
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )


class SkillSpec(BaseModel):
    """
    Specification for a skill.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique skill identifier")
    name: str = Field(..., description="Display name for the skill")
    description: str = Field(default="", description="Skill description")
    module: Optional[str] = Field(default=None, description="Python module path")
    envvars: List[str] = Field(
        default_factory=list,
        description="Environment variable IDs required by this skill",
    )
    dependencies: List[str] = Field(
        default_factory=list, description="Python package dependencies"
    )
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )


class AgentSkillSpec(BaseModel):
    """
    Specification for an agent skill.

    Simplified version of the full Skill type from agent-skills,
    containing only the fields needed for agent specification.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique skill identifier")
    name: str = Field(..., description="Display name for the skill")
    description: str = Field(default="", description="Skill description")
    version: str = Field(default="1.0.0", description="Skill version")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    enabled: bool = Field(default=True, description="Whether the skill is enabled")


class AgentStatus(str, Enum):
    """
    Status of an agent space.
    """

    STARTING = "starting"
    RUNNING = "running"
    PAUSED = "paused"
    TERMINATED = "terminated"
    ARCHIVED = "archived"


class ChatRequest(BaseModel):
    """
    Chat request from frontend.
    """

    model: Optional[str] = Field(None, description="Model to use for this request")
    builtin_tools: List[str] = Field(
        default_factory=list, description="Enabled builtin tools"
    )
    messages: List[Dict[str, Any]] = Field(
        default_factory=list, description="Conversation messages"
    )


class AIModel(BaseModel):
    """
    Configuration for an AI model.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(
        ..., description="Model identifier (e.g., 'anthropic:claude-sonnet-4-5')"
    )
    name: str = Field(..., description="Display name for the model")
    builtin_tools: List[str] = Field(
        default_factory=list,
        description="List of builtin tool IDs",
        alias="builtinTools",
    )
    required_env_vars: List[str] = Field(
        default_factory=list,
        description="Required environment variables for this model",
        alias="requiredEnvVars",
    )
    is_available: bool = Field(
        default=True,
        description="Whether the model is available (based on env vars)",
        alias="isAvailable",
    )


class BuiltinTool(BaseModel):
    """
    Configuration for a builtin tool.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Tool identifier")
    name: str = Field(..., description="Display name for the tool")


class MCPServerTool(BaseModel):
    """
    A tool provided by an MCP server.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    name: str = Field(..., description="Tool name/identifier")
    description: str = Field(default="", description="Tool description")
    enabled: bool = Field(default=True, description="Whether the tool is enabled")
    input_schema: Optional[Dict[str, Any]] = Field(
        default=None,
        description="JSON schema for tool input parameters",
        alias="inputSchema",
    )


class MCPServer(BaseModel):
    """
    Configuration for an MCP server.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique server identifier")
    name: str = Field(..., description="Display name for the server")
    description: str = Field(
        default="", description="Description of the server capabilities"
    )
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )
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
    env: Optional[Dict[str, str]] = Field(
        default=None,
        description="Environment variables for the MCP server process",
    )
    required_env_vars: List[str] = Field(
        default_factory=list,
        description="Environment variables required for this server to work",
        alias="requiredEnvVars",
    )
    is_available: bool = Field(
        default=False,
        description="Whether the server is available (based on env var presence)",
        alias="isAvailable",
    )
    transport: str = Field(
        default="stdio",
        description="Transport type: 'stdio' or 'http'",
    )
    is_config: bool = Field(
        default=False,
        description="Whether this server is from mcp.json config (vs catalog)",
        alias="isConfig",
    )
    is_running: bool = Field(
        default=False,
        description="Whether this server is currently running",
        alias="isRunning",
    )


class FrontendConfig(BaseModel):
    """
    Configuration returned to frontend.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    models: List[AIModel] = Field(
        default_factory=list, description="Available AI models"
    )
    builtin_tools: List[BuiltinTool] = Field(
        default_factory=list,
        description="Available builtin tools",
        alias="builtinTools",
    )
    mcp_servers: List[MCPServer] = Field(
        default_factory=list,
        description="Configured MCP servers",
        alias="mcpServers",
    )


class AgentSpec(BaseModel):
    """
    Specification for an AI agent.

    Defines the configuration for a reusable agent template that can be
    instantiated as an AgentSpace.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique agent identifier")
    name: str = Field(..., description="Display name for the agent")
    description: str = Field(default="", description="Agent description")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    enabled: bool = Field(default=True, description="Whether the agent is enabled")
    mcp_servers: List[MCPServer] = Field(
        default_factory=list,
        description="MCP servers used by this agent",
        alias="mcpServers",
    )
    skills: List[str] = Field(
        default_factory=list,
        description="Skill IDs available to this agent",
    )
    environment_name: str = Field(
        default="ai-agents-env",
        description="Runtime environment name for this agent",
        alias="environmentName",
    )
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )
    color: Optional[str] = Field(
        default=None,
        description="Theme color for the agent (hex code)",
    )
    suggestions: List[str] = Field(
        default_factory=list,
        description="Chat suggestions to show users what this agent can do",
    )
    welcome_message: Optional[str] = Field(
        default=None,
        description="Welcome message shown when agent starts",
        alias="welcomeMessage",
    )
    welcome_notebook: Optional[str] = Field(
        default=None,
        description="Path to Jupyter notebook to show on agent creation",
        alias="welcomeNotebook",
    )
    welcome_document: Optional[str] = Field(
        default=None,
        description="Path to Lexical document to show on agent creation",
        alias="welcomeDocument",
    )
    system_prompt: Optional[str] = Field(
        default=None,
        description="System prompt for the agent",
        alias="systemPrompt",
    )
    system_prompt_codemode_addons: Optional[str] = Field(
        default=None,
        description="Additional system prompt instructions when codemode is enabled",
        alias="systemPromptCodemodeAddons",
    )

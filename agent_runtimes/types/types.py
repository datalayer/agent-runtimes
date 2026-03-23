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


class ToolSpec(BaseModel):
    """
    Specification for a runtime tool.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique tool identifier")
    name: str = Field(..., description="Display name for the tool")
    description: str = Field(default="", description="Tool description")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    enabled: bool = Field(default=True, description="Whether the tool is enabled")
    approval: str = Field(
        default="auto",
        description="Approval policy for the tool ('auto' or 'manual')",
    )
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
    Status of an agent runtime.
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


class AIModelRuntime(BaseModel):
    """
    Runtime configuration for an AI model.
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

    models: List[AIModelRuntime] = Field(
        default_factory=list, description="Available AI models"
    )
    default_model: Optional[str] = Field(
        default=None,
        description="Default model ID to select",
        alias="defaultModel",
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
    instantiated as an agent runtime.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique agent identifier")
    name: str = Field(..., description="Display name for the agent")
    description: str = Field(default="", description="Agent description")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    enabled: bool = Field(default=True, description="Whether the agent is enabled")
    model: Optional[str] = Field(
        default=None,
        description="AI model identifier to use for this agent (e.g., 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0')",
    )
    mcp_servers: List[MCPServer] = Field(
        default_factory=list,
        description="MCP servers used by this agent",
        alias="mcpServers",
    )
    skills: List[str] = Field(
        default_factory=list,
        description="Skill IDs available to this agent",
    )
    tools: List[str] = Field(
        default_factory=list,
        description="Tool IDs available to this agent",
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
    sandbox_variant: Optional[str] = Field(
        default=None,
        description=(
            "Sandbox variant to use for this agent. "
            "Accepted values: 'local-eval' (default), 'jupyter' (per-agent Jupyter server), "
            "'local-jupyter' (existing Jupyter server)."
        ),
        alias="sandboxVariant",
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
    goal: Optional[str] = Field(
        default=None,
        description="User-facing objective for the agent",
    )
    protocol: Optional[str] = Field(
        default=None,
        description="Communication protocol (e.g., 'ag-ui', 'acp', 'a2a', 'vercel-ai')",
    )
    ui_extension: Optional[str] = Field(
        default=None,
        description="UI extension type (e.g., 'a2ui', 'mcp-apps')",
        alias="uiExtension",
    )
    trigger: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Trigger configuration (type, cron, description)",
    )
    model_configuration: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Model configuration (temperature, max_tokens)",
        alias="modelConfig",
    )
    mcp_server_tools: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="MCP server tool configurations with approval settings",
        alias="mcpServerTools",
    )
    guardrails: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Guardrail configurations",
    )
    evals: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Evaluation configurations",
    )
    codemode: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Codemode configuration (enabled, token_reduction, speedup)",
    )
    output: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Output configuration (type/formats, template)",
    )
    advanced: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Advanced settings (cost_limit, time_limit, max_iterations, validation)",
    )
    authorization_policy: Optional[str] = Field(
        default=None,
        description="Authorization policy",
        alias="authorizationPolicy",
    )
    notifications: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Notification configuration (email, slack)",
    )
    memory: Optional[str] = Field(
        default=None,
        description="Memory backend identifier (e.g., 'ephemeral', 'mem0', 'memu', 'simplemem')",
    )


class TeamAgentSpec(BaseModel):
    """Specification for an agent within a team."""

    id: str = Field(..., description="Agent identifier within the team")
    name: str = Field(..., description="Display name for the team agent")
    role: str = Field(
        default="",
        description="Role within the team (e.g., 'Primary · Initiator', 'Secondary', 'Final')",
    )
    goal: str = Field(default="", description="Goal or objective for this agent")
    model: str = Field(default="", description="AI model identifier")
    mcp_server: str = Field(
        default="", description="MCP server used by this agent", alias="mcpServer"
    )
    tools: list[str] = Field(
        default_factory=list, description="Tools available to this agent"
    )
    trigger: str = Field(default="", description="Trigger condition for this agent")
    approval: str = Field(
        default="auto", description="Approval policy: 'auto' or 'manual'"
    )

    model_config = {"populate_by_name": True}


class TeamSupervisorSpec(BaseModel):
    """Specification for a team supervisor agent."""

    name: str = Field(..., description="Supervisor agent name")
    model: str = Field(default="", description="AI model used by the supervisor")


class TeamValidationSpec(BaseModel):
    """Validation settings for a team."""

    timeout: Optional[str] = Field(
        default=None, description="Maximum execution time (e.g., '300s')"
    )
    retry_on_failure: bool = Field(
        default=False, description="Whether to retry on failure", alias="retryOnFailure"
    )
    max_retries: int = Field(
        default=0, description="Maximum number of retries", alias="maxRetries"
    )

    model_config = {"populate_by_name": True}


class TeamReactionRule(BaseModel):
    """A reaction rule for automated team responses."""

    id: str = Field(..., description="Unique reaction rule identifier")
    trigger: str = Field(..., description="Event or condition that triggers this rule")
    action: str = Field(..., description="Action to take when triggered")
    auto: bool = Field(
        default=True, description="Whether the rule executes automatically"
    )
    max_retries: int = Field(
        default=1, description="Maximum retry attempts", alias="maxRetries"
    )
    escalate_after_retries: int = Field(
        default=1,
        description="Escalate after this many retries",
        alias="escalateAfterRetries",
    )
    priority: str = Field(
        default="medium",
        description="Priority level: 'low', 'medium', 'high', 'critical'",
    )

    model_config = {"populate_by_name": True}


class TeamHealthMonitoring(BaseModel):
    """Health monitoring configuration for a team."""

    heartbeat_interval: str = Field(
        default="30s",
        description="Interval between heartbeat checks",
        alias="heartbeatInterval",
    )
    stale_threshold: str = Field(
        default="120s",
        description="Time before an agent is considered stale",
        alias="staleThreshold",
    )
    unresponsive_threshold: str = Field(
        default="300s",
        description="Time before an agent is considered unresponsive",
        alias="unresponsiveThreshold",
    )
    stuck_threshold: str = Field(
        default="600s",
        description="Time before an agent is considered stuck",
        alias="stuckThreshold",
    )
    max_restart_attempts: int = Field(
        default=3,
        description="Maximum restart attempts for unhealthy agents",
        alias="maxRestartAttempts",
    )

    model_config = {"populate_by_name": True}


class TeamOutputSpec(BaseModel):
    """Output configuration for a team."""

    formats: list[str] = Field(
        default_factory=list, description="Output formats (e.g., 'pdf', 'csv', 'json')"
    )
    template: str = Field(default="", description="Report template name")
    storage: str = Field(default="", description="Storage location (e.g., S3 path)")


class TeamSpec(BaseModel):
    """Specification for a multi-agent team."""

    id: str = Field(..., description="Unique team identifier")
    name: str = Field(..., description="Display name for the team")
    description: str = Field(default="", description="Team description")
    tags: list[str] = Field(default_factory=list, description="Classification tags")
    enabled: bool = Field(default=False, description="Whether the team is enabled")
    icon: str = Field(default="people", description="Icon identifier")
    emoji: str = Field(default="👥", description="Emoji representation")
    color: str = Field(default="#8250df", description="Theme color (hex)")
    agent_spec_id: str = Field(
        ...,
        description="ID of the associated agent spec",
        alias="agentSpecId",
    )
    orchestration_protocol: str = Field(
        default="datalayer",
        description="Orchestration protocol (e.g., 'datalayer')",
        alias="orchestrationProtocol",
    )
    execution_mode: str = Field(
        default="sequential",
        description="Execution mode: 'sequential' or 'parallel'",
        alias="executionMode",
    )
    supervisor: Optional[TeamSupervisorSpec] = Field(
        default=None,
        description="Supervisor agent configuration",
    )
    routing_instructions: str = Field(
        default="",
        description="Instructions for routing tasks between agents",
        alias="routingInstructions",
    )
    validation: Optional[TeamValidationSpec] = Field(
        default=None,
        description="Validation settings for the team",
    )
    agents: list[TeamAgentSpec] = Field(
        default_factory=list,
        description="List of agents in the team",
    )
    reaction_rules: list[TeamReactionRule] = Field(
        default_factory=list,
        description="Automated reaction rules",
        alias="reactionRules",
    )
    health_monitoring: Optional[TeamHealthMonitoring] = Field(
        default=None,
        description="Health monitoring configuration",
        alias="healthMonitoring",
    )
    output: Optional[TeamOutputSpec] = Field(
        default=None,
        description="Output configuration",
    )

    model_config = {"populate_by_name": True}

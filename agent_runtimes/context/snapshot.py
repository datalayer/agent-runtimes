# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Context snapshot extraction for agents.

Extracts current context information from pydantic-ai agents including:
- System prompts
- Tool definitions
- Message history (user/assistant messages)
- Token counts (using tiktoken when available, estimation otherwise)
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Sequence

logger = logging.getLogger(__name__)


# Model context window sizes (in tokens)
# Sources: Official documentation for each provider
MODEL_CONTEXT_WINDOWS: dict[str, int] = {
    # Anthropic Claude models
    "claude-3-opus": 200000,
    "claude-3-sonnet": 200000,
    "claude-3-haiku": 200000,
    "claude-3.5-sonnet": 200000,
    "claude-3.5-haiku": 200000,
    "claude-sonnet-4": 200000,
    "claude-sonnet-4-0": 200000,
    "claude-opus-4": 200000,
    "claude-4-sonnet": 200000,
    "claude-4-opus": 200000,
    # OpenAI GPT models
    "gpt-4": 8192,
    "gpt-4-32k": 32768,
    "gpt-4-turbo": 128000,
    "gpt-4-turbo-preview": 128000,
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4.1": 1000000,
    "gpt-4.1-mini": 1000000,
    "gpt-4.1-nano": 1000000,
    "o1": 200000,
    "o1-mini": 128000,
    "o1-preview": 128000,
    "o3": 200000,
    "o3-mini": 200000,
    "o4-mini": 200000,
    # Google Gemini models
    "gemini-pro": 32000,
    "gemini-1.5-pro": 2000000,
    "gemini-1.5-flash": 1000000,
    "gemini-2.0-flash": 1000000,
    "gemini-2.5-pro": 1000000,
    "gemini-2.5-flash": 1000000,
    # Mistral models
    "mistral-tiny": 32000,
    "mistral-small": 32000,
    "mistral-medium": 32000,
    "mistral-large": 128000,
    # Groq models (context varies by model)
    "llama-3.1-70b": 131072,
    "llama-3.1-8b": 131072,
    "llama-3.2-90b": 131072,
    "mixtral-8x7b": 32768,
    # AWS Bedrock Claude models
    "anthropic.claude-3-opus": 200000,
    "anthropic.claude-3-sonnet": 200000,
    "anthropic.claude-3-haiku": 200000,
    "anthropic.claude-3.5-sonnet": 200000,
    "anthropic.claude-sonnet-4": 200000,
    "us.anthropic.claude-sonnet-4": 200000,
    "us.anthropic.claude-sonnet-4-5": 200000,
}


def get_model_context_window(model: str) -> int:
    """Get context window size for a model.
    
    Args:
        model: Model identifier (e.g., "anthropic:claude-sonnet-4-0", "openai:gpt-4o")
        
    Returns:
        Context window size in tokens. Defaults to 128000 if model not found.
    """
    # Strip provider prefix (e.g., "anthropic:", "openai:", "bedrock:")
    model_name = model
    if ":" in model:
        model_name = model.split(":", 1)[1]
    
    # Direct match
    if model_name in MODEL_CONTEXT_WINDOWS:
        return MODEL_CONTEXT_WINDOWS[model_name]
    
    # Try partial matching (for versioned models like claude-sonnet-4-5-20250929-v1:0)
    model_lower = model_name.lower()
    for key, value in MODEL_CONTEXT_WINDOWS.items():
        if key in model_lower or model_lower.startswith(key):
            return value
    
    # Default fallback
    logger.debug("Unknown model '%s', using default context window of 128000", model)
    return 128000


# Token counting with tiktoken (accurate) or fallback to estimation
_tokenizer: Callable[[str], int] | None = None
_tokenizer_initialized = False


def _init_tokenizer() -> None:
    """Initialize the tokenizer (tiktoken if available, else estimation)."""
    global _tokenizer, _tokenizer_initialized
    if _tokenizer_initialized:
        return
    _tokenizer_initialized = True
    
    try:
        import tiktoken
        # Use cl100k_base encoding (used by GPT-4, Claude, and most modern models)
        encoding = tiktoken.get_encoding("cl100k_base")
        _tokenizer = lambda text: len(encoding.encode(text)) if text else 0
        logger.debug("Using tiktoken for accurate token counting")
    except ImportError:
        logger.debug("tiktoken not available, using character-based estimation")
        _tokenizer = None


def count_tokens(text: str) -> int:
    """Count tokens in text using tiktoken if available, else estimate.
    
    Uses cl100k_base encoding (GPT-4/Claude compatible) when tiktoken is available.
    Falls back to ~4 chars per token estimation otherwise.
    """
    if not text:
        return 0
    
    _init_tokenizer()
    
    if _tokenizer is not None:
        try:
            return _tokenizer(text)
        except Exception:
            pass
    
    # Fallback: ~4 characters per token for English text
    return len(text) // 4


def count_tokens_json(obj: Any) -> int:
    """Count tokens for a JSON-serializable object."""
    try:
        return count_tokens(json.dumps(obj, default=str))
    except Exception:
        return count_tokens(str(obj))


# Keep old names for backward compatibility
estimate_tokens = count_tokens
estimate_tokens_json = count_tokens_json


@dataclass
class ToolSnapshot:
    """Snapshot of a tool definition."""
    name: str
    description: str | None
    parameters_tokens: int
    total_tokens: int


@dataclass
class MessageSnapshot:
    """Snapshot of a single message."""
    role: str  # "user", "assistant", "system"
    content: str
    estimated_tokens: int
    timestamp: str | None = None


@dataclass
class RequestUsageSnapshot:
    """Snapshot of a single model request's usage."""
    request_num: int  # 1-indexed request number
    input_tokens: int
    output_tokens: int
    tool_names: list[str] = field(default_factory=list)  # Tools called in this request


@dataclass
class TurnUsage:
    """Usage statistics for a single turn (user prompt + agent response)."""
    input_tokens: int = 0
    output_tokens: int = 0
    requests: int = 0
    tool_calls: int = 0
    tool_names: list[str] = field(default_factory=list)


@dataclass
class SessionUsage:
    """Cumulative usage statistics across all turns in a session."""
    input_tokens: int = 0
    output_tokens: int = 0
    requests: int = 0
    tool_calls: int = 0


@dataclass
class ContextSnapshot:
    """Complete snapshot of agent context."""
    agent_id: str
    
    # System prompts
    system_prompts: list[str] = field(default_factory=list)
    system_prompt_tokens: int = 0
    
    # Tool definitions (schemas sent in context)
    tools: list[ToolSnapshot] = field(default_factory=list)
    tool_tokens: int = 0
    
    # Tool usage (calls and returns during conversation)
    history_tool_call_tokens: int = 0  # Tool calls from previous turns
    history_tool_return_tokens: int = 0  # Tool returns from previous turns
    current_tool_call_tokens: int = 0  # Tool calls from current turn
    current_tool_return_tokens: int = 0  # Tool returns from current turn
    # Aggregate fields
    tool_call_tokens: int = 0  # Total tool call tokens
    tool_return_tokens: int = 0  # Total tool return tokens
    
    # Message history (previous turns) - broken down by role
    messages: list[MessageSnapshot] = field(default_factory=list)
    history_user_tokens: int = 0  # User messages from previous turns
    history_assistant_tokens: int = 0  # Assistant messages from previous turns
    
    # Current turn messages
    current_user_tokens: int = 0  # Current user message
    current_assistant_tokens: int = 0  # Current assistant response
    
    # Legacy/aggregate fields for backward compatibility
    history_tokens: int = 0  # Total history: history_user_tokens + history_assistant_tokens
    current_message_tokens: int = 0  # Alias for current_user_tokens
    assistant_message_tokens: int = 0  # Total assistant: history_assistant + current_assistant
    user_message_tokens: int = 0  # Total user: history_user + current_user
    
    # Total context
    total_tokens: int = 0  # Our estimate based on tiktoken
    model_input_tokens: int | None = None  # Model's reported input tokens (authoritative, from result.usage)
    model_output_tokens: int | None = None  # Model's reported output tokens
    sum_response_input_tokens: int = 0  # Sum of input_tokens from all ModelResponse.usage
    sum_response_output_tokens: int = 0  # Sum of output_tokens from all ModelResponse.usage
    per_request_usage: list[RequestUsageSnapshot] = field(default_factory=list)  # Per-request token usage
    context_window: int = 128000  # Default context window
    
    # Turn and session usage (set by caller)
    turn_usage: TurnUsage | None = None
    session_usage: SessionUsage | None = None
    
    def get_context_total(self) -> int:
        """Get total context tokens (what's in the context window)."""
        history_total = (
            self.history_user_tokens +
            self.history_assistant_tokens +
            self.history_tool_call_tokens +
            self.history_tool_return_tokens
        )
        return (
            self.system_prompt_tokens +
            self.tool_tokens +
            history_total +
            self.current_user_tokens
        )
    
    def get_context_percentage(self) -> float:
        """Get context usage as percentage of context window."""
        if self.context_window == 0:
            return 0.0
        return (self.get_context_total() / self.context_window) * 100
    
    def get_history_total(self) -> int:
        """Get total history tokens (including tool usage from previous turns)."""
        return (
            self.history_user_tokens +
            self.history_assistant_tokens +
            self.history_tool_call_tokens +
            self.history_tool_return_tokens
        )
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "agentId": self.agent_id,
            "systemPrompts": self.system_prompts,
            "systemPromptTokens": self.system_prompt_tokens,
            "tools": [
                {
                    "name": t.name,
                    "description": t.description,
                    "parametersTokens": t.parameters_tokens,
                    "totalTokens": t.total_tokens,
                }
                for t in self.tools
            ],
            "toolTokens": self.tool_tokens,
            "historyToolCallTokens": self.history_tool_call_tokens,
            "historyToolReturnTokens": self.history_tool_return_tokens,
            "currentToolCallTokens": self.current_tool_call_tokens,
            "currentToolReturnTokens": self.current_tool_return_tokens,
            "toolCallTokens": self.tool_call_tokens,
            "toolReturnTokens": self.tool_return_tokens,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content[:200] + "..." if len(m.content) > 200 else m.content,
                    "estimatedTokens": m.estimated_tokens,
                    "timestamp": m.timestamp,
                }
                for m in self.messages
            ],
            "historyUserTokens": self.history_user_tokens,
            "historyAssistantTokens": self.history_assistant_tokens,
            "currentUserTokens": self.current_user_tokens,
            "currentAssistantTokens": self.current_assistant_tokens,
            # Aggregate fields
            "historyTokens": self.history_tokens,
            "currentMessageTokens": self.current_message_tokens,
            "userMessageTokens": self.user_message_tokens,
            "assistantMessageTokens": self.assistant_message_tokens,
            "totalTokens": self.total_tokens,
            "modelInputTokens": self.model_input_tokens,
            "modelOutputTokens": self.model_output_tokens,
            "sumResponseInputTokens": self.sum_response_input_tokens,
            "sumResponseOutputTokens": self.sum_response_output_tokens,
            "perRequestUsage": [
                {
                    "requestNum": r.request_num,
                    "inputTokens": r.input_tokens,
                    "outputTokens": r.output_tokens,
                    "toolNames": r.tool_names,
                }
                for r in self.per_request_usage
            ],
            "contextWindow": self.context_window,
            # Turn and session usage
            "turnUsage": {
                "inputTokens": self.turn_usage.input_tokens if self.turn_usage else 0,
                "outputTokens": self.turn_usage.output_tokens if self.turn_usage else 0,
                "requests": self.turn_usage.requests if self.turn_usage else 0,
                "toolCalls": self.turn_usage.tool_calls if self.turn_usage else 0,
                "toolNames": self.turn_usage.tool_names if self.turn_usage else [],
            } if self.turn_usage else None,
            "sessionUsage": {
                "inputTokens": self.session_usage.input_tokens if self.session_usage else 0,
                "outputTokens": self.session_usage.output_tokens if self.session_usage else 0,
                "requests": self.session_usage.requests if self.session_usage else 0,
                "toolCalls": self.session_usage.tool_calls if self.session_usage else 0,
            } if self.session_usage else None,
            # Distribution data for treemap
            "distribution": self._build_distribution(),
        }
    
    def to_table(self) -> "Table":
        """Generate a Rich Table for CLI display.
        
        Returns a 3-section table:
        - CONTEXT: System prompts, tool definitions, history, current user (with % of context window)
        - THIS TURN: Tool calls, requests, input/output tokens for current turn
        - SESSION: Cumulative totals across all turns
        """
        from rich.table import Table
        from rich import box
        
        table = Table(show_header=True, box=box.ROUNDED, padding=(0, 1))
        table.add_column("", style="dim", width=20)
        table.add_column("#", justify="right", width=24)
        table.add_column("", width=40)
        
        # CONTEXT section - these are estimates (tiktoken may differ from model's tokenizer)
        table.add_row("[bold cyan]═══ CONTEXT ═══[/]", "[dim]Tokens[/]", "[dim](estimated)[/]")
        table.add_row("  System Prompts", str(self.system_prompt_tokens), "")
        table.add_row("  Tool Definitions", str(self.tool_tokens), "")
        table.add_row("  History", str(self.get_history_total()), "")
        table.add_row("  User", str(self.current_user_tokens), "")
        
        context_total = self.get_context_total()
        context_pct = self.get_context_percentage()
        window_str = f"{self.context_window // 1000}K" if self.context_window else "?"
        table.add_row(
            "  [bold]→ Total[/]",
            f"[bold]{context_total}[/]",
            f"[dim]{context_pct:.1f}% of {window_str}[/]"
        )
        
        # Separator
        table.add_section()
        
        # THIS TURN section - these are from the model (authoritative)
        table.add_row("[bold yellow]═══ TURN ═══[/]", "[dim]Count[/]", "")
        if self.turn_usage:
            tool_names_str = ", ".join(self.turn_usage.tool_names) if self.turn_usage.tool_names else ""
            table.add_row("  Tool Calls", str(self.turn_usage.tool_calls), f"[dim]{tool_names_str}[/]")
            table.add_row("  Requests", str(self.turn_usage.requests), "")
            table.add_row("", "[dim]Tokens[/]", "[dim](from model)[/]")
            
            # Show per-request breakdown if there are multiple requests
            if self.per_request_usage and len(self.per_request_usage) > 0:
                # Get requests for this turn (last N where N = turn_usage.requests)
                turn_requests = self.per_request_usage[-self.turn_usage.requests:] if self.turn_usage.requests > 0 else []
                
                if len(turn_requests) > 1:
                    # Show individual requests
                    for req in turn_requests:
                        tools_str = f"[dim]{', '.join(req.tool_names)}[/]" if req.tool_names else ""
                        table.add_row(
                            f"    Request {req.request_num}",
                            f"{req.input_tokens} in / {req.output_tokens} out",
                            tools_str
                        )
                    # Show totals
                    table.add_row("  [bold]Total Input[/]", f"[bold]{self.turn_usage.input_tokens}[/]", "")
                    table.add_row("  [bold]Total Output[/]", f"[bold]{self.turn_usage.output_tokens}[/]", "")
                else:
                    # Single request, just show totals
                    table.add_row("  Total Input", str(self.turn_usage.input_tokens), "")
                    table.add_row("  Total Output", str(self.turn_usage.output_tokens), "")
            else:
                table.add_row("  Total Input", str(self.turn_usage.input_tokens), "")
                table.add_row("  Total Output", str(self.turn_usage.output_tokens), "")
        else:
            table.add_row("  [dim]No usage data[/]", "", "")
        
        # Separator
        table.add_section()
        
        # SESSION section
        table.add_row("[bold green]═══ SESSION ═══[/]", "[dim]Count[/]", "")
        if self.session_usage:
            table.add_row("  Tool Calls", str(self.session_usage.tool_calls), "")
            table.add_row("  Requests", str(self.session_usage.requests), "")
            table.add_row("", "[dim]Tokens[/]", "[dim](from model)[/]")
            table.add_row("  Total Input", str(self.session_usage.input_tokens), "")
            table.add_row("  Total Output", str(self.session_usage.output_tokens), "")
        else:
            table.add_row("  [dim]No session data[/]", "", "")
        
        return table
    
    def _build_distribution(self) -> dict[str, Any]:
        """Build distribution data for treemap visualization."""
        children = []
        
        # System prompts category
        if self.system_prompt_tokens > 0:
            children.append({
                "name": "System Prompts",
                "value": self.system_prompt_tokens,
            })
        
        # Tools category (definitions)
        if self.tool_tokens > 0:
            children.append({
                "name": "Tool Definitions",
                "value": self.tool_tokens,
            })
        
        # History section
        if self.history_user_tokens > 0:
            children.append({
                "name": "History: User",
                "value": self.history_user_tokens,
            })
        
        if self.history_assistant_tokens > 0:
            children.append({
                "name": "History: Assistant",
                "value": self.history_assistant_tokens,
            })
        
        history_tool_usage = self.history_tool_call_tokens + self.history_tool_return_tokens
        if history_tool_usage > 0:
            children.append({
                "name": "History: Tool Usage",
                "value": history_tool_usage,
            })
        
        # Current section
        if self.current_user_tokens > 0:
            children.append({
                "name": "Current: User",
                "value": self.current_user_tokens,
            })
        
        if self.current_assistant_tokens > 0:
            children.append({
                "name": "Current: Assistant",
                "value": self.current_assistant_tokens,
            })
        
        current_tool_usage = self.current_tool_call_tokens + self.current_tool_return_tokens
        if current_tool_usage > 0:
            children.append({
                "name": "Current: Tool Usage",
                "value": current_tool_usage,
            })
        
        return {
            "name": "Context",
            "value": self.total_tokens,
            "children": children,
        }


def _extract_message_content(part: Any) -> str:
    """Extract text content from a message part."""
    # Handle different part types from pydantic-ai messages
    if hasattr(part, "content"):
        content = part.content
        if isinstance(content, str):
            return content
        elif hasattr(content, "__str__"):
            return str(content)
    if hasattr(part, "text"):
        return part.text or ""
    return str(part) if part else ""


async def list_available_tools(
    toolsets: Sequence[Any],
) -> list[tuple[str, str | None, dict]]:
    """List all available tools from toolsets.
    
    This is the preferred async method for extracting tool definitions.
    It properly handles CodemodeToolset's registry discovery.
    
    Args:
        toolsets: Sequence of pydantic-ai toolsets.
        
    Returns:
        List of (name, description, parameters_schema) tuples.
    """
    tools: list[tuple[str, str | None, dict]] = []
    
    for toolset in toolsets:
        toolset_class_name = toolset.__class__.__name__
        logger.debug("Processing toolset: %s", toolset_class_name)
        
        # Handle CodemodeToolset - use registry for proper discovery
        if toolset_class_name == "CodemodeToolset":
            registry = getattr(toolset, "registry", None)
            if registry is not None:
                # Ensure tools are discovered
                if not registry.list_tools():
                    await registry.discover_all()
                
                for tool in registry.list_tools(include_deferred=True):
                    # Get tool schema from registry
                    schema = getattr(tool, "input_schema", {}) or getattr(tool, "parameters", {}) or {}
                    tools.append((tool.name, tool.description, schema))
                continue
        
        # Handle MCP servers with async tools() method
        if hasattr(toolset, "tools") and callable(toolset.tools):
            try:
                import inspect
                if inspect.iscoroutinefunction(toolset.tools):
                    mcp_tools = await toolset.tools()
                    for tool in mcp_tools:
                        tools.append((
                            tool.name,
                            getattr(tool, "description", None),
                            getattr(tool, "inputSchema", {}) or {},
                        ))
                    continue
            except Exception as e:
                logger.debug("Could not get tools from async tools() method: %s", e)
        
        # Handle FunctionToolset which has _tools attribute
        if hasattr(toolset, "_tools"):
            for tool in toolset._tools.values():
                if hasattr(tool, "definition"):
                    tool_def = tool.definition
                    tools.append((
                        getattr(tool_def, "name", str(tool)),
                        getattr(tool_def, "description", None),
                        getattr(tool_def, "parameters_json_schema", {}),
                    ))
                elif hasattr(tool, "name"):
                    tools.append((
                        tool.name,
                        getattr(tool, "description", None),
                        getattr(tool, "parameters_json_schema", {}),
                    ))
        
        # Handle MCP servers with cached tools
        if hasattr(toolset, "_cached_tools") and toolset._cached_tools is not None:
            cached = toolset._cached_tools
            if isinstance(cached, list):
                for tool in cached:
                    name = getattr(tool, "name", None)
                    if name:
                        tools.append((
                            name,
                            getattr(tool, "description", None),
                            getattr(tool, "inputSchema", {}),
                        ))
    
    return tools


def _extract_tool_definitions_from_toolsets(toolsets: Sequence[Any]) -> list[tuple[str, str | None, dict]]:
    """Extract tool definitions from pydantic-ai toolsets (sync version).
    
    This is a synchronous fallback. Prefer using `list_available_tools()` async
    function when possible for better CodemodeToolset support.
    
    Returns list of (name, description, parameters_json_schema) tuples.
    """
    tools: list[tuple[str, str | None, dict]] = []
    
    for toolset in toolsets:
        toolset_class_name = toolset.__class__.__name__
        logger.debug("Processing toolset: %s", toolset_class_name)
        
        # Handle CodemodeToolset - try registry first
        if toolset_class_name == "CodemodeToolset":
            registry = getattr(toolset, "registry", None)
            if registry is not None:
                # Use already-discovered tools from registry
                for tool in registry.list_tools(include_deferred=True):
                    schema = getattr(tool, "input_schema", {}) or getattr(tool, "parameters", {}) or {}
                    tools.append((tool.name, tool.description, schema))
                if tools:
                    continue
            
            # Fallback: try TOOL_SCHEMAS from agent_codemode
            try:
                from agent_codemode.tool_definitions import TOOL_SCHEMAS
                allow_discovery = getattr(toolset, "allow_discovery_tools", True)
                allow_direct = getattr(toolset, "allow_direct_tool_calls", False)
                
                for name, schema in TOOL_SCHEMAS.items():
                    # execute_code is always included
                    if name == "execute_code":
                        tools.append((name, schema.get("description"), schema.get("parameters", {})))
                    # call_tool requires allow_direct
                    elif name == "call_tool" and allow_direct:
                        tools.append((name, schema.get("description"), schema.get("parameters", {})))
                    # Other tools are discovery tools
                    elif allow_discovery and name not in ("execute_code", "call_tool"):
                        tools.append((name, schema.get("description"), schema.get("parameters", {})))
            except ImportError:
                pass
            continue
        
        # Handle FunctionToolset which has _tools attribute
        if hasattr(toolset, "_tools"):
            for tool in toolset._tools.values():
                if hasattr(tool, "definition"):
                    tool_def = tool.definition
                    tools.append((
                        getattr(tool_def, "name", str(tool)),
                        getattr(tool_def, "description", None),
                        getattr(tool_def, "parameters_json_schema", {}),
                    ))
                elif hasattr(tool, "name"):
                    tools.append((
                        tool.name,
                        getattr(tool, "description", None),
                        getattr(tool, "parameters_json_schema", {}),
                    ))
        
        # Handle MCP servers with cached tools
        if hasattr(toolset, "_cached_tools") and toolset._cached_tools is not None:
            cached = toolset._cached_tools
            if isinstance(cached, list):
                for tool in cached:
                    name = getattr(tool, "name", None)
                    if name:
                        tools.append((
                            name,
                            getattr(tool, "description", None),
                            getattr(tool, "inputSchema", {}),
                        ))
            elif isinstance(cached, dict):
                for tool_name, tool_data in cached.items():
                    if hasattr(tool_data, "tool_def"):
                        tool_def = tool_data.tool_def
                        tools.append((
                            tool_def.name,
                            tool_def.description,
                            getattr(tool_def, "parameters_json_schema", {}),
                        ))
        
        # Handle stored tools dict/list
        if hasattr(toolset, "tools") and isinstance(toolset.tools, (list, dict)):
            stored_tools = toolset.tools
            if isinstance(stored_tools, dict):
                stored_tools = stored_tools.values()
            for tool in stored_tools:
                if hasattr(tool, "name"):
                    tools.append((
                        tool.name,
                        getattr(tool, "description", None),
                        getattr(tool, "parameters_json_schema", {}),
                    ))
    
    return tools


def extract_context_snapshot(
    agent: Any,
    agent_id: str,
    context_window: int = 128000,
    message_history: Sequence[Any] | None = None,
    model_input_tokens: int | None = None,
    model_output_tokens: int | None = None,
    turn_usage: TurnUsage | None = None,
    session_usage: SessionUsage | None = None,
    tool_definitions: list[tuple[str, str | None, dict]] | None = None,
) -> ContextSnapshot:
    """Extract context snapshot from a pydantic-ai agent.
    
    Args:
        agent: The BaseAgent wrapper or pydantic_ai.Agent instance.
        agent_id: The agent identifier.
        context_window: The context window size for the model.
        message_history: Optional message history from the agent run.
        model_input_tokens: Optional model-reported input tokens (from result.usage).
        model_output_tokens: Optional model-reported output tokens (from result.usage).
        turn_usage: Optional turn usage data for current request.
        session_usage: Optional cumulative session usage data.
        tool_definitions: Optional pre-fetched tool definitions as list of (name, description, params_schema) tuples.
            Use this when MCP server tools are cached during the run but cleared after.
        
    Returns:
        ContextSnapshot with extracted information.
    """
    snapshot = ContextSnapshot(
        agent_id=agent_id,
        context_window=context_window,
        model_input_tokens=model_input_tokens,
        model_output_tokens=model_output_tokens,
        turn_usage=turn_usage,
        session_usage=session_usage,
    )
    
    # Get the underlying pydantic-ai Agent
    pydantic_agent = None
    if hasattr(agent, "_agent"):
        pydantic_agent = agent._agent
    elif hasattr(agent, "__class__") and agent.__class__.__name__ == "Agent":
        pydantic_agent = agent
    # Also accept duck-typed objects that have the expected attributes
    elif hasattr(agent, "toolsets") and hasattr(agent, "_system_prompts"):
        pydantic_agent = agent
    # Fallback: if it has toolsets property, try to use it anyway
    elif hasattr(agent, "toolsets"):
        pydantic_agent = agent
    
    if pydantic_agent is None:
        logger.warning("Could not extract pydantic-ai agent from %s", type(agent))
        return snapshot
    
    # Extract system prompts
    try:
        if hasattr(pydantic_agent, "_system_prompts"):
            for prompt in pydantic_agent._system_prompts:
                if isinstance(prompt, str):
                    snapshot.system_prompts.append(prompt)
                    # System prompts have minimal overhead, just the text
                    snapshot.system_prompt_tokens += count_tokens(prompt)
    except Exception as e:
        logger.debug("Could not extract system prompts: %s", e)
    
    # Extract tool definitions - prefer passed tool_definitions, else extract from toolsets
    tool_defs: list[tuple[str, str | None, dict]] = []
    if tool_definitions:
        tool_defs = tool_definitions
        logger.debug("Using %d passed tool definitions", len(tool_defs))
    else:
        try:
            if hasattr(pydantic_agent, "toolsets"):
                toolsets = pydantic_agent.toolsets
                logger.debug("Agent has %d toolsets", len(toolsets))
                tool_defs = _extract_tool_definitions_from_toolsets(toolsets)
                logger.debug("Extracted %d tool definitions from toolsets", len(tool_defs))
            else:
                logger.debug("Agent has no toolsets attribute")
        except Exception as e:
            logger.debug("Could not extract tools from toolsets: %s", e)
    
    # Process tool definitions into snapshot
    for name, description, params_schema in tool_defs:
        # Count tokens for the full tool definition as sent to the model
        # Format: {"name": "...", "description": "...", "input_schema": {...}}
        tool_def = {
            "name": name,
            "description": description or "",
            "input_schema": params_schema,
        }
        total_tokens = count_tokens_json(tool_def)
        params_tokens = count_tokens_json(params_schema)
        
        snapshot.tools.append(ToolSnapshot(
            name=name,
            description=description,
            parameters_tokens=params_tokens,
            total_tokens=total_tokens,
        ))
        snapshot.tool_tokens += total_tokens
    
    # Extract message history if provided
    if message_history:
        try:
            num_messages = len(message_history)
            
            # Find the index of the LAST user-prompt (not just last request)
            # This marks the start of the current "turn"
            current_turn_start_idx = -1
            for i in range(num_messages - 1, -1, -1):
                message = message_history[i]
                if getattr(message, "kind", None) == "request":
                    parts = getattr(message, "parts", [])
                    for part in parts:
                        part_kind = getattr(part, "part_kind", None)
                        if part_kind in ("user-prompt", "user_prompt"):
                            current_turn_start_idx = i
                            break
                    if current_turn_start_idx >= 0:
                        break
            
            for idx, message in enumerate(message_history):
                message_kind = getattr(message, "kind", None)
                # Everything from the last user-prompt onwards is "current turn"
                is_current_turn = (idx >= current_turn_start_idx) if current_turn_start_idx >= 0 else True
                
                if message_kind == "request":
                    # ModelRequest - user messages
                    parts = getattr(message, "parts", [])
                    for part in parts:
                        part_kind = getattr(part, "part_kind", None)
                        if part_kind in ("user-prompt", "user_prompt"):
                            content = _extract_message_content(part)
                            # User messages have structure: {"role": "user", "content": [{"type": "text", "text": "..."}]}
                            user_msg = {"role": "user", "content": [{"type": "text", "text": content}]}
                            tokens = count_tokens_json(user_msg)
                            snapshot.messages.append(MessageSnapshot(
                                role="user",
                                content=content,
                                estimated_tokens=tokens,
                                timestamp=str(getattr(message, "timestamp", None)),
                            ))
                            # Categorize as current or history
                            if is_current_turn:
                                snapshot.current_user_tokens += tokens
                            else:
                                snapshot.history_user_tokens += tokens
                            snapshot.user_message_tokens += tokens
                        elif part_kind in ("system-prompt", "system_prompt"):
                            content = _extract_message_content(part)
                            tokens = count_tokens(content)
                            snapshot.system_prompt_tokens += tokens
                        elif part_kind in ("tool-return", "tool_return"):
                            # Tool returns include structure overhead
                            # Format: {"tool_use_id": "...", "type": "tool_result", "content": "...", "is_error": false}
                            content = _extract_message_content(part)
                            tool_id = getattr(part, "tool_call_id", "") or ""
                            tool_result = {
                                "tool_use_id": tool_id,
                                "type": "tool_result",
                                "content": content,
                                "is_error": False,
                            }
                            tokens = count_tokens_json(tool_result)
                            if is_current_turn:
                                snapshot.current_tool_return_tokens += tokens
                            else:
                                snapshot.history_tool_return_tokens += tokens
                            snapshot.tool_return_tokens += tokens
                        elif part_kind in ("retry-prompt", "retry_prompt"):
                            # Retry prompts are sent as tool_result with is_error=True
                            content = _extract_message_content(part)
                            tool_id = getattr(part, "tool_call_id", "") or ""
                            retry_result = {
                                "tool_use_id": tool_id,
                                "type": "tool_result",
                                "content": content,
                                "is_error": True,
                            }
                            tokens = count_tokens_json(retry_result)
                            if is_current_turn:
                                snapshot.current_tool_return_tokens += tokens
                            else:
                                snapshot.history_tool_return_tokens += tokens
                            snapshot.tool_return_tokens += tokens
                
                elif message_kind == "response":
                    # ModelResponse - assistant messages
                    # Extract usage from the response if available
                    response_usage = getattr(message, "usage", None)
                    tool_names_in_response: list[str] = []
                    if response_usage is not None:
                        resp_input = getattr(response_usage, "input_tokens", 0) or 0
                        resp_output = getattr(response_usage, "output_tokens", 0) or 0
                        snapshot.sum_response_input_tokens += resp_input
                        snapshot.sum_response_output_tokens += resp_output
                        
                        # Find ALL tool calls in this response
                        parts_for_tool = getattr(message, "parts", [])
                        for p in parts_for_tool:
                            if getattr(p, "part_kind", None) in ("tool-call", "tool_call"):
                                tool_name = getattr(p, "tool_name", None)
                                if tool_name:
                                    tool_names_in_response.append(tool_name)
                        
                        # Add per-request usage
                        request_num = len(snapshot.per_request_usage) + 1
                        snapshot.per_request_usage.append(RequestUsageSnapshot(
                            request_num=request_num,
                            input_tokens=resp_input,
                            output_tokens=resp_output,
                            tool_names=tool_names_in_response,
                        ))
                    
                    parts = getattr(message, "parts", [])
                    for part in parts:
                        part_kind = getattr(part, "part_kind", None)
                        if part_kind == "text":
                            content = _extract_message_content(part)
                            # Assistant messages: {"role": "assistant", "content": [{"type": "text", "text": "..."}]}
                            assistant_msg = {"role": "assistant", "content": [{"type": "text", "text": content}]}
                            tokens = count_tokens_json(assistant_msg)
                            snapshot.messages.append(MessageSnapshot(
                                role="assistant",
                                content=content,
                                estimated_tokens=tokens,
                                timestamp=str(getattr(message, "timestamp", None)),
                            ))
                            if is_current_turn:
                                snapshot.current_assistant_tokens += tokens
                            else:
                                snapshot.history_assistant_tokens += tokens
                            snapshot.assistant_message_tokens += tokens
                        elif part_kind in ("tool-call", "tool_call"):
                            # Tool calls include structure overhead
                            # Format: {"id": "...", "type": "tool_use", "name": "...", "input": {...}}
                            args = getattr(part, "args", {})
                            tool_name = getattr(part, "tool_name", "") or ""
                            tool_id = getattr(part, "tool_call_id", "") or ""
                            tool_call = {
                                "id": tool_id,
                                "type": "tool_use",
                                "name": tool_name,
                                "input": args if isinstance(args, dict) else {},
                            }
                            tokens = count_tokens_json(tool_call)
                            if is_current_turn:
                                snapshot.current_tool_call_tokens += tokens
                            else:
                                snapshot.history_tool_call_tokens += tokens
                            snapshot.tool_call_tokens += tokens
                        elif part_kind == "thinking":
                            content = _extract_message_content(part)
                            tokens = count_tokens(content)
                            if is_current_turn:
                                snapshot.current_assistant_tokens += tokens
                            else:
                                snapshot.history_assistant_tokens += tokens
                            snapshot.assistant_message_tokens += tokens
        except Exception as e:
            logger.debug("Could not extract message history: %s", e)
    
    # Compute aggregate fields for backward compatibility
    snapshot.history_tokens = snapshot.history_user_tokens + snapshot.history_assistant_tokens
    snapshot.current_message_tokens = snapshot.current_user_tokens  # Alias
    
    # Calculate totals (including tool usage)
    snapshot.total_tokens = (
        snapshot.system_prompt_tokens +
        snapshot.tool_tokens +
        snapshot.tool_call_tokens +
        snapshot.tool_return_tokens +
        snapshot.history_user_tokens +
        snapshot.history_assistant_tokens +
        snapshot.current_user_tokens +
        snapshot.current_assistant_tokens
    )
    
    return snapshot


def get_agent_context_snapshot(agent_id: str) -> ContextSnapshot | None:
    """Get context snapshot for an agent by ID.
    
    Args:
        agent_id: The agent identifier.
        
    Returns:
        ContextSnapshot if agent found, None otherwise.
    """
    # Import here to avoid circular imports
    from ..routes.acp import _agents
    from .usage import get_usage_tracker
    
    if agent_id not in _agents:
        return None
    
    agent, info = _agents[agent_id]
    
    # Get context window from usage tracker
    tracker = get_usage_tracker()
    context_window = tracker.get_context_window(agent_id)
    
    # Extract snapshot from agent
    snapshot = extract_context_snapshot(agent, agent_id, context_window)
    
    # Merge with usage tracker data for message tokens
    # (since message history is per-run, we use accumulated stats)
    stats = tracker.get_agent_stats(agent_id)
    if stats:
        snapshot.user_message_tokens = stats.user_message_tokens
        snapshot.assistant_message_tokens = stats.assistant_message_tokens
        
        # Recalculate total (include tool_tokens)
        snapshot.total_tokens = (
            snapshot.system_prompt_tokens +
            snapshot.tool_tokens +
            snapshot.user_message_tokens +
            snapshot.assistant_message_tokens
        )
    
    return snapshot

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent functionality for agent-runtimes.

This package provides:
- Base agent interface for protocol adapters
- Pydantic AI agent adapter
- LangChain agent adapter
- Jupyter AI agent adapter
- MCP (Model Context Protocol) integration
- Configuration management
"""

from .base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolCall,
    ToolDefinition,
    ToolResult,
)
from .jupyter_ai_adapter import JupyterAIAdapter
from .langchain_adapter import LangChainAdapter
from agent_runtimes.mcp import MCPToolManager
from .pydantic_ai_adapter import PydanticAIAdapter

__all__ = [
    # Base agent interface
    "BaseAgent",
    "AgentContext",
    "AgentResponse",
    "StreamEvent",
    "ToolCall",
    "ToolResult",
    "ToolDefinition",
    # Agent implementations
    "PydanticAIAdapter",
    "LangChainAdapter",
    "JupyterAIAdapter",
    "MCPToolManager",
]

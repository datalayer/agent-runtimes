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
- Chat agent creation
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
from .chat.agent import create_chat_agent
from .chat.config import ChatConfig
from .jupyter_ai_agent import JupyterAIAgent
from .langchain_agent import LangChainAgent
from .mcp import MCPToolManager
from .pydantic_ai_agent import PydanticAIAgent

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
    "PydanticAIAgent",
    "LangChainAgent",
    "JupyterAIAgent",
    # Chat functionality
    "create_chat_agent",
    "MCPToolManager",
    "ChatConfig",
]

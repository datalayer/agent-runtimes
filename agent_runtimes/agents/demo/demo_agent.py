#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Demo Agent for testing the agent-runtimes server.

This script registers a demo agent with the ACP server for testing
the WebSocket communication and chat functionality.

Usage:
    # First, start the server in one terminal:
    python -m agent_runtimes --reload
    
    # Then, in another terminal, register the demo agent:
    python -m agent_runtimes.examples.demo.demo_agent
"""

import asyncio
import logging
from typing import Any, AsyncGenerator

from agent_runtimes.adapters.base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolDefinition,
)
from agent_runtimes.routes.acp import (
    AgentCapabilities,
    AgentInfo,
    register_agent,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DemoAgent(BaseAgent):
    """
    A simple demo agent for testing purposes.
    
    This agent echoes back messages and demonstrates streaming responses.
    """
    
    def __init__(self, agent_name: str = "Demo Agent"):
        self._name = agent_name
        self._tools: list[ToolDefinition] = [
            ToolDefinition(
                name="echo",
                description="Echo back the input message",
                input_schema={
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "The message to echo",
                        }
                    },
                    "required": ["message"],
                },
            ),
            ToolDefinition(
                name="calculate",
                description="Perform a simple calculation",
                input_schema={
                    "type": "object",
                    "properties": {
                        "expression": {
                            "type": "string",
                            "description": "A simple math expression (e.g., '2 + 2')",
                        }
                    },
                    "required": ["expression"],
                },
            ),
        ]
    
    @property
    def name(self) -> str:
        """Get the agent's name."""
        return self._name
    
    async def run(self, prompt: str, context: AgentContext) -> AgentResponse:
        """Run the agent on the given context."""
        if not prompt:
            return AgentResponse(
                content="Hello! I'm a demo agent. How can I help you today?",
                metadata={"agent": self._name},
            )
        
        # Generate a response
        response = self._generate_response(prompt)
        
        return AgentResponse(
            content=response,
            metadata={"agent": self._name},
        )
    
    async def stream(self, prompt: str, context: AgentContext) -> AsyncGenerator[StreamEvent, None]:
        """Stream responses from the agent."""
        if not prompt:
            response = "Hello! I'm a demo agent. How can I help you today?"
        else:
            response = self._generate_response(prompt)
        
        # Simulate streaming by yielding word by word
        words = response.split()
        for i, word in enumerate(words):
            yield StreamEvent(
                type="text",
                data=word + (" " if i < len(words) - 1 else ""),
            )
            await asyncio.sleep(0.05)  # Simulate delay
        
        yield StreamEvent(type="done", data=None)
    
    def get_tools(self) -> list[ToolDefinition]:
        """Get the tools available to this agent."""
        return self._tools
    
    def _generate_response(self, message: str) -> str:
        """Generate a response based on the input message."""
        message_lower = message.lower()
        
        if "hello" in message_lower or "hi" in message_lower:
            return f"Hello! I'm {self._name}, a demo agent for testing the agent-runtimes server. I can help you with simple tasks like echoing messages or calculations."
        
        if "help" in message_lower:
            return """I'm a demo agent with the following capabilities:

1. **Echo**: I can repeat back what you say
2. **Calculate**: I can do simple math (try "calculate 2 + 2")
3. **Chat**: I can have a basic conversation

Just type your message and I'll respond!"""
        
        if "calculate" in message_lower:
            # Try to extract and evaluate a simple expression
            import re
            match = re.search(r"calculate\s+(.+)", message_lower)
            if match:
                expr = match.group(1).strip()
                try:
                    # Only allow safe characters
                    if all(c in "0123456789+-*/.() " for c in expr):
                        result = eval(expr)
                        return f"The result of `{expr}` is **{result}**"
                except Exception:
                    pass
            return "I couldn't understand that calculation. Try something like 'calculate 2 + 2'"
        
        if "?" in message:
            return f"That's an interesting question! As a demo agent, I don't have all the answers, but I'm here to help test the agent-runtimes infrastructure. Your question was: '{message}'"
        
        return f"You said: '{message}'\n\nI'm a demo agent, so my responses are quite simple. Try asking for 'help' to see what I can do!"


def create_demo_agent() -> tuple[DemoAgent, AgentInfo]:
    """Create a demo agent with its info for registration."""
    agent = DemoAgent("Datalayer Demo Agent")
    
    info = AgentInfo(
        id="demo-agent",
        name="Datalayer Demo Agent",
        description="A simple demo agent for testing the agent-runtimes server",
        capabilities=AgentCapabilities(
            streaming=True,
            tool_calling=True,
            code_execution=False,
            file_access=False,
            permissions=[],
        ),
        version="1.0.0",
    )
    
    return agent, info


def create_pydantic_demo_agent() -> tuple[Any, AgentInfo]:
    """Create a Pydantic AI demo agent for AG-UI and Vercel AI protocols.
    
    Returns:
        Tuple of (PydanticAIAgent, AgentInfo)
    """
    try:
        from pydantic_ai import Agent
        from agent_runtimes.agents import PydanticAIAgent
        
        # Create a simple Pydantic AI agent
        pydantic_agent = Agent(
            "openai:gpt-4o-mini",
            system_prompt=(
                "You are a helpful demo agent for testing the agent-runtimes server. "
                "Keep your responses concise and helpful. "
                "If asked about your capabilities, mention that you can help with general questions "
                "and demonstrate the agent-runtimes infrastructure."
            ),
        )
        
        # Wrap in PydanticAIAgent
        agent = PydanticAIAgent(pydantic_agent)
        
        info = AgentInfo(
            id="demo-agent",
            name="Datalayer Demo Agent (Pydantic AI)",
            description="A Pydantic AI demo agent for testing AG-UI and Vercel AI protocols",
            capabilities=AgentCapabilities(
                streaming=True,
                tool_calling=True,
                code_execution=False,
                file_access=False,
                permissions=[],
            ),
            version="1.0.0",
        )
        
        return agent, info
    except ImportError as e:
        logger.warning(f"Could not create Pydantic AI demo agent: {e}")
        # Fall back to regular demo agent
        return create_demo_agent()


def main():
    """Register the demo agent with the server."""
    agent, info = create_demo_agent()
    register_agent(agent, info)
    logger.info(f"Registered demo agent: {info.id}")
    logger.info(f"Connect via WebSocket at: ws://localhost:8000/api/v1/acp/ws/{info.id}")


if __name__ == "__main__":
    main()

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Context snapshot extraction for agents.

Extracts current context information from pydantic-ai agents including:
- System prompts
- Message history (user/assistant messages)
- Estimated token counts
"""

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


# Simple token estimation (roughly 4 chars per token for English text)
def estimate_tokens(text: str) -> int:
    """Estimate token count from text.
    
    Uses a simple heuristic of ~4 characters per token.
    For more accurate counts, use a proper tokenizer.
    """
    if not text:
        return 0
    return len(text) // 4


@dataclass
class MessageSnapshot:
    """Snapshot of a single message."""
    role: str  # "user", "assistant", "system"
    content: str
    estimated_tokens: int
    timestamp: str | None = None


@dataclass
class ContextSnapshot:
    """Complete snapshot of agent context."""
    agent_id: str
    
    # System prompts
    system_prompts: list[str] = field(default_factory=list)
    system_prompt_tokens: int = 0
    
    # Message history
    messages: list[MessageSnapshot] = field(default_factory=list)
    user_message_tokens: int = 0
    assistant_message_tokens: int = 0
    
    # Total context
    total_tokens: int = 0
    context_window: int = 128000  # Default context window
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "agentId": self.agent_id,
            "systemPrompts": self.system_prompts,
            "systemPromptTokens": self.system_prompt_tokens,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content[:200] + "..." if len(m.content) > 200 else m.content,
                    "estimatedTokens": m.estimated_tokens,
                    "timestamp": m.timestamp,
                }
                for m in self.messages
            ],
            "userMessageTokens": self.user_message_tokens,
            "assistantMessageTokens": self.assistant_message_tokens,
            "totalTokens": self.total_tokens,
            "contextWindow": self.context_window,
            # Distribution data for treemap
            "distribution": self._build_distribution(),
        }
    
    def _build_distribution(self) -> dict[str, Any]:
        """Build distribution data for treemap visualization."""
        children = []
        
        # System prompts category
        if self.system_prompt_tokens > 0:
            children.append({
                "name": "System Prompts",
                "value": self.system_prompt_tokens,
            })
        
        # Messages category with children
        message_children = []
        if self.user_message_tokens > 0:
            message_children.append({
                "name": "User Messages",
                "value": self.user_message_tokens,
            })
        if self.assistant_message_tokens > 0:
            message_children.append({
                "name": "Assistant Responses",
                "value": self.assistant_message_tokens,
            })
        
        if message_children:
            children.append({
                "name": "Messages",
                "value": self.user_message_tokens + self.assistant_message_tokens,
                "children": message_children,
            })
        
        return {
            "name": "Context",
            "value": self.total_tokens,
            "children": children,
        }


def extract_context_snapshot(agent: Any, agent_id: str, context_window: int = 128000) -> ContextSnapshot:
    """Extract context snapshot from a pydantic-ai agent.
    
    Args:
        agent: The BaseAgent wrapper or pydantic_ai.Agent instance.
        agent_id: The agent identifier.
        context_window: The context window size for the model.
        
    Returns:
        ContextSnapshot with extracted information.
    """
    snapshot = ContextSnapshot(
        agent_id=agent_id,
        context_window=context_window,
    )
    
    # Get the underlying pydantic-ai Agent
    pydantic_agent = None
    if hasattr(agent, "_agent"):
        pydantic_agent = agent._agent
    elif hasattr(agent, "__class__") and agent.__class__.__name__ == "Agent":
        pydantic_agent = agent
    
    if pydantic_agent is None:
        logger.warning(f"Could not extract pydantic-ai agent from {type(agent)}")
        return snapshot
    
    # Extract system prompts
    try:
        if hasattr(pydantic_agent, "_system_prompts"):
            for prompt in pydantic_agent._system_prompts:
                if isinstance(prompt, str):
                    snapshot.system_prompts.append(prompt)
                    snapshot.system_prompt_tokens += estimate_tokens(prompt)
    except Exception as e:
        logger.debug(f"Could not extract system prompts: {e}")
    
    # Note: Message history is typically per-run in pydantic-ai
    # and not stored on the agent itself. The message history
    # is passed to each run() call. We track this through
    # the usage tracker instead.
    
    # Calculate totals
    snapshot.total_tokens = (
        snapshot.system_prompt_tokens +
        snapshot.user_message_tokens +
        snapshot.assistant_message_tokens
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
        
        # Recalculate total
        snapshot.total_tokens = (
            snapshot.system_prompt_tokens +
            snapshot.user_message_tokens +
            snapshot.assistant_message_tokens
        )
    
    return snapshot

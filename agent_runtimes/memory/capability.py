# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Durable conversational memory as a pydantic-ai capability.

Wraps a ``BaseMemoryBackend`` (Mem0 by default) and wires it into the agent
lifecycle:

- retrieval: before a run, relevant memories are looked up from the current
  prompt and injected into the system prompt via dynamic instructions.
- persistence: after a run, the user turn and the agent's final answer are
  stored back into the backend.
- tools: ``search_memory`` and ``remember`` let the model inspect and write
  memory explicitly.

All backend calls are guarded so a memory backend failure (for example a
missing API key) degrades gracefully instead of breaking the agent run.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.toolsets import AgentToolset, FunctionToolset

from .base import BaseMemoryBackend
from .ephemeral import EphemeralMemory
from .registry import create_memory_backend, register_memory_backend

if TYPE_CHECKING:
    from pydantic_ai.messages import UserContent
    from pydantic_ai.run import AgentRunResult

logger = logging.getLogger(__name__)


def _prompt_text(ctx: RunContext[Any]) -> str:
    """Best-effort extraction of the current user prompt as plain text."""
    prompt: str | list[UserContent] | None = ctx.prompt
    if isinstance(prompt, str):
        return prompt
    if prompt is None:
        return ""
    parts = [part for part in prompt if isinstance(part, str)]
    return " ".join(parts)


@dataclass
class MemoryCapability(AbstractCapability[Any]):
    """Give an agent durable memory backed by a ``BaseMemoryBackend``.

    Parameters
    ----------
    backend:
        The memory backend used for retrieval and persistence.
    max_memories:
        Maximum number of memories injected into the system prompt per run.
    auto_store:
        When True, persist the raw user prompt and final answer after each run.
        Off by default so memory holds only durable facts the model chooses to
        save via the ``remember`` tool, instead of verbatim conversation turns.
    expose_tools:
        When True, expose ``search_memory`` and ``remember`` tools to the model.
    """

    backend: BaseMemoryBackend = field(default_factory=EphemeralMemory)
    agent_id: str | None = None
    max_memories: int = 5
    auto_store: bool = False
    expose_tools: bool = True
    _context_by_run: dict[str, str] = field(
        default_factory=dict, init=False, repr=False
    )

    def __post_init__(self) -> None:
        if self.agent_id:
            register_memory_backend(self.agent_id, self.backend)

    @staticmethod
    def _run_key(ctx: RunContext[Any]) -> str:
        return ctx.run_id or "default"

    async def before_run(self, ctx: RunContext[Any]) -> None:
        query = _prompt_text(ctx)
        if not query:
            return
        try:
            context = await self.backend.get_relevant_context(query)
        except Exception as exc:  # noqa: BLE001 - memory must not break the run
            logger.warning("Memory retrieval failed: %s", exc)
            return
        if context:
            self._context_by_run[self._run_key(ctx)] = context

    def get_instructions(self) -> Any:
        async def memory_instructions(ctx: RunContext[Any]) -> str:
            return self._context_by_run.get(self._run_key(ctx), "")

        return memory_instructions

    async def after_run(
        self, ctx: RunContext[Any], *, result: AgentRunResult[Any]
    ) -> AgentRunResult[Any]:
        self._context_by_run.pop(self._run_key(ctx), None)
        if not self.auto_store:
            return result

        messages: list[dict[str, str]] = []
        prompt_text = _prompt_text(ctx)
        if prompt_text:
            messages.append({"role": "user", "content": prompt_text})
        output = getattr(result, "output", None)
        if output is not None:
            messages.append({"role": "assistant", "content": str(output)})

        if messages:
            try:
                await self.backend.add(messages)
            except Exception as exc:  # noqa: BLE001 - memory must not break the run
                logger.warning("Memory persistence failed: %s", exc)
        return result

    def get_toolset(self) -> AgentToolset[Any] | None:
        if not self.expose_tools:
            return None

        toolset: FunctionToolset[Any] = FunctionToolset()

        async def search_memory(query: str) -> str:
            """Search durable memory for facts relevant to a query.

            Parameters
            ----------
            query:
                The text to search stored memories for.
            """
            try:
                results = await self.backend.search(query, limit=self.max_memories)
            except Exception as exc:  # noqa: BLE001 - degrade gracefully
                logger.warning("Memory search tool failed: %s", exc)
                return "Memory search is unavailable right now."
            if not results:
                return "No relevant memories found."
            lines = ["Relevant memories:"]
            for entry in results:
                content = entry.get("content", "")
                if content:
                    lines.append(f"- {content}")
            return "\n".join(lines)

        async def remember(content: str) -> str:
            """Store a durable fact or user preference in memory.

            Parameters
            ----------
            content:
                The fact or preference to remember.
            """
            try:
                await self.backend.add([{"role": "user", "content": content}])
            except Exception as exc:  # noqa: BLE001 - degrade gracefully
                logger.warning("Memory remember tool failed: %s", exc)
                return "Could not store that in memory right now."
            return "Stored in memory."

        toolset.add_function(search_memory)
        toolset.add_function(remember)
        return toolset


def build_memory_capability(
    memory_type: str | None,
    user_id: str = "default",
    agent_id: str | None = None,
    config: dict[str, Any] | None = None,
) -> MemoryCapability | None:
    """Build a ``MemoryCapability`` from an Agentspec ``memory`` field.

    Returns ``None`` for ephemeral/unset memory so no capability is added when
    durable memory is not requested.

    ``user_id`` must be the trusted personal-account identity of the runtime
    owner (see ``memory.identity.resolve_memory_identity``). Memories are
    persisted under the composite ``(user_id, agent_id)`` key: the user is
    the ownership boundary and the agent uid namespaces memories per agent.
    """
    if not memory_type or memory_type == "ephemeral":
        return None
    backend = create_memory_backend(
        memory_type,
        user_id=user_id,
        agent_id=agent_id,
        config=config,
    )
    return MemoryCapability(backend=backend, agent_id=agent_id)

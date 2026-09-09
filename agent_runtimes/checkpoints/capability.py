# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Conversation checkpoints as a pydantic-ai capability.

The middleware knows *when* to snapshot; this is what hooks it into an
agent's runs — counting turns, taking the auto-checkpoint once a turn is
over, giving the model its ``save_checkpoint`` / ``list_checkpoints`` /
``rewind_to`` tools — and what a route reaches for by agent id to list,
save, rewind and drop checkpoints from outside the run.

A rewind sets the agent's recorded history back to the checkpoint and pushes
a fresh snapshot, so the chat watching the agent can reload the transcript
it now has. On the Local target the chat sends the transcript back as the
next run's history, which is what makes the rewind take.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.toolsets import AgentToolset, FunctionToolset

from .middleware import AutoCheckpointMiddleware
from .store import ConversationCheckpoint
from .tools import list_checkpoints_tool_fn, rewind_to_tool_fn, save_checkpoint_tool_fn

logger = logging.getLogger(__name__)

# The capability behind each agent that checkpoints, for the routes.
_capabilities: dict[str, "CheckpointsCapability"] = {}

# The model's own checkpoint tools never trigger an every-tool checkpoint.
_OWN_TOOLS = frozenset({"save_checkpoint", "list_checkpoints", "rewind_to"})


def register_checkpoints(agent_id: str, capability: "CheckpointsCapability") -> None:
    _capabilities[agent_id] = capability


def unregister_checkpoints(agent_id: str) -> None:
    _capabilities.pop(agent_id, None)


def get_checkpoints(agent_id: str) -> "CheckpointsCapability | None":
    return _capabilities.get(agent_id)


def _serialize(messages: Any) -> list[dict[str, Any]]:
    from agent_runtimes.context.usage import serialize_messages

    return serialize_messages(list(messages or []))


def apply_rewind(agent_id: str | None, checkpoint: ConversationCheckpoint) -> int:
    """Make *checkpoint* the agent's conversation.

    The usage tracker's record — what the history route serves and the
    context snapshot carries — is set back to the checkpoint's messages, and
    a fresh snapshot goes out to whoever watches the agent. Returns the
    number of messages the conversation now has.
    """
    messages = [dict(message) for message in checkpoint.messages]
    if not agent_id:
        return len(messages)
    from agent_runtimes.context.usage import get_usage_tracker

    stats = get_usage_tracker().register_agent(agent_id)
    stats.message_history = messages
    stats.last_updated = datetime.now(timezone.utc)
    logger.info(
        "Agent %s rewound to checkpoint '%s' (turn %d, %d messages)",
        agent_id,
        checkpoint.label,
        checkpoint.turn,
        len(messages),
    )
    try:
        from agent_runtimes.streams.loop import push_snapshot

        push_snapshot(agent_id)
    except Exception:  # noqa: BLE001 - the rewind stands without the push
        logger.debug("Snapshot push after rewind failed", exc_info=True)
    return len(messages)


@dataclass
class CheckpointsCapability(AbstractCapability[Any]):
    """Checkpoint an agent's conversation as it runs.

    Parameters
    ----------
    middleware : AutoCheckpointMiddleware
        Decides when to snapshot and keeps the store.
    agent_id : str | None
        The agent this belongs to; registers the capability for the routes.
    expose_tools : bool
        When True, the model gets ``save_checkpoint``, ``list_checkpoints``
        and ``rewind_to``.
    """

    middleware: AutoCheckpointMiddleware
    agent_id: str | None = None
    expose_tools: bool = True

    def __post_init__(self) -> None:
        if self.agent_id:
            register_checkpoints(self.agent_id, self)

    async def before_run(self, ctx: RunContext[Any]) -> None:
        try:
            await self.middleware.on_turn_start(_serialize(ctx.messages))
        except Exception as exc:  # noqa: BLE001 - checkpointing must not break the run
            logger.warning("Checkpoint turn start failed: %s", exc)

    async def before_tool_execute(
        self, ctx: RunContext[Any], *, call: Any, tool_def: Any, args: Any
    ) -> Any:
        name = getattr(tool_def, "name", None) or getattr(call, "tool_name", "")
        if name not in _OWN_TOOLS:
            try:
                await self.middleware.on_tool_call(name, _serialize(ctx.messages))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Checkpoint before tool %s failed: %s", name, exc)
        return args

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        try:
            pending = self.middleware.take_pending_rewind()
            if pending is not None:
                apply_rewind(self.agent_id, pending)
                self.middleware.last_messages = [dict(m) for m in pending.messages]
            else:
                await self.middleware.on_turn_end(_serialize(result.all_messages()))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Checkpoint turn end failed: %s", exc)
        return result

    def get_toolset(self) -> AgentToolset[Any] | None:
        if not self.expose_tools:
            return None
        toolset: FunctionToolset[Any] = FunctionToolset()
        for tool in (
            save_checkpoint_tool_fn(self.middleware),
            list_checkpoints_tool_fn(self.middleware),
            rewind_to_tool_fn(self.middleware),
        ):
            toolset.add_function(
                tool["function"], name=tool["name"], description=tool["description"]
            )
        return toolset


def build_checkpoints_capability(
    spec_checkpoints: Any,
    agent_id: str | None = None,
) -> CheckpointsCapability | None:
    """Build the capability from an Agentspec ``checkpoints`` section.

    ``None`` when the section is absent or not enabled, so an agent that did
    not ask for checkpoints gets neither the hooks nor the tools.
    """
    if not isinstance(spec_checkpoints, dict) or not spec_checkpoints.get("enabled"):
        return None
    return CheckpointsCapability(
        middleware=AutoCheckpointMiddleware.from_spec(spec_checkpoints),
        agent_id=agent_id,
    )

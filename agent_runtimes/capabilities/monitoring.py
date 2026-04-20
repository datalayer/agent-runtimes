# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Monitoring capability for pydantic-ai lifecycle hooks.

Pushes an ``agent.snapshot`` message over the WebSocket pub/sub
infrastructure after every agent run completes (or fails).  This
replaces the need for callers to manually invoke
``publish_stream_event`` after each adapter call — the capability
fires automatically from the pydantic-ai lifecycle.

The snapshot includes:
- Context usage (tokens, messages, tool definitions)
- Cost usage (from the shared CostStore)
- MCP server status and enabled tools
- Codemode / skills status
- Pending tool-approval records
- Full context (detailed tool schemas, message history)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability

logger = logging.getLogger(__name__)


@dataclass
class MonitoringCapability(AbstractCapability[Any]):
    """Broadcast a monitoring snapshot after every agent run.

    The snapshot is assembled by the existing
    :func:`~agent_runtimes.streams.loop.build_monitoring_snapshot_payload`
    helper and pushed to all WebSocket subscribers of *agent_id*.

    Parameters
    ----------
    agent_id : str
        Agent identifier — subscribers keyed on this id receive updates.
    enabled : bool
        Master switch — when *False* the hooks are no-ops.
    list_approvals : callable or None
        Optional async callable ``(agent_id, status) -> list[Record]``
        that returns pending tool approvals for inclusion in the snapshot.
    """

    agent_id: str
    enabled: bool = True
    list_approvals: Any = None  # Optional async callable

    # ── hooks ────────────────────────────────────────────────────────────

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        if not self.enabled:
            return result
        await self._push_snapshot(event_type="agent.run.completed")
        return result

    async def on_run_error(self, ctx: RunContext[Any], *, error: BaseException) -> Any:
        try:
            await self._push_snapshot(event_type="agent.run.error")
        except Exception as exc:
            logger.debug(
                "[MonitoringCapability] Failed to push error snapshot: %s", exc
            )
        # Re-raise — we never swallow the original error.
        raise error

    # ── internals ────────────────────────────────────────────────────────

    async def _push_snapshot(self, event_type: str = "agent.snapshot") -> None:
        """Build and broadcast a fresh monitoring snapshot."""
        from agent_runtimes.streams.loop import (
            build_monitoring_snapshot_payload,
            enqueue_stream_message,
        )
        from agent_runtimes.streams.messages import AgentStreamMessage

        try:
            snapshot_payload = (
                await build_monitoring_snapshot_payload(
                    self.agent_id,
                    list_approvals=self.list_approvals,
                )
            ).model_dump(by_alias=True)

            snapshot_msg = AgentStreamMessage.create(
                type="agent.snapshot",
                payload=snapshot_payload,
                agent_id=self.agent_id,
            )
            enqueue_stream_message(self.agent_id, snapshot_msg)

            logger.debug(
                "[MonitoringCapability] pushed snapshot event_type=%s agent_id=%s",
                event_type,
                self.agent_id,
            )
        except Exception as exc:
            logger.warning(
                "[MonitoringCapability] Failed to push snapshot for agent '%s': %s",
                self.agent_id,
                exc,
            )

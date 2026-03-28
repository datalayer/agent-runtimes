# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Once invoker – runs an agent exactly once and terminates the runtime."""

from __future__ import annotations

import asyncio
import logging
import traceback
from typing import Any

from agent_runtimes.events import create_event
from .base import BaseInvoker, InvokerResult

logger = logging.getLogger(__name__)


class OnceInvoker(BaseInvoker):
    """Invoker for ``once`` triggers.

    When invoked the following steps execute:

    1. Emit an ``agent-started`` event.
    2. Run the agent adapter's ``run`` method with the trigger prompt.
    3. Emit an ``agent-ended`` event carrying the output summary.
    4. Request runtime termination (best-effort).
    """

    async def invoke(self, trigger_config: dict[str, Any]) -> InvokerResult:
        prompt = trigger_config.get("prompt", "Execute the agent task.")
        started_at = self._now()

        # ── 1. AGENT_STARTED event ───────────────────────────────
        try:
            create_event(
                token=self.token,
                agent_id=self.agent_id,
                title="Agent started",
                kind="agent-started",
                status="active",
                payload={
                    "agent_runtime_id": self.agent_id,
                    "agent_spec_id": self.agent_spec_id,
                    "started_at": started_at.isoformat(),
                    "trigger_type": "once",
                    "trigger_prompt": prompt,
                },
                base_url=self.base_url,
            )
        except Exception:
            logger.warning(
                "Failed to emit agent-started event for %s: %s",
                self.agent_id,
                traceback.format_exc(),
            )

        # ── 2. Run agent ─────────────────────────────────────────
        outputs: str | None = None
        exit_status = "completed"
        error_message: str | None = None

        try:
            outputs = await self._run_agent(prompt)
        except Exception as exc:
            exit_status = "error"
            error_message = str(exc)
            logger.error(
                "Once invoker failed for agent %s: %s",
                self.agent_id,
                exc,
                exc_info=True,
            )

        ended_at = self._now()
        duration_ms = int((ended_at - started_at).total_seconds() * 1000)

        # ── 3. AGENT_ENDED event ─────────────────────────────────
        try:
            create_event(
                token=self.token,
                agent_id=self.agent_id,
                title="Agent ended",
                kind="agent-ended",
                status=exit_status,
                payload={
                    "agent_runtime_id": self.agent_id,
                    "agent_spec_id": self.agent_spec_id,
                    "started_at": started_at.isoformat(),
                    "ended_at": ended_at.isoformat(),
                    "duration_ms": duration_ms,
                    "outputs": outputs,
                    "exit_status": exit_status,
                    "error_message": error_message,
                },
                base_url=self.base_url,
            )
        except Exception:
            logger.warning(
                "Failed to emit agent-ended event for %s: %s",
                self.agent_id,
                traceback.format_exc(),
            )

        # ── 4. Request runtime termination (best-effort) ─────────
        try:
            await self._terminate_runtime()
        except Exception:
            logger.warning(
                "Failed to terminate runtime for %s: %s",
                self.agent_id,
                traceback.format_exc(),
            )

        return InvokerResult(
            success=exit_status == "completed",
            agent_id=self.agent_id,
            trigger_type="once",
            started_at=started_at,
            ended_at=ended_at,
            duration_ms=duration_ms,
            outputs=outputs,
            exit_status=exit_status,
            error_message=error_message,
        )

    # ── private helpers ──────────────────────────────────────────

    async def _run_agent(self, prompt: str) -> str | None:
        """Run the registered agent adapter with the trigger prompt.

        We import here to avoid circular imports at module level.
        """
        from agent_runtimes.routes.acp import _agents  # registered agents

        pair = _agents.get(self.agent_id)
        if pair is None:
            raise RuntimeError(
                f"Agent '{self.agent_id}' is not registered – "
                "cannot invoke once trigger."
            )

        agent, _info = pair
        from agent_runtimes.adapters.base import AgentContext

        ctx = AgentContext(session_id=f"once-trigger-{self.agent_id}")
        response = await agent.run(prompt, ctx)
        return getattr(response, "content", str(response))

    async def _terminate_runtime(self) -> None:
        """Ask the local agent-runtimes server to delete this agent.

        This is a best-effort cleanup – the runtime may already be
        shutting down.
        """
        import httpx

        url = f"http://127.0.0.1:8765/api/v1/agents/{self.agent_id}"
        async with httpx.AsyncClient() as client:
            resp = await client.delete(url, timeout=10)
            logger.info(
                "Runtime termination for %s: %s %s",
                self.agent_id,
                resp.status_code,
                resp.text[:200],
            )

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Once invoker – runs an agent exactly once and terminates the runtime."""

from __future__ import annotations

import json
import logging
import time
import traceback
from datetime import datetime, timezone
from typing import Any

from agent_runtimes.events import create_event

from .base import BaseInvoker, InvokerResult

# Minimum interval (seconds) between progressive history flushes.
# Keep this low so once-trigger polling can approximate token streaming.
_FLUSH_INTERVAL = 0.05

logger = logging.getLogger(__name__)


class OnceInvoker(BaseInvoker):
    """Invoker for ``once`` triggers.

    When invoked the following steps execute:

    1. Emit an ``agent-started`` event.
    2. Run the agent adapter's ``run`` method with the trigger prompt.
    3. Emit an ``agent-output`` event carrying the output summary.
    4. Request runtime termination (best-effort).
    """

    async def invoke(self, trigger_config: dict[str, Any]) -> InvokerResult:
        prompt = trigger_config.get("prompt", "Execute the agent task.")
        started_at = self._now()

        # ── 1. AGENT_STARTED event ───────────────────────────────
        # Events are keyed by runtime_id (pod name) so the UI can
        # look them up by the runtime pod name it already knows.
        """
        TODO reenable this when we've confirmed the agent state machine.
        try:
            create_event(
                token=self.token,
                agent_id=self.runtime_id,
                title="Agent Started",
                kind="agent-started",
                status="running",
                payload={
                    "agent_runtime_id": self.runtime_id,
                    "agent_spec_id": self.agent_spec_id,
                    "started_at": started_at.isoformat(),
                    "trigger_type": "once",
                    "trigger_prompt": prompt,
                },
                metadata={"origin": "agent-runtime", "source": "agent-runtime"},
                base_url=self.base_url,
            )
        except Exception:
            logger.warning(
                "Failed to emit agent-started event for %s: %s",
                self.agent_id,
                traceback.format_exc(),
            )
        """

        # ── 2. Run agent ─────────────────────────────────────────
        outputs: str | None = None
        exit_status = "completed"
        error_message: str | None = None

        try:
            outputs = await self._run_agent(prompt)
            logger.info(
                "Once invoker _run_agent returned for %s: type=%s, len=%s, repr=%.500s",
                self.agent_id,
                type(outputs).__name__,
                len(outputs) if outputs else 0,
                repr(outputs),
            )
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

        # ── 3. AGENT_OUTPUT event ─────────────────────────────────
        try:
            created = create_event(
                token=self.token,
                agent_id=self.runtime_id,
                title="Agent Output",
                kind="agent-output",
                status=exit_status,
                payload={
                    "agent_runtime_id": self.runtime_id,
                    "agent_spec_id": self.agent_spec_id,
                    "started_at": started_at.isoformat(),
                    "ended_at": ended_at.isoformat(),
                    "duration_ms": duration_ms,
                    "outputs": outputs,
                    "exit_status": exit_status,
                    "error_message": error_message,
                },
                metadata={"origin": "agent-runtime", "source": "agent-runtime"},
                base_url=self.base_url,
            )
            created_event = (
                created.get("event", created) if isinstance(created, dict) else {}
            )
            created_payload = (
                created_event.get("payload", {})
                if isinstance(created_event, dict)
                else {}
            )
            logger.info(
                "Agent-output event persisted for %s: payload_keys=%s outputs_present=%s outputs_len=%s",
                self.runtime_id,
                sorted(created_payload.keys())
                if isinstance(created_payload, dict)
                else [],
                bool(created_payload.get("outputs"))
                if isinstance(created_payload, dict)
                else False,
                len(str(created_payload.get("outputs")))
                if isinstance(created_payload, dict)
                and created_payload.get("outputs") is not None
                else 0,
            )
        except Exception:
            logger.warning(
                "Failed to emit agent-output event for %s: %s",
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

        Uses the adapter streaming API so once triggers can emit streamed output,
        while still allowing deferred approval continuations in the adapter.

        Text deltas are progressively flushed to the usage tracker so that
        ``/api/v1/history`` returns partial content while streaming.

        We import here to avoid circular imports at module level.
        """
        from agent_runtimes.context.usage import get_usage_tracker
        from agent_runtimes.routes.acp import _agents  # registered agents

        pair = _agents.get(self.agent_id)
        if pair is None:
            raise RuntimeError(
                f"Agent '{self.agent_id}' is not registered – "
                "cannot invoke once trigger."
            )

        agent, _info = pair
        from agent_runtimes.adapters.base import AgentContext

        ctx = AgentContext(
            session_id=f"once-trigger-{self.agent_id}",
            metadata={
                "user_token": self.token,
                "force_exhaustive_end_strategy": True,
            }
            if self.token
            else {"force_exhaustive_end_strategy": True},
        )

        tracker = get_usage_tracker()
        now_iso = datetime.now(timezone.utc).isoformat()

        content_parts: list[str] = []
        output_data: Any | None = None
        last_flush = time.monotonic()

        def _flush_streaming_text() -> None:
            """Persist a synthetic assistant message so history polling sees partial text."""
            nonlocal last_flush
            stats = tracker.get_agent_stats(self.agent_id)
            if stats is None:
                stats = tracker.register_agent(self.agent_id)
            accumulated = "".join(content_parts)
            if not accumulated:
                return
            stats.message_history = [
                {
                    "kind": "request",
                    "timestamp": now_iso,
                    "parts": [{"part_kind": "user-prompt", "content": prompt}],
                },
                {
                    "kind": "response",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "parts": [{"part_kind": "text", "content": accumulated}],
                },
            ]
            last_flush = time.monotonic()

        async for event in agent.stream(prompt, ctx):
            if event.type == "text":
                if isinstance(event.data, str):
                    content_parts.append(event.data)
                else:
                    content_parts.append(str(event.data))
                # Periodically flush to make partial text visible via /api/v1/history
                if time.monotonic() - last_flush >= _FLUSH_INTERVAL:
                    _flush_streaming_text()
            elif event.type == "output":
                output_data = event.data
            elif event.type == "error":
                raise RuntimeError(str(event.data))

        # NOTE: No final _flush_streaming_text() here.  The adapter's
        # stream() already called stats.store_messages(result.all_messages())
        # before yielding the "done" sentinel, so the usage tracker already
        # contains the *complete* message history (including tool calls,
        # tool results, and multi-turn exchanges).  A synthetic flush would
        # overwrite that with a lossy [request, response] pair.

        if output_data is not None:
            if isinstance(output_data, str):
                return output_data.strip() or None
            try:
                return json.dumps(output_data, ensure_ascii=False)
            except TypeError:
                return str(output_data)

        content = "".join(content_parts).strip()
        return content or None

    async def _terminate_runtime(self) -> None:
        """Terminate the runtime after a once-trigger completes.

        1. Delete the agent registration from the local server.
        2. Ask the Datalayer platform to delete the runtime pod
           (uses ``runtime_id`` which is the Kubernetes pod name).
        """
        import httpx

        # Step 1: delete local agent registration
        url = f"http://127.0.0.1:8765/api/v1/agents/{self.agent_id}"
        async with httpx.AsyncClient() as client:
            resp = await client.delete(url, timeout=10)
            logger.info(
                "Local agent deletion for %s: %s %s",
                self.agent_id,
                resp.status_code,
                resp.text[:200],
            )

        # Step 2: delete the runtime pod via the platform runtimes API.
        runtime_url = f"{self.runtime_base_url.rstrip('/')}/api/runtimes/v1/runtimes/{self.runtime_id}"
        logger.info(
            "Terminating runtime via platform API: DELETE %s",
            runtime_url,
        )
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.delete(runtime_url, headers=headers, timeout=30)
                logger.info(
                    "Platform runtime termination for %s: %s %s",
                    self.runtime_id,
                    resp.status_code,
                    resp.text[:200],
                )
        except Exception:
            logger.warning(
                "Failed to terminate runtime via platform API for %s: %s",
                self.runtime_id,
                traceback.format_exc(),
            )

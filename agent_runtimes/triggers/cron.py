# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
DBOS cron-based trigger support for durable agents.

Uses DBOS scheduled workflows to run agents on a cron schedule.
When the trigger fires, it retrieves the registered agent and
executes it with a configurable input message.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class CronTriggerConfig:
    """Configuration for a cron-based trigger.

    Attributes:
        agent_id: The agent to trigger.
        cron_expression: Cron expression (e.g. "0 6 1 * *" for 6am on 1st of each month).
        input_message: Message to send to the agent when triggered.
        enabled: Whether the trigger is active.
        description: Human-readable description of the schedule.
        metadata: Additional metadata for the trigger.
    """

    agent_id: str
    cron_expression: str
    input_message: str = "Execute scheduled task"
    enabled: bool = True
    description: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class CronTriggerResult:
    """Result of a cron trigger execution."""

    agent_id: str
    scheduled_at: datetime
    actual_at: datetime
    success: bool
    output: str | None = None
    error: str | None = None
    workflow_id: str | None = None


class CronTrigger:
    """Manages a DBOS-backed cron trigger for an agent.

    Registers a DBOS scheduled workflow that runs the agent
    on the specified cron schedule. The workflow is durable —
    if the process crashes, DBOS will replay from the last
    committed step.

    Example:
        ```python
        trigger = CronTrigger(CronTriggerConfig(
            agent_id="monthly-report-agent",
            cron_expression="0 6 1 * *",
            input_message="Generate the monthly report",
        ))
        trigger.start()
        ```
    """

    def __init__(self, config: CronTriggerConfig) -> None:
        self.config = config
        self._task: asyncio.Task[Any] | None = None
        self._running = False

    @property
    def is_running(self) -> bool:
        return self._running

    def start(self) -> None:
        """Register the DBOS scheduled workflow and start the trigger."""
        if self._running:
            logger.warning(
                f"Cron trigger for agent {self.config.agent_id} is already running"
            )
            return

        self._running = True
        self._task = asyncio.ensure_future(self._run_schedule())
        logger.info(
            f"Started cron trigger for agent {self.config.agent_id}: "
            f"{self.config.cron_expression}"
        )

    def stop(self) -> None:
        """Stop the cron trigger."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None
        logger.info(f"Stopped cron trigger for agent {self.config.agent_id}")

    async def _run_schedule(self) -> None:
        """Internal: run the DBOS scheduled workflow loop.

        Attempts to use DBOS scheduled decorator. If DBOS is not available,
        falls back to a simple asyncio-based cron loop using croniter.
        """
        try:
            await self._run_dbos_schedule()
        except ImportError:
            logger.info(
                "DBOS not available, falling back to asyncio cron loop"
            )
            await self._run_fallback_schedule()

    async def _run_dbos_schedule(self) -> None:
        """Run using DBOS scheduled workflows for durability."""
        from dbos import DBOS

        agent_id = self.config.agent_id
        cron_expr = self.config.cron_expression
        input_msg = self.config.input_message

        @DBOS.scheduled(cron_expr)
        @DBOS.workflow()
        async def scheduled_agent_run(
            scheduled_at: datetime, actual_at: datetime
        ) -> CronTriggerResult:
            """DBOS durable workflow: run the agent on schedule."""
            logger.info(
                f"Cron trigger firing for agent {agent_id} "
                f"(scheduled: {scheduled_at}, actual: {actual_at})"
            )
            try:
                result = await _execute_agent(agent_id, input_msg)
                return CronTriggerResult(
                    agent_id=agent_id,
                    scheduled_at=scheduled_at,
                    actual_at=actual_at,
                    success=True,
                    output=str(result) if result else None,
                    workflow_id=DBOS.workflow_id,
                )
            except Exception as e:
                logger.error(
                    f"Cron trigger failed for agent {agent_id}: {e}"
                )
                return CronTriggerResult(
                    agent_id=agent_id,
                    scheduled_at=scheduled_at,
                    actual_at=actual_at,
                    success=False,
                    error=str(e),
                    workflow_id=DBOS.workflow_id,
                )

        # DBOS handles the scheduling loop internally
        # We just need to keep the coroutine alive
        while self._running:
            await asyncio.sleep(60)

    async def _run_fallback_schedule(self) -> None:
        """Fallback: simple asyncio loop with croniter for scheduling."""
        try:
            from croniter import croniter  # type: ignore[import-untyped]
        except ImportError:
            logger.error(
                "Neither DBOS nor croniter is available. "
                "Cannot run cron trigger. Install dbos or croniter."
            )
            self._running = False
            return

        cron = croniter(self.config.cron_expression, datetime.now())

        while self._running:
            next_run = cron.get_next(datetime)
            delay = (next_run - datetime.now()).total_seconds()

            if delay > 0:
                logger.debug(
                    f"Cron trigger for {self.config.agent_id}: "
                    f"next run at {next_run} (in {delay:.0f}s)"
                )
                await asyncio.sleep(delay)

            if not self._running:
                break

            logger.info(
                f"Cron trigger firing for agent {self.config.agent_id}"
            )
            try:
                await _execute_agent(
                    self.config.agent_id, self.config.input_message
                )
            except Exception as e:
                logger.error(
                    f"Cron trigger execution failed for "
                    f"{self.config.agent_id}: {e}"
                )


# --- Registry ---

_cron_triggers: dict[str, CronTrigger] = {}


def register_cron_trigger(config: CronTriggerConfig) -> CronTrigger:
    """Register and start a cron trigger for an agent.

    Args:
        config: Cron trigger configuration.

    Returns:
        The started CronTrigger instance.
    """
    if config.agent_id in _cron_triggers:
        # Stop existing trigger before replacing
        _cron_triggers[config.agent_id].stop()

    trigger = CronTrigger(config)
    _cron_triggers[config.agent_id] = trigger

    if config.enabled:
        trigger.start()

    return trigger


def unregister_cron_trigger(agent_id: str) -> bool:
    """Stop and unregister a cron trigger.

    Args:
        agent_id: The agent whose trigger to remove.

    Returns:
        True if a trigger was found and removed, False otherwise.
    """
    trigger = _cron_triggers.pop(agent_id, None)
    if trigger:
        trigger.stop()
        return True
    return False


def get_cron_trigger(agent_id: str) -> CronTrigger | None:
    """Get the cron trigger for an agent, if any."""
    return _cron_triggers.get(agent_id)


def list_cron_triggers() -> list[CronTrigger]:
    """List all registered cron triggers."""
    return list(_cron_triggers.values())


# --- Agent execution helper ---


async def _execute_agent(agent_id: str, message: str) -> Any:
    """Execute an agent by ID with the given message.

    Looks up the agent in the global registry and runs it.
    """
    # Import here to avoid circular imports
    from ..routes.acp import _agents

    agent_entry = _agents.get(agent_id)
    if agent_entry is None:
        raise ValueError(f"Agent '{agent_id}' not found in registry")

    adapter, _info = agent_entry
    from ..adapters.base import AgentContext

    context = AgentContext(
        session_id=f"cron-{agent_id}",
        conversation_history=[{"role": "user", "content": message}],
        metadata={"trigger": "cron", "agent_id": agent_id},
    )

    # Run the agent via its adapter
    result = await adapter.run(message, context)
    logger.info(f"Agent {agent_id} completed: {type(result).__name__}")
    return result

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Every call an agent's addresses answer, recorded on its deployment.

Who called (anonymous, an API key or a token, and the person's uid when they
said who they are), by which address (agent, MCP, API, web), which operation,
its status, how long it took and the tokens its agent spent. A runtime
launched for a deployment sends them, a batch at a time, to ai-agents
(``POST /api/ai-agents/v1/apps/internal/addresses/{name}/calls``, with its
proof), which records them on the deployment. Never what was said, a key or a
token. A batch ai-agents does not take is said in the log and dropped: a
call is never held up by its record.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict, dataclass
from typing import Awaitable, Callable, List, Optional

logger = logging.getLogger(__name__)

#: How many calls are sent at once at most, and how often a batch is sent.
BATCH = 50
FLUSH_SECONDS = 10.0


@dataclass(frozen=True)
class CallRecord:
    """One call, as it is recorded."""

    interface: str
    operation: str
    caller: str
    person: str
    status: int
    duration_ms: int
    tokens: int = 0


#: Sends a batch: raises when it was not taken.
Sender = Callable[[List[dict]], Awaitable[None]]


class CallRecorder:
    """The calls of one agent's addresses, sent a batch at a time."""

    def __init__(
        self, send: Sender, *, batch: int = BATCH, every: float = FLUSH_SECONDS
    ) -> None:
        self.send = send
        self.batch = batch
        self.every = every
        self.pending: List[CallRecord] = []
        self._task: Optional[asyncio.Task] = None

    def record(self, call: CallRecord) -> None:
        self.pending.append(call)
        if len(self.pending) >= self.batch:
            self._flush_soon(0.0)
        elif self._task is None or self._task.done():
            self._flush_soon(self.every)

    def _flush_soon(self, after: float) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._task is not None and not self._task.done() and after > 0:
            return
        self._task = loop.create_task(self._flush_after(after))

    async def _flush_after(self, after: float) -> None:
        if after:
            await asyncio.sleep(after)
        await self.flush()

    async def flush(self) -> None:
        while self.pending:
            sent, self.pending = self.pending[: self.batch], self.pending[self.batch :]
            try:
                await self.send([asdict(call) for call in sent])
            except Exception as error:  # noqa: BLE001 - said, never holding a call up
                logger.warning(
                    "%d calls of the agent's addresses were not recorded: %s",
                    len(sent),
                    error,
                )


def ai_agents_sender(name: str) -> Sender:
    """Sends a batch to ai-agents for the deployment this runtime was launched for, at ``name``."""

    async def send(calls: List[dict]) -> None:
        import httpx
        from datalayer_core.utils.urls import DatalayerURLs

        from agent_runtimes.apps.principal import _asked_with_proof, launched_for

        deployment = launched_for()
        url = (
            getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
        ).rstrip("/")
        if not deployment or not url:
            raise RuntimeError("no deployment, or no ai-agents, to record them on")
        async with httpx.AsyncClient(timeout=20.0) as client:
            answer = await _asked_with_proof(
                deployment,
                url,
                lambda proved: client.post(
                    f"{url}/api/ai-agents/v1/apps/internal/addresses/{name}/calls",
                    json={"calls": calls},
                    headers=proved,
                ),
            )
        if answer.status_code != 200:
            raise RuntimeError(f"ai-agents answered {answer.status_code}")

    return send


def timed() -> Callable[[], int]:
    """A stopwatch: called, the milliseconds since it was made."""
    started = time.monotonic()
    return lambda: int((time.monotonic() - started) * 1000)


__all__ = ["CallRecord", "CallRecorder", "ai_agents_sender", "timed"]

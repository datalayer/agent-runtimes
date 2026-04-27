# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Custom guard and async wrapper capabilities."""

from __future__ import annotations

import asyncio
import inspect
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability

from .common import GuardrailBlockedError


@dataclass
class InputGuardCapability(AbstractCapability[Any]):
    """Custom input guard function."""

    guard: Any = None

    async def before_run(self, ctx: RunContext[Any]) -> None:
        if self.guard is None:
            return
        prompt = ctx.prompt
        if prompt is None:
            return
        text = str(prompt) if not isinstance(prompt, str) else prompt
        safe = self.guard(text)
        if inspect.isawaitable(safe):
            safe = await safe
        if not safe:
            raise GuardrailBlockedError("Input blocked by guard function")


@dataclass
class OutputGuardCapability(AbstractCapability[Any]):
    """Custom output guard function."""

    guard: Any = None

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        if self.guard is None:
            return result
        output = str(result.output) if hasattr(result, "output") else str(result)
        safe = self.guard(output)
        if inspect.isawaitable(safe):
            safe = await safe
        if not safe:
            raise GuardrailBlockedError("Output blocked by guard function")
        return result


@dataclass
class AsyncGuardrailCapability(AbstractCapability[Any]):
    """Concurrent/monitoring guardrail wrapper capability."""

    guard: AbstractCapability[Any] | None = None
    timing: Literal["concurrent", "blocking", "monitoring"] = "concurrent"
    cancel_on_failure: bool = True
    timeout: float | None = None
    _task: asyncio.Task[Any] | None = field(default=None, init=False, repr=False)
    _error: Exception | None = field(default=None, init=False, repr=False)

    async def wrap_run(self, ctx: RunContext[Any], *, handler: Any) -> Any:
        if self.guard is None or self.timing == "blocking":
            if self.guard is not None:
                await self.guard.before_run(ctx)
            return await handler()

        if self.timing == "monitoring":
            result = await handler()
            asyncio.create_task(self._run_guard(ctx), name="async_guardrail_monitor")
            return result

        self._error = None
        self._task = asyncio.create_task(self._run_guard(ctx), name="async_guardrail")
        result = await handler()

        if self._task and not self._task.done():
            try:
                if self.timeout is not None:
                    await asyncio.wait_for(self._task, timeout=self.timeout)
                else:
                    await self._task
            except asyncio.TimeoutError:
                self._task.cancel()

        if self._error is not None and self.cancel_on_failure:
            raise GuardrailBlockedError(f"Concurrent guard failed: {self._error}")

        return result

    async def _run_guard(self, ctx: RunContext[Any]) -> None:
        try:
            if self.guard is not None:
                await self.guard.before_run(ctx)
        except Exception as exc:
            self._error = exc

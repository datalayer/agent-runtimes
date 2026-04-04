# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""OTEL capability hooks for pydantic-ai lifecycle events."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

try:
    from datalayer_core.otel.emitter import OTelEmitter
except Exception:  # pragma: no cover - optional dependency at runtime
    OTelEmitter = None  # type: ignore[assignment]


@dataclass
class OTelHooksCapability(AbstractCapability[Any]):
    """Emit run and tool telemetry through a generic OTEL emitter."""

    service_name: str = "agent-runtimes"
    enabled: bool = True
    emit_prompt_preview: bool = False
    _emitter: Any = field(default=None, init=False, repr=False)
    _run_started_at: float = field(default=0.0, init=False, repr=False)
    _tool_started_at: dict[str, float] = field(default_factory=dict, init=False, repr=False)

    def _get_emitter(self) -> Any:
        if not self.enabled or OTelEmitter is None:
            return None
        if self._emitter is None:
            self._emitter = OTelEmitter(service_name=self.service_name)
        return self._emitter

    async def before_run(self, ctx: RunContext[Any]) -> None:
        self._run_started_at = time.perf_counter()
        emitter = self._get_emitter()
        if emitter is None:
            return
        attrs = {
            "agent.model": str(getattr(ctx.model, "model_id", "unknown")),
        }
        if self.emit_prompt_preview and getattr(ctx, "prompt", None):
            attrs["agent.prompt.preview"] = str(ctx.prompt)[:200]
        emitter.add_counter("agent_runtimes.capability.run.started", 1, attrs)

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        emitter = self._get_emitter()
        if emitter is None:
            return result
        usage = ctx.usage
        duration_ms = (time.perf_counter() - self._run_started_at) * 1000
        attrs = {
            "agent.model": str(getattr(ctx.model, "model_id", "unknown")),
        }
        emitter.add_counter("agent_runtimes.capability.run.completed", 1, attrs)
        emitter.add_histogram("agent_runtimes.capability.run.duration_ms", duration_ms, attrs)
        emitter.add_counter(
            "agent_runtimes.capability.tokens.input",
            int(getattr(usage, "input_tokens", 0) or 0),
            attrs,
        )
        emitter.add_counter(
            "agent_runtimes.capability.tokens.output",
            int(getattr(usage, "output_tokens", 0) or 0),
            attrs,
        )
        return result

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        emitter = self._get_emitter()
        if emitter is None:
            return args
        self._tool_started_at[call.tool_call_id] = time.perf_counter()
        attrs = {"tool.name": call.tool_name}
        emitter.add_counter("agent_runtimes.capability.tool.started", 1, attrs)
        return args

    async def after_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        result: Any,
    ) -> Any:
        emitter = self._get_emitter()
        if emitter is None:
            return result
        attrs = {"tool.name": call.tool_name}
        started_at = self._tool_started_at.pop(call.tool_call_id, None)
        emitter.add_counter("agent_runtimes.capability.tool.completed", 1, attrs)
        if started_at is not None:
            duration_ms = (time.perf_counter() - started_at) * 1000
            emitter.add_histogram(
                "agent_runtimes.capability.tool.duration_ms",
                duration_ms,
                attrs,
            )
        return result

    async def on_tool_execute_error(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        error: Exception,
    ) -> Exception:
        emitter = self._get_emitter()
        if emitter is None:
            return error
        attrs = {
            "tool.name": call.tool_name,
            "error.type": type(error).__name__,
        }
        emitter.add_counter("agent_runtimes.capability.tool.errors", 1, attrs)
        return error

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Capability-native guardrails for pydantic-ai agents.

These capabilities are designed to bridge existing agent-runtimes guardrail
specs with pydantic-ai's capability hooks.
"""

from __future__ import annotations

import asyncio
import inspect
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition


class GuardrailBlockedError(RuntimeError):
    """Raised when a capability guardrail blocks execution."""


def _parse_token_limit(value: Any, default: int) -> int:
    if value is None:
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        raw = value.strip().upper()
        if not raw:
            return default
        multiplier = 1
        if raw.endswith("K"):
            multiplier = 1_000
            raw = raw[:-1]
        elif raw.endswith("M"):
            multiplier = 1_000_000
            raw = raw[:-1]
        elif raw.endswith("B"):
            multiplier = 1_000_000_000
            raw = raw[:-1]
        try:
            return int(float(raw) * multiplier)
        except ValueError:
            return default
    return default


def _contains_any(value: str, patterns: list[str]) -> bool:
    lowered = value.lower()
    for pattern in patterns:
        if pattern and pattern.lower() in lowered:
            return True
    return False


@dataclass
class TokenLimitCapability(AbstractCapability[Any]):
    """Token/request/tool-call limits using capability hooks."""

    per_run: int = 100_000
    per_day: int = 500_000
    per_month: int = 5_000_000
    request_limit: int | None = None
    tool_calls_limit: int | None = None

    _run_tokens: int = field(default=0, init=False, repr=False)
    _run_requests: int = field(default=0, init=False, repr=False)
    _run_tool_calls: int = field(default=0, init=False, repr=False)
    _day_tokens: int = field(default=0, init=False, repr=False)
    _month_tokens: int = field(default=0, init=False, repr=False)
    _current_day: str = field(default="", init=False, repr=False)
    _current_month: str = field(default="", init=False, repr=False)

    def __post_init__(self) -> None:
        now = datetime.now(timezone.utc)
        self._current_day = now.date().isoformat()
        self._current_month = f"{now.year:04d}-{now.month:02d}"

    def _rollover_windows(self) -> None:
        now = datetime.now(timezone.utc)
        day = now.date().isoformat()
        month = f"{now.year:04d}-{now.month:02d}"
        if day != self._current_day:
            self._day_tokens = 0
            self._current_day = day
        if month != self._current_month:
            self._month_tokens = 0
            self._current_month = month

    async def before_run(self, ctx: RunContext[Any]) -> None:
        self._run_tokens = 0
        self._run_requests = 0
        self._run_tool_calls = 0
        self._rollover_windows()

    async def before_model_request(self, ctx: RunContext[Any], request: Any) -> Any:
        self._run_requests += 1
        if self.request_limit is not None and self._run_requests > self.request_limit:
            raise GuardrailBlockedError(
                f"Request limit exceeded: {self._run_requests}/{self.request_limit}"
            )
        return request

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        self._run_tool_calls += 1
        if (
            self.tool_calls_limit is not None
            and self._run_tool_calls > self.tool_calls_limit
        ):
            raise GuardrailBlockedError(
                f"Tool call limit exceeded: {self._run_tool_calls}/{self.tool_calls_limit}"
            )
        return args

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        self._rollover_windows()
        usage = ctx.usage
        run_tokens = int(getattr(usage, "total_tokens", 0) or 0)
        self._run_tokens += run_tokens
        self._day_tokens += run_tokens
        self._month_tokens += run_tokens

        if self._run_tokens > self.per_run:
            raise GuardrailBlockedError(
                f"Per-run token limit exceeded: {self._run_tokens}/{self.per_run}"
            )
        if self._day_tokens > self.per_day:
            raise GuardrailBlockedError(
                f"Daily token limit exceeded: {self._day_tokens}/{self.per_day}"
            )
        if self._month_tokens > self.per_month:
            raise GuardrailBlockedError(
                f"Monthly token limit exceeded: {self._month_tokens}/{self.per_month}"
            )
        return result


@dataclass
class CostBudgetCapability(AbstractCapability[Any]):
    """Cost budget guardrail with cumulative tracking."""

    per_run_usd: float | None = None
    cumulative_usd: float | None = None
    on_budget_exceeded: Literal["stop", "notify", "degrade"] = "stop"
    model_name: str | None = None

    _run_cost_usd: float = field(default=0.0, init=False, repr=False)
    _cumulative_cost_usd: float = field(default=0.0, init=False, repr=False)
    _price_input: float | None = field(default=None, init=False, repr=False)
    _price_output: float | None = field(default=None, init=False, repr=False)
    _resolved_prices: bool = field(default=False, init=False, repr=False)

    async def before_run(self, ctx: RunContext[Any]) -> None:
        self._run_cost_usd = 0.0
        if not self._resolved_prices:
            self._resolve_prices(getattr(ctx.model, "model_id", None))
        if (
            self.cumulative_usd is not None
            and self._cumulative_cost_usd > self.cumulative_usd
        ):
            self._handle_exceeded(
                f"Cumulative cost ${self._cumulative_cost_usd:.4f} exceeds ${self.cumulative_usd:.4f}"
            )

    def _resolve_prices(self, model_id: Any = None) -> None:
        model_name = str(model_id) if model_id else self.model_name
        if not model_name:
            self._resolved_prices = True
            return
        try:
            from genai_prices import get_model_prices

            short_name = (
                model_name.split(":", 1)[1] if ":" in model_name else model_name
            )
            prices = get_model_prices(short_name)
            if prices:
                self._price_input = prices.get("input", 0.0)
                self._price_output = prices.get("output", 0.0)
        except Exception:
            pass
        self._resolved_prices = True

    def _calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        if self._price_input is None or self._price_output is None:
            return 0.0
        return input_tokens * self._price_input + output_tokens * self._price_output

    def _handle_exceeded(self, message: str) -> None:
        if self.on_budget_exceeded == "notify":
            return
        if self.on_budget_exceeded == "degrade":
            return
        raise GuardrailBlockedError(message)

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        usage = ctx.usage
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        run_cost = self._calculate_cost(input_tokens, output_tokens)

        self._run_cost_usd += run_cost
        self._cumulative_cost_usd += run_cost

        if self.per_run_usd is not None and self._run_cost_usd > self.per_run_usd:
            self._handle_exceeded(
                f"Run cost ${self._run_cost_usd:.4f} exceeds ${self.per_run_usd:.4f}"
            )
        if (
            self.cumulative_usd is not None
            and self._cumulative_cost_usd > self.cumulative_usd
        ):
            self._handle_exceeded(
                f"Cumulative cost ${self._cumulative_cost_usd:.4f} exceeds ${self.cumulative_usd:.4f}"
            )
        return result


@dataclass
class ToolGuardCapability(AbstractCapability[Any]):
    """Block or require approval for tool calls."""

    blocked: list[str] = field(default_factory=list)
    require_approval: list[str] = field(default_factory=list)
    approval_callback: Any = None

    async def prepare_tools(
        self, ctx: RunContext[Any], tool_defs: list[ToolDefinition]
    ) -> list[ToolDefinition]:
        if not self.blocked:
            return tool_defs
        blocked = set(self.blocked)
        return [td for td in tool_defs if td.name not in blocked]

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        if call.tool_name not in self.require_approval:
            return args
        if self.approval_callback is None:
            raise GuardrailBlockedError(
                f"Tool '{call.tool_name}' requires approval but no callback is configured"
            )
        decision = self.approval_callback(call.tool_name, args)
        if inspect.isawaitable(decision):
            decision = await decision
        if not decision:
            raise GuardrailBlockedError(
                f"Tool '{call.tool_name}' denied by approval callback"
            )
        return args


@dataclass
class PermissionCapability(AbstractCapability[Any]):
    """Permission gate for tools based on spec permission flags."""

    permissions: dict[str, bool] = field(default_factory=dict)
    tool_permission_map: dict[str, list[str]] = field(default_factory=dict)

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        required = self._classify_tool(call.tool_name)
        denied = [perm for perm in required if not self.permissions.get(perm, True)]
        if denied:
            raise GuardrailBlockedError(
                f"Permission denied ({', '.join(denied)}) for tool '{call.tool_name}'"
            )
        return args

    def _classify_tool(self, tool_name: str) -> list[str]:
        perms: list[str] = []
        for pattern, required in self.tool_permission_map.items():
            if re.search(pattern, tool_name, re.IGNORECASE):
                perms.extend(required)
        return sorted(set(perms))


@dataclass
class PromptInjectionCapability(AbstractCapability[Any]):
    """Prompt injection detector adapted from pydantic-ai-shields."""

    sensitivity: Literal["low", "medium", "high"] = "medium"
    categories: list[str] | None = None
    custom_patterns: list[str] | None = None
    _compiled: list[re.Pattern[str]] = field(
        default_factory=list, init=False, repr=False
    )

    def __post_init__(self) -> None:
        patterns = [
            r"ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)",
            r"disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)",
            r"do\s+anything\s+now",
            r"DAN\s+mode",
            r"show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions)",
            r"pretend\s+(you\s+are|to\s+be)",
        ]
        if self.sensitivity == "high":
            patterns.extend(
                [
                    r"you\s+are\s+now\s+(a|an)",
                    r"new\s+instructions?\s*:",
                    r"\[system\]",
                ]
            )
        if self.custom_patterns:
            patterns.extend(self.custom_patterns)
        self._compiled = [re.compile(p, re.IGNORECASE) for p in patterns]

    async def before_run(self, ctx: RunContext[Any]) -> None:
        prompt = ctx.prompt
        if prompt is None:
            return
        text = str(prompt) if not isinstance(prompt, str) else prompt
        for pattern in self._compiled:
            if pattern.search(text):
                raise GuardrailBlockedError(
                    f"Prompt injection detected (pattern: {pattern.pattern})"
                )


@dataclass
class PiiDetectorCapability(AbstractCapability[Any]):
    """PII detector for input prompts."""

    detect: list[str] | None = None
    action: Literal["block", "log"] = "block"
    custom_patterns: dict[str, str] | None = None
    _compiled: dict[str, re.Pattern[str]] = field(
        default_factory=dict, init=False, repr=False
    )

    def __post_init__(self) -> None:
        base = {
            "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
            "phone": r"(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}",
            "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
            "credit_card": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
            "ip_address": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
        }
        targets = self.detect or list(base.keys())
        for name in targets:
            if name in base:
                self._compiled[name] = re.compile(base[name])
        if self.custom_patterns:
            for name, pattern in self.custom_patterns.items():
                self._compiled[name] = re.compile(pattern)

    async def before_run(self, ctx: RunContext[Any]) -> None:
        prompt = ctx.prompt
        if prompt is None:
            return
        text = str(prompt) if not isinstance(prompt, str) else prompt
        detections = [
            name for name, pattern in self._compiled.items() if pattern.search(text)
        ]
        if detections and self.action == "block":
            raise GuardrailBlockedError(
                f"PII detected in input: {', '.join(detections)}"
            )


@dataclass
class SecretRedactionCapability(AbstractCapability[Any]):
    """Block secret leakage in model output."""

    detect: list[str] | None = None
    custom_patterns: dict[str, str] | None = None
    _compiled: dict[str, re.Pattern[str]] = field(
        default_factory=dict, init=False, repr=False
    )

    def __post_init__(self) -> None:
        base = {
            "openai_key": r"sk-[a-zA-Z0-9]{20,}",
            "anthropic_key": r"sk-ant-[a-zA-Z0-9-]{20,}",
            "aws_access_key": r"AKIA[0-9A-Z]{16}",
            "github_token": r"(?:ghp|gho|ghs|ghr)_[A-Za-z0-9_]{36,}",
            "slack_token": r"xox[bporas]-[A-Za-z0-9-]{10,}",
            "private_key": r"-----BEGIN\s+(?:RSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----",
        }
        targets = self.detect or list(base.keys())
        for name in targets:
            if name in base:
                self._compiled[name] = re.compile(base[name])
        if self.custom_patterns:
            for name, pattern in self.custom_patterns.items():
                self._compiled[name] = re.compile(pattern)

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        output = str(result.output) if hasattr(result, "output") else str(result)
        for name, pattern in self._compiled.items():
            if pattern.search(output):
                raise GuardrailBlockedError(f"Secret detected in output: {name}")
        return result


@dataclass
class BlockedKeywordsCapability(AbstractCapability[Any]):
    """Keyword/regex blocklist for prompts."""

    keywords: list[str] = field(default_factory=list)
    case_sensitive: bool = False
    whole_words: bool = False
    use_regex: bool = False
    _compiled: list[re.Pattern[str]] = field(
        default_factory=list, init=False, repr=False
    )

    def __post_init__(self) -> None:
        flags = 0 if self.case_sensitive else re.IGNORECASE
        for keyword in self.keywords:
            if self.use_regex:
                pattern = keyword
            elif self.whole_words:
                pattern = rf"\b{re.escape(keyword)}\b"
            else:
                pattern = re.escape(keyword)
            self._compiled.append(re.compile(pattern, flags))

    async def before_run(self, ctx: RunContext[Any]) -> None:
        prompt = ctx.prompt
        if prompt is None:
            return
        text = str(prompt) if not isinstance(prompt, str) else prompt
        for pattern in self._compiled:
            match = pattern.search(text)
            if match:
                raise GuardrailBlockedError(
                    f"Blocked keyword detected: {match.group()}"
                )


@dataclass
class NoRefusalsCapability(AbstractCapability[Any]):
    """Block refusal-style model outputs."""

    patterns: list[str] | None = None
    allow_partial: bool = False
    min_response_length: int = 50
    _compiled: list[re.Pattern[str]] = field(
        default_factory=list, init=False, repr=False
    )

    def __post_init__(self) -> None:
        raw = self.patterns or [
            r"I\s+cannot\s+help\s+with\s+that",
            r"I'?m\s+not\s+able\s+to",
            r"I\s+can'?t\s+assist\s+with",
            r"I\s+must\s+decline",
        ]
        self._compiled = [re.compile(p, re.IGNORECASE) for p in raw]

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        output = str(result.output) if hasattr(result, "output") else str(result)
        for pattern in self._compiled:
            if pattern.search(output):
                if self.allow_partial and len(output) >= self.min_response_length:
                    continue
                raise GuardrailBlockedError(
                    f"Model refusal detected (pattern: {pattern.pattern})"
                )
        return result


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


@dataclass
class DataScopeCapability(AbstractCapability[Any]):
    """Simple data-scope enforcement on tool args/results."""

    allowed_systems: list[str] = field(default_factory=list)
    allowed_objects: list[str] = field(default_factory=list)
    denied_objects: list[str] = field(default_factory=list)
    denied_fields: list[str] = field(default_factory=list)
    allow_row_level_output: bool = True
    max_rows_in_output: int = 1000

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        raw_args = str(args)
        if self.denied_objects and _contains_any(raw_args, self.denied_objects):
            raise GuardrailBlockedError(
                f"Denied object referenced in tool args for {call.tool_name}"
            )
        if self.denied_fields and _contains_any(raw_args, self.denied_fields):
            raise GuardrailBlockedError(
                f"Denied field referenced in tool args for {call.tool_name}"
            )
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
        text = str(result)
        if self.denied_fields and _contains_any(text, self.denied_fields):
            raise GuardrailBlockedError(
                f"Denied field detected in tool result for {call.tool_name}"
            )
        return result


@dataclass
class ContentSafetyCapability(AbstractCapability[Any]):
    """Detect prompt-injection patterns in tool output."""

    treat_text_as_untrusted: bool = True
    block_data_instructions: bool = True
    extra_patterns: list[str] | None = None
    _compiled: list[re.Pattern[str]] = field(
        default_factory=list, init=False, repr=False
    )

    def __post_init__(self) -> None:
        base = [
            r"ignore\s+(all\s+)?previous\s+instructions",
            r"system:\s*you\s+are",
            r"<\|.*?\|>",
            r"\[INST\]",
            r"<<SYS>>",
        ]
        if self.extra_patterns:
            base.extend(self.extra_patterns)
        self._compiled = [re.compile(p, re.IGNORECASE) for p in base]

    async def after_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        result: Any,
    ) -> Any:
        if not self.treat_text_as_untrusted:
            return result
        text = str(result)
        for pattern in self._compiled:
            match = pattern.search(text)
            if match:
                if self.block_data_instructions:
                    raise GuardrailBlockedError(
                        f"Potential prompt injection detected in tool output: {match.group()!r}"
                    )
                return f"<data_context>\n{text}\n</data_context>"
        return result


DEFAULT_TOOL_PERMISSION_MAP: dict[str, list[str]] = {
    "read_file": ["read:data"],
    "write_file": ["write:data"],
    "execute": ["execute:code"],
    "run_python": ["execute:code"],
    "http|fetch|request": ["access:internet"],
    "email": ["send:email"],
    "deploy": ["deploy:production"],
}

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Input/output safety and content guardrail capabilities."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from .common import GuardrailBlockedError, _contains_any


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

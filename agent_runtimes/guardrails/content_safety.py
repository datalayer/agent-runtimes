# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Content safety guardrail.

Detects prompt injection patterns in tool outputs and optionally wraps
untrusted content in data-context markers to prevent the LLM from
treating data as instructions.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from .base import BaseGuardrail, GuardrailResult, GuardrailViolation

logger = logging.getLogger(__name__)

# Common prompt injection patterns (case-insensitive).
_INJECTION_PATTERNS: list[str] = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"system:\s*you\s+are",
    r"<\|.*?\|>",
    r"\[INST\]",
    r"<\|im_start\|>",
    r"<\|endoftext\|>",
    r"BEGINOFFILE",
    r"<<SYS>>",
]


class ContentSafetyGuardrail(BaseGuardrail):
    """Detect prompt injection in tool outputs.

    Spec example::

        content_safety:
          treat_crm_text_fields_as_untrusted: true
          do_not_follow_instructions_from_data: true

    Parameters
    ----------
    treat_text_as_untrusted : bool
        When True, scan all tool outputs for injection patterns.
    block_data_instructions : bool
        When True, raise on detected injection (otherwise warn).
    extra_patterns : list[str] | None
        Additional regex patterns to detect.
    """

    name = "content_safety"

    def __init__(
        self,
        treat_text_as_untrusted: bool = True,
        block_data_instructions: bool = True,
        extra_patterns: list[str] | None = None,
    ):
        self.treat_text_as_untrusted = treat_text_as_untrusted
        self.block_data_instructions = block_data_instructions
        self.patterns = _INJECTION_PATTERNS + (extra_patterns or [])
        # Pre-compile patterns
        self._compiled = [re.compile(p, re.IGNORECASE) for p in self.patterns]

    async def check_post_tool(self, tool_name: str, result: Any) -> GuardrailResult:
        """Scan tool output for prompt injection patterns."""
        if not self.treat_text_as_untrusted:
            return GuardrailResult(passed=True)

        result_text = str(result)
        for compiled_pattern in self._compiled:
            match = compiled_pattern.search(result_text)
            if match:
                message = (
                    f"Content safety: potential prompt injection detected in "
                    f"'{tool_name}' output (pattern: {match.group()!r})"
                )
                if self.block_data_instructions:
                    raise GuardrailViolation(message, guardrail_name=self.name)
                else:
                    logger.warning(message)
                    return GuardrailResult(passed=True, warning=message)

        return GuardrailResult(passed=True)

    @staticmethod
    def wrap_untrusted_content(content: str) -> str:
        """Wrap content in markers that signal the LLM to treat it as data.

        This is used to annotate tool outputs so the LLM understands
        the content is external data, not instructions to follow.
        """
        return f"<data_context>\n{content}\n</data_context>"

    @classmethod
    def from_spec(cls, config: dict) -> "ContentSafetyGuardrail":
        """Build from AgentSpec guardrail config."""
        return cls(
            treat_text_as_untrusted=config.get(
                "treat_crm_text_fields_as_untrusted",
                config.get("treat_text_as_untrusted", True),
            ),
            block_data_instructions=config.get(
                "do_not_follow_instructions_from_data",
                config.get("block_data_instructions", True),
            ),
            extra_patterns=config.get("extra_patterns"),
        )

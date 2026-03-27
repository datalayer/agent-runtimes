# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Hooks middleware — dispatches hooks on tool lifecycle events."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from .base import HookEvent, HookInput, HookResult

logger = logging.getLogger(__name__)

# Type alias for hook handler callables
HookHandler = Callable[[HookInput], Awaitable[HookResult]]


@dataclass
class HookRegistration:
    """A registered hook binding."""

    event: HookEvent
    matcher: re.Pattern  # Regex matched against tool name
    handler: HookHandler
    timeout: float = 30.0  # seconds
    background: bool = False  # Fire-and-forget (non-blocking)
    name: str = ""  # Descriptive name for logging


class HooksMiddleware:
    """Dispatch lifecycle hooks on tool execution events.

    Hooks are matched against tool names using regex patterns.
    Multiple hooks can register for the same event; they run
    sequentially (unless ``background=True``).

    Parameters
    ----------
    hooks : list[HookRegistration]
        Pre-configured hook registrations.
    """

    def __init__(self, hooks: list[HookRegistration] | None = None):
        self._hooks: list[HookRegistration] = hooks or []

    def register(self, hook: HookRegistration) -> None:
        """Add a hook registration."""
        self._hooks.append(hook)
        logger.debug(
            "Registered hook '%s' for event %s (pattern: %s)",
            hook.name or hook.handler.__name__,
            hook.event.value,
            hook.matcher.pattern,
        )

    async def dispatch_pre_tool(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
        agent_id: str | None = None,
        user_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[bool, dict[str, Any], str | None]:
        """Dispatch PRE_TOOL_USE hooks.

        Returns
        -------
        tuple[bool, dict, str | None]
            (allowed, possibly_modified_args, denial_reason)
        """
        matching = self._get_matching_hooks(HookEvent.PRE_TOOL_USE, tool_name)
        if not matching:
            return True, tool_args, None

        current_args = dict(tool_args)

        for hook in matching:
            hook_input = HookInput(
                event=HookEvent.PRE_TOOL_USE,
                tool_name=tool_name,
                tool_args=current_args,
                agent_id=agent_id,
                user_id=user_id,
                metadata=metadata or {},
            )

            if hook.background:
                asyncio.create_task(self._run_hook_safe(hook, hook_input))
                continue

            result = await self._run_hook_with_timeout(hook, hook_input)
            if result is None:
                continue

            if not result.allow:
                logger.info(
                    "Hook '%s' denied tool '%s': %s",
                    hook.name or "unnamed",
                    tool_name,
                    result.reason,
                )
                return False, current_args, result.reason

            if result.modified_args is not None:
                current_args = result.modified_args

        return True, current_args, None

    async def dispatch_post_tool(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
        tool_result: str,
        agent_id: str | None = None,
        user_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Dispatch POST_TOOL_USE hooks.

        Returns
        -------
        str
            Possibly modified tool result.
        """
        matching = self._get_matching_hooks(HookEvent.POST_TOOL_USE, tool_name)
        if not matching:
            return tool_result

        current_result = tool_result

        for hook in matching:
            hook_input = HookInput(
                event=HookEvent.POST_TOOL_USE,
                tool_name=tool_name,
                tool_args=tool_args,
                tool_result=current_result,
                agent_id=agent_id,
                user_id=user_id,
                metadata=metadata or {},
            )

            if hook.background:
                asyncio.create_task(self._run_hook_safe(hook, hook_input))
                continue

            result = await self._run_hook_with_timeout(hook, hook_input)
            if result and result.modified_result is not None:
                current_result = result.modified_result

        return current_result

    async def dispatch_post_tool_failure(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
        error: Exception,
        agent_id: str | None = None,
        user_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Dispatch POST_TOOL_USE_FAILURE hooks (all fire-and-forget)."""
        matching = self._get_matching_hooks(HookEvent.POST_TOOL_USE_FAILURE, tool_name)

        for hook in matching:
            hook_input = HookInput(
                event=HookEvent.POST_TOOL_USE_FAILURE,
                tool_name=tool_name,
                tool_args=tool_args,
                error=error,
                agent_id=agent_id,
                user_id=user_id,
                metadata=metadata or {},
            )
            # Failure hooks are always non-blocking
            asyncio.create_task(self._run_hook_safe(hook, hook_input))

    def _get_matching_hooks(
        self, event: HookEvent, tool_name: str
    ) -> list[HookRegistration]:
        """Get hooks matching the given event and tool name."""
        return [
            h for h in self._hooks if h.event == event and h.matcher.search(tool_name)
        ]

    async def _run_hook_with_timeout(
        self, hook: HookRegistration, hook_input: HookInput
    ) -> HookResult | None:
        """Run a hook with timeout. Returns None on failure."""
        try:
            return await asyncio.wait_for(
                hook.handler(hook_input), timeout=hook.timeout
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Hook '%s' timed out after %.1fs for tool '%s'",
                hook.name or "unnamed",
                hook.timeout,
                hook_input.tool_name,
            )
            return None
        except Exception:
            logger.exception(
                "Hook '%s' failed for tool '%s'",
                hook.name or "unnamed",
                hook_input.tool_name,
            )
            return None

    async def _run_hook_safe(
        self, hook: HookRegistration, hook_input: HookInput
    ) -> None:
        """Run a hook in background, swallowing errors."""
        try:
            await asyncio.wait_for(hook.handler(hook_input), timeout=hook.timeout)
        except Exception:
            logger.exception(
                "Background hook '%s' failed for tool '%s'",
                hook.name or "unnamed",
                hook_input.tool_name,
            )

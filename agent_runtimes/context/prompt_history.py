# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
What a person has typed to an agent, kept the way a shell keeps it: the
prompts, oldest first, for the arrow keys to walk back through.

Kept on the running agent — in this process, for as long as the agent is —
rather than in the conversation. The conversation is the model's: it is
compacted, summarised and cleared as the context window demands, and a prompt
sent an hour ago may be gone from it. The history is the person's, and it
outlives all of that: it is never compacted, only capped.

**Where prompts are recorded.** Not in the protocol routes. The Vercel AI
transport, A2A, ACP and MCP-UI each receive a prompt in their own shape, and
a call in each of them is a call the next protocol forgets. What they share
is the run itself: every one of them ends in the pydantic-ai agent running,
and pydantic-ai hands each run to the agent's *capabilities* first — the same
hook the guardrails inspect a prompt on and usage tracking times a run with.
``PromptHistoryCapability`` is that hook for the history: the capability
factory installs it on every agent it builds, so a prompt is recorded whoever
delivered it, and a protocol added tomorrow records without knowing this
module exists.

The frontend reads the history back with the rest of its initial state, from
``GET /api/v1/configure?agent_id=…`` as ``promptHistory``.
"""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability

#: How many prompts an agent keeps. Enough to walk back through a long
#: session; small enough that the initial state stays a small document.
MAX_PROMPTS = 200


class PromptHistoryStore:
    """The prompts sent to each agent, newest last, capped per agent."""

    def __init__(self, max_prompts: int = MAX_PROMPTS) -> None:
        self._max_prompts = max_prompts
        self._by_agent: dict[str, deque[str]] = {}
        self._lock = threading.Lock()

    def record(self, agent_id: str, prompt: str) -> None:
        """Remember a prompt. Blank prompts and immediate repeats are not."""
        text = (prompt or "").strip()
        if not agent_id or not text:
            return
        with self._lock:
            history = self._by_agent.setdefault(
                agent_id, deque(maxlen=self._max_prompts)
            )
            # The same thing sent twice in a row is one entry: walking back
            # through "yes", "yes", "yes" helps nobody. It also makes a run
            # resumed with the same prompt — after a tool approval, say — one
            # entry rather than two.
            if history and history[-1] == text:
                return
            history.append(text)

    def get(self, agent_id: str) -> list[str]:
        """The agent's prompts, oldest first. Empty for an unknown agent."""
        with self._lock:
            return list(self._by_agent.get(agent_id, ()))

    def clear(self, agent_id: str) -> None:
        """Forget an agent's prompts."""
        with self._lock:
            self._by_agent.pop(agent_id, None)


_store: PromptHistoryStore | None = None


def get_prompt_history_store() -> PromptHistoryStore:
    """The process-wide store, made on first use."""
    global _store
    if _store is None:
        _store = PromptHistoryStore()
    return _store


def record_prompt(agent_id: str | None, prompt: str | None) -> None:
    """Remember what was just sent to an agent."""
    if not agent_id or not prompt:
        return
    get_prompt_history_store().record(agent_id, prompt)


def get_prompt_history(agent_id: str | None) -> list[str]:
    """What has been sent to an agent, oldest first."""
    if not agent_id:
        return []
    return get_prompt_history_store().get(agent_id)


def clear_prompt_history(agent_id: str | None) -> None:
    """Forget what has been sent to an agent."""
    if agent_id:
        get_prompt_history_store().clear(agent_id)


def prompt_text(prompt: Any) -> str:
    """
    The words of a run's prompt, as pydantic-ai carries it.

    A prompt is a string, or a sequence of user content in which the strings
    are the words and the rest — images, files, audio — is not something the
    arrow keys can bring back. ``None`` is a run resumed without a new prompt,
    a deferred tool's result arriving, and there is nothing to remember.
    """
    if prompt is None:
        return ""
    if isinstance(prompt, str):
        return prompt
    try:
        parts = [part for part in prompt if isinstance(part, str)]
    except TypeError:
        return ""
    return "\n".join(part for part in parts if part.strip())


@dataclass
class PromptHistoryCapability(AbstractCapability[Any]):
    """
    The hook that records a prompt on its way into a run.

    One of the agent's capabilities, installed by the capability factory on
    every agent it builds, so it sees every run whichever protocol delivered
    the prompt. ``before_run`` is pydantic-ai's own hook and runs before the
    model is called; a prompt is on record even if the run then fails.

    Parameters
    ----------
    agent_id : str
        The id the frontend will ask the history for.
    enabled : bool
        Off, and the hook is a no-op.
    """

    agent_id: str
    enabled: bool = True

    async def before_run(self, ctx: RunContext[Any]) -> None:
        if not self.enabled:
            return
        record_prompt(self.agent_id, prompt_text(getattr(ctx, "prompt", None)))


def last_user_prompt(body: Any) -> str:
    """
    The prompt a chat request carries: its ``prompt``, or the text of its last
    user message.

    A message says its text in one of two ways — ``content``, a string, or
    ``parts``, a list of typed parts of which the ``text`` ones are the words —
    and a request may use either. Read by the Vercel AI transport for the OTEL
    span; the history itself is recorded by ``PromptHistoryCapability``.
    """
    if not isinstance(body, dict):
        return ""
    prompt = body.get("prompt")
    if isinstance(prompt, str) and prompt.strip():
        return prompt
    messages = body.get("messages")
    if not isinstance(messages, list):
        return ""
    for message in reversed(messages):
        if not isinstance(message, dict):
            continue
        if message.get("role") not in ("user", "input"):
            continue
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content
        parts = message.get("parts")
        if isinstance(parts, list):
            text = "\n".join(
                str(part.get("text", ""))
                for part in parts
                if isinstance(part, dict) and part.get("type") == "text"
            ).strip()
            if text:
                return text
    return ""

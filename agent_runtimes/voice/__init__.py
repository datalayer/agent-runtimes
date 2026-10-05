# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Voice on the runtime's side (VOICE.md §7): what it knows, never audio.

On the web the page listens, transcribes and speaks; the runtime sees text,
as it always has (§5). It knows three things more:

- **an application's voice** (`voice_settings`): the block of its Appspec,
  resolved against the voice catalogue — the voice it speaks with and the
  language — answered by ``/apps/configure`` and ``/apps/current`` so that a
  page knows it before the first answer (VO-45);
- **that a message was spoken** (`SpokenInput`): the page sends a transcript
  as text, with ``metadata.input == "voice"`` (VO-27), and the record keeps
  the turn marked spoken — the words, never the sound (VO-29);
- **that answers may be heard** (`VoiceCapability`): instructions telling the
  agent to write what reads well aloud (VO-44). It changes no tool and no rule.
"""

from __future__ import annotations

import contextvars
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional

from pydantic_ai.capabilities import AbstractCapability

from agent_runtimes.specs.voices import get_voice_spec, voice_for, voice_speaks

#: What the agent is told when its answers may be heard (VO-44).
VOICE_INSTRUCTIONS = (
    "Your answers may be heard as well as read: they are read aloud, sentence by "
    "sentence, as you write them. Write short sentences. Prefer a sentence to a table "
    "or a list when a sentence will do. Say numbers, units and links in words where "
    "it matters to a listener, and never rely on formatting alone to carry meaning."
)


@dataclass(frozen=True)
class SpokenInput:
    """A message the person said rather than typed: how it was heard."""

    language: str = ""
    engine: str = ""
    #: `device` (the person's browser) or `server` (ai-agents).
    where: str = ""

    def as_payload(self) -> Dict[str, str]:
        """What the record keeps of it: how the words were heard, never the sound."""
        return {
            "input": "voice",
            **{
                key: value
                for key, value in (
                    ("language", self.language),
                    ("engine", self.engine),
                    ("where", self.where),
                )
                if value
            },
        }


_SPOKEN: contextvars.ContextVar[Optional[SpokenInput]] = contextvars.ContextVar(
    "agent_runtimes_spoken_input", default=None
)


def spoken_of(metadata: Any) -> Optional[SpokenInput]:
    """A message's metadata, read as a spoken input; None when it was typed."""
    if not isinstance(metadata, Mapping) or metadata.get("input") != "voice":
        return None
    return SpokenInput(
        language=str(metadata.get("language") or "")[:35],
        engine=str(metadata.get("engine") or "")[:64],
        where=str(metadata.get("where") or "")[:16],
    )


def spoken_of_vercel_body(body: Any) -> Optional[SpokenInput]:
    """Whether the newest message of a Vercel AI request was said: its UI message's metadata."""
    messages = body.get("messages") if isinstance(body, Mapping) else None
    if not isinstance(messages, list):
        return None
    for message in reversed(messages):
        if isinstance(message, Mapping) and message.get("role") == "user":
            return spoken_of(message.get("metadata"))
    return None


def hear(spoken: Optional[SpokenInput]) -> contextvars.Token[Optional[SpokenInput]]:
    """Say, for the run this request starts, whether its message was spoken."""
    return _SPOKEN.set(spoken)


def heard() -> Optional[SpokenInput]:
    """How the current run's message was heard, when it was spoken."""
    return _SPOKEN.get()


def voice_settings(app: Any) -> Dict[str, Any]:
    """An application's voice, resolved against the catalogue (VO-41, VO-45).

    Off when it has none. The voice is its own when it names one that speaks
    its language, else the first of the catalogue that speaks it; the
    language is its own, else the voice's first, else unsaid — the page
    takes the person's then.
    """
    interface = getattr(app, "interface", None)
    voice = getattr(interface, "voice", None)
    if voice is None or not voice.enabled:
        return {"enabled": False}
    language = voice.language
    chosen = get_voice_spec(voice.voice) if voice.voice else None
    if chosen is not None and language and not voice_speaks(chosen, language):
        chosen = None
    if chosen is None and voice.output != "off":
        chosen = voice_for(language or "en-US")
    return {
        "enabled": True,
        "input": voice.input,
        "output": voice.output,
        "voice": chosen["id"] if chosen else "",
        "language": language or (chosen["languages"][0] if chosen else ""),
        "where": voice.where,
        **(
            {"attribution": chosen["attribution"]}
            if chosen and chosen["attribution"]
            else {}
        ),
    }


@dataclass
class VoiceCapability(AbstractCapability[Any]):
    """Answers that may be heard: the agent writes for the ear as well (VO-44)."""

    language: str = ""

    def get_instructions(self) -> str:
        if self.language:
            return f"{VOICE_INSTRUCTIONS} Speak in the language {self.language}."
        return VOICE_INSTRUCTIONS


def voice_capability(app: Any) -> Optional[VoiceCapability]:
    """The capability for an application whose answers may be heard; None otherwise."""
    settings = voice_settings(app)
    if not settings["enabled"] or settings["output"] == "off":
        return None
    return VoiceCapability(language=settings["language"])


__all__ = [
    "SpokenInput",
    "VOICE_INSTRUCTIONS",
    "VoiceCapability",
    "hear",
    "heard",
    "spoken_of",
    "spoken_of_vercel_body",
    "voice_capability",
    "voice_settings",
]

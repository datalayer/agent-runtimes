# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Voice on the runtime's side: what it knows, never audio.

On the web the page listens, transcribes and speaks; the runtime sees text,
as it always has. It knows three things more:

- **an application's voice** (`voice_settings`): the block of its Appspec,
  resolved against the voice catalogue — the voice it speaks with and the
  language — answered by ``/apps/configure`` and ``/apps/current`` so that a
  page knows it before the first answer (VO-45);
- **that a message was spoken** (`SpokenInput`): the page sends a transcript
  as text, with ``metadata.input == "voice"`` (VO-27), and the record keeps
  the turn marked spoken — the words, never the sound (VO-29);
- **that answers may be heard** (`VoiceCapability`): instructions telling the
  agent to write what reads well aloud (VO-44). It changes no rule; it gives
  the agent one tool, ``say_aloud``, for a short line heard and not written.

Over AG-UI it says two things only the runtime knows, as custom events
(VO-35): ``voice.settings`` — the voice and language of the running
application — at a run's start, and ``voice.say`` — a short line the agent
wants heard, not written (*One moment*), shown as a caption. Nothing else:
the page transcribes and speaks, and AG-UI carries text.
"""

from __future__ import annotations

import contextvars
from dataclasses import dataclass, field
from typing import Any, Dict, Mapping, Optional

from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolReturn
from pydantic_ai.toolsets import FunctionToolset

from agent_runtimes.specs.voices import get_voice_spec, voice_for, voice_speaks

#: What the agent is told when its answers may be heard (VO-44).
VOICE_INSTRUCTIONS = (
    "Your answers may be heard as well as read: they are read aloud, sentence by "
    "sentence, as you write them. Write short sentences. Prefer a sentence to a table "
    "or a list when a sentence will do. Say numbers, units and links in words where "
    "it matters to a listener, and never rely on formatting alone to carry meaning."
)

#: The custom events voice adds to AG-UI (VO-35), and nothing else.
VOICE_SAY_EVENT = "voice.say"
#: The person spoke over the agent (VO-46, VO-13): a client stops its voice.
VOICE_INTERRUPTED_EVENT = "voice.interrupted"
VOICE_SETTINGS_EVENT = "voice.settings"

#: The longest line `say_aloud` says: a line, never an answer.
SAY_ALOUD_MAX_CHARACTERS = 200

SAY_ALOUD_DESCRIPTION = (
    "Say a short line aloud that the person hears and does not read, such as "
    "'One moment, I am looking that up.' before a long step. It is shown as a "
    "caption while it is said. Never use it for the answer itself, which is "
    f"written as usual. At most {SAY_ALOUD_MAX_CHARACTERS} characters."
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
    return settings_of(getattr(interface, "voice", None))


def settings_of(voice: Any) -> Dict[str, Any]:
    """A voice block (an Appspec's `interface.voice`, an agent spec's `voice`), resolved against the catalogue."""
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


def say_aloud_event(line: str, settings: Mapping[str, Any]) -> Any:
    """`voice.say` (VO-35): a line to hear, with the voice and language it is said in."""
    from ag_ui.core import CustomEvent

    said = " ".join(str(line or "").split())
    if not said:
        raise ValueError("say_aloud needs a line to say.")
    if len(said) > SAY_ALOUD_MAX_CHARACTERS:
        raise ValueError(
            f"say_aloud says a line of at most {SAY_ALOUD_MAX_CHARACTERS} "
            f"characters, not {len(said)}: write the answer instead."
        )
    return CustomEvent(
        name=VOICE_SAY_EVENT,
        value={
            "text": said,
            "voice": settings.get("voice", ""),
            "language": settings.get("language", ""),
        },
    )


def data_part_of(event: Any) -> Any:
    """A voice custom event as a Vercel AI data part, `data-voice.say` (VO-36)."""
    from pydantic_ai.ui.vercel_ai.response_types import DataChunk

    return DataChunk(type=f"data-{event.name}", data=event.value)


def settings_event(settings: Mapping[str, Any]) -> Any:
    """`voice.settings` (VO-35): the running application's voice, said at a run's start."""
    from ag_ui.core import CustomEvent

    return CustomEvent(name=VOICE_SETTINGS_EVENT, value=dict(settings))


@dataclass
class VoiceCapability(AbstractCapability[Any]):
    """Answers that may be heard: the agent writes for the ear as well (VO-44).

    It gives the agent ``say_aloud`` for a short line heard, not written
    (`voice.say`, VO-35), and carries the voice resolved against the
    catalogue, which AG-UI says at a run's start (`voice.settings`).
    """

    language: str = ""
    settings: Dict[str, Any] = field(default_factory=dict)

    def get_instructions(self) -> str:
        if self.language:
            return f"{VOICE_INSTRUCTIONS} Speak in the language {self.language}."
        return VOICE_INSTRUCTIONS

    def get_toolset(self) -> FunctionToolset[Any]:
        settings = dict(self.settings)
        toolset: FunctionToolset[Any] = FunctionToolset()

        def say_aloud(line: str) -> ToolReturn:
            event = say_aloud_event(line, settings)
            # AG-UI takes the custom event, Vercel AI the data part (VO-36).
            return ToolReturn(
                return_value="Said aloud.", metadata=[event, data_part_of(event)]
            )

        toolset.add_function(say_aloud, description=SAY_ALOUD_DESCRIPTION)
        return toolset


def _capability_of(settings: Dict[str, Any]) -> Optional[VoiceCapability]:
    if not settings["enabled"] or settings["output"] == "off":
        return None
    return VoiceCapability(language=settings["language"], settings=settings)


def voice_of_agent(agent: Any) -> Optional[Dict[str, Any]]:
    """The voice settings of an agent whose answers may be heard, from its `VoiceCapability`; None otherwise."""
    from pydantic_ai.capabilities.abstract import leaf_capabilities

    root = getattr(agent, "_root_capability", None)
    if root is None:
        # A2A's worker holds the runtime's ``PydanticAIAdapter`` (its agent is
        # ``pydantic_agent``); pydantic-ai's wrappers hold theirs as ``wrapped``.
        inner = getattr(agent, "pydantic_agent", None) or getattr(
            agent, "wrapped", None
        )
        return voice_of_agent(inner) if inner is not None else None
    for capability in leaf_capabilities(root):
        if isinstance(capability, VoiceCapability) and capability.settings:
            return dict(capability.settings)
    return None


def voice_capability(app: Any) -> Optional[VoiceCapability]:
    """The capability for an application whose answers may be heard; None otherwise."""
    return _capability_of(voice_settings(app))


def agent_voice_capability(agent_spec: Any) -> Optional[VoiceCapability]:
    """The capability for an agent spec whose `voice` says its answers may be heard (VO-41); None otherwise."""
    return _capability_of(settings_of(getattr(agent_spec, "voice", None)))


__all__ = [
    "SAY_ALOUD_MAX_CHARACTERS",
    "SpokenInput",
    "VOICE_INSTRUCTIONS",
    "VOICE_INTERRUPTED_EVENT",
    "VOICE_SAY_EVENT",
    "VOICE_SETTINGS_EVENT",
    "VoiceCapability",
    "data_part_of",
    "say_aloud_event",
    "settings_event",
    "voice_of_agent",
    "agent_voice_capability",
    "hear",
    "heard",
    "spoken_of",
    "settings_of",
    "spoken_of_vercel_body",
    "voice_capability",
    "voice_settings",
]

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /voice — listen with the microphone, Ctrl+T to start and to stop (VO-15)."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "voice"
ALIASES: list[str] = ["listen"]
DESCRIPTION = (
    "Listen: speak, and the words go on the prompt line (Ctrl+T starts and stops)"
)
SHORTCUT = "c-t"
GROUP = "Session"

LISTENING = "Listening… (Ctrl+T or /voice to stop)"


async def execute(tux: "CliTux") -> Optional[str]:
    """Toggle listening: the first press opens the microphone, the second hears what was said."""
    from agent_runtimes.voice.cli import VoiceRefused

    from ..tux import STYLE_MUTED, STYLE_PRIMARY

    session = tux.voice_session()
    if not session.listening:
        problem = session.problem()
        if problem:
            # No microphone, no voice: a sentence, never a traceback (VO-17).
            tux._failed(problem)
            return None
        try:
            session.toggle()
        except Exception as error:  # noqa: BLE001 - PortAudio's own words
            tux._failed(f"The microphone could not be opened: {error}")
            return None
        tux.console.print(f"● {LISTENING}", style=STYLE_PRIMARY)
        return None
    tux.console.print("● Hearing what you said…", style=STYLE_MUTED)
    # An application whose code hears the sound itself (`@app.audio`) is
    # given the turn's sound, not the prompt line (VO-46).
    hands_over = getattr(tux, "audio_turn", None)
    if callable(hands_over) and tux.hears_audio():
        await hands_over(session.listener.stop())
        return None
    try:
        heard = await asyncio.to_thread(session.toggle)
    except VoiceRefused as refused:
        tux._failed(str(refused))
        return None
    except Exception as error:  # noqa: BLE001
        tux._failed(f"What you said could not be heard: {error}")
        return None
    if heard is None or not heard.text:
        tux.console.print("● Nothing was heard.", style=STYLE_MUTED)
        return None
    where = "on this machine" if heard.where == "local" else "on Datalayer's servers"
    tux.console.print(
        f"● Heard {where}: it is on the prompt line, to edit or send.",
        style=STYLE_MUTED,
    )
    return None

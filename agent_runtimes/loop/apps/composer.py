# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Commands and modes in the composer (LOOP P-19).

An application declares slash commands (``interface.commands``) and mode
switches (``interface.modes``). The page lists the commands when ``/`` is
typed and sends the prompt of the one picked; it sends the options of the
modes with every run (``forwardedProps.loop.modes``), and the runtime tells
the agent the instructions of the options chosen and runs the model one of
them names — for that run only.

The rules are agentspecs' (``AppInterface.mode_choice``, ``mode_effect``,
``command_prompt``), said again here on the runtime's types.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional, Tuple

from agent_runtimes.types import AppCommandSpec, AppModeSpec, AppSpec

#: Where a command's prompt takes the words typed after it.
COMMAND_INPUT = "{input}"


def command_prompt(command: AppCommandSpec, words: str = "") -> str:
    """What a command sends: its prompt, the words typed after it in place of ``{input}``."""
    words = words.strip()
    if COMMAND_INPUT in command.prompt:
        return command.prompt.replace(COMMAND_INPUT, words).strip()
    return f"{command.prompt}\n\n{words}" if words else command.prompt


def command_called(app: AppSpec, text: str) -> Optional[Tuple[AppCommandSpec, str]]:
    """The application's command a message calls, ``/<name> words``, and its words; or None."""
    said = text.lstrip()
    if not said.startswith("/"):
        return None
    head = said[1:].split(None, 1)
    if not head:
        return None
    words = head[1] if len(head) > 1 else ""
    for command in app.interface.commands:
        if command.name == head[0]:
            return command, words.strip()
    return None


def _option_ids(mode: AppModeSpec) -> list[str]:
    return [option.id for option in mode.options]


def mode_choice(
    app: AppSpec, chosen: Optional[Mapping[str, Any]] = None
) -> Dict[str, str]:
    """The option of every mode a run is in: what was chosen, else where each starts.

    Raises
    ------
    ValueError
        When a mode or an option chosen is not the application's, in a sentence.
    """
    chosen = dict(chosen or {})
    modes = {mode.id: mode for mode in app.interface.modes}
    for mode_id, option_id in chosen.items():
        mode = modes.get(mode_id)
        if mode is None:
            raise ValueError(f"{app.name} has no mode {mode_id!r}.")
        if not isinstance(option_id, str) or option_id not in _option_ids(mode):
            raise ValueError(f"The mode {mode.label} has no option {option_id!r}.")
    return {
        mode.id: str(chosen.get(mode.id) or mode.default or mode.options[0].id)
        for mode in app.interface.modes
    }


@dataclass(frozen=True)
class ModeEffect:
    """What a run in the modes chosen is told, and the model it runs on."""

    instructions: str = ""
    """The instructions of the options chosen, in the order of the modes."""

    model: Optional[str] = None
    """The model an option chosen names; the application's when None."""


def mode_effect(app: AppSpec, chosen: Optional[Mapping[str, Any]] = None) -> ModeEffect:
    """What a run in the modes chosen is told, and the model it runs on.

    Raises
    ------
    ValueError
        When a mode or an option chosen is not the application's.
    """
    choice = mode_choice(app, chosen)
    options = [
        next(option for option in mode.options if option.id == choice[mode.id])
        for mode in app.interface.modes
    ]
    instructions = "\n\n".join(
        option.instructions.strip() for option in options if option.instructions.strip()
    )
    model = next((option.model for option in options if option.model), None)
    return ModeEffect(instructions=instructions, model=model)


__all__ = [
    "COMMAND_INPUT",
    "ModeEffect",
    "command_called",
    "command_prompt",
    "mode_choice",
    "mode_effect",
]

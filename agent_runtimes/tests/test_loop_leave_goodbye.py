# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Ctrl-C and Ctrl-Z leave `loop` with its goodbye, wherever they are pressed.

The signal handlers raise a KeyboardInterrupt (the paths that stop the server
and say goodbye catch it); at the prompt, Ctrl-C and Ctrl-Z are keys, and the
prompt answers them with ``/exit``.
"""

from __future__ import annotations

import asyncio
import signal

import pytest

from agent_runtimes.chat import cli
from agent_runtimes.chat.tux import CliTux


def test_ctrl_c_and_ctrl_z_raise_keyboard_interrupt() -> None:
    assert signal.getsignal(signal.SIGINT) is cli._leave_handler
    if hasattr(signal, "SIGTSTP"):
        assert signal.getsignal(signal.SIGTSTP) is cli._leave_handler
    with pytest.raises(KeyboardInterrupt):
        cli._leave_handler(signal.SIGINT, None)


def test_sigterm_still_stops_the_server_and_dies() -> None:
    assert signal.getsignal(signal.SIGTERM) is cli._signal_handler


class _Pressed:
    """A prompt session whose prompt is left by a key press."""

    def __init__(self, error: BaseException) -> None:
        self.error = error

    async def prompt_async(self, *args: object, **kwargs: object) -> str:
        raise self.error


@pytest.mark.parametrize("error", [KeyboardInterrupt(), EOFError()])
def test_the_prompt_answers_ctrl_c_and_ctrl_d_with_exit(error: BaseException) -> None:
    tux = CliTux(agent_url="http://127.0.0.1:1/agent")
    tux.prompt_session = _Pressed(error)
    assert asyncio.run(tux.show_prompt()) == "/exit"


def test_the_prompt_binds_ctrl_z_to_leave() -> None:
    tux = CliTux(agent_url="http://127.0.0.1:1/agent")

    class _Stop(Exception):
        pass

    made: dict[str, object] = {}

    def capture(*args: object, **kwargs: object) -> _Pressed:
        made.update(kwargs)
        raise _Stop

    import agent_runtimes.chat.tux as tux_module

    original = tux_module.PromptSession
    tux_module.PromptSession = capture  # type: ignore[assignment,misc]
    try:
        with pytest.raises(_Stop):
            asyncio.run(tux.show_prompt())
    finally:
        tux_module.PromptSession = original  # type: ignore[misc]
    keys = [
        tuple(str(key) for key in binding.keys)
        for binding in made["key_bindings"].bindings
    ]  # type: ignore[attr-defined]
    assert ("Keys.ControlZ",) in keys


def test_unpickable_rows_are_grey_without_a_dash() -> None:
    import questionary

    from agent_runtimes.loop import launch
    from agent_runtimes.loop.paused import SEPARATOR

    rows = launch.select_choices(
        [
            ("Group", SEPARATOR),
            ("ai-agents-env — AI Agents, 0.048 credits a minute", "ai-agents-env"),
            ("modal-cpu — Containers, not priced", "modal-cpu", launch.NO_AGENT),
        ]
    )
    assert isinstance(rows[0], questionary.Separator)
    assert isinstance(rows[1], questionary.Choice)
    assert not isinstance(rows[1], questionary.Separator)
    assert rows[1].value == "ai-agents-env"
    assert isinstance(rows[2], questionary.Separator)
    assert rows[2].title == f"modal-cpu — Containers, not priced ({launch.NO_AGENT})"
    assert not str(rows[2].title).startswith("-")
    assert ("separator", "fg:#808080") in launch.UNPICKABLE_STYLE


def test_an_interrupt_before_the_session_says_goodbye(
    capsys: pytest.CaptureFixture[str],
) -> None:
    import typer

    from agent_runtimes.chat.banner import GOODBYE_MESSAGE

    @cli._goodbye_on_interrupt
    def picking() -> None:
        raise KeyboardInterrupt

    with pytest.raises(typer.Exit) as leaving:
        picking()
    assert leaving.value.exit_code == 0
    assert GOODBYE_MESSAGE in capsys.readouterr().out

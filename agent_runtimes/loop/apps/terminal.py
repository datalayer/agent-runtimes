# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application in the terminal: its code run here, its agent on the runtime (LOOP P-08).

``loop apps run`` serves an application on a runtime configured with its
Appspec and talks to it over AG-UI in the terminal's renderer (`CliTux`).
An ``app.py`` adds its code: the terminal is then also its `AppHost`, so
that what the code reacts to runs in this process, through a
`TerminalChannel`, while a message the code does not take is answered by the
runtime's agent, with the application's rules, as for a spec.

With ``--watch`` the file is built again when it changes, before the next
turn: the runtime is configured with the new spec, and the session goes on
with its state, through the new code (`AppHost.resume`).
"""

from __future__ import annotations

import asyncio
import json
import mimetypes
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from rich.console import Console

from agent_runtimes.chat.tux import CliTux
from agent_runtimes.loop.apps.application import AppHost, Application
from agent_runtimes.loop.apps.loading import AppNotRunnable
from agent_runtimes.loop.apps.session import (
    ChoiceQuestion,
    Delta,
    Event,
    FileQuestion,
    FormQuestion,
    Message,
    Question,
    Session,
    Step,
    UploadedFile,
)


@dataclass
class TerminalChannel:
    """A channel to the person at this terminal: shown with Rich, asked at a prompt.

    Parameters
    ----------
    console : Console
        Where it is shown.
    read : callable, optional
        How a line is read from the person; ``input`` when unsaid.
    """

    console: Console
    read: Optional[Callable[[str], str]] = None
    _streaming: Dict[str, bool] = field(default_factory=dict)

    async def deliver(self, event: Event) -> None:
        """Show a message, a piece of one, or a step."""
        if isinstance(event, Delta):
            if not self._streaming.get(event.message_id):
                self._streaming[event.message_id] = True
                self.console.print("[green]●[/green] ", end="")
            self.console.print(event.text, end="", markup=False, highlight=False)
        elif isinstance(event, Message):
            if self._streaming.pop(event.id, False):
                self.console.print()
            else:
                self.console.print("[green]●[/green] ", end="")
                self.console.print(event.text, markup=False, highlight=False)
        elif isinstance(event, Step):
            indent = "  " if event.parent_id else ""
            if event.ended_at is None:
                self.console.print(f"{indent}[dim]◦ {event.name}…[/dim]")
            elif event.error:
                self.console.print(f"{indent}[red]✗ {event.name}: {event.error}[/red]")

    async def _line(self, prompt: str) -> str:
        reader = self.read or input
        return (await asyncio.to_thread(reader, prompt)).strip()

    async def ask(self, session_id: str, question: Question) -> Any:
        """Ask at the prompt; the session checks the answer."""
        self.console.print(f"[cyan]?[/cyan] {question.prompt}", highlight=False)
        if isinstance(question, ChoiceQuestion):
            for number, option in enumerate(question.options, 1):
                self.console.print(f"  {number}. {option}", highlight=False)
            answer = await self._line("  ❯ ")
            if answer.isdigit() and 1 <= int(answer) <= len(question.options):
                return question.options[int(answer) - 1]
            return answer
        if isinstance(question, FileQuestion):
            path = Path(await self._line("  A file's path ❯ ")).expanduser()
            try:
                content = path.read_bytes()
            except OSError as error:
                return UploadedFile(path.name, "", str(error).encode())
            media_type = (
                mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            )
            return UploadedFile(path.name, media_type, content)
        if isinstance(question, FormQuestion):
            values: Dict[str, Any] = {}
            for item in question.fields:
                hint = f" ({' / '.join(item.options)})" if item.options else ""
                said = await self._line(f"  {item.label}{hint} ❯ ")
                if said:
                    values[item.id] = said
            return values
        return await self._line("  ❯ ")


class AppTux(CliTux):
    """The terminal's renderer, with an application's code in front of its agent.

    Parameters
    ----------
    application : Application
        The application, its code attached.
    reload : callable, optional
        Builds the application again when its file changed: returns the new
        one, or None when nothing changed; raises `AppNotRunnable` when the new
        one is refused. The old one goes on then.
    **kwargs : Any
        What `CliTux` takes.
    """

    def __init__(
        self,
        application: Application,
        *,
        reload: Optional[Callable[[], Optional[Application]]] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.application = application
        self.channel = TerminalChannel(self.console)
        self.host = AppHost(application, self.channel)
        self.app_session: Optional[Session] = None
        self._reload = reload

    async def _reloaded(self) -> None:
        if self._reload is None:
            return
        try:
            application = await asyncio.to_thread(self._reload)
        except AppNotRunnable as refused:
            for problem in refused.problems:
                self.console.print(f"[red]✗[/red] {problem}", highlight=False)
            self.console.print("[yellow]The application as it was goes on.[/yellow]")
            return
        if application is None:
            return
        self.application = application
        self.host = AppHost(application, self.channel)
        if self.app_session is not None:
            self.app_session = await self.host.resume(
                self.app_session.id,
                self.app_session.state,
                user=self.app_session.user,
                settings=self.app_session.settings,
            )
        self.console.print(f"[cyan]↻[/cyan] {application.spec.name} rebuilt.")

    async def _turn(self, react: Callable[[], Any]) -> None:
        try:
            await react()
        except AppNotRunnable as refused:
            for problem in refused.problems:
                self.console.print(f"[red]✗[/red] {problem}", highlight=False)
        except Exception as error:  # noqa: BLE001 - the code's error, said
            self.console.print(
                f"[red]✗[/red] The application's code failed: "
                f"{type(error).__name__}: {error}",
                highlight=False,
            )

    async def show_prompt(self) -> str:
        """Before the first prompt, the session starts: the code's ``start`` runs."""
        await self._reloaded()
        if self.app_session is None:
            opened: List[Session] = []

            async def start() -> None:
                opened.append(await self.host.open())

            await self._turn(start)
            if not opened:
                self.running = False
                return "/exit"
            self.app_session = opened[0]
        return await super().show_prompt()

    async def handle_command(self, user_input: str) -> Optional[str]:
        """``/action <name> [json]`` presses one of the application's buttons."""
        name, _, rest = user_input.partition(" ")
        if name != "/action":
            return await super().handle_command(user_input)
        action, _, payload = rest.strip().partition(" ")
        actions = sorted(self.application.actions)
        if not action or action not in actions:
            known = ", ".join(actions) or "none"
            self.console.print(
                f"[yellow]Say which action: /action <name> [json]. Its actions: {known}.[/yellow]"
            )
            return None
        try:
            data = json.loads(payload) if payload.strip() else {}
        except json.JSONDecodeError as error:
            self.console.print(f"[red]✗[/red] The payload is not JSON: {error}")
            return None
        session = self.app_session
        assert session is not None
        await self._turn(lambda: self.host.action(session, action, data))
        return None

    async def send_message(self, message: str) -> None:
        """The code's ``message`` answers, if it has one; else the runtime's agent."""
        if self.application.handler("message") is None or self.app_session is None:
            await super().send_message(message)
            return
        session = self.app_session
        self.stats.messages += 1
        self.console.print()
        await self._turn(lambda: self.host.message(session, message))
        self.console.print()

    async def stop_session(self) -> None:
        """The person leaves: the code's ``stop`` runs."""
        if self.app_session is not None and self.application.handler("stop"):
            session = self.app_session
            await self._turn(lambda: self.host.stop(session))


async def ask_once(application: Application, text: str, console: Console) -> None:
    """One question to an application's code: its ``start``, then its ``message``."""
    host = AppHost(application, TerminalChannel(console))
    session = await host.open()
    await host.message(session, text)


async def run_app_tux(
    application: Application,
    *,
    reload: Optional[Callable[[], Optional[Application]]] = None,
    **kwargs: Any,
) -> None:
    """Run an application's code in the terminal's renderer, its agent on the runtime."""
    tux = AppTux(application, reload=reload, **kwargs)
    try:
        await tux.run()
    finally:
        await tux.stop_session()


__all__ = ["AppTux", "TerminalChannel", "ask_once", "run_app_tux"]

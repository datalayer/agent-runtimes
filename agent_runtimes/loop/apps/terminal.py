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
from typing import Any, Callable, Dict, List, Mapping, Optional, Set

from rich.console import Console

from agent_runtimes.chat.tux import CliTux
from agent_runtimes.loop.apps.application import AppHost, Application
from agent_runtimes.loop.apps.composer import command_called, command_prompt
from agent_runtimes.loop.apps.forms import form_fields
from agent_runtimes.loop.apps.loading import AppNotRunnable
from agent_runtimes.loop.apps.session import (
    ChoiceQuestion,
    Closed,
    Delta,
    Event,
    FileQuestion,
    FormQuestion,
    Message,
    Question,
    Removed,
    Session,
    Shown,
    Step,
    UploadedFile,
    WindowMessage,
)


def typed(item: Mapping[str, Any], said: str) -> Any:
    """What was typed for a form's field, as its schema's type takes it.

    Left as typed when it is not that type, for the form's check to say why.
    """
    kind = item.get("type")
    if kind == "boolean":
        if said.lower() in ("y", "yes", "true", "on"):
            return True
        if said.lower() in ("n", "no", "false", "off"):
            return False
        return said
    if kind in ("integer", "number"):
        try:
            return int(said) if kind == "integer" else float(said)
        except ValueError:
            return said
    return said


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
    app_name: str = ""
    """The application's name: a message by anybody else says its author."""
    _streaming: Dict[str, bool] = field(default_factory=dict)
    _shown: Set[str] = field(default_factory=set)
    _elements: Dict[str, str] = field(default_factory=dict)
    """The panels and pages open, by id: their titles (LOOP P-18)."""

    def _bullet(self, author: str) -> None:
        self.console.print("[green]●[/green] ", end="")
        if self.app_name and author != self.app_name:
            self.console.print(f"[bold]{author}:[/bold] ", end="", highlight=False)

    async def deliver(self, event: Event) -> None:
        """Show a message, a piece of one, a message changed or removed, a step,
        or an element of a side panel or a page, named.

        A terminal does not write over what it printed: a message changed is
        printed again, marked edited; one removed is said removed.
        """
        if isinstance(event, Delta):
            if not self._streaming.get(event.message_id):
                self._streaming[event.message_id] = True
                self.console.print("[green]●[/green] ", end="")
            self.console.print(event.text, end="", markup=False, highlight=False)
        elif isinstance(event, Message):
            if self._streaming.pop(event.id, False):
                self.console.print()
            elif event.id in self._shown:
                self.console.print("[dim]↻ edited:[/dim] ", end="")
                self.console.print(event.text, markup=False, highlight=False)
            else:
                self._bullet(event.author)
                self.console.print(event.text, markup=False, highlight=False)
            self._name_components(event.components)
            self._shown.add(event.id)
        elif isinstance(event, Shown):
            # A panel or a page the terminal cannot open: said, its parts named (LOOP P-18).
            where = "the side panel" if event.where == "panel" else "a page of its own"
            verb = "changed in" if event.id in self._elements else "shown in"
            self.console.print(
                f"[dim]▸ {event.title}, {verb} {where}:[/dim]", highlight=False
            )
            self._name_components(event.components)
            self._elements[event.id] = event.title
        elif isinstance(event, Closed):
            title = self._elements.pop(event.element_id, "")
            if title:
                self.console.print(f"[dim]▹ {title}, closed.[/dim]", highlight=False)
        elif isinstance(event, WindowMessage):
            # A page the terminal does not have: what it would be told, said (LOOP P-25).
            self.console.print("[dim]⇢ to the page:[/dim] ", end="")
            self.console.print(
                json.dumps(event.data, ensure_ascii=False),
                markup=False,
                highlight=False,
            )
        elif isinstance(event, Removed):
            if event.message_id in self._shown:
                self.console.print("[dim]✗ a message was removed.[/dim]")
        elif isinstance(event, Step):
            indent = "  " if event.parent_id else ""
            if event.ended_at is None:
                self.console.print(f"{indent}[dim]◦ {event.name}…[/dim]")
            elif event.error:
                self.console.print(f"{indent}[red]✗ {event.name}: {event.error}[/red]")

    def _name_components(self, components: Any) -> None:
        for node in components:
            # A terminal draws no surface: it names what the page shows.
            if node.get("component") in ("Row", "Column", "Card", "List", "Tabs"):
                continue
            said = node.get("title") or node.get("text") or node.get("label") or ""
            line = f"  ▣ {node.get('component')} {node.get('id')}"
            if isinstance(said, str) and said:
                line += f": {said}"
            self.console.print(line, style="dim", markup=False, highlight=False)

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
            for name, item in form_fields(question.schema).items():
                options = [str(option) for option in item.get("enum") or []]
                hint = f" ({' / '.join(options)})" if options else ""
                said = await self._line(f"  {item.get('title') or name}{hint} ❯ ")
                if said:
                    values[name] = typed(item, said)
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
        self.channel = TerminalChannel(self.console, app_name=application.spec.name)
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
        """``/action <name> [json]`` presses one of the application's buttons;
        ``/<command> words`` runs one of its commands (LOOP P-19): the code
        answers it when it has the command, else its prompt is sent.
        """
        called = command_called(self.application.spec, user_input)
        if called is not None:
            command, words = called
            if command.name in self.application.commands and self.app_session:
                session = self.app_session
                await self._turn(lambda: self.host.message(session, user_input))
                return None
            return command_prompt(command, words)
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
        # The session opens before the first prompt (show_prompt).
        pressing = self.app_session
        assert pressing is not None
        await self._turn(lambda: self.host.action(pressing, action, data))
        return None

    async def send_message(self, message: str) -> None:
        """The code's ``message`` answers, if it has one, or the agent of its
        code (LOOP P-23); else the runtime's agent.
        """
        answers = (
            self.application.handler("message") is not None
            or self.application.code_agent is not None
        )
        if not answers or self.app_session is None:
            await super().send_message(message)
            return
        session = self.app_session
        self.stats.messages += 1
        self.console.print()
        await self._turn(lambda: self.host.message(session, message))
        self.console.print()

    async def end_session(self) -> None:
        """The person leaves: the conversation is closed, the code's ``end`` runs (LOOP P-14)."""
        if self.app_session is not None:
            session = self.app_session
            await self._turn(lambda: self.host.end(session))


async def ask_once(application: Application, text: str, console: Console) -> None:
    """One question to an application's code: its ``start``, then its ``message``."""
    host = AppHost(
        application, TerminalChannel(console, app_name=application.spec.name)
    )
    session = await host.open()
    await host.message(session, text)
    await host.end(session)


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
        await tux.end_session()


__all__ = ["AppTux", "TerminalChannel", "ask_once", "run_app_tux"]

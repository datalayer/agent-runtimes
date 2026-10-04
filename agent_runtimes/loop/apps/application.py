# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application written in Python (LOOP §10, P-02).

An `Application` is an Appspec and the code that reacts to its sessions::

    from agent_runtimes.loop.apps import Application, Session

    app = Application(id="customer-interview", kind="chat",
                      agent="worker-customer-interviewer:0.0.1")
    app.starter("Onboarding", "Interview me about my onboarding.")
    app.rule("send the summary by email", applies_to="send", behaviour="ask_first")

    @app.start
    async def opening(session: Session) -> None:
        session.state["goal"] = await session.ask("What do you want to learn?")

    @app.message
    async def reply(session: Session, text: str) -> None:
        async with session.step("Thinking"):
            answer = await session.agent.run(text, goal=session.state["goal"])
        await session.send(answer.text)

What it declares — starters, settings, rules, connections, schedules — is its
spec (`Application.spec`), validated as any Appspec is. What it reacts to —
``start``, ``message``, ``action``, ``settings``, ``stop``, ``resume``,
``schedule`` — is called by whoever runs it, through an `AppHost`.
"""

from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Union

from agent_runtimes.loop.apps.agent import AgentFactory, local_agent
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.rules import BEHAVIOURS
from agent_runtimes.loop.apps.session import Channel, Session, call
from agent_runtimes.types import (
    AppConnectionSpec,
    AppRuleSpec,
    AppSettingSpec,
    AppSpec,
    AppStarterSpec,
    AppTriggerSpec,
)

#: A handler: a plain function, sync or async, given the session first.
Handler = Callable[..., Any]

#: The moments an application reacts to with one handler each.
EVENTS = ("start", "message", "settings", "stop", "resume")


class Application:
    """An application: its Appspec, and the code that reacts to its sessions.

    Parameters
    ----------
    id : str
        The application's id.
    kind : str
        ``chat``, ``widget``, ``decision`` or ``worker``.
    agent : str
        The agent that does the work, ``id`` or ``id:version``.
    team : str
        Or a team of agents.
    name : str, optional
        Its display name; its id in words when unsaid.
    description : str
        What it does.
    instructions : str
        What its agent is told, beside its own instructions.
    model : str
        The model, in place of its agent's.
    goal : str
        For a worker: what it works toward.
    version : str
        The application's version.
    """

    def __init__(
        self,
        id: str,
        kind: str = "chat",
        *,
        agent: str = "",
        team: str = "",
        name: Optional[str] = None,
        description: str = "",
        instructions: str = "",
        model: str = "",
        goal: str = "",
        version: str = "0.0.1",
    ) -> None:
        document: Dict[str, Any] = {
            "schema": "loop.app/v1",
            "id": id,
            "version": version,
            "name": name or id.replace("-", " ").replace("_", " ").capitalize(),
            "kind": kind,
        }
        for key, value in (
            ("agent", agent),
            ("team", team),
            ("description", description),
            ("instructions", instructions),
            ("model", model),
            ("goal", goal),
        ):
            if value:
                document[key] = value
        self._document = document
        self._spec: Optional[AppSpec] = None
        self._handlers: Dict[str, Handler] = {}
        self._actions: Dict[str, Handler] = {}
        self._schedules: Dict[str, Handler] = {}

    @classmethod
    def from_spec(cls, spec: Union[AppSpec, Mapping[str, Any]]) -> "Application":
        """An application attached to an Appspec: its declarations, ready for code.

        Parameters
        ----------
        spec : AppSpec or mapping
            The spec, or its document as read from its YAML.

        Returns
        -------
        Application
            An application with no handlers yet.
        """
        if isinstance(spec, AppSpec):
            document = spec.model_dump(
                by_alias=True,
                exclude_defaults=True,
                exclude={"setup": True, "record": {"retention_days"}},
            )
        else:
            document = dict(spec)
        application = cls.__new__(cls)
        application._document = document
        application._spec = None
        application._handlers = {}
        application._actions = {}
        application._schedules = {}
        application.spec  # noqa: B018 - refused here, not at the first session
        return application

    # --- the spec --------------------------------------------------------------

    @property
    def id(self) -> str:
        """The application's id."""
        return str(self._document["id"])

    @property
    def spec(self) -> AppSpec:
        """The Appspec the application amounts to, validated.

        Raises
        ------
        AppNotRunnable
            When the spec would not be run, with the reasons.
        """
        if self._spec is None:
            self._spec = load_app(self._document)
        return self._spec

    @property
    def document(self) -> Dict[str, Any]:
        """The spec as a document, as its YAML would say it; a copy."""
        return dict(self._document)

    def _declare(self, section: str, item: Any, *, under: Optional[str] = None) -> None:
        target = self._document
        if under is not None:
            target = target.setdefault(under, {})
        target.setdefault(section, []).append(
            item.model_dump(by_alias=True, exclude_defaults=True)
        )
        self._spec = None

    # --- declarations ----------------------------------------------------------

    def starter(self, label: str, message: str) -> AppStarterSpec:
        """Offer a first message to the user.

        Parameters
        ----------
        label : str
            What the user reads on it.
        message : str
            What is sent when they pick it.

        Returns
        -------
        AppStarterSpec
            The starter, as the spec holds it.
        """
        starter = AppStarterSpec(label=label, message=message)
        self._declare("starters", starter, under="interface")
        return starter

    def setting(
        self,
        id: str,
        type: str,
        label: str,
        *,
        options: Sequence[str] = (),
        default: Optional[Union[str, bool, float]] = None,
        min: Optional[float] = None,
        max: Optional[float] = None,
    ) -> AppSettingSpec:
        """Let the user set something for their session.

        Parameters
        ----------
        id : str
            The setting's id: its key in ``session.settings``.
        type : str
            ``select``, ``text``, ``toggle``, ``slider`` or ``number``.
        label : str
            What the user reads beside it.
        options : sequence of str
            For a ``select``, what may be chosen.
        default : str, bool or float, optional
            Its value until the user sets it.
        min : float, optional
            For a number, the least it may be.
        max : float, optional
            For a number, the most it may be.

        Returns
        -------
        AppSettingSpec
            The setting, as the spec holds it.
        """
        setting = AppSettingSpec(
            id=id,
            type=type,
            label=label,
            options=list(options),
            default=default,
            min=min,
            max=max,
        )
        self._declare("settings", setting, under="interface")
        return setting

    def rule(
        self,
        action: str,
        *,
        applies_to: Union[str, Sequence[str]],
        behaviour: str,
    ) -> AppRuleSpec:
        """Say when the application acts alone, and when it asks.

        Parameters
        ----------
        action : str
            The action, in the words a person reads.
        applies_to : str or sequence of str
            Classes of action (``send``, ``write``…) or tools (``server.tool``).
        behaviour : str
            ``do_it``, ``if_asked``, ``ask_first`` or ``leave_to_me``.

        Returns
        -------
        AppRuleSpec
            The rule, as the spec holds it.
        """
        if behaviour not in BEHAVIOURS:
            raise ValueError(
                f"A rule's behaviour is one of {', '.join(BEHAVIOURS)}, not {behaviour!r}."
            )
        targets = [applies_to] if isinstance(applies_to, str) else list(applies_to)
        rule = AppRuleSpec(action=action, applies_to=targets, behaviour=behaviour)
        self._declare("rules", rule)
        return rule

    def connection(
        self,
        server: str,
        *,
        access: str = "read",
        acts_as: str = "owner",
        only: Sequence[str] = (),
    ) -> AppConnectionSpec:
        """Connect the application to an MCP server: all it reaches is what it names.

        Parameters
        ----------
        server : str
            The server, ``id`` or ``id:version``.
        access : str
            ``read`` or ``write``.
        acts_as : str
            In whose name: ``owner`` or ``user``.
        only : sequence of str
            The tools it may use, by name or pattern; all when empty.

        Returns
        -------
        AppConnectionSpec
            The connection, as the spec holds it.
        """
        connection = AppConnectionSpec(
            server=server, access=access, acts_as=acts_as, only=list(only)
        )
        self._declare("connections", connection)
        return connection

    # --- reactions -------------------------------------------------------------

    def _on(self, event: str, handler: Handler) -> Handler:
        if event in self._handlers:
            raise ValueError(
                f"{self.id} already reacts to {event} with "
                f"{self._handlers[event].__name__}."
            )
        self._handlers[event] = handler
        return handler

    def start(self, handler: Handler) -> Handler:
        """React to a session starting: ``handler(session)``."""
        return self._on("start", handler)

    def message(self, handler: Handler) -> Handler:
        """React to the user's message: ``handler(session, text)``.

        Without one, the application's agent answers, streamed.
        """
        return self._on("message", handler)

    def settings(self, handler: Handler) -> Handler:
        """React to the user changing settings: ``handler(session, settings)``."""
        return self._on("settings", handler)

    def stop(self, handler: Handler) -> Handler:
        """React to the user pressing Stop: ``handler(session)``."""
        return self._on("stop", handler)

    def resume(self, handler: Handler) -> Handler:
        """React to an earlier session reopened, its state back: ``handler(session)``."""
        return self._on("resume", handler)

    def action(self, name: str) -> Callable[[Handler], Handler]:
        """React to a button: ``handler(session, payload)``.

        Parameters
        ----------
        name : str
            The action's name, as the button sends it.

        Returns
        -------
        callable
            The decorator.
        """

        def decorate(handler: Handler) -> Handler:
            if name in self._actions:
                raise ValueError(f"{self.id} already has an action {name!r}.")
            self._actions[name] = handler
            return handler

        return decorate

    def schedule(
        self, cron: str, *, description: str = "", prompt: str = ""
    ) -> Callable[[Handler], Handler]:
        """Work on a schedule, in a session of its own: ``handler(session)``.

        Parameters
        ----------
        cron : str
            When, as a cron expression.
        description : str
            What it does then, in words.
        prompt : str
            What the agent is asked then, for whoever reads the spec.

        Returns
        -------
        callable
            The decorator. The schedule is known by the handler's name.
        """

        def decorate(handler: Handler) -> Handler:
            name = handler.__name__
            if name in self._schedules:
                raise ValueError(f"{self.id} already has a schedule {name!r}.")
            trigger = AppTriggerSpec(
                type="schedule",
                cron=cron,
                description=description or name,
                prompt=prompt,
            )
            self._declare("triggers", trigger)
            self._schedules[name] = handler
            return handler

        return decorate

    def handler(self, event: str) -> Optional[Handler]:
        """The handler of a moment, if the application has one.

        Parameters
        ----------
        event : str
            ``start``, ``message``, ``settings``, ``stop`` or ``resume``.

        Returns
        -------
        callable or None
            The handler.
        """
        if event not in EVENTS:
            raise ValueError(f"A moment is one of {', '.join(EVENTS)}, not {event!r}.")
        return self._handlers.get(event)

    @property
    def actions(self) -> Dict[str, Handler]:
        """The application's actions, by name; a copy."""
        return dict(self._actions)

    @property
    def schedules(self) -> Dict[str, Handler]:
        """The application's schedules, by handler name; a copy."""
        return dict(self._schedules)


async def _answer(session: Session, text: str) -> None:
    await session.stream(session.agent.stream(text))


class AppHost:
    """What runs an application in this process, and calls its code.

    A runtime, ``loop apps run`` and a test each drive an application through
    one: a session is opened, then told what the user does.

    Parameters
    ----------
    app : Application
        The application.
    channel : Channel
        What its sessions talk to their user through.
    agent : callable
        How the agent the application runs is built; in this process when unsaid.
    recorder : AppRecorder, optional
        Where the record is kept; one that sends it to ai-agents when unsaid.
    """

    def __init__(
        self,
        app: Application,
        channel: Channel,
        *,
        agent: AgentFactory = local_agent,
        recorder: Optional[AppRecorder] = None,
    ) -> None:
        self.app = app
        self.channel = channel
        self.spec = app.spec
        self._agent = agent
        self.recorder = recorder or AppRecorder(app=self.spec)
        self._running: Dict[str, asyncio.Task[Any]] = {}
        self._stopped: set[str] = set()

    def _session(self, **kwargs: Any) -> Session:
        return Session(
            self.spec,
            self.channel,
            agent_factory=self._agent,
            recorder=self.recorder,
            **kwargs,
        )

    async def _react(self, session: Session, handler: Handler, *args: Any) -> None:
        """Run a handler as one turn of the session: stoppable, then recorded."""
        self.recorder.start(session.id)
        task = asyncio.ensure_future(call(handler, session, *args))
        self._running[session.id] = task
        try:
            await task
        except asyncio.CancelledError:
            if session.id not in self._stopped:
                raise
        finally:
            if self._running.get(session.id) is task:
                del self._running[session.id]
                self._stopped.discard(session.id)
            await self.recorder.flush(session.id)

    async def open(
        self,
        *,
        user: Optional[str] = None,
        settings: Optional[Mapping[str, Any]] = None,
    ) -> Session:
        """Open a session, and run the application's ``start``.

        Parameters
        ----------
        user : str, optional
            Who the user is.
        settings : mapping, optional
            The user's settings, beside their defaults.

        Returns
        -------
        Session
            The session.
        """
        session = self._session(user=user, settings=settings)
        handler = self.app.handler("start")
        if handler is not None:
            await self._react(session, handler)
        return session

    async def message(self, session: Session, text: str) -> None:
        """The user wrote: run ``message``, or let the agent answer."""
        await self._react(session, self.app.handler("message") or _answer, text)

    async def action(
        self, session: Session, name: str, payload: Optional[Mapping[str, Any]] = None
    ) -> None:
        """The user pressed a button: run the action of that name."""
        handler = self.app.actions.get(name)
        if handler is None:
            raise KeyError(f"{self.app.id} has no action {name!r}.")
        await self._react(session, handler, dict(payload or {}))

    async def settings(self, session: Session, values: Mapping[str, Any]) -> None:
        """The user changed settings: check them, keep them, run ``settings``."""
        updated = session._update_settings(values)
        handler = self.app.handler("settings")
        if handler is not None:
            await self._react(session, handler, updated)

    async def stop(self, session: Session) -> None:
        """The user pressed Stop: what runs is cancelled, then ``stop`` runs."""
        task = self._running.get(session.id)
        if task is not None and not task.done():
            self._stopped.add(session.id)
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        handler = self.app.handler("stop")
        if handler is not None:
            await self._react(session, handler)

    async def resume(
        self,
        session_id: str,
        state: Mapping[str, Any],
        *,
        user: Optional[str] = None,
        settings: Optional[Mapping[str, Any]] = None,
    ) -> Session:
        """Reopen an earlier session with its state, and run ``resume``.

        Parameters
        ----------
        session_id : str
            The session's id.
        state : mapping
            Its state, as it was kept.
        user : str, optional
            Who the user is.
        settings : mapping, optional
            Its settings, as they were.

        Returns
        -------
        Session
            The session.
        """
        session = self._session(
            id=session_id, user=user, state=dict(state), settings=settings
        )
        handler = self.app.handler("resume")
        if handler is not None:
            await self._react(session, handler)
        return session

    async def schedule(self, name: str) -> Session:
        """Run a schedule now, in a session of its own.

        Parameters
        ----------
        name : str
            The schedule, by its handler's name.

        Returns
        -------
        Session
            The session it ran in.
        """
        handler = self.app.schedules.get(name)
        if handler is None:
            raise KeyError(f"{self.app.id} has no schedule {name!r}.")
        session = self._session()
        await self._react(session, handler)
        return session


def load_application(path: Union[str, Path]) -> Application:
    """The application an ``app.py`` defines.

    Parameters
    ----------
    path : str or Path
        The file.

    Returns
    -------
    Application
        The one `Application` at the top of the file.

    Raises
    ------
    ValueError
        When the file defines none, or more than one.
    """
    file = Path(path).resolve()
    module_name = f"loop_app_{abs(hash(str(file)))}"
    spec = importlib.util.spec_from_file_location(module_name, file)
    if spec is None or spec.loader is None:
        raise ValueError(f"{file} is not a Python file.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        # Compiled from its source each time, never from a cached .pyc: a file
        # edited within the same second, to the same size, is read as it is now
        # (`loop apps run --watch`), and nothing is written beside it.
        exec(compile(file.read_bytes(), str(file), "exec"), module.__dict__)  # noqa: S102
    finally:
        sys.modules.pop(module_name, None)
    found: List[Application] = []
    for value in vars(module).values():
        if isinstance(value, Application) and value not in found:
            found.append(value)
    if len(found) != 1:
        raise ValueError(
            f"{file.name} defines {len(found)} applications; it has to define one."
        )
    return found[0]


__all__ = ["EVENTS", "AppHost", "Application", "Handler", "load_application"]

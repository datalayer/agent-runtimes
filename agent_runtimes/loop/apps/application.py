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

What it declares — starters, settings, rules, connections, schedules, the
components of its surface (``app.ui.table(...)``) — is its spec (`Application.spec`), validated as
any Appspec is. What it reacts to —
``start``, ``message``, ``action``, ``settings``, ``stop``, ``resume``,
``end``, ``logout``, ``schedule`` — is called by whoever runs it, through
an `AppHost`.
"""

from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Union

from reactor import ContributionRegistry

from agent_runtimes.loop.apps.agent import AgentFactory, AppAgent, local_agent
from agent_runtimes.loop.apps.components import component_node
from agent_runtimes.loop.apps.composer import COMMAND_INPUT, command_called
from agent_runtimes.loop.apps.forms import form_values_refused
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.plugins import reaction_of, register_application
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.rules import BEHAVIOURS
from agent_runtimes.loop.apps.session import Channel, Session, call
from agent_runtimes.specs.ui_plugins import SurfaceComponents
from agent_runtimes.types import (
    AppCommandSpec,
    AppConnectionSpec,
    AppModeOptionSpec,
    AppModeSpec,
    AppRuleSpec,
    AppSettingSpec,
    AppSpec,
    AppStarterSpec,
    AppTriggerSpec,
)

#: A handler: a plain function, sync or async, given the session first.
Handler = Callable[..., Any]

#: The moments an application reacts to with one handler each.
EVENTS = ("start", "message", "settings", "stop", "resume", "end", "logout")


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
        self._schedule_crons: Dict[str, str] = {}
        self._commands: Dict[str, Handler] = {}

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
        application._schedule_crons = {}
        application._commands = {}
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

    def command(
        self, name: str, description: str, *, prompt: str = ""
    ) -> Callable[[Handler], Handler]:
        """Offer a slash command in the composer (LOOP P-19).

        Typing ``/`` lists the application's commands. With a ``prompt``,
        picking it sends that prompt, ``{input}`` the words typed after it::

            app.command("summarise", "Summarise what was said",
                        prompt="Summarise the conversation in five bullets. {input}")

        Without one, its code answers it — ``handler(session, words)``, in
        place of ``message``::

            @app.command("export", "Export the table")
            async def export(session: Session, words: str) -> None: ...

        Parameters
        ----------
        name : str
            What follows the slash: lower-case letters, digits and hyphens.
        description : str
            What the composer's menu says it does.
        prompt : str
            What picking it sends; ``/<name> {input}`` when unsaid, for the
            code to answer.

        Returns
        -------
        callable
            The decorator, for a command its code answers.
        """
        commands = self._document.get("interface", {}).get("commands", [])
        if any(command.get("name") == name for command in commands):
            raise ValueError(f"{self.id} already has a command /{name}.")
        self._declare(
            "commands",
            AppCommandSpec(
                name=name,
                description=description,
                prompt=prompt or f"/{name} {COMMAND_INPUT}",
            ),
            under="interface",
        )

        def decorate(handler: Handler) -> Handler:
            if prompt:
                raise ValueError(
                    f"The command /{name} sends its prompt: one its code answers has none."
                )
            self._commands[name] = handler
            return handler

        return decorate

    def mode(
        self,
        id: str,
        label: str,
        options: Sequence[Union[AppModeOptionSpec, Mapping[str, Any]]],
        *,
        default: Optional[str] = None,
    ) -> AppModeSpec:
        """Offer a mode switch in the composer (LOOP P-19).

        The option the person picks goes with every run: its ``instructions``
        are told to the agent, and the ``model`` it names is run on; the code
        reads it as ``session.modes[id]``::

            app.mode("depth", "Depth", [
                {"id": "quick", "label": "Quick", "instructions": "Two sentences at most."},
                {"id": "thorough", "label": "Thorough", "instructions": "Cite what you read."},
            ])

        Parameters
        ----------
        id : str
            The mode's id: its key in ``session.modes``.
        label : str
            What the switch is called.
        options : sequence
            Its options, two at least: ``id``, ``label`` and optionally
            ``description``, ``instructions`` and ``model``.
        default : str, optional
            The option it starts on; the first when unsaid.

        Returns
        -------
        AppModeSpec
            The mode, as the spec holds it.
        """
        mode = AppModeSpec(
            id=id,
            label=label,
            options=[
                option
                if isinstance(option, AppModeOptionSpec)
                else AppModeOptionSpec.model_validate(dict(option))
                for option in options
            ],
            default=default,
        )
        interface = self._document.setdefault("interface", {})
        interface.setdefault("modes", []).append(
            mode.model_dump(by_alias=True, exclude_defaults=True, exclude_none=True)
        )
        self._spec = None
        return mode

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

    def component(self, id: str, component: str, **properties: Any) -> Dict[str, Any]:
        """Place a component of the catalog on the application's surface (LOOP C-15).

        ``app.component("runs", "Table", title="Runs", columns=["model", "cost"])``
        writes the node the Canvas and the YAML write; ``app.ui.table(...)`` is
        the same call, typed. Every component has its properties checked
        against its JSON Schema in the catalog, the one its properties form is
        drawn from — A2UI's standard ones too; a property bound to what the
        application publishes is written ``{"path": "/runs"}`` (a List's
        template ``{"componentId": ..., "path": ...}``) and checked when the
        spec is.

        Parameters
        ----------
        id : str
            Its id on the surface, unique; ``root`` is where the surface starts.
        component : str
            The component, by its id in the catalog (``Table``, ``Chart``…).
        **properties
            Its properties.

        Returns
        -------
        dict
            The node, as the surface holds it.
        """
        node = component_node(id, component, **properties)
        interface = self._document.setdefault("interface", {})
        surface = interface.get("surface") or {"protocol": "a2ui/v0.9"}
        nodes = surface.setdefault("components", [])
        if any(node.get("id") == id for node in nodes):
            raise ValueError(f"The surface already has a component named {id}.")
        nodes.append(node)
        interface["surface"] = surface
        self._spec = None
        return dict(node)

    @property
    def ui(self) -> SurfaceComponents:
        """Every component of the catalog as a typed call (LOOP C-15).

        ``app.ui.table("runs", columns=["model", "cost"], page_size=10)`` is
        ``app.component("runs", "Table", ...)`` with its properties named and
        typed from the catalog's JSON Schema: an IDE completes them, and a
        type checker refuses a wrong one before the application runs.
        """
        return SurfaceComponents(self.component)

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

    def end(self, handler: Handler) -> Handler:
        """React to the conversation closing for good: ``handler(session)``.

        The last thing a session runs; nobody reads what it sends.
        """
        return self._on("end", handler)

    def logout(self, handler: Handler) -> Handler:
        """React to the person signing out: ``handler(session)``, then the session ends."""
        return self._on("logout", handler)

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
            self._schedule_crons[name] = cron
            return handler

        return decorate

    def handler(self, event: str) -> Optional[Handler]:
        """The handler of a moment, if the application has one.

        Parameters
        ----------
        event : str
            ``start``, ``message``, ``settings``, ``stop``, ``resume``,
            ``end`` or ``logout``.

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

    @property
    def commands(self) -> Dict[str, Handler]:
        """The commands its code answers, by name; a copy."""
        return dict(self._commands)


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
    agent_maker : callable, optional
        The agent a session's code calls, made for that session: on a
        runtime, the agent the runtime made for the application (LOOP R-04);
        built from ``agent`` when unsaid.
    registry : ContributionRegistry, optional
        The Reactor registry the application is loaded into, as its plugin
        (LOOP P-28); one of the host's own when unsaid. What a moment calls is
        what the registry holds for it, so a later contribution — another
        plugin's — answers in the application's place.
    """

    def __init__(
        self,
        app: Application,
        channel: Channel,
        *,
        agent: AgentFactory = local_agent,
        recorder: Optional[AppRecorder] = None,
        agent_maker: Optional[Callable[[Session], AppAgent]] = None,
        registry: Optional[ContributionRegistry] = None,
    ) -> None:
        self.app = app
        self.registry = registry if registry is not None else ContributionRegistry()
        self.plugin = register_application(app, self.registry)
        """The application's plugin, as the registry holds it."""
        self.channel = channel
        self.spec = app.spec
        self._agent = agent
        self._agent_maker = agent_maker
        self.recorder = recorder or AppRecorder(app=self.spec)
        self._running: Dict[str, asyncio.Task[Any]] = {}
        self._stopped: set[str] = set()
        self._ended: set[str] = set()

    def _session(self, **kwargs: Any) -> Session:
        return Session(
            self.spec,
            self.channel,
            agent_factory=self._agent,
            recorder=self.recorder,
            agent_maker=self._agent_maker,
            **kwargs,
        )

    def _reaction(self, reaction: str, name: str = "") -> Optional[Handler]:
        return reaction_of(self.spec.id, reaction, name, self.registry)

    def dispose(self) -> None:
        """Take the application's plugin away: its spec and every reaction."""
        self.registry.dispose_plugin(self.plugin.name)

    def _open(self, session: Session) -> None:
        if session.id in self._ended:
            raise ValueError(f"Session {session.id} has ended.")

    async def _cancel(self, session: Session) -> None:
        """Cancel what runs in the session, if anything does."""
        task = self._running.get(session.id)
        if task is not None and not task.done():
            self._stopped.add(session.id)
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

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
        id: Optional[str] = None,
        modes: Optional[Mapping[str, Any]] = None,
    ) -> Session:
        """Open a session, and run the application's ``start``.

        Parameters
        ----------
        user : str, optional
            Who the user is.
        settings : mapping, optional
            The user's settings, beside their defaults.
        id : str, optional
            The session's id, when whoever opens it names it — the session
            API's uid (LOOP R-04); a new one when unsaid.
        modes : mapping, optional
            The option of each mode the user is in, by mode id; where each
            starts when unsaid (LOOP P-19).

        Returns
        -------
        Session
            The session.
        """
        session = self._session(user=user, settings=settings, id=id, modes=modes)
        handler = self._reaction("start")
        if handler is not None:
            await self._react(session, handler)
        return session

    async def message(self, session: Session, text: str) -> None:
        """The user wrote: the command its code answers, when the message calls one
        (``/<name> words``, LOOP P-19); else ``message``, or the agent answers.
        """
        self._open(session)
        called = command_called(self.spec, text)
        if called is not None:
            handler = self._reaction("command", called[0].name)
            if handler is not None:
                await self._react(session, handler, called[1])
                return
        await self._react(session, self._reaction("message") or _answer, text)

    async def action(
        self, session: Session, name: str, payload: Optional[Mapping[str, Any]] = None
    ) -> None:
        """The user pressed a button: run the action of that name.

        A form's values sent with it are checked against its schema first
        (C-16): refused, the handler is not called.
        """
        self._open(session)
        handler = self._reaction("action", name)
        if handler is None:
            raise KeyError(f"{self.app.id} has no action {name!r}.")
        refused = form_values_refused(self.app.spec, name, payload or {})
        if refused:
            raise ValueError(refused)
        await self._react(session, handler, dict(payload or {}))

    async def settings(self, session: Session, values: Mapping[str, Any]) -> None:
        """The user changed settings: check them, keep them, run ``settings``."""
        self._open(session)
        updated = session._update_settings(values)
        handler = self._reaction("settings")
        if handler is not None:
            await self._react(session, handler, updated)

    async def stop(self, session: Session) -> None:
        """The user pressed Stop: what runs is cancelled, then ``stop`` runs."""
        self._open(session)
        await self._cancel(session)
        handler = self._reaction("stop")
        if handler is not None:
            await self._react(session, handler)

    async def end(self, session: Session) -> None:
        """The conversation closed: what runs is cancelled, ``end`` runs, and
        the session takes nothing more (LOOP P-14).

        Ending a session that has ended does nothing.
        """
        if session.id in self._ended:
            return
        await self._cancel(session)
        self._ended.add(session.id)
        handler = self._reaction("end")
        if handler is not None:
            await self._react(session, handler)

    async def logout(self, session: Session) -> None:
        """The person signed out: what runs is cancelled, ``logout`` runs, then
        the session ends (LOOP P-14).
        """
        self._open(session)
        await self._cancel(session)
        handler = self._reaction("logout")
        if handler is not None:
            await self._react(session, handler)
        await self.end(session)

    async def resume(
        self,
        session_id: str,
        state: Mapping[str, Any],
        *,
        user: Optional[str] = None,
        settings: Optional[Mapping[str, Any]] = None,
    ) -> Session:
        """Reopen an earlier session with its state, and run ``resume`` — an
        ended one too.

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
        # An ended session is reopened so: its thread, its state (LOOP P-14).
        self._ended.discard(session_id)
        session = self._session(
            id=session_id, user=user, state=dict(state), settings=settings
        )
        handler = self._reaction("resume")
        if handler is not None:
            await self._react(session, handler)
        return session

    async def schedule(self, name: str) -> Session:
        """Run a schedule now, in a session of its own, whose record says
        the schedule woke it (R-14).

        Parameters
        ----------
        name : str
            The schedule, by its handler's name.

        Returns
        -------
        Session
            The session it ran in.
        """
        handler = self._reaction("schedule", name)
        if handler is None:
            raise KeyError(f"{self.app.id} has no schedule {name!r}.")
        session = self._session()
        self.recorder.start(
            session.id,
            woken_by={
                "kind": "schedule",
                "schedule": name,
                "cron": self.app._schedule_crons.get(name, ""),
            },
        )
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
        exec(compile(file.read_bytes(), str(file), "exec"), module.__dict__)  # noqa: S102  # nosec B102
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

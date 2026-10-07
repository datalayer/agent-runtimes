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

What it declares — starters, profiles, settings, translations, rules, connections, schedules, the
components of its surface (``app.ui.table(...)``) — is its spec (`Application.spec`), validated as
any Appspec is. What it reacts to —
``start``, ``message``, ``action``, ``settings``, ``stop``, ``resume``,
``end``, ``logout``, ``schedule`` — is called by whoever runs it, through
an `AppHost`.
"""

from __future__ import annotations

import asyncio
import importlib.util
import inspect
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Union

from reactor import ContributionRegistry

from agent_runtimes.loop.apps.agent import AgentFactory, AppAgent, local_agent
from agent_runtimes.loop.apps.components import component_node
from agent_runtimes.loop.apps.composer import COMMAND_INPUT, command_called
from agent_runtimes.loop.apps.forms import form_values_refused
from agent_runtimes.loop.apps.frameworks import (
    CodeAgent,
    code_agent_of,
    code_agent_problems,
)
from agent_runtimes.loop.apps.loading import AppNotRunnable, load_app
from agent_runtimes.loop.apps.own import CHECK_STAGES, own_checks, own_toolset
from agent_runtimes.loop.apps.pages import (
    OUTPUT_SHOWS,
    PAGE_ACTION,
    RESULT_OUTPUT,
    PageSignature,
    page_outputs,
    page_signature,
    page_values,
    run_page,
)
from agent_runtimes.loop.apps.plugins import reaction_of, register_application
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.rules import BEHAVIOURS
from agent_runtimes.loop.apps.session import (
    Channel,
    PageShown,
    Session,
    Shown,
    UploadedFile,
    call,
)
from agent_runtimes.specs.ui_plugins import SurfaceComponents
from agent_runtimes.types import (
    AppCodeCheckSpec,
    AppCommandSpec,
    AppConnectionSpec,
    AppModeOptionSpec,
    AppModeSpec,
    AppProfileSpec,
    AppRuleSpec,
    AppSpec,
    AppStarterSpec,
    AppTestCaseSpec,
    AppToolSpec,
    AppTriggerSpec,
)

#: A handler: a plain function, sync or async, given the session first.
Handler = Callable[..., Any]

#: The moments an application reacts to with one handler each.
EVENTS = (
    "start",
    "message",
    "file",
    "settings",
    "window",
    "stop",
    "resume",
    "end",
    "logout",
    # A widget's page, run on its inputs (LOOP P-05).
    "page",
)


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
        self._schedule_positions: Dict[str, int] = {}
        self._commands: Dict[str, Handler] = {}
        self._tools: Dict[str, Handler] = {}
        self._checks: Dict[str, Handler] = {}
        self._tests: Dict[str, Handler] = {}
        self._code_agent: Optional[CodeAgent] = None
        self._page_signature: Optional[PageSignature] = None

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
        application._schedule_positions = {}
        application._commands = {}
        application._tools = {}
        application._checks = {}
        application._tests = {}
        application._code_agent = None
        application._page_signature = None
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
            spec = load_app(self._completed())
            if self._code_agent is not None:
                problems = code_agent_problems(spec, self._code_agent)
                if problems:
                    raise AppNotRunnable(problems)
            self._spec = spec
        return self._spec

    @property
    def document(self) -> Dict[str, Any]:
        """The spec as a document, as its YAML would say it; a copy."""
        return self._completed()

    def _completed(self) -> Dict[str, Any]:
        """The document, its page's output said when its code declares none (P-05).

        Raises
        ------
        AppNotRunnable
            For a page whose inputs or outputs are declared and no function runs.
        """
        document = dict(self._document)
        page = (document.get("interface") or {}).get("page")
        if page is None:
            return document
        if "function" not in page:
            raise AppNotRunnable(
                [
                    f"{self.id} declares its page's inputs or outputs, and no function "
                    "runs it: decorate one with @app.page."
                ]
            )
        if not page.get("outputs"):
            document["interface"] = {
                **document["interface"],
                "page": {**page, "outputs": [dict(RESULT_OUTPUT)]},
            }
        return document

    def _declare(self, section: str, item: Any, *, under: Optional[str] = None) -> None:
        target = self._document
        if under is not None:
            target = target.setdefault(under, {})
        target.setdefault(section, []).append(
            item.model_dump(by_alias=True, exclude_defaults=True)
        )
        self._spec = None

    # --- declarations ----------------------------------------------------------

    def starter(
        self,
        label: str,
        message: str,
        *,
        category: str = "",
        profile: Optional[str] = None,
    ) -> AppStarterSpec:
        """Offer a first message to the user.

        Parameters
        ----------
        label : str
            What the user reads on it.
        message : str
            What is sent when they pick it.
        category : str
            The heading it is offered under: the starters of one category
            together, those without one first (LOOP P-20).
        profile : str, optional
            The profile that offers it, in place of the application's
            starters (``app.profile`` first); the application's when unsaid.

        Returns
        -------
        AppStarterSpec
            The starter, as the spec holds it.

        Raises
        ------
        ValueError
            When the profile is not declared.
        """
        starter = AppStarterSpec(label=label, message=message, category=category)
        if profile is None:
            self._declare("starters", starter, under="interface")
            return starter
        profiles = self._document.get("interface", {}).get("profiles", [])
        declared = next((item for item in profiles if item.get("id") == profile), None)
        if declared is None:
            raise ValueError(
                f"{self.id} has no profile {profile!r}: declare it with app.profile first."
            )
        declared.setdefault("starters", []).append(
            starter.model_dump(exclude_defaults=True)
        )
        self._spec = None
        return starter

    def profile(
        self,
        id: str,
        label: str,
        *,
        description: str = "",
        instructions: str = "",
        model: Optional[str] = None,
    ) -> AppProfileSpec:
        """Offer one of several assistants in the application (LOOP P-20).

        The person picks a profile before the conversation starts — the first
        declared, unless they pick another — and keeps it to the end: its
        ``instructions`` are told to the agent in every run, its ``model``
        run in place of the application's (a mode's wins over it), and its
        starters (``app.starter(..., profile=id)``) offered in place of the
        application's. The code reads it as ``session.profile``::

            app.profile("support", "Support", instructions="Answer briefly.")
            app.profile("sales", "Sales", description="Plans and prices")
            app.starter("Pricing", "What does it cost?", profile="sales")

        Two at least, or none: one profile is the application itself.

        Parameters
        ----------
        id : str
            Its id: lower-case letters, digits, ``_`` and ``-``, a letter first.
        label : str
            What the person picks it by.
        description : str
            What it is for, beside its label.
        instructions : str
            What the agent is told besides its instructions.
        model : str, optional
            The model it runs on, in place of the application's.

        Returns
        -------
        AppProfileSpec
            The profile, as the spec holds it.
        """
        profiles = self._document.get("interface", {}).get("profiles", [])
        if any(item.get("id") == id for item in profiles):
            raise ValueError(f"{self.id} already has a profile {id!r}.")
        profile = AppProfileSpec(
            id=id,
            label=label,
            description=description,
            instructions=instructions,
            model=model,
        )
        interface = self._document.setdefault("interface", {})
        interface.setdefault("profiles", []).append(
            profile.model_dump(exclude_defaults=True, exclude_none=True)
        )
        self._spec = None
        return profile

    def translation(self, language: str, words: Mapping[str, Any]) -> Dict[str, Any]:
        """Say what a person reads of the application in another language (LOOP P-26).

        ``words`` is keyed as the Appspec's ``interface.translations`` are:
        ``name``, ``description``, ``welcome``; ``starters`` by their label
        (``{"label", "message"}``); ``categories`` by their words;
        ``settings`` by field (``{"title", "description", "options"}``);
        ``commands`` by name (their description); ``modes`` and ``profiles``
        by id::

            app.translation("fr", {
                "welcome": "Bonjour !",
                "starters": {"Pricing": {"label": "Tarifs", "message": "Combien ça coûte ?"}},
            })

        The page shows the person's language when the application is
        translated into it, else its own words.

        Parameters
        ----------
        language : str
            The language, as BCP 47 tags it: ``fr``, ``pt-BR``.
        words : mapping
            What is said in it.

        Returns
        -------
        dict
            The translation, as the spec holds it.
        """
        interface = self._document.setdefault("interface", {})
        translations = interface.setdefault("translations", {})
        if language in translations:
            raise ValueError(f"{self.id} is already translated into {language!r}.")
        translations[language] = dict(words)
        self._spec = None
        return translations[language]

    def setting(
        self,
        name: str,
        field: Mapping[str, Any],
        *,
        required: bool = False,
        widget: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Let the user set something for their session: a field of its settings' form.

        An application's settings are the JSON Schema of a form (LOOP C-16),
        an object of named fields, drawn with ``@datalayer/primer-rjsf`` beside
        the conversation and on a deployment's Ship card; what a run is given
        is checked against it.

        Parameters
        ----------
        name : str
            The field's name: its key in ``session.settings``.
        field : mapping
            Its JSON Schema: a ``type``, a ``title`` the user reads, a
            ``default``, and what it takes (``enum``, ``minimum``,
            ``maximum``…).
        required : bool
            Whether a run must be given it.
        widget : str, optional
            The input it is drawn with, when not its field's own (LOOP P-20):
            ``range`` (a slider), ``switch``, ``radio``, ``textarea``,
            ``checkboxes``, ``tags``, ``updown`` — its ``ui:widget`` in
            ``interface.settings_ui``. The nine inputs are a field and,
            where needed, a widget: Select (an ``enum``), Slider (``range``),
            Switch (``switch``), TextInput (a ``string``), Checkbox (a
            ``boolean``), DatePicker (``format: date``), MultiSelect (an
            ``array`` of ``enum`` items), RadioGroup (``radio``), Tags
            (``tags``).

        Returns
        -------
        dict
            The settings' form, as the spec holds it.

        Raises
        ------
        TypeError
            When the field is not a JSON Schema.
        """
        if not isinstance(field, Mapping):
            raise TypeError(
                f"The setting {name!r} is a field of the settings' form: its JSON "
                "Schema, such as {'type': 'string', 'title': 'Tone', 'enum': [...]}."
            )
        interface = self._document.setdefault("interface", {})
        form = interface.setdefault("settings", {"type": "object", "properties": {}})
        form["properties"][name] = dict(field)
        if required:
            form.setdefault("required", []).append(name)
        if widget is not None:
            drawn = interface.setdefault("settings_ui", {})
            drawn.setdefault(name, {})["ui:widget"] = widget
        self._spec = None
        return form

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

    # --- a widget's page (LOOP P-05) --------------------------------------------

    def _page(self) -> Dict[str, Any]:
        """Its page, as the document holds it; made empty the first time."""
        interface = self._document.setdefault("interface", {})
        page = interface.setdefault("page", {})
        page.setdefault("inputs", {"type": "object", "properties": {}})
        page.setdefault("outputs", [])
        self._spec = None
        return page

    def input(
        self, name: str, field: Mapping[str, Any], *, required: bool = False
    ) -> Dict[str, Any]:
        """An input of its page (LOOP P-05): a field of the form its page draws.

        Its page's function takes it by name; without this, each parameter of
        the function is an input, typed by its annotation, its default its
        default. Said here, the field wins over what the parameter says.

        Parameters
        ----------
        name : str
            The input's name: the parameter it is given as.
        field : mapping
            Its JSON Schema: a ``type``, a ``title``, a ``default``, and what
            it takes (``enum``, ``minimum``, ``maximum``…).
        required : bool
            Whether the page runs only once it is given.

        Returns
        -------
        dict
            The inputs' form, as the spec holds it.

        Raises
        ------
        TypeError
            When the field is not a JSON Schema, or the page's function does
            not take the input.
        """
        if not isinstance(field, Mapping):
            raise TypeError(
                f"The input {name!r} is a field of its page's form: its JSON Schema, "
                "such as {'type': 'integer', 'title': 'Seats', 'default': 10}."
            )
        signature = self._page_signature
        if (
            signature is not None
            and not signature.open
            and name not in signature.fields
        ):
            raise TypeError(
                f"{self.handler('page').__name__} does not take the input {name!r}: "  # type: ignore[union-attr]
                "add it as a parameter, or take **inputs."
            )
        form = self._page()["inputs"]
        form["properties"][name] = dict(field)
        if required and name not in form.get("required", []):
            form.setdefault("required", []).append(name)
        return form

    def output(
        self, name: str, component: str = "Text", *, title: str = "", **props: Any
    ) -> Dict[str, Any]:
        """An output of its page (LOOP P-05): a value it shows, with a component.

        ``app.output("total", title="Total")`` shows words;
        ``app.output("lines", "Table", columns=["item", "amount"])`` rows;
        ``app.output("trend", "Chart", kind="line", x="month", y="amount")``
        points; ``app.output("plot", "Image")`` an address. Its page's
        function returns it under its name; the component's other properties
        are checked against the catalog, as ``app.ui`` checks them.

        Returns
        -------
        dict
            The output, as the spec holds it.

        Raises
        ------
        ValueError
            For a component an output is not drawn with, properties its schema
            refuses, or a name already given.
        """
        shows = OUTPUT_SHOWS.get(component)
        if shows is None:
            raise ValueError(
                f"The output {name!r} is drawn with {component!r}: an output is one of "
                f"{', '.join(OUTPUT_SHOWS)}."
            )
        # Its value fills what the component shows: bound, as the page binds it.
        component_node(
            name, component, **{shows: {"path": f"/outputs/{name}"}}, **props
        )
        outputs = self._page()["outputs"]
        if any(output["name"] == name for output in outputs):
            raise ValueError(f"{self.id}'s page already has an output {name!r}.")
        output: Dict[str, Any] = {"name": name}
        if title:
            output["title"] = title
        if component != "Text":
            output["component"] = component
        if props:
            output["props"] = dict(props)
        outputs.append(output)
        return dict(output)

    def page(self, handler: Optional[Handler] = None, *, live: bool = True) -> Any:
        """Its page (LOOP P-05): ``handler([session], **inputs)`` returns its outputs.

        ``@app.page`` or ``@app.page(live=False)``. Each parameter of the
        function is an input of the page — typed by its annotation (``int``,
        ``float``, ``bool``, ``str``, a ``Literal`` or an ``Enum`` of them, a
        ``list`` of them), its default its default, required without one — and
        ``app.input`` says one more precisely. It returns the value of its one
        output, or its outputs by name (`output`). As an input changes on the
        page, it runs again on all of them, and the page shows its outputs in
        place; with ``live=False``, when the person presses Run.

        Parameters
        ----------
        handler : callable
            The function, sync or async; the session first when it takes one.
        live : bool
            Whether it runs again as an input changes.

        Returns
        -------
        callable
            The function, or the decorator.
        """

        def decorate(function: Handler) -> Handler:
            signature = page_signature(function)
            page = self._page()
            form = page["inputs"]
            stray = [
                name for name in form["properties"] if name not in signature.fields
            ]
            if stray and not signature.open:
                raise TypeError(
                    f"{function.__name__} does not take {', '.join(stray)}, declared "
                    "with app.input: add it as a parameter, or take **inputs."
                )
            declared = set(form["properties"])
            for name, field in signature.fields.items():
                form["properties"].setdefault(name, field)
            required = [
                name
                for name in signature.required
                if name not in declared and name not in form.get("required", [])
            ]
            if required:
                form.setdefault("required", []).extend(required)
            page["function"] = function.__name__
            if not live:
                page["live"] = False
            self._on("page", function)
            self._page_signature = signature
            return function

        return decorate(handler) if handler is not None else decorate

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

    def file(self, handler: Handler) -> Handler:
        """React to files the user sent without being asked for them (LOOP
        P-21): ``handler(session, files, text)`` — the `UploadedFile` s sent
        with one message, and its words.

        Which kinds and sizes may be sent is the Appspec's
        ``interface.uploads``: the runtime refuses the rest before this runs.
        Without one, the files wait for what the code asks
        (``session.ask(FileQuestion(...))``), and the words go to ``message``.
        """
        return self._on("file", handler)

    def settings(self, handler: Handler) -> Handler:
        """React to the user changing settings: ``handler(session, settings)``."""
        return self._on("settings", handler)

    def window(self, handler: Handler) -> Handler:
        """React to a message from the page the application sits in (LOOP
        P-25): ``handler(session, data)``, ``data`` what the page posted.

        Embedded, the page posts with ``element.postWindowMessage(data)``;
        ``session.send_window_message(data)`` answers it.
        """
        return self._on("window", handler)

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

        if name == PAGE_ACTION:
            raise ValueError(
                f"{PAGE_ACTION!r} is the action that runs its page (@app.page): "
                "name the button's action otherwise."
            )

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
            # Where it sits among the triggers: what the platform's scheduler
            # keeps it under, and wakes it by (LOOP R-14).
            self._schedule_positions[name] = len(self._document.get("triggers") or [])
            self._declare("triggers", trigger)
            self._schedules[name] = handler
            self._schedule_crons[name] = cron
            return handler

        return decorate

    # --- an agent of its own code (LOOP P-23) -----------------------------------

    def agent(
        self,
        target: Any = None,
        *,
        name: Optional[str] = None,
        tools: Optional[Mapping[str, Union[str, Sequence[str]]]] = None,
        input: Optional[Callable[..., Any]] = None,
    ) -> Any:
        """Give the application an agent of its code, in place of its agent's.

        A plain function, sync or async, given the prompt and returning the
        answer's text or yielding its pieces::

            @app.agent
            async def answer(text: str) -> str:
                return f"You said: {text}"

        Or a LangGraph graph, a LangChain runnable, a LlamaIndex agent or
        workflow, each tool it has said by what it does, for its rules::

            app.agent(graph, tools={"search": "read", "send_email": "send"})

        ``session.agent`` is then this agent: its run is shown as steps, and
        its rules decide every tool call LOOP sees — a LangChain or LangGraph
        tool through LangChain's callbacks, a LlamaIndex agent's through its
        tool calls; a function's and a workflow's LOOP does not see (`frameworks`).
        The spec still names an agent of the catalogue (``agent=``): what
        answers where its code does not run.

        Parameters
        ----------
        target : Any
            The function, graph, runnable, agent or workflow.
        name : str, optional
            What it is called; the function's name, else its class's.
        tools : mapping, optional
            What each of its tools does, by name: ``read``, ``write``,
            ``send``, ``buy``, ``delete``, ``publish``; declared in the spec.
        input : callable, optional
            ``input(prompt, **context)``: what a turn is given to it as; for a
            LangGraph graph ``{"messages": [...]}``, for a runnable the prompt,
            for a LlamaIndex agent or workflow ``{"user_msg": prompt}``.

        Returns
        -------
        Any
            ``target``, or a decorator when it is not given.
        """
        if target is None:
            return lambda given: self.agent(given, name=name, tools=tools, input=input)
        if self._code_agent is not None:
            raise ValueError(
                f"{self.id} already has an agent of its code: {self._code_agent.name}."
            )
        if self._tools:
            raise ValueError(_GIVES_ITS_OWN)
        code = getattr(target, "__code__", None)
        if code is not None:
            line = code.co_firstlineno
        else:
            caller = inspect.currentframe()
            caller = caller.f_back if caller is not None else None
            # Called through the decorator form: the line that called it.
            while caller is not None and caller.f_code.co_filename == __file__:
                caller = caller.f_back
            line = caller.f_lineno if caller is not None else 0
        agent, declared = code_agent_of(
            target, name=name, tools=tools, input=input, line=line
        )
        for tool in declared:
            self._declare("tools", tool)
        self._code_agent = agent
        self._spec = None
        return target

    @property
    def code_agent(self) -> Optional[CodeAgent]:
        """The agent its code gives it (``app.agent``), if any."""
        return self._code_agent

    # --- code where plain words are not enough (LOOP P-06) ---------------------

    def tool(
        self,
        handler: Optional[Handler] = None,
        *,
        does: Union[str, Sequence[str]] = (),
        description: str = "",
    ) -> Callable[[Handler], Handler]:
        """Give the agent a tool written here: ``handler(**arguments)``.

        Declared in the spec (``tools``), so that the Canvas lists it and a
        rule can name it by its name; every call is decided by the rules, by
        what it ``does``::

            @app.tool(does="read")
            def lookup_order(number: str) -> dict:
                \"\"\"Find an order by its number.\"\"\"
                return orders[number]

        Its arguments are its parameters, typed (their JSON Schema is the
        spec's ``parameters``); what it returns is what the agent reads. Sync
        or async.

        Parameters
        ----------
        does : str or sequence of str
            What it does, by class of action: ``read``, ``write``, ``send``,
            ``buy``, ``delete``, ``publish``. Required: what the rules decide.
        description : str
            What it does, for the agent; its docstring when unsaid.

        Returns
        -------
        callable
            The decorator. The tool is known by the function's name.
        """
        if handler is not None:
            raise TypeError(
                f"Say what the tool {getattr(handler, '__name__', handler)!r} does: "
                "@app.tool(does='read'), or write, send, buy, delete, publish."
            )
        classes = [does] if isinstance(does, str) else list(does)
        if not classes:
            raise TypeError(
                "Say what the tool does: @app.tool(does='read'), or write, send, "
                "buy, delete, publish."
            )

        def decorate(function: Handler) -> Handler:
            from pydantic_ai import Tool

            name = function.__name__
            if self._code_agent is not None:
                raise ValueError(_GIVES_ITS_OWN)
            if name in self._tools:
                raise ValueError(f"{self.id} already has a tool {name!r}.")
            definition = Tool(function, takes_ctx=False).tool_def
            said = description or definition.description or ""
            if not said.strip():
                raise ValueError(
                    f"Say what the tool {name!r} does, for the agent: a docstring, "
                    "or description=."
                )
            schema = {
                key: value
                for key, value in definition.parameters_json_schema.items()
                if key != "additionalProperties"
            }
            self._declare(
                "tools",
                AppToolSpec(
                    name=name, description=said.strip(), parameters=schema, does=classes
                ),
            )
            self._tools[name] = function
            return function

        return decorate

    def check(self, on: str, *, description: str = "") -> Callable[[Handler], Handler]:
        """Check every answer, or every tool call, with code (LOOP P-06).

        Run at its stage beside the built-in checks (R-06): on ``answer``,
        ``handler(text)`` before the answer is given — one it refuses is asked
        again; on ``tool_call``, ``handler(tool, arguments)`` once the rules
        let the call through — one it refuses is stopped. It returns ``None``
        or ``True`` to let it pass, ``False`` or a sentence saying why not::

            @app.check("answer")
            def no_prices(text: str) -> str | None:
                \"\"\"It never quotes a price.\"\"\"
                if "$" in text:
                    return "It quoted a price."

        Parameters
        ----------
        on : str
            ``answer`` or ``tool_call``.
        description : str
            What it checks, in a sentence a person reads; its docstring's
            first line when unsaid.

        Returns
        -------
        callable
            The decorator. The check is known by the function's name.
        """
        if on not in CHECK_STAGES:
            raise ValueError(
                f"A check runs on {' or '.join(CHECK_STAGES)}, not {on!r}."
            )

        def decorate(function: Handler) -> Handler:
            name = function.__name__
            if name in self._checks:
                raise ValueError(f"{self.id} already has a check {name!r}.")
            said = description or _first_line(function)
            if not said:
                raise ValueError(
                    f"Say what the check {name!r} checks: a docstring, or description=."
                )
            checks = self._document.setdefault("checks", {})
            checks.setdefault("code", []).append(
                AppCodeCheckSpec(name=name, on=on, description=said).model_dump()
            )
            self._spec = None
            self._checks[name] = function
            return function

        return decorate

    def test(self, expect: str, *, ask: str) -> Callable[[Handler], Handler]:
        """A test whose verdict is code: ``handler(conversation)`` (LOOP P-06).

        A case of the spec (``tests.cases``) — what it is asked, and what it
        should do in words — decided by the function, given the
        `Conversation` the case had; it returns ``True``, ``False`` or a
        sentence saying why it failed. ``loop apps validate app.py --tests
        --local`` runs it; without the file, the case is judged by its words::

            @app.test("It never asks a leading question", ask="Interview me.")
            def no_leading_question(conversation: Conversation) -> bool:
                return "don't you think" not in conversation.answer

        Parameters
        ----------
        expect : str
            What it should do, in words.
        ask : str
            What it is asked.

        Returns
        -------
        callable
            The decorator. The test is known by the function's name.
        """

        def decorate(function: Handler) -> Handler:
            name = function.__name__
            if name in self._tests:
                raise ValueError(f"{self.id} already has a test {name!r}.")
            self._declare(
                "cases",
                AppTestCaseSpec(ask=ask, expect=expect, code=name),
                under="tests",
            )
            self._tests[name] = function
            return function

        return decorate

    @property
    def tools(self) -> Dict[str, Handler]:
        """The tools its code gives the agent, by name; a copy."""
        return dict(self._tools)

    @property
    def checks(self) -> Dict[str, Handler]:
        """The checks of its code, by name; a copy."""
        return dict(self._checks)

    @property
    def tests(self) -> Dict[str, Handler]:
        """The tests its code decides, by name; a copy."""
        return dict(self._tests)

    def handler(self, event: str) -> Optional[Handler]:
        """The handler of a moment, if the application has one.

        Parameters
        ----------
        event : str
            ``start``, ``message``, ``settings``, ``stop``, ``resume``,
            ``end``, ``logout`` or ``page``.

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

    def schedule_at(self, position: int) -> Optional[str]:
        """The schedule its code declared at a position among its triggers.

        A deployment's schedule is woken by its position (LOOP R-14): the
        scheduler knows a trigger by where it sits, and a trigger has no name.

        Parameters
        ----------
        position : int
            The trigger's position among the application's triggers.

        Returns
        -------
        str or None
            The schedule's name — its handler's — or ``None`` when its code
            declared no schedule there.
        """
        for name, at in self._schedule_positions.items():
            if at == position:
                return name
        return None

    @property
    def commands(self) -> Dict[str, Handler]:
        """The commands its code answers, by name; a copy."""
        return dict(self._commands)

    # --- where it is served (LOOP P-25) ----------------------------------------

    def mount(
        self,
        api: Any,
        path: str = "/assistant",
        *,
        app_uid: str = "",
        token: Optional[Callable[..., Any]] = None,
        embed_origin: str = "https://datalayer.ai",
        config: Any = None,
    ) -> Any:
        """Serve the application inside a FastAPI of one's own (LOOP P-25):
        ``app.mount(api, path="/assistant")``.

        Under ``path``: its page (the embed, its agent on this runtime), the
        session API and the chat's AG-UI, the runtime's own routes; its agent
        made when ``api`` starts, and its code reacting to its sessions. See
        `agent_runtimes.loop.apps.mounting.mount`.

        Parameters
        ----------
        api : FastAPI
            The developer's FastAPI.
        path : str
            Where it is served.
        app_uid : str
            The application as Datalayer knows it, when an embed token names it.
        token : callable, optional
            ``token(request)``: the visit's embed token, issued by the
            developer's server, given to the page (LOOP R-20).
        embed_origin : str
            Where the embed's script is served.
        config : ServerConfig, optional
            The runtime's configuration.

        Returns
        -------
        FastAPI
            The runtime, as mounted.
        """
        from agent_runtimes.loop.apps.mounting import mount

        return mount(
            self,
            api,
            path,
            app_uid=app_uid,
            token=token,
            embed_origin=embed_origin,
            config=config,
        )


#: Why an agent of its code and tools of its code do not go together.
_GIVES_ITS_OWN = (
    "An agent of its code (app.agent) brings its own tools, and @app.tool gives "
    "a tool to an agent of the catalogue: give the tool to the agent itself."
)


def _first_line(function: Handler) -> str:
    """The first line of a function's docstring, or nothing."""
    doc = (getattr(function, "__doc__", None) or "").strip()
    return doc.splitlines()[0].strip() if doc else ""


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
        # What its code adds to its agent (LOOP P-06): its tools, and its
        # checks at their stages — what the registry holds for each now.
        tools = {
            tool.name: self._reaction("tool", tool.name) for tool in self.spec.tools
        }
        checks = {
            check.name: self._reaction("check", check.name)
            for check in self.spec.checks.code
        }
        toolset = own_toolset(self.spec, tools)
        capability = own_checks(self.spec, checks, record=self.recorder.checked)
        # An agent of its code (LOOP P-23) is every session's, wherever it runs.
        maker = self._reaction("agent") or self._agent_maker
        return Session(
            self.spec,
            self.channel,
            agent_factory=self._agent,
            recorder=self.recorder,
            agent_maker=maker,
            toolsets=[toolset] if toolset is not None else [],
            capabilities=[capability] if capability is not None else [],
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
        profile: Optional[str] = None,
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
        profile : str, optional
            The profile the conversation is with; the first when unsaid (LOOP P-20).

        Returns
        -------
        Session
            The session.
        """
        session = self._session(
            user=user, settings=settings, id=id, modes=modes, profile=profile
        )
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

    async def files(
        self, session: Session, files: Sequence[UploadedFile], text: str = ""
    ) -> None:
        """The user sent files without being asked (LOOP P-21): run ``file``.

        Without one, the words go to ``message`` (or the agent), and the files
        wait for what the code asks.
        """
        self._open(session)
        handler = self._reaction("file")
        if handler is None:
            if text.strip():
                await self.message(session, text)
            return
        await self._react(session, handler, list(files), text)

    async def page(
        self, session: Session, inputs: Optional[Mapping[str, Any]] = None
    ) -> Dict[str, Any]:
        """An input of its page changed (LOOP P-05): run ``page`` on its inputs.

        The inputs are checked against the page's form, each with its default
        for the rest; what the function returns is shown as its outputs
        (`PageShown`), in place of the last ones.

        Returns
        -------
        dict
            Its outputs, by name, as the page draws them.

        Raises
        ------
        KeyError
            When its code has no ``@app.page``.
        ValueError
            In a sentence: inputs its form refuses, or outputs it cannot show.
        """
        self._open(session)
        function = self._reaction("page")
        if function is None:
            raise KeyError(f"{self.app.id} has no page: its code has no @app.page.")
        values = page_values(self.spec, inputs or {})
        shown: Dict[str, Any] = {}

        async def show(session: Session) -> None:
            result = await run_page(function, session, values)
            shown.update(page_outputs(self.spec, result))
            await session.channel.deliver(PageShown(session.id, values, dict(shown)))

        await self._react(session, show)
        return shown

    async def window(self, session: Session, data: Any) -> None:
        """The page posted a message (LOOP P-25): run ``window``.

        Raises
        ------
        KeyError
            When its code has no ``@app.window``.
        """
        self._open(session)
        handler = self._reaction("window")
        if handler is None:
            raise KeyError(
                f"{self.app.id} reads no window message: it has no @app.window."
            )
        await self._react(session, handler, data)

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
        elements: Sequence[Shown] = (),
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
        elements : sequence of Shown
            What was open in a side panel or on a page (LOOP P-18): open
            again, for its code to change or close.

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
        session._reopen(elements)
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
        if self._reaction("schedule", name) is None:
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
        await self.scheduled(session, name)
        return session

    async def scheduled(self, session: Session, name: str) -> None:
        """Run a schedule's handler in a session already open — one the
        platform's scheduler woke on a runtime (LOOP R-14) — as a command's
        code runs: what the registry holds for it, as one turn of the session.

        Parameters
        ----------
        session : Session
            The session the tick opened.
        name : str
            The schedule, by its handler's name.

        Raises
        ------
        KeyError
            When the application has no schedule of that name.
        """
        self._open(session)
        handler = self._reaction("schedule", name)
        if handler is None:
            raise KeyError(f"{self.app.id} has no schedule {name!r}.")
        await self._react(session, handler)


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

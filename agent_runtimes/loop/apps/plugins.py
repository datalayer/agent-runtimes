# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications as Reactor plugins, on the runtime's side (LOOP §5.4, F-12, F-13).

An application runs as two Reactor plugins of one name, ``loop-app-<id>``
(LOOP F-15): the page's (`defineAppPlugin`, in `src/apps/apps/AppRenderer.tsx`)
and this one. Each declares the other — the page's ``requiredBackendPlugins``,
this manifest's ``frontend_dependencies`` — and both say the same
``extension``, which is how Reactor's manager and graph show the pair as one
application. The page follows what this runtime holds through
`app_plugins_state` (``GET /api/v1/apps/<id>/plugins/state``). Whichever
editor wrote it — a spec, the Canvas, an `app.py` — the runtime knows an
application only as a contribution to the ``loop.app`` point:

- every application of the catalogue is contributed by agent-runtimes' own
  plugin, ``agent-runtimes``;
- an application a runtime is configured with is contributed by a plugin of
  its own, ``loop-app-<id>``, registered when it is configured and disposed
  when another takes its place;
- what decides its tool calls — the rules capability — is an *extension* of
  its contribution, so that a plugin can wrap or replace it without the host
  knowing.

A contribution made by an application's own plugin wins over the catalogue's:
a runtime configured with an edited *Web research* runs the edit.

An application written in Python is the same plugin with its code (LOOP P-28):
each of its decorators — ``@app.start``, ``@app.message``, ``@app.action``,
``@app.schedule`` and the rest — is a contribution to a ``loop.app.<moment>``
point, beside its spec, disposed with the plugin (`register_application`). An
`AppHost` loads the application so and calls what the points hold: a later
contribution — another plugin's — to the same moment of the same application
answers in its place.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple

from reactor import (
    Command,
    ContributionPoint,
    ExtensionManifest,
    FrontendExtension,
    PluginContributions,
    PluginManifest,
    PluginPlatform,
    ReactorExtension,
    define_contribution_point,
)

from agent_runtimes.loop.apps.enforcement import AppRulesCapability
from agent_runtimes.types import AppSpec

#: The applications this runtime knows, one contribution each, keyed by the
#: application's id.
APP_POINT: ContributionPoint[AppSpec] = define_contribution_point("loop.app")

#: What extends an application's contribution to decide its tool calls: a
#: factory from the application, and the agent that runs it, to its capability.
RulesFactory = Callable[[AppSpec, Optional[str]], AppRulesCapability]

#: The moments an application's code reacts to, one point each: a moment's
#: contribution is known by the application's id, an action's, a
#: schedule's and a command's (LOOP P-19) — and a tool's, a check's and a
#: test's (P-06) — by ``<application id>/<name>``.
REACTIONS: Tuple[str, ...] = (
    "start",
    "message",
    "file",
    "settings",
    "window",
    "stop",
    "resume",
    "feedback",
    "end",
    "logout",
    # A widget's page, run on its inputs (LOOP P-05).
    "page",
    "action",
    "schedule",
    "command",
    "tool",
    "check",
    "test",
    # The agent its code gives it (LOOP P-23): what makes a session's agent.
    "agent",
)

#: The reactions known by a name besides the application's id; a tool's, a
#: check's and a test's are its code's own (LOOP P-06).
NAMED_REACTIONS: Tuple[str, ...] = (
    "action",
    "schedule",
    "command",
    "tool",
    "check",
    "test",
)
REACTION_POINTS: Dict[str, ContributionPoint[Callable[..., Any]]] = {
    reaction: define_contribution_point(f"loop.app.{reaction}")
    for reaction in REACTIONS
}

#: The plugin that contributes the catalogue.
CATALOGUE_PLUGIN = "agent-runtimes"

#: The runtime's platform. One per process, as a server has one host.
PLATFORM = PluginPlatform()


def _the(platform: Optional[PluginPlatform]) -> PluginPlatform:
    return PLATFORM if platform is None else platform


def revision_of(platform: Optional[PluginPlatform] = None) -> int:
    """How many times what a platform answers changed: what ``/plugins/state``
    answers as its ``revision``, and what its stream watches.
    """
    return _the(platform).revision


def app_plugin_name(app_id: str) -> str:
    """The one name of an application's two plugins, the page's and the runtime's
    (LOOP F-15): ``src/apps/apps/pluginPair.ts`` says the same.
    """
    return f"loop-app-{app_id}"


def manifest_of(app: AppSpec) -> PluginManifest:
    """An application's identity, as its plugin says it: the page plugin of the
    same name is what it cannot be used without, and both are delivered as
    one extension of that name — the application (LOOP F-15).
    """
    name = app_plugin_name(app.id)
    return PluginManifest(
        name=name,
        version=app.version,
        description=app.description,
        display_name=app.name,
        emoji=app.emoji,
        tags=["loop", "app", app.kind],
        extension=name,
        frontend_dependencies=[name],
    )


def extension_manifest_of(manifest: PluginManifest) -> ExtensionManifest:
    """The extension an application is delivered as: its plugin's name and face."""
    return ExtensionManifest(
        name=manifest.name,
        version=manifest.version,
        display_name=manifest.display_name,
        description=manifest.description,
        emoji=manifest.emoji,
    )


def app_plugins_state(
    app_id: str, platform: Optional[PluginPlatform] = None
) -> Dict[str, Any]:
    """Which of an application's plugins this runtime holds, as Reactor's
    ``GET /plugins/state`` says it (LOOP F-15).

    Asked for one application, by whoever already knows its id — the page
    running it — so that a runtime shared by several (the visitors' runtime)
    says nothing of the others. Its own plugin, ``loop-app-<id>``, when the
    runtime was configured with it, as the platform holds it — enabled and
    activated, or not; nothing otherwise: the page's plugin of that name then
    stands down until it is.
    """
    platform = _the(platform)
    name = app_plugin_name(app_id)
    plugins: List[Dict[str, Any]] = []
    for held in platform.list_plugins():
        if held["name"] != name:
            continue
        # Reactor's three fields, and what a graph draws of the pair: the
        # page plugin it needs, and the extension that delivers both.
        plugins.append(
            {
                "name": name,
                "enabled": held["enabled"],
                "activated": held["activated"],
                "display_name": held["display_name"],
                "emoji": held["emoji"],
                "extension": held["extension"],
                "frontend_dependencies": list(held["frontend_dependencies"]),
            }
        )
    return {"revision": platform.revision, "plugins": plugins}


def _rules(app: AppSpec, agent_id: Optional[str] = None) -> AppRulesCapability:
    # The tool that searches its documents only reads (LOOP R-29): classed
    # here, as the runtime's own, for every place its rules are read.
    from agent_runtimes.loop.apps.documents import DOCUMENT_CLASSES, knows_documents
    from agent_runtimes.loop.apps.saving import SAVING_CLASSES, saves

    extra = (
        {name: list(classes) for name, classes in DOCUMENT_CLASSES.items()}
        if knows_documents(app)
        else {}
    )
    # The tool that saves a result writes (LOOP R-24), and is always asked.
    if saves(app):
        extra.update({name: list(classes) for name, classes in SAVING_CLASSES.items()})
    # Proposing a skill and reading the approved ones act on nothing outside
    # the platform: its owner decides (LOOP R-26).
    from agent_runtimes.loop.apps.learning import LEARNING_CLASSES

    extra.update({name: list(classes) for name, classes in LEARNING_CLASSES.items()})
    return AppRulesCapability(app=app, agent_id=agent_id, extra_classes=extra)


def _contribute(contributions: PluginContributions, app: AppSpec) -> None:
    contributions.contribute(APP_POINT, app, contribution_id=app.id)
    contributions.extend(APP_POINT, app.id, _rules, contribution_id=f"{app.id}.rules")


# ----------------------------------------------------------------------
# The plugins: the catalogue's, a spec's, an application's code
# ----------------------------------------------------------------------


class CataloguePlugin:
    """The plugin of agent-runtimes itself: every application of the catalogue."""

    def provide_contributions(self, contributions: PluginContributions) -> None:
        """Contribute each application of the catalogue to ``loop.app``."""
        from agent_runtimes.specs.apps import APP_CATALOGUE

        for app in APP_CATALOGUE.values():
            _contribute(contributions, app)


class SpecPlugin:
    """The plugin of an application known by its spec alone (LOOP F-13)."""

    def __init__(self, app: AppSpec):
        self.app = app

    def provide_contributions(self, contributions: PluginContributions) -> None:
        """Contribute its spec, and the rules that decide its tool calls."""
        _contribute(contributions, self.app)


class AppPlugin:
    """The plugin of an application written in Python (LOOP P-28, P-35).

    Its implementation, as Reactor activates it: its spec on ``loop.app``,
    each reaction of its code on its ``loop.app.<moment>`` point, and what its
    author contributes in Reactor's vocabulary — to any point
    (`Application.contribute`), to one contribution of a point
    (`Application.extend`), its commands (`Application.reactor_command`) and
    its routes (`Application.route`). All of it is collected when the plugin
    activates and disposed when it is unregistered or stands down.

    Parameters
    ----------
    application : Application
        The application, its code attached.
    """

    def __init__(self, application: Any):
        self.application = application

    def provide_contributions(self, contributions: PluginContributions) -> None:
        """Contribute its spec, its reactions, and every contribution its author made."""
        application = self.application
        app: AppSpec = application.spec
        _contribute(contributions, app)
        for reaction in REACTIONS:
            if reaction in NAMED_REACTIONS or reaction == "agent":
                continue
            handler = application.handler(reaction)
            if handler is not None:
                contributions.contribute(
                    REACTION_POINTS[reaction], handler, contribution_id=app.id
                )
        for reaction, named in (
            ("action", application.actions),
            ("schedule", application.schedules),
            ("command", application.commands),
            ("tool", application.tools),
            ("check", application.checks),
            ("test", application.tests),
        ):
            for name, handler in named.items():
                contributions.contribute(
                    REACTION_POINTS[reaction],
                    handler,
                    contribution_id=f"{app.id}/{name}",
                )
        code_agent = application.code_agent
        if code_agent is not None:
            from agent_runtimes.loop.apps.frameworks import framework_agent_maker

            contributions.contribute(
                REACTION_POINTS["agent"],
                framework_agent_maker(code_agent),
                contribution_id=app.id,
            )
        for contributed in application.contributions:
            if contributed.target is None:
                contributions.contribute(
                    contributed.point,
                    contributed.value,
                    contribution_id=contributed.id,
                    order=contributed.order,
                )
            else:
                contributions.extend(
                    contributed.point,
                    contributed.target,
                    contributed.value,
                    contribution_id=contributed.id,
                    order=contributed.order,
                )

    def provide_slash_commands(self, commands: Any) -> None:
        """Register its Reactor commands, as this plugin's."""
        command: Command
        for command in self.application.reactor_commands:
            commands.register(command)

    def provide_routes(self) -> List[Dict[str, Any]]:
        """Return its routes, each with the endpoint that answers it."""
        name = app_plugin_name(self.application.id)
        return [{**route, "plugin": name} for route in self.application.routes]

    def __repr__(self) -> str:
        return f"AppPlugin({self.application.id!r})"


# ----------------------------------------------------------------------
# Registering them
# ----------------------------------------------------------------------


def _holds_extension(platform: PluginPlatform, name: str) -> bool:
    return any(extension["name"] == name for extension in platform.list_extensions())


def _take_away(platform: PluginPlatform, name: str) -> bool:
    """Unregister an application's extension, when the platform holds it."""
    if not _holds_extension(platform, name):
        return False
    platform.unregister_extension(name)
    return True


def contribute_catalogue(platform: Optional[PluginPlatform] = None) -> int:
    """Register agent-runtimes' plugin, the catalogue, once more. How many it holds."""
    platform = _the(platform)
    from agent_runtimes.specs.apps import APP_CATALOGUE

    if platform.has_plugin(CATALOGUE_PLUGIN):
        platform.unregister_plugin(CATALOGUE_PLUGIN)
    platform.register_plugin(
        PluginManifest(
            name=CATALOGUE_PLUGIN,
            version="1.0.0",
            description="The applications of agent-runtimes' catalogue.",
            display_name="Agent runtimes",
            tags=["loop", "catalogue"],
            contribution_points=[
                APP_POINT.id,
                *(p.id for p in REACTION_POINTS.values()),
            ],
        ),
        CataloguePlugin(),
    )
    return len(APP_CATALOGUE)


def _ensure_catalogue(platform: PluginPlatform) -> None:
    if not platform.has_plugin(CATALOGUE_PLUGIN):
        contribute_catalogue(platform)


def register_app(
    app: AppSpec, platform: Optional[PluginPlatform] = None
) -> PluginManifest:
    """Register an application known by its spec as its own plugin, replacing
    an earlier one of the same name.
    """
    platform = _the(platform)
    manifest = manifest_of(app)
    _ensure_catalogue(platform)
    _take_away(platform, manifest.name)
    platform.register_extension_object(
        ReactorExtension(
            manifest=extension_manifest_of(manifest),
            plugins=[(manifest, SpecPlugin(app))],
        )
    )
    return manifest


def register_application(
    application: Any,
    platform: Optional[PluginPlatform] = None,
    *,
    frontend: Optional[FrontendExtension] = None,
) -> PluginManifest:
    """Register an application written in Python as its Reactor extension
    (LOOP P-28, P-35): the extensions it uses first, then its own —
    ``loop-app-<id>``, the plugins it composes and its own plugin, whose
    spec, reactions and contributions Reactor collects as it activates. An
    earlier registration of the same application is taken away first.

    Parameters
    ----------
    application : Application
        The application, its code attached.
    platform : PluginPlatform, optional
        The host's platform; the runtime's when unsaid.
    frontend : FrontendExtension, optional
        Its page side, when its package is installed (LOOP P-29).

    Returns
    -------
    PluginManifest
        Its plugin's manifest: ``platform.unregister_extension(manifest.name)``
        takes all of it away.
    """
    platform = _the(platform)
    manifest: PluginManifest = application.manifest
    _take_away(platform, manifest.name)
    for used in application.used_extensions:
        if not _holds_extension(platform, used.name):
            platform.register_extension_object(used)
    platform.register_extension_object(application.extension(frontend=frontend))
    return manifest


def reaction_of(
    app_id: str,
    reaction: str,
    name: str = "",
    platform: Optional[PluginPlatform] = None,
) -> Optional[Callable[..., Any]]:
    """What answers a moment of an application: the last contribution to it.

    Parameters
    ----------
    app_id : str
        The application's id.
    reaction : str
        One of `REACTIONS`.
    name : str
        An action's, a schedule's or a command's name.
    platform : PluginPlatform, optional
        The host's platform; the runtime's when unsaid.

    Returns
    -------
    callable or None
        The handler, or None when nothing answers it.
    """
    point = REACTION_POINTS.get(reaction)
    if point is None:
        raise ValueError(
            f"A reaction is one of {', '.join(REACTIONS)}, not {reaction!r}."
        )
    wanted = f"{app_id}/{name}" if reaction in NAMED_REACTIONS else app_id
    found = [c for c in _the(platform).get_contributions(point) if c.id == wanted]
    return found[-1].value if found else None


def reactions_named(
    app_id: str, reaction: str, platform: Optional[PluginPlatform] = None
) -> List[str]:
    """The names of an application's actions or schedules its points hold."""
    prefix = f"{app_id}/"
    names: List[str] = []
    for contribution in _the(platform).get_contributions(REACTION_POINTS[reaction]):
        if contribution.id and contribution.id.startswith(prefix):
            name = contribution.id[len(prefix) :]
            if name not in names:
                names.append(name)
    return names


def unregister_app(app_id: str, platform: Optional[PluginPlatform] = None) -> bool:
    """Take an application's own extension away. Whether the platform held it."""
    return _take_away(_the(platform), app_plugin_name(app_id))


def find_app(
    app_id: str, platform: Optional[PluginPlatform] = None
) -> Optional[AppSpec]:
    """The application of that id: its own plugin's, else the catalogue's."""
    platform = _the(platform)
    _ensure_catalogue(platform)
    name = app_plugin_name(app_id)
    held = platform.get_contributions(APP_POINT)
    own = [c for c in held if c.plugin == name]
    if own:
        return own[-1].value
    for contribution in held:
        if contribution.plugin == CATALOGUE_PLUGIN and contribution.id == app_id:
            return contribution.value
    return None


def list_apps(platform: Optional[PluginPlatform] = None) -> List[AppSpec]:
    """Every application the runtime knows, an application's own plugin first."""
    platform = _the(platform)
    _ensure_catalogue(platform)
    seen: Dict[str, AppSpec] = {}
    for contribution in platform.get_contributions(APP_POINT):
        app = contribution.value
        if contribution.plugin != CATALOGUE_PLUGIN or app.id not in seen:
            seen[app.id] = app
    return list(seen.values())


def rules_for(
    app: AppSpec,
    agent_id: Optional[str] = None,
    platform: Optional[PluginPlatform] = None,
) -> AppRulesCapability:
    """What decides the application's tool calls: the last extension of it."""
    extensions = _the(platform).get_contribution_extensions(APP_POINT, app.id)
    factory: RulesFactory = extensions[-1].value if extensions else _rules
    return factory(app, agent_id)

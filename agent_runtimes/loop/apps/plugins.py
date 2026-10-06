# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications as Reactor plugins, on the runtime's side (LOOP §5.4, F-12, F-13).

An application runs as two Reactor plugins of one name: the page's
(`defineAppPlugin`, in `src/loop/apps/AppRenderer.tsx`) and this one. Whichever
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
    ContributionPoint,
    ContributionRegistry,
    PluginContributions,
    PluginManifest,
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
    "settings",
    "stop",
    "resume",
    "end",
    "logout",
    "action",
    "schedule",
    "command",
    "tool",
    "check",
    "test",
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

#: The runtime's registry. One per process, as a server has one host.
REGISTRY = ContributionRegistry()


def _the(registry: Optional[ContributionRegistry]) -> ContributionRegistry:
    return REGISTRY if registry is None else registry


def app_plugin_name(app_id: str) -> str:
    """The name of an application's runtime plugin."""
    return f"loop-app-{app_id}"


def manifest_of(app: AppSpec) -> PluginManifest:
    """An application's identity, as its plugin says it."""
    return PluginManifest(
        name=app_plugin_name(app.id),
        version=app.version,
        description=app.description,
        display_name=app.name,
        emoji=app.emoji,
        tags=["loop", "app", app.kind],
    )


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


def contribute_catalogue(registry: Optional[ContributionRegistry] = None) -> int:
    """Contribute every application of the catalogue, once. How many it holds."""
    registry = _the(registry)
    from agent_runtimes.specs.apps import APP_CATALOGUE

    registry.dispose_plugin(CATALOGUE_PLUGIN)
    contributions = PluginContributions(registry, CATALOGUE_PLUGIN)
    for app in APP_CATALOGUE.values():
        _contribute(contributions, app)
    return len(APP_CATALOGUE)


def register_app(
    app: AppSpec, registry: Optional[ContributionRegistry] = None
) -> PluginManifest:
    """Contribute an application by its own plugin, replacing an earlier one."""
    registry = _the(registry)
    manifest = manifest_of(app)
    _ensure_catalogue(registry)
    registry.dispose_plugin(manifest.name)
    _contribute(PluginContributions(registry, manifest.name), app)
    return manifest


def register_application(
    application: Any, registry: Optional[ContributionRegistry] = None
) -> PluginManifest:
    """Load an application written in Python as its plugin: its spec, and each
    of its reactions a contribution to its ``loop.app.<moment>`` point
    (LOOP P-28). An earlier load of the same application is disposed first.

    Parameters
    ----------
    application : Application
        The application, its code attached.
    registry : ContributionRegistry, optional
        The host's registry; the runtime's when unsaid.

    Returns
    -------
    PluginManifest
        Its plugin's manifest: ``registry.dispose_plugin(manifest.name)``
        takes all of it away.
    """
    registry = _the(registry)
    app: AppSpec = application.spec
    manifest = manifest_of(app)
    registry.dispose_plugin(manifest.name)
    contributions = PluginContributions(registry, manifest.name)
    _contribute(contributions, app)
    for reaction in REACTIONS:
        if reaction in NAMED_REACTIONS:
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
                REACTION_POINTS[reaction], handler, contribution_id=f"{app.id}/{name}"
            )
    return manifest


def reaction_of(
    app_id: str,
    reaction: str,
    name: str = "",
    registry: Optional[ContributionRegistry] = None,
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
    registry : ContributionRegistry, optional
        The host's registry; the runtime's when unsaid.

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
    found = [c for c in _the(registry).get(point) if c.id == wanted]
    return found[-1].value if found else None


def reactions_named(
    app_id: str, reaction: str, registry: Optional[ContributionRegistry] = None
) -> List[str]:
    """The names of an application's actions or schedules its points hold."""
    prefix = f"{app_id}/"
    names: List[str] = []
    for contribution in _the(registry).get(REACTION_POINTS[reaction]):
        if contribution.id and contribution.id.startswith(prefix):
            name = contribution.id[len(prefix) :]
            if name not in names:
                names.append(name)
    return names


def unregister_app(
    app_id: str, registry: Optional[ContributionRegistry] = None
) -> bool:
    """Take an application's own plugin away. Whether it had contributed."""
    registry = _the(registry)
    return registry.dispose_plugin(app_plugin_name(app_id)) > 0


def _ensure_catalogue(registry: ContributionRegistry) -> None:
    if not registry.get(APP_POINT, plugins=[CATALOGUE_PLUGIN]):
        contribute_catalogue(registry)


def find_app(
    app_id: str, registry: Optional[ContributionRegistry] = None
) -> Optional[AppSpec]:
    """The application of that id: its own plugin's, else the catalogue's."""
    registry = _the(registry)
    _ensure_catalogue(registry)
    own = registry.get(APP_POINT, plugins=[app_plugin_name(app_id)])
    if own:
        return own[-1].value
    for contribution in registry.get(APP_POINT, plugins=[CATALOGUE_PLUGIN]):
        if contribution.id == app_id:
            return contribution.value
    return None


def list_apps(registry: Optional[ContributionRegistry] = None) -> List[AppSpec]:
    """Every application the runtime knows, an application's own plugin first."""
    registry = _the(registry)
    _ensure_catalogue(registry)
    seen: Dict[str, AppSpec] = {}
    for contribution in registry.get(APP_POINT):
        app = contribution.value
        if contribution.plugin != CATALOGUE_PLUGIN or app.id not in seen:
            seen[app.id] = app
    return list(seen.values())


def rules_for(
    app: AppSpec,
    agent_id: Optional[str] = None,
    registry: Optional[ContributionRegistry] = None,
) -> AppRulesCapability:
    """What decides the application's tool calls: the last extension of it."""
    registry = _the(registry)
    extensions = registry.extensions_of(APP_POINT, app.id)
    factory: RulesFactory = extensions[-1].value if extensions else _rules
    return factory(app, agent_id)

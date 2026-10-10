# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's page side, packaged as a Reactor extension (LOOP P-29).

A component its developer wrote (P-17) may be a file of the application's
folder — ``app.custom_component("Gauge", source="gauge.js", ...)`` — and is
drawn wherever a component is: its page, its answers, the elements its code
shows inline, in a panel or on a page of its own (P-18), a widget page's
outputs (P-05). Such a file reaches a page the way Reactor ships the browser
half of any capability (REACTOR.md §5, *Python-packaged extensions*):

- ``loop apps package app.py`` writes a Python distribution, ``loop-app-<id>``:
  the application's module, and its folder's files under
  ``share/datalayer/reactor/extensions/loop-app-<id>/`` (hatch shared-data),
  advertised under Reactor's ``datalayer.reactor.extensions`` entry-point
  group by the name of the application's plugin pair (F-15) — then builds its
  wheel. Installing the wheel is publishing the page side;
- the server running the application finds it installed by that name and
  serves it beside the application's plugin state, as Reactor's own routes
  do: ``GET /api/v1/apps/<id>/plugins/frontend-extensions`` and
  ``GET /api/v1/apps/<id>/reactor-extensions/loop-app-<id>/<path>``
  (`routes/app_plugins.py`) — about that application alone;
- the page reads the first with Reactor's ``bootstrapExtensions`` and installs
  what it answers into the application's extension: its page-side plugin,
  ``loop-app-<id>/page``, says where the folder's files are served, and a
  component of a file of the folder is fetched from there and drawn in its
  sandboxed frame, as any other (`AppRuntimePlugins`).

The extension the entry point advertises is the application's own
(`Application.extension`, LOOP P-35): its Python half the application's plugin
— its module, loaded from the package — and the plugins it composes; its
frontend half the folder's files. The page-side module the wheel carries is
generated, and holds no code of the developer's: the folder's modules never
run in the page, only in their frames (LOOP D-22).
"""

from __future__ import annotations

import importlib
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from importlib.metadata import entry_points
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from reactor import (
    EXTENSION_ENTRY_POINT_GROUP,
    SHARE_DIRECTORY,
    FrontendExtension,
    FrontendPlugin,
    PluginPlatform,
    ReactorExtension,
    find_extension_frontend,
)

from agent_runtimes.loop.apps.plugins import (
    AppPlugin,
    app_plugin_name,
    register_application,
)
from agent_runtimes.types import AppSpec

#: The module the wheel's page side is entered by: generated, data only.
PAGE_SIDE_ENTRY = "index.js"

#: The contribution point its page-side plugin contributes to, in the page
#: (`src/apps/core/appFiles.ts` defines the same): where a folder's files are.
APP_FILES_POINT = "loop.app.files"

#: The application's module in its package.
APPLICATION_MODULE = "app.py"

#: Where Reactor's route serves an extension's files, under the base the page
#: reads the application's plugins from (``/api/v1/apps/<id>``).
EXTENSIONS_BASE = "/reactor-extensions"

#: A file of the application's folder, as agentspecs takes it (``CUSTOM_FILE``).
_FOLDER_FILE = re.compile(
    r"(?:\./)?(?:[A-Za-z0-9_][A-Za-z0-9_.-]*/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.m?js"
)


def page_side_plugin_name(app_id: str) -> str:
    """The page-side plugin of an application's package: of its extension."""
    return f"{app_plugin_name(app_id)}/page"


def module_name_of(app_id: str) -> str:
    """The Python package an application is packaged as: ``loop_app_<id>``."""
    return "loop_app_" + re.sub(r"[^a-z0-9]+", "_", app_id.lower()).strip("_")


def is_folder_file(source: str) -> bool:
    """Whether a component's ``source`` is a file of the application's folder."""
    return not re.match(r"^[a-z][a-z0-9+.-]*:", source) and bool(
        _FOLDER_FILE.fullmatch(source)
    )


def folder_files(app: AppSpec) -> List[str]:
    """The files of its folder an application's page side needs, by path in it."""
    files: List[str] = []
    for component in app.interface.custom_components or []:
        if is_folder_file(component.source):
            path = component.source.removeprefix("./")
            if path not in files:
                files.append(path)
    return files


def page_side_module(app_id: str) -> str:
    """The module the page loads from the package: where its files are, nothing else.

    A Reactor plugin as a plain object — no import, as a module fetched at
    runtime must be (REACTOR.md §5) — contributing the address its own
    directory is served at, which is where every file of the folder is.
    """
    name = json.dumps(page_side_plugin_name(app_id))
    point = json.dumps(APP_FILES_POINT)
    app = json.dumps(app_id)
    return f"""// Generated by `loop apps package` (LOOP P-29): do not edit.
// The page side of the application {app}: where the files of its folder
// are served — beside this module. Their modules are drawn in sandboxed
// frames, never here.
const base = new URL('./', import.meta.url).href;

export default {{
  name: {name},
  contributes: [
    {{ point: {{ id: {point} }}, value: {{ app: {app}, base }}, options: {{ id: {app} }} }},
  ],
}};
"""


def packaged_extension(package_file: str) -> ReactorExtension:
    """What a packaged application's entry point resolves to: its extension.

    Called by the ``extension()`` of the package ``loop apps package`` wrote,
    with its ``__file__``: the application loaded from the package's
    ``app.py``, as `Application.extension` delivers it — its plugin and the
    plugins it composes — with its built page side found where the wheel put
    it (`find_extension_frontend`).

    Raises
    ------
    LookupError
        When its page side is not installed with it.
    """
    from agent_runtimes.loop.apps.application import load_application

    here = Path(package_file).resolve().parent
    application = load_application(here / APPLICATION_MODULE)
    app = application.spec
    name = app_plugin_name(app.id)
    directory = find_extension_frontend(package_file, name)
    if directory is None:
        raise LookupError(
            f"{name}'s page side is not installed with it: no "
            f"{SHARE_DIRECTORY}/{name} beside {here}."
        )
    return application.extension(
        frontend=FrontendExtension(
            directory=directory,
            entry=PAGE_SIDE_ENTRY,
            plugins=[
                FrontendPlugin(
                    name=page_side_plugin_name(app.id),
                    version=app.version,
                    display_name=f"{app.name}'s page side",
                    description=(
                        "Where the files of its folder are served: "
                        + ", ".join(folder_files(app))
                        + "."
                    ),
                    emoji=app.emoji,
                    required_backend_plugins=[name],
                )
            ],
        )
    )


# ----------------------------------------------------------------------
# The host: what is installed, by the application's name
# ----------------------------------------------------------------------


def installed_platform(app_id: str) -> PluginPlatform:
    """A Reactor platform holding the application's installed extension, if any.

    Looked up per call, as Reactor's ``/plugins/frontend-extensions`` rescans
    per request: a wheel installed beside a running server is found on the
    page's next load. Only the entry point of the application's name is
    loaded — the others of the group are other hosts' — and registered as
    Reactor's own rescan registers one.
    """
    name = app_plugin_name(app_id)
    platform = PluginPlatform()
    importlib.invalidate_caches()
    for entry in entry_points(group=EXTENSION_ENTRY_POINT_GROUP, name=name):
        extension = entry.load()()
        plugin = None
        if isinstance(extension, ReactorExtension) and extension.name == name:
            plugin = next(
                (impl for manifest, impl in extension.plugins if manifest.name == name),
                None,
            )
        if not isinstance(plugin, AppPlugin):
            raise LookupError(
                f"The entry point {name} of {EXTENSION_ENTRY_POINT_GROUP} is not "
                f"the application {app_id}'s extension."
            )
        # As the application registers anywhere: what it uses first.
        register_application(plugin.application, platform, frontend=extension.frontend)
    return platform


def app_frontend_extensions(app_id: str) -> List[Dict[str, Any]]:
    """The application's page side installed here, as Reactor's
    ``GET /plugins/frontend-extensions`` says one: none, or its extension.
    """
    return installed_platform(app_id).frontend_extensions(base_url=EXTENSIONS_BASE)


def app_extension_file(app_id: str, extension: str, path: str) -> Optional[Path]:
    """A file of the application's installed page side, or None.

    Resolved by Reactor's `FrontendExtension.resolve`: nothing outside its
    directory, ``..`` and symlinks included.
    """
    if extension != app_plugin_name(app_id):
        return None
    frontend = installed_platform(app_id).frontend_extension(extension)
    return None if frontend is None else frontend.resolve(path)


# ----------------------------------------------------------------------
# Packaging: `loop apps package`
# ----------------------------------------------------------------------


@dataclass
class Packaged:
    """What ``loop apps package`` made."""

    #: The distribution's name, ``loop-app-<id>``.
    name: str
    #: The project it wrote.
    project: Path
    #: The wheel it built, or None when it was not built.
    wheel: Optional[Path]
    #: The folder's files it carries, by path in the folder.
    files: List[str]


class NotPackageable(ValueError):
    """An application that cannot be packaged, with the reasons, in sentences."""

    def __init__(self, problems: Sequence[str]):
        self.problems = list(problems)
        super().__init__(" ".join(self.problems))


def _toml(value: str) -> str:
    return json.dumps(value)


def _pyproject(app: AppSpec, module: str, requires: str) -> str:
    name = app_plugin_name(app.id)
    share = f"{SHARE_DIRECTORY}/{name}"
    return f"""# Written by `loop apps package` (LOOP P-29).
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = {_toml(name)}
version = {_toml(app.version)}
description = {_toml(app.description or app.name)}
requires-python = ">=3.10"
dependencies = [{_toml(requires)}]

# Installing it publishes the application's page side: the server that runs
# the application finds it by this name.
[project.entry-points."{EXTENSION_ENTRY_POINT_GROUP}"]
{_toml(name)} = "{module}:extension"

[tool.hatch.build.targets.wheel]
packages = [{_toml(module)}]

[tool.hatch.build.targets.wheel.shared-data]
{_toml(share)} = {_toml(share)}
"""


def _init(app: AppSpec) -> str:
    return f'''# Written by `loop apps package` (LOOP P-29, P-35).
"""{app.name}, packaged: its application in ``app.py``, its page side in the wheel."""

from functools import cache

from agent_runtimes.loop.apps.packaging import packaged_extension


@cache
def extension():
    """The Reactor extension its entry point advertises: the application's own."""
    return packaged_extension(__file__)
'''


def _requires() -> str:
    from importlib.metadata import version

    return f"agent-runtimes>={version('agent-runtimes')}"


def write_project(path: Path, out: Path, *, force: bool = False) -> Packaged:
    """Write the distribution of an app.py: its module, its folder's files.

    Raises
    ------
    NotPackageable
        For an application whose folder lacks a file it names, or a project
        already there without ``force``.
    """
    from agent_runtimes.loop.apps.build import build

    path = Path(path).resolve()
    folder = path.parent
    app = build(path).application.spec
    files = folder_files(app)
    missing = [file for file in files if not (folder / file).is_file()]
    if missing:
        raise NotPackageable(
            [
                f"{app.name} names {file}, which is not a file of {folder}."
                for file in missing
            ]
        )
    name = app_plugin_name(app.id)
    module = module_name_of(app.id)
    project = Path(out).resolve() / name
    if project.exists():
        if not force:
            raise NotPackageable(
                [f"{project} is there already; --force writes it again."]
            )
        shutil.rmtree(project)
    package = project / module
    package.mkdir(parents=True)
    shutil.copyfile(path, package / APPLICATION_MODULE)
    (package / "__init__.py").write_text(_init(app))
    share = project / SHARE_DIRECTORY / name
    share.mkdir(parents=True)
    for file in files:
        target = share / file
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(folder / file, target)
    (share / PAGE_SIDE_ENTRY).write_text(page_side_module(app.id))
    (project / "pyproject.toml").write_text(_pyproject(app, module, _requires()))
    return Packaged(name=name, project=project, wheel=None, files=files)


def build_wheel(packaged: Packaged, out: Path) -> Packaged:
    """Build the project's wheel into ``out``, with this environment's hatchling.

    Raises
    ------
    NotPackageable
        When the build is not possible here, or fails, with what it said.
    """
    for needed in ("build", "hatchling"):
        try:
            importlib.import_module(needed)
        except ImportError:
            raise NotPackageable(
                [f"Building its wheel needs {needed}: pip install build hatchling."]
            ) from None
    out = Path(out).resolve()
    before = set(out.glob("*.whl")) if out.is_dir() else set()
    done = subprocess.run(
        [
            sys.executable,
            "-m",
            "build",
            "--wheel",
            "--no-isolation",
            "--outdir",
            str(out),
            str(packaged.project),
        ],
        capture_output=True,
        text=True,
    )
    if done.returncode != 0:
        raise NotPackageable(
            [f"Its wheel did not build: {(done.stderr or done.stdout).strip()[-2000:]}"]
        )
    stem = packaged.name.replace("-", "_")
    built = sorted(
        (wheel for wheel in out.glob(f"{stem}-*.whl") if wheel not in before),
        key=lambda wheel: wheel.stat().st_mtime,
    ) or sorted(out.glob(f"{stem}-*.whl"), key=lambda wheel: wheel.stat().st_mtime)
    if not built:
        raise NotPackageable([f"Its wheel was not found in {out} after the build."])
    packaged.wheel = built[-1]
    return packaged


def package(
    path: Path, out: Path, *, force: bool = False, wheel: bool = True
) -> Packaged:
    """``loop apps package``: the project of an app.py, and its wheel."""
    packaged = write_project(path, out, force=force)
    return build_wheel(packaged, out) if wheel else packaged


__all__ = [
    "APP_FILES_POINT",
    "APPLICATION_MODULE",
    "NotPackageable",
    "PAGE_SIDE_ENTRY",
    "Packaged",
    "app_extension_file",
    "app_frontend_extensions",
    "build_wheel",
    "folder_files",
    "installed_platform",
    "is_folder_file",
    "module_name_of",
    "package",
    "packaged_extension",
    "page_side_module",
    "page_side_plugin_name",
    "write_project",
]

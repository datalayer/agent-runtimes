# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Hatch build hook for copying Vite output into the Python package.

Copies the Vite frontend build output into the Python package so that
``agent_runtimes.app`` can serve it at ``/static`` — the pages the terminal
opens (``/browser``, ``/notebook``, ``/document``) among them, locally and on
a cloud runtime alike.

The hook runs when you build the wheel or sdist with hatch (or
``python -m build``). It copies ``<repo>/dist/`` → ``agent_runtimes/static/dist/``
and checks the pages are there with every asset they load.

When ``python -m build`` runs it first creates an sdist, then builds a
wheel **from that sdist** in a temporary directory. In that second pass the
Vite ``dist/`` is not there, but ``agent_runtimes/static/dist/`` is (the sdist
carries it), so it is checked and kept.

A build without the pages fails: a package that installs but serves no page
is found only when somebody opens one (``pip install`` from a git checkout,
which has no built frontend, is refused here). Build the frontend first with
``npm run build``. An editable install (``pip install -e .``) copies nothing
and checks nothing: the server then serves the repository's own ``dist/``.
"""

from __future__ import annotations

import logging
import re
import shutil
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

logger = logging.getLogger(__name__)

# Relative to the repo root (where pyproject.toml lives).
REPO_DIST = Path("dist")
PACKAGE_STATIC_DIST = Path("agent_runtimes") / "static" / "dist"

#: The pages ``agent_runtimes.app`` serves at ``/static/<page>``.
PAGES = (
    "index.html",
    "agent.html",
    "agent-node.html",
    "agent-notebook.html",
    "agent-document.html",
    "loop.html",
    "loop-example.html",
)

#: What a built page loads from the server: ``/static/<path>``.
_STATIC_REFERENCE = re.compile(r"""(?:src|href)=["']/static/([^"'?#]+)""")


def missing_from(dist: Path) -> list[str]:
    """The pages, and the files they load, that ``dist`` lacks."""
    missing: list[str] = []
    for page in PAGES:
        path = dist / page
        if not path.is_file():
            missing.append(page)
            continue
        for reference in _STATIC_REFERENCE.findall(path.read_text(encoding="utf-8")):
            if not (dist / reference).is_file() and reference not in missing:
                missing.append(reference)
    return missing


def check(dist: Path) -> None:
    """Refuse a frontend build that lacks a page or a file a page loads."""
    if not dist.is_dir():
        raise RuntimeError(
            f"No frontend build at {dist}: run `npm run build` before building "
            "the Python package, or the installed server serves no page."
        )
    missing = missing_from(dist)
    if missing:
        raise RuntimeError(
            f"The frontend build at {dist} lacks {', '.join(missing)}: "
            "run `npm run build` before building the Python package."
        )


class AgentRuntimesBuildHook(BuildHookInterface):
    """
    Copy the Vite build output into the package's ``static/dist`` directory.
    """

    PLUGIN_NAME = "agent_runtimes_frontend"

    def initialize(self, version: str, build_data: dict) -> None:  # noqa: ARG002
        """
        Called by hatchling before building.

        1. An editable install: nothing to do.
        2. ``dist/`` exists (the repository, after ``npm run build``): it is
           copied to ``agent_runtimes/static/dist/``, replacing what was there.
        3. Otherwise ``agent_runtimes/static/dist/`` must be there already
           (the wheel built from the sdist).

        Either way the result is checked: every page, and every file it loads.
        """
        if version == "editable":
            return
        root = Path(self.root)
        repo_dist = root / REPO_DIST
        package_static_dist = root / PACKAGE_STATIC_DIST

        if repo_dist.is_dir():
            check(repo_dist)
            if package_static_dist.is_dir():
                shutil.rmtree(package_static_dist)
            shutil.copytree(repo_dist, package_static_dist)
            logger.info(
                "Copied frontend build: %s → %s", repo_dist, package_static_dist
            )
            return

        check(package_static_dist)
        logger.info("Frontend build already at %s.", package_static_dist)

    def clean(self, versions: list[str]) -> None:  # noqa: ARG002
        """Remove the copied static dist when cleaning."""
        package_static_dist = Path(self.root) / PACKAGE_STATIC_DIST
        if package_static_dist.is_dir():
            shutil.rmtree(package_static_dist)
            logger.info("Cleaned %s", package_static_dist)

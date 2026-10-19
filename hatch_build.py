# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Hatch build hook for copying Vite output into the Python package.

Copies the Vite frontend build output into the wheel so that
``agent_runtimes.app`` can serve it at ``/static`` — the pages the terminal
opens (``/browser``, ``/notebook``, ``/document``) among them, locally and on
a cloud runtime alike.

Only the wheel carries the frontend. The sdist holds the Python package and
what building it reads (``pyproject.toml``, ``package.json`` for the version,
this hook, the Jupyter config): with the built frontend in both, every release
put about 50 MB on PyPI twice, and the project ran into PyPI's size limit. So
the release builds the sdist and the wheel side by side from the repository
(``python -m build --sdist --wheel``), the wheel after ``npm run build``; a
wheel built from the sdist alone is refused, as the frontend is not in it.

The hook copies ``<repo>/dist/`` → ``agent_runtimes/static/dist/``, drops the
files no browser fetches from it (:data:`NEVER_FETCHED`), and checks the pages
are there with every asset they load.

A wheel without the pages fails: a package that installs but serves no page
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

#: What the Vite build emits that no browser running these pages fetches,
#: as globs under ``dist/``: left out of the wheel.
NEVER_FETCHED = (
    # onnxruntime-web's WASM (27 MB), which transformers.js brings in for the
    # voice: the voice points onnxruntime-web at the speech models' CDN
    # (``wasmPaths``, src/voice/hearing.ts), so ``/static/assets`` never
    # serves it.
    "assets/ort-wasm-*.wasm",
    # KaTeX's fonts name woff2 first, and every browser that runs these pages
    # (the build targets ``esnext``) reads woff2: the woff and ttf after it
    # are never fetched.
    "assets/KaTeX_*.woff",
    "assets/KaTeX_*.ttf",
    # Font Awesome 5 likewise: woff2 before woff, ttf and svg; eot is IE's.
    "assets/fa-*.eot",
    "assets/fa-*.woff",
    "assets/fa-*.ttf",
    "assets/fa-*.svg",
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
            "the wheel, or the installed server serves no page. The sdist "
            "carries no frontend: build the wheel from the repository."
        )
    missing = missing_from(dist)
    if missing:
        raise RuntimeError(
            f"The frontend build at {dist} lacks {', '.join(missing)}: "
            "run `npm run build` before building the Python package."
        )


def prune(dist: Path) -> None:
    """Remove from ``dist`` the files :data:`NEVER_FETCHED` names."""
    for pattern in NEVER_FETCHED:
        for path in dist.glob(pattern):
            path.unlink()


class AgentRuntimesBuildHook(BuildHookInterface):
    """
    Copy the Vite build output into the package's ``static/dist`` directory.
    """

    PLUGIN_NAME = "agent_runtimes_frontend"

    def initialize(self, version: str, build_data: dict) -> None:  # noqa: ARG002
        """
        Called by hatchling before building.

        1. An editable install, or the sdist: nothing to do (the sdist
           carries no frontend).
        2. ``dist/`` exists (the repository, after ``npm run build``): it is
           copied to ``agent_runtimes/static/dist/``, replacing what was there.
        3. Otherwise ``agent_runtimes/static/dist/`` must be there already.

        Either way what no browser fetches is dropped (:data:`NEVER_FETCHED`)
        and the result is checked: every page, and every file it loads.
        """
        if version == "editable" or self.target_name != "wheel":
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
        prune(package_static_dist)
        check(package_static_dist)

    def clean(self, versions: list[str]) -> None:  # noqa: ARG002
        """Remove the copied static dist when cleaning."""
        package_static_dist = Path(self.root) / PACKAGE_STATIC_DIST
        if package_static_dist.is_dir():
            shutil.rmtree(package_static_dist)
            logger.info("Cleaned %s", package_static_dist)

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Hatch build hook for copying Vite output into the Python package.

Copies the Vite frontend build output into the Python package so that
``agent_runtimes.app`` can serve it at ``/static``.

The hook runs automatically when you build the wheel/sdist with hatch
(or ``python -m build``).  It copies ``<repo>/dist/`` → ``agent_runtimes/static/dist/``
so that the fallback path in ``app.py`` finds the assets at install-time.

When ``python -m build`` runs it first creates an sdist, then builds a
wheel **from that sdist** inside a temporary isolated environment.  In the
second pass the Vite ``dist/`` doesn't exist, but the already-copied
``agent_runtimes/static/dist/`` does (it was included in the sdist), so
the hook simply skips the copy.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

logger = logging.getLogger(__name__)

# Relative to the repo root (where pyproject.toml lives).
REPO_DIST = Path("dist")
PACKAGE_STATIC_DIST = Path("agent_runtimes") / "static" / "dist"


class AgentRuntimesBuildHook(BuildHookInterface):
    """
    Copy the Vite build output into the package's ``static/dist`` directory.
    """

    PLUGIN_NAME = "agent_runtimes_frontend"

    def initialize(self, version: str, build_data: dict) -> None:  # noqa: ARG002
        """
        Called by hatchling before building.

        1. If ``agent_runtimes/static/dist/`` already exists (e.g. when
           building a wheel from an sdist), do nothing.
        2. If ``dist/`` exists (development repo with a prior Vite build),
           copy it to ``agent_runtimes/static/dist/``.
        3. Otherwise warn — the frontend must be built beforehand with
           ``npm run build``.
        """
        root = Path(self.root)
        repo_dist = root / REPO_DIST
        package_static_dist = root / PACKAGE_STATIC_DIST

        # Already present (building wheel from sdist) — nothing to do.
        if package_static_dist.is_dir() and any(package_static_dist.iterdir()):
            logger.info(
                "Frontend assets already at %s — skipping copy.",
                package_static_dist,
            )
            return

        # Repo root has the Vite build — copy it into the package tree.
        if repo_dist.is_dir() and any(repo_dist.iterdir()):
            if package_static_dist.is_dir():
                shutil.rmtree(package_static_dist)
            shutil.copytree(repo_dist, package_static_dist)
            logger.info(
                "Copied frontend build: %s → %s",
                repo_dist,
                package_static_dist,
            )
            return

        logger.warning(
            "No frontend build found at %s. Run 'npm run build' before "
            "packaging. The /static endpoint will not work in the "
            "installed package.",
            repo_dist,
        )

    def clean(self, versions: list[str]) -> None:  # noqa: ARG002
        """Remove the copied static dist when cleaning."""
        package_static_dist = Path(self.root) / PACKAGE_STATIC_DIST
        if package_static_dist.is_dir():
            shutil.rmtree(package_static_dist)
            logger.info("Cleaned %s", package_static_dist)

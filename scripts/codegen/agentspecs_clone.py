# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Importing the `agentspecs` package from the clone the specs are read from.

Frames and Cogs are resolved by `agentspecs` itself — inheritance, composition
and rendering are its rules (agentspecs >= 0.0.12) — so the generators import
it rather than restate them. From the clone `make specs` checked out, not from
whatever `agentspecs` happens to be installed: the YAML and the code that
resolves it are then the same version by construction.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from types import ModuleType


def package_root(specs_dir: Path) -> Path:
    """The directory holding the `agentspecs` package a specs directory is in.

    `agentspecs/agentspecs/frames` → `agentspecs`.
    """
    return specs_dir.resolve().parent.parent


def import_from_clone(specs_dir: Path, module: str) -> ModuleType:
    """Import `agentspecs.<module>` from the clone `specs_dir` belongs to."""
    root = package_root(specs_dir)
    package = root / "agentspecs"
    if not (package / module).exists() and not (package / f"{module}.py").exists():
        raise SystemExit(
            f"Error: agentspecs.{module} not found in {package} — the clone is "
            "older than the generators (Frames and Cogs need agentspecs >= 0.0.12, "
            "the marks of the catalogues >= 0.0.31)"
        )
    for name in [
        name
        for name in sys.modules
        if name == "agentspecs" or name.startswith("agentspecs.")
    ]:
        del sys.modules[name]
    sys.path.insert(0, str(root))
    try:
        loaded = importlib.import_module(f"agentspecs.{module}")
    finally:
        sys.path.remove(str(root))
    origin = Path(loaded.__file__ or "").resolve()
    if root not in origin.parents:
        raise SystemExit(
            f"Error: agentspecs.{module} was imported from {origin}, not from {root}"
        )
    return loaded

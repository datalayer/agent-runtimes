# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Which console script was invoked, and what that means.

Four console scripts resolve to the same ``main()``: ``loop`` and ``l`` for the
interactive workspace, ``agent-runtimes`` and ``datalayer-agents`` for the
command line. They cannot behave the same way with no arguments — one should
open a prompt, the other should say what it can do — so the behaviour is
selected from ``sys.argv[0]`` rather than baked into the Typer callback.

Anything typed after the name still routes normally: ``loop sandboxes list``
reaches the same command group as ``agent-runtimes sandboxes list``.
"""

from __future__ import annotations

import os
import sys
from typing import Optional

#: Console scripts that open the interactive workspace when given no subcommand.
WORKSPACE_ENTRYPOINTS = frozenset({"loop", "l"})


def invoked_name(argv0: Optional[str] = None) -> str:
    """The bare name the process was invoked under.

    Strips the directory, a ``.exe`` suffix on Windows and a ``.py`` suffix when
    a module file was run directly.
    """
    raw = argv0 if argv0 is not None else (sys.argv[0] if sys.argv else "")
    name = os.path.basename(str(raw or "")).strip()
    for suffix in (".exe", ".py"):
        if name.lower().endswith(suffix):
            name = name[: -len(suffix)]
    return name.lower()


def opens_workspace(argv0: Optional[str] = None) -> bool:
    """Whether a bare invocation should open the interactive workspace.

    True for ``loop`` and ``l``; false for ``agent-runtimes``,
    ``datalayer-agents`` and ``python -m agent_runtimes``, which print help so
    that scripts and documentation calling them keep behaving as they read.
    """
    return invoked_name(argv0) in WORKSPACE_ENTRYPOINTS

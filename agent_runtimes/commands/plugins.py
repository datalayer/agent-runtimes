# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop plugins [<name>]`: what extends this runtime, and what was refused (MH-F01).

Every reactor extension the runtime holds — its own, the protocols', and
whatever is installed beside it under ``datalayer.reactor.extensions`` —
with each plugin's contributions to the session's points (``harness``,
``session.store``, ``session.format``, ``session.carry``, ``session.hook``)
and the others'; then what was refused at the seam, each with the plugin's
name and the reason, and every entry point that did not resolve, with the
entry point and the error. One name given, that extension alone — or that
failed entry point, with its error (Omnigent's ``extensions doctor``).
"""

from __future__ import annotations

import typer
from rich.console import Console

app = typer.Typer(
    name="plugins",
    help="What extends this runtime, and what was refused.",
    invoke_without_command=True,
    pretty_exceptions_show_locals=False,
)
console = Console(soft_wrap=True)


@app.callback()
def plugins(
    name: str = typer.Argument(
        "",
        help="One extension, or one entry point that did not load; every one otherwise.",
    ),
) -> None:
    """List every extension, its plugins and their contributions, and what was refused."""
    from agent_runtimes.plugins.host import (
        describe_plugins,
        plugins_lines,
        session_platform,
    )

    platform = session_platform()
    described = describe_plugins(platform, name)
    for line in plugins_lines(described):
        console.print(line, markup=False)
    if (
        name
        and not described["extensions"]
        and not described["refused"]
        and not described["failed"]
    ):
        raise typer.Exit(1)


__all__ = ["app", "plugins"]

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The line a listing shows beside a command keeps one style.

What agent-runtimes contributes to the Datalayer CLI, checked as the host
sees it: one sentence ending with a period, starting with a capital, short
enough not to wrap, not opening with the command's own name — and saying
what the command does, not who may run it or that it is an alias.
"""

from __future__ import annotations

from typing import Any

import typer
from reactor.cli import help_style_violations
from typer.main import get_command

from agent_runtimes.reactor_extension import plugin


def _host() -> typer.Typer:
    host = typer.Typer(name="datalayer")
    plugin()[1].provide_cli(host)
    return host


def test_every_contributed_description_keeps_the_house_style() -> None:
    assert help_style_violations(_host()) == []


def test_no_description_says_who_may_run_the_command_or_that_it_is_an_alias() -> None:
    def lines(command: Any, path: str = "") -> list[str]:
        found = []
        for name, child in (getattr(command, "commands", None) or {}).items():
            text = child.short_help or (child.help or "").split("\n\n")[0]
            found.append(f"{path} {name}: {text}")
            found += lines(child, f"{path} {name}")
        return found

    for line in lines(get_command(_host())):
        lowered = line.lower()
        for said in ("administrator", "platform_admin", "admin only", "admin-only", "root command", "alias"):
            assert said not in lowered, line

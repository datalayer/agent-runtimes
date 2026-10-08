# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A command's crash prints its traceback without the frames' locals.

Typer's pretty tracebacks show every frame's local variables by default,
and a command's locals hold what it was given: an API key, a runtime's
token, an account's secrets. A ``loop scenes rehearse`` crash printed one
of them to stderr. Every Typer app of this package turns that off, and no
module installs Rich's own traceback hook with locals on.
"""

from __future__ import annotations

import pathlib
from typing import Iterator

import pytest
import typer
import typer.main

from agent_runtimes.__main__ import app

PACKAGE = pathlib.Path(__file__).resolve().parents[1]


def _every_typer(root: typer.Typer) -> Iterator[typer.Typer]:
    """Yield a Typer app and every group registered under it."""
    yield root
    for group in root.registered_groups:
        if group.typer_instance is not None:
            yield from _every_typer(group.typer_instance)


def test_every_typer_app_hides_locals() -> None:
    """The root app, every command group, and the chat app hide locals."""
    from agent_runtimes.chat.cli import app as chat_app

    seen = list(_every_typer(app)) + [chat_app]
    assert len(seen) > 10, "the groups were not walked"
    on = [t.info.name for t in seen if t.pretty_exceptions_show_locals]
    assert on == []


def test_no_module_installs_rich_tracebacks_with_locals() -> None:
    """No module of the package asks Rich or Typer for locals in a traceback."""
    offenders: list[str] = []
    for path in PACKAGE.rglob("*.py"):
        if "tests" in path.relative_to(PACKAGE).parts:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if "show_locals=True" in text or "pretty_exceptions_show_locals=True" in text:
            offenders.append(str(path.relative_to(PACKAGE)))
        if "traceback.install(" in text:
            offenders.append(str(path.relative_to(PACKAGE)))
    assert offenders == []


def test_a_crashed_command_prints_no_locals(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """A command that raises prints the error, not the values it held."""
    monkeypatch.delenv("TYPER_STANDARD_TRACEBACK", raising=False)
    monkeypatch.delenv("_TYPER_STANDARD_TRACEBACK", raising=False)
    monkeypatch.setenv("COLUMNS", "200")
    # Built at run time, so the value is on no source line the traceback
    # could show; the name sits well above the raise, outside the lines
    # Rich prints around it.
    secret = "eyJ" + "".join(reversed("tnirp-reven-tsum"))

    @app.command("cli-tracebacks-boom", hidden=True)
    def boom() -> None:
        scrubbed_api_key = secret
        held = len(scrubbed_api_key)
        held += 1
        held += 1
        held += 1
        held += 1
        raise RuntimeError(f"the command crashed with {held} held")

    try:
        with pytest.raises(RuntimeError) as info:
            app(["cli-tracebacks-boom"])
    finally:
        app.registered_commands = [
            c for c in app.registered_commands if c.name != "cli-tracebacks-boom"
        ]

    capsys.readouterr()
    typer.main.except_hook(type(info.value), info.value, info.value.__traceback__)
    err = capsys.readouterr().err

    assert "the command crashed with" in err, err
    assert "─ locals ─" not in err, err
    assert "scrubbed_api_key" not in err, err
    assert secret not in err, err
    assert "eyJ" not in err, err

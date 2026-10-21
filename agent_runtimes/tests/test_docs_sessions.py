# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The sessions documentation holds to the code (MH-45).

Each verb `loop sessions --help` offers has its row on the CLI page, the
REPL's commands and `loop plugins` are named, the harness capabilities page
says each catalogue harness's table as the catalogue does, the pages name
nothing private, and the sidebar lists them.
"""

from __future__ import annotations

import re
from pathlib import Path

from typer.testing import CliRunner

from agent_runtimes.commands.sessions import app as sessions_app
from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

DOCS = Path(__file__).resolve().parents[2] / "docs"
PAGES = DOCS / "docs" / "sessions"


def _text(name: str) -> str:
    return (PAGES / name).read_text(encoding="utf-8")


def test_every_cli_verb_has_its_row_on_the_page() -> None:
    result = CliRunner().invoke(sessions_app, ["--help"])
    assert result.exit_code == 0, result.output
    verbs = [command.name for command in sessions_app.registered_commands]
    assert set(verbs) == {
        "list",
        "show",
        "resume",
        "swap",
        "clone",
        "export",
        "import",
        "end",
        "feedback",
    }
    for verb in verbs:
        assert verb in result.output, verb
    page = _text("cli.mdx")
    for verb in verbs:
        assert f"`loop sessions {verb}" in page, verb
    for command in (
        "/sessions",
        "/resume <uid>",
        "/swap <agent>",
        "/clone [turn]",
        "/export [file]",
    ):
        assert command in page, command
    assert "`loop plugins [<name>]`" in page
    assert "`loop apps threads` and `loop apps feedback` are retired" in page


def test_the_capabilities_page_says_the_catalogue() -> None:
    page = _text("harnesses.mdx")
    for spec in HARNESS_CATALOGUE.values():
        table = spec.capabilities
        row = re.search(
            rf"^\| `{re.escape(spec.id)}` \| (\w+) \| (\w+) \| (\w+) \| (\w+) \| (\w+) \| (\w+) \| ([\w—]+) \|",
            page,
            re.M,
        )
        assert row is not None, spec.id
        assert row.group(1) == table.resume and row.group(2) == table.fork_history, (
            spec.id
        )
        assert row.group(3) == ("yes" if table.interrupt else "no") and row.group(
            4
        ) == ("yes" if table.steering else "no")
        assert (
            row.group(5) == ("yes" if table.images else "no")
            and row.group(6) == table.compaction
        )
        assert row.group(7) == (spec.acp.native_session if spec.acp else "—")


def test_the_pages_are_in_the_sidebar_and_name_nothing_private() -> None:
    sidebar = (DOCS / "sidebars.js").read_text(encoding="utf-8")
    for page in (
        "sessions/index",
        "sessions/cli",
        "sessions/files",
        "sessions/plugins",
        "sessions/harnesses",
    ):
        assert f"'{page}'" in sidebar, page
    for path in PAGES.glob("*.mdx"):
        text = path.read_text(encoding="utf-8")
        assert "plans/" not in text and "datalayer/ui" not in text, path.name
    index = _text("index.mdx")
    assert "## Not built yet" in index
    for left in ("phone", "Sharing", "bench", "Side chats", "child sessions"):
        assert left in index, left

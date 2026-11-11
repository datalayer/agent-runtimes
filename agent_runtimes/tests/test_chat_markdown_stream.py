# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The agent's answer is drawn as Markdown on a terminal, and left as it comes elsewhere."""

from __future__ import annotations

import io

from rich.console import Console

from agent_runtimes.chat.markdown_stream import MarkdownStream

ANSWER = "### Built-in Tools\n\n| Tool | Description |\n|---|---|\n| **decide** | Ask typed questions |\n\nNo **MCP tools**.\n"


def _stream(terminal: bool) -> tuple[MarkdownStream, io.StringIO]:
    out = io.StringIO()
    console = Console(
        file=out, force_terminal=terminal, width=80, height=24, color_system=None
    )
    return MarkdownStream(console), out


def test_on_a_terminal_the_segment_is_drawn_as_markdown_once_it_ends():
    stream, out = _stream(terminal=True)
    for i in range(0, len(ANSWER), 7):
        stream.write(ANSWER[i : i + 7])
    stream.end()
    drawn = out.getvalue()
    # The table is a table and the emphasis is drawn: no pipes-and-dashes row, no asterisks.
    assert "|---|---|" not in drawn.splitlines()[-12:].__str__()
    last = "\n".join(drawn.splitlines()[-12:])
    assert "**" not in last and "###" not in last
    assert "Built-in Tools" in last and "decide" in last and "MCP tools" in last
    # Closed: a second end draws nothing more, and the next segment starts clean.
    size = len(out.getvalue())
    stream.end()
    assert len(out.getvalue()) == size
    assert stream.text == ""


def test_away_from_a_terminal_the_text_is_written_as_it_comes():
    stream, out = _stream(terminal=False)
    stream.write("**bold** and | a | pipe |\n")
    stream.end()
    assert out.getvalue() == "**bold** and | a | pipe |\n"


def test_an_empty_segment_draws_nothing():
    stream, out = _stream(terminal=True)
    stream.write("")
    stream.end()
    assert out.getvalue() == ""

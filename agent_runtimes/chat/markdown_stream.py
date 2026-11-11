# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The agent's answer drawn as Markdown while it streams.

On a terminal, the text of an answer is Markdown: headings, tables, lists
and code are drawn as such. While the answer streams, its last lines are
shown in a region that is redrawn as text arrives; when the segment ends —
a tool call starts, the run finishes — the region is cleared and the whole
segment is printed once, rendered. Away from a terminal (a pipe, a file)
the text is written as it comes, unchanged: what reads it reads Markdown.
"""

from __future__ import annotations

from typing import Optional

from rich.console import Console
from rich.live import Live
from rich.markdown import Markdown


class MarkdownStream:
    """One answer's text segments, drawn as Markdown on a terminal."""

    def __init__(self, console: Console) -> None:
        self.console = console
        self.text = ""
        self._live: Optional[Live] = None

    def _tail(self) -> Markdown:
        """What fits the screen while it streams: the segment's last lines."""
        room = max(4, self.console.size.height - 4)
        lines = self.text.splitlines()
        return Markdown("\n".join(lines[-room:]))

    def write(self, delta: str) -> None:
        """Add text to the segment under way."""
        if not delta:
            return
        if not self.console.is_terminal:
            self.console.print(delta, end="", markup=False, highlight=False)
            return
        self.text += delta
        if self._live is None:
            self._live = Live(
                self._tail(),
                console=self.console,
                refresh_per_second=8,
                transient=True,
            )
            self._live.start()
        else:
            self._live.update(self._tail())

    def end(self) -> None:
        """Close the segment under way: the region cleared, the segment printed whole."""
        if self._live is None:
            return
        live, self._live = self._live, None
        text, self.text = self.text, ""
        live.stop()
        if text.strip():
            self.console.print(Markdown(text))


__all__ = ["MarkdownStream"]

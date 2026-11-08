# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
What a stdio MCP server's process last wrote on its stderr.

A server whose process ends before it answers — ``npx tavily-mcp`` on a
runtime that cannot reach ``registry.npmjs.org`` — fails its handshake with
"Connection closed", which says nothing of why. Its stderr said it, in the
pod's log alone. The process is given a pipe instead of the runtime's
stderr: what it writes is passed on to the runtime's stderr as before, and
its last lines are kept, so that the failure is said in a sentence
(`lifecycle.failure_sentence`).
"""

from __future__ import annotations

import os
import sys
import threading
from collections import deque
from typing import TextIO

#: How much of its stderr is kept, in bytes.
TAIL_BYTES = 8192


class StderrTail:
    """A pipe for a process's stderr: passed on, its last bytes kept."""

    def __init__(self, server_id: str, keep: int = TAIL_BYTES) -> None:
        read_fd, write_fd = os.pipe()
        self._read_fd = read_fd
        self._writer: TextIO | None = os.fdopen(write_fd, "w")
        self._chunks: deque[bytes] = deque()
        self._kept = 0
        self._keep = keep
        self._lock = threading.Lock()
        self._thread = threading.Thread(
            target=self._pump, name=f"mcp-stderr-{server_id}", daemon=True
        )
        self._thread.start()

    @property
    def file(self) -> TextIO:
        """The end the process writes to."""
        assert self._writer is not None
        return self._writer

    def _pump(self) -> None:
        out = getattr(sys.stderr, "buffer", None)
        try:
            while True:
                chunk = os.read(self._read_fd, 4096)
                if not chunk:
                    return
                with self._lock:
                    self._chunks.append(chunk)
                    self._kept += len(chunk)
                    while self._kept > self._keep and len(self._chunks) > 1:
                        self._kept -= len(self._chunks.popleft())
                try:
                    if out is not None:
                        out.write(chunk)
                        out.flush()
                except Exception:  # noqa: BLE001 - the runtime's stderr is gone
                    pass
        finally:
            try:
                os.close(self._read_fd)
            except OSError:
                pass

    def text(self) -> str:
        """The last of what the process wrote, as text."""
        with self._lock:
            data = b"".join(self._chunks)[-self._keep :]
        return data.decode("utf-8", errors="replace")

    def close(self) -> None:
        """Close the runtime's copy of the end the process writes to.

        The pump ends once every process holding it has ended too.
        """
        writer, self._writer = self._writer, None
        if writer is not None:
            try:
                writer.close()
            except OSError:
                pass

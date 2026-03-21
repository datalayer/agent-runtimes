# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Large tool output eviction.

Saves oversized tool results to files in the agent's workspace,
replacing them with a compact preview + file reference. The agent
can still access the full content via ``read_file``.
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Default eviction directory inside the agent pod workspace
_DEFAULT_EVICTION_DIR = os.path.join(tempfile.gettempdir(), "agent-evicted")


class ToolOutputEviction:
    """Evict oversized tool outputs to files.

    Parameters
    ----------
    token_limit : int
        Tool outputs estimated to exceed this token count are evicted.
    eviction_dir : str
        Directory where evicted files are stored.
    preview_lines : int
        Number of lines to show in the preview (head + tail).
    """

    def __init__(
        self,
        token_limit: int = 20_000,
        eviction_dir: str = _DEFAULT_EVICTION_DIR,
        preview_lines: int = 5,
    ):
        self.token_limit = token_limit
        self.eviction_dir = eviction_dir
        self.preview_lines = preview_lines
        self._eviction_count = 0

    def should_evict(self, content: str) -> bool:
        """Check whether content should be evicted based on estimated tokens."""
        # Rough estimate: 1 token ≈ 4 chars
        estimated_tokens = len(content) // 4
        return estimated_tokens > self.token_limit

    def evict(self, tool_name: str, content: str) -> str:
        """Save content to a file and return a compact preview.

        Parameters
        ----------
        tool_name : str
            Name of the tool that produced the output.
        content : str
            The full tool output.

        Returns
        -------
        str
            A compact preview with a file reference.
        """
        # Create eviction directory
        os.makedirs(self.eviction_dir, exist_ok=True)

        # Generate unique filename
        content_hash = hashlib.md5(
            content.encode()[:1000], usedforsecurity=False
        ).hexdigest()[:8]
        self._eviction_count += 1
        filename = f"tool_{self._eviction_count}_{tool_name}_{content_hash}.txt"
        filepath = os.path.join(self.eviction_dir, filename)

        # Write full content to file
        Path(filepath).write_text(content, encoding="utf-8")

        lines = content.splitlines()
        total_lines = len(lines)

        # Build preview
        head = lines[: self.preview_lines]
        tail = (
            lines[-self.preview_lines :] if total_lines > self.preview_lines * 2 else []
        )
        truncated = total_lines - len(head) - len(tail)

        preview_parts = [
            f"Tool result too large ({total_lines} lines, ~{len(content) // 4} tokens), saved to: {filepath}",
            f'Read with: read_file(path="{filepath}", offset=0, limit=100)',
            "",
            f"Preview (first {len(head)} / last {len(tail)} lines):",
        ]
        preview_parts.extend(head)
        if truncated > 0:
            preview_parts.append(f"... [{truncated} lines truncated] ...")
        if tail:
            preview_parts.extend(tail)

        logger.info(
            "Evicted tool '%s' output (%d lines, %d chars) to %s",
            tool_name,
            total_lines,
            len(content),
            filepath,
        )

        return "\n".join(preview_parts)

    def process_tool_result(self, tool_name: str, result: Any) -> Any:
        """Process a tool result — evict if too large, return as-is otherwise."""
        result_str = str(result)
        if self.should_evict(result_str):
            return self.evict(tool_name, result_str)
        return result

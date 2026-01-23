#!/usr/bin/env python3
"""MCP Server - File Tokens Demo (STDIO).

Provides tools that read/write files and generate random text so the
agent can perform token-heavy workflows. Designed for use with the
Codemode agent CLI example.
"""

from __future__ import annotations

import os
import random
from pathlib import Path
from typing import Optional, TypedDict

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("example-mcp-server")

# Base directory for file operations - defaults to /tmp if CWD is not writable
_BASE_DIR: Path | None = None

def _get_base_dir() -> Path:
    """Get the base directory for file operations."""
    global _BASE_DIR
    if _BASE_DIR is None:
        # Try CWD first, fall back to /tmp
        cwd = Path.cwd()
        if cwd == Path("/") or not os.access(cwd, os.W_OK):
            _BASE_DIR = Path("/tmp/mcp_files")
        else:
            _BASE_DIR = cwd
        _BASE_DIR.mkdir(parents=True, exist_ok=True)
    return _BASE_DIR

_WORDS = [
    "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
    "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
    "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey",
    "xray", "yankee", "zulu", "apricot", "banana", "cherry", "date", "elderberry",
    "fig", "grape", "honeydew", "kiwi", "lemon", "mango", "nectarine", "orange",
    "papaya", "quince", "raspberry", "strawberry", "tangerine", "ugli", "vanilla",
    "watermelon", "xigua", "yam", "zucchini", "azure", "binary", "cache",
    "docker", "elastic", "feature", "gateway", "hash", "index", "json", "kafka",
    "lambda", "micro", "node", "object", "python", "query", "router", "schema",
    "token", "vector", "worker", "yaml",
]


class GenerateRandomTextResult(TypedDict):
    """Result from generate_random_text."""
    text: str
    word_count: int


class WriteTextFileResult(TypedDict):
    """Result from write_text_file."""
    path: str
    bytes: int
    words: int


class ReadTextFileResult(TypedDict, total=False):
    """Result from read_text_file."""
    path: str
    bytes: int
    words: int
    content: str  # Optional field


class ReadTextFileManyResult(TypedDict):
    """Result from read_text_file_many."""
    path: str
    reads: int
    last: ReadTextFileResult


def _normalize_path(path: str) -> Path:
    """Normalize a file path.
    
    Absolute paths are used as-is. Relative paths are resolved
    relative to the base directory (CWD or /tmp/mcp_files if CWD is not writable).
    """
    p = Path(path).expanduser()
    if p.is_absolute():
        return p.resolve()
    return (_get_base_dir() / p).resolve()


@mcp.tool()
def generate_random_text(word_count: int = 1000, seed: Optional[int] = None) -> GenerateRandomTextResult:
    """Generate pseudo-random text.

    Args:
        word_count: Number of words to generate.
        seed: Optional random seed for reproducibility.

    Returns:
        Dictionary with generated text and word count.
    """
    rng = random.Random(seed)
    words = [rng.choice(_WORDS) for _ in range(max(word_count, 0))]
    text = " ".join(words)
    return {"text": text, "word_count": len(words)}


@mcp.tool()
def write_text_file(path: str, content: str) -> WriteTextFileResult:
    """Write text content to a file.

    Args:
        path: File path to write.
        content: Text content.

    Returns:
        Metadata about the write.
    """
    target = _normalize_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {
        "path": str(target),
        "bytes": len(content.encode("utf-8")),
        "words": len(content.split()),
    }


@mcp.tool()
def read_text_file(
    path: str,
    include_content: bool = True,
    max_chars: Optional[int] = None,
) -> ReadTextFileResult:
    """Read text content from a file.

    Args:
        path: File path to read.
        include_content: Whether to include content in the response.
        max_chars: Optional limit for content length.

    Returns:
        File content and metadata.
    """
    target = _normalize_path(path)
    content = target.read_text(encoding="utf-8")
    if max_chars is not None:
        content = content[: max_chars]
    response = {
        "path": str(target),
        "bytes": len(content.encode("utf-8")),
        "words": len(content.split()),
    }
    if include_content:
        response["content"] = content
    return response


@mcp.tool()
def read_text_file_many(
    path: str,
    times: int = 10,
    include_content: bool = False,
    max_chars: Optional[int] = None,
) -> ReadTextFileManyResult:
    """Read a file multiple times.

    Args:
        path: File path to read.
        times: Number of reads.
        include_content: Whether to include content in the response.
        max_chars: Optional limit for content length per read.

    Returns:
        Aggregate statistics and optional content from the final read.
    """
    times = max(times, 0)
    last = {}
    for _ in range(times):
        last = read_text_file(path, include_content=include_content, max_chars=max_chars)
    return {
        "path": last.get("path", path),
        "reads": times,
        "last": last,
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")

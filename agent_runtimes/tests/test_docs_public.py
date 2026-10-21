# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What this repository publishes names nothing private (MH-P08): the
documentation, the README, the changelog, the examples and the package's own
docstrings never point at a private plan (`plans/`) or at the private web
client's repository (`datalayer/ui`). The seam with the platform is said in
public words instead — which `DATALAYER_*` variables turn the record store
on, what the file store is — on the Sessions page.
"""

from __future__ import annotations

from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
PRIVATE = ("plans/", "datalayer/ui")
#: The tests' own assertions name the words; nothing else may.
SKIPPED = {
    Path(__file__).resolve(),
    REPO / "agent_runtimes" / "tests" / "test_docs_sessions.py",
}


def _public_files() -> list[Path]:
    found: list[Path] = [REPO / "README.md", REPO / "CHANGELOG.md"]
    for folder, patterns in (
        (REPO / "docs" / "docs", ("*.md", "*.mdx")),
        (REPO / "examples", ("*.md", "*.mdx", "*.py")),
        (REPO / "agent_runtimes", ("*.py",)),
    ):
        for pattern in patterns:
            found.extend(
                path for path in folder.rglob(pattern) if path.resolve() not in SKIPPED
            )
    return [path for path in found if path.is_file()]


def test_nothing_public_names_a_private_plan_or_the_private_web_client() -> None:
    named: list[str] = []
    for path in _public_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for word in PRIVATE:
            if word in text:
                named.append(f"{path.relative_to(REPO)}: {word!r}")
    assert not named, "named where nothing private may be: " + ", ".join(named)


def test_the_sessions_page_says_the_seam_in_public_words() -> None:
    """Which variables turn the platform's record on, and what the file store is."""
    page = (REPO / "docs" / "docs" / "sessions" / "index.mdx").read_text(
        encoding="utf-8"
    )
    for words in (
        "DATALAYER_AI_AGENTS_URL",
        "DATALAYER_API_KEY",
        "AGENT_RUNTIMES_SESSION_STORE",
        "file store",
    ):
        assert words in page, words
    if not (REPO / "docs" / "docs" / "sessions").is_dir():
        pytest.skip("no Sessions section")

#!/usr/bin/env python
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Main entry point for agent-runtimes."""

from agent_runtimes.__main__ import app


def resume_alone(arguments: list[str]) -> list[str]:
    """`--resume` with no uid after it — the last word, or before another
    option — is given an empty one: it opens the picker.
    """
    said: list[str] = []
    for index, word in enumerate(arguments):
        said.append(word)
        following = arguments[index + 1] if index + 1 < len(arguments) else None
        if word == "--resume" and (following is None or following.startswith("-")):
            said.append("")
    return said


def main() -> None:
    """Entry point for the agent-runtimes CLI."""
    import sys

    sys.argv[1:] = resume_alone(sys.argv[1:])
    app()


if __name__ == "__main__":
    main()

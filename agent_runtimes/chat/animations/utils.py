# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Utility functions for animations."""

import select
import sys
import termios
import tty
from contextlib import contextmanager
from typing import Generator


@contextmanager
def raw_terminal() -> Generator[None, None, None]:
    """Context manager to put terminal in raw mode for key detection."""
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setcbreak(fd)
        yield
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


def check_escape_pressed() -> bool:
    """Check if ESCAPE key was pressed (non-blocking).

    Returns:
        True if ESCAPE was pressed, False otherwise.
    """
    # Drain all currently available input bytes/chars. This is more reliable
    # than a single-char read because terminals may buffer escape sequences.
    # If ESC is present anywhere in what was typed, stop the animation.
    saw_escape = False
    while select.select([sys.stdin], [], [], 0)[0]:
        char = sys.stdin.read(1)
        if not char:
            break
        if char == "\x1b":  # ESCAPE character
            saw_escape = True
            continue
    return saw_escape

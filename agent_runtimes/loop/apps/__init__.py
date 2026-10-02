# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications in LOOP: what an application does when its agent calls a tool.

An application (`agent_runtimes.specs.apps`) carries rules written in a
person's words and applied to what a tool does. This package is where they are
decided.
"""

from agent_runtimes.loop.apps.rules import (
    BEHAVIOURS,
    DEFAULT_BEHAVIOURS,
    behaviour_for,
    classes_of,
    condition_holds,
    is_pattern,
    is_read_only,
    matches,
    split_ref,
    strictest,
    tool_behaviours,
    tool_escalations,
)

__all__ = [
    "BEHAVIOURS",
    "DEFAULT_BEHAVIOURS",
    "behaviour_for",
    "classes_of",
    "condition_holds",
    "is_pattern",
    "is_read_only",
    "matches",
    "split_ref",
    "strictest",
    "tool_behaviours",
    "tool_escalations",
]

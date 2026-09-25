# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a frontend tool bundle actually grants.

`FrontendToolSpec.toolset` is either the string ``"all"`` or an explicit list of
tool names. The list is how least privilege gets *said* rather than hoped for:
an agent that may read and edit a notebook but must never delete from it asks
for `jupyter-notebook-edit`, and the bundle is what holds that line.

Kept out of `agent_runtimes.specs.frontend_tools`, which is generated — hand
logic in a generated file survives exactly until the next `make specs`.
"""

from __future__ import annotations

from typing import Iterable, Optional

from agent_runtimes.specs.frontend_tools import get_frontend_tool_spec


def resolve_toolset(tool_id: str) -> Optional[tuple[str, ...]]:
    """The tool names one bundle grants, or ``None`` for all of them.

    ``None`` means "everything the underlying toolset has" — the bundle does not
    know the names and does not need to. A tuple is an explicit allow-list.
    """
    spec = get_frontend_tool_spec(tool_id)
    if spec is None:
        return None
    toolset = getattr(spec, "toolset", "all")
    if isinstance(toolset, str):
        return None if toolset == "all" else (toolset,)
    return tuple(str(name) for name in toolset)


def resolve_allowed_tools(tool_ids: Iterable[str]) -> Optional[tuple[str, ...]]:
    """The union of what several bundles grant.

    ``None`` as soon as one of them grants everything: a spec asking for both
    the full notebook bundle and a narrow one gets the full bundle, because that
    is what it asked for. Narrowing is opting *out*, and should not happen by
    accident.
    """
    allowed: list[str] = []
    for tool_id in tool_ids:
        names = resolve_toolset(tool_id)
        if names is None:
            return None
        allowed.extend(names)
    return tuple(dict.fromkeys(allowed))

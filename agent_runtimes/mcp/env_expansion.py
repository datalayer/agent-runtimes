# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``${VAR}`` and ``${VAR:-default}`` in an MCP server's args, env and headers.

One rule wherever a server is started — the lifecycle manager, Codemode's
registry, the agent factory: ``${VAR}`` is the variable's value ('' when it
is unset), ``${VAR:-default}`` the default when it is unset or empty, as in a
shell. A server installed where the runtime image puts it, or where a
person's own machine has it (its spec's ``install``), is found either way.
"""

from __future__ import annotations

import os
import re
from typing import Callable, Mapping, Optional

PATTERN = re.compile(r"\$\{([^}]+)\}")


def expand_env_vars(
    value: str,
    env: Optional[Mapping[str, str]] = None,
    on_value: Optional[Callable[[str, str], None]] = None,
) -> str:
    """``value`` with its ``${VAR}`` and ``${VAR:-default}`` expanded from ``env`` (``os.environ``).

    ``on_value(name, value)`` is told each variable's value as it is put in
    (not a default's): what holds it back from the model.
    """
    source = os.environ if env is None else env

    def replace(match: "re.Match[str]") -> str:
        name, has_default, default = match.group(1).partition(":-")
        found = source.get(name, "")
        if found:
            if on_value is not None:
                on_value(name, found)
            return found
        return default if has_default else ""

    return PATTERN.sub(replace, value)


__all__ = ["PATTERN", "expand_env_vars"]

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a slash command says when the runtime answers without what it reads.

A ``loop`` newer than the runtime it talks to (a cloud runtime started from
an older image) reads keys and routes the runtime does not have yet. The
command then says so in a sentence, naming both versions, rather than
failing on a missing key.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx

from agent_runtimes._version import __version__

if TYPE_CHECKING:
    from .tux import CliTux


async def runtime_version(tux: "CliTux") -> str:
    """
    Return the version of agent-runtimes the session's runtime says it runs.

    Parameters
    ----------
    tux : CliTux
        The session, whose ``server_url`` is the runtime.

    Returns
    -------
    str
        What ``/api/v1/runtime/status`` says, or ``unknown`` when it does not
        answer.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{tux.server_url}/api/v1/runtime/status", timeout=10.0
            )
            response.raise_for_status()
            return str(response.json()["version"])
    except (httpx.HTTPError, ValueError, KeyError):
        return "unknown"


async def older_runtime(tux: "CliTux", what: str) -> str:
    """
    Say that the runtime does not answer with what a command reads.

    Parameters
    ----------
    tux : CliTux
        The session, whose ``server_url`` is the runtime.
    what : str
        What the runtime does not say, in words (``its agent's suggestions``).

    Returns
    -------
    str
        The sentence, naming the runtime's version and this ``loop``'s.
    """
    version = await runtime_version(tux)
    where = getattr(tux, "where", None) or "This runtime"
    return (
        f"{where} (agent-runtimes {version}) does not say {what}: it is older "
        f"than this loop ({__version__})."
    )

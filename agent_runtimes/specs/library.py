# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The library's agents, Cogs among them, by id.

Kept apart from the server's routes so that what reads an Appspec (the
application loader, a deployment's payload) needs none of the server's
extras.
"""

from __future__ import annotations

from typing import Any

from agent_runtimes.specs.agents import get_agent_spec


def get_library_agent_spec(agent_id: str) -> Any:
    """An agent of the library by id — or a Cog's, which is an agent equipped with Frames.

    A Cog carries its whole agent spec, its Frames' context in its system
    prompt; an application may name a Cog where it names an agent.
    """
    spec = get_agent_spec(agent_id)
    if spec is not None:
        return spec
    from agent_runtimes.specs.cogs import get_cog

    cog = get_cog(agent_id)
    return cog.spec if cog is not None else None

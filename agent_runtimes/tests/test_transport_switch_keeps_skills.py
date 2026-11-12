# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A transport switch keeps the agent, and so what it was given.

``loop`` switches the agent's transport before its first turn. Unregistering
the old transport purged the agent's stream state, and its spec's skills read
"available" afterwards: every skill call was refused as "disabled by user
selection" (worker-crawler on r1, 8 November 2026). Removing the agent still
purges it.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest

from agent_runtimes.routes.agui import unregister_agui_agent
from agent_runtimes.routes.vercel_ai import unregister_vercel_agent
from agent_runtimes.streams import loop

SKILLS = ["datalayer-memory-add:0.0.1", "github:0.0.1"]


@pytest.mark.parametrize(
    "unregister",
    [unregister_agui_agent, unregister_vercel_agent],
    ids=["ag-ui", "vercel-ai"],
)
def test_a_transport_switch_keeps_the_enabled_skills(
    unregister: Callable[..., None],
) -> None:
    agent_id = f"switch-keeps-{unregister.__name__}"
    loop.purge_agent_stream_state(agent_id)
    try:
        loop.set_agent_enabled_skills(agent_id, SKILLS)
        loop.approve_agent_skill(agent_id, "github")

        unregister(agent_id, keep_state=True)

        assert loop.get_agent_enabled_skill_ids(agent_id) == {
            "datalayer-memory-add",
            "github",
        }
        assert loop.get_agent_approved_skill_ids(agent_id) == {"github"}
    finally:
        loop.purge_agent_stream_state(agent_id)


@pytest.mark.parametrize(
    "unregister",
    [unregister_agui_agent, unregister_vercel_agent],
    ids=["ag-ui", "vercel-ai"],
)
def test_removing_the_agent_still_purges_its_state(
    unregister: Callable[..., None],
) -> None:
    agent_id = f"removed-purges-{unregister.__name__}"
    loop.purge_agent_stream_state(agent_id)
    try:
        loop.set_agent_enabled_skills(agent_id, SKILLS)

        unregister(agent_id)

        assert "datalayer-memory-add" not in loop.get_agent_enabled_skill_ids(agent_id)
    finally:
        loop.purge_agent_stream_state(agent_id)

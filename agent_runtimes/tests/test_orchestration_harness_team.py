# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Teams of harnesses (SHIELD.md SH-45): an orchestrator delegating to two harness workers.

The ``coding-agents`` team of the catalogue — Claude Code writes, Codex
reviews — run on the ACP SDK's fake agent standing in for both programs (no
model is funded): the orchestration's adapters delegate to the **Coder over
A2A** (the runtime's A2A worker serving the harness behind the Shield) and
to the **Reviewer over ACP** (``agent-shield run`` in front of the agent, on
the package's stdio channel), each execution carrying a budget, a deadline
and a manifest, and each comes back with its file edit as a ``text/x-diff``
artifact named by its path, the diff's hash in its provenance.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import shlex
import shutil
import sys
from pathlib import Path
from typing import Any

import pytest
from datalayer_core.orchestration import AgentProtocol

from agent_runtimes.orchestration.teams import (
    TeamSeat,
    member_binding,
    member_protocol,
    registration,
    schedule,
)
from agent_runtimes.specs.teams import get_team_spec
from agent_runtimes.tests.test_a2a_harness_worker import (  # noqa: F401 - fixtures
    _free_port,
    harness_agent,
    state,
    workspace,
)
from agent_runtimes.tests.test_acp_agent import FAKE
from agent_runtimes.transports.a2a import DIFF_MEDIA_TYPE
from agent_runtimes.types import TeamLinkSpec

DEADLINE = "2026-10-16T23:00:00+00:00"


def _delegation(agent_id: str, endpoint: str, protocol: AgentProtocol) -> Any:
    """One member's execution: the objective, a budget, a deadline and a manifest."""
    from datalayer_core.orchestration import Budget

    from agent_runtimes.tests.orchestration_records import an_execution

    execution = an_execution(
        agent_id=agent_id,
        endpoint=endpoint,
        protocol=protocol,
        goal="edit the greeting",
        references=("datalayer:file/greeting@1",),
    )
    policy = execution.policy.model_copy(
        update={
            "deadline": DEADLINE,
            "budget": Budget(input_tokens=4000, output_tokens=1000),
        }
    )
    return execution.model_copy(update={"policy": policy})


def _diffs(observations: list[Any]) -> list[Any]:
    return [
        o
        for o in observations
        if getattr(o, "artifact", None) is not None
        and o.artifact.media_type == DIFF_MEDIA_TYPE
    ]


def test_the_catalogue_team_seats_its_harnesses_and_binds_them_by_the_links() -> None:
    team = get_team_spec("coding-agents")
    assert team is not None
    coder, reviewer = team.agents
    assert (coder.harness, reviewer.harness) == ("claude-code", "codex")
    assert [[m.id for m in layer] for layer in schedule(team)] == [
        ["coder"],
        ["reviewer"],
    ]
    # A harness seat is registered by its harness: no model, no system prompt.
    assert registration(TeamSeat(team, coder)) == {
        "agent_spec": {"harness": "claude-code", "description": coder.goal}
    }
    assert member_binding(team, coder).protocol is AgentProtocol.A2A
    # A member that asks it over acp binds it over ACP.
    linked = team.model_copy(
        update={
            "agents": [
                coder.model_copy(
                    update={"talks_to": [TeamLinkSpec(member="reviewer", over="acp")]}
                ),
                reviewer,
            ]
        }
    )
    assert member_protocol(linked, linked.agents[1]) is AgentProtocol.ACP
    assert member_protocol(linked, linked.agents[0]) is AgentProtocol.A2A


@pytest.mark.asyncio
async def test_an_orchestrator_delegates_to_two_harness_workers_and_gets_their_diffs_back(
    state: Any, workspace: Path, tmp_path_factory: pytest.TempPathFactory  # noqa: F811 - the fixtures imported above
) -> None:
    """The drill: the Coder over A2A, the Reviewer over ACP behind `agent-shield run`."""
    import uvicorn
    from fasta2a.broker import InMemoryBroker
    from fastapi import FastAPI

    from agent_runtimes.orchestration import ResolvedWorker
    from agent_runtimes.orchestration.adapters.a2a import (
        A2A_CAPABILITIES,
        A2AWorkerAdapter,
    )
    from agent_runtimes.orchestration.adapters.acp import ACPWorkerAdapter
    from agent_runtimes.protocol_state.a2a import DurableStorage
    from agent_runtimes.routes import a2a as a2a_routes
    from agent_runtimes.subagents.a2a import A2ARemoteAgent
    from agent_runtimes.tests.orchestration_records import an_attempt

    shield = shutil.which("agent-shield")
    if shield is None:
        pytest.skip("agent-shield is not installed")

    team = get_team_spec("coding-agents")
    assert team is not None
    coder, reviewer = team.agents

    # The Coder: the runtime's A2A worker serving the harness behind the Shield.
    port = _free_port()
    app = FastAPI()
    a2a_routes.set_a2a_app(app, "/api/v1")
    agent = harness_agent(workspace)
    url = f"http://127.0.0.1:{port}/api/v1/a2a/agents/coder"
    card = a2a_routes.A2AAgentCard(
        id="coder", name=coder.name, description=coder.goal, url=url
    )
    a2a_routes.register_a2a_agent(
        agent, card, broker=InMemoryBroker(), storage=DurableStorage(state, "coder")
    )
    server = uvicorn.Server(
        uvicorn.Config(
            app, host="127.0.0.1", port=port, log_level="warning", lifespan="off"
        )
    )
    serving = asyncio.create_task(server.serve())
    try:
        for _ in range(100):
            if server.started:
                break
            await asyncio.sleep(0.05)
        assert server.started
        remote = A2ARemoteAgent(name="coder", url=url, launch="remote")
        coding = _delegation("team:coding-agents/coder", url, AgentProtocol.A2A)
        resolved = ResolvedWorker(
            binding=coding.agent,
            capabilities=A2A_CAPABILITIES,
            endpoint=url,
            details=remote.describe(),
            handle=remote,
        )
        coded = [
            o
            async for o in A2AWorkerAdapter().dispatch(
                resolved, coding, an_attempt(coding)
            )
        ]
    finally:
        server.should_exit = True
        await asyncio.wait_for(serving, 10)
        a2a_routes.unregister_a2a_agent("coder")
        a2a_routes.set_a2a_app(None, "/api/v1")
        await agent.cleanup()

    # The Reviewer: the agent behind `agent-shield run`, over the stdio channel.
    review_space = tmp_path_factory.mktemp("reviewer")
    home = tmp_path_factory.mktemp("shield-home")
    import subprocess

    # The Shield's policy beside the work: decision 5's default, as `setup` writes it.
    subprocess.run(
        [shield, "policy", "init", str(review_space / "agent-shield.yaml")],
        check=True,
        capture_output=True,
    )
    endpoint = "stdio:" + shlex.join(
        [
            "env",
            f"AGENT_SHIELD_HOME={home}",
            shield,
            "run",
            "--workspace",
            str(review_space),
            "--audit",
            str(home / "audit.jsonl"),
            "--",
            sys.executable,
            str(FAKE),
        ]
    )
    reviewing = _delegation("team:coding-agents/reviewer", endpoint, AgentProtocol.ACP)
    adapter = ACPWorkerAdapter(workspace=str(review_space), timeout_seconds=60)
    worker = await adapter.resolve(reviewing.agent)
    reviewed = [
        o async for o in adapter.dispatch(worker, reviewing, an_attempt(reviewing))
    ]

    for observations, where in ((coded, workspace), (reviewed, review_space)):
        [diff] = _diffs(observations)
        assert diff.artifact.name == "hello.txt"
        assert "+hello, shield" in diff.data["text"]
        [provenance] = diff.artifact.provenance
        assert (
            provenance.content_hash
            == "sha256:" + hashlib.sha256(diff.data["text"].encode()).hexdigest()
        )
        assert (where / "hello.txt").read_text() == "hello, shield\n"
    # What each delegation carried: the budget on the prompt's _meta, the
    # manifest named in the objective, the deadline on the execution.
    from agent_runtimes.orchestration.adapter import objective_prompt
    from agent_runtimes.orchestration.budget import delegation_meta

    for execution in (coding, reviewing):
        assert execution.policy.deadline is not None
        carried = json.dumps(
            delegation_meta(execution, credential=None, extended=False)
        )
        assert "4000" in carried and "1000" in carried, carried
        assert "datalayer:file/greeting@1" in objective_prompt(
            execution, an_attempt(execution)
        )
    # The Shield in front of the Reviewer decided its edit, and wrote it down.
    audit = [
        json.loads(line)
        for line in (home / "audit.jsonl").read_text().splitlines()
        if line.strip()
    ]
    assert audit, "the Shield's audit is empty"

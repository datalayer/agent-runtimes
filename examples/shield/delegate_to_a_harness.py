#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An orchestrator delegates to a coding agent over A2A and reads the diff (SH-15, SH-23 e).

A harness on the runtime is served over A2A like any agent, plus: its plan
as an artifact replaced as it progresses, each file it changed as a
``text/x-diff`` artifact named by its path, with the content's hash as its
provenance. This script serves the fake agent behind the Shield as an A2A
worker on this machine, delegates one objective to it with the orchestration
adapter (``agent_runtimes.orchestration.adapters.a2a``) — the one a Datalayer
orchestrator uses — and prints what came back: the statuses, the diff, and
its hash checked against the bytes.

Run it from this folder::

    python delegate_to_a_harness.py

No key, no account.
"""

from __future__ import annotations

import asyncio
import hashlib
import socket
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from datalayer_core.orchestration import (  # noqa: E402
    AgentBinding,
    AgentProtocol,
    Attempt,
    ContextManifest,
    Execution,
    Objective,
)
from fake_harness import FAKE_COMMAND, a_workspace, fake_harness  # noqa: E402

from agent_runtimes.adapters.acp_agent import ACPAgent  # noqa: E402
from agent_runtimes.guardrails.shield_policy import policies_of  # noqa: E402
from agent_runtimes.orchestration import ResolvedWorker  # noqa: E402
from agent_runtimes.orchestration.adapters.a2a import (  # noqa: E402
    A2A_CAPABILITIES,
    A2AWorkerAdapter,
)
from agent_runtimes.protocol_state.a2a import DurableStorage  # noqa: E402
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore  # noqa: E402
from agent_runtimes.routes import a2a as a2a_routes  # noqa: E402
from agent_runtimes.subagents.a2a import A2ARemoteAgent  # noqa: E402
from agent_runtimes.transports.a2a import DIFF_MEDIA_TYPE  # noqa: E402

WORKER = "coding-worker"


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def execution_for(url: str) -> tuple[Execution, Attempt]:
    """The delegation: one objective, to the worker at ``url``, and its first attempt."""
    stamped = datetime.now(timezone.utc).isoformat()
    execution = Execution(
        execution_id="exec_shield_example",
        root_execution_id="exec_shield_example",
        agent=AgentBinding(
            agent_id=WORKER,
            capability="code.edit",
            protocol=AgentProtocol.A2A,
            endpoint=url,
        ),
        objective=Objective(
            goal="edit the greeting",
            acceptance_criteria=["hello.txt greets the Shield"],
        ),
        context=ContextManifest(references=[]),
        created_at=stamped,
        updated_at=stamped,
    )
    attempt = Attempt(
        attempt_id="att_1",
        execution_id=execution.execution_id,
        number=1,
        agent_id=WORKER,
        protocol=AgentProtocol.A2A,
    )
    return execution, attempt


async def main() -> int:
    """Serve the worker, delegate, print the diff and check its hash.

    Returns
    -------
    int
        0 when a diff came back whose hash matches its bytes, 1 otherwise.
    """
    import uvicorn
    from fasta2a.broker import InMemoryBroker
    from fastapi import FastAPI

    workspace = a_workspace()
    state = SqliteProtocolStateStore(Path(tempfile.mkdtemp()) / "state.sqlite")
    agent = ACPAgent(
        agent_id=WORKER,
        harness=fake_harness(),
        command=FAKE_COMMAND,
        workspace=workspace,
        policies=policies_of(None),
    )
    port = _free_port()
    url = f"http://127.0.0.1:{port}/api/v1/a2a/agents/{WORKER}"
    app = FastAPI()
    a2a_routes.set_a2a_app(app, "/api/v1")
    a2a_routes.register_a2a_agent(
        agent,
        a2a_routes.A2AAgentCard(
            id=WORKER,
            name="Coding worker",
            description="A harness behind the Shield",
            url=url,
        ),
        broker=InMemoryBroker(),
        storage=DurableStorage(state, WORKER),
    )
    server = uvicorn.Server(
        uvicorn.Config(
            app, host="127.0.0.1", port=port, log_level="warning", lifespan="off"
        )
    )
    serving = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)
    print(f"Worker     {url}")
    print("Objective  edit the greeting\n")
    execution, attempt = execution_for(url)
    remote = A2ARemoteAgent(name=WORKER, url=url, launch="remote")
    worker = ResolvedWorker(
        binding=execution.agent,
        capabilities=A2A_CAPABILITIES,
        endpoint=url,
        details=remote.describe(),
        handle=remote,
    )
    diffs = []
    try:
        async for observation in A2AWorkerAdapter().dispatch(
            worker, execution, attempt
        ):
            artifact = getattr(observation, "artifact", None)
            if artifact is None:
                if observation.message:
                    print(
                        f"  observed   {observation.type.value}: {observation.message[:90]}"
                    )
                continue
            print(f"  artifact   {artifact.name} ({artifact.media_type})")
            if artifact.media_type == DIFF_MEDIA_TYPE and observation.data:
                diffs.append((artifact, observation.data["text"]))
    finally:
        server.should_exit = True
        await serving
        a2a_routes.unregister_a2a_agent(WORKER)
        a2a_routes.set_a2a_app(None, "/api/v1")
        await agent.cleanup()

    ok = bool(diffs)
    for artifact, text in diffs:
        print(f"\nThe diff of {artifact.name}:")
        for line in text.splitlines():
            print(f"  {line}")
        [provenance] = artifact.provenance or [None]
        digest = "sha256:" + hashlib.sha256(text.encode()).hexdigest()
        same = provenance is not None and provenance.content_hash == digest
        ok = ok and same
        print(
            f"  provenance {provenance.content_hash if provenance else None} ({'matches' if same else 'DIFFERS'})"
        )
    print(
        f"\nIn the worker's workspace: hello.txt says {(workspace / 'hello.txt').read_text()!r}"
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

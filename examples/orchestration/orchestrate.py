#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
One objective, two protocols, one code path (PLAN_ORCHESTRATOR.md, O0-13).

A parent asks for a notebook to be analysed and delegates it twice: once to a
worker that speaks A2A and once to a worker that speaks ACP. Everything below
``main`` is written once and run twice; the only thing that changes between
the two runs is the **descriptor** — who the worker is, which protocol it
speaks and where it answers — which is the claim this example exists to
make and the thing it prints at the end.

What the run does, in the order a control plane does it:

1. Resolve the worker the descriptor names, and read back what it turned out
   to be able to do (section 7; decision 5 of 19.8 requires a reduction to be
   reported on the execution rather than hidden, so the first observation of
   every dispatch is the adapter's capability report).
2. Create the execution under the delegating command's idempotency key, with
   the notebook named as a ``datalayer:notebook/<uid>@<version>`` reference
   rather than copied into the prompt (section 2).
3. Record the first attempt and assign it. Choosing a worker is a control
   plane decision and never something an adapter observes.
4. Dispatch, and record every observation as canonical state — which is the
   seam of section 4: adapters report, the control plane decides.
5. Arbitrate the commit. The first attempt to reach commit wins (decision 4).

Nothing here is protocol-specific except one dictionary from a protocol to
its adapter, which is what a registry is.

Run it::

    python orchestrate.py

which starts both workers on ephemeral ports, runs both delegations and
prints them side by side. Against a Datalayer runtime, see the README.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator, Sequence

# The example runs from its own directory, so that `notebook_analysis` and `workers`
# are importable the way a small project's modules are.
sys.path.insert(0, str(Path(__file__).parent))

from datalayer_core.orchestration import (  # noqa: E402
    Acknowledgement,
    AgentBinding,
    AgentDescriptor,
    AgentProtocol,
    AgentSkill,
    Artifact,
    Attempt,
    ContextAccess,
    ContextKind,
    ContextManifest,
    ContextReference,
    Execution,
    ExecutionEvent,
    LifecycleEvent,
    Objective,
    ProtocolEndpoint,
    Trace,
    WorkerOperation,
    commit_artifacts,
    format_context_uri,
)
from workers.a2a_worker import AGENT_ID, CAPABILITY  # noqa: E402

from agent_runtimes.orchestration import (  # noqa: E402
    InMemoryExecutionStore,
    Observation,
    WorkerAdapter,
)
from agent_runtimes.orchestration.adapters.a2a import A2AWorkerAdapter  # noqa: E402
from agent_runtimes.orchestration.adapters.acp import ACPWorkerAdapter  # noqa: E402

#: The one place a protocol name decides anything. Everything else in this
#: file reads the descriptor.
ADAPTERS: dict[AgentProtocol, type[WorkerAdapter]] = {
    AgentProtocol.A2A: A2AWorkerAdapter,
    AgentProtocol.ACP: ACPWorkerAdapter,
}

#: A W3C traceparent, so both runs hang under one trace (section 10).
TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"


def descriptor_for(protocol: AgentProtocol, endpoint: str) -> AgentDescriptor:
    """
    The worker, described. This is the only thing that differs between runs.

    Parameters
    ----------
    protocol : AgentProtocol
        Which protocol this worker speaks.
    endpoint : str
        Where it answers.

    Returns
    -------
    AgentDescriptor
        The descriptor, identical for both workers but for those two values.
    """
    return AgentDescriptor(
        agent_id=f"{AGENT_ID}-{protocol.value}",
        name="Notebook Analyst",
        description="Reports what is wrong with a notebook.",
        version="1.0.0",
        capabilities=[CAPABILITY],
        skills=[
            AgentSkill(
                id=CAPABILITY,
                name="Analyse a notebook",
                description="Read a notebook and report what is wrong with it.",
                tags=["notebook", "analysis"],
            )
        ],
        endpoints=[ProtocolEndpoint(protocol=protocol, url=endpoint)],
        output_content_types=["text/plain"],
        supported_operations=[WorkerOperation.DELEGATE, WorkerOperation.CANCEL],
    )


def binding_of(descriptor: AgentDescriptor) -> AgentBinding:
    """
    The binding a delegation carries, read off the descriptor.

    Parameters
    ----------
    descriptor : AgentDescriptor
        The worker.

    Returns
    -------
    AgentBinding
        Which worker, over which protocol, and where.

    Raises
    ------
    ValueError
        When the descriptor names no endpoint to reach the worker at.
    """
    if not descriptor.endpoints:
        raise ValueError(f"'{descriptor.agent_id}' declares no endpoint.")
    endpoint = descriptor.endpoints[0]
    return AgentBinding(
        agent_id=descriptor.agent_id,
        capability=descriptor.capabilities[0] if descriptor.capabilities else "",
        protocol=endpoint.protocol,
        endpoint=endpoint.url,
    )


def execution_for(descriptor: AgentDescriptor, notebook_uri: str) -> Execution:
    """
    The delegation: what is wanted, of which notebook, under what limits.

    The notebook is *named*, never inlined. Section 2 asks for context to be
    passed by reference so that two workers analysing the same notebook are
    demonstrably analysing the same version of it, and so that a worker's
    access to it can be authorized rather than assumed.

    Parameters
    ----------
    descriptor : AgentDescriptor
        The worker this delegation is bound to.
    notebook_uri : str
        The versioned notebook reference.

    Returns
    -------
    Execution
        The execution, in the state a freshly created one is in.
    """
    stamped = datetime.now(timezone.utc).isoformat()
    return Execution(
        execution_id=f"exec_{uuid.uuid4().hex[:12]}",
        root_execution_id=f"exec_{uuid.uuid4().hex[:12]}",
        agent=binding_of(descriptor),
        objective=Objective(
            goal="Analyse the notebook and report what is wrong with it",
            acceptance_criteria=[
                "Every cell that raised is named",
                "Every cell that never ran is named",
                "The verdict says whether the notebook runs clean",
            ],
            instructions="Read it top to bottom. Do not run it.",
        ),
        context=ContextManifest(
            references=[
                ContextReference(
                    uri=notebook_uri,
                    access=ContextAccess.READ_ONLY,
                    description="The notebook to analyse.",
                )
            ]
        ),
        trace=Trace(traceparent=TRACEPARENT),
        created_at=stamped,
        updated_at=stamped,
    )


@dataclass
class Run:
    """What one delegation left behind.

    Parameters
    ----------
    descriptor : AgentDescriptor
        The worker it went to.
    execution : Execution
        The execution in its final state.
    events : list[ExecutionEvent]
        Its event stream, in order.
    acknowledgements : list[Acknowledgement]
        The milestones of section 6.3 it reached.
    artifacts : list[Artifact]
        What it produced.
    reductions : list[str]
        What the adapter said it could not do, in its own words.
    """

    descriptor: AgentDescriptor
    execution: Execution
    events: list[ExecutionEvent] = field(default_factory=list)
    acknowledgements: list[Acknowledgement] = field(default_factory=list)
    artifacts: list[Artifact] = field(default_factory=list)
    reductions: list[str] = field(default_factory=list)

    @property
    def answer(self) -> str:
        """
        The worker's answer, as the artifact carries it.

        The artifact keeps a summary and a hash of the answer rather than the
        answer itself: registering it is section 5.4's typed reference with
        provenance, and putting the body somewhere durable is O1-10's.

        Returns
        -------
        str
            The answer, or an empty string when there was none.
        """
        return next((item.summary or "" for item in self.artifacts), "")

    @property
    def content_hash(self) -> str:
        """
        The hash of what the worker answered, from the artifact's provenance.

        This is what makes "both workers gave the same answer" checkable
        rather than asserted: two hashes computed by two adapters, from two
        protocols' bytes.

        Returns
        -------
        str
            The hash, or an empty string when there is no artifact.
        """
        for artifact in self.artifacts:
            for provenance in artifact.provenance:
                if provenance.content_hash:
                    return provenance.content_hash
        return ""


async def orchestrate(descriptor: AgentDescriptor, notebook_uri: str) -> Run:
    """
    Delegate one objective to one worker, and keep what came back.

    Parameters
    ----------
    descriptor : AgentDescriptor
        The worker to delegate to. The only thing that differs between the
        two runs of this function.
    notebook_uri : str
        The notebook, by reference.

    Returns
    -------
    Run
        The execution, its events, its acknowledgements and its artifacts.
    """
    binding = binding_of(descriptor)
    adapter = ADAPTERS[binding.protocol]()
    worker = await adapter.resolve(binding)

    store = InMemoryExecutionStore()
    execution = await store.create(
        execution_for(descriptor, notebook_uri),
        idempotency_key=f"delegate-{descriptor.agent_id}",
    )
    attempt = await store.record_attempt(
        Attempt(
            attempt_id=f"att_{uuid.uuid4().hex[:12]}",
            execution_id=execution.execution_id,
            number=1,
            agent_id=binding.agent_id,
            protocol=binding.protocol,
        )
    )
    execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

    reductions: list[str] = []
    stream = adapter.dispatch(worker, execution, attempt)
    try:
        async for observation in stream:
            reductions.extend(_reductions(observation))
            await store.record(
                execution.execution_id, observation, attempt_id=attempt.attempt_id
            )
    finally:
        # Closing rather than abandoning: the adapter tells the worker when a
        # caller stops listening, so nothing is left spending on an answer
        # nobody will read.
        await stream.aclose()

    artifacts = await store.artifacts(execution.execution_id)
    commit = commit_artifacts(
        artifacts, execution_id=execution.execution_id, attempt_id=attempt.attempt_id
    )
    for artifact in commit.artifacts:
        await store.save_artifact(execution.execution_id, artifact)

    return Run(
        descriptor=descriptor,
        execution=await store.get(execution.execution_id),
        events=await store.events(execution.execution_id),
        acknowledgements=await store.acknowledgements(execution.execution_id),
        artifacts=await store.artifacts(execution.execution_id),
        reductions=reductions,
    )


def _reductions(observation: Observation) -> list[str]:
    """
    The reductions an adapter declared, when this is its capability report.

    Parameters
    ----------
    observation : Observation
        What the adapter reported.

    Returns
    -------
    list[str]
        Each operation it cannot perform, and why.
    """
    report = (observation.data or {}).get("adapterCapabilities")
    if not isinstance(report, dict):
        return []
    return [
        f"{entry.get('operation')}: {entry.get('reason')}"
        for entry in report.get("unsupported") or []
    ]


# ---------------------------------------------------------------------------
# The workers, when the example is asked to start them
# ---------------------------------------------------------------------------


@asynccontextmanager
async def local_workers(notebook: Path) -> AsyncIterator[tuple[str, str]]:
    """
    Start both workers on ephemeral ports, and stop them on the way out.

    Parameters
    ----------
    notebook : Path
        The notebook they analyse.

    Yields
    ------
    tuple[str, str]
        The A2A endpoint and the ACP endpoint.
    """
    import uvicorn
    from workers.a2a_worker import build_app
    from workers.acp_worker import serve

    acp_server = await serve(notebook, "127.0.0.1", 0)
    acp_port = acp_server.sockets[0].getsockname()[1]

    a2a_app = build_app(notebook, url="http://127.0.0.1:0")
    config = uvicorn.Config(a2a_app, host="127.0.0.1", port=0, log_level="warning")
    server = uvicorn.Server(config)
    serving = asyncio.create_task(server.serve())
    while not server.started:
        if serving.done():
            await serving
        await asyncio.sleep(0.05)
    a2a_port = server.servers[0].sockets[0].getsockname()[1]

    try:
        yield (
            f"http://127.0.0.1:{a2a_port}",
            f"ws://127.0.0.1:{acp_port}",
        )
    finally:
        server.should_exit = True
        await serving
        acp_server.close()
        await acp_server.wait_closed()


# ---------------------------------------------------------------------------
# Saying what happened
# ---------------------------------------------------------------------------


def _print_run(run: Run) -> None:
    """
    One run, as its own event stream tells it.

    Parameters
    ----------
    run : Run
        The run.
    """
    endpoint = run.descriptor.endpoints[0]
    print(f"\n{'=' * 72}")
    print(f"{run.descriptor.agent_id}  ({endpoint.protocol.value} at {endpoint.url})")
    print("=" * 72)
    for event in run.events:
        detail = event.message or ""
        if len(detail) > 96:
            detail = detail[:93] + "..."
        print(f"  {event.sequence:>3}  {event.type.value:<22}  {detail}")
    print(f"\n  state          {run.execution.status.value}")
    print(
        "  milestones     "
        + ", ".join(item.kind.value for item in run.acknowledgements)
    )
    for artifact in run.artifacts:
        print(
            f"  artifact       {artifact.name} ({artifact.type.value}, "
            f"{artifact.status.value}, {len(artifact.provenance)} provenance)"
        )
    for reduction in run.reductions:
        print(f"  cannot         {reduction}")


def _print_comparison(runs: Sequence[Run]) -> None:
    """
    What differed between the runs, which is the point of the example.

    Parameters
    ----------
    runs : Sequence[Run]
        The runs, in the order they were made.
    """
    print(f"\n{'=' * 72}")
    print("What differed")
    print("=" * 72)

    first, second = runs[0], runs[1]
    left = first.descriptor.model_dump()
    right = second.descriptor.model_dump()
    differing = sorted(key for key in left if left[key] != right[key])
    print(f"  descriptor     {', '.join(differing)}")

    for label, values in (
        ("state", [run.execution.status.value for run in runs]),
        ("artifacts", [str(len(run.artifacts)) for run in runs]),
        ("answer", [_digest(run.answer) for run in runs]),
        ("content hash", [run.content_hash[:23] + "\u2026" for run in runs]),
        (
            "milestones",
            [
                "+".join(item.kind.value for item in run.acknowledgements)
                for run in runs
            ],
        ),
    ):
        same = "same" if len(set(values)) == 1 else "DIFFERENT"
        print(f"  {label:<14} {same:<10} {' | '.join(values)}")

    print(
        "\n  The answer each worker gave, as the artifact's summary "
        "(the artifact keeps a hash, not the body — O1-10 commits the body):"
    )
    for run in runs:
        print(f"\n  --- {run.descriptor.agent_id} ---")
        for line in run.answer.splitlines():
            print(f"  {line}")


def _digest(answer: str) -> str:
    """
    An answer reduced to something two runs can be compared on.

    Parameters
    ----------
    answer : str
        The worker's answer.

    Returns
    -------
    str
        Its first line.
    """
    return answer.splitlines()[0] if answer else "(none)"


async def main(argv: Sequence[str] | None = None) -> int:
    """
    Run the example.

    Parameters
    ----------
    argv : Sequence[str] | None
        Command line arguments.

    Returns
    -------
    int
        0 when both runs completed and agreed, 1 otherwise.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--notebook",
        type=Path,
        default=Path(__file__).parent / "notebook.ipynb",
        help="The notebook to analyse.",
    )
    parser.add_argument(
        "--a2a-endpoint",
        help="An A2A worker already running. Without it, one is started here.",
    )
    parser.add_argument(
        "--acp-endpoint",
        help="An ACP worker already running. Without it, one is started here.",
    )
    parser.add_argument(
        "--notebook-uid",
        default="nb-quarterly-revenue",
        help="The uid the notebook is referenced by.",
    )
    parser.add_argument(
        "--notebook-version", default="3", help="The version referenced."
    )
    arguments = parser.parse_args(argv)

    notebook_uri = format_context_uri(
        ContextKind.NOTEBOOK, arguments.notebook_uid, arguments.notebook_version
    )
    print("Objective    Analyse the notebook and report what is wrong with it")
    print(f"Context      {notebook_uri}  ({arguments.notebook.name})")

    given = arguments.a2a_endpoint and arguments.acp_endpoint
    if given:
        return await _both(arguments.a2a_endpoint, arguments.acp_endpoint, notebook_uri)
    async with local_workers(arguments.notebook) as (a2a, acp):
        return await _both(
            arguments.a2a_endpoint or a2a, arguments.acp_endpoint or acp, notebook_uri
        )


async def _both(a2a_endpoint: str, acp_endpoint: str, notebook_uri: str) -> int:
    """
    Delegate the same objective to both workers and report.

    Parameters
    ----------
    a2a_endpoint : str
        Where the A2A worker answers.
    acp_endpoint : str
        Where the ACP worker answers.
    notebook_uri : str
        The notebook, by reference.

    Returns
    -------
    int
        0 when both completed and agreed, 1 otherwise.
    """
    runs = [
        await orchestrate(descriptor_for(protocol, endpoint), notebook_uri)
        for protocol, endpoint in (
            (AgentProtocol.A2A, a2a_endpoint),
            (AgentProtocol.ACP, acp_endpoint),
        )
    ]
    for run in runs:
        _print_run(run)
    _print_comparison(runs)

    completed = all(run.execution.status.value == "completed" for run in runs)
    # Not the first line of the answer: the hashes, so that two workers that
    # agreed on the headline and differed underneath it would be caught.
    agreed = len({run.content_hash for run in runs}) == 1
    print()
    if completed and agreed:
        print("Both workers completed and agreed.")
        return 0
    print("The runs did not agree: see above.")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

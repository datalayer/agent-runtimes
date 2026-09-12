# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The O0-13 scenario, run in continuous integration.

``examples/orchestration`` delegates one objective to an A2A worker and to an
ACP worker over one code path, and its whole claim is that the only difference
between the two is the descriptor. An example nobody runs stops being true
quietly, so it is run here — with its real servers, over real sockets — and
what it claims is asserted rather than printed.

The conformance suite (``tests/orchestration``) stands the protocols in for
each other to test the adapters. This does the opposite: nothing is stood in
for, and what is under test is that the two adapters, the A2A relay and the
repository's ACP client all still reach a worker that exists.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any, Iterator

import pytest

EXAMPLE = Path(__file__).resolve().parents[2] / "examples" / "orchestration"


@pytest.fixture(scope="module")
def recorded() -> Iterator[Any]:
    """
    The measures the execution store takes, kept in memory while the example runs.

    Yields
    ------
    Any
        What answers the recording instruments.
    """
    from agent_runtimes.monitoring import orchestration_measures as measures

    measures.configure(recording=True)
    yield measures.instruments
    measures.configure()


@pytest.fixture(scope="module")
def runs(recorded: Any) -> list[Any]:
    """
    The example, run once, both delegations.

    Run through ``asyncio.run`` in a module-scoped fixture rather than as an
    async fixture: the example starts two servers and the two runs cost about
    a second and a half between them, which is worth paying once.

    Parameters
    ----------
    recorded : Any
        The recording instruments, in place before the runs start.

    Returns
    -------
    list[Any]
        The two runs, A2A first.
    """
    sys.path.insert(0, str(EXAMPLE))
    try:
        from orchestrate import (  # type: ignore[import-not-found]
            descriptor_for,
            local_workers,
            orchestrate,
        )
    finally:
        sys.path.remove(str(EXAMPLE))

    from datalayer_core.orchestration import (
        AgentProtocol,
        ContextKind,
        format_context_uri,
    )

    notebook = EXAMPLE / "notebook.ipynb"
    uri = format_context_uri(ContextKind.NOTEBOOK, "nb-quarterly-revenue", "3")

    async def both() -> list[Any]:
        async with local_workers(notebook) as (a2a, acp):
            return [
                await orchestrate(descriptor_for(protocol, endpoint), uri)
                for protocol, endpoint in (
                    (AgentProtocol.A2A, a2a),
                    (AgentProtocol.ACP, acp),
                )
            ]

    return asyncio.run(both())


class TestTheMeasuresOfTheScenario:
    """The measures of O1-14 have a number for this scenario."""

    def test_nothing_was_repeated_superseded_or_recovered(
        self, runs: list[Any], recorded: Any
    ) -> None:
        """
        Two delegations, two commits, and no disconnect or lost worker to survive.

        Parameters
        ----------
        runs : list[Any]
            The two runs.
        recorded : Any
            The recording instruments.
        """
        from agent_runtimes.monitoring.orchestration_measures import recorded_measures

        taken = recorded_measures(recorded())

        assert taken.duplicate_delegations == (0, 2)
        assert taken.superseded_artifacts == (0, 2)
        assert taken.completed_after_disconnect == (0, 0)
        assert taken.completed_after_worker_lost == (0, 0)

    def test_each_worker_accepted_no_sooner_than_its_first_event(
        self, runs: list[Any], recorded: Any
    ) -> None:
        """
        Both protocols are timed, and acceptance never precedes the first event.

        Parameters
        ----------
        runs : list[Any]
            The two runs.
        recorded : Any
            The recording instruments.
        """
        from agent_runtimes.monitoring.orchestration_measures import recorded_measures

        taken = recorded_measures(recorded())

        assert set(taken.acceptance_seconds) == {"a2a", "acp"}
        assert set(taken.first_worker_event_seconds) == {"a2a", "acp"}
        for protocol, accepted in taken.acceptance_seconds.items():
            assert 0 <= taken.first_worker_event_seconds[protocol] <= accepted


class TestTheOnlyDifferenceIsTheDescriptor:
    """The claim of O0-13, made checkable."""

    def test_the_two_descriptors_differ_in_the_worker_and_where_it_answers(
        self, runs: list[Any]
    ) -> None:
        """
        And in nothing else.

        Parameters
        ----------
        runs : list[Any]
            The two runs.
        """
        left = runs[0].descriptor.model_dump()
        right = runs[1].descriptor.model_dump()
        differing = {key for key in left if left[key] != right[key]}
        assert differing == {"agent_id", "endpoints"}

    def test_the_notebook_is_read_in_exactly_one_place(self) -> None:
        """
        The workers are protocol shells over one analysis, not two analyses.

        If either worker read the notebook itself, the two runs agreeing would
        be a coincidence of two implementations rather than a result about
        orchestration — so neither may know what a cell is.
        """
        for worker in ("a2a_worker.py", "acp_worker.py"):
            source = (EXAMPLE / "workers" / worker).read_text()
            assert "from notebook_analysis import" in source
            assert "analyse(self.notebook)" in source
            for notebook_internal in ("cell_type", "outputs", "execution_count"):
                assert notebook_internal not in source


class TestBothRunsEndTheSameWay:
    """One objective, two protocols, one outcome."""

    def test_both_executions_completed(self, runs: list[Any]) -> None:
        """
        Parameters
        ----------
        runs : list[Any]
            The two runs.
        """
        assert [run.execution.status.value for run in runs] == [
            "completed",
            "completed",
        ]

    def test_both_reached_the_same_milestones_in_the_same_order(
        self, runs: list[Any]
    ) -> None:
        """
        Section 6.3's acknowledgements, which are what a caller waits on.

        Parameters
        ----------
        runs : list[Any]
            The two runs.
        """
        reached = [[item.kind.value for item in run.acknowledgements] for run in runs]
        assert reached[0] == reached[1] == ["received", "started", "completed"]

    def test_the_answers_are_byte_identical(self, runs: list[Any]) -> None:
        """
        Compared by content hash, not by headline.

        Two workers that agreed on the first line and differed underneath it
        would pass a comparison of the summaries, which is why the example
        compares what the adapters hashed.

        Parameters
        ----------
        runs : list[Any]
            The two runs.
        """
        hashes = {run.content_hash for run in runs}
        assert len(hashes) == 1
        assert hashes.pop().startswith("sha256:")

    def test_each_answer_says_what_is_actually_wrong_with_the_notebook(
        self, runs: list[Any]
    ) -> None:
        """
        The notebook has a KeyError in it, so an answer that does not name it
        is a worker that did not read it.

        Parameters
        ----------
        runs : list[Any]
            The two runs.
        """
        for run in runs:
            assert "KeyError" in run.answer
            assert "does not run clean" in run.answer


class TestWhatTheExecutionRecords:
    """What is left behind is the story of the run, not a result only."""

    def test_each_run_registered_one_artifact_with_its_provenance(
        self, runs: list[Any]
    ) -> None:
        """
        Parameters
        ----------
        runs : list[Any]
            The two runs.
        """
        for run in runs:
            assert len(run.artifacts) == 1
            artifact = run.artifacts[0]
            assert artifact.status.value == "committed"
            assert len(artifact.provenance) == 1
            # Section 5.4: an output points back at what it was made from.
            assert artifact.provenance[0].source_references == [
                "datalayer:notebook/nb-quarterly-revenue@3"
            ]

    def test_the_artifact_belongs_to_the_trees_trace(self, runs: list[Any]) -> None:
        """
        Parameters
        ----------
        runs : list[Any]
            The two runs.
        """
        for run in runs:
            assert (
                run.artifacts[0].provenance[0].trace_id
                == "4bf92f3577b34da6a3ce929d0e0e4736"
            )

    def test_each_adapter_declared_what_it_cannot_do_on_the_stream(
        self, runs: list[Any]
    ) -> None:
        """
        Decision 5's rule: the reduction is reported, not hidden.

        Parameters
        ----------
        runs : list[Any]
            The two runs.
        """
        for run in runs:
            operations = {reduction.split(":")[0] for reduction in run.reductions}
            assert {"pause", "resume", "checkpoint"} <= operations
        # And the two protocols do not reduce to the same set: A2A has no way
        # to steer a running task, ACP steers by prompting the session again.
        steers = [
            any(reduction.startswith("steer") for reduction in run.reductions)
            for run in runs
        ]
        assert steers == [True, False]

    def test_no_adapter_invented_a_state(self, runs: list[Any]) -> None:
        """
        Every state on the stream is one the canonical lifecycle allows.

        Parameters
        ----------
        runs : list[Any]
            The two runs.
        """
        from datalayer_core.orchestration import ExecutionState

        allowed = {state.value for state in ExecutionState}
        for run in runs:
            for event in run.events:
                if event.state is not None:
                    assert event.state.value in allowed

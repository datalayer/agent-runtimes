# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What orchestration is judged by, counted (PLAN_ORCHESTRATOR.md, section 16, O1-14).

Section 16 names the measures. The first six are taken here: the share of
executions that complete after the control plane lost sight of their worker,
duplicate executions and duplicate artifacts, the share that recover when the
worker itself is lost, how long a worker takes to accept delegated work, how
long until it first reports anything, and how much of the conformance suite
each binding passes.

**The store takes them, so every process that holds executions does.**
``ExecutionStore`` calls into this module from its rules — ``create``, a
milestone, the move into a terminal state, the artifact commit — and the
control plane in ai-agents, ``OrchestrationWorkflow`` in durable and the O0-13
example all go through those rules. A measure taken in one of them only would
be a number for one deployment shape.

**An execution is counted once, when it settles, with how it got there.**
Whether an execution survived a disconnect or a lost worker is not something a
counter can say at the moment of the disconnect, because the outcome is not
known yet. So the settled counter carries ``recovery``, read off the
execution's own events by ``recovery_of``: ``disconnected`` when whoever
watched the worker lost sight of it and had to ask again, ``worker_lost`` when
the execution moved because the worker no longer had the work, ``none``
otherwise. The share that completed is then one label read against another.

**Account-scoped, like every other metric.** A store opened for an account —
the Solr store of the control plane and of durable — has every point stamped
``usage_account_uid``, the attribute the OTEL service files a point under.
Without it the points would sit in the exporting service's account, where the
account whose executions they count cannot read them.

Telemetry is never a dependency: without a meter provider the instruments are
no-ops, nothing here raises into the work, and a test asks for recording
instruments and reads the points.
"""

from __future__ import annotations

import functools
import logging
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from datalayer_core.orchestration import (
    ACKNOWLEDGEMENT_ORDER,
    Acknowledgement,
    AcknowledgementKind,
    Artifact,
    ErrorCode,
    Execution,
    ExecutionEvent,
    ExecutionEventType,
    LifecycleEvent,
    instant,
)

from agent_runtimes.orchestration.store import REATTACHED

logger = logging.getLogger(__name__)

INSTRUMENTATION_NAME = "agent_runtimes.orchestration"

#: Every instrument this module writes, and the labels each carries. The OTEL
#: service's built-in orchestration dashboard is built from a copy of this,
#: held equal by its contract test, so a label renamed here fails a test there
#: rather than leaving a panel that can only ever show nothing.
CATALOGUE: dict[str, tuple[str, ...]] = {
    "orchestration.delegations": ("protocol", "outcome", "usage_account_uid"),
    "orchestration.acceptance_seconds": ("protocol", "usage_account_uid"),
    "orchestration.first_worker_event_seconds": ("protocol", "usage_account_uid"),
    "orchestration.executions.settled": (
        "protocol",
        "state",
        "recovery",
        "usage_account_uid",
    ),
    "orchestration.execution.duration": ("protocol", "state", "usage_account_uid"),
    "orchestration.artifacts": ("protocol", "outcome", "usage_account_uid"),
    "orchestration.conformance.scenarios": ("scenario", "binding", "outcome"),
}

#: ``recovery`` on a settled execution: nothing had to be recovered.
NO_RECOVERY = "none"
#: Whoever watched the worker lost sight of it and asked again.
DISCONNECTED = "disconnected"
#: The execution moved because its worker no longer had the work.
WORKER_LOST = "worker_lost"

#: The errors that say the control plane could not see its worker: a lease
#: nobody renewed, a stream that broke.
LOST_SIGHT = frozenset({ErrorCode.LEASE_EXPIRED, ErrorCode.WORKER_UNREACHABLE})

#: The milestones at or past a worker taking responsibility (section 6.3).
ACCEPTED_OR_LATER = frozenset(
    ACKNOWLEDGEMENT_ORDER[ACKNOWLEDGEMENT_ORDER.index(AcknowledgementKind.ACCEPTED) :]
)

#: What a conformance scenario came to against one binding.
PASSED = "passed"
FAILED = "failed"
#: Every test of the scenario was skipped because the binding declared it
#: cannot do what the scenario needs: a reduction, not a failure (19.8, 5).
REDUCED = "reduced"

#: From the least to the most telling: one failed test fails the scenario.
_OUTCOME_ORDER = (REDUCED, PASSED, FAILED)


class _Recording:
    """An instrument that keeps its points, for the tests."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.points: list[tuple[float, dict[str, str]]] = []

    def add(self, amount: float, attributes: dict[str, str] | None = None) -> None:
        self.points.append((amount, dict(attributes or {})))

    record = add


class _Noop:
    def __init__(self, name: str) -> None:
        self.name = name

    def add(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    record = add


def _meter() -> Any | None:
    try:
        from opentelemetry import metrics
    except Exception:  # noqa: BLE001 - telemetry is optional by design
        return None
    try:
        return metrics.get_meter(INSTRUMENTATION_NAME)
    except Exception:  # noqa: BLE001
        return None


def _instrument(
    meter: Any | None, kind: str, name: str, *, unit: str, description: str
) -> Any:
    if meter is None:
        return _Noop(name)
    try:
        make = {"counter": meter.create_counter, "histogram": meter.create_histogram}
        return make[kind](name, unit=unit, description=description)
    except Exception:  # noqa: BLE001 - an instrument that cannot be made is a no-op
        return _Noop(name)


class OrchestrationInstruments:
    """Every orchestration instrument, created once."""

    def __init__(self, *, recording: bool = False) -> None:
        meter = None if recording else _meter()

        def counter(name: str, description: str) -> Any:
            if recording:
                return _Recording(name)
            return _instrument(
                meter, "counter", name, unit="1", description=description
            )

        def histogram(name: str, description: str) -> Any:
            if recording:
                return _Recording(name)
            return _instrument(
                meter, "histogram", name, unit="s", description=description
            )

        self.delegations = counter(
            "orchestration.delegations",
            "Delegations received, by protocol and whether the command had been seen before",
        )
        self.acceptance = histogram(
            "orchestration.acceptance_seconds",
            "From an execution being created to its worker first taking responsibility for it",
        )
        self.first_worker_event = histogram(
            "orchestration.first_worker_event_seconds",
            "From an execution being created to the first milestone its worker reported",
        )
        self.settled = counter(
            "orchestration.executions.settled",
            "Executions that reached a terminal state, by protocol, state and what they recovered from",
        )
        self.duration = histogram(
            "orchestration.execution.duration",
            "From an execution being created to its terminal state",
        )
        self.artifacts = counter(
            "orchestration.artifacts",
            "Artifacts a commit settled, by whether they were committed or superseded",
        )
        self.conformance = counter(
            "orchestration.conformance.scenarios",
            "Conformance scenarios run, by scenario, binding and outcome",
        )

    def all(self) -> list[Any]:
        """
        Every instrument, for the catalogue's test.

        Returns
        -------
        list[Any]
            The instruments, each with its ``name``.
        """
        return list(vars(self).values())


_state: dict[str, Any] = {"instruments": None, "recording": False}


def configure(*, recording: bool = False) -> None:
    """
    Rebuild the instruments on next use.

    Parameters
    ----------
    recording : bool
        Keep the points in memory, for a test, instead of exporting them.
    """
    _state["recording"] = recording
    _state["instruments"] = None


def instruments() -> OrchestrationInstruments:
    """
    The instruments, made on first use.

    Made lazily rather than at import so that a process which installs its
    meter provider at startup — durable, ai-agents — has its points exported
    rather than written into the provider that existed when this was imported.

    Returns
    -------
    OrchestrationInstruments
        The instruments.
    """
    current = _state["instruments"]
    if current is None:
        current = OrchestrationInstruments(recording=bool(_state["recording"]))
        _state["instruments"] = current
    return current


def flush() -> None:
    """Send what the meter provider holds, for a process about to exit."""
    try:
        from opentelemetry import metrics

        force_flush = getattr(metrics.get_meter_provider(), "force_flush", None)
        if callable(force_flush):
            force_flush()
    except Exception as error:  # noqa: BLE001 - telemetry never fails the work
        logger.debug("The orchestration measures were not flushed: %s", error)


def _quietly(measure: Callable[..., None]) -> Callable[..., None]:
    """A measure that logs rather than raises: the work matters more."""

    @functools.wraps(measure)
    def guarded(*args: Any, **kwargs: Any) -> None:
        try:
            measure(*args, **kwargs)
        except Exception as error:  # noqa: BLE001 - a measure never fails the work
            logger.debug(
                "Orchestration measure %s not taken: %s", measure.__name__, error
            )

    return guarded


def _attributes(account_uid: str | None, **values: Any) -> dict[str, str]:
    found = {
        name: str(value) for name, value in values.items() if value not in (None, "")
    }
    if account_uid:
        found["usage_account_uid"] = account_uid
    return found


def _seconds(start: str, end: str) -> float:
    return max(0.0, (instant(end) - instant(start)).total_seconds())


def recovery_of(events: Iterable[ExecutionEvent]) -> str:
    """
    What a settled execution had to recover from, read off its events.

    The two causes section 16 keeps apart. A worker lost is an execution that
    moved because of it — retried on a new attempt, or failed with the error
    that says its worker could not be found or reached. A disconnect is the
    control plane losing sight of a worker that may well still have the work:
    a lease nobody renewed, a stream that broke, a re-attach through the
    handle the attempt recorded. An execution that saw both lost its worker,
    which is the one that decided how it ended.

    Parameters
    ----------
    events : Iterable[ExecutionEvent]
        The execution's events.

    Returns
    -------
    str
        ``worker_lost``, ``disconnected`` or ``none``.
    """
    found = NO_RECOVERY
    for event in events:
        code = event.error.code if event.error is not None else None
        if event.type is ExecutionEventType.STATE_CHANGED and (
            event.lifecycle_event is LifecycleEvent.RETRY or code in LOST_SIGHT
        ):
            return WORKER_LOST
        reattached = event.type is ExecutionEventType.PROGRESS and REATTACHED in (
            event.data or {}
        )
        if code in LOST_SIGHT or reattached:
            found = DISCONNECTED
    return found


@_quietly
def delegation_received(
    execution: Execution, *, duplicate: bool, account_uid: str | None
) -> None:
    """
    One delegation, new or a command already seen.

    Parameters
    ----------
    execution : Execution
        The execution the delegation created, or found.
    duplicate : bool
        Whether the idempotency key had already created it.
    account_uid : str | None
        The account the store is opened for.
    """
    instruments().delegations.add(
        1,
        _attributes(
            account_uid,
            protocol=execution.agent.protocol.value,
            outcome="duplicate" if duplicate else "created",
        ),
    )


@_quietly
def milestone_reached(
    execution: Execution,
    acknowledgement: Acknowledgement,
    earlier: Sequence[Acknowledgement],
    *,
    account_uid: str | None,
) -> None:
    """
    The time to a worker's first milestone and to its acceptance, once each.

    Both are measured from the execution's creation, which is the moment the
    delegating command was received: what a person who delegated waits
    through, queue and dispatch included. The first worker event is the first
    milestone reported on an attempt — the endpoint taking the message, a
    session answering — and acceptance the first at or past ``accepted``. A
    milestone delivered twice is measured the first time only.

    Parameters
    ----------
    execution : Execution
        The execution that reached it.
    acknowledgement : Acknowledgement
        The milestone.
    earlier : Sequence[Acknowledgement]
        The milestones stored before this one.
    account_uid : str | None
        The account the store is opened for.
    """
    attributes = _attributes(account_uid, protocol=execution.agent.protocol.value)
    elapsed = _seconds(execution.created_at, acknowledgement.acknowledged_at)
    if acknowledgement.attempt_id and not any(known.attempt_id for known in earlier):
        instruments().first_worker_event.record(elapsed, attributes)
    if acknowledgement.kind in ACCEPTED_OR_LATER and not any(
        known.kind in ACCEPTED_OR_LATER for known in earlier
    ):
        instruments().acceptance.record(elapsed, attributes)


@_quietly
def execution_settled(
    execution: Execution,
    events: Sequence[ExecutionEvent],
    *,
    account_uid: str | None,
) -> None:
    """
    One execution in its terminal state, with what it recovered from.

    Parameters
    ----------
    execution : Execution
        The execution, moved.
    events : Sequence[ExecutionEvent]
        Its events, the terminal move included.
    account_uid : str | None
        The account the store is opened for.
    """
    attributes = _attributes(
        account_uid,
        protocol=execution.agent.protocol.value,
        state=execution.status.value,
    )
    instruments().settled.add(1, {**attributes, "recovery": recovery_of(events)})
    instruments().duration.record(
        _seconds(execution.created_at, execution.updated_at), attributes
    )


@_quietly
def artifacts_committed(
    execution: Execution, artifacts: Sequence[Artifact], *, account_uid: str | None
) -> None:
    """
    The artifacts one commit settled: committed, or superseded by another's.

    Parameters
    ----------
    execution : Execution
        The execution they belong to.
    artifacts : Sequence[Artifact]
        The artifacts the commit changed.
    account_uid : str | None
        The account the store is opened for.
    """
    for artifact in artifacts:
        instruments().artifacts.add(
            1,
            _attributes(
                account_uid,
                protocol=execution.agent.protocol.value,
                outcome=artifact.status.value,
            ),
        )


@_quietly
def conformance_scenario(*, scenario: str, binding: str, outcome: str) -> None:
    """
    What one section 13 scenario came to against one binding.

    Parameters
    ----------
    scenario : str
        The scenario, in words joined by underscores.
    binding : str
        The binding it ran against.
    outcome : str
        ``passed``, ``failed`` or ``reduced``.
    """
    instruments().conformance.add(
        1, _attributes(None, scenario=scenario, binding=binding, outcome=outcome)
    )


def worse_outcome(previous: str | None, outcome: str) -> str:
    """
    The outcome of a scenario once one more of its tests has reported.

    Parameters
    ----------
    previous : str | None
        What the scenario had come to so far.
    outcome : str
        What the test that just reported came to.

    Returns
    -------
    str
        The more telling of the two: a failure over a pass over a reduction.
    """
    if previous is None:
        return outcome
    return max(previous, outcome, key=_OUTCOME_ORDER.index)


@dataclass(frozen=True)
class ConformanceTally:
    """The scenarios one binding passed, failed and could not run."""

    passed: int = 0
    failed: int = 0
    reduced: int = 0

    @property
    def run(self) -> int:
        """
        The scenarios the binding could run.

        Returns
        -------
        int
            Passed and failed together; a reduction is not a run.
        """
        return self.passed + self.failed

    @property
    def rate(self) -> float | None:
        """
        The share of the scenarios it ran that passed.

        Returns
        -------
        float | None
            The rate, or ``None`` when it ran none.
        """
        return self.passed / self.run if self.run else None


def conformance_rate(
    outcomes: Mapping[tuple[str, str], str],
) -> dict[str, ConformanceTally]:
    """
    Section 16's cross-framework conformance rate, per binding.

    Parameters
    ----------
    outcomes : Mapping[tuple[str, str], str]
        What each ``(scenario, binding)`` came to.

    Returns
    -------
    dict[str, ConformanceTally]
        Each binding's tally, by binding name.
    """
    counts: dict[str, dict[str, int]] = {}
    for (_, binding), outcome in outcomes.items():
        tally = counts.setdefault(binding, {PASSED: 0, FAILED: 0, REDUCED: 0})
        tally[outcome] += 1
    return {
        binding: ConformanceTally(
            passed=tally[PASSED], failed=tally[FAILED], reduced=tally[REDUCED]
        )
        for binding, tally in sorted(counts.items())
    }


@dataclass(frozen=True)
class RecordedMeasures:
    """
    The measures of the executions this process recorded, from its own points.

    What the OTEL service's orchestration dashboard reads from exported points,
    read instead from the points recording instruments kept: for a run whose
    points never leave the process, such as the O0-13 example. Each share is
    ``(part, of)``.
    """

    completed_after_disconnect: tuple[int, int]
    completed_after_worker_lost: tuple[int, int]
    duplicate_delegations: tuple[int, int]
    superseded_artifacts: tuple[int, int]
    acceptance_seconds: dict[str, float]
    first_worker_event_seconds: dict[str, float]


def _kept(instrument: Any) -> list[tuple[float, dict[str, str]]]:
    points = getattr(instrument, "points", None)
    if points is None:
        raise TypeError(
            f"{instrument.name} keeps no points: call configure(recording=True) "
            "before the work is done."
        )
    return list(points)


def _part_of(
    points: list[tuple[float, dict[str, str]]],
    *,
    label: str,
    value: str,
    where: Mapping[str, str] | None = None,
) -> tuple[int, int]:
    counted = [
        (amount, attributes)
        for amount, attributes in points
        if all(attributes.get(name) == kept for name, kept in (where or {}).items())
    ]
    part = sum(
        amount for amount, attributes in counted if attributes.get(label) == value
    )
    return int(part), int(sum(amount for amount, _ in counted))


def _mean_by_protocol(points: list[tuple[float, dict[str, str]]]) -> dict[str, float]:
    grouped: dict[str, list[float]] = {}
    for amount, attributes in points:
        grouped.setdefault(attributes.get("protocol", ""), []).append(amount)
    return {
        protocol: sum(values) / len(values)
        for protocol, values in sorted(grouped.items())
    }


def recorded_measures(recorded: OrchestrationInstruments) -> RecordedMeasures:
    """
    The six measures of what this process recorded, but the conformance rate.

    The conformance rate belongs to the suite, which prints it; an example
    or a service never runs the scenarios.

    Parameters
    ----------
    recorded : OrchestrationInstruments
        Instruments made with ``configure(recording=True)``.

    Returns
    -------
    RecordedMeasures
        The measures.

    Raises
    ------
    TypeError
        When the instruments export rather than keep their points.
    """
    settled = _kept(recorded.settled)
    return RecordedMeasures(
        completed_after_disconnect=_part_of(
            settled, label="state", value="completed", where={"recovery": DISCONNECTED}
        ),
        completed_after_worker_lost=_part_of(
            settled, label="state", value="completed", where={"recovery": WORKER_LOST}
        ),
        duplicate_delegations=_part_of(
            _kept(recorded.delegations), label="outcome", value="duplicate"
        ),
        superseded_artifacts=_part_of(
            _kept(recorded.artifacts), label="outcome", value="superseded"
        ),
        acceptance_seconds=_mean_by_protocol(_kept(recorded.acceptance)),
        first_worker_event_seconds=_mean_by_protocol(
            _kept(recorded.first_worker_event)
        ),
    )

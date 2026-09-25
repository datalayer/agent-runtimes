# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""One trace across the tree (PLAN_ORCHESTRATOR.md, section 10, O0-11).

A two-level delegation has to read as one trace: the parent's span, the
child's span under it, one span per attempt below that, and every canonical
event on whichever of those was current. The identifiers of section 10 are
what make a span placeable afterwards, and they are read off the event the
store already stamped rather than computed a second time.

The other half is what happens when the trace is not carried. A worker that
drops the header must show as a broken link — a span with no parent that
still names the tree it belongs to — and never as a second trace, and a
process with no span at all must send no ``traceparent`` rather than a
plausible-looking one nothing else knows.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_orchestration_tracing.py -v
```
"""

from __future__ import annotations

import base64
import json
from contextlib import contextmanager
from typing import Any, Iterator

import pytest
from datalayer_core.orchestration import (
    AgentBinding,
    AgentProtocol,
    ExecutionsDelegate,
    LifecycleEvent,
    Objective,
    Trace,
    WorkerOperation,
)
from opentelemetry import trace as otel_trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from agent_runtimes.context.identities import (
    clear_request_user_jwt,
    set_request_user_jwt,
)
from agent_runtimes.monitoring import otel as tracing
from agent_runtimes.monitoring.otel import (
    ACCOUNT_ATTRIBUTE,
    ATTEMPT_SPAN,
    CORRELATION_ATTRIBUTES,
    EXECUTION_SPAN,
    attempt_span,
    command_with_trace,
    correlation_of,
    current_trace,
    execution_span,
    instrument_worker_transports,
    restored,
)
from agent_runtimes.orchestration import InMemoryExecutionStore
from agent_runtimes.orchestration.adapter import Observation
from agent_runtimes.tests.orchestration_records import (
    TRACEPARENT,
    an_attempt,
    an_execution,
)

#: The trace every execution in these tests was delegated under, read off
#: the shared record rather than written out a second time.
TREE_TRACE_ID = TRACEPARENT.split("-")[1]


@contextmanager
def _recording(monkeypatch: pytest.MonkeyPatch) -> Iterator[InMemorySpanExporter]:
    """
    Collect spans, without touching the process-wide tracer provider.

    ``set_tracer_provider`` refuses a second call, so a test that used it
    would work once and then silently collect nothing for every test after
    it. Patching the lookup gives each test its own exporter.

    Parameters
    ----------
    monkeypatch : pytest.MonkeyPatch
        The patcher.

    Yields
    ------
    InMemorySpanExporter
        Where the finished spans arrive.
    """
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(otel_trace, "get_tracer_provider", lambda: provider)
    try:
        yield exporter
    finally:
        # The httpx patch is global and this module's flag remembers it, so
        # a test that triggered it must put both back or the next test in
        # the session inherits an instrumented client it never asked for.
        if tracing._worker_transports_instrumented:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

            HTTPXClientInstrumentor().uninstrument()
            tracing._worker_transports_instrumented = False


def _spans(exporter: InMemorySpanExporter, name: str) -> list[Any]:
    """
    The finished spans of one name.

    Parameters
    ----------
    exporter : InMemorySpanExporter
        Where the spans arrived.
    name : str
        The span name to look for.

    Returns
    -------
    list[Any]
        The matching spans, in the order they finished.
    """
    return [span for span in exporter.get_finished_spans() if span.name == name]


def _hex(span_id: int, width: int = 16) -> str:
    """
    An identifier as the wire spells it.

    Parameters
    ----------
    span_id : int
        The trace or span identifier.
    width : int
        16 for a span id, 32 for a trace id.

    Returns
    -------
    str
        The identifier in lower-case hex.
    """
    return format(span_id, f"0{width}x")


def _jwt(user_uid: str) -> str:
    """
    A JWT naming an account, which is all the account stamp reads.

    Parameters
    ----------
    user_uid : str
        Whose work the spans are.

    Returns
    -------
    str
        A three-segment token; nothing here verifies a signature.
    """
    payload = base64.urlsafe_b64encode(
        json.dumps({"user": {"uid": user_uid}}).encode("utf-8")
    ).decode("utf-8")
    return f"header.{payload.rstrip('=')}.signature"


# ---------------------------------------------------------------------------
# The tree, as one trace
# ---------------------------------------------------------------------------


class TestTheTree:
    def test_an_execution_span_carries_section_tens_identifiers(self, monkeypatch):
        execution = an_execution()
        with _recording(monkeypatch) as exporter:
            with execution_span(execution):
                pass

        (span,) = _spans(exporter, EXECUTION_SPAN)
        assert span.attributes["orchestration.execution_id"] == "exec_1"
        assert span.attributes["orchestration.root_execution_id"] == "exec_1"
        assert span.attributes["orchestration.agent_id"] == "notebook-validator"
        assert span.attributes["orchestration.protocol"] == "a2a"

    def test_a_child_with_a_session_carries_all_seven(self, monkeypatch):
        """Section 10 asks for seven, and a child mid-dispatch knows them all.

        Asserting against the declared tuple rather than a list written out
        here is what makes an identifier added to section 10 fail this test
        instead of quietly never being emitted.
        """
        parent = an_execution(execution_id="exec_parent")
        child = an_execution(
            execution_id="exec_child",
            parent_execution_id=parent.execution_id,
            root_execution_id=parent.root_execution_id,
        )
        child = child.model_copy(
            update={"agent": child.agent.model_copy(update={"session_id": "sess-1"})}
        )
        with _recording(monkeypatch) as exporter:
            with attempt_span(
                child, an_attempt(child), operation=WorkerOperation.DELEGATE
            ):
                pass

        (span,) = _spans(exporter, ATTEMPT_SPAN)
        assert set(CORRELATION_ATTRIBUTES) <= set(span.attributes)

    def test_an_identifier_nothing_knows_is_absent_not_empty(self, monkeypatch):
        """A root has no parent, and an empty attribute reads as one looked
        up and found to be nothing."""
        with _recording(monkeypatch) as exporter:
            with execution_span(an_execution()):
                pass

        (span,) = _spans(exporter, EXECUTION_SPAN)
        assert "orchestration.parent_execution_id" not in span.attributes

    def test_the_attempt_span_is_inside_the_executions(self, monkeypatch):
        execution = an_execution()
        attempt = an_attempt(execution)
        with _recording(monkeypatch) as exporter:
            with execution_span(execution):
                with attempt_span(
                    execution, attempt, operation=WorkerOperation.DELEGATE
                ):
                    pass

        (attempt_span_out,) = _spans(exporter, ATTEMPT_SPAN)
        (execution_span_out,) = _spans(exporter, EXECUTION_SPAN)
        assert attempt_span_out.parent.span_id == execution_span_out.context.span_id
        assert attempt_span_out.context.trace_id == execution_span_out.context.trace_id
        assert attempt_span_out.attributes["orchestration.attempt_id"] == "att_1"

    @pytest.mark.asyncio
    async def test_a_two_level_delegation_is_one_trace(self, monkeypatch):
        """The item's own acceptance test, in miniature.

        The child is stamped with the parent's context, so restoring it puts
        the child's span under the parent's rather than at the root of a
        trace of its own.
        """
        parent = an_execution(execution_id="exec_parent")
        with _recording(monkeypatch) as exporter:
            with execution_span(parent):
                child = an_execution(
                    execution_id="exec_child",
                    parent_execution_id=parent.execution_id,
                    root_execution_id=parent.root_execution_id,
                ).model_copy(update={"trace": current_trace()})
            with execution_span(child):
                pass

        by_execution = {
            span.attributes["orchestration.execution_id"]: span
            for span in _spans(exporter, EXECUTION_SPAN)
        }
        assert (
            by_execution["exec_child"].context.trace_id
            == by_execution["exec_parent"].context.trace_id
        )
        assert (
            by_execution["exec_child"].parent.span_id
            == by_execution["exec_parent"].context.span_id
        )

    def test_the_account_is_stamped_so_the_spans_are_the_persons(self, monkeypatch):
        """Without it a span is filed under whichever service exported it."""
        set_request_user_jwt(_jwt("urn:dla:iam:ext::github:123"))
        try:
            with _recording(monkeypatch) as exporter:
                with execution_span(an_execution()):
                    pass
        finally:
            clear_request_user_jwt()

        (span,) = _spans(exporter, EXECUTION_SPAN)
        assert span.attributes[ACCOUNT_ATTRIBUTE] == "urn:dla:iam:ext::github:123"

    def test_no_account_in_scope_stamps_nothing_rather_than_guessing(self, monkeypatch):
        clear_request_user_jwt()
        with _recording(monkeypatch) as exporter:
            with execution_span(an_execution()):
                pass

        (span,) = _spans(exporter, EXECUTION_SPAN)
        assert ACCOUNT_ATTRIBUTE not in span.attributes


# ---------------------------------------------------------------------------
# Restoring the trace on a worker
# ---------------------------------------------------------------------------


class TestRestoring:
    def test_an_execution_rejoins_the_trace_it_was_delegated_under(self, monkeypatch):
        """A durable step starts with nothing but the execution record."""
        with _recording(monkeypatch) as exporter:
            with execution_span(an_execution()):
                pass

        (span,) = _spans(exporter, EXECUTION_SPAN)
        assert _hex(span.context.trace_id, 32) == TREE_TRACE_ID

    def test_a_process_already_on_the_trace_is_not_re_parented(self, monkeypatch):
        """Re-attaching the execution's own context inside its span would
        make the attempt a sibling of the execution rather than its child,
        and the level in between would disappear."""
        execution = an_execution()
        with _recording(monkeypatch) as exporter:
            with execution_span(execution):
                with attempt_span(
                    execution, an_attempt(execution), operation=WorkerOperation.DELEGATE
                ):
                    pass

        (attempt_out,) = _spans(exporter, ATTEMPT_SPAN)
        (execution_out,) = _spans(exporter, EXECUTION_SPAN)
        assert attempt_out.parent.span_id == execution_out.context.span_id

    def test_an_execution_with_no_traceparent_is_a_findable_broken_link(
        self, monkeypatch
    ):
        """A worker that drops the header must not become a second trace.

        The span it produces has no parent — that is the broken link — but
        it still names the tree, so the piece that fell off is findable
        rather than merely absent.
        """
        orphan = an_execution(execution_id="exec_child").model_copy(
            update={"trace": Trace()}
        )
        with _recording(monkeypatch) as exporter:
            with execution_span(orphan):
                pass

        (span,) = _spans(exporter, EXECUTION_SPAN)
        assert span.parent is None
        assert _hex(span.context.trace_id, 32) != TREE_TRACE_ID
        assert span.attributes["orchestration.root_execution_id"] == "exec_child"

    def test_restoring_nothing_does_nothing(self, monkeypatch):
        with _recording(monkeypatch):
            with restored(None):
                assert not otel_trace.get_current_span().get_span_context().is_valid


# ---------------------------------------------------------------------------
# The trace agrees with the store rather than restating it
# ---------------------------------------------------------------------------


class TestTheEvents:
    @pytest.mark.asyncio
    async def test_every_event_the_store_appends_lands_on_the_span(self, monkeypatch):
        store = InMemoryExecutionStore()
        with _recording(monkeypatch) as exporter:
            execution = await store.create(an_execution())
            with execution_span(execution):
                await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)
                await store.set_state(execution.execution_id, LifecycleEvent.START)

        (span,) = _spans(exporter, EXECUTION_SPAN)
        assert [event.name for event in span.events] == [
            "execution.state_changed",
            "execution.state_changed",
        ]
        assert span.events[-1].attributes["orchestration.state"] == "running"
        assert span.events[-1].attributes["orchestration.previous_state"] == "assigned"

    @pytest.mark.asyncio
    async def test_the_span_event_carries_what_the_store_stamped(self, monkeypatch):
        """Not a second computation of the correlation: the same one."""
        store = InMemoryExecutionStore()
        with _recording(monkeypatch) as exporter:
            execution = await store.create(an_execution())
            attempt = await store.record_attempt(an_attempt(execution))
            with execution_span(execution):
                await store.record(
                    execution.execution_id,
                    Observation.progress("Running the notebook."),
                    attempt_id=attempt.attempt_id,
                )

        (span,) = _spans(exporter, EXECUTION_SPAN)
        (progress,) = [
            event for event in span.events if event.name == "execution.progress"
        ]
        (stored,) = [
            event
            for event in await store.events(execution.execution_id)
            if event.type.value == "execution.progress"
        ]
        assert dict(progress.attributes) | correlation_of(stored) == dict(
            progress.attributes
        )
        assert progress.attributes["orchestration.sequence"] == stored.sequence

    @pytest.mark.asyncio
    async def test_an_event_recorded_during_a_dispatch_lands_on_the_attempt(
        self, monkeypatch
    ):
        """The attempt span stays current across the dispatch's yields, so
        the caller's own recording lands where the work did."""
        execution = an_execution()
        attempt = an_attempt(execution)
        store = InMemoryExecutionStore()
        with _recording(monkeypatch) as exporter:
            await store.create(execution)
            await store.record_attempt(attempt)
            with attempt_span(execution, attempt, operation=WorkerOperation.DELEGATE):
                await store.record(
                    execution.execution_id,
                    Observation.progress("Calling 'execute_cell'."),
                    attempt_id=attempt.attempt_id,
                )

        (span,) = _spans(exporter, ATTEMPT_SPAN)
        assert [event.name for event in span.events] == ["execution.progress"]

    @pytest.mark.asyncio
    async def test_the_store_works_with_nothing_collecting(self):
        """Telemetry never fails the work it was describing."""
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution())

        moved = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

        assert moved.status.value == "assigned"


# ---------------------------------------------------------------------------
# What goes out on the wire
# ---------------------------------------------------------------------------


class TestOnTheWire:
    def test_a_command_carries_the_trace_it_belongs_to(self, monkeypatch):
        with _recording(monkeypatch):
            with execution_span(an_execution()):
                stamped = command_with_trace(_a_delegation())

        assert stamped.traceparent is not None
        assert TREE_TRACE_ID in stamped.traceparent

    def test_a_command_that_already_names_a_context_keeps_it(self, monkeypatch):
        """Something upstream decided what this continues."""
        with _recording(monkeypatch):
            with execution_span(an_execution()):
                stamped = command_with_trace(
                    _a_delegation().model_copy(update={"traceparent": "00-a-b-01"})
                )

        assert stamped.traceparent == "00-a-b-01"

    def test_outside_a_trace_a_command_carries_none_rather_than_a_made_up_one(self):
        """An invented traceparent is an orphan that looks exactly real."""
        assert command_with_trace(_a_delegation()).traceparent is None
        assert current_trace().traceparent is None

    def test_the_worker_transports_carry_the_trace_out(self, monkeypatch):
        """The A2A relay builds its own httpx client with no header seam, so
        the trace reaches a remote worker by patching the library rather
        than by reaching into a client this code does not own."""
        with _recording(monkeypatch):
            with attempt_span(
                an_execution(),
                an_attempt(an_execution()),
                operation=WorkerOperation.DELEGATE,
            ):
                assert tracing._worker_transports_instrumented

    def test_nothing_is_patched_when_nothing_is_collecting(self):
        """A patch with no story attached is a cost with no benefit."""
        assert not tracing._worker_transports_instrumented
        with attempt_span(
            an_execution(),
            an_attempt(an_execution()),
            operation=WorkerOperation.DELEGATE,
        ):
            pass
        assert not tracing._worker_transports_instrumented

    def test_instrumenting_twice_is_not_two_patches(self, monkeypatch):
        with _recording(monkeypatch):
            assert instrument_worker_transports()
            assert instrument_worker_transports()

    def test_the_transport_the_relay_will_use_is_the_one_that_carries_it(
        self, monkeypatch
    ):
        """Which is the whole reason the patch exists.

        The A2A relay opens its own ``httpx`` client and takes no headers
        from the adapter, so the only way the worker is told which trace it
        is part of is for the transport under that client to be carrying it
        already. What is asserted is that the transport is wrapped, not that
        a request went out: reaching a socket would be testing ``httpx``.
        """
        import httpx

        with _recording(monkeypatch):
            with attempt_span(
                an_execution(),
                an_attempt(an_execution()),
                operation=WorkerOperation.DELEGATE,
            ):
                carried = hasattr(
                    httpx.AsyncHTTPTransport.handle_async_request, "__wrapped__"
                )

        assert carried
        # And put back afterwards, so a process that never asked for
        # telemetry is not left with an instrumented client.
        assert not hasattr(httpx.AsyncHTTPTransport.handle_async_request, "__wrapped__")


def _a_delegation() -> ExecutionsDelegate:
    """
    One ``executions.delegate``, for the commands that must carry a trace.

    Returns
    -------
    ExecutionsDelegate
        The command.
    """
    return ExecutionsDelegate(
        idempotency_key="idem-1",
        agent=AgentBinding(
            agent_id="notebook-validator",
            capability="notebook.validate",
            protocol=AgentProtocol.A2A,
        ),
        objective=Objective(goal="Validate the notebook from a clean sandbox"),
    )

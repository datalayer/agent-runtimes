# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""OTEL capability hooks for pydantic-ai lifecycle events, and the
orchestration trace (PLAN_ORCHESTRATOR.md, section 10, O0-11).

Two things share this module because they share one telemetry path. The
capability hooks below emit an agent run's counters and histograms through
``OTelEmitter``; the orchestration half emits the spans that make one
execution tree one trace. Both resolve the account the same way — from the
request's own JWT — because spans and metrics that landed under different
accounts would be two stories about the same work.

What the orchestration half is for, in section 10's words: one trace across
the complete execution tree, carrying root, parent, execution, attempt,
agent, session and protocol identifiers. There is a span per execution and a
span per attempt, and every canonical event the store appends is added to
whichever of those is current.

Three rules it keeps, and they are the whole design:

**The trace agrees with the store; it does not restate it.** The store
stamps the correlation onto an ``ExecutionEvent`` in ``record`` (O0-04), and
``correlation_of`` reads it back off that envelope. Nothing here recomputes a
root or a parent from an execution, because two computations of the same
identifier are two identifiers waiting to disagree.

**No trace, no header, and never an invented one.** A fabricated
``traceparent`` produces a trace id nothing else knows: an orphan that looks
exactly like a real trace and joins to nothing.
``agent_runtimes.mcp.tracing`` already says this and already injects the
current context into outgoing headers, so this module calls that rather than
growing a second injector.

**A worker that drops the header is a broken link, not a second trace.**
That is what the correlation attributes are for: a span with no parent still
carries ``orchestration.root_execution_id``, so the piece that fell off the
trace is findable rather than merely absent.

Who opens which span. The attempt span belongs to the adapter, because an
attempt is exactly one dispatch and the adapter is what performs it. The
execution span belongs to whoever owns the execution's lifetime, which from
Phase 1 is ``OrchestrationWorkflow`` (O1-03) and in Phase 0 is the
conformance harness; a store that opened it would be opening a span it
cannot close, since ``create`` returns long before the work does.
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Iterator, TypeVar

from datalayer_core.orchestration import (
    Attempt,
    Command,
    Execution,
    ExecutionEvent,
    Trace,
    WorkerOperation,
)
from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.mcp.tracing import trace_headers

try:
    from datalayer_core.otel.emitter import OTelEmitter
except Exception:  # pragma: no cover - optional dependency at runtime
    OTelEmitter = None  # type: ignore[assignment,unused-ignore]

logger = logging.getLogger(__name__)


@dataclass
class OTelHooksCapability(AbstractCapability[Any]):
    """Emit run and tool telemetry through a generic OTEL emitter."""

    service_name: str = "agent-runtimes"
    enabled: bool = True
    emit_prompt_preview: bool = False
    _emitters: dict[str, Any] = field(default_factory=dict, init=False, repr=False)
    _run_started_at: float = field(default=0.0, init=False, repr=False)
    _tool_started_at: dict[str, float] = field(
        default_factory=dict, init=False, repr=False
    )

    def _get_emitter(self) -> Any:
        if not self.enabled or OTelEmitter is None:
            return None
        # Resolve user_uid from the request-scoped JWT set by the transport.
        # Through the same helper the orchestration spans use, so a run's
        # metrics and its spans cannot land under two different accounts.
        user_jwt, user_uid = request_account()
        cache_key = user_uid or "_anon"
        emitter = self._emitters.get(cache_key)
        if emitter is not None:
            return emitter
        if not user_uid:
            logger.debug(
                "OTelHooksCapability: no user_uid from request JWT, skipping emitter creation"
            )
            return None
        emitter = OTelEmitter(
            service_name=self.service_name, user_uid=user_uid, token=user_jwt
        )
        self._emitters[cache_key] = emitter
        return emitter

    async def before_run(self, ctx: RunContext[Any]) -> None:
        self._run_started_at = time.perf_counter()
        emitter = self._get_emitter()
        if emitter is None:
            return
        attrs = {
            "agent.model": str(getattr(ctx.model, "model_id", "unknown")),
        }
        if self.emit_prompt_preview and getattr(ctx, "prompt", None):
            attrs["agent.prompt.preview"] = str(ctx.prompt)[:200]
        emitter.add_counter("agent_runtimes.capability.run.started", 1, attrs)

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        emitter = self._get_emitter()
        if emitter is None:
            return result
        usage = ctx.usage
        duration_ms = (time.perf_counter() - self._run_started_at) * 1000
        attrs = {
            "agent.model": str(getattr(ctx.model, "model_id", "unknown")),
        }
        emitter.add_counter("agent_runtimes.capability.run.completed", 1, attrs)
        emitter.add_histogram(
            "agent_runtimes.capability.run.duration_ms", duration_ms, attrs
        )
        emitter.add_counter(
            "agent_runtimes.capability.tokens.input",
            int(getattr(usage, "input_tokens", 0) or 0),
            attrs,
        )
        emitter.add_counter(
            "agent_runtimes.capability.tokens.output",
            int(getattr(usage, "output_tokens", 0) or 0),
            attrs,
        )
        return result

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        emitter = self._get_emitter()
        if emitter is None:
            return args
        self._tool_started_at[call.tool_call_id] = time.perf_counter()
        attrs = {"tool.name": call.tool_name}
        emitter.add_counter("agent_runtimes.capability.tool.started", 1, attrs)
        return args

    async def after_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        result: Any,
    ) -> Any:
        emitter = self._get_emitter()
        if emitter is None:
            return result
        attrs = {"tool.name": call.tool_name}
        started_at = self._tool_started_at.pop(call.tool_call_id, None)
        emitter.add_counter("agent_runtimes.capability.tool.completed", 1, attrs)
        if started_at is not None:
            duration_ms = (time.perf_counter() - started_at) * 1000
            emitter.add_histogram(
                "agent_runtimes.capability.tool.duration_ms",
                duration_ms,
                attrs,
            )
        return result

    async def on_tool_execute_error(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        error: Exception,
    ) -> Exception:
        emitter = self._get_emitter()
        if emitter is None:
            return error
        attrs = {
            "tool.name": call.tool_name,
            "error.type": type(error).__name__,
        }
        emitter.add_counter("agent_runtimes.capability.tool.errors", 1, attrs)
        return error


# ---------------------------------------------------------------------------
# One trace across the execution tree (section 10, O0-11)
# ---------------------------------------------------------------------------

#: The service the orchestration spans are emitted under. The adapters and
#: the durable worker both run inside agent-runtimes, so one name keeps the
#: tree's spans together rather than splitting them by which module opened
#: them.
ORCHESTRATION_SERVICE = "agent-runtimes"

#: The span an execution gets, and the span one dispatch of it gets.
EXECUTION_SPAN = "orchestration.execution"
ATTEMPT_SPAN = "orchestration.attempt"

#: Section 10's correlation identifiers, in its order. They live under
#: ``orchestration.`` rather than reusing the ``agent.id`` and ``session.id``
#: the agent tracer already emits, because an orchestration ``agentId`` is a
#: descriptor and a ``sessionId`` is a protocol handle: joining them to a
#: pydantic-ai run would be joining two different things that share a word.
CORRELATION_ATTRIBUTES: tuple[str, ...] = (
    "orchestration.root_execution_id",
    "orchestration.parent_execution_id",
    "orchestration.execution_id",
    "orchestration.attempt_id",
    "orchestration.agent_id",
    "orchestration.session_id",
    "orchestration.protocol",
)

#: The account attribute the platform files telemetry under. Spans land
#: under the exporting service's account unless they say whose work they
#: were, which is why it is stamped on every orchestration span.
ACCOUNT_ATTRIBUTE = "datalayer.user_uid"

CommandT = TypeVar("CommandT", bound=Command)

#: Whether the protocol clients have been patched to carry the trace out.
#: Module state because the patch is global and applying it twice warns.
_worker_transports_instrumented = False


def request_account() -> tuple[str | None, str | None]:
    """
    Whose work this is, from the request-scoped JWT the transport set.

    The one place the account is resolved in this module. The capability
    hooks need the token as well, to authenticate the export; the spans need
    only the account, to be filed under it.

    Returns
    -------
    tuple[str | None, str | None]
        The request's JWT and the account it names, either of which may be
        ``None`` when nothing in scope says whose work this is.
    """
    from ..context.identities import get_request_user_jwt
    from ..otel.prompt_turn_metrics import decode_user_uid

    user_jwt = get_request_user_jwt()
    return user_jwt, decode_user_uid(user_jwt) if user_jwt else None


def account_attributes() -> dict[str, str]:
    """
    The account stamp, when the account is known.

    Without it a span is filed under whichever service exported it, so a
    person looking for their own orchestration finds the platform's instead.

    Returns
    -------
    dict[str, str]
        The stamp, or nothing rather than a guess at whose work it was.
    """
    _, user_uid = request_account()
    return {ACCOUNT_ATTRIBUTE: user_uid} if user_uid else {}


def correlation_of(event: ExecutionEvent) -> dict[str, str]:
    """
    Section 10's identifiers, read off the event the store already stamped.

    Parameters
    ----------
    event : ExecutionEvent
        The canonical event, correlated in ``ExecutionStore.record``.

    Returns
    -------
    dict[str, str]
        The identifiers the event carries; the ones it does not know are
        absent rather than empty, because an empty attribute reads as an
        identifier that was looked up and found to be nothing.
    """
    found = {
        "orchestration.root_execution_id": event.root_execution_id,
        "orchestration.parent_execution_id": event.parent_execution_id,
        "orchestration.execution_id": event.execution_id,
        "orchestration.attempt_id": event.attempt_id,
        "orchestration.agent_id": event.agent_id,
        "orchestration.session_id": event.session_id,
        "orchestration.protocol": event.protocol.value if event.protocol else None,
    }
    return {name: value for name, value in found.items() if value}


def correlation_of_execution(
    execution: Execution, attempt_id: str | None = None
) -> dict[str, str]:
    """
    The same identifiers for a span, which is opened before any event exists.

    Parameters
    ----------
    execution : Execution
        The execution the span is about.
    attempt_id : str | None
        The attempt, on an attempt span.

    Returns
    -------
    dict[str, str]
        The identifiers, the unknown ones absent.
    """
    found = {
        "orchestration.root_execution_id": execution.root_execution_id,
        "orchestration.parent_execution_id": execution.parent_execution_id,
        "orchestration.execution_id": execution.execution_id,
        "orchestration.attempt_id": attempt_id or execution.current_attempt_id,
        "orchestration.agent_id": execution.agent.agent_id,
        "orchestration.session_id": execution.agent.session_id,
        "orchestration.protocol": execution.agent.protocol.value,
    }
    return {name: value for name, value in found.items() if value}


def current_trace() -> Trace:
    """
    The current trace context as the canonical record, or an empty one.

    What a child execution and an outgoing command are stamped with. It is
    empty outside a span, which is the point: a made-up ``traceparent`` is an
    orphan trace that looks real and joins to nothing.

    Returns
    -------
    Trace
        The context, or a ``Trace`` carrying nothing.
    """
    headers = trace_headers()
    return Trace(
        traceparent=headers.get("traceparent"), tracestate=headers.get("tracestate")
    )


def command_with_trace(command: CommandT) -> CommandT:
    """
    The command, carrying the trace it belongs to (section 10, 6.2).

    Every command is stamped, mutating or not, because a read that is part
    of a tree's story belongs in the tree's trace too. A command that
    already names a context keeps it: something upstream decided what this
    continues, and overwriting it breaks the chain being preserved.

    Parameters
    ----------
    command : CommandT
        The command about to be sent.

    Returns
    -------
    CommandT
        The command, with ``traceparent`` filled in when there was one to fill.
    """
    if command.traceparent:
        return command
    traceparent = current_trace().traceparent
    if not traceparent:
        return command
    return command.model_copy(update={"traceparent": traceparent})


@contextmanager
def restored(trace: Trace | None) -> Iterator[None]:
    """
    Continue the tree's trace, when this process is not already on it.

    This is the "restored on every worker" half of O0-11. A durable step, a
    re-attach after a pod roll and a worker picking work off a queue all
    start with nothing but the execution record, and the ``traceparent`` on
    it is what puts their spans back under the delegation that caused them.

    It does nothing when a recording span is already current, because the
    caller is then already inside the tree: re-attaching the execution's own
    context there would re-parent the work to the tree's caller and lose the
    level in between.

    Parameters
    ----------
    trace : Trace | None
        The context carried on the execution or the command.

    Yields
    ------
    None
        For the duration of the restored context.
    """
    traceparent = trace.traceparent if trace else None
    if not traceparent or _recording():
        yield
        return
    try:
        from opentelemetry import context as otel_context
        from opentelemetry.propagate import extract
    except Exception:  # noqa: BLE001 - telemetry is optional
        yield
        return
    carrier = {"traceparent": traceparent}
    if trace and trace.tracestate:
        carrier["tracestate"] = trace.tracestate
    token = otel_context.attach(extract(carrier))
    try:
        yield
    finally:
        otel_context.detach(token)


@contextmanager
def execution_span(execution: Execution) -> Iterator[Any]:
    """
    The span one execution's life happens inside (section 10).

    Opened by whoever owns that life: ``OrchestrationWorkflow`` from Phase 1
    (O1-03), the conformance harness before it. The execution's own
    ``traceparent`` is restored first, so a delegation dispatched in a fresh
    step lands under the parent that asked for it rather than starting a
    trace of its own.

    Parameters
    ----------
    execution : Execution
        The execution.

    Yields
    ------
    Any
        The span, or a non-recording one when nothing is collecting.
    """
    with restored(execution.trace):
        attributes = {
            **correlation_of_execution(execution),
            **account_attributes(),
            "orchestration.capability": execution.agent.capability,
            "orchestration.depth": execution.depth,
            "orchestration.state": execution.status.value,
        }
        with _span(EXECUTION_SPAN, attributes) as span:
            yield span


@contextmanager
def attempt_span(
    execution: Execution, attempt: Attempt, *, operation: WorkerOperation
) -> Iterator[Any]:
    """
    The span one dispatch happens inside, opened by the adapter that makes it.

    It stays current across the dispatch's ``yield`` points on purpose. An
    async generator's body runs in its caller's context, so the events the
    caller records between observations land on this span — which is how the
    trace comes to agree with the store without either of them being told
    about the other. What that assumes is one dispatch at a time in one
    task, which is what a durable activity does (O1-03); two dispatches
    interleaved in one task would unwind their contexts out of order, and
    the answer to that is a task each, not a span that is never current.

    Parameters
    ----------
    execution : Execution
        The execution being dispatched.
    attempt : Attempt
        This dispatch.
    operation : WorkerOperation
        What the adapter is doing: delegating, or re-attaching.

    Yields
    ------
    Any
        The span, or a non-recording one when nothing is collecting.
    """
    with restored(execution.trace):
        attributes = {
            **correlation_of_execution(execution, attempt.attempt_id),
            **account_attributes(),
            "orchestration.operation": operation.value,
            "orchestration.attempt_number": attempt.number,
            "orchestration.capability": execution.agent.capability,
        }
        with _span(ATTEMPT_SPAN, attributes) as span:
            if span is not None and span.is_recording():
                # Only once there is something to carry: patching a client
                # nobody is tracing would be a cost with no story attached.
                instrument_worker_transports()
            yield span


def record_execution_event(event: ExecutionEvent) -> None:
    """
    Put one canonical event on whichever span is current.

    Called from the store, so the trace and the event stream are the same
    record seen twice rather than two records that have to be reconciled.
    Never raises: the story about the work is worth less than the work.

    Parameters
    ----------
    event : ExecutionEvent
        The event as the store appended it, sequence and correlation stamped.
    """
    span = _current_span()
    if span is None or not span.is_recording():
        return
    attributes: dict[str, Any] = {
        **correlation_of(event),
        "orchestration.sequence": event.sequence,
    }
    if event.state is not None:
        attributes["orchestration.state"] = event.state.value
    if event.previous_state is not None:
        attributes["orchestration.previous_state"] = event.previous_state.value
    if event.lifecycle_event is not None:
        attributes["orchestration.lifecycle_event"] = event.lifecycle_event.value
    if event.acknowledgement is not None:
        attributes["orchestration.acknowledgement"] = event.acknowledgement.kind.value
    if event.artifact is not None:
        attributes["orchestration.artifact_id"] = event.artifact.artifact_id
    if event.error is not None:
        attributes["orchestration.error_code"] = event.error.code.value
        attributes["orchestration.error_retryable"] = event.error.retryable
    try:
        span.add_event(event.type.value, attributes=attributes)
    except Exception as error:  # noqa: BLE001 - telemetry never fails the work
        logger.debug("The execution event could not be traced: %s", error)


def instrument_worker_transports() -> bool:
    """
    Make the protocol clients carry the trace out to the worker.

    The A2A relay and the ACP client build their own ``httpx`` connections
    with no seam for a header, so the trace reaches a remote worker the way
    ``otel/instrumentation.py`` already reaches pydantic-ai: by patching the
    library from outside rather than editing the code that uses it. Only
    what is already in context is injected, so an unconfigured deployment
    sends nothing.

    Returns
    -------
    bool
        Whether the clients now carry it.
    """
    global _worker_transports_instrumented
    if _worker_transports_instrumented:
        return True
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
    except Exception as error:  # noqa: BLE001 - telemetry is optional
        logger.debug("The worker transports were not instrumented: %s", error)
        return False
    _worker_transports_instrumented = True
    return True


@contextmanager
def _span(name: str, attributes: dict[str, Any]) -> Iterator[Any]:
    """
    One span, or nothing at all when OpenTelemetry is not installed.

    Parameters
    ----------
    name : str
        The span name.
    attributes : dict[str, Any]
        What to put on it.

    Yields
    ------
    Any
        The span, or ``None``.
    """
    try:
        from opentelemetry import trace as otel_trace
    except Exception:  # noqa: BLE001 - telemetry is optional
        yield None
        return
    with otel_trace.get_tracer(ORCHESTRATION_SERVICE).start_as_current_span(
        name, attributes=attributes
    ) as span:
        yield span


def _current_span() -> Any:
    """
    The span in context, or ``None`` when there is no OpenTelemetry.

    Returns
    -------
    Any
        The current span.
    """
    try:
        from opentelemetry import trace as otel_trace
    except Exception:  # noqa: BLE001 - telemetry is optional
        return None
    return otel_trace.get_current_span()


def _recording() -> bool:
    """
    Say whether this process is already inside a span something is collecting.

    Returns
    -------
    bool
        True when a recording span is current.
    """
    span = _current_span()
    return span is not None and span.is_recording()

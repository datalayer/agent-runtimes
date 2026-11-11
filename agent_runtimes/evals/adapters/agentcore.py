# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""AgentCore Evaluations as an evals adapter (AC-14).

Beside harbor and inspect_ai, which run a framework's own cases in a
sandbox, this adapter judges agent-runtimes' own runs with Amazon Bedrock
AgentCore's evaluators:

1. a case is run by the local runner (`agent_runtimes.evals.local.runner`),
   the agent's GenAI spans captured as they are written (AC-12);
2. those spans, as OpenTelemetry documents carrying the run's
   ``session.id``, are sent to AgentCore Evaluations on demand:
   ``bedrock-agentcore`` ``Evaluate``, once per chosen evaluator
   (``Builtin.Helpfulness``, ``Builtin.ToolSelectionAccuracy``,
   ``Builtin.GoalSuccessRate``…);
3. each answer is a `NormalizedScore` named by its evaluator's id, with its
   value, its label and AgentCore's explanation; no aggregate is invented.

Credentials are the caller's AWS ones (the organization's connection); the
evaluations are billed by AWS. An evaluator AgentCore answers with an error
fails the case in its sentence. The adapter imports no source and runs no
sandbox: a source-reading boundary refuses in a sentence.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import asdict
from typing import Any, Awaitable, Callable, Mapping, Optional, Sequence

from agent_runtimes.evals.adapters.base import (
    AdapterPlan,
    Capability,
    ExternalAdapter,
    ExternalDefinition,
    ImportedDefinition,
    Inspection,
    LaunchGrant,
    NormalizedResult,
    NormalizedScore,
    RawResult,
    Sandbox,
    Selection,
    SourceRef,
    SourceTree,
    Trial,
    policy_to,
)

#: The botocore service the evaluations are asked of.
SERVICE = "bedrock-agentcore"

#: The prefix of AgentCore's built-in evaluators.
BUILTIN_PREFIX = "Builtin."

#: Why the source-reading boundaries refuse.
NO_SOURCE = (
    "AgentCore Evaluations judges the spans of a run; it defines no cases to "
    "inspect or import: run an evalset's cases and judge them with it."
)


class AgentCoreEvaluationFailed(RuntimeError):
    """An evaluation AgentCore could not make, in a sentence."""


def _hex(value: int, width: int) -> str:
    return format(value, f"0{width}x")


def span_documents(spans: Sequence[Any], session_id: str) -> list[dict[str, Any]]:
    """Write finished spans as the OpenTelemetry documents AgentCore reads.

    Parameters
    ----------
    spans : Sequence[opentelemetry.sdk.trace.ReadableSpan]
        The run's finished spans.
    session_id : str
        The session the run is judged as, written as ``session.id``.

    Returns
    -------
    list[dict]
        One document per span: ids in hex, times in nanoseconds, its scope,
        its resource and its attributes.
    """
    documents: list[dict[str, Any]] = []
    for span in spans:
        context = span.get_span_context()
        parent = span.parent
        scope = span.instrumentation_scope
        documents.append(
            {
                "traceId": _hex(context.trace_id, 32),
                "spanId": _hex(context.span_id, 16),
                "parentSpanId": _hex(parent.span_id, 16) if parent else "",
                "name": span.name,
                "kind": span.kind.name,
                "startTimeUnixNano": span.start_time,
                "endTimeUnixNano": span.end_time,
                "status": {"code": span.status.status_code.name},
                "scope": {
                    "name": scope.name if scope else "",
                    "version": (scope.version or "") if scope else "",
                },
                "resource": {"attributes": dict(span.resource.attributes)},
                "attributes": {**dict(span.attributes or {}), "session.id": session_id},
            }
        )
    return documents


class AgentCoreAdapter(ExternalAdapter):
    """Judge agent-runtimes' runs with AgentCore's evaluators.

    Parameters
    ----------
    client : Any, optional
        The ``bedrock-agentcore`` client (a stubbed one in tests); made with
        the caller's AWS credentials in ``AWS_REGION`` when first needed.
    """

    framework = "agentcore"
    adapter_version = "1"
    #: The ``bedrock-agentcore`` API the ``Evaluate`` mapping was written for.
    framework_version = "2024-02-28"

    def __init__(self, client: Any = None) -> None:
        self._client = client

    def client(self) -> Any:
        """Return the ``bedrock-agentcore`` client, made once."""
        if self._client is None:
            import boto3

            region = os.environ.get("AWS_REGION") or os.environ.get(
                "AWS_DEFAULT_REGION"
            )
            self._client = boto3.client(SERVICE, region_name=region)
        return self._client

    # --- the boundaries of a source framework: none here ---------------------------

    def inspect(
        self, source: SourceTree, *, sandbox: Sandbox, options: dict[str, Any]
    ) -> Inspection:
        """Refuse: there is no source to read."""
        raise ValueError(NO_SOURCE)

    def import_definition(
        self, inspection: Inspection, *, selection: Selection, source: SourceRef
    ) -> ImportedDefinition:
        """Refuse: there is no source to import."""
        raise ValueError(NO_SOURCE)

    def execute(
        self,
        trial: Trial,
        *,
        plan: AdapterPlan,
        source: SourceTree,
        sandbox: Sandbox,
        env: Mapping[str, str],
    ) -> RawResult:
        """Refuse: a case is run in the runtime and judged (`judge`), never in a sandbox."""
        raise ValueError(
            "AgentCore's evaluators judge a run of the runtime's own agent: "
            "use judge(), there is no sandbox to run."
        )

    # --- what it decides ---------------------------------------------------------------

    def validate(
        self, inspection: Inspection, *, grant: LaunchGrant | None = None
    ) -> list[Capability]:
        """Classify the chosen evaluators: an empty id is unsupported."""
        return [
            Capability(
                component=str(evaluator),
                kind="evaluator",
                status="framework-run" if str(evaluator).strip() else "unsupported",
                reason="" if str(evaluator).strip() else "An evaluator has no id.",
                code="" if str(evaluator).strip() else "evaluator_id",
            )
            for evaluator in inspection.configuration.get("evaluators") or []
        ]

    def plan(
        self, definition: ExternalDefinition, *, grant: LaunchGrant
    ) -> AdapterPlan:
        """Plan the judging of a launch: its evaluators."""
        evaluators = evaluator_ids(definition.configuration.get("evaluators"))
        return AdapterPlan(
            framework=self.framework,
            adapter_version=self.adapter_version,
            framework_version=self.framework_version,
            environment=self.environment,
            policy=policy_to(self.default_policy),
            capabilities=definition.capabilities,
            resolved_configuration={"evaluators": evaluators},
            reproduction=" ".join(
                f"aws bedrock-agentcore evaluate --evaluator-id {e}" for e in evaluators
            ),
        )

    # --- judging -----------------------------------------------------------------------

    def evaluate(
        self,
        documents: list[dict[str, Any]],
        evaluators: Sequence[str],
    ) -> list[dict[str, Any]]:
        """Ask AgentCore Evaluations for each evaluator's verdict on a run's spans.

        Parameters
        ----------
        documents : list[dict]
            The run's spans (`span_documents`).
        evaluators : Sequence[str]
            The evaluator ids, ``Builtin.*`` or an organization's own.

        Returns
        -------
        list[dict]
            Every ``evaluationResults`` entry, in the evaluators' order.

        Raises
        ------
        AgentCoreEvaluationFailed
            When an evaluator answers with an error, in its sentence.
        """
        client = self.client()
        results: list[dict[str, Any]] = []
        for evaluator in evaluator_ids(evaluators):
            answer = client.evaluate(
                evaluatorId=evaluator,
                evaluationInput={"sessionSpans": documents},
            )
            for result in answer.get("evaluationResults") or []:
                if result.get("errorCode") or result.get("errorMessage"):
                    raise AgentCoreEvaluationFailed(
                        f"AgentCore's evaluator {evaluator} could not judge the run: "
                        f"{result.get('errorMessage') or result.get('errorCode')}"
                    )
                results.append(result)
        return results

    def normalize_result(
        self, trial: Trial, raw: RawResult, *, plan: AdapterPlan
    ) -> NormalizedResult:
        """Map a judged case to one task result, a score per evaluator."""
        payload = raw.payload or {}
        case = payload.get("case") or {}
        scores = [
            NormalizedScore(
                name=str(result["evaluatorId"]),
                value=result.get("value"),
                answer=str(result.get("label") or ""),
                explanation=str(result.get("explanation") or ""),
                metadata={
                    "evaluator_arn": result.get("evaluatorArn"),
                    "evaluator_name": result.get("evaluatorName"),
                    "context": result.get("context"),
                    "token_usage": result.get("tokenUsage") or {},
                    "source": "agentcore",
                },
            )
            for result in payload.get("evaluations") or []
        ]
        passed = bool(case.get("passed")) and not case.get("error")
        return NormalizedResult(
            status="passed" if passed else "failed",
            passed=passed,
            explanation=str(case.get("error") or ""),
            failure_stage="" if passed else "run",
            prompt=str(trial.input or ""),
            output=str(case.get("actual_output") or ""),
            scores=scores,
            framework={
                "name": self.framework,
                "session_id": payload.get("session_id"),
                "evaluators": plan.resolved_configuration.get("evaluators") or [],
            },
        )

    async def judge(
        self,
        case: Any,
        *,
        agent_fn: Callable[[dict[str, Any]], Awaitable[str]],
        evaluators: Sequence[str],
        agent_id: str = "agentcore-judged",
        session_id: Optional[str] = None,
    ) -> NormalizedResult:
        """Run one case with the local runner, then have AgentCore judge its spans.

        Parameters
        ----------
        case : pydantic_evals.Case
            The case: its inputs (``{"prompt": ...}``), its expected output.
        agent_fn : Callable
            The agent, as the local runner calls it.
        evaluators : Sequence[str]
            The AgentCore evaluator ids.
        agent_id : str, optional
            The id the run is reported under.
        session_id : str, optional
            The session the run is judged as; a new uuid when not given.

        Returns
        -------
        NormalizedResult
            The case's result, a score per evaluator.

        Raises
        ------
        AgentCoreEvaluationFailed
            When the run left no GenAI span, or an evaluator fails.
        """
        from opentelemetry.sdk.trace import TracerProvider as SDKTracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor
        from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
            InMemorySpanExporter,
        )
        from pydantic_ai import Agent

        from agent_runtimes.evals.local.runner import EvalRunner
        from agent_runtimes.otel.genai import instrumentation_settings

        chosen = evaluator_ids(evaluators)
        session = session_id or str(uuid.uuid4())
        memory = InMemorySpanExporter()
        provider = SDKTracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(memory))
        before = Agent._instrument_default
        Agent.instrument_all(instrumentation_settings(provider))
        try:
            (result,) = await EvalRunner(agent_id, agent_fn).run_cases([case])
        finally:
            Agent.instrument_all(before)
            provider.shutdown()
        spans = memory.get_finished_spans()
        if not spans:
            raise AgentCoreEvaluationFailed(
                "The case's run left no GenAI span for AgentCore to judge: its "
                "agent is not a pydantic-ai agent of this process."
            )
        evaluations = self.evaluate(span_documents(spans, session), chosen)
        definition_plan = AdapterPlan(
            framework=self.framework,
            adapter_version=self.adapter_version,
            framework_version=self.framework_version,
            environment=self.environment,
            policy=policy_to(self.default_policy),
            capabilities=[],
            resolved_configuration={"evaluators": chosen},
        )
        trial = Trial(
            case_id=str(case.name or session),
            native_id=str(case.name or session),
            input=(case.inputs or {}).get("prompt"),
            target=case.expected_output,
        )
        return self.normalize_result(
            trial,
            RawResult(
                returncode=0 if result.error is None else 1,
                payload={
                    "case": asdict(result),
                    "evaluations": evaluations,
                    "session_id": session,
                },
            ),
            plan=definition_plan,
        )


#: Where AgentCore Observability keeps the spans (CloudWatch Transaction Search).
SPANS_LOG_GROUP = "aws/spans"

#: At most this many spans of one session are read.
MAX_SESSION_SPANS = 1000


def session_spans(
    logs: Any,
    session_id: str,
    *,
    start: int,
    end: int,
    sleep: Callable[[float], None] = time.sleep,
    attempts: int = 60,
) -> list[dict[str, Any]]:
    """Read the spans of one AgentCore session from ``aws/spans``, oldest first.

    The spans AgentCore Observability keeps, as the OpenTelemetry documents
    ``Evaluate`` takes in ``sessionSpans``: every span carrying the session's
    ``session.id`` (on AgentCore, the runtime session id), between two
    instants, with a Logs Insights query.

    Parameters
    ----------
    logs : Any
        A ``logs`` client in the account and region of the runtime.
    session_id : str
        The runtime session id (``X-Amzn-Bedrock-AgentCore-Runtime-Session-Id``).
    start, end : int
        The window, in epoch seconds.
    sleep : Callable, optional
        How to wait between polls of the query (a test's).
    attempts : int, optional
        How many polls of a second before giving up.

    Returns
    -------
    list[dict]
        The span documents.

    Raises
    ------
    AgentCoreEvaluationFailed
        When the query fails or does not finish, in a sentence.
    """
    escaped = session_id.replace("\\", "\\\\").replace('"', '\\"')
    query = (
        "fields @message"
        f' | filter attributes.session.id = "{escaped}"'
        " | sort startTimeUnixNano asc"
        f" | limit {MAX_SESSION_SPANS}"
    )
    started = logs.start_query(
        logGroupName=SPANS_LOG_GROUP,
        startTime=int(start),
        endTime=int(end),
        queryString=query,
        limit=MAX_SESSION_SPANS,
    )
    for _ in range(attempts):
        answer = logs.get_query_results(queryId=started["queryId"])
        status = answer.get("status")
        if status == "Complete":
            break
        if status in ("Failed", "Cancelled", "Timeout", "Unknown"):
            raise AgentCoreEvaluationFailed(
                f"The spans of session {session_id} could not be read from "
                f"{SPANS_LOG_GROUP}: the query ended {status}."
            )
        sleep(1.0)
    else:
        raise AgentCoreEvaluationFailed(
            f"The spans of session {session_id} were not read from {SPANS_LOG_GROUP} "
            f"within {attempts} seconds."
        )

    documents: list[dict[str, Any]] = []
    for row in answer.get("results") or []:
        message = next(
            (field["value"] for field in row if field.get("field") == "@message"), ""
        )
        try:
            document = json.loads(message)
        except ValueError:
            continue
        if isinstance(document, dict):
            documents.append(document)
    return documents


def evaluate_session(
    *,
    agentcore: Any,
    logs: Any,
    session_id: str,
    evaluators: Sequence[str],
    start: int,
    end: int,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Judge a recorded AgentCore session with AgentCore's evaluators.

    Its spans are read from ``aws/spans`` (`session_spans`) and given to
    ``Evaluate`` once per evaluator (`AgentCoreAdapter.evaluate`).

    Returns
    -------
    dict
        ``{"session_id", "spans", "evaluations": [{evaluatorId, value,
        label, explanation…}]}``.

    Raises
    ------
    AgentCoreEvaluationFailed
        When the session left no span there — AgentCore Observability did
        not receive them (CloudWatch Transaction Search off, or the export
        refused) — or an evaluator fails, in a sentence.
    """
    chosen = evaluator_ids(evaluators)
    documents = session_spans(logs, session_id, start=start, end=end, sleep=sleep)
    if not documents:
        raise AgentCoreEvaluationFailed(
            f"Session {session_id} left no span in {SPANS_LOG_GROUP}: AgentCore "
            "Observability received none of its spans (is CloudWatch Transaction "
            "Search on in the account?), or they are not indexed yet."
        )
    evaluations = AgentCoreAdapter(client=agentcore).evaluate(documents, chosen)
    return {
        "session_id": session_id,
        "spans": len(documents),
        "evaluations": evaluations,
    }


def evaluator_ids(value: Any) -> list[str]:
    """Read the chosen evaluator ids, refusing none chosen or an empty one.

    Parameters
    ----------
    value : Any
        A sequence of evaluator ids.

    Returns
    -------
    list[str]
        The ids, in order.

    Raises
    ------
    ValueError
        When none is chosen, or one is empty, in a sentence.
    """
    ids = [str(item).strip() for item in (value or [])]
    if not ids:
        raise ValueError(
            "Choose AgentCore's evaluators to judge the run with, e.g. "
            f"{BUILTIN_PREFIX}Helpfulness."
        )
    if any(not item for item in ids):
        raise ValueError("An AgentCore evaluator id is empty.")
    return ids


__all__ = [
    "BUILTIN_PREFIX",
    "NO_SOURCE",
    "SERVICE",
    "AgentCoreAdapter",
    "AgentCoreEvaluationFailed",
    "MAX_SESSION_SPANS",
    "SPANS_LOG_GROUP",
    "evaluate_session",
    "evaluator_ids",
    "session_spans",
    "span_documents",
]

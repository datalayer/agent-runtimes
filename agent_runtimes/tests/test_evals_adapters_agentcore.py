# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``agentcore`` evals adapter (AC-14), against a stubbed AgentCore.

A case runs through the local runner on a pydantic-ai agent that calls one
tool; its GenAI spans are sent to ``bedrock-agentcore`` ``Evaluate`` (botocore's
own service model, through its Stubber) once per chosen evaluator, and each
answer comes back as a score named by its evaluator id with its explanation.
"""

from __future__ import annotations

from typing import Any

import boto3
import pytest
from botocore.stub import ANY, Stubber
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.evals.adapters.agentcore import (
    NO_SOURCE,
    AgentCoreAdapter,
    AgentCoreEvaluationFailed,
    evaluator_ids,
)
from agent_runtimes.evals.adapters.registry import adapter
from agent_runtimes.otel.genai import SCOPE

pydantic_evals = pytest.importorskip(
    "pydantic_evals",
    reason="the agentcore adapter runs its case through pydantic-evals (the evals extra)",
)
Case = pydantic_evals.Case

SESSION = "session-judged-0001"
EVALUATORS = ["Builtin.Helpfulness", "Builtin.ToolSelectionAccuracy"]


def weather(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    if any(
        isinstance(part, ToolReturnPart)
        for message in messages
        for part in getattr(message, "parts", [])
    ):
        return ModelResponse(parts=[TextPart("Sunny in Paris.")])
    return ModelResponse(parts=[ToolCallPart("forecast", {"city": "Paris"})])


def _agent_fn() -> Any:
    agent = Agent(FunctionModel(weather), name="forecaster")

    @agent.tool_plain
    def forecast(city: str) -> str:
        """Say the weather of a city."""
        return f"sunny in {city}"

    async def run(inputs: dict[str, Any]) -> str:
        return (await agent.run(inputs["prompt"])).output

    return run


def _result(evaluator: str, value: float, label: str, explanation: str) -> dict:
    return {
        "evaluatorArn": f"arn:aws:bedrock-agentcore:::evaluator/{evaluator}",
        "evaluatorId": evaluator,
        "evaluatorName": evaluator.split(".")[-1],
        "explanation": explanation,
        "context": {"spanContext": {"sessionId": SESSION}},
        "value": value,
        "label": label,
        "tokenUsage": {"inputTokens": 10, "outputTokens": 5, "totalTokens": 15},
    }


def _client() -> Any:
    return boto3.client(
        "bedrock-agentcore",
        region_name="us-east-1",
        aws_access_key_id="AKIDEXAMPLE",
        aws_secret_access_key="secret",
    )


def _input_has_the_run(params: dict[str, Any]) -> None:
    documents = params["evaluationInput"]["sessionSpans"]
    assert {d["scope"]["name"] for d in documents} == {SCOPE}
    assert {d["attributes"]["session.id"] for d in documents} == {SESSION}
    operations = {d["attributes"]["gen_ai.operation.name"] for d in documents}
    assert operations == {"invoke_agent", "execute_tool", "chat"}
    (tool,) = [
        d
        for d in documents
        if d["attributes"]["gen_ai.operation.name"] == "execute_tool"
    ]
    assert tool["attributes"]["gen_ai.tool.name"] == "forecast"
    assert len(tool["traceId"]) == 32 and len(tool["spanId"]) == 16


@pytest.mark.asyncio
async def test_a_case_is_run_and_judged_a_score_per_evaluator() -> None:
    client = _client()
    seen: list[dict[str, Any]] = []
    original = client.evaluate

    def evaluate(**params: Any) -> Any:
        seen.append(params)
        return original(**params)

    client.evaluate = evaluate
    with Stubber(client) as stub:
        stub.add_response(
            "evaluate",
            {
                "evaluationResults": [
                    _result(EVALUATORS[0], 0.83, "Very Helpful", "It answered.")
                ]
            },
            {"evaluatorId": EVALUATORS[0], "evaluationInput": ANY},
        )
        stub.add_response(
            "evaluate",
            {
                "evaluationResults": [
                    _result(EVALUATORS[1], 1.0, "Yes", "forecast was the right tool.")
                ]
            },
            {"evaluatorId": EVALUATORS[1], "evaluationInput": ANY},
        )
        judged = await AgentCoreAdapter(client).judge(
            Case(
                name="paris",
                inputs={"prompt": "Weather in Paris?"},
                expected_output="Sunny in Paris.",
            ),
            agent_fn=_agent_fn(),
            evaluators=EVALUATORS,
            session_id=SESSION,
        )
        stub.assert_no_pending_responses()

    for params in seen:
        _input_has_the_run(params)
    assert judged.status == "passed" and judged.passed is True
    assert judged.output == "Sunny in Paris."
    assert judged.prompt == "Weather in Paris?"
    assert judged.score is None
    assert [(s.name, s.value, s.answer, s.explanation) for s in judged.scores] == [
        ("Builtin.Helpfulness", 0.83, "Very Helpful", "It answered."),
        ("Builtin.ToolSelectionAccuracy", 1.0, "Yes", "forecast was the right tool."),
    ]
    assert judged.scores[0].metadata["source"] == "agentcore"
    assert judged.framework["session_id"] == SESSION


@pytest.mark.asyncio
async def test_an_evaluator_error_fails_the_case_in_its_sentence() -> None:
    client = _client()
    with Stubber(client) as stub:
        failed = _result(EVALUATORS[0], 0.0, "", "")
        failed.update(errorCode="ValidationError", errorMessage="No trace to judge.")
        stub.add_response(
            "evaluate",
            {"evaluationResults": [failed]},
            {"evaluatorId": EVALUATORS[0], "evaluationInput": ANY},
        )
        with pytest.raises(AgentCoreEvaluationFailed, match="No trace to judge."):
            await AgentCoreAdapter(client).judge(
                Case(name="paris", inputs={"prompt": "Weather in Paris?"}),
                agent_fn=_agent_fn(),
                evaluators=EVALUATORS[:1],
                session_id=SESSION,
            )


@pytest.mark.asyncio
async def test_a_run_without_genai_spans_is_refused() -> None:
    async def not_an_agent(inputs: dict[str, Any]) -> str:
        return "no agent here"

    with pytest.raises(AgentCoreEvaluationFailed, match="no GenAI span"):
        await AgentCoreAdapter(_client()).judge(
            Case(name="none", inputs={"prompt": "hi"}),
            agent_fn=not_an_agent,
            evaluators=EVALUATORS,
        )


def test_it_is_registered_beside_harbor_and_inspect_ai() -> None:
    made = adapter("agentcore")
    assert isinstance(made, AgentCoreAdapter)
    assert made.describe()["framework"] == "agentcore"
    with pytest.raises(ValueError, match="defines no cases"):
        made.inspect(None, sandbox=None, options={})  # type: ignore[arg-type]
    assert NO_SOURCE.startswith("AgentCore Evaluations")


def test_evaluators_are_chosen() -> None:
    assert evaluator_ids(EVALUATORS) == EVALUATORS
    with pytest.raises(ValueError, match="Choose AgentCore's evaluators"):
        evaluator_ids([])
    with pytest.raises(ValueError, match="empty"):
        evaluator_ids(["Builtin.Helpfulness", " "])


# --- a recorded AgentCore session, judged from aws/spans -----------------------------


def _logs() -> Any:
    return boto3.client(
        "logs",
        region_name="us-east-1",
        aws_access_key_id="AKIDEXAMPLE",
        aws_secret_access_key="secret",
    )


def _span_row(name: str, operation: str) -> list[dict[str, str]]:
    import json

    document = {
        "traceId": "0" * 31 + "1",
        "spanId": "0" * 15 + "1",
        "name": name,
        "scope": {"name": SCOPE},
        "attributes": {"session.id": SESSION, "gen_ai.operation.name": operation},
    }
    return [
        {"field": "@message", "value": json.dumps(document)},
        {"field": "@ptr", "value": "p"},
    ]


def test_a_recorded_session_is_read_from_aws_spans_and_judged() -> None:
    from agent_runtimes.evals.adapters.agentcore import evaluate_session

    logs, agentcore = _logs(), _client()
    with Stubber(logs) as read, Stubber(agentcore) as judge:
        read.add_response(
            "start_query",
            {"queryId": "q-1"},
            {
                "logGroupName": "aws/spans",
                "startTime": 1000,
                "endTime": 2000,
                "queryString": 'fields @message | filter attributes.session.id = "session-judged-0001"'
                " | sort startTimeUnixNano asc | limit 1000",
                "limit": 1000,
            },
        )
        read.add_response(
            "get_query_results",
            {"status": "Running", "results": []},
            {"queryId": "q-1"},
        )
        read.add_response(
            "get_query_results",
            {
                "status": "Complete",
                "results": [
                    _span_row("invoke_agent chat", "invoke_agent"),
                    _span_row("execute_tool forecast", "execute_tool"),
                ],
            },
            {"queryId": "q-1"},
        )
        for evaluator, value in zip(
            ["Builtin.GoalSuccessRate", "Builtin.ToolSelectionAccuracy"], [1.0, 0.5]
        ):
            judge.add_response(
                "evaluate",
                {"evaluationResults": [_result(evaluator, value, "Yes", "Judged.")]},
                {"evaluatorId": evaluator, "evaluationInput": {"sessionSpans": ANY}},
            )
        judged = evaluate_session(
            agentcore=agentcore,
            logs=logs,
            session_id=SESSION,
            evaluators=["Builtin.GoalSuccessRate", "Builtin.ToolSelectionAccuracy"],
            start=1000,
            end=2000,
            sleep=lambda _: None,
        )
        read.assert_no_pending_responses()
        judge.assert_no_pending_responses()

    assert judged["spans"] == 2
    assert [(e["evaluatorId"], e["value"]) for e in judged["evaluations"]] == [
        ("Builtin.GoalSuccessRate", 1.0),
        ("Builtin.ToolSelectionAccuracy", 0.5),
    ]


def test_a_session_with_no_span_in_aws_spans_is_said() -> None:
    from agent_runtimes.evals.adapters.agentcore import evaluate_session

    logs = _logs()
    with Stubber(logs) as read:
        read.add_response("start_query", {"queryId": "q-2"}, None)
        read.add_response(
            "get_query_results",
            {"status": "Complete", "results": []},
            {"queryId": "q-2"},
        )
        with pytest.raises(
            AgentCoreEvaluationFailed, match="left no span in aws/spans"
        ):
            evaluate_session(
                agentcore=_client(),
                logs=logs,
                session_id=SESSION,
                evaluators=["Builtin.GoalSuccessRate"],
                start=1,
                end=2,
                sleep=lambda _: None,
            )


def test_a_failed_query_is_said() -> None:
    from agent_runtimes.evals.adapters.agentcore import session_spans

    logs = _logs()
    with Stubber(logs) as read:
        read.add_response("start_query", {"queryId": "q-3"}, None)
        read.add_response(
            "get_query_results", {"status": "Failed", "results": []}, {"queryId": "q-3"}
        )
        with pytest.raises(AgentCoreEvaluationFailed, match="the query ended Failed"):
            session_spans(logs, SESSION, start=1, end=2, sleep=lambda _: None)

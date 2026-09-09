# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The LLM judge grades with an explanation and a failure mode (B2-12).

It asks the AI Inference service as the person, reads one JSON verdict,
holds the score to the threshold, and names how a task failed from a closed
list. A judge that cannot be reached, or does not answer JSON, fails the
case as a scorer failure and says so: a benchmark never claims a judge it
did not have.
"""

from __future__ import annotations

import json

from agent_runtimes.evals.remote import evaluators
from agent_runtimes.evals.remote.evaluators import (
    JUDGE_FAILURE_MODES,
    CASE_EVALUATORS,
    configure_judge,
    make_judge,
    run_case_evaluators,
    evaluate_run,
)


def _judge(verdict):
    def call(prompt, model):
        call.prompts.append(prompt)
        call.models.append(model)
        return verdict if isinstance(verdict, str) else json.dumps(verdict)

    call.prompts, call.models = [], []
    return call


def test_the_judge_is_an_executable_case_evaluator():
    assert "llm_judge" in CASE_EVALUATORS


def test_a_passing_verdict_scores_and_explains():
    judge = _judge({"score": 0.95, "passed": True, "explanation": "The count matches.", "failure_mode": ""})
    outcome = run_case_evaluators(
        output="There are 2000 rows.", expected="2000",
        evaluators=[{"name": "llm-judge", "arguments": {"_judge": judge, "model": "claude-sonnet-4-6", "threshold": 0.7}}],
    )
    assert outcome["passed"] is True and outcome["score"] == 0.95
    record = outcome["evaluators"][0]
    assert record["reason"] == "The count matches." and "failure_mode" not in record
    assert judge.models == ["claude-sonnet-4-6"]
    assert "Expected output:\n2000" in judge.prompts[0] and "There are 2000 rows." in judge.prompts[0]


def test_a_failing_verdict_names_how_it_failed():
    judge = _judge({"score": 0.2, "passed": False, "explanation": "It answered 0; 157 customers repeat.", "failure_mode": "wrong_answer"})
    outcome = run_case_evaluators(output="0", expected="157", evaluators=[{"name": "llm_judge", "arguments": {"_judge": judge}}])
    assert outcome["passed"] is False and outcome["score"] == 0.2
    assert outcome["evaluators"][0]["failure_mode"] == "wrong_answer"


def test_the_threshold_decides_and_an_unknown_mode_is_other():
    judge = _judge({"score": 0.6, "passed": True, "explanation": "close", "failure_mode": "sloppy"})
    outcome = run_case_evaluators(output="x", expected="y", evaluators=[{"name": "llm-judge", "arguments": {"_judge": judge, "threshold": 0.7}}])
    assert outcome["passed"] is False
    assert outcome["evaluators"][0]["failure_mode"] == "other"
    assert "other" in JUDGE_FAILURE_MODES


def test_a_judge_that_does_not_answer_json_or_cannot_be_asked_is_a_scorer_failure():
    outcome = run_case_evaluators(output="x", expected="y", evaluators=[{"name": "llm-judge", "arguments": {"_judge": _judge("I think it is fine.")}}])
    assert outcome["passed"] is False and "JSON" in outcome["evaluators"][0]["reason"]
    assert outcome["evaluators"][0]["failure_stage"] == "scorer"

    def down(prompt, model):
        raise RuntimeError("503")

    outcome = run_case_evaluators(output="x", expected="y", evaluators=[{"name": "llm-judge", "arguments": {"_judge": down}}])
    assert "could not be asked" in outcome["evaluators"][0]["reason"]


def test_without_any_judge_the_case_says_so(monkeypatch):
    monkeypatch.delenv("DATALAYER_AI_INFERENCE_URL", raising=False)
    configure_judge(call=None)
    evaluators._judge_state["call"] = None
    evaluators._judge_state["url"] = ""
    outcome = run_case_evaluators(output="x", expected="y", evaluators=[{"name": "llm-judge"}])
    assert outcome["passed"] is False and "no judge is configured" in outcome["evaluators"][0]["reason"]


def test_the_default_judge_is_configurable(monkeypatch):
    configure_judge(call=_judge({"score": 1, "passed": True, "explanation": "ok"}))
    try:
        outcome = run_case_evaluators(output="x", expected="x", evaluators=[{"name": "llm-judge"}])
        assert outcome["passed"] is True
    finally:
        evaluators._judge_state["call"] = None


def test_the_http_judge_asks_inference_as_the_person(monkeypatch):
    import httpx

    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"success": True, "data": {"response": '{"score": 0.9, "passed": true, "explanation": "yes"}'}})

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client

    class PatchedClient(real_client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", PatchedClient)
    judge = make_judge(url="https://inference.example/", token="dla_tmp_user")
    reply = judge("grade this", "claude-sonnet-4-6")
    assert '"score": 0.9' in reply
    assert seen["url"] == "https://inference.example/api/ai-inference/v1/chat/completions"
    assert seen["auth"] == "Bearer dla_tmp_user"
    assert seen["body"]["model"] == "claude-sonnet-4-6" and seen["body"]["stream"] is False
    assert seen["body"]["messages"][1]["content"] == "grade this"


def test_a_run_carries_the_judges_explanation_and_failure_mode():
    judge = _judge({"score": 0.1, "passed": False, "explanation": "wrong count", "failure_mode": "wrong_answer"})
    cases = [{"name": "dups", "inputs": {"prompt": "?"}, "expected_output": "157", "evaluators": [{"name": "llm-judge", "arguments": {"_judge": judge}}]}]
    metrics = evaluate_run(cases, ["0"])
    assert metrics["case_results"][0]["explanation"] == "wrong count"
    assert metrics["case_results"][0]["failure_mode"] == "wrong_answer"

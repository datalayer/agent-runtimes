# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Reusable evaluator execution for real (non-synthetic) eval runs.

Implements the common Datalayer evaluators (``equals_expected``, ``equals``,
``contains``, ``pass_rate_threshold``) so examples, the CLI, and integrations
can grade *real* agent outputs instead of fabricating scores. Evaluator names
mirror the evaluator catalog (see ``agent_runtimes/specs/evals``); unknown names
degrade gracefully to a skipped record so callers never crash on an unsupported
evaluator.
"""

from __future__ import annotations

from typing import Any, Callable

CaseEvaluator = Callable[[Any, Any, dict[str, Any]], dict[str, Any]]
ReportEvaluator = Callable[[list[dict[str, Any]], dict[str, Any]], dict[str, Any]]


def _coerce_text(value: Any) -> str:
    """Return the textual payload of an output/expected value."""
    if isinstance(value, dict):
        text = value.get("text")
        if text is not None:
            return str(text)
        return ""
    if value is None:
        return ""
    return str(value)


def _normalize_name(name: Any) -> str:
    return str(name or "").strip().lower().replace("-", "_")


def _evaluate_equals_expected(
    output: Any, expected: Any, arguments: dict[str, Any]
) -> dict[str, Any]:
    expected_text = _coerce_text(expected).strip()
    output_text = _coerce_text(output).strip()
    if not expected_text:
        return {"passed": True, "score": 1.0, "reason": "no expected output"}
    passed = output_text == expected_text
    return {
        "passed": passed,
        "score": 1.0 if passed else 0.0,
        "reason": "exact match" if passed else "output does not equal expected",
    }


def _evaluate_contains(
    output: Any, expected: Any, arguments: dict[str, Any]
) -> dict[str, Any]:
    output_text = _coerce_text(output)
    case_sensitive = bool(arguments.get("case_sensitive"))

    # Prefer explicit ``tokens`` (or a single ``substring``/``value``) from the
    # evaluator arguments; fall back to the case ``expected_output`` text only
    # when no needles are configured.
    tokens = arguments.get("tokens")
    if isinstance(tokens, (list, tuple)) and tokens:
        needles = [str(token) for token in tokens]
    else:
        single = arguments.get("substring", arguments.get("value"))
        if single is not None:
            needles = [str(single)]
        else:
            needles = [_coerce_text(expected)]

    needles = [needle for needle in needles if needle]
    if not needles:
        return {"passed": True, "score": 1.0, "reason": "no expected substring"}

    haystack = output_text if case_sensitive else output_text.lower()
    missing = [
        needle
        for needle in needles
        if (needle if case_sensitive else needle.lower()) not in haystack
    ]
    passed = not missing
    return {
        "passed": passed,
        "score": 1.0 if passed else 0.0,
        "reason": (
            "all tokens found" if passed else f"missing tokens: {', '.join(missing)}"
        ),
    }


def _evaluate_pass_rate_threshold(
    case_results: list[dict[str, Any]], arguments: dict[str, Any]
) -> dict[str, Any]:
    total = len(case_results)
    passed = sum(1 for case in case_results if case.get("passed"))
    rate = passed / total if total else 0.0
    min_pass_rate = arguments.get("min_pass_rate", 0.8)
    threshold = float(min_pass_rate) if isinstance(min_pass_rate, (int, float)) else 0.8
    ok = total > 0 and rate >= threshold
    return {
        "passed": ok,
        "score": round(rate, 4),
        "threshold": round(threshold, 4),
        "observed": round(rate, 4),
        "summary": (
            f"pass rate {rate:.2f} {'≥' if ok else '<'} threshold {threshold:.2f}"
        ),
    }


# ---------------------------------------------------------------------------
# The LLM judge (BENCHMARK.md, B2-12)
# ---------------------------------------------------------------------------

#: What a judge may call the way a task failed. A closed list, so the task
#: grid can filter on it and the report can count it.
JUDGE_FAILURE_MODES: tuple[str, ...] = (
    "wrong_answer",
    "incomplete",
    "hallucination",
    "format",
    "refused",
    "tool_misuse",
    "timeout",
    "other",
)

DEFAULT_JUDGE_RUBRIC = (
    "You are grading the answer an AI agent gave to a data analysis task. "
    "Judge whether the answer is correct and complete against the expected "
    "output, and be strict about numbers: a number that differs is wrong."
)

DEFAULT_JUDGE_THRESHOLD = 0.7

JudgeCall = Callable[[str, str], str]

_judge_state: dict[str, Any] = {"call": None, "url": "", "token": "", "model": ""}


def configure_judge(
    *,
    call: JudgeCall | None = None,
    url: str | None = None,
    token: str | None = None,
    model: str | None = None,
) -> None:
    """Where the judge's questions go by default.

    `call(prompt, model) -> text` replaces the transport (the tests use it);
    otherwise `url` and `token` name the AI Inference service and the person
    the question is asked as. A caller that grades for many people at once
    passes a judge per case through the evaluator's `_judge` argument instead.
    """
    if call is not None:
        _judge_state["call"] = call
    if url is not None:
        _judge_state["url"] = str(url).strip().rstrip("/")
    if token is not None:
        _judge_state["token"] = str(token)
    if model is not None:
        _judge_state["model"] = str(model)


def make_judge(*, url: str, token: str, timeout: float = 60.0) -> JudgeCall:
    """A judge that asks the AI Inference service as the holder of `token`."""

    def call(prompt: str, model: str) -> str:
        import httpx  # noqa: PLC0415

        body: dict[str, Any] = {
            "messages": [
                {"role": "system", "content": "You answer with one JSON object and nothing else."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0,
            "stream": False,
        }
        if model:
            body["model"] = model
        headers = {"Authorization": f"Bearer {token}", "X-API-Key": token} if token else {}
        with httpx.Client(timeout=timeout) as client:
            response = client.post(f"{url.rstrip('/')}/api/ai-inference/v1/chat/completions", json=body, headers=headers)
        if response.status_code >= 400:
            raise RuntimeError(f"the judge refused: HTTP {response.status_code} {response.text[:200]}")
        payload = response.json() if response.content else {}
        data = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else payload
        text = data.get("response") if isinstance(data, dict) else None
        if not text and isinstance(data, dict):
            # The assistant's whole message, under the name the service can
            # actually answer with: a payload field called `message` collided
            # with the envelope's own and was never delivered.
            message = data.get("assistant_message") if isinstance(data.get("assistant_message"), dict) else {}
            text = message.get("content")
            if not text:
                choices = data.get("choices") if isinstance(data.get("choices"), list) else []
                first = choices[0] if choices and isinstance(choices[0], dict) else {}
                text = ((first.get("message") or {}).get("content") if isinstance(first.get("message"), dict) else None) or first.get("text")
        return str(text or "")

    return call


def _default_judge() -> JudgeCall | None:
    call = _judge_state.get("call")
    if call is not None:
        return call
    url = str(_judge_state.get("url") or "")
    if not url:
        import os  # noqa: PLC0415

        url = str(os.environ.get("DATALAYER_AI_INFERENCE_URL") or "").strip()
        token = str(os.environ.get("DATALAYER_API_KEY") or os.environ.get("DATALAYER_TOKEN") or "").strip()
    else:
        token = str(_judge_state.get("token") or "")
    if not url:
        return None
    return make_judge(url=url, token=token)


def _judge_prompt(*, output_text: str, expected_text: str, rubric: str, failure_modes: tuple[str, ...]) -> str:
    return (
        f"{rubric}\n\n"
        f"Expected output:\n{expected_text or '(none given)'}\n\n"
        f"The agent's answer:\n{output_text or '(no answer)'}\n\n"
        "Reply with one JSON object with exactly these keys: "
        '"score" (a number from 0 to 1), "passed" (true or false), '
        '"explanation" (one or two sentences), and "failure_mode" '
        f"(one of {', '.join(failure_modes)}, or an empty string when the answer passed)."
    )


def _first_json_object(text: str) -> dict[str, Any] | None:
    import json  # noqa: PLC0415

    start = text.find("{")
    while start != -1:
        depth = 0
        for index in range(start, len(text)):
            if text[index] == "{":
                depth += 1
            elif text[index] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        parsed = json.loads(text[start : index + 1])
                    except ValueError:
                        break
                    return parsed if isinstance(parsed, dict) else None
        start = text.find("{", start + 1)
    return None


def _evaluate_llm_judge(output: Any, expected: Any, arguments: dict[str, Any]) -> dict[str, Any]:
    """An LLM judges the answer against the expected output and a rubric.

    Answers a score in [0, 1], a pass against the threshold, the judge's
    explanation and a failure mode from the closed list. A judge that cannot
    be reached or does not answer JSON fails the case with the reason, as a
    scorer failure: a benchmark must not claim a judge it did not have.
    """
    judge: JudgeCall | None = arguments.get("_judge") or _default_judge()
    threshold = float(arguments.get("threshold", DEFAULT_JUDGE_THRESHOLD) or DEFAULT_JUDGE_THRESHOLD)
    model = str(arguments.get("model") or _judge_state.get("model") or "")
    rubric = str(arguments.get("rubric") or DEFAULT_JUDGE_RUBRIC)
    modes = tuple(str(mode) for mode in (arguments.get("failure_modes") or JUDGE_FAILURE_MODES))
    if judge is None:
        return {
            "passed": False,
            "score": 0.0,
            "reason": "no judge is configured: set DATALAYER_AI_INFERENCE_URL or pass a judge",
            "failure_mode": "other",
            "failure_stage": "scorer",
        }
    prompt = _judge_prompt(
        output_text=_coerce_text(output).strip(), expected_text=_coerce_text(expected).strip(), rubric=rubric, failure_modes=modes
    )
    try:
        reply = judge(prompt, model)
    except Exception as error:  # noqa: BLE001 - the judge not answering is the outcome
        return {"passed": False, "score": 0.0, "reason": f"the judge could not be asked: {error}", "failure_mode": "other", "failure_stage": "scorer"}
    verdict = _first_json_object(str(reply or ""))
    if not verdict:
        return {"passed": False, "score": 0.0, "reason": "the judge did not answer with a JSON verdict", "failure_mode": "other", "failure_stage": "scorer"}
    try:
        score = max(0.0, min(1.0, float(verdict.get("score", 0.0))))
    except (TypeError, ValueError):
        score = 0.0
    passed = bool(verdict.get("passed", score >= threshold)) and score >= threshold
    mode = str(verdict.get("failure_mode") or "").strip().lower().replace("-", "_")
    if passed:
        mode = ""
    elif mode not in modes:
        mode = "other"
    return {
        "passed": passed,
        "score": round(score, 4),
        "reason": str(verdict.get("explanation") or "").strip(),
        "failure_mode": mode,
        "threshold": threshold,
        "judge_model": model,
    }


CASE_EVALUATORS: dict[str, CaseEvaluator] = {
    "equals_expected": _evaluate_equals_expected,
    "equals": _evaluate_equals_expected,
    "contains": _evaluate_contains,
    "llm_judge": _evaluate_llm_judge,
}

REPORT_EVALUATORS: dict[str, ReportEvaluator] = {
    "pass_rate_threshold": _evaluate_pass_rate_threshold,
}


def run_case_evaluators(
    *,
    output: Any,
    expected: Any,
    evaluators: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Grade a single real output against its per-case evaluators.

    Returns ``{"passed": bool, "score": float, "evaluators": [...]}``. A case
    passes when every applicable evaluator passes; the score is the mean of the
    evaluator scores (and defaults to ``1.0`` when no evaluator applies).
    Unsupported evaluators are recorded as ``skipped`` and ignored.
    """
    records: list[dict[str, Any]] = []
    scores: list[float] = []
    passed_all = True
    applied = 0
    for evaluator in evaluators or []:
        if not isinstance(evaluator, dict):
            continue
        name = _normalize_name(evaluator.get("name"))
        arguments = evaluator.get("arguments") or {}
        func = CASE_EVALUATORS.get(name)
        if func is None:
            records.append({"name": name or "evaluator", "skipped": True})
            continue
        outcome = func(output, expected, arguments)
        outcome_passed = bool(outcome.get("passed"))
        outcome_score = float(outcome.get("score", 1.0 if outcome_passed else 0.0))
        record = {
            "name": name,
            "passed": outcome_passed,
            "score": round(outcome_score, 4),
            "reason": str(outcome.get("reason") or ""),
        }
        if outcome.get("failure_mode"):
            record["failure_mode"] = str(outcome.get("failure_mode"))
        if outcome.get("failure_stage"):
            record["failure_stage"] = str(outcome.get("failure_stage"))
        records.append(record)
        scores.append(outcome_score)
        passed_all = passed_all and outcome_passed
        applied += 1
    score = round(sum(scores) / len(scores), 4) if scores else 1.0
    return {
        "passed": passed_all if applied else True,
        "score": score,
        "evaluators": records,
    }


def evaluate_run(
    cases: list[dict[str, Any]],
    outputs: list[Any],
    *,
    evalset_evaluators: list[dict[str, Any]] | None = None,
    report_evaluators: list[dict[str, Any]] | None = None,
    statuses: list[str] | None = None,
) -> dict[str, Any]:
    """Grade real per-case outputs and return run metrics.

    ``outputs`` is aligned with ``cases`` (each entry a ``str`` or a mapping
    with a ``text`` key). Evalset-level evaluators run for every case;
    report-level evaluators run once over the resulting case outcomes. The
    returned metrics mirror the synthetic shape (``case_results`` and
    ``evaluator_results``) so the UI and report render real and synthetic runs
    identically.
    """
    evalset_evaluators = [
        item for item in (evalset_evaluators or []) if isinstance(item, dict)
    ]
    report_evaluators = [
        item for item in (report_evaluators or []) if isinstance(item, dict)
    ]

    def _expected_for(case: dict[str, Any]) -> Any:
        expected = case.get("expected_output")
        if expected is None:
            expected = case.get("expected")
        return expected

    def _status_for(idx: int) -> str:
        if statuses and idx < len(statuses):
            return str(statuses[idx] or "").strip().lower()
        return "completed"

    case_results: list[dict[str, Any]] = []
    for idx, case in enumerate(cases):
        metadata = case.get("metadata") or {}
        expected = _expected_for(case)
        output = outputs[idx] if idx < len(outputs) else None
        case_evaluators = [
            item for item in (case.get("evaluators") or []) if isinstance(item, dict)
        ]
        # Per-case evaluators override the evalset-level defaults; the evalset
        # evaluators only apply to cases that do not declare their own.
        applicable = case_evaluators or evalset_evaluators
        outcome = run_case_evaluators(
            output=output, expected=expected, evaluators=applicable
        )
        case_passed = bool(outcome.get("passed"))
        score = float(outcome.get("score", 0.0))
        if _status_for(idx) in {"failed", "error"}:
            case_passed = False
            score = 0.0
        records = [item for item in (outcome.get("evaluators") or []) if isinstance(item, dict)]
        explanation = "; ".join(str(item.get("reason") or "") for item in records if item.get("reason"))
        failure_mode = next((str(item.get("failure_mode")) for item in records if item.get("failure_mode")), "")
        case_results.append(
            {
                "name": case.get("name"),
                "passed": case_passed,
                "status": "passed" if case_passed else "failed",
                "score": round(score, 4),
                "category": metadata.get("category"),
                "difficulty": metadata.get("difficulty") or metadata.get("priority"),
                "explanation": explanation,
                "failure_mode": failure_mode if not case_passed else "",
            }
        )

    evaluator_results: list[dict[str, Any]] = []
    total = len(cases)
    for evaluator in evalset_evaluators:
        name = str(evaluator.get("name") or "evaluator")
        passed_cases = 0
        scores: list[float] = []
        applicable_cases = 0
        for idx, case in enumerate(cases):
            # Skip cases that override the evalset default with their own
            # per-case evaluators so the summary reflects only where this
            # evalset evaluator actually applies.
            if [
                item
                for item in (case.get("evaluators") or [])
                if isinstance(item, dict)
            ]:
                continue
            applicable_cases += 1
            expected = _expected_for(case)
            output = outputs[idx] if idx < len(outputs) else None
            single = run_case_evaluators(
                output=output, expected=expected, evaluators=[evaluator]
            )
            ok = bool(single.get("passed")) and _status_for(idx) not in {
                "failed",
                "error",
            }
            if ok:
                passed_cases += 1
            scores.append(float(single.get("score", 0.0)) if ok else 0.0)
        mean_score = round(sum(scores) / len(scores), 4) if scores else None
        if applicable_cases == 0:
            # Every case declares its own evaluators, so this evalset default
            # graded nothing and its verdict is in the per-case results.
            # Reported as a result it read "0/0 cases passed" and counted as
            # a failed run in every report of a benchmark whose cases all
            # passed (2026-09-10).
            continue
        evaluator_results.append(
            {
                "name": name,
                "scope": "evalset",
                "score": mean_score,
                "passed": applicable_cases > 0 and passed_cases == applicable_cases,
                "passed_cases": passed_cases,
                "total_cases": applicable_cases,
                "summary": f"{passed_cases}/{applicable_cases} cases passed {name}",
            }
        )

    for evaluator in report_evaluators:
        name = str(evaluator.get("name") or "evaluator")
        func = REPORT_EVALUATORS.get(_normalize_name(evaluator.get("name")))
        if func is None:
            evaluator_results.append(
                {
                    "name": name,
                    "scope": "report",
                    "score": None,
                    "passed": False,
                    "summary": f"{name} not executed (unsupported)",
                }
            )
            continue
        outcome = func(case_results, evaluator.get("arguments") or {})
        entry: dict[str, Any] = {
            "name": name,
            "scope": "report",
            "score": outcome.get("score"),
            "passed": bool(outcome.get("passed")),
            "summary": str(outcome.get("summary") or ""),
        }
        for optional in ("threshold", "observed"):
            if outcome.get(optional) is not None:
                entry[optional] = outcome.get(optional)
        evaluator_results.append(entry)

    passed = sum(1 for case in case_results if case.get("passed"))
    pass_rate = round(passed / total, 4) if total else 0.0
    avg_score = (
        round(sum(float(case["score"]) for case in case_results) / total, 4)
        if total
        else 0.0
    )
    return {
        "pass_rate": pass_rate,
        "total_cases": total,
        "passed": passed,
        "failed": total - passed,
        "avg_score": avg_score,
        "case_results": case_results,
        "evaluator_results": evaluator_results,
    }


def evaluate_evalset(
    evalset_spec: dict[str, Any],
    outputs: list[Any],
    *,
    statuses: list[str] | None = None,
) -> dict[str, Any]:
    """Grade real outputs against a declarative evalset spec.

    Convenience wrapper that pulls ``cases``, ``evalset_evaluators`` and
    ``report_evaluators`` out of an evalset spec dict (as produced by
    :func:`agent_runtimes.evals.remote.load_evalset_spec`) and delegates to
    :func:`evaluate_run`. This is the single entry point examples and the CLI
    use so evaluator execution lives in the evals API rather than the caller.
    """
    cases = [
        item for item in (evalset_spec.get("cases") or []) if isinstance(item, dict)
    ]
    evalset_evaluators = [
        item
        for item in (evalset_spec.get("evalset_evaluators") or [])
        if isinstance(item, dict)
    ]
    report_evaluators = [
        item
        for item in (evalset_spec.get("report_evaluators") or [])
        if isinstance(item, dict)
    ]
    return evaluate_run(
        cases,
        outputs,
        evalset_evaluators=evalset_evaluators,
        report_evaluators=report_evaluators,
        statuses=statuses,
    )


CaseRunner = Callable[[dict[str, Any], int], Any]


def run_and_evaluate_evalset(
    evalset_spec: dict[str, Any],
    run_case: CaseRunner,
    *,
    statuses: list[str] | None = None,
) -> dict[str, Any]:
    """Execute every case through a runner callback, then grade the outputs.

    This bakes the per-case execution loop into the evals API so consumers
    (examples, GitHub Actions, and other integrations) never re-implement the
    "run each case, then evaluate" orchestration. ``run_case`` is called once
    per case as ``run_case(case, index)`` and may return either:

    * a plain output (``str`` or a mapping with a ``text`` key), or
    * a mapping ``{"output": <output>, "status": <status>}`` where ``status``
      is an optional per-case run status (e.g. ``"failed"``) that forces the
      case to fail regardless of evaluator outcome.

    Per-case and report-level evaluators from the spec then run for real over
    the collected outputs via :func:`evaluate_evalset`, returning the same
    metrics shape as synthetic runs (``case_results`` and ``evaluator_results``)
    so reports and the UI render real and simulated runs identically.
    """
    cases = [
        item for item in (evalset_spec.get("cases") or []) if isinstance(item, dict)
    ]
    outputs: list[Any] = []
    collected_statuses: list[str | None] = []
    for index, case in enumerate(cases):
        result = run_case(case, index)
        if isinstance(result, dict) and ("output" in result or "status" in result):
            outputs.append(result.get("output"))
            status = result.get("status")
        else:
            outputs.append(result)
            status = None
        if status is None and statuses is not None and index < len(statuses):
            status = statuses[index]
        collected_statuses.append(str(status) if status is not None else None)
    normalized_statuses = (
        [value or "" for value in collected_statuses]
        if any(value is not None for value in collected_statuses)
        else None
    )
    return evaluate_evalset(evalset_spec, outputs, statuses=normalized_statuses)

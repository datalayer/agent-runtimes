# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A run of an application's tests (LOOP V-08), from the terminal.

Each test conversation (``tests.cases``: *when it is asked this, it should
do that*) is asked of the application in this process, a session of its
own each — its rules, its checks and its record attached, and its code's own
tools and checks (P-06) — and what came of it is read four ways, in this
order, the first that fails naming the check:

- **a check stopped it on the way** (R-06, P-06): a tool call a Gate or a
  check of its code stopped, an answer a check asked again until the model
  gave up, a rule that held it back — said with the check's own sentence;
- **nothing sensitive leaves** (built in): a credential in the answer; and
  every catalogue Guard it names that this runtime executes
  (`guards.EXECUTORS`), run on the answer, failing it when its signal is
  raised;
- **the output has its shape** (built in): the formats its interface says
  its answers come in (``interface.outputs``), and, for a decision, that the
  answer names one of its alternatives;
- **it answers from its sources** (built in): an application that names
  documents (``contents``) reads them before it answers — read from what it
  did, the search of its documents among the tools its rules decided, not
  from the words of its answer;
- **it does what it should**: decided by the function its code names
  (``code``, `own.verdict_of`), else by a judge (`safety.JudgeCall`, as the
  Studio's run judges it) — with no judge, the case is not run and says so.

A case is `own.PASSED`, `own.FAILED` or `own.NOT_RUN`, as a beat of a scene's
rehearsal is (`scenes.rehearsal`); a failed case names the check (`check`) and
says why (`says`). The report is plain data (`ValidationReport.as_dict`),
what `loop apps validate --tests --local --json` prints and ``--attach``
hands to ai-agents, which keeps it against the saved version as the Studio
keeps a run of the Evals engine (``state.validation`` of the item).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from agent_runtimes.loop.apps.guards import (
    EXECUTORS,
    POST_RUN,
    AppChecks,
    Signals,
    credentials_in,
)
from agent_runtimes.loop.apps.own import (
    FAILED,
    NOT_RUN,
    PASSED,
    Conversation,
    verdict_of,
)
from agent_runtimes.types import AppSpec

#: The built-in checks, by name, in the order they are read.
CHECK_SENSITIVE = "sensitive"
CHECK_SHAPE = "shape"
CHECK_SOURCES = "sources"
CHECK_EXPECTED = "expected"
BUILT_IN: Tuple[str, ...] = (
    CHECK_SENSITIVE,
    CHECK_SHAPE,
    CHECK_SOURCES,
    CHECK_EXPECTED,
)

#: A turn its rules held back: not a check, but said as what stopped it.
CHECK_RULES = "rules"

#: The failure mode the Studio's judge answers for the test itself.
NOT_AS_EXPECTED = "not_as_expected"

#: The judge's threshold: an answer passes at this score.
THRESHOLD = 0.5

#: What the sentences say, as the Studio reads them (its `appTestRun.ts`).
WORDS = {
    "passed": "Passed.",
    "nothing": "It answered nothing.",
    "no_judge": (
        "Not judged: no judge on this machine. Name one with --judge <model> "
        "(its key set here), or set DATALAYER_AI_INFERENCE_URL."
    ),
    "not_expected": "It did not do what it should.",
    "not_from_sources": (
        "It did not answer from its sources: it answered without searching "
        "its documents."
    ),
    "not_in_code": "{code} is not in its code: validate the app.py to run it.",
}

#: Where a run was asked.
HERE = "on this machine"


# --- the checks on an answer --------------------------------------------------------


def sensitive_in(answer: str) -> Optional[str]:
    """What must not leave, found in the answer: a credential, by kind."""
    found = credentials_in(answer)
    if not found:
        return None
    return f"The answer holds {found[0]}: nothing sensitive leaves."


def _value_of(answer: str) -> Any:
    """The answer as a Guard reads it: its fields when it is JSON, else its text."""
    text = answer.strip()
    if text[:1] in ("{", "["):
        try:
            return json.loads(text)
        except ValueError:
            return answer
    return answer


def guard_failures(checks: AppChecks, answer: str) -> List[Tuple[str, str]]:
    """Each catalogue Guard the application names that this runtime executes,
    run on the answer — its fields when it is JSON — the Guards whose signal
    is raised, with why."""
    failed: List[Tuple[str, str]] = []
    value = _value_of(answer)
    for guard in checks.guards:
        if POST_RUN not in (guard.stages or []):
            continue
        signals = Signals()
        EXECUTORS[guard.id](guard, checks.app, POST_RUN, {"output": value}, signals)
        raised = [name for name, value in signals.values.items() if value is True]
        if not raised:
            continue
        because = "; ".join(
            text for name in raised if (text := signals.because.get(name, ""))
        )
        failed.append((guard.id, f"{guard.name}: {because or ', '.join(raised)}."))
    return failed


def _is_text(media_type: str) -> bool:
    return media_type.startswith("text/") or media_type in ("", "text")


def _fits(media_type: str, answer: str) -> Optional[str]:
    """Why the answer is not in this format; None when it is."""
    if _is_text(media_type):
        return None
    if media_type == "application/x-ipynb+json":
        try:
            notebook = json.loads(answer)
        except ValueError:
            return "Its answer is not a notebook: it is not JSON."
        if not isinstance(notebook, dict) or not isinstance(
            notebook.get("cells"), list
        ):
            return "Its answer is not a notebook: it has no cells."
        return None
    if media_type.endswith("json"):
        try:
            json.loads(answer)
        except ValueError:
            return f"Its answer is not {media_type}: it is not JSON."
        return None
    # A format this runtime cannot read is not checked, and said so.
    return None


def shape_of(spec: AppSpec, answer: str) -> Optional[str]:
    """Why the answer does not have the shape its interface says; None when it does.

    An answer fits when it is in one of the formats its interface lists
    (``interface.outputs``; plain text when it lists none), and, for a
    decision, when it names one of the alternatives it decides between.
    """
    text = answer.strip()
    if not text:
        return WORDS["nothing"]
    formats = [
        str(media_type).strip() for media_type in spec.interface.outputs if media_type
    ]
    if formats:
        reasons = [_fits(media_type, text) for media_type in formats]
        if all(reason is not None for reason in reasons):
            return " ".join(reason for reason in reasons if reason)
    decision = spec.decision
    if decision is not None and decision.alternatives:
        lowered = text.lower()
        if not any(
            alternative.strip() and alternative.strip().lower() in lowered
            for alternative in decision.alternatives
        ):
            return (
                "Its answer names none of its alternatives: "
                + ", ".join(decision.alternatives)
                + "."
            )
    return None


def sources_read(spec: AppSpec, tools: Sequence[str]) -> Optional[str]:
    """Why it did not answer from its sources; None when it did, or names none.

    Read from what it did: an application that names documents searches
    them (`documents.SEARCH_TOOL`) before it answers.
    """
    from agent_runtimes.loop.apps.documents import SEARCH_TOOL

    if not any(source.strip() for source in spec.contents):
        return None
    if any(tool == SEARCH_TOOL for tool in tools):
        return None
    return WORDS["not_from_sources"]


# --- the report -----------------------------------------------------------------


@dataclass(frozen=True)
class CaseResult:
    """What came of one test conversation."""

    ask: str
    expect: str
    state: str
    """`passed`, `failed` or `not_run` (`own.PASSED`, `FAILED`, `NOT_RUN`)."""
    check: str = ""
    """What failed it or stopped it: a built-in check by name (`BUILT_IN`),
    a Guard's or a Gate's id, a check of its code by name, `rules`; empty
    when it passed or was not run."""
    says: str = ""
    """In a sentence: why it failed, or why it was not run."""
    answer: str = ""
    """What it answered, cut short."""
    code: str = ""
    """The function of its code that decided it, when one did."""

    def as_dict(self) -> Dict[str, Any]:
        return {
            "ask": self.ask,
            "expect": self.expect,
            "state": self.state,
            "check": self.check,
            "says": self.says,
            "answer": self.answer,
            "code": self.code,
        }


@dataclass
class ValidationReport:
    """A run of an application's tests: every case, and the run in one sentence."""

    app: str
    name: str
    version: str
    """The spec's own version (``version: 0.0.3``), not the saved one."""
    cases: List[CaseResult] = field(default_factory=list)
    checks: List[str] = field(default_factory=list)
    """The checks that ran: the built-in four, then the Guards executed, by id."""
    unexecuted: List[str] = field(default_factory=list)
    """The Guards and Gates named that this runtime does not run, in sentences."""
    where: str = HERE
    at: str = ""
    """When it ended, ISO 8601."""

    @property
    def passed(self) -> int:
        return sum(case.state == PASSED for case in self.cases)

    @property
    def failed(self) -> int:
        return sum(case.state == FAILED for case in self.cases)

    @property
    def not_run(self) -> int:
        return sum(case.state == NOT_RUN for case in self.cases)

    @property
    def total(self) -> int:
        return len(self.cases)

    @property
    def pass_rate(self) -> Optional[float]:
        """The share of the cases that answered which passed; None when none did."""
        answered = self.passed + self.failed
        return self.passed / answered if answered else None

    @property
    def stopped(self) -> int:
        """The cases a check stopped or failed, by name: not the test itself."""
        return sum(
            case.state == FAILED and case.check not in ("", CHECK_EXPECTED)
            for case in self.cases
        )

    @property
    def says(self) -> str:
        """*Its tests: 2 of 3 passed; 1 stopped by a check. 1 not run.*"""
        if not self.cases:
            return "It has no test."
        said = f"Its tests: {self.passed} of {self.total} passed"
        if self.stopped:
            said += f"; {self.stopped} stopped by a check"
        said += "."
        if self.not_run:
            said += f" {self.not_run} not run."
        return said

    def as_dict(self) -> Dict[str, Any]:
        return {
            "app": self.app,
            "name": self.name,
            "version": self.version,
            "where": self.where,
            "at": self.at,
            "checks": list(self.checks),
            "unexecuted": list(self.unexecuted),
            "says": self.says,
            "passed": self.passed,
            "failed": self.failed,
            "not_run": self.not_run,
            "total": self.total,
            "pass_rate": self.pass_rate,
            "cases": [case.as_dict() for case in self.cases],
        }


#: How much of an answer the report keeps.
MAX_ANSWER = 2000

#: How a model judge is asked (`safety.JudgeCall`): ``(prompt, model) -> text``.
JudgeCall = Callable[[str, str], str]


def expected_rubric(ask: str) -> str:
    """The Studio's rubric for the test itself (`appTestRun.checksOf`)."""
    return (
        f"An application was asked: “{ask}”. The expected output says, in its "
        "builder's words, what it should do. Score 1 when the answer does that; "
        "0 when it does not."
    )


def judge_expected(
    ask: str, expect: str, answer: str, judge: JudgeCall, *, model: str = ""
) -> Tuple[bool, str]:
    """The test itself, judged as the Evals engine judges it: whether it passed, and why not."""
    from agent_runtimes.evals.remote.evaluators import run_case_evaluators

    graded = run_case_evaluators(
        output=answer,
        expected=expect,
        evaluators=[
            {
                "name": "llm_judge",
                "arguments": {
                    "rubric": expected_rubric(ask),
                    "threshold": THRESHOLD,
                    "failure_modes": [NOT_AS_EXPECTED],
                    "_judge": judge,
                    "model": model,
                },
            }
        ],
    )
    record = (graded.get("evaluators") or [{}])[0]
    reason = str(record.get("reason") or "").strip()
    if graded.get("passed"):
        return True, ""
    return False, f"{WORDS['not_expected']} {reason}".strip()


def _check_of(verdict: Any) -> str:
    gate = str(getattr(verdict, "gate", "") or "")
    return CHECK_SENSITIVE if gate == "built-in" else gate


def _clip(text: str) -> str:
    return text if len(text) <= MAX_ANSWER else text[:MAX_ANSWER].rstrip() + "…"


def _answer_of(had: Any) -> str:
    from agent_runtimes.loop.apps.session import Message

    shown: Dict[str, Any] = {}
    for event in had.events:
        if isinstance(event, Message):
            shown[event.id] = event
    said = [message.text for message in shown.values()]
    if had.asked:
        said.append(f"(It asks the person: {had.asked})")
    return "\n".join(said)


def _conversation_of(case: Any, had: Any) -> Conversation:
    from agent_runtimes.loop.apps.session import Message, Step

    shown: Dict[str, Any] = {}
    steps: List[Any] = []
    for event in had.events:
        if isinstance(event, Message):
            shown[event.id] = event
        elif isinstance(event, Step) and event.ended_at is not None:
            steps.append(event)
    messages = tuple(shown.values())
    return Conversation(
        ask=case.ask,
        answer="\n".join(message.text for message in messages),
        messages=messages,
        steps=tuple(steps),
        asked=had.asked,
    )


def _stopped_by(had: Any) -> Optional[Tuple[str, str]]:
    """The check that stopped the turn, when one did: its name and its sentence."""
    stops = [
        verdict
        for _stage, verdict in had.checks
        if getattr(verdict, "action", "") in ("stop", "ask")
    ]
    if stops:
        return _check_of(stops[-1]), str(getattr(stops[-1], "sentence", ""))
    if had.error and had.checks:
        # The answer was asked again until the model gave up: the last word is the check's.
        _stage, last = had.checks[-1]
        return _check_of(last), str(getattr(last, "sentence", ""))
    return None


async def result_of(
    case: Any,
    had: Any,
    *,
    application: Any,
    checks: AppChecks,
    judge: Optional[JudgeCall],
    model: str = "",
) -> CaseResult:
    """One case read: stopped on the way, then the built-in checks and the
    Guards on its answer, then the test itself."""
    from agent_runtimes.loop.apps.session import call

    ask, expect, code = case.ask, case.expect, getattr(case, "code", "") or ""
    stopped = _stopped_by(had)
    if stopped is not None:
        check, sentence = stopped
        return CaseResult(ask, expect, FAILED, check, sentence, "", code)
    if had.error:
        if had.error.startswith("AppRuleBlockedError"):
            said = had.error.partition(":")[2].strip()
            return CaseResult(ask, expect, FAILED, CHECK_RULES, said, "", code)
        if had.error.startswith("AppCheckBlockedError"):
            said = had.error.partition(":")[2].strip()
            return CaseResult(ask, expect, FAILED, CHECK_SENSITIVE, said, "", code)
        return CaseResult(ask, expect, NOT_RUN, "", had.error, "", code)
    answer = _answer_of(had)
    clipped = _clip(answer)
    sensitive = sensitive_in(answer)
    if sensitive is not None:
        return CaseResult(
            ask, expect, FAILED, CHECK_SENSITIVE, sensitive, clipped, code
        )
    for guard_id, sentence in guard_failures(checks, answer):
        return CaseResult(ask, expect, FAILED, guard_id, sentence, clipped, code)
    shape = shape_of(application.spec, answer)
    if shape is not None:
        return CaseResult(ask, expect, FAILED, CHECK_SHAPE, shape, clipped, code)
    sources = sources_read(application.spec, had.tools)
    if sources is not None:
        return CaseResult(ask, expect, FAILED, CHECK_SOURCES, sources, clipped, code)
    if code:
        handler = application.tests.get(code)
        if handler is None:
            return CaseResult(
                ask,
                expect,
                NOT_RUN,
                "",
                WORDS["not_in_code"].format(code=code),
                clipped,
                code,
            )
        try:
            passed, why = verdict_of(
                code, await call(handler, _conversation_of(case, had))
            )
        except Exception as error:  # noqa: BLE001 - a test that raises is said, not passed
            return CaseResult(
                ask,
                expect,
                NOT_RUN,
                "",
                f"{code} raised {type(error).__name__}: {error}",
                clipped,
                code,
            )
        if passed:
            return CaseResult(ask, expect, PASSED, "", WORDS["passed"], clipped, code)
        return CaseResult(ask, expect, FAILED, CHECK_EXPECTED, why, clipped, code)
    if judge is None:
        return CaseResult(ask, expect, NOT_RUN, "", WORDS["no_judge"], clipped, code)
    passed, why = judge_expected(ask, expect, answer, judge, model=model)
    if passed:
        return CaseResult(ask, expect, PASSED, "", WORDS["passed"], clipped, code)
    return CaseResult(ask, expect, FAILED, CHECK_EXPECTED, why, clipped, code)


async def run_tests(
    application: Any,
    *,
    judge: Optional[JudgeCall] = None,
    model: str = "",
    agent: Optional[Callable[[AppSpec], Any]] = None,
    cases: Optional[Sequence[Any]] = None,
) -> ValidationReport:
    """Every test conversation asked of the application in this process, each
    read with the checks on.

    Parameters
    ----------
    application : Application
        The application, its code attached when it has one.
    judge : JudgeCall, optional
        What judges a case its code does not decide; none, and such a case
        is not run.
    model : str
        The judge's model, as it is named to it.
    agent : callable, optional
        How its agent is built; in this process, from its spec, when unsaid.
    cases : sequence, optional
        The cases to ask; its spec's when unsaid.

    Raises
    ------
    AppNotRunnable
        When its agent cannot be built in this process.
    """
    from agent_runtimes.loop.apps.safety import converse_in_process

    spec = application.spec
    asked = list(cases if cases is not None else spec.tests.cases)
    checks = AppChecks.of(spec)
    report = ValidationReport(
        app=spec.id,
        name=spec.name or spec.id,
        version=spec.version,
        checks=[*BUILT_IN, *(guard.id for guard in checks.guards)],
        unexecuted=list(checks.unexecuted),
    )
    if asked:
        conversed = await converse_in_process(application, asked, agent=agent)
        for case, had in zip(asked, conversed):
            report.cases.append(
                await result_of(
                    case,
                    had,
                    application=application,
                    checks=checks,
                    judge=judge,
                    model=model,
                )
            )
    report.at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return report


# --- attached to the saved version ------------------------------------------------


class AttachRefused(Exception):
    """ai-agents would not keep the report, in its own sentence."""


def attach_path(app_uid: str) -> str:
    """Where ai-agents keeps a report against a saved version."""
    from urllib.parse import quote

    return f"/api/ai-agents/v1/evals/apps/{quote(app_uid, safe='')}/validation"


def attach(
    http: Any, base_url: str, *, app_uid: str, version: int, report: ValidationReport
) -> Dict[str, Any]:
    """Hand the report to ai-agents, which keeps it against that saved version
    of the application — the version this file is — as the Studio keeps a run
    of the Evals engine, so Readiness and the Ship tab read it.

    Parameters
    ----------
    http : httpx.Client
        Signed in: carries the caller's token.
    base_url : str
        Where ai-agents answers (the platform's URL).

    Returns
    -------
    dict
        The validation as kept.

    Raises
    ------
    AttachRefused
        When ai-agents refuses, in its sentence.
    """
    import httpx

    try:
        response = http.post(
            f"{base_url.rstrip('/')}{attach_path(app_uid)}",
            json={"version": version, "report": report.as_dict()},
        )
    except httpx.HTTPError as error:
        raise AttachRefused(f"ai-agents could not be reached: {error}") from None
    try:
        body = response.json()
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    if response.status_code >= 300 or body.get("success") is False:
        said = body.get("detail") or body.get("message") or response.status_code
        if isinstance(said, dict):
            said = said.get("message") or said
        raise AttachRefused(str(said))
    kept = body.get("validation")
    return kept if isinstance(kept, dict) else {}


__all__ = [
    "BUILT_IN",
    "CHECK_EXPECTED",
    "CHECK_RULES",
    "CHECK_SENSITIVE",
    "CHECK_SHAPE",
    "CHECK_SOURCES",
    "HERE",
    "NOT_AS_EXPECTED",
    "WORDS",
    "AttachRefused",
    "CaseResult",
    "ValidationReport",
    "attach",
    "attach_path",
    "expected_rubric",
    "guard_failures",
    "judge_expected",
    "result_of",
    "run_tests",
    "sensitive_in",
    "shape_of",
    "sources_read",
]

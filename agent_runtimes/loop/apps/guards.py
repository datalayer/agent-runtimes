# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's checks, executed (LOOP R-06).

agentspecs declares Guards and Gates; this is the first runtime that runs
them. Three things happen, at three moments:

- **built in**, for every application: nothing that looks like a credential
  leaves — not in a tool's arguments, not in the answer;
- **the Guards it names** run at their stages and give their signals. A Guard
  this runtime knows how to execute is executed; one it does not (a Guard
  judged by a Cog or by a person) is said at the start of the session, never
  passed in silence;
- **the Gates it names** read those signals and do what they say: stop, send
  the step back, or ask a person.

A Gate that stops raises :class:`AppCheckBlockedError`, which the runtime
reports as it reports a rule's refusal.
"""

from __future__ import annotations

import fnmatch
import json
import logging
import re
from dataclasses import dataclass, field, replace
from typing import (
    Any,
    AsyncIterable,
    Awaitable,
    Callable,
    Dict,
    List,
    Mapping,
    Optional,
)

from pydantic_ai import ModelRetry, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import (
    AgentStreamEvent,
    PartDeltaEvent,
    PartEndEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
)
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.guardrails.common import GuardrailBlockedError
from agent_runtimes.types import AppSpec

logger = logging.getLogger(__name__)

PREFLIGHT = "preflight"
IN_FLIGHT = "in_flight"
POST_RUN = "post_run"

#: What a credential looks like, by kind. Precise patterns only: a check that
#: cries wolf is turned off, and then it checks nothing.
CREDENTIALS: Dict[str, re.Pattern[str]] = {
    "a private key": re.compile(r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----"),
    "an AWS access key": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "a GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    "a Slack token": re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}\b"),
    "an API key": re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b"),
    "a Google API key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "a signed token": re.compile(
        r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"
    ),
}


#: What a credential becomes in what is shown.
WITHHELD = "[a credential, withheld]"

_PRIVATE_KEY_BLOCK = re.compile(
    r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----.*?(?:-----END (?:[A-Z]+ )?PRIVATE KEY-----|\Z)",
    re.DOTALL,
)


_PRIVATE_KEY_END = re.compile(r"-----END [A-Z ]+-----")


def redact(text: str) -> str:
    """A text with every credential in it withheld; a key block to its end."""
    text = _PRIVATE_KEY_BLOCK.sub(WITHHELD, text)
    for kind, pattern in CREDENTIALS.items():
        if kind != "a private key":
            text = pattern.sub(WITHHELD, text)
    return text


def _text_of(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str)
    except (TypeError, ValueError):
        return str(value)


def credentials_in(value: Any) -> List[str]:
    """The kinds of credential a value holds, in order, each once."""
    text = _text_of(value)
    return [kind for kind, pattern in CREDENTIALS.items() if pattern.search(text)]


def _keys_of(value: Any) -> List[str]:
    keys: List[str] = []
    if isinstance(value, Mapping):
        for key, inner in value.items():
            keys.append(str(key))
            keys.extend(_keys_of(inner))
    elif isinstance(value, (list, tuple)):
        for inner in value:
            keys.extend(_keys_of(inner))
    return keys


def denied_fields_in(value: Any, denied: List[str]) -> List[str]:
    """The fields of a value its guardrail denies, by their glob (`*Password*`)."""
    found = []
    for key in _keys_of(value):
        if any(fnmatch.fnmatch(key.lower(), pattern.lower()) for pattern in denied):
            found.append(key)
    return sorted(set(found))


# --- the Guards -------------------------------------------------------------------


@dataclass
class Signals:
    """What the Guards found at one moment, by signal name."""

    values: Dict[str, Any] = field(default_factory=dict)
    because: Dict[str, str] = field(default_factory=dict)

    def set(self, name: str, value: Any, because: str = "") -> None:
        self.values[name] = value
        if because:
            self.because[name] = because


#: A Guard this runtime executes: from its spec, the application, the stage
#: and what is checked (a tool call's name and arguments, or the answer), to
#: its signals.
GuardRun = Callable[[Any, AppSpec, str, Mapping[str, Any], Signals], None]


def _sensitive_data(
    guard: Any, app: AppSpec, stage: str, seen: Mapping[str, Any], signals: Signals
) -> None:
    value = seen.get("args") if stage == IN_FLIGHT else seen.get("output")
    kinds = credentials_in(value)
    denied = list(
        getattr(getattr(guard, "data_scope", None), "denied_fields", []) or []
    )
    fields = denied_fields_in(value, denied) if denied else []
    found = kinds + [f"the field `{name}`" for name in fields]
    signals.set(
        "sensitive_data_detected",
        bool(found),
        ", ".join(found),
    )


def _tool_use_policy(
    guard: Any, app: AppSpec, stage: str, seen: Mapping[str, Any], signals: Signals
) -> None:
    decision = seen.get("decision")
    unclassed = bool(
        decision is not None and getattr(decision, "because", "") == "unclassed"
    )
    signals.set(
        "tool_violation",
        unclassed,
        f"`{seen.get('tool')}` is not a tool the application declares"
        if unclassed
        else "",
    )


#: The Guards this runtime executes, by id.
EXECUTORS: Dict[str, GuardRun] = {
    "sensitive-data-guard": _sensitive_data,
    "tool-use-policy-guard": _tool_use_policy,
}


def _id_of(ref: str) -> str:
    base, _, version = str(ref).rpartition(":")
    return base if base and "." in version else str(ref)


# --- the Gates --------------------------------------------------------------------

_COMPARISON = re.compile(r"^\s*([a-z_]+)\s*(==|!=|<=|>=|<|>)\s*(\S+)\s*$")


def holds(condition: str, signals: Mapping[str, Any]) -> Optional[bool]:
    """Whether a Gate's `when` holds; None when a signal it reads is missing.

    The language of the catalogue: `always`, a signal, a comparison with a
    number or a boolean, joined by `or` and `and`.
    """
    condition = condition.strip()
    if condition == "always":
        return True
    if " or " in condition:
        parts = [holds(part, signals) for part in condition.split(" or ")]
        if any(part is True for part in parts):
            return True
        return None if any(part is None for part in parts) else False
    if " and " in condition:
        parts = [holds(part, signals) for part in condition.split(" and ")]
        if any(part is False for part in parts):
            return False
        return None if any(part is None for part in parts) else True
    match = _COMPARISON.match(condition)
    if match is None:
        if condition not in signals:
            return None
        return bool(signals[condition])
    name, operator, raw = match.groups()
    if name not in signals:
        return None
    value = signals[name]
    expected: Any = {"true": True, "false": False}.get(raw.lower())
    if expected is None:
        try:
            expected = float(raw)
        except ValueError:
            return None
    return {
        "==": value == expected,
        "!=": value != expected,
        "<": value < expected,
        "<=": value <= expected,
        ">": value > expected,
        ">=": value >= expected,
    }[operator]


#: What a Gate may do, and what this runtime does for it.
STOPS = {"stop_and_escalate", "pause"}
RETRIES = {"retry"}
ASKS = {"human_approval_required", "human_review_required", "expert_review_required"}


#: Told what came of asking a person (LOOP R-07): the tool, the sentence it was
#: asked under, the outcome — ``approved``, ``declined`` or ``unanswered`` —
#: and what the person said with it.
Answered = Callable[[str, str, str, str], None]


async def asked_and_answered(
    asking: Awaitable[Any], tool: str, under: str, answered: Optional[Answered]
) -> None:
    """Ask a person, and tell ``answered`` what came of it, before going on.

    Declined is any refusal of the call (the tool-approval path's, a
    session's, a rule's or a Gate's); unanswered, a question that waited past
    its time. Raised on as it was: the record is told, the run decides.
    """
    from agent_runtimes.guardrails.tool_approvals import ToolApprovalTimeoutError

    try:
        await asking
    except (ToolApprovalTimeoutError, TimeoutError) as error:
        if answered is not None:
            answered(tool, under, "unanswered", "")
        raise error
    except GuardrailBlockedError as error:
        if answered is not None:
            answered(tool, under, "declined", str(getattr(error, "note", "") or ""))
        raise error
    if answered is not None:
        answered(tool, under, "approved", "")


class AppCheckBlockedError(GuardrailBlockedError):
    """What an application's checks stopped, in a sentence."""


@dataclass(frozen=True)
class Verdict:
    """What the checks decided at one moment: proceed, retry, ask or stop."""

    action: str
    sentence: str = ""
    gate: str = ""


PROCEED = Verdict("proceed")


@dataclass
class AppChecks:
    """An application's checks: what runs, and what does not."""

    app: AppSpec
    guards: List[Any] = field(default_factory=list)
    gates: List[Any] = field(default_factory=list)
    #: The Guards named that this runtime cannot execute, in sentences.
    unexecuted: List[str] = field(default_factory=list)

    @classmethod
    def of(cls, app: AppSpec) -> "AppChecks":
        from agent_runtimes.specs.gates import get_gate
        from agent_runtimes.specs.guards import get_guard

        checks = cls(app=app)
        for ref in app.checks.guards:
            guard = get_guard(_id_of(ref))
            if guard is None:
                checks.unexecuted.append(f"There is no Guard named {ref!r}.")
            elif guard.id not in EXECUTORS:
                checks.unexecuted.append(
                    f"The {guard.name} is judged by {_judge(guard.method)}, "
                    "which this runtime does not run yet: it is not checked."
                )
            else:
                checks.guards.append(guard)
        for ref in app.checks.gates:
            gate = get_gate(_id_of(ref))
            if gate is None:
                checks.unexecuted.append(f"There is no Gate named {ref!r}.")
            else:
                checks.gates.append(gate)
        return checks

    def signals_at(self, stage: str, seen: Mapping[str, Any]) -> Signals:
        signals = Signals()
        for guard in self.guards:
            if stage in (guard.stages or []):
                EXECUTORS[guard.id](guard, self.app, stage, seen, signals)
        return signals

    def verdict_at(self, stage: str, seen: Mapping[str, Any]) -> Verdict:
        """What the checks decide at a stage, built-ins first."""
        built_in = credentials_in(
            seen.get("args") if stage == IN_FLIGHT else seen.get("output")
        )
        if built_in:
            where = (
                f"The arguments of `{seen.get('tool')}` hold"
                if stage == IN_FLIGHT
                else "The answer holds"
            )
            sentence = f"{where} {built_in[0]}: nothing sensitive leaves."
            return Verdict(
                "retry" if stage == POST_RUN else "stop", sentence, "built-in"
            )
        signals = self.signals_at(stage, seen)
        for gate in self.gates:
            # A Gate before anything leaves reads the answer too: it leaves.
            if gate.stage != stage and not (
                stage == POST_RUN and gate.stage == IN_FLIGHT
            ):
                continue
            held = holds(gate.when, signals.values)
            if not held:
                continue
            reasons = "; ".join(
                text
                for name, text in signals.because.items()
                if text and name in gate.when
            )
            sentence = f"{gate.name}: {reasons or gate.when}."
            if gate.then in STOPS:
                return Verdict("stop", sentence, gate.id)
            if gate.then in RETRIES:
                return Verdict("retry", sentence, gate.id)
            if gate.then in ASKS:
                return Verdict("ask", sentence, gate.id)
            return Verdict(
                "stop", f"{sentence} ({gate.then} is not run yet: stopped.)", gate.id
            )
        return PROCEED


def _judge(method: str) -> str:
    return {"cog": "a Cog", "human": "a person"}.get(method, f"the `{method}` method")


Ask = Callable[[str, Dict[str, Any], str], Awaitable[None]]

#: Told that a person is asked: the tool, and why, in a sentence.
Notify = Callable[[str, str], Awaitable[None]]


@dataclass
class AppChecksCapability(AbstractCapability[Any]):
    """Run an application's checks at the start, on every tool call and on the answer."""

    checks: AppChecks

    agent_id: Optional[str] = None

    app_uid: str = ""
    """The application as the platform knows it, when it does (LOOP U-19)."""

    ask: Optional[Ask] = None
    """How a person is asked, when a Gate says so: the tool-approval path when unsaid."""

    decide: Optional[Callable[[str, Dict[str, Any]], Any]] = None
    """The rules' decision on a call, which some Guards read."""

    record: Optional[Callable[[str, Verdict], None]] = None
    """Told of every verdict that does not let a step pass, by stage."""

    notify: Optional[Notify] = None
    """Told when a person is asked through the tool-approval path: the
    application's channels (LOOP R-37)."""

    answered: Optional[Answered] = None
    """Told what came of asking a person: the record's approval (LOOP R-07)."""

    async def before_run(self, ctx: RunContext[Any]) -> None:
        for sentence in self.checks.unexecuted:
            logger.warning("%s: %s", self.checks.app.id, sentence)

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        seen: Dict[str, Any] = {"tool": call.tool_name, "args": args}
        if self.decide is not None:
            try:
                seen["decision"] = self.decide(call.tool_name, args).decision
            except Exception:  # noqa: BLE001 - a Guard that cannot read the rules reads nothing
                pass
        verdict = self.checks.verdict_at(IN_FLIGHT, seen)
        if verdict.action != "proceed" and self.record is not None:
            self.record(IN_FLIGHT, verdict)
        if verdict.action == "retry":
            raise ModelRetry(verdict.sentence)
        if verdict.action == "ask":
            await asked_and_answered(
                self._ask(call.tool_name, args, verdict.sentence),
                call.tool_name,
                verdict.sentence,
                self.answered,
            )
            return args
        if verdict.action == "stop":
            raise AppCheckBlockedError(verdict.sentence)
        return args

    async def _ask(self, tool_name: str, args: Dict[str, Any], sentence: str) -> None:
        if self.ask is not None:
            await self.ask(tool_name, args, sentence)
            return
        from agent_runtimes.guardrails.tool_approvals import (
            ToolApprovalConfig,
            ToolApprovalManager,
        )

        if self.notify is not None:
            await self.notify(tool_name, sentence)
        config = ToolApprovalConfig.from_env()
        config.agent_id = self.agent_id or config.agent_id
        await ToolApprovalManager(config).request_and_wait(
            tool_name=tool_name,
            tool_args={
                **{key: str(value)[:500] for key, value in args.items()},
                # Whose, and why: a Gate asks as a rule does (LOOP U-19).
                **_marks_of(self.checks.app.id, self.app_uid, sentence),
            },
        )

    async def wrap_run_event_stream(
        self, ctx: RunContext[Any], *, stream: AsyncIterable[AgentStreamEvent]
    ) -> AsyncIterable[AgentStreamEvent]:
        """What is shown as it streams, credentials withheld.

        Text is let through up to its last whitespace: a credential is one
        run of characters, so it is never cut in two — and a key block is
        withheld from its first line, to its end.
        """
        raw: Dict[int, str] = {}
        shown: Dict[int, str] = {}

        def safe(index: int, final: bool) -> str:
            text = raw.get(index, "")
            if not final:
                cut = max(text.rfind(" "), text.rfind("\n"), text.rfind("\t")) + 1
                # A block that has begun is held until it has ended.
                begun = text.rfind("-----BEGIN")
                if begun >= 0 and not _PRIVATE_KEY_END.search(text, begun):
                    cut = min(cut, begun)
                text = text[:cut]
            red = redact(text)
            done = shown.get(index, "")
            if not red.startswith(done) or len(red) <= len(done):
                return ""
            shown[index] = red
            return red[len(done) :]

        try:
            async for event in stream:
                if isinstance(event, PartStartEvent) and isinstance(
                    event.part, TextPart
                ):
                    raw[event.index] = event.part.content
                    shown[event.index] = ""
                    yield replace(
                        event,
                        part=replace(event.part, content=safe(event.index, False)),
                    )
                elif (
                    isinstance(event, PartDeltaEvent)
                    and isinstance(event.delta, TextPartDelta)
                    and event.index in raw
                ):
                    raw[event.index] += event.delta.content_delta
                    more = safe(event.index, False)
                    if more:
                        yield replace(
                            event, delta=replace(event.delta, content_delta=more)
                        )
                elif isinstance(event, PartEndEvent) and event.index in raw:
                    rest = safe(event.index, True)
                    if rest:
                        yield PartDeltaEvent(
                            index=event.index, delta=TextPartDelta(content_delta=rest)
                        )
                    if isinstance(event.part, TextPart):
                        yield replace(
                            event,
                            part=replace(
                                event.part, content=redact(event.part.content)
                            ),
                        )
                    else:
                        yield event
                    raw.pop(event.index, None)
                else:
                    yield event
        finally:
            close = getattr(stream, "aclose", None)
            if close is not None:
                await close()

    async def after_output_process(
        self, ctx: RunContext[Any], *, output_context: Any, output: Any
    ) -> Any:
        verdict = self.checks.verdict_at(POST_RUN, {"output": output})
        if verdict.action != "proceed" and self.record is not None:
            self.record(POST_RUN, verdict)
        if verdict.action == "retry":
            raise ModelRetry(f"{verdict.sentence} Answer again without it.")
        if verdict.action in ("stop", "ask"):
            # An answer is not a call to approve: one that a Gate stops is not given.
            raise AppCheckBlockedError(verdict.sentence)
        return output


__all__ = [
    "AppCheckBlockedError",
    "AppChecks",
    "AppChecksCapability",
    "EXECUTORS",
    "Verdict",
    "credentials_in",
    "denied_fields_in",
    "redact",
    "holds",
]


def _marks_of(app_id: str, app_uid: str, sentence: str) -> Dict[str, str]:
    """A Gate's approval marked as a rule's is, with `_check` for its sentence."""
    from agent_runtimes.loop.apps.enforcement import approval_marks

    marks = approval_marks(app_id, app_uid, sentence)
    marks["_check"] = marks.pop("_rule")
    return marks

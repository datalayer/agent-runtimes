# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's checks, executed (LOOP R-06).

agentspecs declares Guards and Gates; this is the first runtime that runs
them. Three things happen, at three moments:

- **built in**, for every application: nothing that looks like a credential
  leaves — not in a tool's arguments, not in the answer — and none is given
  to its model in its instructions;
- **the Guards it names** run at their stages and give their signals. A Guard
  this runtime knows how to execute is executed; one it does not (a Guard
  judged by a Cog or by a person) is said at the start of the session, never
  passed in silence;
- **the Gates it names** read those signals and do what they say: stop, send
  the step back, or ask a person.

The stages: **preflight**, at a session's start before its model is first
asked — every preflight Guard it names runs once per session, each written
to the record as a ``check`` entry, passed or failed, and one that fails
stops the session with its sentence, a Gate reading it or not (there is
nothing to send back or retry before the first turn); **in_flight**, on
every tool call; **post_run**, on the answer.

A Gate that stops raises :class:`AppCheckBlockedError`, which the runtime
reports as it reports a rule's refusal.
"""

from __future__ import annotations

import fnmatch
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
    Set,
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
from pydantic_ai.models import ModelRequestContext
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.guardrails.common import GuardrailBlockedError

# What a credential is, and what it becomes in what is shown, are the
# runtime's (LOOP R-19): the secrets it holds by their value, then what looks
# like one. Named here too, as the checks have always named them.
from agent_runtimes.guardrails.credentials import credentials_in, redact
from agent_runtimes.types import AppSpec

logger = logging.getLogger(__name__)

PREFLIGHT = "preflight"
IN_FLIGHT = "in_flight"
POST_RUN = "post_run"

_PRIVATE_KEY_END = re.compile(r"-----END [A-Z ]+-----")


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


# --- at a session's start --------------------------------------------------------
#
# The catalogue's preflight Guards check an Op before it runs; an application
# is checked the same way, from its Appspec, before its model is first asked.


def _required_frame(
    guard: Any, app: AppSpec, stage: str, seen: Mapping[str, Any], signals: Signals
) -> None:
    """Every context it works under is there, enabled, and its organization's when it says so."""
    from agentspecs.frames import is_organization_frame

    from agent_runtimes.loop.apps.frames import NO_ORGANIZATION
    from agent_runtimes.loop.apps.loading import frame_id_of
    from agent_runtimes.specs.frames import get_frame

    organization = seen.get("organization") or NO_ORGANIZATION
    missing: List[str] = []
    for ref in app.context:
        if is_organization_frame(ref):
            if organization.organization_uid is None:
                missing.append(
                    f"`{ref}` is a context of an organization's own, and the "
                    "application belongs to no organization that was said"
                )
            elif frame_id_of(ref) not in organization.versions:
                missing.append(f"its organization has no context named `{ref}`")
            continue
        frame = get_frame(_id_of(ref))
        if frame is None:
            missing.append(f"there is no context named `{ref}` in the catalogue")
        elif not frame.enabled:
            missing.append(f"the context `{ref}` is not offered today")
    signals.set("frames_missing", bool(missing), "; ".join(missing))


#: A guardrail's permissions, and what an application does that needs each.
PERMISSION_WORDS = {
    "read_data": "read:data",
    "write_data": "write:data",
    "execute_code": "execute:code",
    "access_internet": "access:internet",
    "send_email": "send:email",
    "deploy_production": "deploy:production",
}


def _is_write(access: Any) -> bool:
    # An enum in agentspecs' model, its value in the runtime's.
    return str(getattr(access, "value", access)) == "write"


def _named(tools: List[str]) -> str:
    listed = sorted(set(tools))
    return ", ".join(listed[:3]) + (
        f" and {len(listed) - 3} more" if len(listed) > 3 else ""
    )


def permissions_needed(app: AppSpec) -> Dict[str, str]:
    """What an application does that a guardrail's permissions name, with why.

    By permission (``read_data``, ``write_data``, ``execute_code``,
    ``access_internet``, ``send_email``, ``deploy_production``): it reads
    what it connects to, its documents and its Spaces; it writes through a
    connection or a Space granted to write, or a tool that writes or deletes;
    it runs code when its computer has a shell; it reaches the internet when
    its computer browses; it sends through a tool that sends; it publishes
    through a tool that publishes.
    """
    from agentspecs.actions import ActionClass, classes_of

    from agent_runtimes.loop.apps.rules import tool_behaviours

    doing: Dict[ActionClass, List[str]] = {}
    for ref in tool_behaviours(app):
        for action in classes_of(ref):
            doing.setdefault(action, []).append(ref)
    for tool in app.tools:
        for action in tool.does:
            doing.setdefault(action, []).append(tool.name)
    needs: Dict[str, str] = {}
    reads = (
        [f"`{_id_of(connection.server)}`" for connection in app.connections]
        + [f"`{content}`" for content in app.contents]
        + [f"the Space `{grant.space}`" for grant in app.permissions.spaces]
    )
    if reads:
        needs["read_data"] = f"it reads {_named(reads)}"
    writes = (
        [f"`{_id_of(c.server)}`" for c in app.connections if _is_write(c.access)]
        + [
            f"the Space `{g.space}`"
            for g in app.permissions.spaces
            if _is_write(g.access)
        ]
        + doing.get(ActionClass.WRITE, [])
        + doing.get(ActionClass.DELETE, [])
    )
    if writes:
        needs["write_data"] = f"it writes through {_named(writes)}"
    if app.permissions.computer.shell:
        needs["execute_code"] = "its computer runs commands"
    if app.permissions.computer.browse:
        needs["access_internet"] = "its computer browses"
    if doing.get(ActionClass.SEND):
        needs["send_email"] = f"it can send ({_named(doing[ActionClass.SEND])})"
    if doing.get(ActionClass.PUBLISH):
        needs["deploy_production"] = (
            f"it can publish ({_named(doing[ActionClass.PUBLISH])})"
        )
    return needs


def _permission(
    guard: Any, app: AppSpec, stage: str, seen: Mapping[str, Any], signals: Signals
) -> None:
    """Each permission the application needs, its guardrail grants."""
    granted = getattr(guard, "permissions", None)
    guardrail = getattr(guard, "guardrail", "") or "its guardrail"
    denied = [
        f"{why}, which `{PERMISSION_WORDS[name]}` of {guardrail} does not allow"
        for name, why in permissions_needed(app).items()
        if not getattr(granted, name, False)
    ]
    signals.set("permission_denied", bool(denied), "; ".join(denied))


def _words_of(text: Any) -> List[str]:
    return re.findall(r"[A-Za-z_][A-Za-z0-9_]*", str(text or ""))


def _matches(value: str, patterns: List[str]) -> bool:
    return any(fnmatch.fnmatch(value.lower(), pattern.lower()) for pattern in patterns)


def _data_source_authorization(
    guard: Any, app: AppSpec, stage: str, seen: Mapping[str, Any], signals: Signals
) -> None:
    """What it reads is within its guardrail's data scope.

    Its connections' servers are the systems; its documents and its Spaces
    the objects; an empty allowed list allows every one (the catalogue's
    default guardrail allows none by name). A denied field is one the
    application's instructions, or what the session was opened with, name.
    """
    scope = getattr(guard, "data_scope", None)
    guardrail = getattr(guard, "guardrail", "") or "its guardrail"
    allowed_systems = list(getattr(scope, "allowed_systems", []) or [])
    allowed_objects = list(getattr(scope, "allowed_objects", []) or [])
    denied_objects = list(getattr(scope, "denied_objects", []) or [])
    denied_fields = list(getattr(scope, "denied_fields", []) or [])
    unauthorized: List[str] = []
    for connection in app.connections:
        server = _id_of(connection.server)
        if allowed_systems and not _matches(server, allowed_systems):
            unauthorized.append(
                f"`{server}` is not among the systems {guardrail} allows "
                f"({', '.join(allowed_systems)})"
            )
    objects = list(app.contents) + [grant.space for grant in app.permissions.spaces]
    for name in objects:
        if denied_objects and _matches(name, denied_objects):
            unauthorized.append(f"`{name}` is an object {guardrail} denies")
        elif allowed_objects and not _matches(name, allowed_objects):
            unauthorized.append(
                f"`{name}` is not among the objects {guardrail} allows "
                f"({', '.join(allowed_objects)})"
            )
    if denied_fields:
        named = sorted(
            {
                word
                for word in _words_of(app.instructions) + _words_of(seen.get("prompt"))
                if _matches(word, denied_fields)
            }
        )
        if named:
            unauthorized.append(
                f"the field{'s' if len(named) > 1 else ''} {_named([f'`{w}`' for w in named])} "
                f"{'are' if len(named) > 1 else 'is'} denied by {guardrail}"
            )
    signals.set("unauthorized_source", bool(unauthorized), "; ".join(unauthorized))


#: The Guards this runtime executes, by id.
EXECUTORS: Dict[str, GuardRun] = {
    "required-frame-guard": _required_frame,
    "permission-guard": _permission,
    "data-source-authorization-guard": _data_source_authorization,
    "sensitive-data-guard": _sensitive_data,
    "tool-use-policy-guard": _tool_use_policy,
}


def _id_of(ref: str) -> str:
    base, _, version = str(ref).rpartition(":")
    return base if base and "." in version else str(ref)


def instructions_of(app: AppSpec) -> List[str]:
    """What the application tells its model besides its agent's own: its
    instructions, and each mode option's and each profile's."""
    texts = [app.instructions]
    for mode in app.interface.modes:
        texts.extend(option.instructions for option in mode.options)
    texts.extend(profile.instructions for profile in app.interface.profiles)
    return [text for text in texts if text]


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
    guard: str = ""
    """The Guard that gave the signal: its id, ``built-in`` for the built-in
    check, several joined by a comma when a Gate read more than one."""
    passed: Optional[bool] = None
    """Whether the check passed; None for a verdict that is no one check's."""


PROCEED = Verdict("proceed")

#: The built-in check's name, where a Guard's id goes.
BUILT_IN = "built-in"


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

    def _raised_by(self, stage: str, signals: Signals) -> str:
        """The Guards of a stage whose signal is raised, by id, joined."""
        return ",".join(
            guard.id
            for guard in self.guards
            if stage in (guard.stages or [])
            and any(signals.values.get(signal.name) is True for signal in guard.signals)
        )

    def _gate_verdict(self, gate: Any, signals: Signals, guard: str) -> Verdict:
        reasons = "; ".join(
            text for name, text in signals.because.items() if text and name in gate.when
        )
        sentence = f"{gate.name}: {reasons or gate.when}."
        if gate.then in STOPS:
            return Verdict("stop", sentence, gate.id, guard, False)
        if gate.then in RETRIES:
            return Verdict("retry", sentence, gate.id, guard, False)
        if gate.then in ASKS:
            return Verdict("ask", sentence, gate.id, guard, False)
        return Verdict(
            "stop",
            f"{sentence} ({gate.then} is not run yet: stopped.)",
            gate.id,
            guard,
            False,
        )

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
                "retry" if stage == POST_RUN else "stop",
                sentence,
                BUILT_IN,
                BUILT_IN,
                False,
            )
        signals = self.signals_at(stage, seen)
        raised = self._raised_by(stage, signals)
        for gate in self.gates:
            # A Gate before anything leaves reads the answer too: it leaves.
            if gate.stage != stage and not (
                stage == POST_RUN and gate.stage == IN_FLIGHT
            ):
                continue
            held = holds(gate.when, signals.values)
            if not held:
                continue
            return self._gate_verdict(gate, signals, raised)
        return PROCEED

    def preflight(self, seen: Mapping[str, Any]) -> List[Verdict]:
        """What the checks decide at a session's start: one verdict per check.

        The built-in check first — nothing shaped like a credential in what
        the application tells its model (its instructions, its modes', its
        profiles'; a stop, never a retry: there is no answer to ask again
        for) — then each preflight Guard it names, run on its Appspec and on
        ``seen`` (``prompt``: what the session was opened with;
        ``organization``: its organization's contexts, when known). A Guard
        whose signal is raised fails: a stop, with the Gate that reads the
        signal named when the application names one, the Guard alone
        otherwise — there is nothing to retry before the first turn.
        """
        verdicts: List[Verdict] = []
        found = credentials_in(instructions_of(self.app))
        verdicts.append(
            Verdict(
                "stop",
                f"The instructions hold {found[0]}: nothing sensitive is given to its model.",
                BUILT_IN,
                BUILT_IN,
                False,
            )
            if found
            else Verdict(
                "proceed", "Nothing sensitive in its instructions.", "", BUILT_IN, True
            )
        )
        for guard in self.guards:
            if PREFLIGHT not in (guard.stages or []):
                continue
            signals = Signals()
            EXECUTORS[guard.id](guard, self.app, PREFLIGHT, seen, signals)
            raised = [name for name, value in signals.values.items() if value is True]
            if not raised:
                verdicts.append(
                    Verdict("proceed", f"{guard.name} passed.", "", guard.id, True)
                )
                continue
            because = "; ".join(
                text for name in raised if (text := signals.because.get(name, ""))
            )
            gate = next(
                (
                    gate
                    for gate in self.gates
                    if gate.stage == PREFLIGHT
                    and any(name in gate.when for name in raised)
                    and holds(gate.when, signals.values)
                ),
                None,
            )
            verdicts.append(
                Verdict(
                    "stop",
                    f"{gate.name if gate else guard.name}: {because or ', '.join(raised)}.",
                    gate.id if gate else "",
                    guard.id,
                    False,
                )
            )
        return verdicts


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

    organization: Optional[Any] = None
    """The contexts of the organization it belongs to (`OrganizationFrames`),
    which the Required Frame Guard reads; none known when unsaid."""

    _preflighted: Set[str] = field(default_factory=set, init=False, repr=False)

    async def before_run(self, ctx: RunContext[Any]) -> None:
        for sentence in self.checks.unexecuted:
            logger.warning("%s: %s", self.checks.app.id, sentence)

    async def preflight(self, session: str, prompt: Any = None) -> None:
        """Run the checks of a session's start, once per session.

        Every verdict of a Guard is recorded, passed or failed; the built-in
        check's when it fails. A session one check stops is not preflighted:
        its next turn is checked, and stopped, again.

        Raises
        ------
        AppCheckBlockedError
            With the sentences of every check that failed.
        """
        if session in self._preflighted:
            return
        verdicts = self.checks.preflight(
            {"prompt": prompt, "organization": self.organization}
        )
        if self.record is not None:
            for verdict in verdicts:
                if verdict.guard != BUILT_IN or verdict.action != "proceed":
                    self.record(PREFLIGHT, verdict)
        failed = [verdict for verdict in verdicts if verdict.action != "proceed"]
        if failed:
            raise AppCheckBlockedError(" ".join(verdict.sentence for verdict in failed))
        self._preflighted.add(session)

    async def before_model_request(
        self, ctx: RunContext[Any], request_context: ModelRequestContext
    ) -> ModelRequestContext:
        # The session's start, before its model is first asked: after every
        # capability's `before_run`, so the record is open to its entries.
        prompt = ctx.prompt if isinstance(ctx.prompt, str) else None
        await self.preflight(str(ctx.conversation_id or ctx.run_id or "run"), prompt)
        return request_context

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
    "BUILT_IN",
    "EXECUTORS",
    "PERMISSION_WORDS",
    "Verdict",
    "credentials_in",
    "denied_fields_in",
    "instructions_of",
    "permissions_needed",
    "redact",
    "holds",
]


def _marks_of(app_id: str, app_uid: str, sentence: str) -> Dict[str, str]:
    """A Gate's approval marked as a rule's is, with `_check` for its sentence."""
    from agent_runtimes.loop.apps.enforcement import approval_marks

    marks = approval_marks(app_id, app_uid, sentence)
    marks["_check"] = marks.pop("_rule")
    return marks

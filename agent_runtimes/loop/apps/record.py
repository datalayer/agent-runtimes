# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The record of an application, written for every session (R-07).

What the runtime saw the application do — a session starting, each tool
call, the rule that decided it, each check that did not let it pass, the
answer — is sent to ai-agents (`/api/ai-agents/v1/apps/records`), which keeps
the living instances of applications. Only what the application's
`record.include` names is kept, for as long as its `record.keep_for` says.

A session run to test the application (the Evals engine's runs) says so:
the instance names its `purpose`, `test`, and the launch that ran it, and
both are sent with its entries, so that ai-agents reads tests apart from
real use. A session that names no purpose is real use. A test's session
keeps every entry, whatever `record.include` says: the engine grades the
test on it (V-08).

A session nobody opened says what woke it (R-14): the instance, or the
host that ran it, names `woken_by` — ``{"kind": "schedule", ...}`` with the
schedule's details — and it is sent with the entries and written on the
session's first one. A session a person opened names nothing.

Who opened a session is sent with its entries (``opened_by``, R-31):
the uid of the person the runtime verified, its owner or anybody it is shown
to — what they export and delete their own conversations by. A session
nobody opened, or opened by somebody nobody knows (an embed's visitor, a
visitor not signed in), names nobody.

A session is a conversation when the run names one, a run otherwise. The
record is sent after each run, with the token the run was made with; a
record that cannot be sent is logged, and never fails the run.

What a person says of a conversation — a thumb up or down, and a comment
(V-18) — is written to the same record, as a ``feedback`` entry of that
session, by the recorder that recorded it (`recorder_of`); only when the
application's ``record.include`` names ``feedback``. Unlike the rest, it is
sent at once and a failure to send it is said: the person is waiting for it.

What its code names a conversation — its title, tags and metadata
(``session.title``, ``session.tags``, ``session.metadata``, P-24) — is
a ``thread`` entry of that session, always kept, sent as it changes: the
person's history lists their threads under it, their own word over its.

What was said — each turn of a conversation, what the person asked and what
it answered — is kept as a ``turn`` entry, under ``conversations``, the
item of ``record.include`` that names it. Each turn says whether the
application let its conversations be used to suggest tests when it was had
(``record.suggest_tests``, V-16): only a turn kept while it was on may
be sampled into a suggested test, and ai-agents samples no other.
"""

from __future__ import annotations

import asyncio
import contextvars
import logging
import os
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import (
    Any,
    AsyncIterable,
    Awaitable,
    Callable,
    Dict,
    Iterator,
    List,
    Mapping,
    Optional,
    Set,
    Tuple,
)

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import (
    AgentStreamEvent,
    FinalResultEvent,
    ModelRequest,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    UserPromptPart,
)
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.guardrails.credentials import redact, redacted
from agent_runtimes.types import AppSpec

logger = logging.getLogger(__name__)

#: What each kind of entry is kept under, in `record.include`.
INCLUDED_BY = {
    "tool_call": "actions",
    "decision": "decisions",
    "check": "checks",
    "approval": "approvals",
    "output": "outputs",
    "feedback": "feedback",
    "turn": "conversations",
    # What the application did, step by step: with its actions (P-16).
    "step": "actions",
    # A harness's edits whole, and its terminals' output (SH-34):
    # each is a hash and a size, or a command and an exit, unless named.
    "diff": "diffs",
    "terminal": "terminals",
    # What the person said, as sound, with their consent (VO-63): kept by
    # ai-agents in its object store, the record pointing at it.
    "audio": "audio",
}

#: Kept whatever `record.include` says: a session's start, a run's start
#: (what Activity reads as in progress, R-15), what its channels were
#: sent (R-37), and that it asked the person and waits (`asked`, what
#: ai-agents tells them of, M-023).
ALWAYS_KEPT = frozenset({"session", "run", "notification", "thread", "asked"})

#: How a run ended, in the `output` entry that ends it (`AppRecorder.ended`):
#: it answered, it stopped (a rule, a check, an error), or its client went
#: before the answer.
RUN_ENDS = ("answered", "stopped", "gone")

#: What a person's answer is said as, in an approval entry (R-07).
ANSWERS = {
    "approved": "approved",
    "declined": "declined",
    "unanswered": "not answered in time",
}

#: What a decision is said as when its call is refused with nobody asked (R-25).
REFUSED = "refused"

#: Why such a call was refused, in the entry's summary.
REFUSALS = {"space_not_granted": "not granted to write that Space"}

#: The session the current run belongs to.
_SESSION: contextvars.ContextVar[str] = contextvars.ContextVar(
    "loop_app_session", default=""
)

Send = Callable[[Dict[str, Any]], Awaitable[None]]

#: The recorder of each session this runtime recorded, by session.
_RECORDERS: Dict[str, "AppRecorder"] = {}

#: The recorder of each application's agent on this runtime, by agent id: the
#: one the session API writes a session's start to (R-04).
_AGENT_RECORDERS: Dict[str, "AppRecorder"] = {}

#: The sends begun as a run starts, held until done: a task nothing refers to may be collected.
#: The sends in flight, by session (R-14): a stream of the session ends
#: only once they are done (`AppRecorder.settled`), so a scheduler that stops
#: the runtime as the stream ends finds the turn on the record.
_SENDING: Dict[str, Set[Any]] = {}


def send_later(session: str, sending: Any) -> Any:
    """Send ``session``'s record in a task of its own, held until done — a
    task nothing refers to may be collected — and counted among what
    `AppRecorder.settled` waits for.
    """
    task = asyncio.get_running_loop().create_task(sending)
    held = _SENDING.setdefault(session, set())
    held.add(task)

    def done(finished: Any) -> None:
        held.discard(finished)
        if not held and _SENDING.get(session) is held:
            _SENDING.pop(session, None)

    task.add_done_callback(done)
    return task


#: The longest comment kept with a thumb.
COMMENT_LIMIT = 2000

#: The longest question, and the longest answer, a turn keeps.
TURN_LIMIT = 4000


def current_session() -> str:
    """The session the current run belongs to, or ``""``."""
    return _SESSION.get()


def recorder_of(session: str) -> Optional["AppRecorder"]:
    """The recorder that recorded a session on this runtime, or None."""
    return _RECORDERS.get(session)


def keep_agent_recorder(agent_id: str, recorder: Optional["AppRecorder"]) -> None:
    """Keep the recorder an application's agent was made with; ``None`` forgets it."""
    if recorder is None:
        _AGENT_RECORDERS.pop(agent_id, None)
    else:
        _AGENT_RECORDERS[agent_id] = recorder


def agent_recorder(agent_id: str) -> Optional["AppRecorder"]:
    """The recorder of an application's agent on this runtime, or None."""
    return _AGENT_RECORDERS.get(agent_id)


def kept_of(app: AppSpec) -> Any:
    """What the record keeps and for how long: as `record` says, or as the
    Track the application names under `checks` says (R-07).

    Read from agentspecs (`kept_record`), not from the generated
    `retention_days`, which is a plain field there and says a year whatever
    `keep_for` says.
    """
    from agentspecs.apps import kept_record

    return kept_record(
        app.record.keep_for,
        list(app.record.include),
        app.checks.track,
    )


def keep_days_of(app: AppSpec) -> int:
    """How many days the record is kept: `record.keep_for`, or its Track's retention."""
    return int(kept_of(app).days)


def _trace_id() -> str:
    """The current run's trace ID, the correlation ID its calls carry to the
    gateway (A-05); ``""`` without a trace, never one made up.
    """
    from agent_runtimes.mcp.tracing import trace_headers
    from agent_runtimes.orchestration.adapter import trace_id_of

    trace_id = trace_id_of(trace_headers().get("traceparent"))
    return trace_id if trace_id and trace_id.strip("0") else ""


def _short(value: Any, limit: int = 500) -> str:
    return redact(str(value))[:limit]


class RecordNotSent(RuntimeError):
    """A record that did not reach ai-agents, and why, in a sentence."""


def token_for(deployment_uid: str) -> Tuple[Optional[str], str]:
    """The token an application's runtime writes to ai-agents with, or why there is none.

    A deployment's is its application's principal's (I-03), and nobody
    else's; anything else — a Preview, a test — writes as the person whose
    request it is, else as the runtime's own token.
    """
    deployment = deployment_uid.strip()
    if deployment:
        from agent_runtimes.loop.apps.principal import (
            principal_token,
            principal_token_refusal,
        )

        token = principal_token(deployment)
        if not token:
            return None, str(principal_token_refusal(deployment))
        return token, ""
    try:
        from agent_runtimes.context.identities import get_request_user_jwt

        token = get_request_user_jwt()
    except Exception:  # noqa: BLE001 - no request context: the runtime's token
        token = None
    token = token or os.environ.get("DATALAYER_USER_TOKEN")
    return (token, "") if token else (None, "no token.")


#: The person's own token during a Preview's run, whose request token is
#: theirs narrowed to the Spaces its application is granted (R-25).
_PERSONS_OWN: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "loop_preview_persons_own_token", default=None
)


@contextmanager
def persons_own_token(token: Optional[str]) -> Iterator[None]:
    """Keep the person's own token beside a Preview's narrowed one, for one run."""
    held = _PERSONS_OWN.set(token or None)
    try:
        yield
    finally:
        _PERSONS_OWN.reset(held)


def own_token_for(deployment_uid: str) -> Tuple[Optional[str], str]:
    """The token for what the runtime does for a person that reaches no Space
    — an application's documents: `token_for`, but in a Preview's run the
    person's own, not the one narrowed to its Space grants (R-25).
    """
    own = _PERSONS_OWN.get()
    if own and not deployment_uid.strip():
        return own, ""
    return token_for(deployment_uid)


async def send_to_ai_agents(body: Dict[str, Any]) -> None:
    """Send a session's entries to ai-agents, with the token of the run.

    Raises
    ------
    RecordNotSent
        When there is no token or no ai-agents to send it to, or ai-agents
        refused it. A run's record is logged and let go (`AppRecorder.flush`);
        a person's feedback is said to them.
    """
    import httpx

    token, refusal = token_for(str(body.get("deployment_uid") or ""))
    if not token:
        raise RecordNotSent(
            f"The record of {body.get('app_uid')} is not sent: {refusal}"
        )
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise RecordNotSent(
            f"The record of {body.get('app_uid')} is not sent: no ai-agents."
        )
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/records",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 300:
        raise RecordNotSent(
            f"The record of {body.get('app_uid')} was refused "
            f"({response.status_code}): {response.text[:200]}"
        )
    logger.info(
        "The record of %s sent: %d entries, session %s.",
        body.get("app_uid"),
        len(body.get("entries") or []),
        body.get("session_uid"),
    )


async def keep_sound_in_ai_agents(
    sound: bytes, *, content_type: str, params: Dict[str, Any]
) -> None:
    """Send a turn's sound to ai-agents to keep (VO-63): its object store
    keeps it, the session's record points at it. With the token of the run,
    as the record is sent.

    Raises
    ------
    RecordNotSent
        When there is no token or no ai-agents, or ai-agents refused it.
    """
    import httpx

    token, refusal = token_for(str(params.get("deployment_uid") or ""))
    if not token:
        raise RecordNotSent(
            f"The sound of {params.get('app_uid')} is not kept: {refusal}"
        )
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise RecordNotSent(
            f"The sound of {params.get('app_uid')} is not kept: no ai-agents."
        )
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/records/audio",
            params=params,
            content=sound,
            headers={"Authorization": f"Bearer {token}", "Content-Type": content_type},
        )
    if response.status_code >= 300:
        raise RecordNotSent(
            f"The sound of {params.get('app_uid')} was not kept "
            f"({response.status_code}): {response.text[:200]}"
        )


#: Sends a turn's sound to keep: ``(sound, content_type=, params=)``.
KeepSound = Callable[..., Awaitable[None]]


@dataclass
class AppRecorder:
    """The entries of an application's sessions, kept until they are sent."""

    app: AppSpec
    #: The application as the platform knows it (its `app` item); its id otherwise.
    app_uid: str = ""
    deployment_uid: str = ""
    version: int = 0
    #: `test` when the session is run to test the application; real use otherwise.
    purpose: str = ""
    #: The launch that ran it, for a test.
    launch_uid: str = ""
    #: What woke its sessions, when nobody opened them: ``{"kind": "schedule", ...}``.
    woken_by: Dict[str, Any] = field(default_factory=dict)
    #: The agent only visitors without an account talk to, on the runtime its
    #: deployment is kept on (R-30): nothing of it is kept, as on theirs.
    visitors: bool = False
    send: Send = send_to_ai_agents
    keep_sound: KeepSound = keep_sound_in_ai_agents

    _pending: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict, init=False)
    _started: Set[str] = field(default_factory=set, init=False)
    _woken: Dict[str, Dict[str, Any]] = field(default_factory=dict, init=False)
    _opened: Dict[str, str] = field(default_factory=dict, init=False)
    _opener_names: Dict[str, str] = field(default_factory=dict, init=False)
    _signed: Dict[str, Dict[str, Any]] = field(default_factory=dict, init=False)
    _turns: Dict[str, int] = field(default_factory=dict, init=False)

    def kept(self, kind: str) -> bool:
        # Nothing is kept of a conversation without an account (R-30).
        from agent_runtimes.loop.apps.visitors import visitors_runtime

        if visitors_runtime() or self.visitors:
            return False
        # What a channel was sent, or why it was not, is always kept: a
        # notification that reached nobody is never silent (R-37).
        if kind in ALWAYS_KEPT:
            return True
        # A test's session keeps everything: its record is what the test is
        # graded on — the tools it called, its rules' decisions, its checks
        # (V-08) — and it is nobody's conversation, read apart.
        if self.purpose == "test":
            return True
        return INCLUDED_BY.get(kind) in kept_of(self.app).include

    def add(
        self, kind: str, summary: str, payload: Optional[Dict[str, Any]] = None
    ) -> None:
        if not self.kept(kind):
            return
        self._append(kind, summary, payload)

    def _append(
        self, kind: str, summary: str, payload: Optional[Dict[str, Any]] = None
    ) -> None:
        session = _SESSION.get()
        if not session:
            return
        # Nothing kept holds a credential, whoever wrote the entry (R-19).
        self._pending.setdefault(session, []).append(
            {
                "kind": kind,
                "summary": redact(summary)[:2000],
                "payload": redacted(payload or {}),
            }
        )

    def opened(self, session: str, person_uid: str, name: str = "") -> None:
        """Say which person opened ``session`` (R-31), and their name when
        it is known (I-10); ``""`` for nobody known.
        """
        if person_uid:
            self._opened[session] = person_uid
        else:
            self._opened.pop(session, None)
        if person_uid and name:
            self._opener_names[session] = name
        else:
            self._opener_names.pop(session, None)

    def opener(self, session: str) -> str:
        """The person who opened ``session``, or ``""``."""
        return self._opened.get(session, "")

    def signed(self, session: str, user: Optional[Dict[str, Any]]) -> None:
        """Say which user the host's server signed for ``session`` (D-21); ``None`` for none."""
        if user:
            self._signed[session] = dict(user)
        else:
            self._signed.pop(session, None)

    def signed_user(self, session: str) -> Dict[str, Any]:
        """The user the host's server signed for ``session`` — ``{sub, name}`` — or ``{}``."""
        return dict(self._signed.get(session) or {})

    def acts_for(self, session: str) -> str:
        """The name of the person it acts for in ``session`` (I-10): the
        user the host's server signed, else who opened it; ``""`` when no name
        is known — never a uid.
        """
        signed = str((self._signed.get(session) or {}).get("name") or "").strip()
        return signed or self._opener_names.get(session, "")

    async def keep_said(
        self,
        session: str,
        sound: bytes,
        *,
        content_type: str,
        language: str = "",
        seconds: float = 0.0,
    ) -> str:
        """Keep what the person said in ``session`` as sound (VO-63), when
        the application's record keeps ``audio`` and a person known opened
        it: ai-agents keeps the sound, the record points at it. Why it was
        not kept, in a sentence, or ``""``.
        """
        if self.purpose == "test" or not self.kept("audio"):
            return "This application's record does not keep what is said as sound."
        opener = self.opener(session)
        if not opener:
            return "Sound is kept only for a person who is signed in."
        params = {
            "app_uid": self.app_uid or self.app.id,
            "session_uid": session,
            "deployment_uid": self.deployment_uid,
            "version": self.version,
            "opened_by": opener,
            "keep_days": keep_days_of(self.app),
            "turn": self._turns.get(session, 0),
            "seconds": round(max(0.0, float(seconds or 0.0)), 2),
            "language": str(language or "")[:35],
        }
        try:
            await self.keep_sound(sound, content_type=content_type, params=params)
        except RecordNotSent as refused:
            logger.warning("%s", refused)
            return str(refused)
        return ""

    def woken(self, session: str) -> Dict[str, Any]:
        """What woke a session: its own, or every session's; empty when a person opened it."""
        return self._woken.get(session) or self.woken_by

    def start(
        self,
        session: str,
        *,
        woken_by: Optional[Dict[str, Any]] = None,
        resumed: bool = False,
    ) -> None:
        """Make ``session`` the one entries are added to, and say it started.

        A session resumed from its record (R-04) says it resumed, in an
        entry of the same session: its record goes on where it stopped.
        """
        _SESSION.set(session)
        if session not in self._started:
            self._started.add(session)
            _RECORDERS[session] = self
            if woken_by:
                self._woken[session] = dict(woken_by)
            woken = self.woken(session)
            self.add(
                "session",
                f"A session of {self.app.name} "
                + ("resumed" if resumed else "started")
                + (f", woken by its {woken.get('kind')}" if woken else ""),
                {
                    "app": self.app.id,
                    **({"woken_by": woken} if woken else {}),
                    **({"resumed": True} if resumed else {}),
                },
            )

    def _body(self, session: str, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        """What is sent to ai-agents for a session's entries."""
        return {
            "app_uid": self.app_uid or self.app.id,
            "session_uid": session,
            "deployment_uid": self.deployment_uid,
            "version": self.version,
            "purpose": self.purpose,
            "launch_uid": self.launch_uid,
            "woken_by": self.woken(session),
            "opened_by": self.opener(session),
            "keep_days": keep_days_of(self.app),
            "entries": entries,
        }

    async def settled(self, session: str) -> None:
        """Wait until every send of ``session``'s record in flight is done,
        then send what is still pending: what a stream's end waits for
        (R-14), so nothing of the turn is lost to a runtime stopped as
        the stream ends. Never fails: a record is never worth a run.
        """
        while _SENDING.get(session):
            await asyncio.gather(*list(_SENDING[session]), return_exceptions=True)
            # Sends that are done leave the set in their callbacks, which a
            # gather of done tasks does not wait for: let them run.
            await asyncio.sleep(0)
        await self.flush(session)

    async def flush(self, session: str) -> None:
        entries = self._pending.pop(session, [])
        if not entries:
            return
        body = self._body(session, entries)
        try:
            await self.send(body)
        except Exception as error:  # noqa: BLE001 - a record is never worth a run
            logger.warning("The record of %s was not sent: %s", body["app_uid"], error)

    def named(
        self,
        session: str,
        *,
        title: str,
        tags: List[str],
        metadata: Dict[str, Any],
    ) -> None:
        """What its code names a conversation now — its title, tags and
        metadata (P-24) — as a ``thread`` entry of ``session``, sent in
        a task of its own when a loop runs, else with the session's next
        send. The latest one stands.
        """
        if not self.kept("thread"):
            return
        self._pending.setdefault(session, []).append(
            {
                "kind": "thread",
                "summary": redact(title)[:2000],
                "payload": redacted(
                    {"title": title, "tags": list(tags), "metadata": dict(metadata)}
                ),
            }
        )
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return
        send_later(session, self.flush(session))

    async def feedback(
        self,
        session: str,
        *,
        liked: bool,
        comment: str = "",
        by: str = "",
        message: str = "",
    ) -> Dict[str, Any]:
        """Write a person's word on a session to the record, and send it now.

        Parameters
        ----------
        session : str
            The session, as this recorder recorded it.
        liked : bool
            The thumb: up or down.
        comment : str
            What they said besides, if anything.
        by : str
            Who said it, as the runtime knows the caller.
        message : str
            The answer it is about, as the chat names it; ``""`` for the
            conversation as a whole.

        Returns
        -------
        dict
            The entry sent.

        Raises
        ------
        ValueError
            When this recorder did not record the session, or the
            application keeps no feedback.
        """
        if session not in self._started:
            raise ValueError(
                f"No session {session!r} of {self.app.name} was recorded here."
            )
        if not self.kept("feedback"):
            raise ValueError(
                f"{self.app.name} keeps no feedback: its record does not name it."
            )
        said = redact(comment.strip())[:COMMENT_LIMIT]
        entry = {
            "kind": "feedback",
            "summary": (
                ("Liked it" if liked else "Did not like it")
                + (f": {said}" if said else "")
            )[:COMMENT_LIMIT],
            "payload": {
                "liked": liked,
                "comment": said,
                "by": by,
                **({"message": message[:200]} if message else {}),
            },
        }
        await self.send(self._body(session, [entry]))
        return entry

    def turned(
        self, asked: str, answered: str, spoken: Optional[Dict[str, str]] = None
    ) -> None:
        """Keep a turn of the conversation: what was asked, what it answered.

        Kept under ``conversations``; it says whether the application let its
        conversations suggest tests then (``record.suggest_tests``). A turn
        the person said aloud is kept as its transcript, marked ``spoken``
        with how it was heard — never the sound (VO-29).
        """
        asked = redact(asked.strip())[:TURN_LIMIT]
        if not asked:
            return
        session = _SESSION.get()
        if session:
            self._turns[session] = self._turns.get(session, 0) + 1
        self.add(
            "turn",
            asked,
            {
                "asked": asked,
                "answered": redact(answered.strip())[:TURN_LIMIT],
                "suggest_tests": bool(self.app.record.suggest_tests),
                **({"spoken": spoken} if spoken else {}),
            },
        )

    def turns_of(self, session: str) -> int:
        """How many turns of ``session`` this recorder kept.

        What a Python application's code turn reads to tell whether the
        agent its code ran kept the turn already (P-24).

        Parameters
        ----------
        session : str
            The session's id.

        Returns
        -------
        int
            The turns kept.
        """
        return self._turns.get(session, 0)

    def stepped(self, step: Any) -> None:
        """Keep a step that ended, as the chain of thought shows it (P-16).

        Kept under ``actions``: its name and kind, the step it is nested in,
        what it started from and what it gave, or why it failed, each cut
        and redacted as a tool call's are, and when it started and ended.
        """
        started, ended = step.started_at, step.ended_at
        self.add(
            "step",
            f"{step.name}: {step.error}" if step.error else step.name,
            {
                "id": step.id,
                "name": step.name,
                "kind": step.kind,
                "parent_id": step.parent_id or "",
                "input": "" if step.input is None else _short(step.input),
                "output": "" if step.output is None else _short(step.output, 300),
                "error": _short(step.error, 300) if step.error else "",
                "started_at": started.isoformat(),
                "ended_at": ended.isoformat() if ended else "",
            },
        )

    def shown(
        self,
        message_id: str,
        author: str,
        nodes: Any,
        data: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """Keep what an answer showed under its message (P-04).

        Kept under ``outputs``, as the answer is: the message it came with,
        who said it, each component of the catalog by its kind and id and
        the words it shows (a title, a label, a file's name), and the names
        of what its data held — never the data itself, which the page drew
        and the conversation keeps.
        """
        shown: List[Dict[str, str]] = []
        for node in nodes:
            if node.get("component") in ("Row", "Column", "Card", "List", "Tabs"):
                continue
            said = next(
                (
                    node[key]
                    for key in ("title", "text", "label", "name")
                    if isinstance(node.get(key), str) and node[key]
                ),
                "",
            )
            shown.append(
                {
                    "id": str(node.get("id", "")),
                    "component": str(node.get("component", "")),
                    "said": _short(said, 200) if said else "",
                }
            )
        if not shown:
            return
        self.add(
            "output",
            f"{author} showed "
            + ", ".join(
                f"{one['component']} {one['said'] or one['id']}" for one in shown
            ),
            {
                "message": message_id,
                "author": author,
                "shows": shown,
                "data": sorted(str(key) for key in (data or {})),
            },
        )

    # --- what the other capabilities tell it ---------------------------------------

    def decided(self, enforced: Any) -> None:
        decision = getattr(enforced, "decision", enforced)
        # A call refused with nobody asked — a Space it is not granted (R-25) — is said refused: the behaviour that lets its tool run only
        # to refuse it is not what was decided.
        refused = str(getattr(enforced, "refused", "") or "")
        behaviour = REFUSED if refused else getattr(decision, "behaviour", "")
        detail = {
            "tool": getattr(decision, "tool", ""),
            "behaviour": behaviour,
            "because": getattr(decision, "because", ""),
            # What the call does: a send is counted against its approval (W-08).
            "classes": list(getattr(decision, "classes", ()) or ()),
        }
        if refused:
            detail["refused"] = refused
        # What a company's tool was decided on (R-01).
        inputs = getattr(enforced, "inputs", None)
        if inputs:
            detail["inputs"] = dict(inputs)
            detail["rule"] = getattr(decision, "rule", "")
            # The correlation ID its call carries to the gateway (A-05), so the Activity shows the
            # gateway's rows of it beside this decision; none without a trace, never one made up.
            trace_id = _trace_id()
            if trace_id:
                detail["trace_id"] = trace_id
        # Done without asking because the person approved it in advance (U-25).
        approved = getattr(enforced, "approved", None)
        if approved is not None:
            detail["approved_in_advance"] = approved.uid
            detail["approved_words"] = approved.words
        self.add(
            "decision",
            f"{getattr(decision, 'tool', '?')}: {behaviour or '?'}"
            + (f" ({REFUSALS.get(refused, refused)})" if refused else "")
            + (f" (approved in advance: {approved.words})" if approved else ""),
            detail,
        )

    def answered(self, tool: str, under: str, outcome: str, note: str = "") -> None:
        """What a person answered when they were asked (R-07): an entry of its own.

        ``outcome`` is ``approved``, ``declined`` or ``unanswered``; ``under``
        the rule or Gate it was asked under, in its sentence.
        """
        said = redact(note.strip())[:COMMENT_LIMIT]
        self.add(
            "approval",
            f"{tool}: {ANSWERS.get(outcome, outcome)}" + (f": {said}" if said else ""),
            {"tool": tool, "outcome": outcome, "asked_under": under, "note": said},
        )

    def ran(self, session: str) -> None:
        """Say that a run of ``session`` began, and send it now (R-15).

        What Activity reads as *in progress*: a run that began and has not
        answered yet. Sent at once, with the session's start when it is its
        first run, in a task of its own; never fails the run.
        """
        _SESSION.set(session)
        self.add("run", f"{self.app.name} is working", {})
        send_later(session, self.flush(session))

    def asked(self, session: str, kind: str) -> None:
        """Say that the application asked the person and waits for the answer
        (`loop.ask`), and send it now: ai-agents tells whoever opened the
        session — on their phone too (M-023). Its kind only, never the
        question's words, which the conversation keeps.
        """
        _SESSION.set(session)
        self.add(
            "asked",
            "It asked and waits for the answer",
            {
                "kind": kind,
                "asked_at": datetime.now(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
            },
        )
        send_later(session, self.flush(session))

    def ended(
        self, status: str, summary: str, payload: Optional[Dict[str, Any]] = None
    ) -> None:
        """Say that the current run ended (R-15; R-01).

        An ``output`` entry, kept whatever ``record.include`` says: a session
        whose latest run has no end reads *in progress* in Activity, and never
        *Completed*. Its ``status`` (one of `RUN_ENDS`), when it ended and the
        run's trace ID are always kept; what it answered — ``summary`` and
        ``payload`` — only under ``outputs``, which stay opt-in.
        """
        if status not in RUN_ENDS:
            raise ValueError(f"A run ends {', '.join(RUN_ENDS)}; not {status!r}.")
        end: Dict[str, Any] = {
            "status": status,
            "ended_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        trace_id = _trace_id()
        if trace_id:
            end["trace_id"] = trace_id
        if self.kept("output"):
            self._append("output", summary, {**(payload or {}), **end})
        elif self.kept("run"):
            # As a run's start is kept: never of a visitor's conversation (R-30).
            self._append("output", "", end)

    def approvals_unread(self, why: str) -> None:
        """What the person approved in advance could not be read: they are asked."""
        self.add("decision", why, {"approvals_unread": why})

    def checked(self, stage: str, verdict: Any) -> None:
        """A check's verdict: the stage, what it did, the Gate that decided
        and the Guard that checked (``built-in`` for the built-in check),
        and whether it passed — at a session's start every Guard's verdict is
        kept, passed or failed (R-06); later, those that stop a step.
        """
        guard = getattr(verdict, "guard", "")
        passed = getattr(verdict, "passed", None)
        self.add(
            "check",
            getattr(verdict, "sentence", "") or getattr(verdict, "action", ""),
            {
                "stage": stage,
                "action": getattr(verdict, "action", ""),
                "gate": getattr(verdict, "gate", ""),
                **({"guard": guard} if guard else {}),
                **({"passed": passed} if passed is not None else {}),
            },
        )


@dataclass
class AppRecordCapability(AbstractCapability[Any]):
    """Write the record of an application's sessions.

    Sent when the run ends — and, since a client that has its answer may go
    before the run has ended (the terminal stops its runtime at once, a
    browser closes its tab), as soon as the stream that carried the final
    answer ends, or is cancelled, in a task of its own. Once per run.
    """

    recorder: AppRecorder

    _sessions: Dict[str, str] = field(default_factory=dict, init=False, repr=False)
    _answers: Dict[str, str] = field(default_factory=dict, init=False, repr=False)
    _spoken: Dict[str, Dict[str, str]] = field(
        default_factory=dict, init=False, repr=False
    )
    _sending: Set[Any] = field(default_factory=set, init=False, repr=False)

    def _key(self, ctx: RunContext[Any]) -> str:
        return str(ctx.run_id or ctx.conversation_id or "run")

    @staticmethod
    def _asked(ctx: RunContext[Any]) -> str:
        """What the person asked in this run: its prompt, else the last one in its messages."""
        prompt = ctx.prompt
        if prompt is None:
            for message in reversed(ctx.messages or []):
                if not isinstance(message, ModelRequest):
                    continue
                parts = [p for p in message.parts if isinstance(p, UserPromptPart)]
                if parts:
                    prompt = parts[-1].content
                    break
        if isinstance(prompt, str):
            return prompt
        return " ".join(item for item in prompt or [] if isinstance(item, str))

    async def before_run(self, ctx: RunContext[Any]) -> None:
        session = str(ctx.conversation_id or ctx.run_id or "run")
        logger.info("Recording %s, session %s.", self.recorder.app.id, session)
        self._sessions[self._key(ctx)] = session
        # Said rather than typed: how its words were heard (VO-29).
        from agent_runtimes.voice import heard

        spoken = heard()
        if spoken is not None:
            self._spoken[self._key(ctx)] = spoken.as_payload()
        self.recorder.start(session)
        self.recorder.ran(session)

    async def after_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        result: Any,
    ) -> Any:
        self.recorder.add(
            "tool_call",
            f"{call.tool_name} called",
            {
                "tool": call.tool_name,
                "arguments": _short(args),
                "result": _short(result, 300),
            },
        )
        return result

    async def _close(
        self,
        ctx: RunContext[Any],
        status: str,
        summary: str,
        payload: Dict[str, Any],
        answered: Optional[str] = None,
    ) -> None:
        """Add the run's last entries and send its session, once.

        A run that answered keeps its turn, what was asked and what it
        answered; one that stopped keeps how it stopped; every run keeps its
        end (`AppRecorder.ended`).
        """
        session = self._sessions.pop(self._key(ctx), None)
        self._answers.pop(self._key(ctx), None)
        spoken = self._spoken.pop(self._key(ctx), None)
        if session is None:
            return
        _SESSION.set(session)
        if answered is not None and self.recorder.kept("turn"):
            self.recorder.turned(self._asked(ctx), answered, spoken)
        self.recorder.ended(status, summary, payload)
        await self.recorder.flush(session)

    async def wrap_run_event_stream(
        self, ctx: RunContext[Any], *, stream: AsyncIterable[AgentStreamEvent]
    ) -> AsyncIterable[AgentStreamEvent]:
        key = self._key(ctx)
        cancelled = False
        final = False
        # A response that also calls a tool is not the last: words and a call
        # in one response ("let me check…", then the search) carry the run on,
        # and closing the turn at its words lost the call and every answer
        # after it from the record (E-01, 2026-10-10).
        called = False
        try:
            async for event in stream:
                if isinstance(event, FinalResultEvent):
                    final = True
                if isinstance(event, PartStartEvent) and isinstance(
                    event.part, ToolCallPart
                ):
                    called = True
                if isinstance(event, PartStartEvent) and isinstance(
                    event.part, TextPart
                ):
                    self._answers[key] = event.part.content
                elif isinstance(event, PartDeltaEvent) and isinstance(
                    event.delta, TextPartDelta
                ):
                    self._answers[key] = (
                        self._answers.get(key, "") + event.delta.content_delta
                    )
                yield event
        except (asyncio.CancelledError, GeneratorExit):
            # The client went. A node's stream ending, or failing, is not
            # this: the run goes on, or says how it stopped (`on_run_error`).
            cancelled = True
            raise
        finally:
            # First, before closing what it wraps: closing an MCP server's
            # stream from another task raises (anyio's cancel scope), and
            # nothing after a raise in a `finally` runs.
            if (cancelled or (final and not called)) and key in self._sessions:
                # The answer is given, or the client went: sent now, in a task
                # of its own, which neither a cancellation nor a client that
                # stops reading at `RUN_FINISHED` (and stops the runtime with
                # it, as the terminal does) takes away.
                answer = self._answers.get(key, "")
                task = send_later(
                    self._sessions[key],
                    self._close(
                        ctx,
                        "answered" if final else "gone",
                        _short(answer, 300),
                        {"length": len(answer)},
                        # A client gone before the answer leaves no turn.
                        answered=answer if final else None,
                    ),
                )
                # Held until done: a task nothing refers to may be collected.
                self._sending.add(task)
                task.add_done_callback(self._sending.discard)
            close = getattr(stream, "aclose", None)
            if close is not None:
                await close()

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        output = getattr(result, "output", "")
        await self._close(
            ctx,
            "answered",
            _short(output, 300),
            {"length": len(str(output))},
            answered=str(output),
        )
        return result

    async def on_run_error(self, ctx: RunContext[Any], *, error: BaseException) -> Any:
        # A run a rule or a check stopped is recorded too: that is when it matters.
        await self._close(
            ctx,
            "stopped",
            f"Stopped: {_short(error, 300)}",
            {"error": type(error).__name__},
        )
        raise error


__all__ = [
    "ALWAYS_KEPT",
    "ANSWERS",
    "AppRecordCapability",
    "AppRecorder",
    "COMMENT_LIMIT",
    "INCLUDED_BY",
    "RUN_ENDS",
    "RecordNotSent",
    "TURN_LIMIT",
    "agent_recorder",
    "current_session",
    "keep_agent_recorder",
    "keep_days_of",
    "kept_of",
    "recorder_of",
    "send_to_ai_agents",
    "own_token_for",
    "persons_own_token",
    "token_for",
]

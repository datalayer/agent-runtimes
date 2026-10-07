# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A scene on stage: its members played, and what they did recorded as spans (LOOP A-14).

The rehearsal plays each beat's cue through the scene the way `loop apps
run` runs one application: the entry's application in this process
(`AppHost`, its agent built by `local_agent` or one a test gives), with a
tool per member it talks to — ``ask_accounting`` — that asks that member
in this process too (a session of its own), or over A2A at the address it
is served at (a cloud runtime configured with it, as ``serve_accounting.py``
does; a key granted to its route). What happens is recorded as the spans
the Agent Inspector reads — an ``invoke_agent`` turn, ``execute_tool``
calls, an ``a2a`` request with its answer, a peer's calls told by its
working statuses — so that the transcript is read from them by the one
grammar (`agent_runtimes.loop.scenes.transcript`), as the page reads a
live scene.

A member that cannot play says why (`StageMember.reason`): its agent
cannot be built here, its runtime refused it, its setup is incomplete. A
beat that needs it is *not run* with that sentence; nothing crashes.
"""

from __future__ import annotations

import contextvars
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from agent_runtimes.guardrails.credentials import hold, redact
from agent_runtimes.loop.scenes.transcript import (
    PERSON,
    SceneConnection,
    SceneMember,
    TranscriptLine,
    connection_of_tool,
    transcript_of_spans,
)

#: The kinds of answer a rehearsal line may name (agentspecs' ``AnswerKind``).
ANSWER_KINDS = (
    "words",
    "table",
    "chart",
    "notebook",
    "map",
    "file",
    "image",
    "sources",
    "choice",
    "approval",
)

#: What a rehearsal line's words mean on a line said: ``a table`` → ``table``.
_KIND_WORDS = re.compile(
    r"^(?:an?\s+)?(words|table|chart|notebook|map|file|image|sources|choice|approval)$"
)

#: The catalog's components that show a kind not named in theirs (STUDIO H-02).
_COMPONENT_KINDS = {"evidence": "sources", "button": "choice"}

_MARKDOWN_TABLE = re.compile(r"^\s*\|.*\|\s*\n\s*\|?\s*:?-{2,}", re.MULTILINE)

#: The span a member's calls and asks nest under while it works.
_PARENT: contextvars.ContextVar[str] = contextvars.ContextVar(
    "scene_parent", default=""
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _span_id() -> str:
    return uuid.uuid4().hex[:16]


def shown_kinds(
    text: str, components: Sequence[Mapping[str, Any]] = ()
) -> Tuple[str, ...]:
    """What an answer shows, read off its words and its components (``table``, ``chart``).

    Words always; a markdown table, an image; a component of the catalog
    named after a kind (``Table``, ``Chart``, ``Notebook``, ``Map``, ``Image``, ``File``).
    """
    shows: List[str] = ["words"] if text.strip() else []
    if _MARKDOWN_TABLE.search(text):
        shows.append("table")
    if "![" in text:
        shows.append("image")
    for component in components:
        name = str(component.get("component") or component.get("type") or "").lower()
        kinds = [kind for kind in ANSWER_KINDS[1:] if kind in name]
        if name in _COMPONENT_KINDS:
            kinds.append(_COMPONENT_KINDS[name])
        if name == "button" and _does_more_than_read(component):
            kinds.append("approval")
        for kind in kinds:
            if kind not in shows:
                shows.append(kind)
    return tuple(shows)


def _does_more_than_read(button: Mapping[str, Any]) -> bool:
    """Whether a button's action says it does more than read (``context.does``)."""
    action = button.get("action")
    event = action.get("event") if isinstance(action, Mapping) else None
    context = event.get("context") if isinstance(event, Mapping) else None
    does = context.get("does") if isinstance(context, Mapping) else None
    return isinstance(does, str) and does not in ("", "read")


def kind_of_words(detail: str) -> Optional[str]:
    """The kind a rehearsal line names: *a table* is ``table``, *words* is ``words``; else None."""
    text = detail.strip().lower()
    if text == "words":
        return "words"
    found = _KIND_WORDS.match(text)
    return found.group(1) if found else None


@dataclass
class Recording:
    """The spans of one beat, in the Inspector's shape, as it is played."""

    spans: List[Dict[str, Any]] = field(default_factory=list)
    trace_id: str = field(default_factory=lambda: uuid.uuid4().hex)

    def start(
        self,
        name: str,
        service: str,
        attributes: Mapping[str, Any],
        parent: str = "",
        kind: str = "INTERNAL",
    ) -> Dict[str, Any]:
        """Open a span; it is in progress until `end`."""
        span: Dict[str, Any] = {
            "trace_id": self.trace_id,
            "span_id": _span_id(),
            "span_name": name,
            "service_name": service,
            "kind": kind,
            "start_time": _now_iso(),
            "end_time": _now_iso(),
            "duration_ms": 0,
            "attributes": dict(attributes),
            "events": [],
            "in_progress": True,
        }
        if parent:
            span["parent_span_id"] = parent
        self.spans.append(span)
        return span

    def end(
        self,
        span: Dict[str, Any],
        attributes: Optional[Mapping[str, Any]] = None,
        error: str = "",
    ) -> None:
        """Close a span, with what it ended with."""
        if attributes:
            span["attributes"].update(attributes)
        start = datetime.fromisoformat(span["start_time"].replace("Z", "+00:00"))
        end = datetime.now(timezone.utc)
        # What happened under it ended before it did: a tie in the same
        # millisecond would put the answer before the call it waited for.
        for child in self.spans:
            if child.get("parent_span_id") == span["span_id"]:
                child_end = datetime.fromisoformat(
                    child["end_time"].replace("Z", "+00:00")
                )
                # The transcript reads milliseconds: the same one is a tie.
                if int(child_end.timestamp() * 1000) >= int(end.timestamp() * 1000):
                    end = child_end + timedelta(milliseconds=1)
        span["end_time"] = end.isoformat().replace("+00:00", "Z")
        span["duration_ms"] = int((end - start).total_seconds() * 1000)
        span["in_progress"] = False
        if error:
            span["status_code"] = "ERROR"
            span["status_message"] = error
        else:
            span["status_code"] = "OK"

    def event(
        self, span: Dict[str, Any], name: str, attributes: Mapping[str, Any]
    ) -> None:
        span["events"].append(
            {"name": name, "timestamp": _now_iso(), "attributes": dict(attributes)}
        )


@dataclass
class StageMember:
    """A member of the scene as the stage plays it."""

    id: str
    name: str
    """The name the audience sees: its persona's."""
    face: str = ""
    runs_in: str = "browser"
    talks_to: Tuple[str, ...] = ()
    """The members it asks over A2A, by id."""
    connections: Tuple[SceneConnection, ...] = ()
    document: Dict[str, Any] = field(default_factory=dict)
    """Its application, as a spec document."""
    brief: str = ""
    line: str = ""
    reason: str = ""
    """Why it cannot play, when it cannot: the beats that need it are not run."""
    address: str = ""
    """Where it is served over A2A, when it is asked there rather than in this process."""
    key: str = ""
    """A key granted to its A2A route, sent as a bearer token."""

    @property
    def transcript_member(self) -> SceneMember:
        return SceneMember(id=self.id, name=self.name, connections=self.connections)


@dataclass(frozen=True)
class A2AStep:
    """A tool call a member served over A2A told while it worked."""

    name: str
    at: str = ""
    """When it was told, ISO 8601; now when unsaid."""
    ended: bool = False
    error: str = ""


@dataclass(frozen=True)
class A2AAnswer:
    """What a member served over A2A answered, and the steps it told on the way."""

    text: str
    steps: Tuple[A2AStep, ...] = ()
    failed: str = ""
    """How it ended, when it did not complete."""


@dataclass
class Played:
    """One beat played: its spans, its lines, the entry's answer, and how long it took."""

    cue: str
    spans: List[Dict[str, Any]] = field(default_factory=list)
    lines: List[TranscriptLine] = field(default_factory=list)
    answer: str = ""
    shows: Tuple[str, ...] = ()
    seconds: float = 0.0
    error: str = ""
    """Why it did not run, when it did not."""


_ENDED_BADLY = {
    "TASK_STATE_FAILED": "failed",
    "failed": "failed",
    "TASK_STATE_CANCELED": "was canceled",
    "canceled": "was canceled",
    "TASK_STATE_REJECTED": "was rejected",
    "rejected": "was rejected",
    "TASK_STATE_AUTH_REQUIRED": "asks for a key it was not given",
    "auth-required": "asks for a key it was not given",
    "TASK_STATE_INPUT_REQUIRED": "asks for more than it was told",
    "input-required": "asks for more than it was told",
}

_COMPLETED = ("TASK_STATE_COMPLETED", "completed")


def _parts_text(parts: Any) -> str:
    if not isinstance(parts, list):
        return ""
    return "".join(
        str(part.get("text") or "")
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
    )


def _steps_of(parts: Any) -> List[A2AStep]:
    """The tool steps a working status carries (`a2aPeer.ts`'s ``stepOf``)."""
    steps: List[A2AStep] = []
    for part in parts or []:
        data = part.get("data") if isinstance(part, dict) else None
        if not isinstance(data, dict):
            continue
        call = data.get("tool_call")
        result = data.get("tool_result")
        told = call if isinstance(call, dict) else result
        if isinstance(told, dict) and told.get("name"):
            steps.append(
                A2AStep(
                    name=str(told["name"]),
                    at=_now_iso(),
                    ended=not isinstance(call, dict),
                    error=str((result or {}).get("error") or "")
                    if not isinstance(call, dict)
                    else "",
                )
            )
    return steps


async def ask_over_a2a(member: StageMember, request: str) -> A2AAnswer:
    """Ask a member served over A2A, streaming (``SendStreamingMessage``), as the page does.

    The answer is its artifacts' text, else the final status message; the
    tool calls it tells as working statuses are its steps. A task that does
    not complete is ``failed`` with how it ended.
    """
    import httpx

    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "SendStreamingMessage",
        "params": {
            "message": {
                "messageId": uuid.uuid4().hex,
                "role": "ROLE_USER",
                "parts": [{"text": request}],
            },
            "configuration": {"returnImmediately": False},
        },
    }
    headers = {"Accept": "text/event-stream"}
    if member.key:
        # Sent by the stage, never shown to a model or a span (LOOP R-19).
        hold(member.key)
        headers["Authorization"] = f"Bearer {member.key}"
    texts: Dict[str, str] = {}
    steps: List[A2AStep] = []
    final = ""
    ended = ""
    url = member.address.rstrip("/") + "/"
    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=30.0)) as client:
        async with client.stream("POST", url, json=body, headers=headers) as response:
            if response.status_code >= 300:
                detail = (await response.aread()).decode(errors="replace")[:300]
                return A2AAnswer(
                    "",
                    failed=f"{member.name} refused the request ({response.status_code}): {detail}",
                )
            async for raw in response.aiter_lines():
                if not raw.startswith("data:"):
                    continue
                try:
                    event = json.loads(raw[len("data:") :])
                except ValueError:
                    continue
                result = event.get("result") if isinstance(event, dict) else None
                if not isinstance(result, dict):
                    error = (
                        (event or {}).get("error") if isinstance(event, dict) else None
                    )
                    if error:
                        return A2AAnswer(
                            "", tuple(steps), failed=f"{member.name} refused: {error}"
                        )
                    continue
                update = result.get("statusUpdate") or (
                    result if result.get("kind") == "status-update" else None
                )
                artifact_update = result.get("artifactUpdate") or (
                    result if result.get("kind") == "artifact-update" else None
                )
                if update:
                    status = update.get("status") or {}
                    state = str(status.get("state") or "")
                    message = status.get("message") or {}
                    if state in ("TASK_STATE_WORKING", "working"):
                        steps.extend(_steps_of(message.get("parts")))
                    elif state:
                        ended = state
                        final = _parts_text(message.get("parts")) or final
                elif artifact_update:
                    artifact = artifact_update.get("artifact") or {}
                    text = _parts_text(artifact.get("parts"))
                    key = str(artifact.get("artifactId") or "")
                    before = texts.get(key, "")
                    texts[key] = (
                        before + text
                        if artifact_update.get("append")
                        and not artifact_update.get("lastChunk")
                        else text
                    )
                elif result.get("kind") == "message" or "message" in result:
                    message = result.get("message") if "message" in result else result
                    final = _parts_text((message or {}).get("parts"))
                    ended = "TASK_STATE_COMPLETED"
    if ended not in _COMPLETED:
        how = _ENDED_BADLY.get(ended) or "ended without an answer"
        return A2AAnswer(
            final,
            tuple(steps),
            failed=f"{member.name} {how}{': ' + final if final else '.'}",
        )
    answer = "\n".join(text for text in texts.values() if text) or final
    return A2AAnswer(answer, tuple(steps))


class Stage:
    """A scene's members, ready to play a cue.

    Parameters
    ----------
    members : sequence of StageMember
        The cast, in order.
    entry : str
        The member the audience talks to, by id.
    agent : callable, optional
        How a member's agent is built from its spec, in this process; `local_agent`
        when unsaid. A test gives fake members here.
    ask : callable, optional
        How a member at an address is asked; `ask_over_a2a` when unsaid.
    """

    def __init__(
        self,
        members: Sequence[StageMember],
        entry: str,
        *,
        agent: Optional[Callable[[Any], Any]] = None,
        ask: Optional[Callable[[StageMember, str], Any]] = None,
    ) -> None:
        self.members: Dict[str, StageMember] = {member.id: member for member in members}
        self.entry = entry
        self._agent = agent
        self._ask = ask or ask_over_a2a

    @property
    def transcript_members(self) -> List[SceneMember]:
        return [member.transcript_member for member in self.members.values()]

    def cannot_play(self, needed: Sequence[str]) -> str:
        """Why the members needed cannot play, in sentences; empty when they can."""
        said: List[str] = []
        for member_id in needed:
            member = self.members.get(member_id)
            if member is not None and member.reason and member.reason not in said:
                said.append(member.reason)
        return " ".join(said)

    async def play(self, cue: str, needed: Sequence[str] = ()) -> Played:
        """The cue said to the entry; everything that follows recorded."""
        reason = self.cannot_play(needed or list(self.members))
        if reason:
            return Played(cue=cue, error=reason)
        recording = Recording()
        entry = self.members[self.entry]
        started = time.monotonic()
        try:
            if entry.address:
                answer, shows = await self._ask_at_address(
                    recording, entry, cue, asker=PERSON
                )
            else:
                answer, shows = await self._ask_here(recording, entry, cue, parent="")
        except _CannotPlay as refused:
            return Played(cue=cue, spans=recording.spans, error=str(refused))
        seconds = time.monotonic() - started
        lines = transcript_of_spans(recording.spans, self.transcript_members)
        return Played(
            cue=cue,
            spans=recording.spans,
            lines=lines,
            answer=answer,
            shows=shows,
            seconds=seconds,
        )

    # --- in this process -----------------------------------------------------------

    async def _ask_here(
        self, recording: Recording, member: StageMember, request: str, parent: str
    ) -> Tuple[str, Tuple[str, ...]]:
        """A turn of a member in this process: a session of its own, its agent with its ask tools."""
        from agent_runtimes.loop.apps.application import AppHost, Application
        from agent_runtimes.loop.apps.loading import AppNotRunnable
        from agent_runtimes.loop.apps.safety import _AskedThePerson, _SafetyChannel
        from agent_runtimes.loop.apps.session import Message

        try:
            application = Application.from_spec(with_ask_tools(member, self.members))
        except AppNotRunnable as refused:
            raise _CannotPlay(" ".join(refused.problems)) from None
        except Exception as refused:  # noqa: BLE001 - its spec is not an application here
            raise _CannotPlay(
                f"{member.name} cannot be built here: {_why(refused)}"
            ) from None
        turn = recording.start(
            f"invoke_agent {member.name}",
            member.name,
            {
                "gen_ai.operation.name": "invoke_agent",
                "gen_ai.agent.name": member.name,
                "gen_ai.input.messages": json.dumps(
                    [{"role": "user", "parts": [{"type": "text", "content": request}]}]
                ),
            },
            parent=parent,
        )
        channel = _SafetyChannel()
        recorder = _SpanRecorder(
            app=application.spec,
            recording=recording,
            member=member,
            ask_tools=frozenset(_ask_tool_name(peer) for peer in member.talks_to),
        )
        recorder.parent = turn["span_id"]
        host = AppHost(
            application,
            channel,
            agent=self._factory_for(member, recording),
            recorder=recorder,
        )
        token = _PARENT.set(turn["span_id"])
        asked = ""
        opened = 0
        try:
            session = await host.open()
            opened = len(channel.memory.events)
            await host.message(session, request)
        except AppNotRunnable as refused:
            recording.end(turn, error="not runnable")
            raise _CannotPlay(" ".join(refused.problems)) from None
        except _AskedThePerson as question:
            asked = str(question)
        except Exception as error:  # noqa: BLE001 - a turn that fails is why the beat did not run
            recording.end(turn, error=_why(error))
            raise _CannotPlay(f"{member.name}'s turn failed: {_why(error)}") from None
        finally:
            _PARENT.reset(token)
        messages = [
            event
            for event in channel.memory.events[opened:]
            if isinstance(event, Message)
        ]
        said = [message.text for message in messages if message.text]
        if not said and recorder.answered:
            said = [recorder.answered]
        if asked:
            said.append(f"(It asks the person: {asked})")
        answer = "\n".join(said)
        components = [
            component for message in messages for component in message.components
        ]
        shows = shown_kinds(answer, components)
        recording.end(
            turn,
            {
                "gen_ai.output.messages": json.dumps(
                    [
                        {
                            "role": "assistant",
                            "parts": [{"type": "text", "content": answer}],
                        }
                    ]
                ),
                "datalayer.answer.shows": ",".join(shows),
            },
        )
        return answer, shows

    def _factory_for(
        self, member: StageMember, recording: Recording
    ) -> Callable[[Any], Any]:
        """The member's agent, with a tool per member it talks to."""
        from agent_runtimes.loop.apps.agent import local_agent

        base = self._agent or local_agent

        def factory(spec: Any) -> Any:
            agent = base(spec)
            for peer_id in member.talks_to:
                peer = self.members.get(peer_id)
                if peer is None:
                    continue
                agent.tool_plain(
                    self._ask_tool(recording, member, peer),
                    name=_ask_tool_name(peer_id),
                )
            return agent

        return factory

    def _ask_tool(
        self, recording: Recording, asker: StageMember, peer: StageMember
    ) -> Callable[[str], Any]:
        """The tool with which ``asker`` asks ``peer``: an A2A request, recorded as its span."""

        async def ask(request: str) -> str:
            span = recording.start(
                "a2a SendStreamingMessage",
                asker.name,
                {
                    "rpc.service": "a2a",
                    "peer.service": peer.name,
                    "a2a.message.text": request,
                },
                parent=_PARENT.get(""),
                kind="CLIENT",
            )
            if peer.reason:
                recording.end(span, error=peer.reason)
                return f"{peer.name} could not answer: {peer.reason}"
            if peer.address:
                # Ended there, answered or failed.
                answer, _shows = await self._ask_at_address(
                    recording, peer, request, asker=asker.name, span=span
                )
                return answer
            token = _PARENT.set(span["span_id"])
            try:
                answer, shows = await self._ask_here(
                    recording, peer, request, parent=span["span_id"]
                )
            except _CannotPlay as refused:
                recording.end(span, error=str(refused))
                return f"{peer.name} could not answer: {refused}"
            finally:
                _PARENT.reset(token)
            recording.event(span, "a2a.artifact_update", {"a2a.message.text": answer})
            recording.end(
                span,
                {"a2a.answer.text": answer, "datalayer.answer.shows": ",".join(shows)},
            )
            return answer

        ask.__doc__ = _ask_tool_doc(peer)
        return ask

    # --- over A2A ------------------------------------------------------------------

    async def _ask_at_address(
        self,
        recording: Recording,
        member: StageMember,
        request: str,
        *,
        asker: str,
        span: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, Tuple[str, ...]]:
        """A member served over A2A asked, its steps recorded under the request.

        The request's span — given, or opened here — is ended here, with the
        answer or with how it failed. Asked by the person (no ``span``), a
        failure is why the beat did not run; asked by a member, it is what
        the member is told.
        """
        own = span is None
        if span is None:
            span = recording.start(
                "a2a SendStreamingMessage",
                asker,
                {
                    "rpc.service": "a2a",
                    "peer.service": member.name,
                    "a2a.message.text": request,
                },
                kind="CLIENT",
            )
        try:
            answered = await self._ask(member, request)
        except Exception as error:  # noqa: BLE001 - the address did not answer
            recording.end(span, error=_why(error))
            raise _CannotPlay(
                f"{member.name} at {member.address} did not answer: {_why(error)}"
            ) from None
        open_steps: Dict[str, Dict[str, Any]] = {}
        for step in answered.steps:
            if not step.ended:
                call = recording.start(
                    f"execute_tool {step.name}",
                    member.name,
                    {
                        "gen_ai.operation.name": "execute_tool",
                        "gen_ai.agent.name": member.name,
                        "gen_ai.tool.name": step.name,
                        "datalayer.tool.kind": _tool_kind(step.name, member),
                    },
                    parent=span["span_id"],
                )
                if step.at:
                    call["start_time"] = step.at
                open_steps[step.name] = call
            else:
                opened = open_steps.pop(step.name, None)
                if opened is not None:
                    call = opened
                else:
                    call = recording.start(
                        f"execute_tool {step.name}",
                        member.name,
                        {
                            "gen_ai.operation.name": "execute_tool",
                            "gen_ai.agent.name": member.name,
                            "gen_ai.tool.name": step.name,
                            "datalayer.tool.kind": _tool_kind(step.name, member),
                        },
                        parent=span["span_id"],
                    )
                recording.end(call, error=step.error)
        for call in open_steps.values():
            recording.end(call)
        if answered.failed:
            recording.end(span, error=answered.failed)
            if own:
                raise _CannotPlay(answered.failed)
            return f"could not answer: {answered.failed}", ()
        shows = shown_kinds(answered.text)
        recording.event(
            span, "a2a.artifact_update", {"a2a.message.text": answered.text}
        )
        recording.end(
            span,
            {
                "a2a.answer.text": answered.text,
                "datalayer.answer.shows": ",".join(shows),
            },
        )
        return answered.text, shows


class _CannotPlay(Exception):
    """A member could not play: the beat is not run, with why."""


def _why(error: BaseException) -> str:
    said = str(error).strip().splitlines()
    return f"{type(error).__name__}: {said[0][:300]}" if said else type(error).__name__


def _ask_tool_name(peer_id: str) -> str:
    return "ask_" + re.sub(r"[^a-z0-9]+", "_", peer_id.lower()).strip("_")


def with_ask_tools(
    member: StageMember, members: Mapping[str, StageMember]
) -> Dict[str, Any]:
    """The member's spec document with a tool per member it talks to, declared as its own.

    The team said the member asks that one over A2A, so the ask is a tool of
    the application's own (``tools``, LOOP P-06) that reads: its rules let
    it through as they let a read through, and a rule may still name it.
    """
    document = dict(member.document)
    tools = [dict(tool) for tool in document.get("tools") or []]
    known = {str(tool.get("name")) for tool in tools}
    for peer_id in member.talks_to:
        peer = members.get(peer_id)
        name = _ask_tool_name(peer_id)
        if peer is None or name in known:
            continue
        tools.append(
            {
                "name": name,
                "description": _ask_tool_doc(peer),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "request": {
                            "type": "string",
                            "description": "What to ask, in words",
                        }
                    },
                    "required": ["request"],
                },
                "does": ["read"],
            }
        )
    if tools:
        document["tools"] = tools
    return document


def _ask_tool_doc(peer: StageMember) -> str:
    about = peer.line or peer.brief
    return (
        f"Ask {peer.name}{': ' + about if about else ''}. "
        "One request at a time, in words; it answers in words."
    )


def _tool_kind(tool: str, member: StageMember) -> str:
    return "mcp" if connection_of_tool(tool, member.connections) else "runtime"


def _recorder_base() -> Any:
    from agent_runtimes.loop.apps.record import AppRecorder

    return AppRecorder


class _SpanRecorder(_recorder_base()):  # type: ignore[misc]
    """The application's recorder, writing its tool calls as spans of the beat.

    Every kind is kept; nothing is sent anywhere. A call of an ask tool is
    told by its A2A span, not here.
    """

    def __init__(
        self,
        *,
        app: Any,
        recording: Recording,
        member: StageMember,
        ask_tools: frozenset,
    ) -> None:
        super().__init__(app=app)
        self.recording = recording
        self.member = member
        self.ask_tools = ask_tools
        self.parent = ""
        self.answered = ""

    def kept(self, kind: str) -> bool:
        return True

    def add(
        self, kind: str, summary: str, payload: Optional[Dict[str, Any]] = None
    ) -> None:
        payload = payload or {}
        if kind == "turn":
            self.answered = str(payload.get("answered") or "")
            return
        if kind != "tool_call":
            return
        tool = str(payload.get("tool") or summary)
        if tool in self.ask_tools:
            return
        span = self.recording.start(
            f"execute_tool {tool}",
            self.member.name,
            {
                "gen_ai.operation.name": "execute_tool",
                "gen_ai.agent.name": self.member.name,
                "gen_ai.tool.name": tool,
                "datalayer.tool.kind": _tool_kind(tool, self.member),
                "gen_ai.tool.call.arguments": redact(
                    str(payload.get("arguments") or "")
                ),
            },
            parent=_PARENT.get("") or self.parent,
        )
        self.recording.end(span, error=redact(str(payload.get("error") or "")))

    async def flush(self, session: str) -> None:
        self._pending.pop(session, None)


def members_of(
    scene: Any,
    *,
    addresses: Optional[Mapping[str, Tuple[str, str]]] = None,
) -> Tuple[List[StageMember], str]:
    """The cast of a scene spec as stage members, and the entry's id.

    Each member's application from the catalogue (its spec document), its
    persona's name and face, whom it talks to over A2A, its connections
    labelled as the setting shows them (*Odoo*), and, with ``addresses``,
    where it is asked over A2A and with which key.
    """
    from agentspecs.actions import server_specs
    from agentspecs.apps import APP_CATALOGUE, dump_app

    servers = server_specs()
    shown: Dict[str, str] = {}
    for system in scene.setting.systems:
        shown[system.id] = system.name
    team = scene.team_of()
    entry = scene.entry_of(team)
    members: List[StageMember] = []
    for cast in scene.cast_of():
        app_id = cast.app.split(":")[0] if cast.app else ""
        app = APP_CATALOGUE.get(app_id) if app_id else None
        connections: List[SceneConnection] = []
        for connection in app.connections if app is not None else []:
            server_id = connection.server.split(":")[0]
            spec = servers.get(server_id) or {}
            if any(known.id == server_id for known in connections):
                continue
            name = str(spec.get("name") or server_id)
            tools = tuple(
                tool
                for tool in ((spec.get("actions") or {}).get("tools") or {})
                if not re.search(r"[*?\[]", tool)
            )
            connections.append(
                SceneConnection(
                    id=server_id,
                    name=name,
                    label=shown.get(server_id) or name.split()[0],
                    tools=tools,
                    prefix=server_id.replace("-", "_") + "_",
                )
            )
        reason = ""
        if app is None:
            reason = (
                f"{cast.persona.name or cast.member} is {cast.server or cast.ref or cast.app or 'nothing'}, "
                "which is not an application of the catalogue: it cannot be played."
            )
        address, key = (addresses or {}).get(cast.member, ("", ""))
        members.append(
            StageMember(
                id=cast.member,
                name=cast.persona.name or cast.member,
                face=cast.persona.face,
                runs_in=cast.runs_in.value if cast.runs_in else "browser",
                talks_to=tuple(
                    link.member for link in cast.talks_to if link.over.value == "a2a"
                ),
                connections=tuple(connections),
                document=dump_app(app) if app is not None else {},
                brief=cast.brief,
                line=cast.persona.line,
                reason=reason,
                address=address,
                key=key,
            )
        )
    return members, entry


def refused_here(
    member: StageMember, agent: Optional[Callable[[Any], Any]] = None
) -> str:
    """Why a member's agent cannot be built in this process, in sentences; empty when it can."""
    if member.reason or member.address or not member.document:
        return member.reason
    from agent_runtimes.loop.apps.agent import local_agent
    from agent_runtimes.loop.apps.application import Application
    from agent_runtimes.loop.apps.loading import AppNotRunnable

    try:
        application = Application.from_spec(member.document)
        if application.handler("message") is None and application.code_agent is None:
            (agent or local_agent)(application.spec)
    except AppNotRunnable as refused:
        return " ".join(refused.problems)
    except Exception as refused:  # noqa: BLE001 - its agent cannot be built here
        return f"{member.name}'s agent cannot be built here: {_why(refused)}"
    return ""

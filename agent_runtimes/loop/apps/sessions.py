# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The session API: an application's sessions over the wire (LOOP R-04).

The lifecycle of §10 — start, message, action, settings change, stop and
resume — for the sessions of an application whose agent runs on this
runtime, each streamed as the AG-UI events the chat already reads. The routes
are `agent_runtimes.routes.apps`'; this module is what they drive.

A session is one conversation of one caller with one application, by its
uid, which is also its AG-UI thread and the session its record is kept under
(R-07). It is opened on the agent the platform made for the application —
`POST /api/v1/agents` with its ``app_spec`` and ``app_instance`` — and runs
as that agent does: a deployment's as its application's principal (I-03), a
Preview's as the person.

What answers depends on how the application was written:

- **A spec** (or a Canvas): every turn is a run of its agent, through the
  agent's own AG-UI app — the rules, checks and record it was made with
  decide, as for any AG-UI client.
- **Python** (an ``app.py`` of the catalogue, P-01 to P-03): its code reacts,
  through an `AppHost` whose channel is this session — what it sends and
  streams, its steps and what it asks are AG-UI events, and ``session.agent``
  is the agent the runtime made, with its tools and its rules.

A file given with an action is the session's: an application with a shell
has it put in its sandbox, where its agent reads it in code, whatever its
type and size; one without a shell is given a text file in the message, and
refused anything else, in a sentence. A file asked by an application's code
(``session.ask(FileQuestion(...))``) is answered by a file given with an
action — before or after it is asked.

When the code asks the person something, the stream ends on the question —
a ``loop.ask`` custom event and the question in words — and the session
waits: a message answers text or a choice, an action's file a file, a
settings change a form; the rest of the turn is streamed on that answer's
request.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import (
    Any,
    AsyncIterator,
    Awaitable,
    Callable,
    Dict,
    List,
    Mapping,
    Optional,
    Tuple,
)

from agent_runtimes.context.identities import get_request_user_jwt
from agent_runtimes.loop.apps.agent import AppAgent
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.components import answer_surface
from agent_runtimes.loop.apps.forms import form_values_refused
from agent_runtimes.loop.apps.record import AppRecorder, agent_recorder
from agent_runtimes.loop.apps.session import (
    ChoiceQuestion,
    Delta,
    Event,
    FileQuestion,
    FormQuestion,
    InvalidAnswer,
    Message,
    Question,
    Removed,
    Session,
    Step,
    TextQuestion,
    UploadedFile,
    form_values,
)
from agent_runtimes.types import AppSpec

logger = logging.getLogger(__name__)

#: The largest file a session takes.
MAX_FILE_BYTES = 25 * 1024 * 1024

#: The most of a text file a message carries, for an application without a
#: shell: about thirty thousand tokens.
MAX_TEXT_CHARACTERS = 120_000

#: Where a session's files are put in its sandbox: ``files/<session>/<name>``.
FILES_DIR = "files"

#: A session's uid, when its caller names it (the chat's thread).
SESSION_UID = re.compile(r"^[A-Za-z0-9_-]{8,128}$")

#: The states of a session.
STATES = ("open", "running", "waiting", "stopped", "ended")

#: The kinds of file read as text, besides ``text/*``.
TEXT_TYPES = frozenset(
    {
        "application/json",
        "application/xml",
        "application/yaml",
        "application/x-yaml",
        "application/csv",
    }
)

#: The extensions read as text whatever type the browser gives.
TEXT_EXTENSIONS = re.compile(r"\.(csv|tsv|txt|md|json|jsonl|xml|ya?ml|log)$", re.I)


class SessionRefused(Exception):
    """What the session API will not do: its HTTP status, and why in a sentence."""

    def __init__(self, status: int, reason: str):
        """Keep the status and the sentence."""
        self.status = status
        self.reason = reason
        super().__init__(reason)


# --- files ---------------------------------------------------------------------


def _file_name(name: str) -> str:
    """A file's own name, without a directory, safe as a path in a sandbox."""
    base = PurePosixPath(name.replace("\\", "/")).name.strip()
    safe = re.sub(r"[^A-Za-z0-9._ -]", "_", base)
    if not safe or set(safe) <= {"."}:
        raise SessionRefused(422, f"“{name}” is not a file's name.")
    return safe


def given_files(raw: Any) -> List[UploadedFile]:
    """The files an action gives, as File upload hands them: ``{name, type, data_url}``.

    Raises
    ------
    SessionRefused
        For what is not a list of such files, a data URL that does not
        decode, or a file larger than `MAX_FILE_BYTES`.
    """
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SessionRefused(422, "What was given as files is not a list of files.")
    files: List[UploadedFile] = []
    for index, item in enumerate(raw):
        given = item if isinstance(item, Mapping) else {}
        name, data_url = given.get("name"), given.get("data_url")
        if not isinstance(name, str) or not isinstance(data_url, str):
            raise SessionRefused(
                422,
                f"File {index + 1} is not a file as File upload gives it "
                "({name, type, size, data_url}).",
            )
        head, comma, body = data_url.partition(",")
        if not head.startswith("data:") or not comma:
            raise SessionRefused(
                422, f"{name} could not be read: it is not a data URL."
            )
        try:
            content = (
                base64.b64decode(body, validate=True)
                if head.endswith(";base64")
                else body.encode("utf-8")
            )
        except (binascii.Error, ValueError):
            raise SessionRefused(
                422, f"{name} could not be read: its data URL does not decode."
            ) from None
        if len(content) > MAX_FILE_BYTES:
            raise SessionRefused(
                413,
                f"{name} is {len(content):,} bytes: a session takes files of at most "
                f"{MAX_FILE_BYTES:,}.",
            )
        media_type = given.get("type")
        if not isinstance(media_type, str) or not media_type:
            media_type = head[len("data:") :].split(";", 1)[0]
        files.append(UploadedFile(_file_name(name), media_type, content))
    return files


def is_text(file: UploadedFile) -> bool:
    """Whether a file is read as text."""
    return (
        file.media_type.startswith("text/")
        or file.media_type in TEXT_TYPES
        or bool(TEXT_EXTENSIONS.search(file.name))
    )


def text_in_words(file: UploadedFile) -> str:
    """A text file in a message, its contents fenced — or why it cannot go."""
    if not is_text(file):
        raise SessionRefused(
            422,
            f"{file.name} is not a text file, and the application has no computer "
            "to read it in: a file that is not text reaches an application whose "
            "permissions turn its shell on.",
        )
    try:
        text = file.content.decode("utf-8")
    except UnicodeDecodeError:
        raise SessionRefused(422, f"{file.name} is not UTF-8 text.") from None
    if len(text) > MAX_TEXT_CHARACTERS:
        raise SessionRefused(
            413,
            f"{file.name} is too long to send in a message: {len(text):,} characters, "
            f"at most {MAX_TEXT_CHARACTERS:,}; an application whose permissions turn "
            "its shell on reads it in its sandbox instead.",
        )
    fence = "~~~~" if "```" in text else "```"
    body = text[:-1] if text.endswith("\n") else text
    return (
        f"The file {file.name} ({file.media_type or 'text'}):\n{fence}\n{body}\n{fence}"
    )


def _sandbox_of(agent_id: str) -> Any:
    """The sandbox an agent runs its code in: its own, else the runtime's."""
    from agent_runtimes.services.code_sandbox_manager import get_code_sandbox_manager

    manager = get_code_sandbox_manager()
    return manager.get_agent_sandbox(agent_id) or manager.get_managed_sandbox()


def put_in_sandbox(agent_id: str, session_uid: str, file: UploadedFile) -> str:
    """Put a file in the agent's sandbox; where it is, relative to where its code runs.

    Raises
    ------
    SessionRefused
        When the sandbox does not have it afterwards.
    """
    path = f"{FILES_DIR}/{session_uid}/{file.name}"
    sandbox = _sandbox_of(agent_id)
    try:
        sandbox.files.write_bytes(path, file.content)
        there = sandbox.files.exists(path)
    except Exception as error:  # noqa: BLE001 - said, never let through
        raise SessionRefused(
            502, f"{file.name} could not be put in the sandbox: {error}"
        ) from None
    if not there:
        raise SessionRefused(502, f"{file.name} could not be put in the sandbox.")
    return path


def placed_in_words(file: UploadedFile, path: str) -> str:
    """What the agent is told of a file put in its sandbox."""
    return (
        f"The file {file.name} ({file.media_type or 'a file'}, {len(file.content):,} "
        f"bytes) is in your sandbox at {path}: read it in code."
    )


# --- what an application's code asks, in words -------------------------------------


def question_of(question: Question) -> Dict[str, Any]:
    """A question as the ``loop.ask`` event carries it."""
    if isinstance(question, ChoiceQuestion):
        return {
            "kind": "choice",
            "prompt": question.prompt,
            "options": list(question.options),
        }
    if isinstance(question, FileQuestion):
        return {
            "kind": "file",
            "prompt": question.prompt,
            "accept": list(question.accept),
            "max_bytes": question.max_bytes,
        }
    if isinstance(question, FormQuestion):
        return {
            "kind": "form",
            "prompt": question.prompt,
            "fields": [item.model_dump(exclude_none=True) for item in question.fields],
        }
    return {"kind": "text", "prompt": question.prompt}


def question_in_words(question: Question) -> str:
    """A question as the person reads it in the conversation."""
    if isinstance(question, ChoiceQuestion):
        return f"{question.prompt} ({' or '.join(question.options)})"
    if isinstance(question, FileQuestion):
        accepted = ", ".join(question.accept) or "any file"
        return f"{question.prompt} (a file: {accepted})"
    if isinstance(question, FormQuestion):
        labels = ", ".join(item.label or item.id for item in question.fields)
        return f"{question.prompt} ({labels})"
    return question.prompt


# --- AG-UI ---------------------------------------------------------------------


def _encode(event: Any) -> str:
    """An AG-UI event as a server-sent event."""
    from ag_ui.encoder import EventEncoder

    return str(EventEncoder().encode(event))


def _sse_events(buffer: str) -> Tuple[List[Dict[str, Any]], str]:
    """The whole events in a piece of an SSE stream, and what is left of it."""
    events: List[Dict[str, Any]] = []
    while "\n\n" in buffer:
        block, buffer = buffer.split("\n\n", 1)
        data = "\n".join(
            line[len("data:") :].lstrip()
            for line in block.splitlines()
            if line.startswith("data:")
        )
        if not data:
            continue
        try:
            parsed = json.loads(data)
        except ValueError:
            continue
        if isinstance(parsed, dict):
            events.append(parsed)
    return events, buffer


def _text_of(content: Any) -> str:
    """A message's text, from AG-UI content: a string, or parts."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(part.get("text") or "")
            for part in content
            if isinstance(part, Mapping) and part.get("type") == "text"
        )
    return ""


def _new_id() -> str:
    """A new uid."""
    return uuid.uuid4().hex


# --- Python applications on a runtime -----------------------------------------------

_CODE: Dict[Tuple[str, str], Any] = {}


def code_of(app: AppSpec) -> Any:
    """The `Application` an application's code defines, when it is written in Python.

    An example of the catalogue built from its ``app.py`` (`APP_BUILT`), at the
    version the runtime runs; ``None`` for a spec, which its agent answers.
    """
    from agent_runtimes.specs.apps import APP_BUILT

    if APP_BUILT.get(app.id) != "python":
        return None
    key = (app.id, app.version)
    if key not in _CODE:
        import agentspecs.apps

        from agent_runtimes.loop.apps.application import load_application

        path = Path(agentspecs.apps.__file__).parent / app.id / "app.py"
        application = load_application(path)
        _CODE[key] = application if application.spec.version == app.version else None
    return _CODE[key]


#: The ``CUSTOM`` event that says a message's author, or that it was removed
#: (LOOP P-15): ``{id, author}`` or ``{id, removed: true}``.
LOOP_MESSAGE = "loop.message"

#: The tool whose result the chat draws as an A2UI surface where it lands
#: (``frontend_render_tools``, the ``a2ui-surface`` renderer): what an answer
#: shows besides its text is sent as its result, under the message (LOOP P-04).
SHOW_TOOL = "render_a2ui_surface"


def _shown_call_id(message_id: str) -> str:
    """The tool call that carries what a message shows."""
    return f"{message_id}-shows"


# --- the session ----------------------------------------------------------------


@dataclass
class LiveSession:
    """A session on this runtime: what the routes of the session API act on."""

    uid: str
    agent_id: str
    app: AppSpec
    instance: Dict[str, Any]
    """What the platform runs: ``app_uid``, ``deployment_uid``, ``version``."""
    opened_by: Caller
    acts_as: Dict[str, str]
    """In whose name it runs: ``{kind: principal, uid, deployment_uid}`` or ``{kind: person, uid}``."""
    recorder: AppRecorder
    settings: Dict[str, Any] = field(default_factory=dict)
    state: str = "open"
    messages: List[Dict[str, Any]] = field(default_factory=list)
    """The conversation so far, as AG-UI messages: what a run is given."""
    files: List[Dict[str, Any]] = field(default_factory=list)
    """The files given, each ``{name, type, size, path}`` (``path`` in the sandbox, or ``""``)."""
    started_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    resumed: bool = False

    # The code's, for an application written in Python.
    host: Any = None
    session: Optional[Session] = None

    _task: Optional[asyncio.Task[Any]] = field(default=None, init=False, repr=False)
    _queue: Optional[asyncio.Queue[Optional[str]]] = field(
        default=None, init=False, repr=False
    )
    _run_id: str = field(default="", init=False, repr=False)
    _question: Optional[Question] = field(default=None, init=False, repr=False)
    _answer: Optional[asyncio.Future[Any]] = field(default=None, init=False, repr=False)
    _unasked: List[UploadedFile] = field(default_factory=list, init=False, repr=False)
    _sent_settings: Dict[str, Any] = field(default_factory=dict, init=False, repr=False)
    _streamed: Dict[str, List[str]] = field(
        default_factory=dict, init=False, repr=False
    )

    # --- what the session is -----------------------------------------------------

    @property
    def deployment_uid(self) -> str:
        """The deployment it runs as, or ``""`` for a Preview."""
        return str(self.instance.get("deployment_uid") or "")

    @property
    def written_in_python(self) -> bool:
        """Whether its application's code reacts to it."""
        return self.host is not None

    def describe(self) -> Dict[str, Any]:
        """The session as the API says it."""
        return {
            "uid": self.uid,
            "agent": self.agent_id,
            "app": {
                "id": self.app.id,
                "version": self.app.version,
                "name": self.app.name,
                "kind": self.app.kind,
            },
            "instance": {
                "app_uid": str(self.instance.get("app_uid") or ""),
                "deployment_uid": self.deployment_uid,
                "version": int(self.instance.get("version") or 0),
            },
            "preview": not self.deployment_uid,
            "acts_as": dict(self.acts_as),
            "opened_by": {"kind": self.opened_by.kind, "uid": self.opened_by.uid},
            "state": self.state,
            "settings": dict(self.settings),
            "asking": question_of(self._question) if self._question else None,
            "files": [dict(item) for item in self.files],
            "python": self.written_in_python,
            "turns": sum(1 for m in self.messages if m.get("role") == "user"),
            "started_at": self.started_at,
            "resumed": self.resumed,
        }

    def answers_to(self, caller: Caller) -> bool:
        """Whether a caller may drive this session: who opened it, or the machine itself."""
        if caller.kind == "local":
            return True
        # An embed's visitors are one owner's token each: told apart by the
        # visit their token was issued for (LOOP R-20).
        return (caller.kind, caller.uid, caller.visit) == (
            self.opened_by.kind,
            self.opened_by.uid,
            self.opened_by.visit,
        )

    # --- streaming -----------------------------------------------------------------

    def _emit(self, chunk: str) -> None:
        """Stream an encoded event, when a request reads the turn."""
        if self._queue is not None:
            self._queue.put_nowait(chunk)

    def emit(self, event: Any) -> None:
        """Stream an AG-UI event to whoever reads the turn now."""
        self._emit(_encode(event))

    def _end_stream(self) -> None:
        """End what the request reading the turn streams."""
        if self._queue is not None:
            self._queue.put_nowait(None)
            self._queue = None

    def session_event(self) -> str:
        """The ``loop.session`` event: what the session is now."""
        from ag_ui.core import CustomEvent

        return _encode(CustomEvent(name="loop.session", value=self.describe()))

    def _open_stream(self, run_id: str = "") -> asyncio.Queue[Optional[str]]:
        """A stream for the next request, under a run id."""
        queue: asyncio.Queue[Optional[str]] = asyncio.Queue()
        self._queue = queue
        self._run_id = run_id or _new_id()
        return queue

    async def _drain(
        self, queue: asyncio.Queue[Optional[str]], head: str = ""
    ) -> AsyncIterator[str]:
        """What a request streams: the turn's events, until it ends or waits.

        A client gone before either stops the turn: what it asked for is not
        wanted any more. The session stays open.
        """
        ended = False
        try:
            if head:
                yield head
            while True:
                chunk = await queue.get()
                if chunk is None:
                    ended = True
                    return
                yield chunk
        finally:
            if not ended and self._queue is queue and self._task is not None:
                self._task.cancel()

    def _start_turn(
        self,
        work: Callable[[], Awaitable[None]],
        *,
        run_id: str = "",
        wraps_run: bool,
        head: str = "",
        counts: bool = True,
    ) -> AsyncIterator[str]:
        """Run ``work`` as the session's turn, and stream it.

        ``wraps_run``: the turn is framed by ``RUN_STARTED`` and ``RUN_FINISHED``
        here — the code's turns; an agent's run frames its own. ``counts``: it
        is one of a visitor's turns (LOOP R-30) — opening with nothing to
        say is not.
        """
        from ag_ui.core import RunErrorEvent, RunFinishedEvent, RunStartedEvent

        if self.state == "stopped":
            raise SessionRefused(
                409, f"Session {self.uid} is stopped: resume it before going on."
            )
        if self.state in ("running", "waiting"):
            raise SessionRefused(
                409,
                f"Session {self.uid} is "
                + ("answering" if self.state == "running" else "waiting for an answer")
                + ": wait, or stop it.",
            )
        visitor = self.opened_by.kind == "visitor"
        if visitor and counts:
            from agent_runtimes.loop.apps.visitors import admit_turn

            refusal = admit_turn(self.opened_by.uid, self.started_at)
            if refusal:
                raise SessionRefused(429, refusal)
        queue = self._open_stream(run_id)
        self.state = "running"
        # The caller's token, set by the route: what they allow is read with it.
        token = get_request_user_jwt() or ""

        async def runner() -> None:
            """The turn, framed, its failure said on the stream."""
            from agent_runtimes.loop.apps.memory import remember_for
            from agent_runtimes.loop.apps.visitors import (
                enter_visitor_run,
                use_turn_token,
            )

            # It remembers for whoever opened the session, each person apart,
            # a visitor not signed in nothing (LOOP R-18, R-36).
            remember_for(self.opened_by, token)
            # A visitor's turn calls its models with their own token, and
            # reads only (LOOP R-30); anybody else's with what it always did.
            use_turn_token(token if visitor else "")
            # An embed's visitor is nobody the platform knows: their turn
            # only reads, and asks nobody, as a visitor's (LOOP R-20).
            if self.opened_by.kind == "embed":
                enter_visitor_run(f"embed:{self.opened_by.visit}")
            try:
                if wraps_run:
                    self.emit(RunStartedEvent(thread_id=self.uid, run_id=self._run_id))
                await work()
                if wraps_run:
                    self.emit(RunFinishedEvent(thread_id=self.uid, run_id=self._run_id))
            except asyncio.CancelledError:
                raise
            except (SessionRefused, InvalidAnswer) as refused:
                self.emit(RunErrorEvent(message=str(refused)))
            except Exception as error:  # noqa: BLE001 - said on the stream
                logger.exception("A turn of session %s failed.", self.uid)
                self.emit(RunErrorEvent(message=f"The turn failed: {error}"))
            finally:
                self._question = None
                self._answer = None
                if self.state != "stopped":
                    self.state = "open"
                self._end_stream()

        self._task = asyncio.get_running_loop().create_task(runner())
        return self._drain(queue, head)

    # --- the code's channel --------------------------------------------------------

    async def deliver(self, event: Event) -> None:
        """What the application's code shows, as AG-UI events (the `Channel`)."""
        from ag_ui.core import (
            CustomEvent,
            StepFinishedEvent,
            StepStartedEvent,
            TextMessageContentEvent,
            TextMessageEndEvent,
            TextMessageStartEvent,
            ToolCallArgsEvent,
            ToolCallEndEvent,
            ToolCallResultEvent,
            ToolCallStartEvent,
        )

        if isinstance(event, Delta):
            if event.message_id not in self._streamed:
                self._streamed[event.message_id] = []
                self.emit(
                    TextMessageStartEvent(message_id=event.message_id, role="assistant")
                )
            self._streamed[event.message_id].append(event.text)
            if event.text:
                self.emit(
                    TextMessageContentEvent(
                        message_id=event.message_id, delta=event.text
                    )
                )
        elif isinstance(event, Message):
            # A message delivered again under its id is that message changed:
            # it is written again whole, under the same id, which a page
            # draws in place of what it said (LOOP P-15).
            if self._streamed.pop(event.id, None) is None:
                self.emit(TextMessageStartEvent(message_id=event.id, role="assistant"))
                if event.text:
                    self.emit(
                        TextMessageContentEvent(message_id=event.id, delta=event.text)
                    )
            self.emit(TextMessageEndEvent(message_id=event.id))
            kept: Dict[str, Any] = {
                "id": event.id,
                "role": "assistant",
                "content": event.text,
            }
            if event.components:
                # What it shows: a surface under the message, as the result
                # of the tool the chat draws surfaces for (LOOP P-04).
                shown = answer_surface(
                    event.id, event.author, event.components, event.data
                )
                call_id = _shown_call_id(event.id)
                self.emit(
                    ToolCallStartEvent(
                        tool_call_id=call_id,
                        tool_call_name=SHOW_TOOL,
                        parent_message_id=event.id,
                    )
                )
                self.emit(ToolCallArgsEvent(tool_call_id=call_id, delta="{}"))
                self.emit(ToolCallEndEvent(tool_call_id=call_id))
                self.emit(
                    ToolCallResultEvent(
                        message_id=_new_id(),
                        tool_call_id=call_id,
                        content=json.dumps(shown),
                        role="tool",
                    )
                )
                kept["shows"] = shown
            if event.author != self.app.name:
                kept["name"] = event.author
                self.emit(
                    CustomEvent(
                        name=LOOP_MESSAGE,
                        value={"id": event.id, "author": event.author},
                    )
                )
            for index, said in enumerate(self.messages):
                if said.get("id") == event.id:
                    self.messages[index] = kept
                    break
            else:
                self.messages.append(kept)
        elif isinstance(event, Removed):
            self.messages = [
                said for said in self.messages if said.get("id") != event.message_id
            ]
            self.emit(
                CustomEvent(
                    name=LOOP_MESSAGE, value={"id": event.message_id, "removed": True}
                )
            )
        elif isinstance(event, Step):
            if event.ended_at is None:
                self.emit(StepStartedEvent(step_name=event.name))
            else:
                self.emit(StepFinishedEvent(step_name=event.name))

    async def ask(self, session_id: str, question: Question) -> Any:
        """What the code asks: a file already given answers a file; else the person is asked.

        The stream ends on the question, and the turn waits for the answer.
        """
        from ag_ui.core import CustomEvent, RunFinishedEvent

        if isinstance(question, FileQuestion) and self._unasked:
            return self._unasked.pop(0)
        self._question = question
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._answer = future
        self.emit(CustomEvent(name="loop.ask", value=question_of(question)))
        await self.deliver(
            Message(_new_id(), self.uid, question_in_words(question), self.app.name)
        )
        self.emit(RunFinishedEvent(thread_id=self.uid, run_id=self._run_id))
        self.state = "waiting"
        self._end_stream()
        return await future

    def _go_on(
        self, answer: Any, *, run_id: str = "", head: str = ""
    ) -> AsyncIterator[str]:
        """Answer the question waited on, and stream the rest of the turn."""
        from ag_ui.core import RunStartedEvent

        future = self._answer
        assert future is not None
        queue = self._open_stream(run_id)
        self.state = "running"
        self._question = None
        self._answer = None
        self.emit(RunStartedEvent(thread_id=self.uid, run_id=self._run_id))
        future.set_result(answer)
        return self._drain(queue, head)

    def _waiting_for(self) -> str:
        """What the session waits for, in a sentence."""
        question = self._question
        assert question is not None
        return (
            f"{self.app.name} is waiting for an answer: {question_in_words(question)}"
        )

    # --- the lifecycle -------------------------------------------------------------

    async def _open_code(self, woken_by: Optional[Dict[str, Any]] = None) -> None:
        """The record begins, and the code's ``start`` runs."""
        self.recorder.start(self.uid, woken_by=woken_by)
        await self.recorder.flush(self.uid)
        if self.host is not None and self.session is None:
            self.session = await self.host.open(
                user=self.opened_by.uid or None, settings=self.settings, id=self.uid
            )

    def open(
        self,
        *,
        opener: str = "",
        woken_by: Optional[Dict[str, Any]] = None,
        head: str = "",
        bearer: str = "",
    ) -> AsyncIterator[str]:
        """Start: the session's record begins, the code's ``start`` runs, then the opener."""

        async def work() -> None:
            """The turn."""
            await self._open_code(woken_by)
            if not opener:
                return
            if self.host is not None:
                await self._message_code(opener)
                return
            words = self._settings_in_words()
            said = f"{opener}\n\n{words}" if words else opener
            await self._run_agent(self._with_turn(said), bearer=bearer)

        return self._start_turn(
            work, wraps_run=self.host is not None, head=head, counts=bool(opener)
        )

    def _with_turn(self, text: str) -> List[Dict[str, Any]]:
        """The conversation with the person's next message."""
        self.messages.append({"id": _new_id(), "role": "user", "content": text})
        return list(self.messages)

    async def _message_code(self, text: str) -> None:
        """A message, for the code: its ``message``, or its agent's answer."""
        if self.session is None:
            await self._open_code()
        assert self.session is not None
        self.messages.append({"id": _new_id(), "role": "user", "content": text})
        await self.host.message(self.session, text)

    async def _action_code(
        self,
        name: str,
        payload: Mapping[str, Any],
        text: str,
        given: List[UploadedFile],
    ) -> None:
        """A block's action, for the code: its handler, else a message.

        The files given answer what the code asks for a file, now or later in
        the session; a handler also has them in its payload, under ``files``.
        """
        self._keep(given)
        self._unasked.extend(given)
        handler = self.host.app.actions.get(name)
        if handler is None:
            await self._message_code(text.strip() or name)
            return
        if self.session is None:
            await self._open_code()
        assert self.session is not None
        body = {**dict(payload), **({"files": given} if given else {})}
        await self.host.action(self.session, name, body)

    def _answer_waiting(
        self,
        *,
        text: str = "",
        files: Optional[List[UploadedFile]] = None,
        values: Optional[Mapping[str, Any]] = None,
        run_id: str = "",
        head: str = "",
    ) -> AsyncIterator[str]:
        """Answer what the code waits on with what came, or say what it waits for."""
        question = self._question
        if isinstance(question, FileQuestion) and files:
            self._keep(files)
            self._unasked.extend(files[1:])
            return self._go_on(files[0], run_id=run_id, head=head)
        if isinstance(question, FormQuestion) and values is not None:
            return self._go_on(dict(values), run_id=run_id, head=head)
        if isinstance(question, (TextQuestion, ChoiceQuestion)) and text:
            self.messages.append({"id": _new_id(), "role": "user", "content": text})
            return self._go_on(text, run_id=run_id, head=head)
        raise SessionRefused(409, self._waiting_for())

    def message(
        self, text: str, *, bearer: str = "", head: str = ""
    ) -> AsyncIterator[str]:
        """A message: an answer to what the code asks, else the next turn."""
        text = text.strip()
        if not text:
            raise SessionRefused(422, "Nothing to send: write a message first.")
        if self.state == "waiting":
            return self._answer_waiting(text=text, head=head)
        if self.host is not None:
            return self._start_turn(
                lambda: self._message_code(text), wraps_run=True, head=head
            )

        async def work() -> None:
            """The turn."""
            words = self._settings_in_words()
            said = f"{text}\n\n{words}" if words else text
            await self._run_agent(self._with_turn(said), bearer=bearer)

        return self._start_turn(work, wraps_run=False, head=head)

    def action(
        self,
        name: str,
        *,
        payload: Optional[Mapping[str, Any]] = None,
        text: str = "",
        files: Optional[List[UploadedFile]] = None,
        bearer: str = "",
        run_id: str = "",
        head: str = "",
    ) -> AsyncIterator[str]:
        """A page block's action: its code's handler, else a turn of its agent.

        Files given with it are the session's: they answer what the code asks
        for a file, or are put in the sandbox of an agent with a shell (a text
        file goes in the message of one without).
        """
        given = list(files or [])
        if self.state == "waiting":
            return self._answer_waiting(
                text=text, files=given, run_id=run_id, head=head
            )
        # A form's values are checked again here, against its schema (C-16).
        refused = form_values_refused(self.app, name, payload or {})
        if refused:
            raise SessionRefused(422, refused)
        if self.host is not None:
            return self._start_turn(
                lambda: self._action_code(name, payload or {}, text, given),
                run_id=run_id,
                wraps_run=True,
                head=head,
            )
        # What the block gave — a row chosen, a form's values — said to the
        # agent, which has no handler of its own.
        done = (
            f"On the page, {name}: {json.dumps(dict(payload), ensure_ascii=False, default=str)}"
            if payload
            else ""
        )
        if not (text.strip() or done or given):
            raise SessionRefused(
                422,
                f"“{name}” gave {self.app.name} nothing to run on: no message, no file.",
            )

        async def work() -> None:
            """The turn."""
            words = await asyncio.to_thread(self._files_in_words, given)
            said = "\n\n".join(
                part
                for part in (text.strip(), done, self._settings_in_words(), words)
                if part
            )
            await self._run_agent(self._with_turn(said), bearer=bearer)

        return self._start_turn(work, run_id=run_id, wraps_run=False, head=head)

    def _keep(self, given: List[UploadedFile], path: str = "") -> None:
        """Say the files given among the session's."""
        for file in given:
            self.files.append(
                {
                    "name": file.name,
                    "type": file.media_type,
                    "size": len(file.content),
                    "path": path,
                }
            )

    def _files_in_words(self, given: List[UploadedFile]) -> str:
        """What the agent is told of the files given: where they are, or their text."""
        shell = bool(self.app.permissions.computer.shell)
        parts: List[str] = []
        for file in given:
            if shell:
                path = put_in_sandbox(self.agent_id, self.uid, file)
                parts.append(placed_in_words(file, path))
                self._keep([file], path)
            else:
                parts.append(text_in_words(file))
                self._keep([file])
        return "\n\n".join(parts)

    def change_settings(
        self, values: Mapping[str, Any], *, head: str = ""
    ) -> AsyncIterator[str]:
        """A settings change: checked against its inputs, kept, its code's ``settings`` run.

        A form the code is waiting on — its fields are the settings — is answered by it.
        """
        try:
            updated = form_values(
                self.app.interface.settings, {**self.settings, **values}
            )
        except InvalidAnswer as wrong:
            raise SessionRefused(422, str(wrong)) from None
        if self.state == "waiting":
            answered = self._answer_waiting(values=values, head=head)
            self.settings = updated
            return answered
        self.settings = updated

        async def work() -> None:
            """The turn."""
            if self.host is not None:
                if self.session is None:
                    await self._open_code()
                assert self.session is not None
                await self.host.settings(self.session, values)

        return self._start_turn(work, wraps_run=True, head=head)

    def _settings_in_words(self) -> str:
        """The settings, in words, when they changed since they were last sent."""
        if self.settings == self._sent_settings:
            return ""
        self._sent_settings = dict(self.settings)
        labels = {
            item.id: item.label or item.id for item in self.app.interface.settings
        }
        return "\n".join(
            f"{labels.get(key, key)}: {value}"
            for key, value in self.settings.items()
            if str(value).strip()
        )

    async def stop(self) -> None:
        """Stop: what runs is cancelled, the code's ``stop`` runs, and the session waits to be resumed."""
        await self._close()
        self.state = "stopped"
        if self.host is not None and self.session is not None:
            # Its own `stop` has nothing left to cancel: it runs, and what it
            # shows is kept in the conversation for whoever resumes it.
            await self.host.stop(self.session)

    async def end(self) -> None:
        """End: what runs is cancelled, the code's ``end`` runs, and the
        runtime no longer holds the session (LOOP P-14).

        Its record stays: it is resumed from it, as any session this runtime
        no longer holds.
        """
        await self._close()
        if self.host is not None and self.session is not None:
            # Nobody reads what it shows: the conversation is closed.
            await self.host.end(self.session)
        self.state = "ended"
        _SESSIONS.pop(self.uid, None)

    async def logout(self) -> None:
        """The person signed out: the code's ``logout`` runs, then the session ends (LOOP P-14)."""
        await self._close()
        if self.host is not None and self.session is not None:
            await self.host.logout(self.session)
        self.state = "ended"
        _SESSIONS.pop(self.uid, None)

    async def _close(self) -> None:
        """Cancel the turn and the question waited on, and end the stream."""
        task = self._task
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if self._answer is not None and not self._answer.done():
            self._answer.cancel()
        self._question = None
        self._answer = None
        self._end_stream()

    def resume(self, *, head: str = "") -> AsyncIterator[str]:
        """Resume: the conversation so far, then the code's ``resume``; open again."""
        from ag_ui.core import MessagesSnapshotEvent

        if self.state != "stopped":
            raise SessionRefused(
                409, f"Session {self.uid} is {self.state}, not stopped."
            )
        self.state = "open"

        async def work() -> None:
            """The turn."""
            self.emit(MessagesSnapshotEvent(messages=_snapshot(self.messages)))
            self.recorder.start(self.uid, resumed=self.resumed)
            await self.recorder.flush(self.uid)
            if self.host is not None:
                state = dict(self.session.state) if self.session is not None else {}
                self.session = await self.host.resume(
                    self.uid,
                    state,
                    user=self.opened_by.uid or None,
                    settings=self.settings,
                )

        return self._start_turn(work, wraps_run=True, head=head)

    # --- an agent's run -----------------------------------------------------------

    async def _run_agent(self, history: List[Dict[str, Any]], *, bearer: str) -> None:
        """A run of the application's agent, through its own AG-UI app, streamed."""
        body = {
            "threadId": self.uid,
            "runId": self._run_id,
            "state": None,
            "messages": history,
            "tools": [],
            "context": [],
            "forwardedProps": None,
        }
        await self.forward(body, bearer=bearer)

    async def forward(self, body: Dict[str, Any], *, bearer: str) -> None:
        """Run the agent on an AG-UI input, its events streamed and its answer kept."""
        from agent_runtimes.routes.agui import get_agui_app

        app = get_agui_app(self.agent_id)
        if app is None:
            raise SessionRefused(
                410, f"The agent of {self.app.name} is no longer on this runtime."
            )
        raw = json.dumps(body).encode("utf-8")
        headers = [
            (b"content-type", b"application/json"),
            (b"accept", b"text/event-stream"),
        ]
        if bearer:
            headers.append((b"authorization", f"Bearer {bearer}".encode("latin-1")))
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "root_path": "",
            "query_string": b"",
            "headers": headers,
            "client": ("127.0.0.1", 0),
            "server": ("agent-runtimes", 80),
        }
        delivered = False

        async def receive() -> Dict[str, Any]:
            """The run, once; then nothing until the run is done."""
            nonlocal delivered
            if delivered:
                await asyncio.Event().wait()
            delivered = True
            return {"type": "http.request", "body": raw, "more_body": False}

        status = 0
        refused: List[bytes] = []
        buffer = ""
        answers: Dict[str, List[str]] = {}

        async def send(message: Mapping[str, Any]) -> None:
            """Stream what the agent answers, and keep its text."""
            nonlocal status, buffer
            if message["type"] == "http.response.start":
                status = int(message["status"])
                return
            if message["type"] != "http.response.body":
                return
            chunk = bytes(message.get("body") or b"")
            if status >= 300:
                refused.append(chunk)
                return
            if not chunk:
                return
            text = chunk.decode("utf-8", errors="replace")
            self._emit(text)
            events, buffer = _sse_events(buffer + text)
            for event in events:
                if event.get("type") == "TEXT_MESSAGE_START":
                    answers.setdefault(str(event.get("messageId")), [])
                elif event.get("type") == "TEXT_MESSAGE_CONTENT":
                    answers.setdefault(str(event.get("messageId")), []).append(
                        str(event.get("delta") or "")
                    )

        await app(scope, receive, send)
        if status >= 300:
            said = b"".join(refused).decode("utf-8", errors="replace")[:500]
            raise SessionRefused(
                status, f"The agent refused the turn ({status}): {said}"
            )
        for message_id, pieces in answers.items():
            text = "".join(pieces)
            if text:
                self.messages.append(
                    {"id": message_id, "role": "assistant", "content": text}
                )

    def run_agui(
        self, body: Dict[str, Any], *, loop: Mapping[str, Any], bearer: str
    ) -> AsyncIterator[str]:
        """An AG-UI run of the session, as a chat sends it.

        ``forwardedProps.loop`` says what the page did besides the message: the
        settings it holds (``settings``), the action of a block (``action``:
        ``{name, payload}``) and the files given with it (``files``).
        """
        run_id = str(body.get("runId") or "")
        messages = [
            dict(m) for m in body.get("messages") or [] if isinstance(m, Mapping)
        ]
        last = messages[-1] if messages else {}
        text = _text_of(last.get("content")) if last.get("role") == "user" else ""
        settings = loop.get("settings")
        if settings is not None and not isinstance(settings, Mapping):
            raise SessionRefused(422, "The settings sent are not values by id.")
        if settings is not None:
            try:
                self.settings = form_values(
                    self.app.interface.settings, {**self.settings, **settings}
                )
            except InvalidAnswer as wrong:
                raise SessionRefused(422, str(wrong)) from None
            # The page says them in its message: not said again.
            self._sent_settings = dict(self.settings)
        files = given_files(loop.get("files"))
        action = loop.get("action")
        if action is not None and not isinstance(action, Mapping):
            raise SessionRefused(422, "The action sent is not {name, payload}.")
        if self.state == "waiting":
            return self._answer_waiting(
                text=text, files=files, values=settings, run_id=run_id
            )
        if self.host is not None:
            if action is None and not files:
                if not text:
                    raise SessionRefused(422, "Nothing to send: write a message first.")
                return self._start_turn(
                    lambda: self._message_code(text), run_id=run_id, wraps_run=True
                )
            return self.action(
                str((action or {}).get("name") or "run"),
                payload=(action or {}).get("payload") or {},
                text=text,
                files=files,
                run_id=run_id,
            )
        if files and not text:
            raise SessionRefused(
                422, "A file was given with no message to run it with."
            )
        # A spec: the chat's conversation is the session's, the files given
        # are put where its agent reads them, and the run is its agent's.
        forwarded = body.get("forwardedProps")
        if isinstance(forwarded, Mapping):
            forwarded = {
                key: value for key, value in forwarded.items() if key != "loop"
            }

        async def work() -> None:
            """The turn."""
            words = await asyncio.to_thread(self._files_in_words, files)
            said = (
                [*messages[:-1], {**last, "content": f"{text}\n\n{words}"}]
                if words
                else messages
            )
            self.messages = [dict(m) for m in said]
            run = {
                "state": None,
                "tools": [],
                "context": [],
                **body,
                "threadId": self.uid,
                "runId": self._run_id,
                "messages": said,
                "forwardedProps": forwarded or None,
            }
            await self.forward(run, bearer=bearer)

        return self._start_turn(work, run_id=run_id, wraps_run=False)


def _snapshot(messages: List[Dict[str, Any]]) -> List[Any]:
    """The conversation as AG-UI messages, for a snapshot.

    What a message showed comes back as the call of the tool that drew it,
    and its result (LOOP P-04).
    """
    from ag_ui.core import (
        AssistantMessage,
        FunctionCall,
        ToolCall,
        ToolMessage,
        UserMessage,
    )

    shown: List[Any] = []
    for message in messages:
        content = _text_of(message.get("content"))
        if message.get("role") == "user":
            shown.append(
                UserMessage(id=str(message.get("id") or _new_id()), content=content)
            )
        elif message.get("role") == "assistant":
            message_id = str(message.get("id") or _new_id())
            surface = message.get("shows")
            call_id = _shown_call_id(message_id)
            shown.append(
                AssistantMessage(
                    id=message_id,
                    content=content,
                    name=message.get("name") or None,
                    tool_calls=(
                        [
                            ToolCall(
                                id=call_id,
                                function=FunctionCall(name=SHOW_TOOL, arguments="{}"),
                            )
                        ]
                        if surface
                        else None
                    ),
                )
            )
            if surface:
                shown.append(
                    ToolMessage(
                        id=f"{call_id}-result",
                        tool_call_id=call_id,
                        content=json.dumps(surface),
                    )
                )
    return shown


# --- the sessions of this runtime ------------------------------------------------------

_SESSIONS: Dict[str, LiveSession] = {}


def session_of(uid: str) -> Optional[LiveSession]:
    """A session of this runtime, by uid, or None."""
    return _SESSIONS.get(uid)


def forget_sessions() -> None:
    """Forget every session (a test)."""
    _SESSIONS.clear()


def agent_app(agent_id: str) -> Tuple[AppSpec, Dict[str, Any]]:
    """The application an agent of this runtime runs, and the instance it serves.

    Raises
    ------
    SessionRefused
        When there is no such agent, or it runs no application.
    """
    from agent_runtimes.loop.apps.loading import load_app
    from agent_runtimes.routes.agents import get_stored_agent_spec

    stored = get_stored_agent_spec(agent_id)
    if not stored:
        raise SessionRefused(404, f"There is no agent {agent_id} on this runtime.")
    spec = stored.get("app_spec")
    if not spec:
        raise SessionRefused(404, f"The agent {agent_id} runs no application.")
    return load_app(spec), dict(stored.get("app_instance") or {})


def _agent_maker(agent_id: str) -> Callable[[Session], AppAgent]:
    """The agent a Python application's code calls: the one the runtime made for it."""

    def make(session: Session) -> AppAgent:
        """The runtime's agent of the application, for this session."""
        from agent_runtimes.routes.agui import get_agui_adapter

        adapter = get_agui_adapter(agent_id)
        if adapter is None:
            raise SessionRefused(
                410, f"The agent of {session.app.name} is no longer on this runtime."
            )
        return AppAgent(
            app=session.app,
            agent=adapter._get_pydantic_agent(),
            session_id=session.id,
            # Made with the application's rules, checks and record already.
            capabilities=[],
            toolsets=list(adapter._get_runtime_toolsets()),
        )

    return make


def new_session(
    *,
    agent_id: str,
    app: AppSpec,
    instance: Mapping[str, Any],
    opened_by: Caller,
    acts_as: Dict[str, str],
    settings: Optional[Mapping[str, Any]] = None,
    uid: str = "",
    messages: Optional[List[Dict[str, Any]]] = None,
    resumed: bool = False,
) -> LiveSession:
    """A session of an application's agent on this runtime, kept by uid.

    Raises
    ------
    SessionRefused
        For a uid that is not one, or is taken; settings its inputs refuse.
    """
    if uid and not SESSION_UID.match(uid):
        raise SessionRefused(
            422, "A session's uid is 8 to 128 letters, digits, hyphens or underscores."
        )
    uid = uid or _new_id()
    if uid in _SESSIONS:
        raise SessionRefused(409, f"Session {uid} is already open.")
    try:
        values = form_values(app.interface.settings, dict(settings or {}))
    except InvalidAnswer as wrong:
        raise SessionRefused(422, str(wrong)) from None
    recorder = agent_recorder(agent_id) or AppRecorder(
        app=app,
        app_uid=str(instance.get("app_uid") or ""),
        deployment_uid=str(instance.get("deployment_uid") or ""),
        version=int(instance.get("version") or 0),
    )
    # Who opened it, on its record (LOOP R-31): a person the runtime
    # verified; an embed's visitor or one not signed in is nobody known.
    recorder.opened(uid, opened_by.uid if opened_by.kind == "person" else "")
    live = LiveSession(
        uid=uid,
        agent_id=agent_id,
        app=app,
        instance=dict(instance),
        opened_by=opened_by,
        acts_as=acts_as,
        recorder=recorder,
        settings=values,
        messages=list(messages or []),
        resumed=resumed,
    )
    application = code_of(app)
    if application is not None:
        from agent_runtimes.loop.apps.application import AppHost

        live.host = AppHost(
            application,
            live,
            recorder=recorder,
            agent_maker=_agent_maker(agent_id),
        )
    if resumed:
        live.state = "stopped"
    _SESSIONS[uid] = live
    return live


# --- the record, read back -------------------------------------------------------------


async def _read_record(session_uid: str, bearer: str) -> List[Dict[str, Any]]:
    """A session's record, read from ai-agents as the caller."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise SessionRefused(
            503,
            f"Session {session_uid} cannot be read back: no ai-agents is configured.",
        )
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/records",
            params={"session_uid": session_uid, "limit": 1000},
            headers={"Authorization": f"Bearer {bearer}"},
        )
    if response.status_code >= 300:
        raise SessionRefused(
            502,
            f"The record of session {session_uid} could not be read "
            f"({response.status_code}): {response.text[:200]}",
        )
    return list((response.json() or {}).get("entries") or [])


#: Who reads a session's record back: ai-agents, or a test.
_reader: Dict[str, Callable[[str, str], Awaitable[List[Dict[str, Any]]]]] = {
    "read": _read_record
}


def use_record_reader(
    reader: Optional[Callable[[str, str], Awaitable[List[Dict[str, Any]]]]],
) -> None:
    """Who reads a session's record back; ``None`` for ai-agents."""
    _reader["read"] = reader or _read_record


async def conversation_from_record(
    session_uid: str, app: AppSpec, instance: Mapping[str, Any], bearer: str
) -> List[Dict[str, Any]]:
    """The conversation of a session this runtime no longer holds, from its record.

    Its ``turn`` entries — what was asked and answered — as AG-UI messages.

    Raises
    ------
    SessionRefused
        When the application keeps no conversations, the caller has no token
        to read the record with, the record is not this application's, or it
        holds no turn of the session.
    """
    include = {str(getattr(item, "value", item)) for item in app.record.include}
    if "conversations" not in include:
        raise SessionRefused(
            409,
            f"{app.name} keeps no conversations in its record, so a session of it "
            "cannot be resumed from there.",
        )
    if not bearer:
        raise SessionRefused(
            401,
            f"Session {session_uid} is read back from its record with your token: send one.",
        )
    entries = await _reader["read"](session_uid, bearer)
    app_uid = str(instance.get("app_uid") or app.id)
    if any(str(entry.get("app_uid") or app_uid) != app_uid for entry in entries):
        raise SessionRefused(
            409, f"Session {session_uid} is not a session of {app.name}."
        )
    messages: List[Dict[str, Any]] = []
    for entry in entries:
        if entry.get("kind") != "turn":
            continue
        payload = entry.get("payload") or {}
        asked, answered = (
            str(payload.get("asked") or ""),
            str(payload.get("answered") or ""),
        )
        if asked:
            messages.append({"id": _new_id(), "role": "user", "content": asked})
        if answered:
            messages.append({"id": _new_id(), "role": "assistant", "content": answered})
    if not messages:
        raise SessionRefused(
            404, f"The record holds no turn of session {session_uid} to resume it from."
        )
    return messages


__all__ = [
    "FILES_DIR",
    "LOOP_MESSAGE",
    "MAX_FILE_BYTES",
    "MAX_TEXT_CHARACTERS",
    "STATES",
    "LiveSession",
    "SessionRefused",
    "agent_app",
    "code_of",
    "conversation_from_record",
    "forget_sessions",
    "given_files",
    "is_text",
    "new_session",
    "placed_in_words",
    "put_in_sandbox",
    "question_in_words",
    "question_of",
    "session_of",
    "text_in_words",
    "use_record_reader",
]

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The session API: an application's sessions over the wire (R-04).

The lifecycle — start, message, press, settings change, stop and
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

A file given with a run is the session's: an application with a shell
has it put in its sandbox, where its agent reads it in code, whatever its
type and size; one without a shell is given a text file in the message, and
refused anything else, in a sentence. A file asked by an application's code
(``session.ask(FileQuestion(...))``) is answered by a file given — before or
after it is asked.

The actions of its code are typed (RU-5): each declared with the
model of its payload (``interface.actions``), pressable only with a token
this session minted — on a display its code showed, or on the application's
own (`APP_DISPLAY`, `LiveSession.offered`) — checked before its code runs,
and never said to the model.

What the code shows besides its text — what its answers show, its steps,
its elements, its messages' authors, its window messages — is said as
``reactor.ui`` ops on the session's ui socket (`UI_HUB`, RU-W),
and the presses of what they offer come up it, checked, each waiting for the
run that names it (``forwardedProps.loop.press``).

When the code asks the person something, the stream ends on the question —
the question in words, its display on the ui socket (an ``ask`` op offering
``reactor.answer``, RU-4), and ``RUN_FINISHED`` whose result is
``{asking}`` — and the session
waits: a press of what it offered answers it (a message, text or a choice,
from a client of the session API; a settings change, a form), a file given
a file; the rest of the turn is streamed on that answer's
request.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import re
import secrets
import time
import traceback
import uuid
from collections import deque
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import (
    Any,
    AsyncIterator,
    Awaitable,
    Callable,
    Deque,
    Dict,
    List,
    Mapping,
    Optional,
    Sequence,
    Tuple,
    Union,
)

from pydantic import BaseModel
from reactor.ui import (
    ANSWER_ACTION,
    ActionRegistry,
    Answer,
    AskOp,
    Display,
    MetaOp,
    PatchOp,
    RemoveOp,
    ShowOp,
    UiAction,
    UiActionBusy,
    UiActionPayloadInvalid,
    UiActionRefused,
    UiOp,
    UnknownUiAction,
    WindowBody,
    WindowOp,
    display_type,
)
from reactor.ui.files import UiFiles
from reactor.ui.ws import UiHub

from agent_runtimes.apps.agent import AppAgent
from agent_runtimes.apps.callers import Caller
from agent_runtimes.apps.components import AnswerShows, answer_actions
from agent_runtimes.apps.composer import mode_choice, profile_choice, run_effect
from agent_runtimes.apps.forms import field_title, form_fields
from agent_runtimes.apps.host_user import HostUser, reads_user, signed_host_context
from agent_runtimes.apps.pages import LOOP_PAGE, page_values
from agent_runtimes.apps.record import AppRecorder, agent_recorder, runtime_runs_on
from agent_runtimes.apps.session import (
    ChoiceQuestion,
    Closed,
    Delta,
    Event,
    FileQuestion,
    FormQuestion,
    Interrupted,
    InvalidAnswer,
    Message,
    PageShown,
    Question,
    Removed,
    Said,
    Session,
    Shown,
    Step,
    StepDelta,
    TextQuestion,
    UploadedFile,
    WindowMessage,
    _checked,
    form_values,
    shown_step,
)
from agent_runtimes.apps.speech import HeardSpeech
from agent_runtimes.apps.uploads import (
    given_refused,
    media_part,
    seen_whole,
)
from agent_runtimes.context.identities import get_request_user_jwt
from agent_runtimes.guardrails.credentials import redact
from agent_runtimes.types import AppSpec
from agent_runtimes.voice import VOICE_INTERRUPTED_EVENT, VOICE_SAY_EVENT
from agent_runtimes.voice import heard as heard_input

logger = logging.getLogger(__name__)

#: The largest file a session takes.
MAX_FILE_BYTES = 25 * 1024 * 1024

#: The most of a text file a message carries, for an application without a
#: shell: about thirty thousand tokens.
MAX_TEXT_CHARACTERS = 120_000

#: Where a session's files are put in its sandbox: ``files/<session>/<name>``.
FILES_DIR = "files"

#: A title is at most this long (MH-43).
TITLE_LIMIT = 200

#: A title taken from the first turn's first line is cut here (MH-43).
FIRST_LINE_TITLE = 60


def first_line_title(text: str) -> str:
    """The first turn's first line, cut at 60 characters: a session's title until it is given one."""
    line = next(
        (part.strip() for part in str(text or "").splitlines() if part.strip()), ""
    )
    return line[:FIRST_LINE_TITLE]


#: A session's uid, when its caller names it (the chat's thread).
SESSION_UID = re.compile(r"^[A-Za-z0-9_-]{8,128}$")

#: The states of a session.
#: A session's states (decision 14): `open` (held by a runtime, a turn may
#: run), `paused` (nothing runs; held or not), `ended` (its code's `end` ran;
#: the record stays). `stopped` is not one, and is refused wherever a state
#: is read or written (`check_state`). The runtime's run end `stopped`
#: (`record.RUN_ENDS`) is another vocabulary, untouched.
STATES = ("open", "paused", "ended")

#: The turn phases of an `open` session (decision O): the runtime's, said as
#: `turn` beside `state`, never a state of the record.
TURNS = ("idle", "running", "waiting")


def check_state(word: str) -> str:
    """A state word as the API takes it; refused in a sentence when it is not one."""
    if word not in STATES:
        raise SessionRefused(
            422, f"There is no session state {word!r}: one of {', '.join(STATES)}."
        )
    return word


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


def owner_of(caller: Caller) -> Tuple[str, str, str]:
    """Who a file uploaded is kept for (RU-6): the caller, as a
    session tells its own apart (`LiveSession.answers_to`).
    """
    return (caller.kind, caller.uid, caller.visit)


def given_files(
    raw: Any, *, scope: str, owner: Tuple[str, str, str]
) -> List[UploadedFile]:
    """The files a run names, by the refs their upload answered (RU-6): each read back from `UI_FILES`, for whoever uploaded it in this
    conversation. A file's bytes never ride in the run.

    Raises
    ------
    SessionRefused
        For what is not a list of refs (422) — a file's bytes in a
        ``data_url`` among it — or a ref not kept here for this caller and
        conversation (404).
    """
    from reactor.ui import FileRef
    from reactor.ui.files import UiFileError

    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SessionRefused(422, "What was given as files is not a list of files.")
    files: List[UploadedFile] = []
    for index, item in enumerate(raw):
        if isinstance(item, Mapping) and "data_url" in item:
            raise SessionRefused(
                422,
                f"File {index + 1} carries its bytes: a file is uploaded first "
                "(POST /api/v1/apps/agents/{agent}/files), and a run names its ref.",
            )
        try:
            ref = FileRef.model_validate(item)
        except ValueError:
            raise SessionRefused(
                422,
                f"File {index + 1} is not a file's ref ({{ref, name, media_type}}).",
            ) from None
        try:
            stored = UI_FILES.resolve(scope, ref, owner)
        except UiFileError as refused:
            raise SessionRefused(refused.status_code, str(refused)) from None
        files.append(
            UploadedFile(_file_name(stored.name), stored.media_type, stored.content)
        )
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
            "schema": dict(question.schema),
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
        labels = ", ".join(
            field_title(question.schema, name) for name in form_fields(question.schema)
        )
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

#: The applications whose code this process was given to run, beside the
#: catalogue's (P-25), by id and version.
_SERVED: Dict[Tuple[str, str], Any] = {}

#: The code a deployment's agent on this runtime was given to run, by the
#: agent's id (R-14): the ``app.py`` of the version it runs, carried by
#: the deployment and accepted by the create route in its principal's name.
_AGENT_CODE: Dict[str, Any] = {}


def serve_code(application: Any) -> None:
    """Run an application's code on this runtime: its sessions, at its id and
    version, are reacted to by it (P-25, ``app.mount``).
    """
    spec = application.spec
    _SERVED[(spec.id, spec.version)] = application


def serve_agent_code(agent_id: str, application: Any) -> None:
    """Run an application's code for the sessions of one agent of this
    runtime (R-14): the deployment's ``app.py``, as the create route
    accepted it; ``None`` forgets it (the agent deleted).
    """
    if application is None:
        _AGENT_CODE.pop(agent_id, None)
    else:
        _AGENT_CODE[agent_id] = application


def agent_code_toolset(agent_id: str) -> Any:
    """The tools the code an agent was given defines (`serve_agent_code`), as one
    toolset, for its runs outside a session — a company's or a business's turn
    over A2A, which its agent answers alone; a session adds them itself
    (`AppHost`). ``None`` when it was given no code, or code with no tools.

    Found on r1, 13 October 2026: *Exchange Desk*'s ``exchange_order`` was never
    offered to a personal agent's turn, so nothing could be proposed.
    """
    application = _AGENT_CODE.get(agent_id)
    if application is None:
        return None
    from agent_runtimes.apps.own import own_toolset

    return own_toolset(application.spec, dict(application.tools))


def code_of(app: AppSpec, agent_id: str = "") -> Any:
    """The `Application` an application's code defines, when it is written in Python.

    The code its agent was given (`serve_agent_code`), else one this process
    was given to run (`serve_code`), else an example of the catalogue built
    from its ``app.py`` (`APP_BUILT`), at the version the runtime runs;
    ``None`` for a spec, which its agent answers.
    """
    from agent_runtimes.specs.apps import APP_BUILT

    given = _AGENT_CODE.get(agent_id) if agent_id else None
    if given is not None:
        return given
    served = _SERVED.get((app.id, app.version))
    if served is not None:
        return served
    if APP_BUILT.get(app.id) != "python":
        return None
    key = (app.id, app.version)
    if key not in _CODE:
        import agentspecs.apps

        from agent_runtimes.apps.application import load_application

        path = Path(agentspecs.apps.__file__).parent / app.id / "app.py"
        application = load_application(path)
        _CODE[key] = application if application.spec.version == app.version else None
    return _CODE[key]


#: The display a session offers its code's actions on (RU-5): the
#: application itself, its actions declared in its Appspec — what a page's
#: block or a client of the session API presses with their tokens, as a
#: button of a display its code showed presses what that display offered.
APP_DISPLAY = "app"


#: The longest input or output of a step the chat is sent, in characters.
STEP_VALUE_LIMIT = 4000


def _step_value(value: Any) -> Any:
    """A step's input or output as JSON carries it: as it is, or in words."""
    if value is None:
        return None
    try:
        said = json.dumps(value)
    except (TypeError, ValueError):
        return str(value)[:STEP_VALUE_LIMIT]
    return value if len(said) <= STEP_VALUE_LIMIT else said[:STEP_VALUE_LIMIT]


#: The display type of a step of an application's code (P-16,
#: RU-3).
STEP_DISPLAY_TYPE = "application/vnd.datalayer.loop.step+json"


@display_type(STEP_DISPLAY_TYPE, version=1)
class StepShown(Display):
    """A step of an application's code, as the page draws it: shown as it
    starts and again as it ends (a ``show`` of the same id), its output
    patched in as it streams (P-31). Its id is the step's.
    """

    name: str
    kind: str
    """`run`, `tool`, `model` or `retrieval`."""
    parent_id: Optional[str] = None
    """The step it is nested in."""
    input: Any = None
    output: Any = None
    error: str = ""
    started_at: str
    ended_at: Optional[str] = None

    def text(self) -> str:
        if self.error:
            return f"{self.kind} step {self.name} failed: {self.error}"
        return f"{self.kind} step {self.name}" + (
            " ended" if self.ended_at else " running"
        )

    @classmethod
    def of(cls, step: Step) -> "StepShown":
        """A step, already shown (`shown_step`), as its display."""
        return cls(
            id=step.id,
            name=step.name,
            kind=step.kind,
            parent_id=step.parent_id,
            input=_step_value(step.input),
            output=_step_value(step.output),
            error=step.error,
            started_at=step.started_at.isoformat(),
            ended_at=step.ended_at.isoformat() if step.ended_at else None,
        )


#: The display type of what an application's code asks (RU-4).
QUESTION_DISPLAY_TYPE = "application/vnd.datalayer.loop.question+json"


@display_type(QUESTION_DISPLAY_TYPE, version=1)
class QuestionShown(Display):
    """What the code asks, under the message that asks it in words: shown by
    an ``ask`` op, offering ``reactor.answer`` — the choice as buttons, the
    words as a field, a form as its fields, a file as the ref its upload
    answered (RU-6). Answered, it says what answered it and offers
    nothing.
    """

    message_id: str
    kind: str
    """``text``, ``choice``, ``file`` or ``form``."""
    prompt: str
    options: List[str] = []
    accept: List[str] = []
    max_bytes: Optional[int] = None
    form: Dict[str, Any] = {}
    """A form's JSON Schema, for a form."""
    answered: Optional[str] = None
    """What answered it, in words; none while it waits."""

    def text(self) -> str:
        return self.prompt + (f" — {self.answered}" if self.answered else "")

    @classmethod
    def of(
        cls, display_id: str, message_id: str, question: Question
    ) -> "QuestionShown":
        asked = question_of(question)
        return cls(
            id=display_id,
            message_id=message_id,
            kind=asked["kind"],
            prompt=asked["prompt"],
            options=list(asked.get("options") or []),
            accept=list(asked.get("accept") or []),
            max_bytes=asked.get("max_bytes"),
            form=dict(asked.get("schema") or {}),
        )


def answer_in_words(question: Question, answer: Any) -> str:
    """What answered a question, as the person reads it."""
    if isinstance(question, FormQuestion) and isinstance(answer, Mapping):
        return ", ".join(
            f"{field_title(question.schema, key)}: {value}"
            for key, value in answer.items()
        )
    if isinstance(answer, UploadedFile):
        return answer.name
    return str(answer)


#: The window op that hands the page a message of the code's (P-25):
#: ``{data}``, what ``session.send_window_message(data)`` said.
WINDOW_MESSAGE = "message"


def _shows_id(message_id: str) -> str:
    """The display of what a message shows (RU-2)."""
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
    modes: Dict[str, str] = field(default_factory=dict)
    """The option of each of its modes the person is in (P-19), as the last run said."""
    profile: str = ""
    """The profile the conversation is with (P-20); ``""`` until one is said, then kept."""
    user: Optional[HostUser] = None
    """Embedded, the user the host's server signed (D-21): who `host_context` says, and its code's user."""
    state: str = "open"
    """One of `STATES`: open, paused or ended."""
    turn: str = "idle"
    """One of `TURNS`: what the runtime does in an open session — idle, running, waiting for an answer."""
    title: str = ""
    """The person's title, else the first turn's first line (MH-43); ``""`` until one is."""
    archived: bool = False
    lineage: Dict[str, Any] = field(
        default_factory=lambda: {"forked_from": None, "imported_from": None}
    )
    """`forked_from: {uid, at_turn}` and `imported_from: {digest, exported_at, exported_by}`, each or None."""
    runs_on: Dict[str, Any] = field(default_factory=dict)
    """Where it runs: `{kind: runtime, uid}` here; a team seat's says `{kind: team_run, execution_id, seat}`."""
    bound_agent: str = ""
    """The agentspec a swap bound (MH-06); ``""`` until one, then the record's `agent`."""
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
    _ui_actions: Optional[ActionRegistry] = field(default=None, init=False, repr=False)
    _presses: Dict[str, UiAction] = field(default_factory=dict, init=False, repr=False)
    _asked: Optional[QuestionShown] = field(default=None, init=False, repr=False)
    """The question waiting, as the page was shown it (RU-4)."""
    """Presses checked on the ui socket, waiting for the run that runs them (RU-W)."""
    _sent_settings: Dict[str, Any] = field(default_factory=dict, init=False, repr=False)
    _streamed: Dict[str, List[str]] = field(
        default_factory=dict, init=False, repr=False
    )
    _elements: Dict[str, Shown] = field(default_factory=dict, init=False, repr=False)
    """The elements open in a side panel or on a page (P-18): drawn again on a resume."""
    _steps: Dict[str, Step] = field(default_factory=dict, init=False, repr=False)
    """The steps running, by id, with what they streamed so far (P-31)."""
    _said: Optional[Dict[str, str]] = field(default=None, init=False, repr=False)
    """What its code said in a turn recorded as a run of its own (R-14), by message id."""

    # --- what the session is -----------------------------------------------------

    @property
    def deployment_uid(self) -> str:
        """The deployment it runs as, or ``""`` for a Preview."""
        return str(self.instance.get("deployment_uid") or "")

    @property
    def user_id(self) -> Optional[str]:
        """Who its code's ``session.opened_by`` is: the user the host signed, else who opened it."""
        if self.user is not None:
            return self.user.sub
        return self.opened_by.uid or None

    @property
    def written_in_python(self) -> bool:
        """Whether its application's code reacts to it."""
        return self.host is not None

    @property
    def harness(self) -> Optional[str]:
        """The harness its agent runs on, when it is one; ``None`` otherwise."""
        shield = self._shield()
        return str(shield.harness.id) if shield is not None else None

    @property
    def agent_spec(self) -> str:
        """The agentspec bound to its agent now: what the record's ``agent`` names."""
        if self.bound_agent:
            return self.bound_agent
        from agent_runtimes.routes.agents import get_stored_agent_spec

        stored = get_stored_agent_spec(self.agent_id) or {}
        return str(stored.get("agent_spec_id") or self.agent_id)

    def allow_always_count(self) -> int:
        """How many *always* answers the harness keeps for this session: the
        Shield's own session rules, which go with its process on a swap.
        """
        shield = self._shield()
        if shield is None:
            return 0
        acp = shield._acp_of.get(self.uid)
        state = shield.sessions.get(acp) if acp else None
        return len(getattr(state, "session_rules", []) or []) if state else 0

    def swap_target(self, agent: str) -> Dict[str, Any]:
        """What a swap to ``agent`` would bind (MH-06): the agentspec, its
        name, its harness and the harness's capabilities table — a framework
        agent's is empty; refused while a turn runs or the harness is still
        loading its session (409), for an agentspec the runtime does not
        know (404), for the agent already bound (409), and when the settings
        do not fit the target application's inputs (422).
        """
        from agent_runtimes.specs.agents.agents import get_agent_spec
        from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

        if self.state != "open":
            raise SessionRefused(
                409,
                f"Session {self.uid} is {self.state}: "
                + (
                    "resume it, then swap."
                    if self.state == "paused"
                    else "an ended session is cloned, not swapped."
                ),
            )
        if self.turn in ("running", "waiting"):
            turns = sum(1 for m in self.messages if m.get("role") == "user")
            raise SessionRefused(
                409,
                f"Session {self.uid} is answering turn {turns}: swap it when the turn is over, or interrupt it first."
                if self.turn == "running"
                else f"Session {self.uid} is waiting for an answer to turn {turns}: answer it, or stop the session, then swap.",
            )
        shield = self._shield()
        if shield is not None and self.uid in getattr(shield, "loading", set()):
            raise SessionRefused(
                409,
                f"Session {self.uid}: {shield.harness.name} is still loading its session; swap it once it is loaded.",
            )
        spec = get_agent_spec(agent)
        if spec is None:
            raise SessionRefused(
                404, f"There is no agentspec {agent!r} on this runtime to swap to."
            )
        if spec.id == self.agent_spec:
            raise SessionRefused(409, f"Session {self.uid} is with {spec.id} already.")
        harness_id = str(getattr(spec, "harness", "") or "")
        harness = HARNESS_CATALOGUE.get(harness_id)
        try:
            form_values(self.app.interface.settings, dict(self.settings))
        except InvalidAnswer as wrong:
            raise SessionRefused(
                422,
                f"The settings of {self.uid} do not fit {spec.name}: {wrong} — change the settings, then swap.",
            ) from None
        return {
            "agent": spec.id,
            "name": harness.name if harness is not None else str(spec.name or spec.id),
            "harness": harness.id if harness is not None else None,
            "capabilities": harness.capabilities.model_dump(mode="json")
            if harness is not None
            else {},
            "model": str(getattr(spec, "model", "") or ""),
        }

    def swapped_to(self, target: Mapping[str, Any], carried: Any) -> Dict[str, Any]:
        """After the rebind (MH-06): the new agent is the session's, the
        sentence is appended to the conversation — the new agent reads it
        with its first turn — and the swap is answered.
        """
        self.bound_agent = str(target["agent"])
        if carried.said:
            self.messages.append(
                {
                    "id": _new_id(),
                    "role": "assistant",
                    "content": carried.said,
                    "name": self.app.name,
                    "agent": self.bound_agent,
                }
            )
        return {
            "uid": self.uid,
            "agent": self.bound_agent,
            "harness": target.get("harness"),
            "state": self.state,
            "said": carried.said,
            "carried": dict(carried.carried),
            "dropped": dict(carried.dropped),
        }

    @property
    def agent_name(self) -> str:
        """What its agent is called, for a sentence: the harness's name, else the agentspec's."""
        shield = self._shield()
        if shield is not None:
            return str(shield.harness.name)
        from agent_runtimes.routes.agents import get_stored_agent_spec

        stored = get_stored_agent_spec(self.agent_id) or {}
        return str(stored.get("name") or self.agent_spec)

    @property
    def capabilities(self) -> Dict[str, Any]:
        """Say its harness's capabilities table (MH-20), or ``{}`` for a framework agent."""
        shield = self._shield()
        if shield is None:
            return {}
        return shield.harness.capabilities.model_dump(mode="json")

    def facts(self) -> Dict[str, Any]:
        """The session's shape as its record says it (MH-01, §2)."""
        return {
            "agent": self.agent_spec,
            "harness": self.harness,
            "runs_on": dict(self.runs_on),
            "title": self.title,
            "archived": self.archived,
            "lineage": dict(self.lineage),
        }

    # --- the rules while running (SH-54) --------------------------------

    def _shield(self) -> Any:
        """The harness this session's agent runs on, when it is one (an ``ACPAgent``)."""
        from agent_runtimes.adapters.acp_agent import ACPAgent
        from agent_runtimes.routes.agents import _agents

        held = _agents.get(self.agent_id)
        agent = held[0] if held else None
        return agent if isinstance(agent, ACPAgent) else None

    def rules_in_force(self) -> Dict[str, Any]:
        """What decides this session now: the policies strictest first, and the person's own rules.

        A harness session answers from the Shield's own state (its documents
        from IAM, the application's, the session's with every rule a person
        added); any other session answers the policies the runtime holds and
        the rules of this session.
        """
        from agent_runtimes.guardrails.managed_policies import runtime_policies
        from agent_runtimes.guardrails.session_rules import session_rules
        from agent_runtimes.guardrails.shield_policy import policies_in_force

        shield = self._shield()
        if shield is not None:
            answered = shield.rules_in_force_of(self.uid)
            if answered is not None:
                return {
                    "uid": self.uid,
                    "harness": shield.harness.id,
                    "managed": runtime_policies().is_managed,
                    **answered,
                }
        from agent_runtimes.guardrails.shield_policy import deployment_spend_limit
        from agent_runtimes.models.models import app_instance_of

        try:
            policies = policies_in_force(
                self.app,
                spend_limit=deployment_spend_limit(app_instance_of(self.agent_id)),
            )
            unavailable = None
        except Exception as refused:  # noqa: BLE001 - said, not hidden: nothing is decided
            policies, unavailable = [], str(refused)
        return {
            "uid": self.uid,
            "harness": None,
            "managed": runtime_policies().is_managed,
            "policies": [
                json.loads(policy.model_dump_json(exclude_none=True))
                for policy in policies
            ],
            "session_rules": session_rules().as_values(self.uid),
            "unavailable": unavailable,
        }

    def add_rule(self, data: Any) -> Dict[str, Any]:
        """A rule the person adds or tightens on this session: in force at once, gone with it."""
        from agent_runtimes.guardrails.session_rules import (
            SessionRuleRefused,
            rule_from,
            session_rules,
        )
        from agent_runtimes.guardrails.shield_policy import rules_policy

        try:
            rule = rule_from(data)
            session_rules().add(self.uid, rule, application=rules_policy(self.app))
        except SessionRuleRefused as refused:
            raise SessionRefused(422, str(refused)) from None
        except Exception as refused:  # noqa: BLE001 - IAM unreadable: nothing is tightened under nothing
            raise SessionRefused(503, str(refused)) from None
        # In the record too (MH-03): a resume from it has the rule again.
        self.recorder.start(self.uid, facts=self.facts())
        self.recorder.ruled(
            self.uid, rule=json.loads(rule.model_dump_json(exclude_none=True))
        )
        return self.rules_in_force()

    def remove_rule(self, name: str) -> Dict[str, Any]:
        """Take a session rule back."""
        from agent_runtimes.guardrails.session_rules import (
            SessionRuleRefused,
            session_rules,
        )

        try:
            session_rules().remove(self.uid, name)
        except SessionRuleRefused as refused:
            raise SessionRefused(404, str(refused)) from None
        self.recorder.start(self.uid, facts=self.facts())
        self.recorder.ruled(self.uid, removed=name)
        return self.rules_in_force()

    def _title_from_turn(self, text: str) -> None:
        """The first turn's first line as the title, until the person gives one (MH-43)."""
        if self.title or any(m.get("role") == "user" for m in self.messages):
            return
        title = first_line_title(text)
        if not title:
            return
        self.title = title
        self.recorder.start(self.uid, facts=self.facts())
        self.recorder.titled(self.uid, title=self.title, archived=self.archived)

    def retitle(self, title: str) -> Dict[str, Any]:
        """The person's title (MH-43): at most 200 characters, in the record."""
        title = str(title or "").strip()
        if len(title) > TITLE_LIMIT:
            raise SessionRefused(
                422,
                f"A session's title is at most {TITLE_LIMIT} characters; this one has {len(title)}.",
            )
        self.title = title
        self.recorder.start(self.uid, facts=self.facts())
        self.recorder.titled(self.uid, title=self.title, archived=self.archived)
        return self.describe()

    def set_archived(self, archived: bool) -> Dict[str, Any]:
        """Hide the session from the list, or bring it back (MH-43)."""
        self.archived = bool(archived)
        self.recorder.start(self.uid, facts=self.facts())
        self.recorder.titled(self.uid, title=self.title, archived=self.archived)
        return self.describe()

    def describe(self) -> Dict[str, Any]:
        """The session as the API says it."""
        return {
            "uid": self.uid,
            "agent": self.agent_spec,
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
            "user": self.user.as_value() if self.user is not None else None,
            "state": self.state,
            "turn": self.turn,
            "held": True,
            "harness": self.harness,
            "title": self.title,
            "archived": self.archived,
            "lineage": dict(self.lineage),
            "runs_on": dict(self.runs_on),
            "settings": dict(self.settings),
            "profile": self.profile or None,
            "asking": question_of(self._question) if self._question else None,
            # What its code does, offered with this session's tokens (RU-5).
            "actions": self.offered(),
            "files": [dict(item) for item in self.files],
            "python": self.written_in_python,
            "turns": sum(1 for m in self.messages if m.get("role") == "user"),
            "started_at": self.started_at,
            "resumed": self.resumed,
        }

    def thread(self) -> List[Dict[str, Any]]:
        """The conversation as AG-UI messages, as a snapshot says it: what a
        page reloaded draws again (D-13).
        """
        return [
            message.model_dump(mode="json", by_alias=True, exclude_none=True)
            for message in _snapshot(self.messages)
        ]

    def answers_to(self, caller: Caller) -> bool:
        """Whether a caller may drive this session: who opened it, or the machine itself.

        A session a host opened (Slack, Discord) is its linked person's: they
        open it on the web, signed in as themselves, from the host's *Open in
        Datalayer* (S-305) — never another person, nor another host's
        installation.
        """
        if caller.kind == "local":
            return True
        if self.opened_by.kind == "host" and caller.kind == "person":
            return bool(caller.uid) and caller.uid == self.opened_by.uid
        # An embed's visitors are one owner's token each: told apart by the
        # visit their token was issued for (R-20).
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

    def _may_go_on(self) -> None:
        """Refuse a turn of a session that is paused or ended, or whose turn runs."""
        if self.state == "paused":
            raise SessionRefused(
                409, f"Session {self.uid} is paused: resume it before going on."
            )
        if self.state == "ended":
            raise SessionRefused(
                409,
                f"Session {self.uid} ended; an ended session is not resumed — clone it to go on from it.",
            )
        if self.turn in ("running", "waiting"):
            raise SessionRefused(
                409,
                f"Session {self.uid} is "
                + ("answering" if self.turn == "running" else "waiting for an answer")
                + ": wait, or stop it.",
            )

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
        is one of a visitor's turns (R-30) — opening with nothing to
        say is not.
        """
        from ag_ui.core import RunErrorEvent, RunFinishedEvent, RunStartedEvent

        self._may_go_on()
        visitor = self.opened_by.kind == "visitor"
        if visitor and counts:
            from agent_runtimes.apps.visitors import admit_turn

            refusal = admit_turn(self.opened_by.uid, self.started_at)
            if refusal:
                raise SessionRefused(429, refusal)
        queue = self._open_stream(run_id)
        self.turn = "running"
        # The caller's token, set by the route: what they allow is read with it.
        token = get_request_user_jwt() or ""

        async def runner() -> None:
            """The turn, framed, its failure said on the stream."""
            from agent_runtimes.apps.memory import remember_for
            from agent_runtimes.apps.visitors import (
                enter_visitor_run,
                use_turn_token,
            )

            # It remembers for whoever opened the session, each person apart,
            # a visitor not signed in nothing (R-18, R-36).
            remember_for(self.opened_by, token)
            # A visitor's turn calls its models with their own token, and
            # reads only (R-30); anybody else's with what it always did.
            use_turn_token(token if visitor else "")
            # An embed's visitor is nobody the platform knows: their turn
            # only reads, and asks nobody, as a visitor's (R-20).
            if self.opened_by.kind == "embed":
                enter_visitor_run(f"embed:{self.opened_by.visit}")
            cancelled = False
            try:
                if wraps_run:
                    self.emit(RunStartedEvent(thread_id=self.uid, run_id=self._run_id))
                await work()
                if wraps_run:
                    self.emit(RunFinishedEvent(thread_id=self.uid, run_id=self._run_id))
            except asyncio.CancelledError:
                cancelled = True
                raise
            except (SessionRefused, InvalidAnswer) as refused:
                self.emit(RunErrorEvent(message=redact(str(refused))))
            except Exception as error:  # noqa: BLE001 - said on the stream
                # Said, and logged, with any credential in it withheld (R-19).
                logger.error(
                    "A turn of session %s failed: %s",
                    self.uid,
                    redact("".join(traceback.format_exception(error))),
                )
                self.emit(
                    RunErrorEvent(message=f"The turn failed: {redact(str(error))}")
                )
            finally:
                self._question = None
                self._answer = None
                self._asked = None
                self.turn = "idle"
                if not cancelled:
                    # The stream ends once the turn is on the record: a
                    # scheduler stopping the runtime as it ends loses
                    # nothing (R-14).
                    await self.recorder.settled(self.uid)
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
            # draws in place of what it said (P-15).
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
                # What it shows: a display under the message, its buttons
                # offered with the tokens this session minted (P-04,
                # RU-2).
                shown = self._answer_shows(
                    _shows_id(event.id),
                    event.id,
                    event.author,
                    event.components,
                    event.data,
                )
                self.show_op(ShowOp(scope=self.uid, id=shown.id, body=shown))
                kept["shows"] = shown.model_dump(mode="json")
                # And on the run's record, as the answer is (P-04).
                self.recorder.start(self.uid)
                self.recorder.shown(
                    event.id, event.author, event.components, event.data
                )
            if event.author != self.app.name:
                kept["name"] = event.author
                # Who said it, a fact about the message (P-15).
                self.show_op(
                    MetaOp(scope=self.uid, id=event.id, body={"author": event.author})
                )
            if self._said is not None:
                self._said[event.id] = event.text
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
            # The message goes, and what it showed with it (P-15).
            self.show_op(RemoveOp(scope=self.uid, id=event.message_id))
        elif isinstance(event, StepDelta):
            # A step's output as it comes (P-31): its output so far
            # patched in — any credential in it withheld (R-19) — which the
            # chat draws in place.
            running = self._steps.get(event.step_id)
            if running is None:
                raise ValueError(f"Step {event.step_id} is not running.")
            running = replace(running, output=(running.output or "") + event.text)
            self._steps[event.step_id] = running
            output = StepShown.of(shown_step(running)).output
            self.show_op(
                PatchOp(
                    scope=self.uid,
                    id=event.step_id,
                    body=[{"op": "replace", "path": "/data/output", "value": output}],
                )
            )
        elif isinstance(event, Step):
            if event.ended_at is None:
                self._steps[event.id] = event
                self.emit(StepStartedEvent(step_name=event.name))
            else:
                self._steps.pop(event.id, None)
                self.emit(StepFinishedEvent(step_name=event.name))
            # AG-UI's step is its name: what the chat shows of it — its
            # kind, the step it is nested in, its input, output or error —
            # is its display beside it (P-16, RU-3).
            shown = StepShown.of(event).wire()
            self.show_op(ShowOp(scope=self.uid, id=shown.id, body=shown))
        elif isinstance(event, Shown):
            # A side panel or a page of its own, opened or changed (P-18).
            self._elements[event.id] = event
            self.show_op(self._element_op(event))
        elif isinstance(event, WindowMessage):
            # For the page the application sits in, not the conversation (P-25).
            self.show_op(
                WindowOp(
                    scope=self.uid,
                    body=WindowBody(name=WINDOW_MESSAGE, args={"data": event.data}),
                )
            )
        elif isinstance(event, Said):
            # A line said aloud (VO-46): the page says and captions
            # it as it does an agent's `voice.say` (VO-35).
            self.emit(
                CustomEvent(
                    name=VOICE_SAY_EVENT,
                    value={
                        "text": event.text,
                        "voice": event.voice,
                        "language": event.language,
                    },
                )
            )
        elif isinstance(event, Interrupted):
            # The person spoke over the agent: a client playing its voice stops it.
            self.emit(CustomEvent(name=VOICE_INTERRUPTED_EVENT, value={}))
        elif isinstance(event, PageShown):
            # A widget's page, shown in place for its inputs (P-05).
            self.emit(
                CustomEvent(
                    name=LOOP_PAGE,
                    value={"inputs": event.inputs, "outputs": event.outputs},
                )
            )
        elif isinstance(event, Closed):
            self._elements.pop(event.element_id, None)
            self.show_op(RemoveOp(scope=self.uid, id=event.element_id))

    def show_op(self, op: UiOp) -> None:
        """Say a ``reactor.ui`` op to the page: on the session's ui socket,
        numbered and kept for a resume (RU-W). The run stream
        carries the conversation's text only.
        """
        UI_HUB.emit(op)

    # --- what its answers offer (RU-2) -----------------------------------

    def _actions(self) -> ActionRegistry:
        """The actions of its code, each pressable only where a display offered it.

        Minted with a secret of this session's: a token says this session,
        this display and this action, and nothing else.
        """
        if self._ui_actions is None:
            if self.host is None:
                raise RuntimeError(
                    f"{self.app.name} has no code here: nothing offers an action."
                )
            registry = ActionRegistry(secrets.token_bytes(32))
            # Each typed by the model its code declares (RU-5).
            for name, model in self.host.app.action_payloads.items():
                registry.register(name, model, self._run_pressed, plugin=self.app.id)
            # What answers what its code asks (RU-4): taken by the
            # run that names the press, never dispatched.
            registry.register(
                ANSWER_ACTION, Answer, self._never_dispatched, plugin=self.app.id
            )
            self._ui_actions = registry
        return self._ui_actions

    async def _never_dispatched(self, payload: Answer, context: Any) -> None:
        """An answer is the waiting question's, taken by `_answered`."""
        raise RuntimeError("An answer is taken by the run that names it.")

    async def _run_pressed(self, payload: BaseModel, context: Any) -> None:
        """A press the registry let through, its payload its model: the code's
        `@app.action`.
        """
        assert self.session is not None
        await self.host.press(self.session, context.action, payload)

    def offered(self) -> List[Dict[str, Any]]:
        """What the session offers of its code's actions (RU-5): each
        action its Appspec declares, on the application's own display, with
        the token this session minted — what a page's block or a client of
        the session API presses. None for an application without code.
        """
        if self.host is None:
            return []
        registry = self._actions()
        return [
            {
                "display_id": APP_DISPLAY,
                **registry.offer(self.uid, APP_DISPLAY, name).model_dump(
                    exclude_none=True
                ),
            }
            for name in self.host.app.actions
        ]

    def check_press(self, press: UiAction) -> UiAction:
        """A press checked before anything runs (RU-2, RU-5): offered
        to this session on that display (403), an action its code declares
        (422), with what it takes (422, each field and why). An answer is
        checked against its question when the run takes it.
        """
        from agent_runtimes.apps.application import action_payload

        if self.host is None:
            raise UnknownUiAction(
                f"{self.app.name} has no code here: it offers nothing to press."
            )
        registry = self._actions()
        registry.authorize(self.opened_by, self.uid, press)
        if press.action != ANSWER_ACTION:
            try:
                action_payload(
                    press.action,
                    self.host.app.action_payloads[press.action],
                    press.payload,
                )
            except ValueError as wrong:
                raise UiActionPayloadInvalid(str(wrong)) from None
        return press

    def _answer_shows(
        self,
        display_id: str,
        message_id: str,
        title: str,
        nodes: Any,
        data: Optional[Mapping[str, Any]],
        where: str = "inline",
    ) -> Any:
        """What an answer or an element shows, as its display, its buttons offered.

        A button pressing an action its code has none of is refused here, as
        the answer is sent: never a button that does nothing, or a message.
        """
        shown = AnswerShows.of(display_id, message_id, title, nodes, data, where)
        names = answer_actions(nodes)
        if names:
            registry = self._actions()
            missing = [name for name in names if name not in registry.names()]
            if missing:
                raise ValueError(
                    f"{self.app.name} shows a button for {', '.join(missing)}, "
                    "which it has no @app.action for."
                )
            shown.actions = [
                registry.offer(self.uid, display_id, name) for name in names
            ]
        return shown.wire()

    def _element_op(self, shown: Shown) -> ShowOp:
        """An element opened or changed: its display, where it shows said in it."""
        display = self._answer_shows(
            shown.id, shown.id, shown.title, shown.components, shown.data, shown.where
        )
        return ShowOp(scope=self.uid, id=display.id, body=display)

    def press_up(self, caller: Caller, press: UiAction) -> Dict[str, str]:
        """A press of something a display offered, come up the ui socket
        (RU-W): checked — offered to this session, on that display
        (403 not offered, 422 unknown) — and kept for the run that runs it,
        which names it (``forwardedProps.loop.press``). Nothing runs here.
        """
        if not self.answers_to(caller):
            raise UiActionRefused(f"Session {self.uid} is not yours to press in.")
        self.check_press(press)
        key = press.idempotency_id or secrets.token_urlsafe(12)
        if key not in self._presses and len(self._presses) >= MAX_PRESSES:
            raise UiActionBusy(
                f"{len(self._presses)} presses wait for their run: run one first."
            )
        self._presses[key] = press.model_copy(update={"idempotency_id": key})
        return {"press": key}

    def _take_press(self, key: Any) -> UiAction:
        """The press a run names, checked on the socket; once."""
        press = self._presses.pop(str(key), None) if isinstance(key, str) else None
        if press is None:
            raise SessionRefused(
                422,
                f"No press {key!r} waits here: press it again "
                "(a press goes up the ui socket first).",
            )
        return press

    async def ask(self, session_id: str, question: Question) -> Any:
        """What the code asks: a file already given answers a file; else the person is asked.

        The stream ends on the question, and the turn waits for the answer.
        """
        from ag_ui.core import RunFinishedEvent

        if isinstance(question, FileQuestion) and self._unasked:
            return self._unasked.pop(0)
        self._question = question
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._answer = future
        # Asked in words in the conversation, and as a display under those
        # words that answers it (RU-4): its choices as buttons, its
        # fields as a form, each press of it the answer.
        said = Message(_new_id(), self.uid, question_in_words(question), self.app.name)
        await self.deliver(said)
        asked = QuestionShown.of(f"{said.id}-ask", said.id, question)
        asked.actions = [self._actions().offer(self.uid, asked.id, ANSWER_ACTION)]
        self._asked = asked
        self.show_op(AskOp(scope=self.uid, id=asked.id, body=asked.wire()))
        # The run ends on the question, and says so in its result: what a
        # reader with no page — a schedule, a test — reads as waiting.
        self.emit(
            RunFinishedEvent(
                thread_id=self.uid,
                run_id=self._run_id,
                result={"asking": question_of(question)},
            )
        )
        self.turn = "waiting"
        # Its record says it waits: whoever opened it is told (M-023).
        self.recorder.start(self.uid)
        self.recorder.asked(self.uid, question_of(question).get("kind", ""))
        self._end_stream()
        return await future

    def _go_on(
        self, answer: Any, *, run_id: str = "", head: str = ""
    ) -> AsyncIterator[str]:
        """Answer the question waited on, and stream the rest of the turn."""
        from ag_ui.core import RunStartedEvent

        future = self._answer
        assert future is not None
        question = self._question
        asked = self._asked
        if asked is not None and question is not None:
            # Answered: it says by what, and offers nothing any more.
            self.show_op(
                PatchOp(
                    scope=self.uid,
                    id=asked.id,
                    body=[
                        {
                            "op": "replace",
                            "path": "/data/answered",
                            "value": answer_in_words(question, answer),
                        },
                        {"op": "replace", "path": "/actions", "value": []},
                    ],
                )
            )
        self._asked = None
        queue = self._open_stream(run_id)
        self.turn = "running"
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
        await run_hooks("open", self, {"agent": self.agent_spec, "woken_by": woken_by})
        self.recorder.start(self.uid, woken_by=woken_by, facts=self.facts())
        await self.recorder.flush(self.uid)
        if self.host is not None and self.session is None:
            self.session = await self.host.open(
                opened_by=self.user_id,
                settings=self.settings,
                uid=self.uid,
                modes=self.modes,
                profile=self.profile or None,
            )
            # Its code's session is with a profile from now on: the first,
            # when none was said (P-20).
            self.profile = self.session.profile or ""

    def open(
        self,
        *,
        opener: str = "",
        woken_by: Optional[Dict[str, Any]] = None,
        head: str = "",
        bearer: str = "",
    ) -> AsyncIterator[str]:
        """Start: the session's record begins, the code's ``start`` runs, then the opener.

        A session a schedule woke (R-14) runs, in the opener's place, the
        handler its code declared for that schedule, when it declared one: the
        trigger's prompt is what its agent is asked otherwise.
        """
        try:
            schedule = self._woken_schedule(woken_by)
        except SessionRefused:
            _SESSIONS.pop(self.uid, None)
            raise

        async def work() -> None:
            """The turn."""
            await self._open_code(woken_by)
            if schedule is not None:
                await self._scheduled_code(schedule, opener)
                return
            if not opener:
                return
            self._title_from_turn(opener)
            if self.host is not None:
                await self._message_code(opener)
                return
            words = self._settings_in_words()
            said = f"{opener}\n\n{words}" if words else opener
            await self._run_agent(self._with_turn(said), bearer=bearer)

        return self._start_turn(
            work, wraps_run=self.host is not None, head=head, counts=bool(opener)
        )

    async def _scheduled_code(self, name: str, opener: str) -> None:
        """Run the handler its code declared for a schedule, recorded as a run.

        No agent's run frames it, so nothing else records it (R-14): it
        is kept as the agent's runs are, and as a framework's turn is — the
        run begun, the turn (what woke it, what its code said), its output,
        or how it stopped — and its steps, as its code's steps always are.
        """
        assert self.host is not None and self.session is not None
        recorder = self.recorder
        recorder.start(self.uid)
        recorder.ran(self.uid)
        asked = opener.strip() or f"Woken by its schedule {name}."
        self._said = {}
        try:
            await self.host.tick(name, session=self.session)
        except BaseException as error:
            said = str(error) or type(error).__name__
            recorder.start(self.uid)
            recorder.ended(
                "stopped",
                f"Stopped: {said[:300]}",
                {"error": type(error).__name__, "schedule": name},
            )
            await recorder.flush(self.uid)
            raise
        finally:
            said_by_code = self._said or {}
            self._said = None
        answer = "\n\n".join(text for text in said_by_code.values() if text)
        recorder.start(self.uid)
        if recorder.kept("turn"):
            recorder.turned(asked, answer)
        recorder.ended(
            "answered", answer[:300], {"length": len(answer), "schedule": name}
        )
        await recorder.flush(self.uid)

    def _woken_schedule(self, woken_by: Optional[Mapping[str, Any]]) -> Optional[str]:
        """The schedule of its code a tick woke it for, by the trigger's position
        among the application's triggers (R-14); ``None`` when no schedule
        woke it, it has no code, or its code declared no schedule there.

        Refused when the tick names no position, or when the trigger the
        running Appspec has there is not the schedule the code declared:
        its code and its Appspec are of different versions.
        """
        if self.host is None or not woken_by or woken_by.get("kind") != "schedule":
            return None
        position = woken_by.get("position")
        if not isinstance(position, int) or isinstance(position, bool):
            raise SessionRefused(
                422, "The schedule that woke the session names no trigger position."
            )
        name = self.host.app.schedule_at(position)
        if name is None:
            return None
        triggers = self.app.triggers
        trigger = triggers[position] if position < len(triggers) else None
        cron = self.host.app._schedule_crons.get(name, "")
        if trigger is None or trigger.type != "schedule" or trigger.cron != cron:
            raise SessionRefused(
                409,
                f"The trigger at {position} of {self.app.name} is not the schedule "
                f"{name} ({cron}) its code declares: its code and its Appspec differ.",
            )
        return name

    def _with_turn(
        self, text: str, parts: Sequence[Mapping[str, Any]] = ()
    ) -> List[Dict[str, Any]]:
        """The conversation with the person's next message — and the files a
        model is given whole with it (P-21).
        """
        content: Any = (
            [{"type": "text", "text": text}, *[dict(part) for part in parts]]
            if parts
            else text
        )
        self.messages.append(
            {
                "id": _new_id(),
                "role": "user",
                "content": content,
                # Which agent had the turn (MH-04): a swap back compares its own spans.
                "agent": self.agent_spec,
            }
        )
        return list(self.messages)

    async def _message_code(self, text: str) -> None:
        """A message, for the code: its ``message``, or its agent's answer."""
        if self.session is None:
            await self._open_code()
        assert self.session is not None
        self.messages.append({"id": _new_id(), "role": "user", "content": text})
        session = self.session
        spoken = heard_input()
        if spoken is not None and self.host.app.handler("audio") is not None:
            # Said on the page and heard there — in the browser or by
            # Datalayer's speech service — its code's ``@app.audio`` is given
            # what was heard; the sound stayed where it was heard (VO-46).
            speech = HeardSpeech(
                text=text,
                language=spoken.language,
                engine=spoken.engine,
                where=spoken.where,
            )
            await self._code_turn(text, lambda: self.host.heard(session, speech))
            return
        await self._code_turn(text, lambda: self.host.message(session, text))

    async def _code_turn(self, asked: str, work: Callable[[], Awaitable[Any]]) -> None:
        """Run what its code does with a person's message, kept as a turn
        (P-24): what they asked and what its code said.

        The agent its code runs keeps its own turn as its run ends (the
        record's capability), and then none is added here; a code that
        answers by itself — ``session.send`` with no model — is kept here,
        so that its threads count their turns and are found by the words
        asked.
        """
        recorder = self.recorder
        before = recorder.turns_of(self.uid)
        self._said = {}
        try:
            await work()
            said = self._said or {}
        finally:
            self._said = None
        # The agent's run keeps its turn in a task of its own once its stream
        # ends: waited for, so that the turn is not kept twice.
        await recorder.settled(self.uid)
        if recorder.turns_of(self.uid) != before:
            return
        recorder.start(self.uid)
        if recorder.kept("turn"):
            recorder.turned(asked, "\n\n".join(text for text in said.values() if text))

    async def _files_code(self, text: str, given: List[UploadedFile]) -> None:
        """Give the code files sent without being asked (P-21): its
        ``file``, given them and the words; without one, the words go to its
        ``message`` and the files wait for what it asks.
        """
        self._keep(given)
        if self.host.app.handler("file") is None:
            self._unasked.extend(given)
        if self.session is None:
            await self._open_code()
        assert self.session is not None
        names = ", ".join(file.name for file in given)
        said = text.strip()
        self.messages.append(
            {
                "id": _new_id(),
                "role": "user",
                "content": f"{said}\n\n(Sent {names}.)" if said else f"Sent {names}.",
            }
        )
        session = self.session
        await self._code_turn(
            f"{said}\n\n(Sent {names}.)" if said else f"Sent {names}.",
            lambda: self.host.files(session, given, said),
        )

    async def _press_code(self, press: UiAction, given: List[UploadedFile]) -> None:
        """A press of what was offered, for the code: its `@app.action`, run
        through the registry that offered it (RU-2, RU-5), which
        answers a retry of the same press once.

        The files given with it answer what the code asks for a file, now or
        later in the session.
        """
        self._keep(given)
        self._unasked.extend(given)
        if self.session is None:
            await self._open_code()
        await self._actions().dispatch(self.opened_by, self.uid, press)

    async def _page_code(self, inputs: Mapping[str, Any]) -> None:
        """Run its page on its inputs (P-05)."""
        if self.session is None:
            await self._open_code()
        assert self.session is not None
        await self.host.page(self.session, inputs)

    def _answered(
        self, press: UiAction, *, run_id: str = "", head: str = ""
    ) -> AsyncIterator[str]:
        """The question waiting, answered by a press of what it offered
        (``reactor.answer``, RU-4): checked against what was asked
        before the code goes on; the person's words are the conversation's.
        """
        question, asked = self._question, self._asked
        if self.turn != "waiting" or question is None or asked is None:
            raise SessionRefused(409, f"{self.app.name} asks nothing now.")
        if press.display_id != asked.id:
            raise SessionRefused(409, "That question is no longer asked.")
        given = Answer.model_validate(press.payload).value
        if isinstance(question, FileQuestion):
            # A file is answered by the ref its upload answered (RU-6): read back for whoever uploaded it, here.
            [given] = given_files(
                [given], scope=self.uid, owner=owner_of(self.opened_by)
            )
        try:
            value = _checked(question, given)
        except (InvalidAnswer, ValueError) as wrong:
            raise SessionRefused(422, str(wrong)) from None
        if isinstance(question, FileQuestion):
            self._keep([value])
        if isinstance(question, (TextQuestion, ChoiceQuestion)):
            self.messages.append({"id": _new_id(), "role": "user", "content": value})
        return self._go_on(value, run_id=run_id, head=head)

    def _answer_waiting(
        self,
        *,
        text: str = "",
        values: Optional[Mapping[str, Any]] = None,
        run_id: str = "",
        head: str = "",
    ) -> AsyncIterator[str]:
        """Answer what the code waits on with what came, or say what it waits for."""
        question = self._question
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
        if self.turn == "waiting":
            return self._answer_waiting(text=text, head=head)
        self._title_from_turn(text)
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

    def pressed(
        self,
        press: UiAction,
        *,
        files: Optional[List[UploadedFile]] = None,
        run_id: str = "",
        head: str = "",
    ) -> AsyncIterator[str]:
        """A press, checked (`check_press`), run as a turn: an answer to the
        question waiting (``reactor.answer``), else the `@app.action` it
        pressed with its typed payload (RU-5). Nothing pressed is
        ever said to the model.

        Files given with it are the session's: they answer what the code asks
        for a file.
        """
        if press.action == ANSWER_ACTION:
            return self._answered(press, run_id=run_id, head=head)
        if self.turn == "waiting":
            raise SessionRefused(409, self._waiting_for())
        given = list(files or [])
        refused = given_refused(self.app, given)
        if refused:
            raise SessionRefused(422, refused)
        return self._start_turn(
            lambda: self._press_code(press, given),
            run_id=run_id,
            wraps_run=True,
            head=head,
        )

    def run_page(
        self, inputs: Mapping[str, Any], *, head: str = ""
    ) -> AsyncIterator[str]:
        """Run its page on its inputs (P-05): checked against its form
        first — refused with the sentence — then its ``@app.page``, its
        outputs a ``loop.page`` event. Not a turn of the conversation.
        """
        if self.host is None or self.host.app.handler("page") is None:
            raise SessionRefused(
                422,
                f"{self.app.name} has no page of its code (@app.page) here: nothing runs it.",
            )
        if self.turn == "waiting":
            raise SessionRefused(409, self._waiting_for())
        try:
            page_values(self.app, inputs)
        except ValueError as wrong:
            raise SessionRefused(422, str(wrong)) from None
        return self._start_turn(
            lambda: self._page_code(inputs), wraps_run=True, head=head
        )

    def _keep(self, given: List[UploadedFile], path: str = "") -> None:
        """Say the files given among the session's, and on the record (MH-01):
        name, type, size, digest and place — never the bytes.
        """
        for file in given:
            digest = "sha256:" + hashlib.sha256(file.content).hexdigest()
            self.files.append(
                {
                    "name": file.name,
                    "type": file.media_type,
                    "size": len(file.content),
                    "path": path,
                    "digest": digest,
                }
            )
            self.recorder.start(self.uid, facts=self.facts())
            self.recorder.filed(
                self.uid,
                name=file.name,
                media_type=file.media_type,
                size=len(file.content),
                digest=digest,
                path=path,
            )

    def _files_for_agent(
        self, given: List[UploadedFile]
    ) -> Tuple[str, List[Mapping[str, Any]]]:
        """What the agent is told of the files given — where they are, or their
        text — and those its model is given whole.

        With a shell, every file is put in its sandbox. Without one, a text
        file goes in the message; an image, a recording or a PDF goes to the
        model as it is (P-21); anything else is refused.
        """
        shell = bool(self.app.permissions.computer.shell)
        words: List[str] = []
        whole: List[Mapping[str, Any]] = []
        for file in given:
            if shell:
                path = put_in_sandbox(self.agent_id, self.uid, file)
                words.append(placed_in_words(file, path))
                self._keep([file], path)
            elif not is_text(file) and seen_whole(file.media_type):
                whole.append(
                    media_part(
                        file.media_type,
                        base64.b64encode(file.content).decode("ascii"),
                    )
                )
                words.append(f"The file {file.name} ({file.media_type}) is attached.")
                self._keep([file])
            else:
                words.append(text_in_words(file))
                self._keep([file])
        return "\n\n".join(words), whole

    def _choose_profile(self, chosen: Any) -> None:
        """The profile a run names (P-20): taken when none was said yet,
        kept after — a conversation keeps the profile it started with.
        """
        if chosen is None or chosen == "":
            return
        if not isinstance(chosen, str):
            raise SessionRefused(422, "The profile sent is not a profile's id.")
        try:
            profile = profile_choice(self.app, chosen)
        except ValueError as wrong:
            raise SessionRefused(422, str(wrong)) from None
        assert profile is not None
        if self.profile and self.profile != profile.id:
            now = profile_choice(self.app, self.profile)
            raise SessionRefused(
                409,
                f"This conversation is with {now.label if now else self.profile}: "
                f"start another to talk to {profile.label}.",
            )
        self.profile = profile.id

    async def _settings_then(
        self, changed: Mapping[str, Any], work: Callable[[], Awaitable[None]]
    ) -> None:
        """The settings the page changed, told to its code first (``settings``,
        P-20), then the turn.
        """
        if changed:
            if self.session is None:
                await self._open_code()
            assert self.session is not None
            await self.host.settings(self.session, changed)
        await work()

    def change_settings(
        self, values: Mapping[str, Any], *, head: str = ""
    ) -> AsyncIterator[str]:
        """A settings change: checked against its form's schema, kept, its code's ``settings`` run.

        A form the code is waiting on — its fields are the settings — is answered by it.
        """
        try:
            updated = form_values(
                self.app.interface.settings, {**self.settings, **values}
            )
        except InvalidAnswer as wrong:
            raise SessionRefused(422, str(wrong)) from None
        if self.turn == "waiting":
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
        return "\n".join(
            f"{field_title(self.app.interface.settings, key)}: {value}"
            for key, value in self.settings.items()
            if str(value).strip()
        )

    def window_message(self, data: Any, *, head: str = "") -> AsyncIterator[str]:
        """A message from the page the application sits in (P-25): its
        code's ``window`` runs on it, as a turn, streamed — what it sends back
        with ``session.send_window_message`` a ``loop.window`` event.

        Refused for an application whose code reads none: a spec, or code
        without ``@app.window``.
        """
        if self.host is None or self.host.app.handler("window") is None:
            raise SessionRefused(
                422,
                f"{self.app.name} reads no window message: its code has no @app.window.",
            )
        try:
            json.dumps(data)
        except (TypeError, ValueError):
            raise SessionRefused(422, "A window message is what JSON writes.") from None

        async def work() -> None:
            """The turn."""
            if self.session is None:
                await self._open_code()
            assert self.session is not None
            await self.host.window(self.session, data)

        return self._start_turn(work, wraps_run=True, head=head)

    def audio(
        self,
        chunks: Any,
        *,
        content_type: str,
        language: str = "",
        bearer: str = "",
        head: str = "",
    ) -> AsyncIterator[str]:
        """The person spoke (VO-46): a turn's sound, in the chunks it came in,
        heard once it has all come, then the turn — its code's ``@app.audio`` with
        what was heard, or, without one, the words as the person's message,
        marked spoken. Heard on this machine when it can, else by Datalayer's
        speech service with the caller's token. What could not be heard is
        said in a sentence on the stream; nothing heard is kept.
        """
        from agent_runtimes.apps.speech import hear_speech
        from agent_runtimes.voice import hear
        from agent_runtimes.voice.protocol_audio import AudioNotHeard

        if self.turn == "waiting":
            raise SessionRefused(
                409,
                self._waiting_for() + " Answer it in words: it is not heard.",
            )

        async def work() -> None:
            """The turn: heard, then answered."""
            if self.host is not None:
                if self.session is None:
                    await self._open_code()
                assert self.session is not None
                session = self.session
                try:
                    await self.host.audio(
                        session,
                        chunks,
                        content_type=content_type,
                        language=language,
                        token=bearer or None,
                    )
                except AudioNotHeard as refused:
                    raise SessionRefused(422, str(refused)) from None
                return
            try:
                heard = await hear_speech(
                    chunks,
                    content_type=content_type,
                    language=language,
                    token=bearer or None,
                )
            except AudioNotHeard as refused:
                raise SessionRefused(422, str(refused)) from None
            # For the record, the turn was said (VO-27, VO-29).
            spoken = heard.spoken()
            hear(spoken)
            words = self._settings_in_words()
            said = f"{heard.text}\n\n{words}" if words else heard.text
            await self._run_agent(
                self._with_turn(said),
                bearer=bearer,
                forwarded={"voice": spoken.as_payload()},
            )

        return self._start_turn(work, wraps_run=self.host is not None, head=head)

    def keep_said_later(
        self, sound: bytes, content_type: str, seconds: float, language: str
    ) -> None:
        """Keep what the person said as sound (VO-63), beside the turn:
        ai-agents keeps it when the application's record keeps ``audio``;
        what refuses it is logged, and the turn goes on as words.
        """
        if self.opened_by.kind != "person":
            return

        async def keep() -> None:
            await self.recorder.keep_said(
                self.uid,
                sound,
                content_type=content_type,
                language=language,
                seconds=seconds,
            )

        task = asyncio.ensure_future(keep())
        _KEEPING.add(task)
        task.add_done_callback(_KEEPING.discard)

    async def interrupt(self) -> None:
        """The person spoke over the agent (VO-46, VO-13): the client reading
        the turn is told (``voice.interrupted``) before its stream ends, what
        runs is cancelled, and its code's ``@app.interrupted`` runs. The
        session stays open for what the person says next — unlike Stop,
        nothing waits to be resumed.
        """
        from ag_ui.core import CustomEvent

        if self.state == "paused":
            raise SessionRefused(
                409, f"Session {self.uid} is paused: resume it before going on."
            )
        self.emit(CustomEvent(name=VOICE_INTERRUPTED_EVENT, value={}))
        await self._close()
        self.turn = "idle"
        if self.host is not None and self.session is not None:
            # Nothing left to cancel; told to the code, and to the ui socket.
            await self.host.interrupt(self.session)

    async def stop(self) -> None:
        """Stop: what runs is cancelled, the code's ``stop`` runs, and the
        session is ``paused`` — in the record too (MH-01) — until resumed.
        A question waited on is cancelled, and said.
        """
        if self.state == "paused":
            raise SessionRefused(409, f"Session {self.uid} is paused already.")
        if self.state == "ended":
            raise SessionRefused(
                409, f"Session {self.uid} ended; an ended session is not stopped."
            )
        cancelled = {"turn": self.turn == "running", "question": self.turn == "waiting"}
        await self._close()
        self.state = "paused"
        self.turn = "idle"
        self.recorder.start(self.uid, facts=self.facts())
        self.recorder.paused(self.uid, cancelled=cancelled)
        if self.host is not None and self.session is not None:
            # Its own `stop` has nothing left to cancel: it runs, and what it
            # shows is kept in the conversation for whoever resumes it.
            await self.host.stop(self.session)

    async def end(self) -> None:
        """End: what runs is cancelled, the code's ``end`` runs, and the
        runtime no longer holds the session (P-14).

        Its record stays, with an ``ended`` entry: it is read, cloned and
        exported from it, never resumed (a clone is the way on).
        """
        if self.state == "ended":
            raise SessionRefused(
                409, f"Session {self.uid} ended already; there is nothing to end."
            )
        await run_hooks("end", self, {"by": "end"})
        await self._close()
        if self.host is not None and self.session is not None:
            # Nobody reads what it shows: the conversation is closed.
            await self.host.end(self.session)
        await self._ended(by="end")

    async def logout(self) -> None:
        """The person signed out: the code's ``logout`` runs, then the session ends (P-14)."""
        await self._close()
        if self.host is not None and self.session is not None:
            await self.host.logout(self.session)
        await self._ended(by="logout")

    async def _ended(self, *, by: str) -> None:
        """The session ended: said in the record, sent, and let go of."""
        self.state = "ended"
        self.turn = "idle"
        self.recorder.start(self.uid, facts=self.facts())
        self.recorder.session_ended(self.uid, by=by)
        await self.recorder.settled(self.uid)
        _SESSIONS.pop(self.uid, None)
        UI_HUB.forget(self.uid)
        UI_FILES.discard(self.uid)
        _forget_rules(self.uid)

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
        self._asked = None
        self._end_stream()

    def resume(self, *, head: str = "") -> AsyncIterator[str]:
        """Resume: the conversation so far, then the code's ``resume``; open again."""
        from ag_ui.core import MessagesSnapshotEvent

        if self.state == "ended":
            raise SessionRefused(
                409,
                f"Session {self.uid} ended; an ended session is not resumed — clone it to go on from it.",
            )
        if self.state != "paused":
            raise SessionRefused(409, f"Session {self.uid} is open, not paused.")
        self.state = "open"
        self.turn = "idle"

        async def work() -> None:
            """The turn."""
            self.emit(MessagesSnapshotEvent(messages=_snapshot(self.messages)))
            # What its messages showed, and what was open beside the
            # conversation, shown again on the socket (P-18, RU-W).
            for message in self.messages:
                display = message.get("shows")
                if display:
                    self.show_op(ShowOp(scope=self.uid, id=display["id"], body=display))
            for shown in self._elements.values():
                self.show_op(self._element_op(shown))
            # Opened again on this runtime: a `session` entry with `state: open`
            # and `runs_on` rewritten (MH-01), whether or not this runtime
            # wrote its first.
            await run_hooks(
                "resume", self, {"held": not self.resumed, "runs_on": self.runs_on}
            )
            self.recorder.forget_started(self.uid)
            self.recorder.start(self.uid, resumed=True, facts=self.facts())
            await self.recorder.flush(self.uid)
            if self.host is not None:
                state = dict(self.session.state) if self.session is not None else {}
                self.session = await self.host.resume(
                    self.uid,
                    state,
                    opened_by=self.user_id,
                    settings=self.settings,
                    elements=list(self._elements.values()),
                )

        return self._start_turn(work, wraps_run=True, head=head)

    # --- an agent's run -----------------------------------------------------------

    async def _run_agent(
        self,
        history: List[Dict[str, Any]],
        *,
        bearer: str,
        forwarded: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """A run of the application's agent, through its own AG-UI app,
        streamed; ``forwarded`` its ``forwardedProps`` — how the message was
        heard when it was said (VO-27).
        """
        body = {
            "threadId": self.uid,
            "runId": self._run_id,
            "state": None,
            "messages": history,
            "tools": [],
            "context": [],
            "forwardedProps": dict(forwarded) if forwarded else None,
        }
        await self.forward(body, bearer=bearer)

    def run_token(self, bearer: str) -> str:
        """The token a run of the session carries: the request's, but in a
        Preview a person opened (R-25) theirs narrowed to the Spaces and
        the companies its application is granted, held for it
        (`principal.ensure_preview_token`) — and without one the run is
        refused, never run with theirs.
        """
        person = str(self.acts_as.get("uid") or "")
        if self.acts_as.get("kind") != "person" or not person:
            return bearer
        from agent_runtimes.apps.principal import (
            preview_grants,
            preview_token,
            preview_token_refusal,
        )

        app_uid = str(self.instance.get("app_uid") or "")
        grants = preview_grants(self.app)
        token = preview_token(app_uid, person, grants)
        if token is None:
            raise SessionRefused(
                403, str(preview_token_refusal(app_uid, person, grants))
            )
        return token

    async def forward(
        self, body: Dict[str, Any], *, bearer: str, instructions: str = ""
    ) -> None:
        """Run the agent on an AG-UI input, its events streamed and its answer kept.

        ``instructions`` are told to the agent for this run besides its own —
        the modes the person is in (P-19): set by the runtime, never read
        from the request, whose system messages the agent does not take.

        A Preview's run carries the person's token narrowed to the Spaces its
        application is granted, in place of theirs (R-25): every tool of
        the run reaches those Spaces and no other. Their own token is kept
        beside it for what the runtime does for them that is not a Space —
        reading the application's documents (`record.own_token_for`).
        """
        from agent_runtimes.apps.record import persons_own_token
        from agent_runtimes.routes.agui import get_agui_app
        from agent_runtimes.transports.agui import run_instructions

        app = get_agui_app(self.agent_id)
        if app is None:
            raise SessionRefused(
                410, f"The agent of {self.app.name} is no longer on this runtime."
            )
        persons = bearer
        bearer = self.run_token(bearer)
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

        with (
            run_instructions(instructions),
            persons_own_token(persons if bearer != persons else None),
        ):
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
        settings it holds (``settings``), the option of each mode the person is
        in (``modes``, P-19), the files given (``files``), and a press
        checked on the ui socket (``press``, RU-W) — never an
        action of its own (RU-5).

        The modes' instructions are told to the agent for this run, and the
        model one of them names is run on: through the code's ``session.agent``
        for an application written in Python, else on the run itself.
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
        self._choose_profile(loop.get("profile"))
        changed: Dict[str, Any] = {}
        if settings is not None:
            try:
                updated = form_values(
                    self.app.interface.settings, {**self.settings, **settings}
                )
            except InvalidAnswer as wrong:
                raise SessionRefused(422, str(wrong)) from None
            # What changed since the last run: its code is told (P-20).
            changed = {
                key: value
                for key, value in updated.items()
                if self.settings.get(key) != value
            }
            self.settings = updated
            # The page says them in its message: not said again.
            self._sent_settings = dict(self.settings)
        modes = loop.get("modes")
        if modes is not None and not isinstance(modes, Mapping):
            raise SessionRefused(422, "The modes sent are not options by mode id.")
        try:
            self.modes = mode_choice(self.app, {**self.modes, **(modes or {})})
        except ValueError as wrong:
            raise SessionRefused(422, str(wrong)) from None
        if self.session is not None:
            self.session._update_modes(self.modes)
        files = given_files(
            loop.get("files"), scope=self.uid, owner=owner_of(self.opened_by)
        )
        if "action" in loop:
            # A page's block says a message, its files and its settings; a
            # button presses what was offered, up the ui socket (RU-5).
            raise SessionRefused(
                422,
                "A run carries no action: a page's block sends a message, and a "
                "button presses what was offered up the ui socket, the run naming "
                "it with forwardedProps.loop.press.",
            )
        if "press" in loop:
            # Checked on the socket (RU-W): the run says which, and
            # nothing else.
            return self.pressed(
                self._take_press(loop.get("press")), files=files, run_id=run_id
            )
        if self.turn == "waiting":
            # The chat answers by pressing what the question offered — a file
            # by the ref its upload answered (RU-4, RU-6).
            raise SessionRefused(409, self._waiting_for())
        # Files given: what its Appspec takes, or its page's File upload asks for (P-21).
        refused = given_refused(self.app, files)
        if refused:
            raise SessionRefused(422, refused)
        if self.host is not None:
            if files:
                return self._start_turn(
                    lambda: self._settings_then(
                        changed, lambda: self._files_code(text, files)
                    ),
                    run_id=run_id,
                    wraps_run=True,
                )
            if not text:
                raise SessionRefused(422, "Nothing to send: write a message first.")
            return self._start_turn(
                lambda: self._settings_then(changed, lambda: self._message_code(text)),
                run_id=run_id,
                wraps_run=True,
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
            words, parts = await asyncio.to_thread(self._files_for_agent, files)
            content: Any = f"{text}\n\n{words}" if words else text
            if parts:
                # What its model is given whole: an image, a recording, a PDF (P-21).
                content = [{"type": "text", "text": content}, *parts]
            said = [*messages[:-1], {**last, "content": content}] if words else messages
            # What the page answered `host_context`, its `user` the one the
            # host's server signed (D-21): never what the page says.
            if reads_user(self.app):
                said = signed_host_context(said, self.user)
            self.messages = [dict(m) for m in said]
            # The profile the conversation is with, and the modes the person
            # is in, for this run only (P-19, P-20).
            effect = run_effect(self.app, self.profile or None, self.modes)
            run = {
                "state": None,
                "tools": [],
                "context": [],
                **body,
                "threadId": self.uid,
                "runId": self._run_id,
                "messages": said,
                "forwardedProps": forwarded or None,
                **({"model": effect.model} if effect.model else {}),
            }
            await self.forward(run, bearer=bearer, instructions=effect.instructions)

        return self._start_turn(work, run_id=run_id, wraps_run=False)


def _snapshot(messages: List[Dict[str, Any]]) -> List[Any]:
    """The conversation as AG-UI messages, for a snapshot: its text only.

    What a message showed is said on the ui socket (RU-W), shown
    again from the hub, and again by a resume.
    """
    from ag_ui.core import AssistantMessage, UserMessage

    shown: List[Any] = []
    for message in messages:
        content = _text_of(message.get("content"))
        if message.get("role") == "user":
            shown.append(
                UserMessage(id=str(message.get("id") or _new_id()), content=content)
            )
        elif message.get("role") == "assistant":
            shown.append(
                AssistantMessage(
                    id=str(message.get("id") or _new_id()),
                    content=content,
                    name=message.get("name") or None,
                )
            )
    return shown


# --- the sessions of this runtime ------------------------------------------------------

_SESSIONS: Dict[str, LiveSession] = {}

#: The sounds being sent to be kept, held until sent (VO-63).
_KEEPING: "set[asyncio.Future[None]]" = set()

#: The ui channel of every session of this runtime (RU-W): each
#: session's ops, numbered and kept, for the page's WebSocket
#: (``/api/v1/apps/ui``, `agent_runtimes.routes.apps`).
UI_HUB = UiHub()

#: The files the pages of this runtime's sessions uploaded (RU-6):
#: by conversation and ref, for whoever uploaded them, each with a signed url
#: (``/api/v1/apps/files``, `agent_runtimes.routes.apps`).
UI_FILES = UiFiles(secrets.token_bytes(32), max_file=MAX_FILE_BYTES)

#: Where a file's signed url points, on this runtime.
FILES_PREFIX = "/api/v1/apps/files"

#: How many presses checked on the socket may wait for their run.
MAX_PRESSES = 16


async def _rebind_through_configure(
    live: "LiveSession", agent: str, request: Any
) -> None:
    """Bind another agentspec to the session's agent in place — through
    `configure-from-spec`, the one way to reconfigure a running agent (MH-06):
    the old agent is deleted (a harness's process ended, its row kept) and the
    new one created under the same id, with the same application.
    """
    from agent_runtimes.routes.agents import (
        ConfigureFromSpecRequest,
        configure_from_spec_endpoint,
        get_stored_agent_spec,
    )

    stored = get_stored_agent_spec(live.agent_id) or {}
    await configure_from_spec_endpoint(
        request,
        ConfigureFromSpecRequest(
            agent_spec_id=agent,
            agent_id=live.agent_id,
            app_spec=stored.get("app_spec"),
            app_instance=stored.get("app_instance"),
        ),
    )


Rebinder = Callable[["LiveSession", str, Any], Awaitable[None]]

#: What binds another agent to a session's agent: configure-from-spec, or a test's double.
_rebinder: Dict[str, Rebinder] = {"rebind": _rebind_through_configure}


def use_rebinder(rebinder: Optional[Rebinder]) -> None:
    """What rebinds a session's agent on a swap; ``None`` for configure-from-spec (a test)."""
    _rebinder["rebind"] = rebinder or _rebind_through_configure


async def rebind(live: "LiveSession", agent: str, request: Any) -> None:
    """Rebind through what is installed."""
    await _rebinder["rebind"](live, agent, request)


async def run_hooks(
    event: str,
    session: Union["LiveSession", "RecordedSession"],
    facts: Mapping[str, Any],
) -> None:
    """The ``session.hook`` contributions before an operation (MH-F06): a
    refusal is the operation's, in the hook's sentence.

    Raises
    ------
    SessionRefused
        A hook refused (its status and sentence), or failed (500, naming it).
    """
    from agent_runtimes.apps.session_hooks import HookFailed, fire
    from agent_runtimes.plugins.points import HookRefused

    try:
        await fire(event, session, facts)
    except HookRefused as refused:
        raise SessionRefused(refused.status, refused.reason) from None
    except HookFailed as failed:
        raise SessionRefused(500, str(failed)) from None


def _forget_rules(session: str) -> None:
    """The person's rules of a session go with it."""
    from agent_runtimes.guardrails.session_rules import session_rules

    session_rules().forget(session)


#: What one caller may ask of the session API in an hour (REVIEWS R-22 (5)),
#: by operation: a clone copies a record, an export reads one whole, an import
#: writes one of up to 20 000 entries. Past the budget, 429 in a sentence that
#: says when it resets; the refusal is in the source session's record.
SESSION_BUDGETS: Dict[str, int] = {"clone": 20, "export": 20, "import": 10}

#: The budget's hour, in seconds.
BUDGET_HOUR = 3600.0

#: When each caller spent each operation, within the hour: ``(operation, caller)``.
_SPENT: Dict[Tuple[str, str], Deque[float]] = {}

#: The clock the budget reads; a test sets it.
_CLOCK: Callable[[], float] = time.time


def spend_budget(operation: str, caller: Caller) -> None:
    """Count one ``operation`` of ``caller``'s against the hour's budget.

    Parameters
    ----------
    operation : str
        One of `SESSION_BUDGETS`: ``clone``, ``export`` or ``import``.
    caller : Caller
        Who asks; the budget is theirs, by kind and uid.

    Raises
    ------
    SessionRefused
        429, when the hour's budget is spent, naming when it resets.
    """
    allowed = SESSION_BUDGETS[operation]
    spent = _SPENT.setdefault((operation, f"{caller.kind}:{caller.uid}"), deque())
    now = _CLOCK()
    while spent and spent[0] <= now - BUDGET_HOUR:
        spent.popleft()
    if len(spent) >= allowed:
        resets = datetime.fromtimestamp(spent[0] + BUDGET_HOUR, timezone.utc)
        raise SessionRefused(
            429,
            f"You have asked {allowed} {operation}s this hour, the most the budget "
            f"allows: it resets at {resets:%H:%M} UTC.",
        )
    spent.append(now)


async def refused_by_budget(
    source: Any, operation: str, caller: Caller, refused: "SessionRefused"
) -> None:
    """Say a refusal of the budget in the source session's record (R-22 (5)):
    the row is written and sent before the refusal is answered.
    """
    source.recorder.refused(
        source.uid, operation=operation, by=caller.uid, sentence=refused.reason
    )
    if isinstance(source, LiveSession):
        await source.recorder.settled(source.uid)
    else:
        await source.recorder.flush(source.uid)


def session_of(uid: str) -> Optional[LiveSession]:
    """A session of this runtime, by uid, or None."""
    return _SESSIONS.get(uid)


def forget_sessions() -> None:
    """Forget every session, and the code it was given to run (a test)."""
    global UI_HUB, UI_FILES
    UI_HUB = UiHub()
    UI_FILES = UiFiles(secrets.token_bytes(32), max_file=MAX_FILE_BYTES)
    _SESSIONS.clear()
    _SERVED.clear()
    _AGENT_CODE.clear()
    from agent_runtimes.guardrails.session_rules import session_rules

    session_rules().clear()
    _SPENT.clear()


def agent_app(agent_id: str) -> Tuple[AppSpec, Dict[str, Any]]:
    """The application an agent of this runtime runs, and the instance it serves.

    Raises
    ------
    SessionRefused
        When there is no such agent, or it runs no application.
    """
    from agent_runtimes.apps.loading import load_app
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
        from agent_runtimes.routes.agents import get_stored_agent_spec
        from agent_runtimes.routes.agui import get_agui_adapter

        adapter = get_agui_adapter(agent_id)
        if adapter is None:
            raise SessionRefused(
                410, f"The agent of {session.app.name} is no longer on this runtime."
            )
        stored = get_stored_agent_spec(agent_id) or {}
        return AppAgent(
            app=session.app,
            agent=adapter._get_pydantic_agent(),
            session_id=session.uid,
            # Made with the application's rules, checks and record already.
            capabilities=[],
            toolsets=list(adapter._get_runtime_toolsets()),
            # A model its modes choose is called as the agent's own is: through
            # its provider, naming the instance it serves (R-09).
            inference_provider=stored.get("inference_provider") or None,
            app_instance=dict(stored.get("app_instance") or {}) or None,
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
    profile: str = "",
    user: Optional[HostUser] = None,
    title: str = "",
    lineage: Optional[Mapping[str, Any]] = None,
    runs_on: Optional[Mapping[str, Any]] = None,
    archived: bool = False,
    files: Optional[List[Dict[str, Any]]] = None,
) -> LiveSession:
    """A session of an application's agent on this runtime, kept by uid.

    A session resumed from its record (``resumed``) is held ``paused`` until
    its ``resume`` runs; its title, lineage and archive flag are the record's.

    ``user`` is the user the host's server signed, embedded (D-21,
    `host_user_of`): verified before it is made.

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
    if profile:
        try:
            profile_choice(app, profile)
        except ValueError as wrong:
            raise SessionRefused(422, str(wrong)) from None
    recorder = agent_recorder(agent_id) or AppRecorder(
        app=app,
        app_uid=str(instance.get("app_uid") or ""),
        deployment_uid=str(instance.get("deployment_uid") or ""),
        version=int(instance.get("version") or 0),
    )
    # Who opened it, on its record (R-31): a person the runtime
    # verified; an embed's visitor or one not signed in is nobody known.
    # A host's person opened it as themselves.
    # By name too, when their token says it: who it signs for (I-10).
    recorder.opened(
        uid,
        opened_by.uid if opened_by.kind in ("person", "host") else "",
        name=opened_by.name if opened_by.kind in ("person", "host") else "",
    )
    # Who it acts for, embedded, as the host's server signed them (D-21).
    recorder.signed(uid, {"sub": user.sub, "name": user.name} if user else None)
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
        files=[dict(item) for item in (files or [])],
        resumed=resumed,
        profile=profile,
        user=user,
        title=str(title or "")[:200],
        archived=bool(archived),
        lineage=dict(lineage)
        if lineage
        else {"forked_from": None, "imported_from": None},
        runs_on=dict(runs_on) if runs_on else runtime_runs_on(),
    )
    application = code_of(app, agent_id)
    if application is not None:
        from agent_runtimes.apps.application import AppHost

        live.host = AppHost(
            application,
            live,
            recorder=recorder,
            agent_maker=_agent_maker(agent_id),
        )
    if resumed:
        live.state = "paused"
    _SESSIONS[uid] = live
    return live


async def pause_held() -> List[str]:
    """Pause every open session this runtime holds, as it stops gracefully
    (MH-01): each gets its ``paused`` entry, sent before the runtime goes,
    so a listing from the record says the truth. The uids paused.
    """
    paused: List[str] = []
    for live in list(_SESSIONS.values()):
        if live.state != "open":
            continue
        try:
            await live.stop()
            await live.recorder.settled(live.uid)
            paused.append(live.uid)
        except Exception as error:  # noqa: BLE001 - said, the rest still paused
            logger.warning(
                "Session %s was not paused as the runtime stops: %s", live.uid, error
            )
    return paused


# --- the record, read back -------------------------------------------------------------


def use_record_reader(
    reader: Optional[Callable[[str, str], Awaitable[List[Dict[str, Any]]]]],
) -> None:
    """Who reads a session's record back for the record store; ``None`` for ai-agents (a test)."""
    from agent_runtimes.apps.session_store import use_record_reader as use

    use(reader)


async def record_entries(
    session_uid: str, up_to_turn: Optional[int] = None
) -> List[Dict[str, Any]]:
    """A session's entries from the active session store (MH-F03).

    Raises
    ------
    SessionRefused
        When the store cannot answer, in its sentence.
    """
    from agent_runtimes.apps.session_store import (
        SessionStoreError,
        SessionStoreRefused,
        active_store,
    )

    try:
        return await active_store().entries(session_uid, up_to_turn=up_to_turn)
    except SessionStoreRefused as refused:
        raise SessionRefused(503, str(refused)) from None
    except SessionStoreError as refused:
        raise SessionRefused(refused.status, refused.reason) from None


def _store_reads_with_a_token() -> bool:
    """Whether the active session store reads a session back with the
    caller's token: the record store does (ai-agents answers for the
    bearer); the file store reads its own files, so a local resume — the
    REPL's, a seat's on a self-hosted runtime — needs none.

    Raises
    ------
    SessionRefused
        When the store cannot be named, in its sentence (503).
    """
    from agent_runtimes.apps.session_store import (
        SessionStoreRefused,
        active_store,
    )

    try:
        return str(getattr(active_store(), "name", "") or "") == "record"
    except SessionStoreRefused as refused:
        raise SessionRefused(503, str(refused)) from None


@dataclass
class Rebuilt:
    """A session rebuilt from its record (MH-03): everything a resume gives back."""

    messages: List[Dict[str, Any]]
    files: List[Dict[str, Any]]
    rules: List[Dict[str, Any]]
    title: str
    archived: bool
    lineage: Dict[str, Any]
    state: str
    agent: str
    turns: int
    #: Who opened it, as the record says: the uid, ``""`` when nobody (a
    #: session woken for an event). A resume is theirs alone.
    opened_by: str = ""


def opener_may(opened_by: str, caller: Caller) -> bool:
    """Whether a caller may act on a recorded session that ``opened_by`` opened.

    The opener — a person, or a host session's linked person signed in as
    themselves — or the machine itself; never a stranger, the application's
    owner and an organization's admin included, who are told the session
    does not exist (MH-31). A session nobody opened answers nobody but the
    machine.
    """
    if caller.kind == "local":
        return True
    return (
        bool(opened_by)
        and opened_by == caller.uid
        and caller.kind
        in (
            "person",
            "host",
        )
    )


_ROW_FACTS = (
    "kind",
    "class",
    "path",
    "command",
    "url",
    "what",
    "status",
    "behaviour",
    "because",
    "classes",
    "outcome",
    "note",
    "input",
)


def _row_shown(entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """A tool row, a step, a decision or an approval of the record as a
    display (`StepShown`), re-shown on a resume as the live one was.

    Kept as the wire form (`DisplayWire`), the shape a message's ``shows``
    has for a live row: it is what the page received, and what the resume
    shows again as a ``ShowOp`` — a display's own dump has no ``type`` or
    ``text`` and the op refuses it.
    """
    kind = str(entry.get("kind") or "")
    payload = dict(entry.get("payload") or {})
    at = str(entry.get("at") or "")
    if kind == "step":
        return (
            StepShown(
                id=str(payload.get("id") or _new_id()),
                name=str(payload.get("name") or payload.get("event") or "step"),
                kind=str(payload.get("kind") or "step"),
                parent_id=payload.get("parent_id") or None,
                input=payload.get("input"),
                output=payload.get("output") or payload.get("what"),
                error=str(payload.get("error") or ""),
                started_at=str(payload.get("started_at") or at),
                ended_at=payload.get("ended_at") or at,
            )
            .wire()
            .model_dump(mode="json")
        )
    if kind in ("tool_call", "decision", "approval"):
        name = str(payload.get("tool") or payload.get("name") or kind)
        facts = {key: value for key, value in payload.items() if key in _ROW_FACTS}
        return (
            StepShown(
                id=str(payload.get("tool_call_id") or _new_id()) + f"-{kind}",
                name=name,
                kind="tool" if kind == "tool_call" else kind,
                input=facts or None,
                output=payload.get("display")
                or payload.get("output")
                or str(entry.get("summary") or ""),
                error=str(payload.get("refused") or ""),
                started_at=at,
                ended_at=at,
            )
            .wire()
            .model_dump(mode="json")
        )
    return None


async def conversation_from_record(
    session_uid: str, app: AppSpec, instance: Mapping[str, Any], bearer: str
) -> List[Dict[str, Any]]:
    """The conversation of a session this runtime no longer holds, from its record, as AG-UI messages."""
    return (await rebuilt_from_record(session_uid, app, instance, bearer)).messages


async def rebuilt_from_record(
    session_uid: str, app: AppSpec, instance: Mapping[str, Any], bearer: str
) -> Rebuilt:
    """A session this runtime no longer holds, rebuilt whole from its record (MH-03).

    Its turns — what was asked and answered — as AG-UI messages; its tool
    rows, steps, decisions and approvals as displays under them, re-shown on
    the resume; the files given, their places in the sandbox re-stated; the
    session's Rules, applied again; its title, archive flag, lineage, state
    and agent as the record says them.

    Raises
    ------
    SessionRefused
        When the application keeps no conversations, the caller has no token
        to read the record with (the record store's; the file store reads
        its own files and asks for none), the record is not this application's, the
        session ended (409, naming clone), or the record holds no turn of it.
    """
    from agent_runtimes.apps.record import session_from_entries

    include = {str(getattr(item, "value", item)) for item in app.record.include}
    if "conversations" not in include:
        raise SessionRefused(
            409,
            f"{app.name} keeps no conversations in its record, so a session of it "
            "cannot be resumed from there.",
        )
    if not bearer and _store_reads_with_a_token():
        raise SessionRefused(
            401,
            f"Session {session_uid} is read back from its record with your token: send one.",
        )
    entries = await record_entries(session_uid)
    app_uid = str(instance.get("app_uid") or app.id)
    if any(str(entry.get("app_uid") or app_uid) != app_uid for entry in entries):
        raise SessionRefused(
            409, f"Session {session_uid} is not a session of {app.name}."
        )
    try:
        described = session_from_entries(session_uid, entries)
    except ValueError as wrong:
        raise SessionRefused(422, str(wrong)) from None
    if described is not None and described["state"] == "ended":
        raise SessionRefused(
            409,
            f"Session {session_uid} ended; an ended session is not resumed — clone it to go on from it.",
        )
    messages: List[Dict[str, Any]] = []
    files: List[Dict[str, Any]] = []
    rules: Dict[str, Dict[str, Any]] = {}
    for entry in entries:
        kind = entry.get("kind")
        payload = entry.get("payload") or {}
        if kind == "turn":
            asked, answered = (
                str(payload.get("asked") or ""),
                str(payload.get("answered") or ""),
            )
            if asked:
                messages.append({"id": _new_id(), "role": "user", "content": asked})
            if answered:
                messages.append(
                    {"id": _new_id(), "role": "assistant", "content": answered}
                )
        elif kind == "file":
            file = {
                "name": str(payload.get("name") or ""),
                "type": str(payload.get("type") or ""),
                "size": int(payload.get("size") or 0),
                "path": str(payload.get("path") or ""),
                "digest": str(payload.get("digest") or ""),
            }
            files.append(file)
            messages.append(
                {
                    "id": _new_id(),
                    "role": "assistant",
                    "content": f"The file {file['name']} ({file['size']} bytes) was given"
                    + (
                        f"; it is at {file['path']} in the sandbox."
                        if file["path"]
                        else "."
                    ),
                    "name": app.name,
                }
            )
        elif kind == "swapped":
            said = str(payload.get("said") or "")
            if said:
                messages.append(
                    {
                        "id": _new_id(),
                        "role": "assistant",
                        "content": said,
                        "name": app.name,
                        "agent": str(payload.get("agent") or payload.get("to") or ""),
                    }
                )
        elif kind == "rule":
            if payload.get("removed"):
                rules.pop(str(payload["removed"]), None)
            elif isinstance(payload.get("rule"), dict) and payload["rule"].get("name"):
                rules[str(payload["rule"]["name"])] = dict(payload["rule"])
        else:
            shown = _row_shown(entry)
            if shown is not None:
                messages.append(
                    {
                        "id": _new_id(),
                        "role": "assistant",
                        "content": str(entry.get("summary") or ""),
                        "name": app.name,
                        "shows": shown,
                    }
                )
    if not any(m.get("role") == "user" for m in messages):
        raise SessionRefused(
            404, f"The record holds no turn of session {session_uid} to resume it from."
        )
    return Rebuilt(
        messages=messages,
        files=files,
        rules=list(rules.values()),
        title=str(described["title"] if described else ""),
        archived=bool(described["archived"] if described else False),
        lineage=dict(
            described["lineage"]
            if described
            else {"forked_from": None, "imported_from": None}
        ),
        state=str(described["state"] if described else "paused"),
        agent=str(described["agent"] if described else ""),
        turns=sum(1 for m in messages if m.get("role") == "user"),
        opened_by=str((described["opened_by"] if described else {}).get("uid") or ""),
    )


# --- the session operations over held and recorded sessions (MH-09, MH-13, MH-14) ---


@dataclass
class RecordedSession:
    """A session this runtime does not hold, as the operations act on it:
    what the record says of it, with a recorder of its own so the audit rows
    (`cloned`, `exported`, `imported`) are written through the hooks as a
    held session's are.
    """

    uid: str
    app: AppSpec
    instance: Dict[str, Any]
    described: Dict[str, Any]
    recorder: AppRecorder

    @property
    def agent_id(self) -> str:
        return str(self.described.get("agent") or "")

    @property
    def agent_spec(self) -> str:
        return str(self.described.get("agent") or "")

    @property
    def agent_name(self) -> str:
        harness = self.described.get("harness")
        if harness:
            from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

            spec = HARNESS_CATALOGUE.get(str(harness))
            if spec is not None:
                return spec.name
        return self.agent_spec

    @property
    def harness(self) -> Optional[str]:
        return self.described.get("harness") or None

    @property
    def capabilities(self) -> Dict[str, Any]:
        from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

        spec = HARNESS_CATALOGUE.get(str(self.harness or ""))
        return spec.capabilities.model_dump(mode="json") if spec is not None else {}

    @property
    def state(self) -> str:
        return str(self.described.get("state") or "paused")

    @property
    def title(self) -> str:
        return str(self.described.get("title") or "")

    @property
    def archived(self) -> bool:
        return bool(self.described.get("archived"))

    @property
    def lineage(self) -> Dict[str, Any]:
        return dict(
            self.described.get("lineage")
            or {"forked_from": None, "imported_from": None}
        )

    @property
    def files(self) -> List[Dict[str, Any]]:
        return list(self.described.get("files") or [])

    @property
    def settings(self) -> Dict[str, Any]:
        return {}

    @property
    def messages(self) -> List[Dict[str, Any]]:
        return [{"role": "user", "content": ""}] * int(self.described.get("turns") or 0)

    @property
    def opened_by(self) -> Caller:
        return Caller(
            kind="person",
            uid=str((self.described.get("opened_by") or {}).get("uid") or ""),
        )

    def facts(self) -> Dict[str, Any]:
        return {
            "agent": self.agent_spec,
            "harness": self.harness,
            "runs_on": self.described.get("runs_on") or {},
            "title": self.title,
            "archived": self.archived,
            "lineage": self.lineage,
        }

    def describe(self) -> Dict[str, Any]:
        return dict(self.described)


def recorded_session(
    uid: str, described: Dict[str, Any], app: AppSpec, instance: Mapping[str, Any]
) -> RecordedSession:
    """A recorded session as the operations act on it, its recorder sending through the active store."""
    from agent_runtimes.apps.record import send_to_store

    recorder = AppRecorder(
        app=app,
        app_uid=str(
            instance.get("app_uid")
            or described.get("instance", {}).get("app_uid")
            or app.id
        ),
        deployment_uid=str(instance.get("deployment_uid") or ""),
        version=int(
            instance.get("version") or described.get("instance", {}).get("version") or 0
        ),
        send=send_to_store,
    )
    recorder.opened(uid, str((described.get("opened_by") or {}).get("uid") or ""))
    return RecordedSession(
        uid=uid,
        app=app,
        instance=dict(instance),
        described=described,
        recorder=recorder,
    )


def turns_of(source: Any) -> int:
    """How many turns the person had in a session, held or recorded."""
    if isinstance(source, LiveSession):
        return sum(1 for m in source.messages if m.get("role") == "user")
    return int(source.described.get("turns") or 0)


async def _store() -> Any:
    from agent_runtimes.apps.session_store import (
        SessionStoreError,
        SessionStoreRefused,
        active_store,
    )

    try:
        return active_store()
    except SessionStoreRefused as refused:
        raise SessionRefused(503, str(refused)) from None
    except SessionStoreError as refused:
        raise SessionRefused(refused.status, refused.reason) from None


async def _store_call(call: Awaitable[Any]) -> Any:
    from agent_runtimes.apps.session_store import (
        SessionStoreError,
        SessionStoreRefused,
    )

    try:
        return await call
    except SessionStoreRefused as refused:
        raise SessionRefused(503, str(refused)) from None
    except SessionStoreError as refused:
        raise SessionRefused(refused.status, refused.reason) from None


def _opening_entry(
    *,
    state: str,
    agent: str,
    harness: Optional[str],
    title: str,
    archived: bool,
    lineage: Mapping[str, Any],
    app_id: str,
) -> Dict[str, Any]:
    """A session's opening entry written by an operation, not a runtime: `paused`, on no runtime."""
    from agent_runtimes.apps.record import session_facts

    return {
        "kind": "session",
        "summary": "A session opened " + ("paused" if state == "paused" else state),
        "payload": {
            "app": app_id,
            "state": state,
            **session_facts(
                {
                    "agent": agent,
                    "harness": harness,
                    "runs_on": {"kind": "none"},
                    "title": title,
                    "archived": archived,
                    "lineage": lineage,
                }
            ),
        },
    }


async def clone_session(
    source: Any,
    *,
    up_to_turn: Optional[int],
    agent: str,
    title: str,
    caller: Caller,
) -> Dict[str, Any]:
    """Clone a session from a turn (MH-09): a new uid, `paused`, on no runtime.

    The entries up to the turn are copied under the new uid through the
    store; `cloned` on both; the session's Rules go with the entries, the mode
    starts at the application's default, the harness's own session never
    carries; `agent` named, the clone is told as a swap is (a `swapped` entry
    the resume reads as the sentence). An `ended` source clones like any
    other; a turn the source lacks is 422.

    Raises
    ------
    SessionRefused
        In a sentence.
    """
    from agent_runtimes.apps.session_carry import carry_policy
    from agent_runtimes.specs.agents.agents import get_agent_spec
    from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

    total = turns_of(source)
    at_turn = total if up_to_turn is None else int(up_to_turn)
    if at_turn < 0 or at_turn > total:
        raise SessionRefused(
            422,
            f"Session {source.uid} has {total} turn{'s' if total != 1 else ''}; there is no turn {at_turn} to clone it at.",
        )
    if len(title) > TITLE_LIMIT:
        raise SessionRefused(
            422,
            f"A session's title is at most {TITLE_LIMIT} characters; this one has {len(title)}.",
        )
    target_agent = source.agent_spec
    target_harness = source.harness
    target_name = source.agent_name
    if agent:
        spec = get_agent_spec(agent)
        if spec is None:
            raise SessionRefused(
                404, f"There is no agentspec {agent!r} on this runtime to clone onto."
            )
        target_agent = spec.id
        harness = HARNESS_CATALOGUE.get(str(getattr(spec, "harness", "") or ""))
        target_harness = harness.id if harness is not None else None
        target_name = harness.name if harness is not None else str(spec.name or spec.id)
    capabilities = (
        HARNESS_CATALOGUE[target_harness].capabilities.model_dump(mode="json")
        if target_harness in HARNESS_CATALOGUE
        else {}
    )
    carried = carry_policy().clone(
        source,
        {
            "agent": target_agent,
            "name": target_name,
            "harness": target_harness,
            "at_turn": at_turn,
            "capabilities": capabilities,
        },
    )
    new_uid = _new_id()
    await run_hooks(
        "clone",
        source,
        {
            "to": new_uid,
            "at_turn": at_turn,
            "agent": target_agent,
            "said": carried.said,
        },
    )
    if isinstance(source, LiveSession):
        await source.recorder.settled(source.uid)
    store = await _store()
    copied = await _store_call(store.copy(source.uid, new_uid, up_to_turn=at_turn))
    lineage = {
        "forked_from": {"uid": source.uid, "at_turn": at_turn},
        "imported_from": None,
    }
    opening = _opening_entry(
        state="paused",
        agent=target_agent,
        harness=target_harness,
        title=title or source.title,
        archived=False,
        lineage=lineage,
        app_id=source.app.id,
    )
    entries: List[Dict[str, Any]] = [
        opening,
        {
            "kind": "cloned",
            "summary": f"Cloned from {source.uid} at turn {at_turn}",
            "payload": {"from": source.uid, "at_turn": at_turn},
        },
    ]
    if carried.said:
        entries.append(
            {
                "kind": "swapped",
                "summary": f"Cloned onto {target_agent} at turn {at_turn}",
                "payload": {
                    "from": source.agent_spec,
                    "to": target_agent,
                    "from_harness": source.harness,
                    "to_harness": target_harness,
                    "agent": target_agent,
                    "harness": target_harness,
                    "at_turn": at_turn,
                    "said": carried.said,
                    "carried": dict(carried.carried),
                    "dropped": dict(carried.dropped),
                },
            }
        )
    instance = (
        source.instance if isinstance(source, (LiveSession, RecordedSession)) else {}
    )
    await _store_call(
        store.append(
            new_uid,
            entries,
            app_uid=str(instance.get("app_uid") or source.app.id),
            deployment_uid=str(instance.get("deployment_uid") or ""),
            version=int(instance.get("version") or 0),
            opened_by=caller.uid if caller.kind in ("person", "host") else "",
        )
    )
    return {
        "uid": new_uid,
        "state": "paused",
        "runs_on": None,
        "turns": at_turn,
        "entries": copied,
        "agent": target_agent,
        "harness": target_harness,
        "title": title or source.title,
        "lineage": lineage,
        "said": carried.said,
        "dropped": dict(carried.dropped),
    }


def _declared_secret_values(source: Any) -> Dict[str, str]:
    """The values of the secrets the session's harness declares, by name, from the environment (MH-13)."""
    import os

    from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

    names: List[str] = []
    harness = HARNESS_CATALOGUE.get(str(source.harness or ""))
    if harness is not None:
        names.extend(harness.requires.secrets)
    return {
        name: os.environ[name] for name in names if (os.environ.get(name) or "").strip()
    }


async def export_session(
    source: Any, *, format_id: str, caller: Caller
) -> Tuple[Any, str]:
    """Export a session as a file (MH-13): the lines, and the file's digest.

    Refused 409 when the application keeps no conversations in its record;
    a turn running when the export is asked is not in the record yet, so the
    file holds the complete turns and its session line says so; `exported`
    in the record with the digest, through the hooks.
    """
    from agent_runtimes.apps.session_files import (
        SessionFormatRefused,
        digest_of,
        format_named,
    )

    include = {str(getattr(item, "value", item)) for item in source.app.record.include}
    if "conversations" not in include:
        raise SessionRefused(
            409,
            f"{source.app.name} keeps no conversations in its record, so a session of it cannot be exported.",
        )
    try:
        fmt = format_named(format_id)
    except SessionFormatRefused as refused:
        raise SessionRefused(refused.status, refused.reason) from None
    if isinstance(source, LiveSession):
        await source.recorder.settled(source.uid)
    store = await _store()
    entries = await _store_call(store.entries(source.uid))
    described = source.describe()
    exported = fmt.export(
        described,
        entries,
        exported_by=caller.uid,
        secrets=_declared_secret_values(source),
    )
    digest = digest_of(exported.lines)
    await run_hooks(
        "export",
        source,
        {
            "by": caller.uid,
            "entries": exported.entries,
            "redactions": exported.redactions,
            "digest": digest,
        },
    )
    if isinstance(source, LiveSession):
        await source.recorder.settled(source.uid)
    else:
        await source.recorder.flush(source.uid)
    return exported, digest


async def import_session(
    body: bytes,
    *,
    format_id: str,
    agent: str,
    caller: Caller,
    app_of: Callable[[str], Optional[Tuple[AppSpec, Dict[str, Any]]]],
) -> Dict[str, Any]:
    """Import a session file (MH-14): always a new uid, the importer its
    author, `paused`, lineage `imported_from`.

    The file is untrusted data: the caps first, then each line by the
    format; the file's `app.id` must be an application of the runtime
    (`app_of` answers it, with the instance it serves) else 422; a different
    `app.version` is said in the `imported` entry (decision P); the file's
    agent when the runtime has it, else `agent`, else 422 in a sentence; the
    files' entries re-stated as *not present*.
    """
    from agentspecs.sessions import within_caps

    from agent_runtimes.apps.session_files import (
        SessionFormatRefused,
        digest_of,
        format_named,
    )
    from agent_runtimes.specs.agents.agents import get_agent_spec
    from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE

    if caller.kind not in ("person", "host", "local"):
        from agent_runtimes.apps.visitors import NOTHING_KEPT

        raise SessionRefused(404, NOTHING_KEPT)
    text = body.decode("utf-8", "replace")
    lines = text.splitlines()
    over = within_caps(len(body), max(0, len(lines) - 1))
    if over:
        raise SessionRefused(413, over)
    try:
        fmt = format_named(format_id)
        imported = fmt.import_(lines)
    except SessionFormatRefused as refused:
        raise SessionRefused(refused.status, refused.reason) from None
    head = imported.session
    found = app_of(str(head["app"]["id"]))
    if found is None:
        raise SessionRefused(
            422,
            f"The file's application {head['app']['id']!r} is not on this runtime: a session is imported where its application runs.",
        )
    app, instance = found
    current_version = int(instance.get("version") or 0)
    file_version = int(head["app"]["version"])
    from agent_runtimes.routes.agents import get_stored_agent_spec

    def known(name: str) -> bool:
        # An agentspec of the library, or an agent this runtime holds.
        return bool(name) and (
            get_agent_spec(name) is not None or get_stored_agent_spec(name) is not None
        )

    file_agent = str(head.get("agent") or "")
    chosen = file_agent if known(file_agent) else ""
    if agent:
        if not known(agent):
            raise SessionRefused(
                422,
                f"There is no agent {agent!r} on this runtime to import the session onto.",
            )
        chosen = agent
    if not chosen:
        raise SessionRefused(
            422,
            f"The file's agent {file_agent} is not on this runtime: name one with ?agent=.",
        )
    spec = get_agent_spec(chosen)
    harness = HARNESS_CATALOGUE.get(str(getattr(spec, "harness", "") or ""))
    harness_id = harness.id if harness is not None else None
    new_uid = _new_id()
    digest = digest_of(lines)
    lineage: Dict[str, Any] = {
        "forked_from": None,
        "imported_from": {
            "digest": digest,
            "exported_at": str(head.get("exported_at") or ""),
            # The schema's ImportedFrom: digest, when, by whom — the
            # redactions are the `imported` entry's. Found on r1, 22 October
            # 2026: the export of an imported session was refused at import,
            # *lineage.imported_from.redactions: Extra inputs are not permitted*.
            "exported_by": str((head.get("exported_by") or {}).get("uid") or ""),
        },
    }
    entries: List[Dict[str, Any]] = [
        _opening_entry(
            state="paused",
            agent=chosen,
            harness=harness_id,
            title=str(head.get("title") or ""),
            archived=bool(head.get("archived")),
            lineage=lineage,
            app_id=app.id,
        )
    ]
    for entry in imported.entries:
        kind = str(entry.get("kind") or "")
        if kind in ("session", "paused", "ended", "imported", "exported", "cloned"):
            # The file's own state and audit rows are its session's, not this one's.
            continue
        if kind == "rule":
            # The file's Rules were its exporter's, on their session: an
            # imported session starts from the application's default Rules,
            # and an untrusted file plants none (MH-14).
            continue
        payload = dict(entry.get("payload") or {})
        if kind == "file":
            payload = {**payload, "present": False, "path": ""}
        entries.append(
            {
                "kind": kind,
                "summary": str(entry.get("summary") or ""),
                "payload": payload,
                "at": entry.get("at") or "",
                "imported": True,
            }
        )
    # The person's turns are counted from the entries kept, never read from
    # the file's first line: a file is untrusted data, its own count included.
    turns = sum(1 for entry in entries if entry.get("kind") == "turn")
    described = {
        "uid": new_uid,
        "agent": chosen,
        "harness": harness_id,
        "app": {"id": app.id, "version": current_version},
        "instance": {
            "app_uid": str(instance.get("app_uid") or ""),
            "deployment_uid": str(instance.get("deployment_uid") or ""),
            "version": current_version,
        },
        "opened_by": {"kind": caller.kind, "uid": caller.uid},
        "state": "paused",
        "turn": "idle",
        "held": False,
        "title": str(head.get("title") or ""),
        "archived": bool(head.get("archived")),
        "lineage": lineage,
        "runs_on": None,
        "turns": turns,
    }
    store = await _store()
    await _store_call(
        store.append(
            new_uid,
            entries,
            app_uid=str(instance.get("app_uid") or app.id),
            deployment_uid=str(instance.get("deployment_uid") or ""),
            version=current_version,
            opened_by=caller.uid if caller.kind in ("person", "host") else "",
        )
    )
    target = recorded_session(new_uid, described, app, instance)
    await run_hooks(
        "import",
        target,
        {
            "digest": digest,
            "exported_at": str(head.get("exported_at") or ""),
            "exported_by": lineage["imported_from"]["exported_by"],
            "redactions": int(imported.redactions),
            "file_version": file_version,
            "current_version": current_version,
            "source_uid": str(head.get("uid") or ""),
        },
    )
    await target.recorder.flush(new_uid)
    return {
        "uid": new_uid,
        "state": "paused",
        "runs_on": None,
        "turns": turns,
        "redactions": int(imported.redactions),
        "agent": chosen,
        "harness": harness_id,
        "title": described["title"],
        "lineage": lineage,
        "versions": {"file": file_version, "current": current_version},
    }


def apply_rules(live: "LiveSession", rules: List[Dict[str, Any]]) -> List[str]:
    """The record's rules applied to a resumed session; the names of those refused."""
    from agent_runtimes.guardrails.session_rules import rule_from, session_rules
    from agent_runtimes.guardrails.shield_policy import rules_policy

    refused: List[str] = []
    for data in rules:
        try:
            session_rules().add(
                live.uid, rule_from(data), application=rules_policy(live.app)
            )
        except Exception as wrong:  # noqa: BLE001 - said, the rest applied
            logger.warning(
                "The rule %r of session %s was not applied again: %s",
                data.get("name"),
                live.uid,
                wrong,
            )
            refused.append(str(data.get("name") or ""))
    return refused


__all__ = [
    "FILES_DIR",
    "MAX_FILE_BYTES",
    "MAX_TEXT_CHARACTERS",
    "STATES",
    "TURNS",
    "MAX_PRESSES",
    "QUESTION_DISPLAY_TYPE",
    "STEP_DISPLAY_TYPE",
    "UI_HUB",
    "WINDOW_MESSAGE",
    "LiveSession",
    "QuestionShown",
    "StepShown",
    "SessionRefused",
    "agent_app",
    "check_state",
    "code_of",
    "serve_agent_code",
    "Rebuilt",
    "RecordedSession",
    "TITLE_LIMIT",
    "apply_rules",
    "clone_session",
    "export_session",
    "import_session",
    "recorded_session",
    "turns_of",
    "conversation_from_record",
    "first_line_title",
    "forget_sessions",
    "given_files",
    "is_text",
    "new_session",
    "opener_may",
    "pause_held",
    "placed_in_words",
    "put_in_sandbox",
    "question_in_words",
    "question_of",
    "rebind",
    "rebuilt_from_record",
    "record_entries",
    "run_hooks",
    "session_of",
    "spend_budget",
    "refused_by_budget",
    "SESSION_BUDGETS",
    "BUDGET_HOUR",
    "text_in_words",
    "use_rebinder",
    "use_record_reader",
]

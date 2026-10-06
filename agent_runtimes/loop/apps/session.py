# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's session: one conversation of one user with one application.

What an application's code is given (LOOP P-03). It writes to the user
(`Session.send`, `Session.stream`), shows what it is doing (`Session.step`),
stops to ask (`Session.ask`), keeps state across turns (`Session.state`),
writes to the application's record (`Session.record`) and calls the
application's agent (`Session.agent`).

This is an application's session, not the workspace's: `LoopSession`
(`agent_runtimes.loop.session`) is a terminal's or a browser's conversation
with an agent, and knows nothing of applications.

A session talks to its user through a `Channel`: the page, the terminal, a
test. In this process the channel is a `MemoryChannel`; on a runtime it is the
session API's (`agent_runtimes.loop.apps.sessions`, LOOP R-04), which
streams what the application shows as AG-UI events and brings back what the
page answers.
"""

from __future__ import annotations

import asyncio
import contextvars
import fnmatch
import inspect
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import (
    Any,
    AsyncIterable,
    AsyncIterator,
    Callable,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Protocol,
    Sequence,
    Tuple,
    Union,
)

from agent_runtimes.loop.apps.agent import AgentFactory, AppAgent, app_capabilities
from agent_runtimes.loop.apps.components import answer_components, component_node
from agent_runtimes.loop.apps.composer import mode_choice, mode_effect
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError, sentence_of
from agent_runtimes.loop.apps.forms import form_defaults, form_fields, refused_by
from agent_runtimes.loop.apps.guards import AppCheckBlockedError
from agent_runtimes.loop.apps.record import INCLUDED_BY, AppRecorder
from agent_runtimes.loop.apps.rules import Decision
from agent_runtimes.specs.ui_plugins import SurfaceComponents
from agent_runtimes.types import AppSpec

# --- what the user sees ---------------------------------------------------------


@dataclass(frozen=True)
class Message:
    """A message the application wrote to the user.

    Delivered again under the same id, it is that message changed
    (`Message.update`); `Removed` takes it away (`Message.remove`).
    """

    id: str
    session_id: str
    text: str
    author: str
    """Who wrote it: the application's name unless said."""
    components: Tuple[Dict[str, Any], ...] = ()
    """What it shows besides its text: components of the catalog (LOOP P-04)."""
    data: Mapping[str, Any] = field(default_factory=dict)
    """What its components bound to a path read (a Table's rows, a Chart's points)."""
    _session: Optional["Session"] = field(default=None, compare=False, repr=False)

    def _sent_by(self) -> "Session":
        if self._session is None:
            raise ValueError(f"Message {self.id} was not sent by a session.")
        return self._session

    async def update(
        self,
        text: str,
        *,
        show: Optional[Sequence[Mapping[str, Any]]] = None,
        data: Optional[Mapping[str, Any]] = None,
    ) -> "Message":
        """Change what the message says, where the user reads it (LOOP P-15).

        Parameters
        ----------
        text : str
            What it says now.
        show : sequence of components, optional
            What it shows now; what it showed when unsaid.
        data : mapping, optional
            What its components read now; what they read when unsaid.

        Returns
        -------
        Message
            The message as it is now.
        """
        return await self._sent_by().update(self, text, show=show, data=data)

    async def remove(self) -> None:
        """Take the message away from the conversation (LOOP P-15)."""
        await self._sent_by().remove(self)


@dataclass(frozen=True)
class Removed:
    """A message taken away from the conversation."""

    message_id: str
    session_id: str


@dataclass(frozen=True)
class Delta:
    """A piece of a message being streamed; the whole `Message` follows it."""

    message_id: str
    session_id: str
    text: str


@dataclass(frozen=True)
class Step:
    """Something the application did, shown as it does it. Steps nest."""

    id: str
    session_id: str
    name: str
    kind: str
    """`run`, `tool`, `model` or `retrieval`."""
    parent_id: Optional[str]
    input: Any
    output: Any
    started_at: datetime
    ended_at: Optional[datetime] = None
    error: str = ""
    """Why it failed, when it did."""


#: What a session delivers to its channel. A step is delivered twice: when it
#: starts, and when it ends (with `ended_at`); a message again when it changed.
Event = Union[Message, Delta, Step, Removed]

STEP_KINDS: Tuple[str, ...] = ("run", "tool", "model", "retrieval")

# --- what the user is asked -----------------------------------------------------


@dataclass(frozen=True)
class TextQuestion:
    """Ask for text. The answer is a `str`."""

    prompt: str


@dataclass(frozen=True)
class ChoiceQuestion:
    """Ask for one of a few options. The answer is the option chosen."""

    prompt: str
    options: Tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.options:
            raise ValueError(f"A choice needs options: {self.prompt!r} has none.")
        object.__setattr__(self, "options", tuple(self.options))


@dataclass(frozen=True)
class FileQuestion:
    """Ask for a file. The answer is an `UploadedFile`."""

    prompt: str
    accept: Tuple[str, ...] = ()
    """Media types (``image/*``) or extensions (``.pdf``); any when empty."""
    max_bytes: int = 20 * 1024 * 1024

    def __post_init__(self) -> None:
        object.__setattr__(self, "accept", tuple(self.accept))


@dataclass(frozen=True)
class FormQuestion:
    """Ask for several values at once. The answer is a `dict` by field name.

    Its ``schema`` is the JSON Schema of a form (LOOP C-16), an object of named
    fields, as an application's settings and a Form block say theirs: the page
    draws it with ``@datalayer/primer-rjsf`` and the answer is checked against it.
    """

    prompt: str
    schema: Mapping[str, Any]

    def __post_init__(self) -> None:
        from agentspecs.apps import form_problems

        problems = form_problems({"id": self.prompt, "schema": self.schema})
        if problems:
            raise ValueError(" ".join(problems))
        object.__setattr__(self, "schema", dict(self.schema))


Question = Union[TextQuestion, ChoiceQuestion, FileQuestion, FormQuestion]


@dataclass(frozen=True)
class UploadedFile:
    """A file the user gave."""

    name: str
    media_type: str
    content: bytes


class AskTimeout(asyncio.TimeoutError):
    """The user did not answer in time."""


class InvalidAnswer(ValueError):
    """An answer that does not answer the question, in a sentence."""


# --- the transport --------------------------------------------------------------


class Channel(Protocol):
    """What a session talks to its user through.

    The page, the terminal, a test: each delivers what the application shows
    and brings back what the user answers. A channel that cannot ask raises
    with a sentence; it never answers for the user.
    """

    async def deliver(self, event: Event) -> None:
        """Show the user a message, a piece of one, or a step."""
        ...

    async def ask(self, session_id: str, question: Question) -> Any:
        """Ask the user, and return their answer as it came."""
        ...


@dataclass
class MemoryChannel:
    """A channel in this process: what is shown is kept, answers are given by `reply`.

    For tests, and for whoever drives an application from Python.
    """

    events: List[Event] = field(default_factory=list)
    """Everything delivered, in order."""

    questions: List[Question] = field(default_factory=list)
    """Everything asked, in order."""

    _answers: Optional[asyncio.Queue[Any]] = field(default=None, init=False)

    def _queue(self) -> asyncio.Queue[Any]:
        if self._answers is None:
            self._answers = asyncio.Queue()
        return self._answers

    def reply(self, answer: Any) -> None:
        """Answer the question being asked, or the next one."""
        self._queue().put_nowait(answer)

    @property
    def messages(self) -> List[Message]:
        """The messages delivered, whole, as they are now: changed, and without those removed."""
        shown: Dict[str, Message] = {}
        for event in self.events:
            if isinstance(event, Message):
                shown[event.id] = event
            elif isinstance(event, Removed):
                shown.pop(event.message_id, None)
        return list(shown.values())

    async def deliver(self, event: Event) -> None:
        """Keep what is shown."""
        self.events.append(event)

    async def ask(self, session_id: str, question: Question) -> Any:
        """Wait for `reply`."""
        self.questions.append(question)
        return await self._queue().get()


# --- the session ----------------------------------------------------------------

#: The step a new step nests in.
_STEP: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "loop_app_step", default=None
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return uuid.uuid4().hex


def _accepted(question: FileQuestion, upload: UploadedFile) -> bool:
    if not question.accept:
        return True
    name = upload.name.lower()
    for pattern in question.accept:
        if pattern.startswith("."):
            if name.endswith(pattern.lower()):
                return True
        elif fnmatch.fnmatchcase(upload.media_type, pattern):
            return True
    return False


def form_values(
    schema: Optional[Mapping[str, Any]],
    given: Mapping[str, Any],
    title: str = "Its settings",
) -> Dict[str, Any]:
    """Check values against a form's schema; the default for the rest (LOOP C-16).

    Parameters
    ----------
    schema : mapping, optional
        The JSON Schema of the form, an object of named fields; none for an
        application without settings, which takes no value.
    given : mapping
        The values given, by field name.
    title : str
        The form, as a person reads it, in the refusal.

    Returns
    -------
    dict
        A value for every field that has one, by name.

    Raises
    ------
    InvalidAnswer
        For a field the form does not have, or a value its schema refuses.
    """
    fields = form_fields(schema)
    unknown = [key for key in given if key not in fields]
    if unknown:
        raise InvalidAnswer(f"There is no field {', '.join(sorted(unknown))}.")
    values: Dict[str, Any] = {**form_defaults(schema), **given}
    if schema is not None:
        refused = refused_by(schema, values, title)
        if refused:
            raise InvalidAnswer(refused)
    return values


def _checked(question: Question, answer: Any) -> Any:
    if isinstance(question, TextQuestion):
        if not isinstance(answer, str):
            raise InvalidAnswer(f"{question.prompt!r} is answered with text.")
        return answer
    if isinstance(question, ChoiceQuestion):
        if answer not in question.options:
            raise InvalidAnswer(
                f"{question.prompt!r} is answered with one of "
                f"{', '.join(question.options)}."
            )
        return answer
    if isinstance(question, FileQuestion):
        if not isinstance(answer, UploadedFile):
            raise InvalidAnswer(f"{question.prompt!r} is answered with a file.")
        if len(answer.content) > question.max_bytes:
            raise InvalidAnswer(
                f"{answer.name} is larger than {question.max_bytes} bytes."
            )
        if not _accepted(question, answer):
            raise InvalidAnswer(
                f"{answer.name} is not one of {', '.join(question.accept)}."
            )
        return answer
    if not isinstance(answer, Mapping):
        raise InvalidAnswer(f"{question.prompt!r} is answered with a form.")
    return form_values(question.schema, answer, question.prompt)


async def _text_of(
    tokens: Union[AsyncIterable[str], Iterable[str]],
) -> AsyncIterator[str]:
    if isinstance(tokens, AsyncIterable):
        async for token in tokens:
            yield token
    else:
        for token in tokens:
            yield token


ALLOW = "Allow"
REFUSE = "Refuse"


class Session:
    """One conversation of one user with an application.

    Made by the host that runs the application and handed to its code;
    never made by that code.
    """

    def __init__(
        self,
        app: AppSpec,
        channel: Channel,
        *,
        agent_factory: AgentFactory,
        recorder: AppRecorder,
        id: Optional[str] = None,
        user: Optional[str] = None,
        state: Optional[Dict[str, Any]] = None,
        settings: Optional[Mapping[str, Any]] = None,
        agent_maker: Optional[Callable[["Session"], AppAgent]] = None,
        modes: Optional[Mapping[str, Any]] = None,
    ) -> None:
        self.app = app
        """The application, as its spec says it."""
        self.id = id or _new_id()
        """The session's id: its conversation, and its record."""
        self.user = user
        """Who the user is, when the host knows."""
        self.state: Dict[str, Any] = dict(state or {})
        """What the application keeps across the turns of this session."""
        self.channel = channel
        self._settings = form_values(app.interface.settings, settings or {})
        self._modes = mode_choice(app, modes)
        self._agent_factory = agent_factory
        self._agent_maker = agent_maker
        self._recorder = recorder
        self._agent: Optional[AppAgent] = None
        self._removed: set[str] = set()

    # --- what the user set -----------------------------------------------------

    @property
    def settings(self) -> Dict[str, Any]:
        """The user's settings for this session, by id; a copy."""
        return dict(self._settings)

    def _update_settings(self, values: Mapping[str, Any]) -> Dict[str, Any]:
        updated = form_values(self.app.interface.settings, {**self._settings, **values})
        self._settings = updated
        return dict(updated)

    @property
    def modes(self) -> Dict[str, str]:
        """The option of each of the application's modes the user is in, by mode id; a copy (LOOP P-19)."""
        return dict(self._modes)

    def _update_modes(self, chosen: Mapping[str, Any]) -> Dict[str, str]:
        """The modes the page sent with a run, checked and kept: the agent's next run is told them."""
        self._modes = mode_choice(self.app, {**self._modes, **chosen})
        return dict(self._modes)

    # --- writing to the user ---------------------------------------------------

    @property
    def ui(self) -> SurfaceComponents:
        """Every component of the catalog as a typed call, for an answer to show (LOOP P-04).

        ``await session.send("Here they are.", show=[session.ui.table("runs",
        columns=[...], rows=[...])])``: the same components, checked against
        the same JSON Schema, as ``app.ui`` places on the application's
        surface and the Canvas places — one catalog for the three flavors.
        """
        return SurfaceComponents(component_node)

    async def send(
        self,
        text: str,
        *,
        author: Optional[str] = None,
        show: Sequence[Mapping[str, Any]] = (),
        data: Optional[Mapping[str, Any]] = None,
    ) -> Message:
        """Write a message to the user.

        Parameters
        ----------
        text : str
            The message.
        author : str, optional
            Who wrote it; the application's name when unsaid.
        show : sequence of components
            What it shows besides its text: components of the catalog
            (``session.ui.<component>(...)``), each carrying its values,
            drawn under the text in the order given (LOOP P-04).
        data : mapping, optional
            What its components bound to a path read:
            ``session.ui.table("runs", columns=[...], rows={"path": "/runs"})``
            with ``data={"runs": [...]}``.

        Returns
        -------
        Message
            The message as delivered.

        Raises
        ------
        ValueError
            For a component the catalog does not have, or properties its
            schema refuses.
        """
        message = Message(
            _new_id(),
            self.id,
            text,
            author or self.app.name,
            answer_components(show),
            dict(data or {}),
            self,
        )
        await self.channel.deliver(message)
        return message

    def _own(self, message: Message) -> None:
        if message.session_id != self.id:
            raise ValueError(
                f"Message {message.id} is session {message.session_id}'s, not {self.id}'s."
            )
        if message.id in self._removed:
            raise ValueError(f"Message {message.id} was removed.")

    async def update(
        self,
        message: Message,
        text: str,
        *,
        show: Optional[Sequence[Mapping[str, Any]]] = None,
        data: Optional[Mapping[str, Any]] = None,
    ) -> Message:
        """Change what a message of this session says, in place (LOOP P-15).

        ``await message.update(text)`` says the same.

        Parameters
        ----------
        message : Message
            A message this session sent.
        text : str
            What it says now.
        show : sequence of components, optional
            What it shows now; what it showed when unsaid, nothing when empty.
        data : mapping, optional
            What its components read now; what they read when unsaid.

        Returns
        -------
        Message
            The message as it is now: the same id, and author.
        """
        self._own(message)
        changed = replace(
            message,
            text=text,
            components=message.components if show is None else answer_components(show),
            data=message.data if data is None else dict(data),
            _session=self,
        )
        await self.channel.deliver(changed)
        return changed

    async def remove(self, message: Message) -> None:
        """Take a message of this session away from the conversation (LOOP P-15).

        ``await message.remove()`` says the same; a removed message cannot be
        changed again.

        Parameters
        ----------
        message : Message
            A message this session sent.
        """
        self._own(message)
        self._removed.add(message.id)
        await self.channel.deliver(Removed(message.id, self.id))

    async def stream(
        self,
        tokens: Union[AsyncIterable[str], Iterable[str]],
        *,
        author: Optional[str] = None,
        show: Sequence[Mapping[str, Any]] = (),
        data: Optional[Mapping[str, Any]] = None,
    ) -> Message:
        """Write a message to the user as it comes, piece by piece.

        ``await session.stream(session.agent.stream(text))`` shows the agent's
        answer as the model writes it.

        Parameters
        ----------
        tokens : iterable or async iterable of str
            The pieces of the message, in order.
        author : str, optional
            Who wrote it; the application's name when unsaid.
        show : sequence of components
            What it shows under its text once it is whole (LOOP P-04).
        data : mapping, optional
            What its components bound to a path read.

        Returns
        -------
        Message
            The whole message, delivered after its last piece.
        """
        components = answer_components(show)
        message_id = _new_id()
        pieces: List[str] = []
        async for token in _text_of(tokens):
            pieces.append(token)
            await self.channel.deliver(Delta(message_id, self.id, token))
        message = Message(
            message_id,
            self.id,
            "".join(pieces),
            author or self.app.name,
            components,
            dict(data or {}),
            self,
        )
        await self.channel.deliver(message)
        return message

    @asynccontextmanager
    async def step(
        self, name: str, *, kind: str = "run", input: Any = None
    ) -> AsyncIterator["StepOutput"]:
        """Show the user what the application is doing, while it does it.

        ``async with session.step("Searching") as step: step.output = found``.
        A step opened inside another is nested in it.

        Parameters
        ----------
        name : str
            What it is doing, in a few words.
        kind : str
            ``run``, ``tool``, ``model`` or ``retrieval``.
        input : Any, optional
            What it started from.

        Yields
        ------
        StepOutput
            Where its output is set.
        """
        if kind not in STEP_KINDS:
            raise ValueError(f"A step is one of {', '.join(STEP_KINDS)}, not {kind!r}.")
        started = Step(
            id=_new_id(),
            session_id=self.id,
            name=name,
            kind=kind,
            parent_id=_STEP.get(),
            input=input,
            output=None,
            started_at=_now(),
        )
        await self.channel.deliver(started)
        holder = StepOutput()
        token = _STEP.set(started.id)
        try:
            yield holder
        except BaseException as error:
            _STEP.reset(token)
            await self._ended(
                replace(
                    started,
                    output=holder.output,
                    ended_at=_now(),
                    error=str(error) or type(error).__name__,
                )
            )
            raise
        _STEP.reset(token)
        await self._ended(replace(started, output=holder.output, ended_at=_now()))

    async def _ended(self, step: Step) -> None:
        """A step that ended: shown, and kept in the record (LOOP P-16).

        The record is sent when the outermost step ends, with the steps
        nested in it.
        """
        await self.channel.deliver(step)
        self._recorder.start(self.id)
        self._recorder.stepped(step)
        if step.parent_id is None:
            await self._recorder.flush(self.id)

    # --- asking the user -------------------------------------------------------

    async def ask(
        self, question: Union[str, Question], *, timeout: Optional[float] = None
    ) -> Any:
        """Stop and ask the user, then go on with their answer.

        Parameters
        ----------
        question : str or Question
            Text to ask for text; a `ChoiceQuestion`, `FileQuestion` or
            `FormQuestion` for the rest.
        timeout : float, optional
            Seconds to wait; for ever when unsaid.

        Returns
        -------
        Any
            Text, the option chosen, an `UploadedFile`, or a form's values by id.

        Raises
        ------
        AskTimeout
            When the user did not answer in time.
        InvalidAnswer
            When the answer does not answer the question.
        """
        asked: Question = (
            TextQuestion(question) if isinstance(question, str) else question
        )
        try:
            answer = await asyncio.wait_for(
                self.channel.ask(self.id, asked), timeout=timeout
            )
        except asyncio.TimeoutError:
            raise AskTimeout(
                f"{asked.prompt!r} was not answered in {timeout:g} seconds."
            ) from None
        return _checked(asked, answer)

    # --- the record ------------------------------------------------------------

    async def record(
        self, payload: Mapping[str, Any], *, summary: str = "", kind: str = "output"
    ) -> bool:
        """Write to the application's record, and send it at once.

        Kept only when the application's ``record.include`` names the kind.

        Parameters
        ----------
        payload : mapping
            What is kept.
        summary : str
            The entry in a sentence; the payload's keys when unsaid.
        kind : str
            ``output``, ``tool_call``, ``decision``, ``check``, ``approval``,
            ``feedback``, ``turn`` or ``step``.

        Returns
        -------
        bool
            Whether the application keeps entries of that kind.
        """
        if kind not in INCLUDED_BY:
            raise ValueError(
                f"A record entry is one of {', '.join(INCLUDED_BY)}, not {kind!r}."
            )
        self._recorder.start(self.id)
        kept = self._recorder.kept(kind)
        self._recorder.add(
            kind, summary or ", ".join(str(key) for key in payload), dict(payload)
        )
        await self._recorder.flush(self.id)
        return kept

    # --- the agent -------------------------------------------------------------

    @property
    def agent(self) -> AppAgent:
        """The application's agent, in this session: its rules, checks and record on.

        A rule or a Gate that asks the person asks the user of this session.
        On a runtime it is the agent the runtime made for the application,
        with the rules, checks and record it was made with
        (``agent_maker``, LOOP R-04).
        """
        if self._agent is None and self._agent_maker is not None:
            self._agent = self._agent_maker(self)
        if self._agent is None:
            self._agent = AppAgent(
                app=self.app,
                agent=self._agent_factory(self.app),
                session_id=self.id,
                capabilities=app_capabilities(
                    self.app,
                    recorder=self._recorder,
                    agent_id=self.app.agent or None,
                    ask_rule=self._ask_rule,
                    ask_check=self._ask_check,
                ),
            )
        self._agent.mode = mode_effect(self.app, self._modes)
        return self._agent

    async def _allowed(self, sentence: str) -> bool:
        answer = await self.ask(ChoiceQuestion(sentence, (ALLOW, REFUSE)))
        return bool(answer == ALLOW)

    async def _ask_rule(
        self, tool: str, arguments: Dict[str, Any], decision: Decision
    ) -> None:
        if not await self._allowed(sentence_of(decision)):
            raise AppRuleBlockedError(decision)

    async def _ask_check(
        self, tool: str, arguments: Dict[str, Any], sentence: str
    ) -> None:
        if not await self._allowed(sentence):
            raise AppCheckBlockedError(sentence)


@dataclass
class StepOutput:
    """Where a step's output is set while it runs."""

    output: Any = None


async def call(handler: Any, *args: Any) -> Any:
    """Call a handler, sync or async alike.

    Parameters
    ----------
    handler : callable
        The handler.
    *args : Any
        What it is given.

    Returns
    -------
    Any
        What it returned.
    """
    result = handler(*args)
    if inspect.isawaitable(result):
        result = await result
    return result


__all__ = [
    "ALLOW",
    "REFUSE",
    "STEP_KINDS",
    "AskTimeout",
    "Channel",
    "ChoiceQuestion",
    "Delta",
    "Event",
    "FileQuestion",
    "FormQuestion",
    "InvalidAnswer",
    "MemoryChannel",
    "Message",
    "Question",
    "Removed",
    "Session",
    "Step",
    "StepOutput",
    "TextQuestion",
    "UploadedFile",
    "call",
    "form_values",
]

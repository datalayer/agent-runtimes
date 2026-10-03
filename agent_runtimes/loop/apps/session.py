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
test. Until the session API carries it (LOOP R-04), the one channel there is
lives in this process (`MemoryChannel`).
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
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError, sentence_of
from agent_runtimes.loop.apps.guards import AppCheckBlockedError
from agent_runtimes.loop.apps.record import INCLUDED_BY, AppRecorder
from agent_runtimes.loop.apps.rules import Decision
from agent_runtimes.types import AppSettingSpec, AppSpec

# --- what the user sees ---------------------------------------------------------


@dataclass(frozen=True)
class Message:
    """A message the application wrote to the user."""

    id: str
    session_id: str
    text: str
    author: str
    """Who wrote it: the application's name unless said."""


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
#: starts, and when it ends (with `ended_at`).
Event = Union[Message, Delta, Step]

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
    """Ask for several values at once. The answer is a `dict` by field id.

    Its fields are the inputs of an application's settings.
    """

    prompt: str
    fields: Tuple[AppSettingSpec, ...]

    def __post_init__(self) -> None:
        if not self.fields:
            raise ValueError(f"A form needs fields: {self.prompt!r} has none.")
        object.__setattr__(self, "fields", tuple(self.fields))


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
        """The messages delivered, whole."""
        return [event for event in self.events if isinstance(event, Message)]

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


def _form_value(item: AppSettingSpec, value: Any) -> Any:
    if item.type == "select":
        if value not in item.options:
            raise InvalidAnswer(f"{item.label} is one of {', '.join(item.options)}.")
        return value
    if item.type == "toggle":
        if not isinstance(value, bool):
            raise InvalidAnswer(f"{item.label} is on or off.")
        return value
    if item.type in ("slider", "number"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise InvalidAnswer(f"{item.label} is a number.")
        if item.min is not None and value < item.min:
            raise InvalidAnswer(f"{item.label} is at least {item.min:g}.")
        if item.max is not None and value > item.max:
            raise InvalidAnswer(f"{item.label} is at most {item.max:g}.")
        return value
    if not isinstance(value, str):
        raise InvalidAnswer(f"{item.label} is text.")
    return value


def form_values(
    fields: Sequence[AppSettingSpec], given: Mapping[str, Any]
) -> Dict[str, Any]:
    """Check values for fields against their inputs; the default for the rest.

    Parameters
    ----------
    fields : sequence of AppSettingSpec
        The fields.
    given : mapping
        The values given, by field id.

    Returns
    -------
    dict
        A value for every field that has one, by id.

    Raises
    ------
    InvalidAnswer
        For a field that does not exist, or a value its input does not take.
    """
    by_id = {item.id: item for item in fields}
    unknown = [key for key in given if key not in by_id]
    if unknown:
        raise InvalidAnswer(f"There is no field {', '.join(sorted(unknown))}.")
    values: Dict[str, Any] = {}
    for item in fields:
        if item.id in given:
            values[item.id] = _form_value(item, given[item.id])
        elif item.default is not None:
            values[item.id] = item.default
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
    return form_values(question.fields, answer)


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
        self._agent_factory = agent_factory
        self._recorder = recorder
        self._agent: Optional[AppAgent] = None

    # --- what the user set -----------------------------------------------------

    @property
    def settings(self) -> Dict[str, Any]:
        """The user's settings for this session, by id; a copy."""
        return dict(self._settings)

    def _update_settings(self, values: Mapping[str, Any]) -> Dict[str, Any]:
        updated = form_values(self.app.interface.settings, {**self._settings, **values})
        self._settings = updated
        return dict(updated)

    # --- writing to the user ---------------------------------------------------

    async def send(self, text: str, *, author: Optional[str] = None) -> Message:
        """Write a message to the user.

        Parameters
        ----------
        text : str
            The message.
        author : str, optional
            Who wrote it; the application's name when unsaid.

        Returns
        -------
        Message
            The message as delivered.
        """
        message = Message(_new_id(), self.id, text, author or self.app.name)
        await self.channel.deliver(message)
        return message

    async def stream(
        self,
        tokens: Union[AsyncIterable[str], Iterable[str]],
        *,
        author: Optional[str] = None,
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

        Returns
        -------
        Message
            The whole message, delivered after its last piece.
        """
        message_id = _new_id()
        pieces: List[str] = []
        async for token in _text_of(tokens):
            pieces.append(token)
            await self.channel.deliver(Delta(message_id, self.id, token))
        message = Message(message_id, self.id, "".join(pieces), author or self.app.name)
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
            await self.channel.deliver(
                replace(
                    started,
                    output=holder.output,
                    ended_at=_now(),
                    error=str(error) or type(error).__name__,
                )
            )
            raise
        _STEP.reset(token)
        await self.channel.deliver(
            replace(started, output=holder.output, ended_at=_now())
        )

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
            ``output``, ``tool_call``, ``decision``, ``check``, ``approval``
            or ``feedback``.

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
        """
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
    "Session",
    "Step",
    "StepOutput",
    "TextQuestion",
    "UploadedFile",
    "call",
    "form_values",
]

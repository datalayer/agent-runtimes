# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tools the page runs, and the runs that only carry what they answered.

**A tool of the page** runs in the browser of whoever is looking and changes
only their screen: the chat's title bar (``set_*_header``), a deck or a sheet
built in the conversation, a side panel, a notice. It is one of the run's
AG-UI frontend tools (its ``tools``, :func:`use_run_frontend_tools`) or of its
spec's frontend tool sets and header UIs (:func:`page_tools_of`), and the
tool called is the one the page runs (its definition's ``kind`` is
``external``): a tool of the server under the same name is not one. A
visitor without an account calls a tool of the page as anybody does
(`enforcement.AppRulesCapability`), since it reads nothing and acts on
nothing beyond their own screen.

**A turn is a person's message.** Each answer of a page tool comes back as a
run of its own; such a run, carrying nothing new but the results of the calls
the run before asked of the page, is the same turn (:class:`PageCalls`): a
deck built with three tools is one of a visitor's turns. It may carry the
run's calls of the server's tools too, with what they answered, so that the
model sees what it already did: each only as the run answered it. Anything else is a
turn — a message, a result for a call the run before never made, the same
result sent twice, a conversation changed before it — so that nothing passes
for free that a person said.

**Ten rounds a message.** A person's message takes ten runs of the
page's answers at most, for everybody: the eleventh ends the turn in a
sentence, the agent not run again (:data:`TOO_MANY_ROUNDS`). A deck's
outline goes in one or two calls (``deck_add_slides``), not a run a slide.

**A tool failing twice ends the turn.** The same page tool answering with an
error twice in one turn (an AG-UI tool message's ``error``) ends it in a
sentence that names the tool and what failed, rather than running the agent
again (:data:`FAILED_TWICE`), for everybody.
"""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple

from pydantic import TypeAdapter, ValidationError

__all__ = [
    "FAILED_TWICE",
    "PageCalls",
    "ROUNDS_A_MESSAGE",
    "TOO_MANY_ROUNDS",
    "leave_run_frontend_tools",
    "page_tools_of",
    "run_frontend_tools",
    "runs_in_the_page",
    "use_run_frontend_tools",
]

#: What ends a turn whose page tool failed twice: the tool, and what it said.
FAILED_TWICE = "`{tool}` failed twice in this turn, so it was not run again: {error}"

#: The rounds of the page's tools a person's message takes at most: runs
#: that carry what the page's tools answered. The next ends the turn.
ROUNDS_A_MESSAGE = 10

#: What ends a turn past its rounds: how many, and the tool not called again.
TOO_MANY_ROUNDS = (
    "The page's tools have run in {rounds} rounds for this message, the most "
    "one message takes, so the turn ends here and `{tool}` is not called "
    "again. Send a message to go on."
)

#: How often the same page tool may fail in a turn before the turn ends.
FAILURES_A_TURN = 2

#: What is said of a failure at most, of what the page answered.
ERROR_AT_MOST = 300

#: The AG-UI frontend tools of the run under way, by name.
_RUN_FRONTEND_TOOLS: ContextVar[frozenset[str]] = ContextVar(
    "run_frontend_tools", default=frozenset()
)


def use_run_frontend_tools(names: Iterable[str]) -> Any:
    """Say the run under way's AG-UI frontend tools; answer the token to reset it."""
    return _RUN_FRONTEND_TOOLS.set(frozenset(str(name) for name in names if name))


def leave_run_frontend_tools(token: Any) -> None:
    _RUN_FRONTEND_TOOLS.reset(token)


def run_frontend_tools() -> frozenset[str]:
    """The run under way's AG-UI frontend tools, by name."""
    return _RUN_FRONTEND_TOOLS.get()


def tool_names_of(tools: Any) -> List[str]:
    """The names of an AG-UI run's ``tools``, as the request sends them."""
    if not isinstance(tools, Sequence) or isinstance(tools, (str, bytes)):
        return []
    return [
        str(tool.get("name"))
        for tool in tools
        if isinstance(tool, Mapping) and isinstance(tool.get("name"), str)
    ]


def page_tools_of(app: Any) -> Set[str]:
    """The tools of the page an application's spec declares, by name.

    Its agent's frontend tool sets that name their tools, the tool of each
    header UI it places, and the tools of a frontend tool set its UI names
    by the same id (``notices``, ``page-deck``, ``side-panels``…). A set
    that grants ``all`` names none.
    """
    from agent_runtimes.specs.agents import get_agent_spec
    from agent_runtimes.specs.toolsets import resolve_toolset
    from agent_runtimes.specs.ui import get_ui

    sets: List[str] = []
    agent = get_agent_spec(str(getattr(app, "agent", "") or ""))
    if agent is not None:
        sets.extend(str(each) for each in agent.frontend_tools or [])
    names: Set[str] = set()
    for choice in getattr(app, "ui", None) or []:
        plugin = str(getattr(choice, "plugin", "") or "")
        sets.append(plugin)
        ui = get_ui(plugin)
        header = ui.header if ui is not None else None
        tool = header.get("tool") if isinstance(header, Mapping) else None
        if isinstance(tool, str) and tool:
            names.add(tool)
    for each in sets:
        granted = resolve_toolset(each)
        if granted:
            names.update(granted)
    return names


def runs_in_the_page(app: Any, tool_name: str, tool_def: Any) -> bool:
    """Whether a call is of a tool the page runs.

    The tool called is run by the page (its definition's ``kind``,
    ``external``, as the run resolved it), and the run or the spec declares
    it a tool of the page: never the name alone. A host page's function
    (``host_…``) is not one.
    """
    from agent_runtimes.apps.host_user import HOST_TOOL_PREFIX

    if getattr(tool_def, "kind", None) != "external":
        return False
    if tool_name.startswith(HOST_TOOL_PREFIX):
        # A function the host page offers acts on the host's own system:
        # decided by its rules (`enforcement._decide_host`).
        return False
    return tool_name in run_frontend_tools() or tool_name in page_tools_of(app)


# --- the runs that only carry what the page answered --------------------------------


def _messages(raw: Sequence[Any]) -> Optional[List[Any]]:
    """A run's messages as AG-UI's models, or ``None`` when one is not one."""
    from ag_ui.core import Message

    adapter: TypeAdapter[Any] = TypeAdapter(Message)
    try:
        return [adapter.validate_python(message) for message in raw]
    except ValidationError:
        return None


def _said(messages: Sequence[Any]) -> Tuple[str, ...]:
    """What the person said in a conversation, message by message."""
    from ag_ui.core import UserMessage

    said: List[str] = []
    for message in messages:
        if not isinstance(message, UserMessage):
            continue
        content = message.content
        said.append(content if isinstance(content, str) else repr(content))
    return tuple(said)


@dataclass
class Answered:
    """What a run carries of the page's answers, when that is all it carries."""

    results: List[Tuple[str, str, str]] = field(default_factory=list)
    """Each result: the call's id, its tool, and its error (``""`` for none)."""


@dataclass
class PageCalls:
    """What a session's last run asked of its page, and what failed in its turn."""

    asked: Dict[str, str] = field(default_factory=dict)
    """The calls of page tools the last run made: its tool, by call id."""

    said: Optional[Tuple[str, ...]] = None
    """What the person had said as the last run started."""

    done: Dict[str, str] = field(default_factory=dict)
    """The calls of the server's tools the last run made: what each answered,
    by call id, as the run streamed it."""

    declared: frozenset[str] = frozenset()
    """The page's tools the last run declared."""

    _started: Dict[str, str] = field(default_factory=dict, repr=False)
    """The server's calls of the run under way, by id, until they answer."""

    failures: Dict[str, int] = field(default_factory=dict)
    """How often each page tool failed in the turn under way."""

    rounds: int = 0
    """The runs of the turn under way that carried the page's answers."""

    def begin(self, raw: Sequence[Any], tools: Any) -> Optional[Answered]:
        """Begin a run: what it carries of the page's answers, or ``None`` for a turn.

        A run is the turn under way only when its new messages are all
        results of calls the last run made of the page, each once, and what
        the person said is what they had said then. Whatever it is, what the
        last run asked is forgotten: a result is taken once.
        """
        asked, done, said = self.asked, self.done, self.said
        self.asked, self.done, self._started = {}, {}, {}
        self.declared = frozenset(tool_names_of(tools))
        messages = _messages(raw)
        self.said = _said(messages) if messages is not None else None
        answered = self._answered(messages, asked, done, said)
        if answered is None:
            self.failures = {}
            self.rounds = 0
        else:
            self.rounds += 1
        return answered

    @staticmethod
    def _answered(
        messages: Optional[List[Any]],
        asked: Mapping[str, str],
        done: Mapping[str, str],
        said: Optional[Tuple[str, ...]],
    ) -> Optional[Answered]:
        from ag_ui.core import AssistantMessage, ToolMessage

        if not messages or not asked or said is None or _said(messages) != said:
            return None
        trailing: List[Any] = []
        for message in reversed(messages):
            if not isinstance(message, ToolMessage):
                break
            trailing.append(message)
        before = len(messages) - len(trailing) - 1
        if (
            not trailing
            or before < 0
            or not isinstance(messages[before], AssistantMessage)
        ):
            return None
        ids = [message.tool_call_id for message in trailing]
        if len(set(ids)) != len(ids) or not any(each in asked for each in ids):
            return None
        for message in trailing:
            if message.tool_call_id in asked:
                continue
            # A call of the server's, carried so the model sees what it did:
            # only as the run answered it, word for word.
            if done.get(message.tool_call_id) != message.content:
                return None
        return Answered(
            [
                (message.tool_call_id, asked[message.tool_call_id], message.error or "")
                for message in reversed(trailing)
                if message.tool_call_id in asked
            ]
        )

    def heard(self, event: Mapping[str, Any]) -> None:
        """An event of the run: its calls of the page's tools, and what the
        server's own answered, are remembered.
        """
        kind = event.get("type")
        call = event.get("toolCallId")
        if not isinstance(call, str):
            return
        if kind == "TOOL_CALL_START":
            name = event.get("toolCallName")
            if not isinstance(name, str):
                return
            if name in self.declared:
                self.asked[call] = name
            else:
                self._started[call] = name
        elif kind == "TOOL_CALL_RESULT" and call in self._started:
            content = event.get("content")
            if isinstance(content, str):
                self.done[call] = content

    def too_many_rounds(self, answered: Answered) -> str:
        """The sentence that ends the turn past its rounds of page tools, or ``""``."""
        if self.rounds <= ROUNDS_A_MESSAGE:
            return ""
        tools = list(dict.fromkeys(tool for _, tool, _ in answered.results))
        return TOO_MANY_ROUNDS.format(
            rounds=ROUNDS_A_MESSAGE, tool="`, `".join(tools) or "the page's tool"
        )

    def failed_twice(self, answered: Answered) -> str:
        """The sentence that ends the turn when a page tool failed twice in it, or ``""``."""
        for _, tool, error in answered.results:
            if not error:
                continue
            self.failures[tool] = self.failures.get(tool, 0) + 1
            if self.failures[tool] >= FAILURES_A_TURN:
                said = " ".join(error.split())[:ERROR_AT_MOST]
                return FAILED_TWICE.format(tool=tool, error=said)
        return ""

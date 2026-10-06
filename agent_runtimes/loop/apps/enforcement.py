# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's rules, enforced before every tool call.

`AppRulesCapability` is a pydantic-ai capability. Attached to the agent of an
application, it runs before each tool the agent calls and does what the
application's rules say — do it, ask the person first, or leave it to them —
on what the tool does and on what the call asks of it (`rules.decision_for`).
The interface only shows the decision; this is where it is taken.

What a call is, before it is decided:

- a tool of an MCP server, by its runtime name — `server__tool`, or the tool's
  bare name when one connected server serves it;
- a tool of the catalogue, by its id or by the method that runs it;
- `call_tool`, which names the MCP tool it calls;
- `execute_code` and `run_skill_script`, which run code on the application's
  computer: allowed only when its permissions turn the shell on, and then
  every MCP tool the code names is decided too — without its arguments,
  which code does not show, so for the worst that tool can do;
- the tools of its files (`list_computer_files`…), which read or write;
- a few tools of the runtime itself that only look (`search_tools`,
  `load_skill`…), which are reading;
- proposing a skill and reading the approved ones (`propose_skill`,
  `use_learned_skill`, LOOP R-26), which its owner decides, and are reading;
- the tools that compose an output besides words (`write_notebook`), which
  touch nothing outside the run and are reading too — offered only in a run
  whose caller accepts their format (`agent_runtimes.output.formats`).

Anything else is unknown, and unknown is left to the person, unless the
session says what it does (`extra_classes`).

Before that, the agent is given only the tools of its servers that the
application's connections give, at their level (`prepare_tools`,
`rules.gives`): a connection that only reads carries no tool that writes. And
only the tools of the parts of its computer its permissions turn on — browse,
files, shell, each off until it is turned on (`computer.computer_gives`, LOOP
R-23): its shell off, it is shown no tool that runs code; its files off, none
of its files; there is no browser tool at all yet. The tools of its files are
given here (`get_toolset`), and while a person has taken its computer over,
each call to a tool of its computer waits until they hand it back.

Pure enough to test: the person is asked through `ask`, an awaitable the
runtime gives (by default the tool-approval path that exists), and every
decision is handed to `record` before it is acted on.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import (
    Any,
    Awaitable,
    Callable,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Sequence,
    Set,
    Tuple,
)

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.guardrails.common import GuardrailBlockedError
from agent_runtimes.loop.apps.computer import (
    FILE_CLASSES,
    SHELL_TOOLS,
    computer_gives,
    computer_toolset,
    part_of,
    wait_until_handed_back,
)
from agent_runtimes.loop.apps.grants import Approval, Granted
from agent_runtimes.loop.apps.guards import Answered, asked_and_answered
from agent_runtimes.loop.apps.rules import (
    ASK_FIRST,
    BEHAVIOURS,
    DO_IT,
    IF_ASKED,
    LEAVE_TO_ME,
    UNCLASSED,
    Decision,
    decision_for,
    gives,
    matches,
)
from agent_runtimes.loop.apps.saving import APPROVE_AND_SAVE, DRAFT_LIMIT, SAVE_TOOL
from agent_runtimes.loop.apps.visitors import visitor_refusal
from agent_runtimes.output.formats import OUTPUT_TOOLS, outputs_toolset, tool_given
from agent_runtimes.specs.actions import BACKEND_TOOL_ACTIONS, SERVER_ACTIONS
from agent_runtimes.types import AppSpec

#: Tools of the runtime itself that only look: discovering tools and skills.
READING_TOOLS: frozenset[str] = frozenset(
    {
        "list_tool_names",
        "search_tools",
        "get_tool_details",
        "list_servers",
        "list_skills",
        "load_skill",
        "read_skill_resource",
    }
)

#: Tools that run code on the application's computer.
CODE_TOOLS: frozenset[str] = SHELL_TOOLS

#: Why a call was decided as it was, beside the reasons of `rules`.
NO_SHELL = "no_shell"

#: A visitor without an account's turn, which only reads (LOOP R-30).
SIGNED_OUT = "signed_out"

#: Background work with nobody present, which only reads unless a rule says otherwise (LOOP R-16).
UNATTENDED = "unattended"

#: What it says when background work would act on the world unasked.
UNATTENDED_SENTENCE = (
    "Nobody is here: in work it does on its own it only reads, unless one of "
    "its rules says otherwise. `{tool}` can {does}, and no rule of its own covers it."
)

#: What the person is asked with: the tool, its arguments, the decision.
Ask = Callable[[str, Dict[str, Any], Decision], Awaitable[Any]]

#: Told that the person is asked: the tool, and why, in a sentence.
Notify = Callable[[str, str], Awaitable[None]]

#: What is told of every decision, before it is acted on.
Record = Callable[["Enforced"], None]


class AppRuleBlockedError(GuardrailBlockedError):
    """A tool call the application's rules leave to the person."""

    def __init__(self, decision: Decision, sentence: str = ""):
        self.decision = decision
        super().__init__(sentence or sentence_of(decision))


def sentence_of(decision: Decision) -> str:
    """A decision as a sentence, its own reasons included."""
    if decision.because == NO_SHELL:
        return (
            f"`{decision.tool}` runs code on the application's computer, "
            "and its shell is off: it is left to you."
        )
    if decision.because == APPROVE_AND_SAVE:
        return (
            "It wants to keep this as a page of your Space: read it, then "
            "Approve and save, or Decline and nothing is kept."
        )
    return decision.sentence


@dataclass(frozen=True)
class Enforced:
    """What was decided about one call, and about what it calls."""

    tool_name: str
    """The tool the agent called, as the runtime names it."""

    decision: Decision
    """The decision that is acted on: the strictest of `parts`."""

    parts: Tuple[Decision, ...] = ()
    """For code, `call_tool` and the like: what each tool it reaches was decided."""

    approved: Optional[Approval] = None
    """For *Do it if I asked*: the approval given in advance that covers it (U-25)."""


def _id_of(ref: str) -> str:
    base, _, version = str(ref).rpartition(":")
    return base if base and "." in version else str(ref)


def _catalogue_ids_by_name() -> Dict[str, Set[str]]:
    """The tools of the catalogue, by their id and by the method that runs them."""
    from agent_runtimes.specs.backend_tools import BACKEND_TOOL_CATALOG

    names: Dict[str, Set[str]] = {}
    for identity, spec in BACKEND_TOOL_CATALOG.items():
        names.setdefault(identity, set()).add(identity)
        method = getattr(getattr(spec, "runtime", None), "method", None)
        if isinstance(method, str) and method:
            names.setdefault(method, set()).add(identity)
    return names


@dataclass
class AppRulesCapability(AbstractCapability[Any]):
    """Do what an application's rules say, before each tool it calls."""

    app: AppSpec
    """The application whose rules are enforced."""

    agent_id: Optional[str] = None

    app_uid: str = ""
    """The application as the platform knows it, when it does: what its
    approvals are asked under, beside its id (LOOP U-19)."""

    ask: Optional[Ask] = None
    """How the person is asked; the tool-approval path when unsaid."""

    record: Optional[Record] = None
    """Told of every decision, before it is acted on."""

    notify: Optional[Notify] = None
    """Told when the person is asked through the tool-approval path: the
    application's channels (LOOP R-37)."""

    granted: Optional[Granted] = None
    """What the person approved in advance, read before *Do it if I asked*
    asks them (LOOP U-25); with none, it asks."""

    extra_classes: Dict[str, List[str]] = field(default_factory=dict)
    """What tools the catalogue does not know do, by runtime name."""

    known_mcp_tools: Optional[Callable[[], Set[str]]] = None
    """The MCP tool names the runtime knows (`server__tool` among them)."""

    answered: Optional[Answered] = None
    """Told what came of asking the person: the record's approval (LOOP R-07)."""

    unattended: Optional[Callable[[], bool]] = None
    """Whether the current run has nobody present — a session woken by a
    schedule (LOOP R-14): then it only reads, unless a rule says otherwise
    (R-16)."""

    _catalogue: Dict[str, Set[str]] = field(
        default_factory=dict, init=False, repr=False
    )

    # --- what a call is ----------------------------------------------------------

    def _known(self) -> Set[str]:
        if self.known_mcp_tools is not None:
            return self.known_mcp_tools()
        try:
            from agent_runtimes.streams.loop import get_known_mcp_tool_names

            return get_known_mcp_tool_names()
        except Exception:
            return set()

    def _connected_servers(self) -> List[str]:
        return [_id_of(connection.server) for connection in self.app.connections]

    def mcp_ref(self, name: str, server_hint: Optional[str] = None) -> Optional[str]:
        """An MCP tool's runtime name as `server.tool`, or None when it cannot be told."""
        name = name.strip()
        if "__" in name:
            server, _, tool = name.partition("__")
            return f"{_catalogue_server(server)}.{tool}"
        if server_hint:
            return f"{_catalogue_server(server_hint)}.{name}"
        # A server the application connects to first; then any of the catalogue.
        for servers in (self._connected_servers(), list(SERVER_ACTIONS)):
            serving = [server for server in servers if _serves(server, name)]
            if len(serving) == 1:
                return f"{serving[0]}.{name}"
            if len(serving) > 1:
                return None
        prefixed = {
            known.partition("__")[0]
            for known in self._known()
            if "__" in known and known.partition("__")[2] == name
        }
        if len(prefixed) == 1:
            return f"{_catalogue_server(next(iter(prefixed)))}.{name}"
        return None

    def _is_mcp_tool(self, name: str) -> bool:
        if "__" in name:
            return True
        known = self._known()
        if name in known or any(
            "__" in item and item.partition("__")[2] == name for item in known
        ):
            return True
        return any(_serves(server, name) for server in self._connected_servers())

    def _catalogue_ids(self, name: str) -> Set[str]:
        if not self._catalogue:
            try:
                self._catalogue = _catalogue_ids_by_name()
            except Exception:
                self._catalogue = {}
        found = set(self._catalogue.get(name, set()))
        if name in BACKEND_TOOL_ACTIONS:
            found.add(name)
        return found

    # --- deciding ----------------------------------------------------------------

    def decide(self, tool_name: str, args: Mapping[str, Any]) -> Enforced:
        """What the application does about a call: the decision, and its parts.

        What reaches the outside world is resolved first — an MCP tool, the
        tool `call_tool` calls, the tools code names — so that nothing the
        session says of a tool (`extra_classes`) can grant a connection the
        application does not have.
        """
        if tool_name == "call_tool":
            requested = args.get("tool_name") or args.get("tool")
            inner = args.get("arguments")
            if not isinstance(requested, str) or not requested.strip():
                return Enforced(tool_name, _unclassed(tool_name))
            part = self._decide_mcp(
                requested, inner if isinstance(inner, Mapping) else None
            )
            return Enforced(tool_name, part, (part,))
        if tool_name in CODE_TOOLS:
            return self._decide_code(tool_name, args)
        if self._is_mcp_tool(tool_name):
            return Enforced(tool_name, self._decide_mcp(tool_name, args))
        if tool_name in READING_TOOLS or tool_name in OUTPUT_TOOLS:
            return Enforced(
                tool_name, decision_for(self.app, tool_name, classes=["read"])
            )
        if tool_name in FILE_CLASSES:
            classes = list(FILE_CLASSES[tool_name])
            return Enforced(
                tool_name, decision_for(self.app, tool_name, classes=classes)
            )
        # A tool of its own, written in its code (LOOP P-06): decided by
        # what it says it does, or by a rule that names it. After an MCP
        # tool, so that no name of its own decides a server's tool.
        if self.app.tool(tool_name) is not None:
            return Enforced(tool_name, decision_for(self.app, tool_name))
        identities = self._catalogue_ids(tool_name)
        if identities:
            parts = tuple(
                decision_for(self.app, identity, arguments=args)
                for identity in sorted(identities)
            )
            return Enforced(
                tool_name, _strictest(parts), parts if len(parts) > 1 else ()
            )
        # A result saved is shown first (LOOP R-24): asked whatever the rules
        # say of writing, and never passed by an approval given in advance;
        # only *Leave it to me* stands, and refuses it.
        if tool_name == SAVE_TOOL and tool_name in self.extra_classes:
            decided = decision_for(self.app, tool_name, classes=["write"])
            if decided.behaviour != LEAVE_TO_ME:
                decided = replace(
                    decided, behaviour=ASK_FIRST, because=APPROVE_AND_SAVE
                )
            return Enforced(tool_name, decided)
        # Only a tool that is neither of a server nor of the catalogue — the
        # runtime's own, or the page's — may be classed by the session.
        if tool_name in self.extra_classes:
            classes = list(self.extra_classes[tool_name])
            return Enforced(
                tool_name, decision_for(self.app, tool_name, classes=classes)
            )
        return Enforced(tool_name, _unclassed(tool_name))

    def _decide_mcp(
        self,
        name: str,
        arguments: Optional[Mapping[str, Any]],
        server_hint: Optional[str] = None,
    ) -> Decision:
        ref = self.mcp_ref(name, server_hint)
        if ref is None:
            return _unclassed(name)
        return decision_for(self.app, ref, arguments=arguments)

    def _decide_code(self, tool_name: str, args: Mapping[str, Any]) -> Enforced:
        if not self.app.permissions.computer.shell:
            refused = Decision(LEAVE_TO_ME, tool_name, ("write",), NO_SHELL)
            return Enforced(tool_name, refused)
        code = args.get("code")
        references: Iterable[Tuple[str, Optional[str]]] = ()
        if isinstance(code, str) and code.strip():
            from agent_runtimes.guardrails.mcp_tools import MCPToolsGuardrailCapability

            references = sorted(
                MCPToolsGuardrailCapability._extract_mcp_references_from_code(code),
                key=lambda pair: (pair[0], pair[1] or ""),
            )
        # What code does to a tool is not shown: each is decided for the worst.
        parts = tuple(
            self._decide_mcp(name, None, server_hint=hint) for name, hint in references
        )
        if not parts:
            return Enforced(
                tool_name, Decision(DO_IT, tool_name, ("write",), "default")
            )
        return Enforced(tool_name, _strictest(parts), parts)

    # --- what it is given --------------------------------------------------------

    def given(self, tool_name: str) -> bool:
        """Whether the agent is given a tool, by its runtime name (LOOP U-15).

        A tool of an MCP server is given by a connection, at its level: one
        that only reads gives only what only reads (`rules.gives`). A tool
        whose server cannot be told is not given: it could never run. A tool
        of its computer is given only when its part is on (LOOP R-23). The
        runtime's own tools and the catalogue's are given, and decided when
        they are called.
        """
        if not computer_gives(self.app, tool_name):
            return False
        if tool_name in OUTPUT_TOOLS:
            # Only in a run whose caller accepts what it composes.
            return tool_given(tool_name)
        if part_of(tool_name) is not None or tool_name in READING_TOOLS:
            return True
        if tool_name == "call_tool" or not self._is_mcp_tool(tool_name):
            return True
        ref = self.mcp_ref(tool_name)
        return ref is not None and gives(self.app, ref)

    async def prepare_tools(
        self, ctx: RunContext[Any], tool_defs: list[ToolDefinition]
    ) -> list[ToolDefinition]:
        """Give the agent only the tools its connections and its computer give."""
        return [tool_def for tool_def in tool_defs if self.given(tool_def.name)]

    def get_toolset(self) -> Any:
        """
        The tools of its files, when its permissions turn its files on, and
        those that compose the outputs it gives besides words.
        """
        toolsets = [
            toolset
            for toolset in (
                computer_toolset(self.app, self.agent_id),
                outputs_toolset(self.app.interface.outputs),
            )
            if toolset is not None
        ]
        if len(toolsets) <= 1:
            return toolsets[0] if toolsets else None
        from pydantic_ai.toolsets import CombinedToolset

        return CombinedToolset(toolsets)

    # --- acting ------------------------------------------------------------------

    async def _ask(
        self, tool_name: str, args: Dict[str, Any], decision: Decision
    ) -> None:
        if self.ask is not None:
            await self.ask(tool_name, args, decision)
            return
        from agent_runtimes.guardrails.tool_approvals import (
            ToolApprovalConfig,
            ToolApprovalManager,
        )

        if self.notify is not None:
            await self.notify(tool_name, sentence_of(decision))
        config = ToolApprovalConfig.from_env()
        config.agent_id = self.agent_id or config.agent_id
        manager = ToolApprovalManager(config)
        # What is saved is shown whole before it is (LOOP R-24), and so is
        # what is sent — the draft in full before *Approve* (LOOP W-05); any
        # other call's arguments, cut.
        whole = tool_name == SAVE_TOOL or "send" in decision.classes
        limit = DRAFT_LIMIT if whole else 500
        await manager.request_and_wait(
            tool_name=tool_name,
            tool_args={
                **{key: str(value)[:limit] for key, value in args.items()},
                **approval_marks(self.app.id, self.app_uid, sentence_of(decision)),
            },
        )

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        enforced = self.decide(call.tool_name, args)
        decision = enforced.decision
        # A visitor without an account only reads, and nobody is asked for
        # them: whatever the rules say, anything else is not done (LOOP R-30).
        refusal = visitor_refusal(call.tool_name, decision.classes, decision.behaviour)
        for part in enforced.parts:
            refusal = refusal or visitor_refusal(
                part.tool, part.classes, part.behaviour
            )
        if refusal:
            raise AppRuleBlockedError(
                replace(decision, behaviour=LEAVE_TO_ME, because=SIGNED_OUT), refusal
            )
        # Nobody present (LOOP R-16): what acts on the world is done, or asked
        # of its maker, only when a rule of its own says so; its own computer
        # is its own.
        if self.unattended is not None and self.unattended():
            unruled = _unruled(enforced, call.tool_name)
            if unruled is not None:
                stopped = replace(decision, behaviour=LEAVE_TO_ME, because=UNATTENDED)
                if self.record is not None:
                    self.record(replace(enforced, decision=stopped))
                raise AppRuleBlockedError(stopped, unattended_sentence(unruled))
        if decision.behaviour == IF_ASKED and self.granted is not None:
            # *Do it if I asked* rests on what the person approved in advance
            # (LOOP U-25), never on a reading of the conversation.
            approved = await self.granted(call.tool_name, args, decision)
            if approved is not None:
                enforced = replace(enforced, approved=approved)
        if self.record is not None:
            self.record(enforced)
        if decision.behaviour == DO_IT or enforced.approved is not None:
            await self._computer_free(call.tool_name)
            return args
        if decision.behaviour in (ASK_FIRST, IF_ASKED):
            # Not approved in advance: the person is asked, and what they
            # answered is an entry of the record of its own (LOOP R-07).
            await asked_and_answered(
                self._ask(call.tool_name, args, decision),
                call.tool_name,
                sentence_of(decision),
                self.answered,
            )
            await self._computer_free(call.tool_name)
            return args
        raise AppRuleBlockedError(decision)

    async def _computer_free(self, tool_name: str) -> None:
        """A call to a tool of its computer waits while a person has it."""
        if part_of(tool_name) is not None:
            await wait_until_handed_back(self.agent_id)


def _acts(decision: Decision) -> bool:
    """Whether a decision is about acting on the world: anything but reading."""
    return any(item != "read" for item in decision.classes)


def _unruled(enforced: "Enforced", tool_name: str) -> Optional[Decision]:
    """The first part of a call that acts and that no rule of its own covers,
    or None: what background work does not do (LOOP R-16). Its own computer —
    its shell, its files — is its own, and code is decided by the tools it
    names.
    """
    if part_of(tool_name) is not None and not enforced.parts:
        return None
    for decision in enforced.parts or (enforced.decision,):
        if _acts(decision) and not decision.rule:
            return decision
    return None


def unattended_sentence(decision: Decision) -> str:
    """Why background work did not do something, in a sentence."""
    does = " and ".join(decision.classes) or "act"
    return UNATTENDED_SENTENCE.format(tool=decision.tool, does=does)


def approval_marks(app_id: str, app_uid: str, sentence: str) -> Dict[str, str]:
    """
    What an approval of an application carries beside the call's arguments.

    The rule or Gate it was asked under, and the application, by its id and,
    when the platform knows it, its uid — so its own page, the Tool Approvals
    page and its channels say whose it is (LOOP U-19).
    """
    marks = {"_rule": sentence, "_app": app_id}
    if app_uid:
        marks["_app_uid"] = app_uid
    return marks


def _catalogue_server(name: str) -> str:
    """A server's name as the catalogue spells it: code says `google_workspace`."""
    if name in SERVER_ACTIONS:
        return name
    hyphenated = name.replace("_", "-")
    return hyphenated if hyphenated in SERVER_ACTIONS else name


def _serves(server: str, name: str) -> bool:
    """Whether a server of the catalogue says it serves a tool of that name."""
    actions = SERVER_ACTIONS.get(server)
    if actions is None:
        return False
    return name in actions.tools or any(
        ("*" in pattern or "?" in pattern) and matches(name, pattern)
        for pattern in actions.tools
    )


def _unclassed(name: str) -> Decision:
    return Decision(LEAVE_TO_ME, name, (), UNCLASSED)


def _strictest(decisions: Sequence[Decision]) -> Decision:
    return max(decisions, key=lambda decision: BEHAVIOURS.index(decision.behaviour))


__all__ = [
    "CODE_TOOLS",
    "NO_SHELL",
    "READING_TOOLS",
    "AppRuleBlockedError",
    "AppRulesCapability",
    "Enforced",
    "sentence_of",
]

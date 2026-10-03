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
- a few tools of the runtime itself that only look (`search_tools`,
  `load_skill`…), which are reading.

Anything else is unknown, and unknown is left to the person, unless the
session says what it does (`extra_classes`).

Pure enough to test: the person is asked through `ask`, an awaitable the
runtime gives (by default the tool-approval path that exists), and every
decision is handed to `record` before it is acted on.
"""

from __future__ import annotations

from dataclasses import dataclass, field
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
from agent_runtimes.loop.apps.rules import (
    ASK_FIRST,
    BEHAVIOURS,
    DO_IT,
    IF_ASKED,
    LEAVE_TO_ME,
    UNCLASSED,
    Decision,
    decision_for,
    matches,
)
from agent_runtimes.specs.actions import SERVER_ACTIONS, TOOL_ACTIONS
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
CODE_TOOLS: frozenset[str] = frozenset({"execute_code", "run_skill_script"})

#: Why a call was decided as it was, beside the reasons of `rules`.
NO_SHELL = "no_shell"

#: What the person is asked with: the tool, its arguments, the decision.
Ask = Callable[[str, Dict[str, Any], Decision], Awaitable[Any]]

#: What is told of every decision, before it is acted on.
Record = Callable[["Enforced"], None]


class AppRuleBlockedError(GuardrailBlockedError):
    """A tool call the application's rules leave to the person."""

    def __init__(self, decision: Decision):
        self.decision = decision
        super().__init__(sentence_of(decision))


def sentence_of(decision: Decision) -> str:
    """A decision as a sentence, its own reasons included."""
    if decision.because == NO_SHELL:
        return (
            f"`{decision.tool}` runs code on the application's computer, "
            "and its shell is off: it is left to you."
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


def _id_of(ref: str) -> str:
    base, _, version = str(ref).rpartition(":")
    return base if base and "." in version else str(ref)


def _catalogue_ids_by_name() -> Dict[str, Set[str]]:
    """The tools of the catalogue, by their id and by the method that runs them."""
    from agent_runtimes.specs.tools import TOOL_CATALOG

    names: Dict[str, Set[str]] = {}
    for identity, spec in TOOL_CATALOG.items():
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

    ask: Optional[Ask] = None
    """How the person is asked; the tool-approval path when unsaid."""

    record: Optional[Record] = None
    """Told of every decision, before it is acted on."""

    extra_classes: Dict[str, List[str]] = field(default_factory=dict)
    """What tools the catalogue does not know do, by runtime name."""

    known_mcp_tools: Optional[Callable[[], Set[str]]] = None
    """The MCP tool names the runtime knows (`server__tool` among them)."""

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
        if name in TOOL_ACTIONS:
            found.add(name)
        return found

    # --- deciding ----------------------------------------------------------------

    def decide(self, tool_name: str, args: Mapping[str, Any]) -> Enforced:
        """What the application does about a call: the decision, and its parts."""
        if tool_name in READING_TOOLS:
            return Enforced(
                tool_name, decision_for(self.app, tool_name, classes=["read"])
            )
        if tool_name in self.extra_classes:
            classes = list(self.extra_classes[tool_name])
            return Enforced(
                tool_name, decision_for(self.app, tool_name, classes=classes)
            )
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
        identities = self._catalogue_ids(tool_name)
        if identities:
            parts = tuple(
                decision_for(self.app, identity, arguments=args)
                for identity in sorted(identities)
            )
            return Enforced(
                tool_name, _strictest(parts), parts if len(parts) > 1 else ()
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

        config = ToolApprovalConfig.from_env()
        config.agent_id = self.agent_id or config.agent_id
        manager = ToolApprovalManager(config)
        await manager.request_and_wait(
            tool_name=tool_name,
            tool_args={
                **{key: str(value)[:500] for key, value in args.items()},
                "_rule": sentence_of(decision),
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
        if self.record is not None:
            self.record(enforced)
        decision = enforced.decision
        if decision.behaviour == DO_IT:
            return args
        if decision.behaviour in (ASK_FIRST, IF_ASKED):
            # *Do it if I asked* rests on a grant the person gave in advance.
            # Until grants are recorded (LOOP U-25), it asks.
            await self._ask(call.tool_name, args, decision)
            return args
        raise AppRuleBlockedError(decision)


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

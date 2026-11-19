# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A conversation's switches: its MCP tools, their approvals, its skills
and their approvals, for that conversation alone (the user, 19 November
2026: the switches of an application's page work on its runtime, for
visitors and people signed in alike).

An application's agent is shared: a deployment's by every visitor, a
Preview's by its builder's conversations. So a conversation's switches are
never written to the agent's state (``streams.loop``), which the monitoring
stream's controls switch for everybody: they are kept on the session
(``LiveSession.switches``) and are in force during its turns only
(`conversation_switches`), where the agent's MCP and skills guardrails read
them through ``streams.loop``'s accessors.

Only what the runtime offers is switched (`offered_of`): an MCP server that
runs here and the tools it lists, a skill that is active. Anything else is
refused in a sentence (`SwitchRefused`), and nothing is half-switched.
Codemode is the application's, made with its agent: no conversation
switches it.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Dict, FrozenSet, Iterator, List, Mapping, Optional, Set, Tuple

#: The kinds of switch, as a page sends them.
SWITCH_KINDS = (
    "server",
    "tool",
    "tool_approval",
    "skill",
    "skills",
    "skill_approval",
    "codemode",
)


class SwitchRefused(Exception):
    """A switch the runtime does not take, with its status and its sentence."""

    def __init__(self, status: int, reason: str) -> None:
        super().__init__(reason)
        self.status = status
        self.reason = reason


@dataclass(frozen=True)
class Offered:
    """What a conversation may switch: the running servers with their tools, the active skills."""

    servers: Mapping[str, FrozenSet[str]] = field(default_factory=dict)
    skills: FrozenSet[str] = frozenset()


def _bare(ref: Any) -> str:
    return str(ref or "").split(":", 1)[0].strip()


def _flag(said: Mapping[str, Any], name: str, kind: str) -> bool:
    value = said.get(name)
    if not isinstance(value, bool):
        article = "An" if kind[0] in "aeiou" else "A"
        raise SwitchRefused(422, f"{article} {kind} switch says {name}, true or false.")
    return value


def _named(said: Mapping[str, Any], name: str, kind: str) -> str:
    value = _bare(said.get(name))
    if not value:
        article = "An" if kind[0] in "aeiou" else "A"
        raise SwitchRefused(422, f"{article} {kind} switch names its {name}.")
    return value


@dataclass
class ConversationSwitches:
    """What one conversation switched: only what it switched, the rest as the agent has it."""

    mcp_tools: Dict[str, Set[str]] = field(default_factory=dict)
    """The tools on, by server, for the servers it switched."""
    mcp_approved: Dict[str, Set[str]] = field(default_factory=dict)
    """The tools approved, by server, for the servers whose approvals it switched."""
    skills: Dict[str, bool] = field(default_factory=dict)
    skills_approved: Dict[str, bool] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        """What a page is answered: the switches, in lists."""
        return {
            "mcp_tools": {k: sorted(v) for k, v in self.mcp_tools.items()},
            "mcp_approved": {k: sorted(v) for k, v in self.mcp_approved.items()},
            "skills": dict(self.skills),
            "skills_approved": dict(self.skills_approved),
        }

    def _server(self, offered: Offered, server: str) -> FrozenSet[str]:
        tools = offered.servers.get(server)
        if tools is None:
            raise SwitchRefused(
                422,
                f"{server} is not running on this runtime: there is nothing of it to switch.",
            )
        return tools

    def _tool(self, offered: Offered, server: str, tool: str) -> None:
        if tool not in self._server(offered, server):
            raise SwitchRefused(422, f"{server} has no tool {tool}.")

    @staticmethod
    def _skill(offered: Offered, skill: str) -> None:
        if skill not in offered.skills:
            raise SwitchRefused(422, f"{skill} is not a skill this runtime offers.")

    def switch(self, said: Mapping[str, Any], offered: Offered) -> None:
        """Take one switch, checked whole before anything changes.

        Raises
        ------
        SwitchRefused
            For what the runtime does not offer, or a switch that is not one.
        """
        kind = said.get("kind") if isinstance(said, Mapping) else None
        if kind not in SWITCH_KINDS:
            raise SwitchRefused(422, f"A switch is one of {', '.join(SWITCH_KINDS)}.")
        if kind == "codemode":
            raise SwitchRefused(
                422,
                "Codemode is the application's: this runtime does not switch it "
                "for one conversation.",
            )
        if kind == "server":
            server = _named(said, "server", kind)
            tools = self._server(offered, server)
            enabled = _flag(said, "enabled", kind)
            self.mcp_tools[server] = set(tools) if enabled else set()
            self._approvals_follow(server)
        elif kind == "tool":
            server = _named(said, "server", kind)
            tool = _named(said, "tool", kind)
            self._tool(offered, server, tool)
            enabled = _flag(said, "enabled", kind)
            on = set(self.mcp_tools.get(server, offered.servers[server]))
            if enabled:
                on.add(tool)
            else:
                on.discard(tool)
            self.mcp_tools[server] = on
            self._approvals_follow(server)
        elif kind == "tool_approval":
            server = _named(said, "server", kind)
            tool = _named(said, "tool", kind)
            self._tool(offered, server, tool)
            approved = _flag(said, "approved", kind)
            kept = self.mcp_approved.setdefault(server, set())
            if approved:
                kept.add(tool)
            else:
                kept.discard(tool)
        elif kind == "skill":
            skill = _named(said, "skill", kind)
            self._skill(offered, skill)
            self.skills[skill] = _flag(said, "enabled", kind)
        elif kind == "skills":
            named = said.get("skills")
            if not isinstance(named, list) or not named:
                raise SwitchRefused(422, "A skills switch names its skills.")
            ids = [_bare(each) for each in named]
            for skill in ids:
                self._skill(offered, skill)
            enabled = _flag(said, "enabled", kind)
            for skill in ids:
                self.skills[skill] = enabled
        else:
            skill = _named(said, "skill", kind)
            self._skill(offered, skill)
            self.skills_approved[skill] = _flag(said, "approved", kind)

    def _approvals_follow(self, server: str) -> None:
        """A tool switched off is no longer approved."""
        if server in self.mcp_approved:
            self.mcp_approved[server] &= self.mcp_tools.get(server, set())


def _equipment_of(agent_id: str) -> Optional[Dict[str, Any]]:
    from agent_runtimes.apps.equipment import equipment_of_agent

    return equipment_of_agent(agent_id)


def _running_tools() -> Dict[str, Set[str]]:
    from agent_runtimes.streams.loop import _build_all_mcp_tools_by_server

    return _build_all_mcp_tools_by_server()


def offered_of(agent_id: str) -> Offered:
    """What a conversation with an agent of this runtime may switch, now.

    Raises
    ------
    SwitchRefused
        404 for no such agent.
    """
    said = _equipment_of(agent_id)
    if said is None:
        raise SwitchRefused(404, f"No agent {agent_id} runs on this runtime.")
    running = {_bare(k): set(v) for k, v in _running_tools().items()}
    servers = {
        _bare(row.get("id")): frozenset(running.get(_bare(row.get("id")), set()))
        for row in said.get("mcp_servers") or []
        if row.get("state") == "started"
    }
    skills = frozenset(
        _bare(row.get("id"))
        for row in said.get("skills") or []
        if row.get("state") == "active"
    )
    return Offered(servers=servers, skills=skills)


#: The switches of the conversation whose turn is under way, with its agent.
_IN_FORCE: ContextVar[Optional[Tuple[str, ConversationSwitches]]] = ContextVar(
    "conversation_switches", default=None
)


def enter_conversation_switches(agent_id: str, switches: ConversationSwitches) -> Any:
    """Make a conversation's switches the turn's; answer the token to reset it."""
    return _IN_FORCE.set((agent_id, switches))


@contextmanager
def conversation_switches(
    agent_id: str, switches: ConversationSwitches
) -> Iterator[ConversationSwitches]:
    """A conversation's switches in force, for what runs inside."""
    token = enter_conversation_switches(agent_id, switches)
    try:
        yield switches
    finally:
        _IN_FORCE.reset(token)


def in_force(agent_id: Optional[str]) -> Optional[ConversationSwitches]:
    """The switches of the turn under way, when it is a conversation with this agent."""
    current = _IN_FORCE.get()
    if current is None or not agent_id or current[0] != agent_id:
        return None
    return current[1]


def enabled_tools_in_force(
    agent_id: Optional[str], by_server: Dict[str, List[str]]
) -> Dict[str, List[str]]:
    """An agent's tools on by server, as the conversation under way switched them."""
    switched = in_force(agent_id)
    if switched is None:
        return by_server
    result = dict(by_server)
    for server, tools in switched.mcp_tools.items():
        if tools:
            result[server] = sorted(tools)
        else:
            result.pop(server, None)
    return result


def approved_tools_in_force(
    agent_id: Optional[str],
    approved_by_server: Dict[str, List[str]],
    enabled_by_server: Dict[str, List[str]],
) -> Dict[str, List[str]]:
    """An agent's tools approved by server, as the conversation under way switched them."""
    switched = in_force(agent_id)
    if switched is None:
        return approved_by_server
    result = dict(approved_by_server)
    for server, tools in switched.mcp_approved.items():
        result[server] = sorted(set(enabled_by_server.get(server, [])) & tools)
    return result


def skills_in_force(
    agent_id: Optional[str], ids: Set[str], *, approvals: bool
) -> Set[str]:
    """An agent's skills on (or approved), as the conversation under way switched them."""
    switched = in_force(agent_id)
    if switched is None:
        return ids
    result = set(ids)
    for skill, on in (
        switched.skills_approved if approvals else switched.skills
    ).items():
        if on:
            result.add(skill)
        else:
            result.discard(skill)
    return result

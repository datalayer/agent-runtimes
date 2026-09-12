# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A catalogued team, as the control plane runs it (ORCHESTRATOR.md, O2-09).

A team's run is a tree of executions. Its root is the supervisor's, and each
member runs as a child of it. Every one of them is bound by an agent id naming
its seat in the team, `team:<team>/supervisor` or `team:<team>/<member>`, over
A2A with no endpoint, so its worker is brought up for it as for any agentspec
(O2-06). The worker is registered from the agentspec the seat references, or
from one built out of the seat's own fields when it references none, as most
catalogued members do.

For a `sequential` or `parallel` team the control plane places the members in
the order `depends_on` gives, and the supervisor answers after them, briefed
with what they produced. A `supervisor` team's supervisor routes the work
itself: it is registered with the members as its subagents, each a seat it
asks the control plane for (O2-06), and told the team's routing instructions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from datalayer_core.orchestration import AgentBinding, AgentProtocol

from ..types import TeamAgentspec, TeamSpec

#: What an agent id naming a seat in a team starts with.
TEAM_PREFIX = "team:"

#: The supervisor's seat.
SUPERVISOR = "supervisor"

#: The modes whose members the control plane schedules; a `supervisor` team routes its own.
SCHEDULED_MODES = frozenset({"sequential", "parallel"})

#: The mode whose supervisor routes the work, asking for the members it hands work to.
SUPERVISOR_MODE = "supervisor"

#: The modes a team runs in.
RUNNABLE_MODES = SCHEDULED_MODES | {SUPERVISOR_MODE}


def seat_agent_id(team_id: str, seat: str) -> str:
    """
    The agent id of a seat in a team.

    Parameters
    ----------
    team_id : str
        The team.
    seat : str
        ``supervisor``, or a member's id.

    Returns
    -------
    str
        ``team:<team>/<seat>``.
    """
    return f"{TEAM_PREFIX}{team_id}/{seat}"


@dataclass(frozen=True)
class TeamSeat:
    """One seat in a team: the supervisor's, or a member's."""

    team: TeamSpec
    #: The member sitting in it; none for the supervisor.
    member: TeamAgentspec | None = None

    @property
    def seat(self) -> str:
        return self.member.id if self.member is not None else SUPERVISOR

    @property
    def agent_id(self) -> str:
        return seat_agent_id(self.team.id, self.seat)

    @property
    def name(self) -> str:
        if self.member is not None:
            return self.member.name or self.member.id
        return self.team.supervisor.name if self.team.supervisor else SUPERVISOR


def team_seat(agent_id: str) -> TeamSeat | None:
    """
    The seat an agent id names, when it names one in a catalogued team.

    Parameters
    ----------
    agent_id : str
        An execution's agent id.

    Returns
    -------
    TeamSeat | None
        The seat, or none when the id names no team, no such team, or no such
        seat in it.
    """
    if not agent_id.startswith(TEAM_PREFIX):
        return None
    team_id, _, seat = agent_id[len(TEAM_PREFIX) :].partition("/")
    from ..specs.teams import get_team_spec

    team = get_team_spec(team_id) if team_id and seat else None
    if team is None:
        return None
    if seat == SUPERVISOR:
        return TeamSeat(team) if team.supervisor is not None else None
    member = next((one for one in team.agents if one.id == seat), None)
    return TeamSeat(team, member) if member is not None else None


def supervisor_binding(team: TeamSpec) -> AgentBinding:
    """The binding of a team's root execution: its supervisor, brought up for it."""
    return AgentBinding(
        agent_id=seat_agent_id(team.id, SUPERVISOR),
        capability=team.id,
        protocol=AgentProtocol.A2A,
    )


def member_binding(team: TeamSpec, member: TeamAgentspec) -> AgentBinding:
    """The binding of a member's execution, brought up for it."""
    return AgentBinding(
        agent_id=seat_agent_id(team.id, member.id),
        capability=member.role or member.id,
        protocol=AgentProtocol.A2A,
    )


def schedule(team: TeamSpec) -> list[list[TeamAgentspec]]:
    """
    The order a team's members run in: each list runs once those before it have finished.

    A ``sequential`` team runs one member at a time: the first member, in the
    team's own order, whose dependencies have all finished. A ``parallel``
    team runs every member whose dependencies have finished at once.

    Parameters
    ----------
    team : TeamSpec
        The team.

    Returns
    -------
    list[list[TeamAgentspec]]
        The members, grouped by when they start.

    Raises
    ------
    ValueError
        When a member depends on one the team does not have, or the
        dependencies go round in a circle.
    """
    known = {member.id for member in team.agents}
    for member in team.agents:
        missing = [one for one in member.depends_on if one not in known]
        if missing:
            raise ValueError(
                f"Member '{member.id}' of team '{team.id}' depends on {', '.join(repr(one) for one in missing)}, "
                "which the team does not have."
            )
    done: set[str] = set()
    waiting = list(team.agents)
    layers: list[list[TeamAgentspec]] = []
    while waiting:
        ready = [member for member in waiting if set(member.depends_on) <= done]
        if not ready:
            raise ValueError(
                f"The members of team '{team.id}' depend on each other in a cycle: "
                f"{', '.join(member.id for member in waiting)}."
            )
        if team.execution_mode != "parallel":
            ready = ready[:1]
        layers.append(ready)
        done |= {member.id for member in ready}
        waiting = [member for member in waiting if member.id not in done]
    return layers


def registration(seat: TeamSeat) -> dict[str, Any]:
    """
    What a seat's worker is registered with on an agent-runtimes server.

    A seat that references an agentspec is registered by it. One that does not
    is registered from its own fields: a system prompt saying who it is in the
    team and what it is there for, and its model, tools and MCP server.

    Parameters
    ----------
    seat : TeamSeat
        The seat.

    Returns
    -------
    dict[str, Any]
        The fields of the agent creation request, beside its name, description
        and transport.
    """
    team, member = seat.team, seat.member
    if member is not None:
        ref, model = member.ref, member.model
        prompt = (
            f"You are {seat.name}, the {member.role} of the {team.name}.\n\n{member.goal}"
        ).strip()
    else:
        supervisor = team.supervisor
        assert supervisor is not None
        ref, model = supervisor.ref, supervisor.model
        prompt = supervisor.instructions or (
            f"You are {supervisor.name}, supervising the {team.name}.\n\n{supervisor.goal}"
        ).strip()
    fields: dict[str, Any] = (
        {"agent_spec_id": ref.split(":", 1)[0]} if ref else {"system_prompt": prompt}
    )
    if model:
        fields["model"] = model
    if member is None and team.execution_mode == SUPERVISOR_MODE:
        # The supervisor routes the work: the members are its subagents, each
        # a seat it asks the control plane for (O2-06), and how to route is
        # part of what it is told.
        fields["subagents"] = {
            "subagents": [
                {
                    "name": one.name or one.id,
                    "description": one.goal or one.role or one.id,
                    "ref": seat_agent_id(team.id, one.id),
                    "a2a": {},
                }
                for one in team.agents
            ],
            "include_general_purpose": False,
        }
        if team.routing_instructions:
            base = fields.get("system_prompt")
            if base is None:
                from ..specs.agents import get_agent_spec

                referenced = get_agent_spec(ref.split(":", 1)[0])
                base = (referenced.system_prompt if referenced is not None else "") or ""
            fields["system_prompt"] = f"{base}\n\n{team.routing_instructions}".strip()
    if member is not None and member.tools:
        fields["tools"] = list(member.tools)
    if member is not None and member.mcp_server:
        fields["selected_mcp_servers"] = [{"id": member.mcp_server, "origin": "catalog"}]
    return fields


def briefing(produced: list[tuple[TeamAgentspec, str]]) -> str:
    """
    What a supervisor is told its members produced, before it answers.

    Parameters
    ----------
    produced : list[tuple[TeamAgentspec, str]]
        Each member, in the order it ran, with the text of what it produced.

    Returns
    -------
    str
        The briefing, one section a member.
    """
    sections = [
        f"### {member.name or member.id} ({member.role})\n\n{text.strip() or '(nothing)'}"
        for member, text in produced
    ]
    return "Your team's members have finished. What each of them produced:\n\n" + "\n\n".join(sections)

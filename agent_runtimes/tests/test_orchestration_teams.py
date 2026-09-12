# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A catalogued team, as the control plane runs it (ORCHESTRATOR.md, O2-09).

Each seat in a team is an agent id the control plane can place and durable
can bring a worker up for. The members run in the order their dependencies
give, and each seat is registered from its agentspec or from its own fields.
"""

from __future__ import annotations

import pytest
from datalayer_core.orchestration import AgentProtocol

from agent_runtimes.orchestration.teams import (
    SCHEDULED_MODES,
    SUPERVISOR,
    SUPERVISOR_MODE,
    TeamSeat,
    briefing,
    member_binding,
    registration,
    schedule,
    seat_agent_id,
    supervisor_binding,
    team_seat,
)
from agent_runtimes.specs.teams import get_team_spec, list_team_specs
from agent_runtimes.types import TeamAgentspec, TeamSpec, TeamSupervisorSpec


def _team(mode: str = "sequential", **after: tuple[str, ...]) -> TeamSpec:
    """A team whose members are named by the keywords, each depending on what its value names."""
    return TeamSpec(
        id="t",
        name="T Team",
        agent_spec_id="",
        execution_mode=mode,
        supervisor=TeamSupervisorSpec(name="Lead", goal="Answer for the team"),
        agents=[
            TeamAgentspec(id=member, name=member.title(), goal=f"Do {member}", depends_on=list(needs))
            for member, needs in after.items()
        ],
    )


class TestASeatIsNamedByItsTeam:
    def test_every_catalogued_seat_is_found_again_by_its_agent_id(self) -> None:
        for team in list_team_specs():
            supervisor = team_seat(seat_agent_id(team.id, SUPERVISOR))
            assert supervisor is not None and supervisor.member is None and supervisor.team.id == team.id
            for member in team.agents:
                seat = team_seat(seat_agent_id(team.id, member.id))
                assert seat is not None and seat.member == member

    def test_an_id_naming_no_seat_names_none(self) -> None:
        team = list_team_specs()[0]
        assert team_seat("example-a2a-researcher") is None
        assert team_seat(seat_agent_id("no-such-team", SUPERVISOR)) is None
        assert team_seat(seat_agent_id(team.id, "no-such-member")) is None
        assert team_seat(f"team:{team.id}") is None

    def test_a_seat_is_bound_over_a2a_with_no_endpoint_so_its_worker_is_brought_up(self) -> None:
        team = _team(a=())
        root, child = supervisor_binding(team), member_binding(team, team.agents[0])
        assert (root.agent_id, root.protocol, root.endpoint) == ("team:t/supervisor", AgentProtocol.A2A, None)
        assert (child.agent_id, child.protocol, child.endpoint) == ("team:t/a", AgentProtocol.A2A, None)


class TestTheMembersRunInTheOrderTheirDependenciesGive:
    def test_a_sequential_team_runs_one_member_at_a_time(self) -> None:
        team = _team(a=(), b=("a",), c=(), d=("b", "c"))
        assert [[member.id for member in layer] for layer in schedule(team)] == [["a"], ["b"], ["c"], ["d"]]

    def test_a_parallel_team_runs_every_member_that_is_ready_at_once(self) -> None:
        team = _team("parallel", a=(), b=("a",), c=(), d=("b", "c"))
        assert [[member.id for member in layer] for layer in schedule(team)] == [["a", "c"], ["b"], ["d"]]

    def test_a_dependency_the_team_does_not_have_is_refused(self) -> None:
        with pytest.raises(ValueError, match="depends on 'z'"):
            schedule(_team(a=("z",)))

    def test_members_depending_on_each_other_in_a_circle_are_refused(self) -> None:
        with pytest.raises(ValueError, match="cycle: a, b"):
            schedule(_team(a=("b",), b=("a",), c=()))

    def test_every_catalogued_scheduled_team_has_an_order(self) -> None:
        scheduled = [team for team in list_team_specs() if team.execution_mode in SCHEDULED_MODES]
        assert scheduled
        for team in scheduled:
            assert sorted(member.id for layer in schedule(team) for member in layer) == sorted(
                member.id for member in team.agents
            )


class TestASeatIsRegisteredFromWhatItNames:
    def test_a_seat_referencing_an_agentspec_is_registered_by_it(self) -> None:
        jupyter = get_team_spec("jupyter")
        assert jupyter is not None
        analyst = next(member for member in jupyter.agents if member.ref)
        fields = registration(TeamSeat(jupyter, analyst))
        assert fields["agent_spec_id"] == analyst.ref.split(":", 1)[0] and "system_prompt" not in fields
        supervisor = registration(TeamSeat(jupyter))
        assert supervisor["agent_spec_id"] == jupyter.supervisor.ref.split(":", 1)[0]
        assert supervisor["model"] == jupyter.supervisor.model

    def test_a_seat_naming_none_is_registered_from_its_own_fields(self) -> None:
        team = next(team for team in list_team_specs() if not any(member.ref for member in team.agents))
        for member in team.agents:
            fields = registration(TeamSeat(team, member))
            assert "agent_spec_id" not in fields and member.goal in fields["system_prompt"]
            assert fields.get("model", "") == member.model and fields.get("tools", []) == list(member.tools)
            if member.mcp_server:
                assert fields["selected_mcp_servers"] == [{"id": member.mcp_server, "origin": "catalog"}]
        supervisor = registration(TeamSeat(team))
        assert team.supervisor.goal in supervisor["system_prompt"] or supervisor["system_prompt"] == team.supervisor.instructions

    def test_a_supervisor_that_routes_is_given_its_members_as_seats_to_ask_for(self) -> None:
        jupyter = get_team_spec("jupyter")
        assert jupyter is not None and jupyter.execution_mode == SUPERVISOR_MODE
        fields = registration(TeamSeat(jupyter))
        seats = fields["subagents"]["subagents"]
        assert [seat["ref"] for seat in seats] == [seat_agent_id("jupyter", member.id) for member in jupyter.agents]
        assert all(seat["a2a"] == {} and seat["description"] for seat in seats)
        assert fields["subagents"]["include_general_purpose"] is False
        assert jupyter.routing_instructions in fields["system_prompt"]
        # A scheduled team's supervisor is given none: the control plane places its members.
        assert "subagents" not in registration(TeamSeat(_team(a=())))

    def test_the_seats_a_supervisor_is_registered_with_are_subagents_it_asks_the_control_plane_for(self) -> None:
        from agent_runtimes.capabilities.factory import (
            build_capabilities_from_agent_spec,
        )
        from agent_runtimes.routes.agents import CreateAgentRequest, _with_subagents
        from agent_runtimes.specs.agents import get_agent_spec
        from agent_runtimes.subagents import SubagentsCapability

        jupyter = get_team_spec("jupyter")
        assert jupyter is not None
        fields = registration(TeamSeat(jupyter))
        request = CreateAgentRequest(name="a2a-team-jupyter-supervisor", **fields)
        spec = _with_subagents(get_agent_spec(fields["agent_spec_id"]), request, "a2a-team-jupyter-supervisor")
        [capability] = [
            one
            for one in build_capabilities_from_agent_spec(spec, agent_id="a2a-team-jupyter-supervisor")
            if isinstance(one, SubagentsCapability)
        ]
        assert [definition.a2a.spec_id for definition in capability.subagents] == [
            seat_agent_id("jupyter", member.id) for member in jupyter.agents
        ]
        assert capability.include_general_purpose is False
        # An agent created from no spec is still given the subagents it names.
        bare = _with_subagents(None, CreateAgentRequest(name="bare", subagents=request.subagents), "bare")
        assert bare is not None and bare.subagents == request.subagents

    def test_the_supervisor_is_briefed_with_what_each_member_produced(self) -> None:
        team = _team(a=(), b=("a",))
        said = briefing([(team.agents[0], "Found three facts."), (team.agents[1], "")])
        assert "### A (contributor)\n\nFound three facts." in said and "### B (contributor)\n\n(nothing)" in said

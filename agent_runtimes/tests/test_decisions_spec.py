# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Decisions: a kind of the catalogue, and a capability an agent's spec names.

An agent decides only when its spec says ``decisions: <id>:<version>``; the
capability brings the ``decide`` backend tool. The generated catalogue, the
``Agentspec`` rule, what the runtime says of an agent, and the generators'
checks against the agentspecs clone (skipped where there is no clone).
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from agent_runtimes.config.frontend_config import get_frontend_config
from agent_runtimes.routes import agents as agents_route
from agent_runtimes.specs.agents import get_agent_spec, list_agentspecs
from agent_runtimes.specs.apps import APP_CATALOGUE
from agent_runtimes.specs.decisions import (
    DECISIONS_CATALOGUE,
    get_decisions,
    list_decisions,
)
from agent_runtimes.specs.models import get_model, is_decision_model
from agent_runtimes.tools.decisions import (
    NoDecisions,
    agent_decisions,
    decisions_info,
    decisions_spec,
)
from agent_runtimes.types import DECIDE_TOOL, AgentDecisions, Agentspec

ROOT = Path(__file__).resolve().parents[2]
CLONE = ROOT / "agentspecs" / "agentspecs"

sys.path.insert(0, str(ROOT / "scripts" / "codegen"))

needs_clone = pytest.mark.skipif(
    not (CLONE / "decisions").is_dir(), reason="no agentspecs clone with decisions"
)


def _base(tool: str) -> str:
    return tool.rpartition(":")[0] or tool


def test_jev_is_the_catalogues_decisions_spec() -> None:
    jev = get_decisions("jev:0.0.1")
    assert jev is not None and jev is get_decisions("jev")
    assert jev.ref == "jev:0.0.1" and jev.enabled
    assert jev.questions == ["noul", "choice", "score"]
    assert (jev.max_questions, jev.max_text_length) == (10, 20000)
    assert list_decisions() == list(DECISIONS_CATALOGUE.values())
    assert get_decisions("oracle") is None


def test_every_decisions_spec_asks_a_typed_decision_model_of_the_catalogue() -> None:
    for spec in list_decisions():
        model = get_model(spec.model)
        assert model is not None and model.id == spec.model, spec.id
        assert is_decision_model(model), spec.id


def test_an_agent_has_decide_exactly_when_its_spec_names_decisions() -> None:
    deciders = []
    for agent in list_agentspecs():
        has_tool = DECIDE_TOOL in [_base(tool) for tool in agent.backend_tools]
        assert has_tool == bool(agent.decisions), agent.id
        if agent.decisions:
            assert decisions_spec(agent.decisions).enabled, agent.id
            deciders.append(agent.id)
    assert "example-simple" in deciders
    # Not every agent decides.
    assert len(deciders) < len(list_agentspecs())


def test_an_application_that_lists_decide_runs_an_agent_that_decides() -> None:
    seen = 0
    for app in APP_CATALOGUE.values():
        if DECIDE_TOOL not in [_base(tool) for tool in app.backend_tools]:
            continue
        seen += 1
        agent = get_agent_spec(_base(app.agent))
        assert agent is not None and agent.decisions, app.id
    assert seen > 0


def test_the_agentspec_type_keeps_the_rule() -> None:
    base: dict[str, Any] = {"id": "mine", "name": "Mine", "description": "An agent."}
    assert Agentspec(**base).decisions is None
    assert Agentspec(**base, decisions="jev:0.0.1").backend_tools == [DECIDE_TOOL]
    with pytest.raises(ValidationError, match="its spec names no decisions"):
        Agentspec(**base, backend_tools=["decide:0.0.1"])
    with pytest.raises(ValidationError, match="has no 'oracle:0.0.1'"):
        Agentspec(**base, decisions="oracle:0.0.1")


def test_the_runtime_says_whether_an_agent_decides_and_with_which_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        agents_route,
        "_agentspecs",
        {"decider": {"decisions": "jev:0.0.1"}, "plain": {}, "off": {"decisions": "x"}},
    )
    assert decisions_info(agent_decisions("plain")) is None
    assert decisions_info(agent_decisions("nobody")) is None
    said = decisions_info(agent_decisions("decider"))
    assert said == {
        "spec": "jev:0.0.1",
        "name": "Jev",
        "model": "cloudflare:wrk/typesafe/jev",
        "model_name": "Jev (Cloudflare Workers AI)",
        "questions": ["noul", "choice", "score"],
        "max_questions": 10,
        "max_text_length": 20000,
    }
    with pytest.raises(NoDecisions):
        agent_decisions("off")
    # As the chat reads it, in the agent's configuration.
    assert AgentDecisions.model_validate(said).model_dump(by_alias=True)[
        "modelName"
    ] == ("Jev (Cloudflare Workers AI)")


@pytest.mark.asyncio
async def test_the_frontend_config_carries_no_decisions_unless_an_agent_has_them() -> (
    None
):
    config = await get_frontend_config()
    assert config.agent_decisions is None
    assert "agentDecisions" in config.model_dump(by_alias=True)


@needs_clone
def test_the_generator_gives_decide_to_an_agent_that_names_decisions() -> None:
    from generate_decisions import apply_agent_decisions

    agents: list[dict[str, Any]] = [
        {"id": "decider", "decisions": "jev", "backend_tools": ["runtime-echo:0.0.1"]},
        {"id": "plain", "backend_tools": ["runtime-echo:0.0.1"]},
    ]
    apply_agent_decisions(agents, CLONE / "agents")
    assert agents[0]["decisions"] == "jev:0.0.1"
    assert agents[0]["backend_tools"] == ["runtime-echo:0.0.1", "decide:0.0.1"]
    assert agents[1]["backend_tools"] == ["runtime-echo:0.0.1"]


@needs_clone
@pytest.mark.parametrize(
    ("agent", "why"),
    [
        (
            {"id": "sneaky", "backend_tools": ["decide:0.0.1"]},
            "agent 'sneaky' lists the backend tool `decide` but its spec names no decisions",
        ),
        (
            {"id": "lost", "decisions": "oracle:0.0.1"},
            "agent 'lost' names decisions 'oracle:0.0.1', which the decisions catalogue does not have",
        ),
        (
            {"id": "late", "decisions": "jev:9.9.9"},
            "agent 'late' names decisions 'jev:9.9.9'; the catalogue has jev:0.0.1",
        ),
    ],
)
def test_the_generator_refuses_in_a_sentence_naming_the_agent(
    agent: dict[str, Any], why: str
) -> None:
    from generate_decisions import apply_agent_decisions

    with pytest.raises(SystemExit) as refused:
        apply_agent_decisions([agent], CLONE / "agents")
    assert why in str(refused.value)


@needs_clone
def test_the_generator_refuses_an_application_deciding_through_an_agent_that_does_not() -> (
    None
):
    from generate_decisions import check_app_decisions

    check_app_decisions(
        [{"id": "ok", "agent": "example-simple:0.0.1", "backend_tools": ["decide"]}],
        CLONE / "apps",
    )
    with pytest.raises(SystemExit) as refused:
        check_app_decisions(
            [{"id": "bad", "agent": "loop-shell:0.0.1", "backendTools": ["decide"]}],
            CLONE / "apps",
        )
    assert (
        "application 'bad' lists the backend tool `decide` but its agent "
        "'loop-shell' names no decisions" in str(refused.value)
    )


@needs_clone
def test_a_decisions_spec_with_a_model_that_decides_nothing_is_refused(
    tmp_path: Path,
) -> None:
    from agentspecs_clone import import_from_clone

    module = import_from_clone(CLONE / "decisions", "decisions")
    spec = module.DecisionsSpec(id="other", name="Other", model="alibaba:qwen-max")
    with pytest.raises(ValueError, match="answers no typed decisions"):
        module.check_decisions(spec)
    with pytest.raises(ValueError, match="not in the models catalogue"):
        module.check_decisions(spec.model_copy(update={"model": "no:where"}))

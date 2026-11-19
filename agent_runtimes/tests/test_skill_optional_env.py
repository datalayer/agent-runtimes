# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A skill with optional secrets and an any-of rule (agentspecs 0.0.218, the user, 18 November 2026).

The stock image skill requires no secret: each provider's key is given to the
runtime and its sandbox when the account has it, and the skill is activated
when one at least is there. With none it is left out — never refused, never
offered — and the agent is told which keys would set it up.
"""

from __future__ import annotations

import asyncio
from typing import Any, Iterable

import pytest

from agent_runtimes.guardrails.declared_secrets import (
    declared_secrets,
    skill_any_of_env_names,
    skill_optional_env_names,
)
from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
from agent_runtimes.specs.agents import get_agent_spec
from agent_runtimes.specs.skills import get_skill_spec
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401
    _DummyRequest,
    creation_spy,
)

KEYS = ["FREEPIK_API_KEY", "PEXELS_API_KEY", "PIXABAY_API_KEY", "UNSPLASH_ACCESS_KEY"]
SKILL = "the skill image-stock"


def _having(names: Iterable[str]):
    given = set(names)
    return lambda name: name in given


def test_the_catalogue_skill_requires_nothing_and_names_its_keys():
    spec = get_skill_spec("image-stock")
    assert spec is not None and spec.enabled is True
    assert spec.module == "datalayer_skills.skills.image_stock"
    assert spec.envvars == []
    assert sorted(skill_any_of_env_names("image-stock:0.0.1")) == KEYS
    assert sorted(skill_optional_env_names("image-stock")) == [
        *KEYS[:3],
        *KEYS[3:],
        "UNSPLASH_TIER",
    ]
    assert skill_optional_env_names("crawl") == frozenset()
    assert skill_any_of_env_names("no-such-skill") == frozenset()


def test_its_keys_are_offered_to_the_runtime_and_its_sandbox_and_none_is_required():
    declared = declared_secrets(skills=["image-stock:0.0.1"])
    names = {*KEYS, "UNSPLASH_TIER"}
    assert names <= declared.runtime
    assert names <= declared.kernel
    assert names <= declared.offered
    assert declared.skill_offered == names
    assert declared.any_of == {SKILL: frozenset(KEYS)}
    # No consumer requires a name: nothing to refuse, whatever is there.
    assert SKILL not in declared.consumers
    assert declared.missing(_having([]), who="An agent") == []
    assert set(declared.as_names()["kernel"]) >= names


def test_without_a_key_it_is_left_out_whether_the_agent_says_it_optional_or_not():
    declared = declared_secrets(skills=["image-stock"])
    assert SKILL not in declared.optional
    left = declared.left_out(_having(["UNSPLASH_TIER"]))
    assert left.skills == {"image-stock": []}
    assert left.one_of == {"image-stock": KEYS}
    assert left.sentence().startswith(
        "Started without what the person has not set up: the skill image-stock "
        "(none of FREEPIK_API_KEY, PEXELS_API_KEY, PIXABAY_API_KEY, UNSPLASH_ACCESS_KEY, "
        "one of which is enough)."
    )


@pytest.mark.parametrize("key", KEYS)
def test_one_key_sets_it_up(key: str):
    declared = declared_secrets(get_agent_spec("worker-marketer"))
    assert "image-stock" not in declared.left_out(_having([key])).skills
    assert "image-stock" in declared.left_out(_having([])).skills


def test_where_the_sandbox_may_not_hold_its_keys_it_is_left_out_and_nothing_is_refused():
    declared = declared_secrets(skills=["image-stock"])
    having = _having(["PEXELS_API_KEY"])
    assert declared.left_out(having).skills == {}
    assert declared.left_out(having, sandbox_holds=False).skills == {"image-stock": []}
    # An optional secret of a skill is no reason to refuse a runtime its owner did not launch.
    assert declared.kernel_refused(having, "An application") == []
    # A required one still is.
    assert declared_secrets(skills=["github"]).kernel_refused(having, "An application")


def test_declarations_merge():
    merged = declared_secrets(skills=["github"]).merged(
        declared_secrets(skills=["image-stock"])
    )
    assert merged.any_of == {SKILL: frozenset(KEYS)}
    assert (
        "PEXELS_API_KEY" in merged.skill_offered
        and "GITHUB_TOKEN" not in merged.skill_offered
    )
    assert merged.missing(_having(KEYS), who="An agent") != []


def _create(monkeypatch: pytest.MonkeyPatch, creation_spy: dict) -> tuple[list, str]:  # noqa: F811
    seen: dict[str, Any] = {}
    from agent_runtimes.routes import agents as agents_route

    monkeypatch.setattr(
        agents_route,
        "create_skills_toolset",
        lambda **kwargs: seen.setdefault("skills", kwargs.get("skills")) and None,
    )
    request = CreateAgentRequest(
        name="Pictures Agent",
        agent_spec={
            "systemPrompt": "You find pictures.",
            "skills": ["image-stock:0.0.1", "image:0.0.1"],
        },
        enable_skills=True,
    )
    asyncio.run(create_agent(request, _DummyRequest()))
    pydantic_kwargs = creation_spy["pydantic_kwargs"]
    assert isinstance(pydantic_kwargs, dict)
    return list(seen["skills"]), " ".join(
        str(p) for p in pydantic_kwargs["instructions"]
    )


def test_an_agent_with_no_key_starts_without_the_skill_and_is_told(
    monkeypatch: pytest.MonkeyPatch,
    creation_spy: dict[str, object],  # noqa: F811
) -> None:
    for name in KEYS:
        monkeypatch.delenv(name, raising=False)
    skills, instructions = _create(monkeypatch, creation_spy)
    assert skills == ["image:0.0.1"]
    assert "the skill image-stock (none of FREEPIK_API_KEY" in instructions


def test_an_agent_with_one_key_has_the_skill(
    monkeypatch: pytest.MonkeyPatch,
    creation_spy: dict[str, object],  # noqa: F811
) -> None:
    for name in KEYS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("PIXABAY_API_KEY", "a-key")
    skills, instructions = _create(monkeypatch, creation_spy)
    assert skills == ["image-stock:0.0.1", "image:0.0.1"]
    assert "Started without" not in instructions
    assert "a-key" not in instructions


def test_the_toolset_itself_keeps_it_out_without_a_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """agent-skills 1.5.0: the skill's own SKILL.md says the same rule, read at each call."""
    from agent_skills import AgentSkill, AgentSkillsToolset

    for name in KEYS:
        monkeypatch.delenv(name, raising=False)
    toolset = AgentSkillsToolset(
        skills=[AgentSkill.from_module("datalayer_skills.skills.image_stock")]
    )
    assert toolset.get_active_skills() == {}
    assert asyncio.run(toolset.get_instructions()) == ""
    monkeypatch.setenv("UNSPLASH_ACCESS_KEY", "a-key")
    assert list(toolset.get_active_skills()) == ["image-stock"]
    assert "a-key" not in asyncio.run(toolset.get_instructions())


def test_the_skills_listing_says_what_it_needs(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.routes import configure

    async def no_sandbox(**kwargs):
        return {}

    monkeypatch.setattr(configure, "get_codemode_status", no_sandbox)
    for name in KEYS:
        monkeypatch.delenv(name, raising=False)
    listed = asyncio.run(configure.list_catalog_skills())
    stock = next(s for s in listed["skills"] if s["id"] == "image-stock")
    assert stock["required_env_vars"] == [] and stock["missing_env_vars"] == []
    assert sorted(stock["any_of_env_vars"]) == KEYS
    assert stock["ready"] is False and stock["set_env_vars"] == []
    monkeypatch.setenv("FREEPIK_API_KEY", "a-key")
    listed = asyncio.run(configure.list_catalog_skills())
    stock = next(s for s in listed["skills"] if s["id"] == "image-stock")
    assert stock["ready"] is True and stock["set_env_vars"] == ["FREEPIK_API_KEY"]
    assert "a-key" not in str(listed)


def test_what_was_left_out_is_said_by_name_for_a_page():
    declared = declared_secrets(get_agent_spec("worker-marketer"))
    left = declared.left_out(_having(["GITHUB_TOKEN"]))
    said = left.as_names()
    assert said["skills"]["image-stock"] == {
        "missing_env_vars": [],
        "one_of_env_vars": KEYS,
        "reason": "needs one of FREEPIK_API_KEY, PEXELS_API_KEY, PIXABAY_API_KEY, UNSPLASH_ACCESS_KEY",
    }
    assert said["skills"]["crawl"] == {
        "missing_env_vars": ["TAVILY_API_KEY"],
        "one_of_env_vars": [],
        "reason": "needs TAVILY_API_KEY",
    }
    assert (
        said["mcp_servers"]["discord"]["reason"]
        == "needs DISCORD_BOT_TOKEN, DISCORD_GUILD_ID"
    )
    assert said["backend_tools"]["social-post-x"] == {
        "linked_accounts": ["a linked X account"],
        "reason": "needs a linked X account",
    }
    assert left.needs("skill", "github") is None and "github" not in said["skills"]

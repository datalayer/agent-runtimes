# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an agent starts without (agentspecs 0.0.188, the user, 14 November 2026).

An agent's spec names the MCP servers and skills it can do without (``optional``) and
groups of which one at least must be set up (``optional.at_least_one``). One whose
secrets are not set up is never refused: it is left out, and the agent is told which in
its instructions, so it says what it cannot do. A required one still refuses the start,
and a group none of whose members is set up refuses it too.
"""

from __future__ import annotations

from typing import Iterable

import pytest

from agent_runtimes.guardrails.declared_secrets import LeftOut, declared_secrets
from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
from agent_runtimes.specs.agents import get_agent_spec
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401
    _DummyRequest,
    creation_spy,
)

NETWORKS = {
    "x": ["X_BEARER_TOKEN"],
    "bluesky": ["BLUESKY_APP_PASSWORD", "BLUESKY_IDENTIFIER", "BLUESKY_SERVICE_URL"],
    "discord": ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"],
}


def _having(names: Iterable[str]):
    given = set(names)
    return lambda name: name in given


def test_the_catalogue_says_what_the_marketer_and_the_shopper_start_without():
    marketer = get_agent_spec("worker-marketer")
    assert marketer is not None and marketer.optional is not None
    assert marketer.optional.mcp_servers == ["x", "bluesky", "discord"]
    assert marketer.optional.skills == ["crawl", "github"]
    # Its posting tools, set up by a linked account (agentspecs 0.0.189), count for a network.
    assert marketer.optional.backend_tools == ["social-post-x", "social-post-bluesky"]
    assert marketer.optional.at_least_one == [
        ["x", "bluesky", "discord", "social-post-x", "social-post-bluesky"]
    ]
    assert "linkedin" not in [server.id for server in marketer.mcp_servers]
    assert "LinkedIn" not in (marketer.system_prompt or "")
    shopper = get_agent_spec("worker-shopper")
    assert shopper is not None and shopper.optional is not None
    assert shopper.optional.skills == ["crawl"]
    assert get_agent_spec("worker-terra").optional is None


@pytest.fixture(autouse=True)
def nothing_linked(monkeypatch):
    """No X or Bluesky account linked: the networks are their secrets alone here."""
    from agent_runtimes.tools import social

    monkeypatch.setattr(social, "_state", {**social._state, "accounts": {}})


def test_an_optional_one_is_never_refused_and_the_group_wants_one_network():
    declared = declared_secrets(get_agent_spec("worker-marketer"))
    nothing = declared.missing(_having([]), who="Marketer")
    for name in (
        "X_BEARER_TOKEN",
        "DISCORD_BOT_TOKEN",
        "TAVILY_API_KEY",
        "GITHUB_TOKEN",
    ):
        assert not any(f"needs {name}," in sentence for sentence in nothing), name
    group = [sentence for sentence in nothing if "one at least of" in sentence]
    assert group == [
        "Marketer is not set up: it needs one at least of the MCP server bluesky, "
        "the MCP server discord, the MCP server x, the backend tool social-post-bluesky, "
        "the backend tool social-post-x, and none was given its secrets: add those of "
        "one to the account's secrets or link its account in Settings, then configure it again."
    ]
    for server, names in NETWORKS.items():
        one = declared.missing(_having(names), who="Marketer")
        assert not any("one at least of" in sentence for sentence in one), server
    # Half of Bluesky's secrets is not Bluesky set up.
    half = declared.missing(_having(["BLUESKY_IDENTIFIER"]), who="Marketer")
    assert any("one at least of" in sentence for sentence in half)


def test_what_is_not_set_up_is_left_out_and_said():
    declared = declared_secrets(get_agent_spec("worker-marketer"))
    left = declared.left_out(_having(NETWORKS["x"] + ["GITHUB_TOKEN"]))
    assert left.servers == {
        "bluesky": NETWORKS["bluesky"],
        "discord": NETWORKS["discord"],
    }
    assert left.skills == {"crawl": ["TAVILY_API_KEY"]}
    assert left.tools == {
        "social-post-bluesky": ["a linked Bluesky account"],
        "social-post-x": ["a linked X account"],
    }
    sentence = left.sentence()
    assert "the MCP server bluesky (no BLUESKY_APP_PASSWORD" in sentence
    assert "the skill crawl (no TAVILY_API_KEY)" in sentence
    assert "say that you cannot" in sentence
    everything = sum(NETWORKS.values(), []) + ["GITHUB_TOKEN", "TAVILY_API_KEY"]
    assert not declared.left_out(_having(everything)).servers
    assert not declared.left_out(_having(everything)).skills


def test_a_required_one_still_refuses_the_start():
    declared = declared_secrets(get_agent_spec("worker-terra"))
    assert declared.optional == frozenset()
    assert any(
        "needs DATALAYER_API_KEY" in sentence
        for sentence in declared.missing(_having([]), who="Terra")
    )
    assert LeftOut() == declared.left_out(_having([]))


def test_a_group_naming_what_is_not_optional_is_refused():
    spec = {
        "id": "a",
        "mcpServers": [{"id": "x", "origin": "catalog"}],
        "optional": {"mcpServers": ["x"], "atLeastOne": [["x", "github"]]},
    }
    with pytest.raises(ValueError, match="names github"):
        declared_secrets(forwarded_spec=spec)


@pytest.mark.asyncio
async def test_the_agent_starts_without_them_and_is_told(
    monkeypatch: pytest.MonkeyPatch,
    creation_spy: dict[str, object],  # noqa: F811
) -> None:
    for name in ("X_BEARER_TOKEN", "TAVILY_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("GITHUB_TOKEN", "a-token")
    seen: dict[str, object] = {}
    from agent_runtimes.routes import agents as agents_route

    monkeypatch.setattr(
        agents_route,
        "create_skills_toolset",
        lambda **kwargs: seen.setdefault("skills", kwargs.get("skills")) and None,
    )
    request = CreateAgentRequest(
        name="Optional Agent",
        agent_spec={
            "systemPrompt": "You market.",
            "mcpServers": [
                {"id": "x", "origin": "catalog"},
                {"id": "github", "origin": "catalog"},
            ],
            "skills": ["crawl:0.0.1", "github:0.0.1"],
            "optional": {"mcpServers": ["x"], "skills": ["crawl", "github"]},
        },
        enable_skills=True,
    )
    await create_agent(request, _DummyRequest())
    adapter_kwargs = creation_spy["adapter_kwargs"]
    assert isinstance(adapter_kwargs, dict)
    assert [s.id for s in adapter_kwargs["selected_mcp_servers"]] == ["github"]
    assert seen["skills"] == ["github:0.0.1"]
    pydantic_kwargs = creation_spy["pydantic_kwargs"]
    assert isinstance(pydantic_kwargs, dict)
    instructions = " ".join(str(part) for part in pydantic_kwargs["instructions"])
    assert "You market." in instructions
    assert (
        "Started without what the person has not set up: the MCP server x "
        "(no X_BEARER_TOKEN); the skill crawl (no TAVILY_API_KEY)." in instructions
    )

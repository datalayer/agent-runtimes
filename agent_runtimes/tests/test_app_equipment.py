# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application's agent is equipped with, said to its page.

Every MCP server and skill its agent declares is listed, running or not,
with its state and why one is off — by the names of the variables it needs,
never by a value (the user, 18 November 2026: "those selectors should
indicate all the available (enabled or disabled)").
"""

from __future__ import annotations

import json
from typing import Any, Dict

from agent_runtimes.apps.equipment import MCP_STATES, SKILL_STATES, equipment
from agent_runtimes.guardrails.declared_secrets import declared_secrets
from agent_runtimes.specs.agents import get_agent_spec
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    local,
    remote,
    runtime,
)

KEYS = ["FREEPIK_API_KEY", "PEXELS_API_KEY", "PIXABAY_API_KEY", "UNSPLASH_ACCESS_KEY"]


def _marketer(having: set[str], status: Dict[str, Any] | None = None) -> Dict[str, Any]:
    spec = get_agent_spec("worker-marketer")
    declared = declared_secrets(spec)
    prefix = "the skill "
    return equipment(
        spec,
        left_out=declared.left_out(lambda name: name in having).as_names(),
        any_of=[label[len(prefix) :] for label in declared.any_of],
        mcp_status=status,
    )


def _by_id(rows: list[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {row["id"]: row for row in rows}


def test_every_server_and_skill_the_spec_declares_is_listed_in_its_order() -> None:
    spec = get_agent_spec("worker-marketer")
    assert spec is not None
    said = _marketer(set())
    assert [row["id"] for row in said["mcp_servers"]] == [
        s.id for s in spec.mcp_servers
    ]
    assert [row["id"] for row in said["skills"]] == [
        skill.split(":")[0] for skill in spec.skills
    ]
    for row in said["mcp_servers"]:
        assert row["state"] in MCP_STATES and row["name"]
    for row in said["skills"]:
        assert row["state"] in SKILL_STATES and row["name"]


def test_what_is_off_says_why_by_variable_name() -> None:
    said = _marketer(set())
    servers, skills = _by_id(said["mcp_servers"]), _by_id(said["skills"])
    assert servers["discord"] == {
        "id": "discord",
        "name": "Discord",
        "optional": True,
        "state": "left_out",
        "reason": "needs DISCORD_BOT_TOKEN, DISCORD_GUILD_ID",
        "missing_env_vars": ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"],
    }
    assert skills["github"]["state"] == "not_activated"
    assert skills["github"]["reason"] == "needs GITHUB_TOKEN"
    assert skills["github"]["missing_env_vars"] == ["GITHUB_TOKEN"]
    # An any-of rule: one of its keys is enough, and none is set.
    assert skills["image-stock"]["state"] == "not_activated"
    assert skills["image-stock"]["optional"] is True
    assert skills["image-stock"]["one_of_env_vars"] == KEYS
    assert skills["image-stock"]["reason"].startswith("needs one of FREEPIK_API_KEY")
    # Nothing to set up: active, and nothing to say. Crawling a page asks no key
    # (agentspecs, 25 November 2026), and it is not something the Marketer starts without.
    assert skills["crawl"]["state"] == "active"
    assert skills["crawl"]["reason"] is None
    assert skills["crawl"]["optional"] is False
    # Set up: active too.
    assert _by_id(_marketer({"GITHUB_TOKEN"})["skills"])["github"]["state"] == "active"
    assert skills["image"]["optional"] is False


def test_a_skill_is_active_once_one_of_its_keys_is_set() -> None:
    skills = _by_id(_marketer({"PEXELS_API_KEY"})["skills"])
    assert skills["image-stock"]["state"] == "active"
    assert skills["image-stock"]["one_of_env_vars"] == []


def test_a_servers_state_is_the_live_one() -> None:
    status = {
        "servers": [
            {"id": "discord", "status": "started", "tools_count": 7},
            {
                "id": "linkedin",
                "status": "failed",
                "error": "boom",
                "reason": "It did not answer in 30 seconds.",
            },
        ]
    }
    servers = _by_id(
        _marketer({"DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"}, status)["mcp_servers"]
    )
    assert servers["discord"]["state"] == "started"
    assert servers["discord"]["tools"] == 7
    assert servers["linkedin"]["state"] == "failed"
    assert servers["linkedin"]["reason"] == "It did not answer in 30 seconds."
    # Left out wins over whatever the lifecycle says of it: it was never started.
    servers = _by_id(_marketer(set(), status)["mcp_servers"])
    assert servers["discord"]["state"] == "left_out"
    # Before the runtime said anything of it: not started.
    assert _by_id(_marketer(set())["mcp_servers"])["linkedin"]["state"] == "not_started"


def test_no_value_of_a_secret_is_ever_said(monkeypatch: Any) -> None:
    secret = "sk-live-do-not-print-me"
    monkeypatch.setenv("TAVILY_API_KEY", secret)
    monkeypatch.setenv("DISCORD_BOT_TOKEN", secret)
    said = json.dumps(_marketer({"TAVILY_API_KEY", "DISCORD_BOT_TOKEN"}))
    assert secret not in said
    assert "DISCORD_GUILD_ID" in said


def test_a_spec_given_as_a_dict_reads_the_same() -> None:
    said = equipment(
        {
            "mcp_servers": [{"id": "kiwi:0.0.1", "name": "Kiwi"}, "google-maps"],
            "skills": ["crawl:0.0.1", "crawl"],
            "optional": {"mcp_servers": ["kiwi"], "skills": []},
        }
    )
    assert [(r["id"], r["name"], r["optional"]) for r in said["mcp_servers"]] == [
        ("kiwi", "Kiwi", True),
        ("google-maps", "google-maps", False),
    ]
    assert [row["id"] for row in said["skills"]] == ["crawl"]


def test_the_page_of_an_application_reads_it(
    runtime: Runtime,  # noqa: F811 - the fixture
    local: Any,  # noqa: F811 - the fixture
) -> None:
    """``GET /api/v1/apps/agents/{agent}/equipment``: for whoever may talk to the application."""
    from agent_runtimes.routes import agents

    runtime.make("notes-assistant", dict(ASSISTANT), {"app_uid": "app-1"})
    agents._agentspecs["notes-assistant"]["agent_spec_id"] = "worker-marketer"
    answer = local.get("/api/v1/apps/agents/notes-assistant/equipment")
    assert answer.status_code == 200, answer.text
    said = answer.json()
    assert said["agent"] == "notes-assistant"
    assert "discord" in _by_id(said["mcp_servers"])
    assert "image-stock" in _by_id(said["skills"])
    for row in said["skills"]:
        assert row["state"] in SKILL_STATES
    # An application whose agent names no library spec declares nothing.
    runtime.make("plain", {**ASSISTANT, "id": "plain"}, {"app_uid": "app-2"})
    plain = local.get("/api/v1/apps/agents/plain/equipment").json()
    assert plain == {"agent": "plain", "mcp_servers": [], "skills": []}
    # No such agent.
    assert local.get("/api/v1/apps/agents/nobody/equipment").status_code == 404


def test_it_only_reads(
    runtime: Runtime,  # noqa: F811 - the fixture
    local: Any,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", dict(ASSISTANT), {"app_uid": "app-1"})
    for method in ("post", "put", "delete", "patch"):
        refused = getattr(local, method)(
            "/api/v1/apps/agents/notes-assistant/equipment"
        )
        assert refused.status_code == 405, method


def test_from_elsewhere_it_takes_who_the_application_takes(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: Any,  # noqa: F811 - the fixture
) -> None:
    """Not this machine: nobody unnamed reads it, as nobody unnamed talks to the application."""
    runtime.make("notes-assistant", dict(ASSISTANT), {"app_uid": "app-1"})
    url = "/api/v1/apps/agents/notes-assistant/equipment"
    assert remote.get(url).status_code == 401
    assert remote.get(url, headers=as_("expired")).status_code == 401
    assert remote.get(url, headers=as_("ada")).status_code == 200

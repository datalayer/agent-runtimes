# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A conversation's switches, on the session API (the user, 19 November 2026:
the switches of an application's page work on its runtime, for visitors and
people signed in alike).

``PUT /api/v1/apps/sessions/{uid}/switches`` switches a server's tools, a
tool, a tool's approval, a skill, all the skills, a skill's approval, for that
conversation alone: never the agent's, the deployment's, nor anybody else's
conversation. What the runtime does not offer is refused in a sentence.
"""

from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.apps import switches
from agent_runtimes.apps.switches import (
    ConversationSwitches,
    Offered,
    SwitchRefused,
    conversation_switches,
    in_force,
)
from agent_runtimes.streams import pubsub
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    local,
    remote,
    runtime,
)

OFFERED = Offered(
    servers={
        "kiwi": frozenset({"search-flight", "feedback"}),
        "overture": frozenset({"overture_search_places"}),
    },
    skills=frozenset({"travel-planning", "datalayer-memory-add"}),
)


def _switched(*said: Dict[str, Any]) -> ConversationSwitches:
    switches_ = ConversationSwitches()
    for each in said:
        switches_.switch(each, OFFERED)
    return switches_


def test_a_server_a_tool_and_an_approval_are_switched_from_all_on() -> None:
    switched = _switched(
        {"kind": "tool", "server": "kiwi", "tool": "feedback", "enabled": False},
        {
            "kind": "tool_approval",
            "server": "kiwi",
            "tool": "search-flight",
            "approved": True,
        },
        {"kind": "server", "server": "overture", "enabled": False},
    )
    assert switched.as_dict() == {
        "mcp_tools": {"kiwi": ["search-flight"], "overture": []},
        "mcp_approved": {"kiwi": ["search-flight"]},
        "mcp_asked": {},
        "skills": {},
        "skills_approved": {},
    }
    # A tool switched off is no longer approved.
    switched.switch(
        {"kind": "tool", "server": "kiwi", "tool": "search-flight", "enabled": False},
        OFFERED,
    )
    assert switched.as_dict()["mcp_approved"] == {"kiwi": []}
    switched.switch({"kind": "server", "server": "kiwi", "enabled": True}, OFFERED)
    assert switched.as_dict()["mcp_tools"]["kiwi"] == ["feedback", "search-flight"]


def test_a_skill_all_the_skills_and_a_skills_approval() -> None:
    switched = _switched(
        {"kind": "skill", "skill": "travel-planning", "enabled": False},
        {"kind": "skill_approval", "skill": "datalayer-memory-add", "approved": True},
    )
    assert switched.as_dict()["skills"] == {"travel-planning": False}
    assert switched.as_dict()["skills_approved"] == {"datalayer-memory-add": True}
    switched.switch(
        {
            "kind": "skills",
            "skills": ["travel-planning", "datalayer-memory-add"],
            "enabled": True,
        },
        OFFERED,
    )
    assert switched.as_dict()["skills"] == {
        "travel-planning": True,
        "datalayer-memory-add": True,
    }


@pytest.mark.parametrize(
    "said, sentence",
    [
        (
            {"kind": "server", "server": "booking-com", "enabled": True},
            "booking-com is not running on this runtime: there is nothing of it to switch.",
        ),
        (
            {"kind": "tool", "server": "kiwi", "tool": "book", "enabled": True},
            "kiwi has no tool book.",
        ),
        (
            {"kind": "skill", "skill": "crawl", "enabled": True},
            "crawl is not a skill this runtime offers.",
        ),
        (
            {"kind": "skills", "skills": ["travel-planning", "crawl"], "enabled": True},
            "crawl is not a skill this runtime offers.",
        ),
        (
            {"kind": "codemode", "enabled": True},
            "Codemode is the application's: this runtime does not switch it for one conversation.",
        ),
        (
            {"kind": "everything", "enabled": True},
            "A switch is one of server, tool, tool_approval, skill, skills, skill_approval, codemode.",
        ),
        (
            {"kind": "skill", "skill": "travel-planning"},
            "A skill switch says enabled, true or false.",
        ),
    ],
)
def test_what_the_runtime_does_not_offer_is_refused_in_a_sentence(
    said: Dict[str, Any], sentence: str
) -> None:
    switched = ConversationSwitches()
    with pytest.raises(SwitchRefused) as refused:
        switched.switch(said, OFFERED)
    assert refused.value.reason == sentence
    assert refused.value.status == 422
    # Nothing half-switched.
    assert switched.as_dict() == ConversationSwitches().as_dict()


@pytest.fixture()
def agent_state(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Two agents, each everything on, nothing approved.

    Yields
    ------
    None
        The state stays set for the test, and is cleared after it.
    """
    monkeypatch.setattr(
        pubsub,
        "_build_default_mcp_enabled_tools_by_server",
        lambda agent_id: {"kiwi": ["feedback", "search-flight"]},
    )
    for agent in ("traveller", "other"):
        pubsub._SKILLS_BY_AGENT[pubsub._stream_key(agent)] = {
            skill: {"id": skill, "status": "enabled", "approved": False}
            for skill in ("travel-planning", "datalayer-memory-add")
        }
    yield
    for agent in ("traveller", "other"):
        pubsub.purge_agent_stream_state(agent)


def test_in_force_for_its_conversations_turn_alone(agent_state: None) -> None:
    switched = _switched(
        {"kind": "tool", "server": "kiwi", "tool": "feedback", "enabled": False},
        {
            "kind": "tool_approval",
            "server": "kiwi",
            "tool": "search-flight",
            "approved": True,
        },
        {"kind": "skill", "skill": "travel-planning", "enabled": False},
        {"kind": "skill_approval", "skill": "datalayer-memory-add", "approved": True},
    )
    assert in_force("traveller") is None
    with conversation_switches("traveller", switched):
        assert in_force("traveller") is switched
        assert pubsub.get_agent_enabled_mcp_tool_names("traveller") == {"search-flight"}
        assert pubsub.get_agent_approved_mcp_tool_names("traveller") == {
            "search-flight"
        }
        assert pubsub.get_agent_enabled_skill_ids("traveller") == {
            "datalayer-memory-add"
        }
        assert pubsub.get_agent_approved_skill_ids("traveller") == {
            "datalayer-memory-add"
        }
        # Another agent's turns are not this conversation's.
        assert in_force("other") is None
        assert pubsub.get_agent_enabled_mcp_tool_names("other") == {
            "feedback",
            "search-flight",
        }
        assert pubsub.get_agent_enabled_skill_ids("other") == {
            "travel-planning",
            "datalayer-memory-add",
        }
    # Outside the turn, the agent's own state: nothing was written to it.
    assert in_force("traveller") is None
    assert pubsub.get_agent_enabled_mcp_tool_names("traveller") == {
        "feedback",
        "search-flight",
    }
    assert pubsub.get_agent_approved_mcp_tool_names("traveller") == set()
    assert pubsub.get_agent_enabled_skill_ids("traveller") == {
        "travel-planning",
        "datalayer-memory-add",
    }


def test_what_is_offered_is_what_runs_and_what_is_active(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        switches,
        "_equipment_of",
        lambda agent: {
            "mcp_servers": [
                {"id": "kiwi", "state": "started"},
                {"id": "booking-com", "state": "left_out"},
            ],
            "skills": [
                {"id": "travel-planning", "state": "active"},
                {"id": "crawl", "state": "not_activated"},
            ],
        },
    )
    monkeypatch.setattr(
        switches,
        "_running_tools",
        lambda: {"kiwi": {"search-flight"}, "booking-com": {"book"}},
    )
    assert switches.offered_of("traveller") == Offered(
        servers={"kiwi": frozenset({"search-flight"})},
        skills=frozenset({"travel-planning"}),
    )
    monkeypatch.setattr(switches, "_equipment_of", lambda agent: None)
    with pytest.raises(SwitchRefused) as refused:
        switches.offered_of("nobody")
    assert refused.value.status == 404


# --- over the wire ----------------------------------------------------------------


def _opened(client: TestClient, thread: str, person: str) -> None:
    run: Dict[str, Any] = {
        "threadId": thread,
        "runId": f"run-{thread}",
        "state": None,
        "messages": [{"id": "m1", "role": "user", "content": "Hi"}],
        "tools": [],
        "context": [],
        "forwardedProps": {},
    }
    events_of(
        client.post(
            "/api/v1/apps/agents/notes-assistant/ag-ui/",
            json=run,
            headers=as_(person),
        )
    )


#: What the catalogue says runs without asking of OFFERED (`guardrails.read_only_tools`).
READ_ONLY = {"overture": ["overture_search_places"]}


def _unswitched() -> Dict[str, Any]:
    """A conversation's answer before it switched anything."""
    return {**ConversationSwitches().as_dict(), "mcp_read_only": READ_ONLY}


@pytest.fixture()
def offered(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(switches, "offered_of", lambda agent: OFFERED)
    monkeypatch.setattr(switches, "read_only_of", lambda offered: READ_ONLY)


def test_a_conversations_switches_are_its_own(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    offered: None,
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    _opened(remote, "thread-ada-01", "ada")
    _opened(remote, "thread-bob-01", "bob")
    url = "/api/v1/apps/sessions/thread-ada-01/switches"
    switched = remote.put(
        url,
        headers=as_("ada"),
        json={"kind": "skill", "skill": "travel-planning", "enabled": False},
    )
    assert switched.status_code == 200, switched.text
    assert switched.json()["skills"] == {"travel-planning": False}
    # Beside the switches, the tools that run without asking unless switched.
    assert switched.json()["mcp_read_only"] == READ_ONLY
    assert remote.get(url, headers=as_("ada")).json()["skills"] == {
        "travel-planning": False
    }
    # Somebody else's conversation is not said to exist, and is untouched.
    assert (
        remote.put(
            url,
            headers=as_("bob"),
            json={"kind": "skill", "skill": "travel-planning", "enabled": True},
        ).status_code
        == 404
    )
    assert remote.get(url, headers=as_("bob")).status_code == 404
    bobs = remote.get(
        "/api/v1/apps/sessions/thread-bob-01/switches", headers=as_("bob")
    ).json()
    assert bobs == _unswitched()
    # Nobody unnamed.
    assert remote.get(url).status_code == 401
    # No such conversation.
    assert (
        remote.get(
            "/api/v1/apps/sessions/thread-none-01/switches", headers=as_("ada")
        ).status_code
        == 404
    )


def test_a_refused_switch_says_why(
    runtime: Runtime,  # noqa: F811 - the fixture
    local: TestClient,  # noqa: F811 - the fixture
    offered: None,
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    _opened(local, "thread-0001", "ada")
    refused = local.put(
        "/api/v1/apps/sessions/thread-0001/switches",
        json={"kind": "server", "server": "booking-com", "enabled": True},
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "booking-com is not running on this runtime: there is nothing of it to switch.",
    )


def test_its_switches_are_in_force_for_its_turns(
    runtime: Runtime,  # noqa: F811 - the fixture
    local: TestClient,  # noqa: F811 - the fixture
    offered: None,
) -> None:
    model = runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    seen: List[Any] = []
    said = model.said

    def said_with_switches(messages: Any) -> str:
        found = in_force("notes-assistant")
        seen.append(found.as_dict() if found else None)
        return said(messages)

    model.said = said_with_switches  # type: ignore[method-assign]
    _opened(local, "thread-0001", "ada")
    assert (
        local.put(
            "/api/v1/apps/sessions/thread-0001/switches",
            json={
                "kind": "tool",
                "server": "kiwi",
                "tool": "feedback",
                "enabled": False,
            },
        ).status_code
        == 200
    )
    assert seen[-1] == ConversationSwitches().as_dict()
    events_of(
        local.post("/api/v1/apps/sessions/thread-0001/messages", json={"text": "Again"})
    )
    assert seen[-1]["mcp_tools"] == {"kiwi": ["search-flight"]}
    # Outside its turns, nobody's.
    assert in_force("notes-assistant") is None


def test_a_visitors_switches_are_their_conversations_alone(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    offered: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two visitors of one deployment: each switches their own conversation, with their own token."""
    from agent_runtimes.apps import sessions
    from agent_runtimes.apps.callers import Caller
    from agent_runtimes.apps.loading import load_app
    from agent_runtimes.routes import apps as routes
    from agent_runtimes.tests.test_session_who_may import KindsVerifier

    monkeypatch.setattr(routes, "VERIFIER", KindsVerifier())
    monkeypatch.setattr(routes, "_reaches", lambda caller, agent: None)
    runtime.make(
        "notes-assistant",
        ASSISTANT,
        {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 3},
    )
    for uid, visitor in (("session-v001", "visitor-1"), ("session-v002", "visitor-2")):
        sessions.new_session(
            agent_id="notes-assistant",
            app=load_app(ASSISTANT),
            instance={"app_uid": "app-1", "deployment_uid": "dep-1", "version": 3},
            opened_by=Caller(
                kind="visitor", uid=visitor, visit=f"visit-{visitor}", app_uid="app-1"
            ),
            acts_as={"kind": "person", "uid": visitor},
            uid=uid,
        )
    switched = remote.put(
        "/api/v1/apps/sessions/session-v001/switches",
        headers=as_("visitor-1"),
        json={"kind": "server", "server": "kiwi", "enabled": False},
    )
    assert switched.status_code == 200, switched.text
    assert switched.json()["mcp_tools"] == {"kiwi": []}
    # The other visitor's conversation: theirs, unswitched, and the first
    # visitor's not theirs to switch.
    assert (
        remote.get(
            "/api/v1/apps/sessions/session-v002/switches", headers=as_("visitor-2")
        ).json()
        == _unswitched()
    )
    assert (
        remote.put(
            "/api/v1/apps/sessions/session-v001/switches",
            headers=as_("visitor-2"),
            json={"kind": "server", "server": "kiwi", "enabled": True},
        ).status_code
        == 404
    )

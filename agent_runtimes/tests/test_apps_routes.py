# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications on a runtime (LOOP R-03): configure, refuse, and decide.

`POST /api/v1/apps/configure` runs an application's agent with what the
application says differently; the agent creation itself is stubbed here — what
is checked is what it is asked for, and that what the builder's checks refuse
is refused before anything is created.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from reactor import ContributionRegistry

from agent_runtimes.loop.apps import plugins
from agent_runtimes.loop.apps.loading import (
    AppNotRunnable,
    agent_id_of,
    connected_server_ids,
    load_app,
)
from agent_runtimes.routes import apps as routes

pytest.importorskip("agentspecs.apps")

WEB_RESEARCH = {
    "schema": "loop.app/v1",
    "id": "web-research",
    "name": "Web Research",
    "kind": "chat",
    "emoji": "\U0001f50e",
    "agent": "cog-crawler:0.0.1",
    "model": "bedrock:us.anthropic.claude-sonnet-4-6",
    "instructions": "Open what you cite.",
    "connections": [{"server": "tavily:0.0.1"}],
}

TRIAGE_LIKE = {
    "schema": "loop.app/v1",
    "id": "mail",
    "name": "Mail",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "connections": [
        {"server": "google-workspace:0.0.1", "access": "write", "only": ["*gmail*"]}
    ],
    "rules": [
        {
            "action": "Delete anything",
            "applies_to": "delete",
            "behaviour": "leave_to_me",
        }
    ],
}


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Any:
    from agent_runtimes.app import create_app
    from agent_runtimes.routes import agents

    created: list[Any] = []

    async def create_agent(request: Any, http_request: Any) -> dict:
        created.append(request)
        return {"id": request.name}

    async def delete_agent(name: str) -> None:
        return None

    monkeypatch.setattr(agents, "create_agent", create_agent)
    monkeypatch.setattr(agents, "delete_agent", delete_agent)
    monkeypatch.setattr(agents, "_emit_agent_assigned_event", lambda **kwargs: None)
    monkeypatch.setitem(agents._agentspecs, "default", None)
    routes._RUNNING.clear()
    monkeypatch.setattr(plugins, "REGISTRY", ContributionRegistry())
    with TestClient(create_app(), client=("127.0.0.1", 50000)) as test_client:
        test_client.created = created
        yield test_client
    routes._RUNNING.clear()


def test_an_application_is_read_validated_and_typed_for_the_runtime() -> None:
    app = load_app(WEB_RESEARCH)
    assert (app.id, app.interface.layout, app.emoji) == (
        "web-research",
        "chat",
        "\U0001f50e",
    )
    assert agent_id_of(app) == "cog-crawler"
    assert connected_server_ids(app) == ["tavily"]
    rules = load_app(TRIAGE_LIKE).rules
    assert rules[0].applies_to == ["delete"]
    with pytest.raises(AppNotRunnable) as refused:
        load_app({**WEB_RESEARCH, "agent": "no-such-agent"})
    assert refused.value.problems == ["There is no agent or Cog named 'no-such-agent'."]


def test_configure_runs_the_applications_agent_with_what_it_says(client: Any) -> None:
    response = client.post("/api/v1/apps/configure", json={"app": WEB_RESEARCH})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["app"] == {
        "id": "web-research",
        "version": "0.0.1",
        "name": "Web Research",
        "emoji": "\U0001f50e",
    }
    [request] = client.created
    assert request.agent_spec_id == "cog-crawler"
    assert request.model == "bedrock:us.anthropic.claude-sonnet-4-6"
    assert request.app_spec == WEB_RESEARCH
    # Spoken to over AG-UI by its page and the terminal, whatever the runtime
    # started its default agent on.
    assert request.transport == "ag-ui"
    current = client.get("/api/v1/apps/current").json()
    assert (current["id"], current["kind"]) == ("web-research", "chat")


def test_what_the_builders_checks_refuse_is_refused_before_anything_runs(
    client: Any,
) -> None:
    response = client.post(
        "/api/v1/apps/configure", json={"app": {**WEB_RESEARCH, "colour": "red"}}
    )
    assert response.status_code == 422
    assert "colour is not a field" in response.json()["detail"]["problems"][0]
    assert client.created == []
    assert client.get("/api/v1/apps/current").status_code == 404


def test_decide_says_what_the_application_would_do_without_doing_it(
    client: Any,
) -> None:
    assert client.post("/api/v1/apps/decide", json={"tool": "x"}).status_code == 404
    client.post("/api/v1/apps/configure", json={"app": TRIAGE_LIKE})
    archive = client.post(
        "/api/v1/apps/decide",
        json={
            "tool": "google-workspace__modify_gmail_message_labels",
            "arguments": {"remove_label_ids": ["INBOX"]},
        },
    ).json()
    assert archive["behaviour"] == "ask_first"
    trash = client.post(
        "/api/v1/apps/decide",
        json={
            "tool": "google-workspace__modify_gmail_message_labels",
            "arguments": {"add_label_ids": ["TRASH"]},
        },
    ).json()
    assert (trash["behaviour"], trash["rule"]) == ("leave_to_me", "Delete anything")
    assert trash["sentence"] == "Your rule “Delete anything”: leave it to you."
    drive = client.post(
        "/api/v1/apps/decide", json={"tool": "search_drive_files"}
    ).json()
    assert (drive["behaviour"], drive["because"]) == ("leave_to_me", "left_out")


def test_the_runtime_lists_applications_from_reactor_and_runs_its_own(
    client: Any,
) -> None:
    listed = client.get("/api/v1/apps").json()["apps"]
    assert "web-research" in {app["id"] for app in listed}
    edited = {**WEB_RESEARCH, "name": "Web research, edited"}
    assert (
        client.post("/api/v1/apps/configure", json={"app": edited}).status_code == 200
    )
    assert client.get("/api/v1/apps/current").json()["name"] == "Web research, edited"
    names = {
        app["id"]: app["name"] for app in client.get("/api/v1/apps").json()["apps"]
    }
    assert names["web-research"] == "Web research, edited"
    assert plugins.REGISTRY.get(plugins.APP_POINT, plugins=["loop-app-web-research"])


def test_feedback_on_a_conversation_is_kept_in_the_record(
    client: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """LOOP V-18: a thumb and a comment, through the recorder of the session."""
    from agent_runtimes.loop.apps.record import AppRecorder

    keeps = {**WEB_RESEARCH, "record": {"include": ["outputs", "feedback"]}}
    assert client.post("/api/v1/apps/configure", json={"app": keeps}).status_code == 200
    sent: list = []

    async def send(body: dict) -> None:
        sent.append(body)

    recorder = AppRecorder(app=load_app(keeps), app_uid="app-7", send=send)
    recorder.start("thread-7")
    answer = client.post(
        "/api/v1/apps/feedback",
        json={"session": "thread-7", "liked": True, "comment": "Clear."},
    )
    assert answer.status_code == 200, answer.text
    assert answer.json() == {"kept": True, "summary": "Liked it: Clear."}
    assert sent[0]["app_uid"] == "app-7"
    assert sent[0]["entries"][0]["payload"] == {
        "liked": True,
        "comment": "Clear.",
        "by": "local",
    }
    # A conversation it did not record, here, is not one to answer for.
    unknown = client.post(
        "/api/v1/apps/feedback", json={"session": "nowhere", "liked": False}
    )
    assert unknown.status_code == 404
    assert "No conversation nowhere" in unknown.json()["detail"]


def test_feedback_is_refused_when_the_application_keeps_none(client: Any) -> None:
    from agent_runtimes.loop.apps.record import AppRecorder

    assert (
        client.post("/api/v1/apps/configure", json={"app": WEB_RESEARCH}).status_code
        == 200
    )

    async def send(body: dict) -> None:
        raise AssertionError("nothing is sent")

    recorder = AppRecorder(app=load_app(WEB_RESEARCH), send=send)
    recorder.start("thread-8")
    refused = client.post(
        "/api/v1/apps/feedback", json={"session": "thread-8", "liked": True}
    )
    assert refused.status_code == 409
    assert "keeps no feedback" in refused.json()["detail"]


TABLE_OFF = (
    "The UI plugin “A2UI” is not enabled, and its page uses its block Table: "
    "it is off the Canvas until it is."
)


def test_configure_says_a_block_of_a_plugin_its_organization_turned_off(
    client: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx

    asked: list[tuple[str, dict]] = []

    def get(url: str, headers: dict, timeout: float) -> httpx.Response:
        asked.append((url, headers))
        return httpx.Response(200, json={"success": True, "plugins_off": ["a2ui"]})

    monkeypatch.setattr(httpx, "get", get)
    with_table = {**WEB_RESEARCH, "interface": {"components": ["Table"]}}
    response = client.post(
        "/api/v1/apps/configure",
        json={"app": with_table, "organization_uid": "01ORG", "user_token": "t"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert TABLE_OFF in body["setup"]
    assert body["plugins_off_says"] == "Organization 01ORG has turned off: a2ui."
    [(url, headers)] = asked
    assert url.endswith("/api/iam/v1/organizations/01ORG/plugins-off")
    assert headers == {"Authorization": "Bearer t"}


def test_configure_with_no_organization_takes_none_off_and_says_so(client: Any) -> None:
    with_table = {**WEB_RESEARCH, "interface": {"components": ["Table"]}}
    body = client.post("/api/v1/apps/configure", json={"app": with_table}).json()
    assert TABLE_OFF not in body["setup"]
    assert body["plugins_off_says"].startswith("No organization was named")

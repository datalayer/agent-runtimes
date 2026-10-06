# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop apps deploy` (LOOP S-06): the Studio's deployments, from a terminal."""

import json
from typing import Any

import httpx
import pytest

from agent_runtimes.loop.apps.deployments import (
    Deployments,
    DeployRefused,
    deploy,
    deployment_of,
    slug_of,
    slug_problem,
    version_of_model,
)


class FakeSpacer:
    """The Spacer's items and ai-agents' deployments, as much as a deployment touches."""

    def __init__(self) -> None:
        self.items: dict[str, dict[str, Any]] = {
            "app-1": {
                "uid": "app-1",
                "type_s": "app",
                "name_t": "Web Research",
                "metadata_s": json.dumps({"space": "space-1"}),
                "model_s": json.dumps(
                    {"format": "loop.app.item/v1", "spec": {}, "state": {"revision": 3}}
                ),
            }
        }
        self.deployments: dict[str, dict[str, Any]] = {}
        self.created = 0

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.startswith("/api/ai-agents/v1/apps/deployments"):
            return self.agents(
                request, path.removeprefix("/api/ai-agents/v1/apps/deployments")
            )
        path = path.removeprefix("/api/spacer/v1")
        if request.method == "GET" and path.startswith("/lexicals/"):
            uid = path.split("/")[2]
            if uid not in self.items:
                return httpx.Response(404, json={"success": False, "message": "no"})
            return httpx.Response(
                200, json={"success": True, "document": self.items[uid]}
            )
        if request.method == "PUT" and path.endswith("/model"):
            uid = path.split("/")[2]
            self.items[uid]["model_s"] = json.loads(request.content)["model"]
            return httpx.Response(200, json={"success": True})
        return httpx.Response(405)

    def agents(self, request: httpx.Request, rest: str) -> httpx.Response:
        if request.method == "GET" and not rest:
            return httpx.Response(
                200,
                json={"success": True, "deployments": list(self.deployments.values())},
            )
        if request.method == "POST" and not rest:
            body = json.loads(request.content)
            if any(d["slug"] == body["slug"] for d in self.deployments.values()):
                return httpx.Response(
                    422, json={"detail": "already the address of an application"}
                )
            self.created += 1
            uid = f"dep-{self.created}"
            self.deployments[uid] = {**body, "uid": uid, "state": "live"}
            return httpx.Response(
                200, json={"success": True, "deployment": self.deployments[uid]}
            )
        uid = rest.strip("/")
        if uid not in self.deployments:
            return httpx.Response(404, json={"detail": "Deployment not found"})
        if request.method == "PATCH":
            self.deployments[uid].update(json.loads(request.content))
            return httpx.Response(
                200, json={"success": True, "deployment": self.deployments[uid]}
            )
        if request.method == "DELETE":
            del self.deployments[uid]
            return httpx.Response(200, json={"success": True})
        return httpx.Response(405)


@pytest.fixture
def spacer() -> FakeSpacer:
    return FakeSpacer()


@pytest.fixture
def deployments(spacer: FakeSpacer) -> Deployments:
    client = httpx.Client(transport=httpx.MockTransport(spacer.handle))
    return Deployments("http://spacer", "token", client=client)


def test_a_first_deploy_creates_it_at_an_address_from_its_name(deployments, spacer):
    deployment, done = deploy(deployments, "app-1")
    assert done == "created"
    assert (deployment.version, deployment.slug, deployment.state) == (
        3,
        "web-research",
        "live",
    )
    stored = spacer.deployments[deployment.uid]
    assert (stored["app_uid"], stored["space_uid"], stored["app_name"]) == (
        "app-1",
        "space-1",
        "Web Research",
    )


def test_another_version_moves_it_and_the_same_one_changes_nothing(deployments):
    first, _ = deploy(deployments, "app-1", slug="desk")
    moved, done = deploy(deployments, "app-1", version=2)
    assert (done, moved.uid, moved.version, moved.slug) == (
        "moved",
        first.uid,
        2,
        "desk",
    )
    _, done = deploy(deployments, "app-1", version=2)
    assert done == "unchanged"


def test_a_paused_deployment_is_resumed(deployments, spacer):
    first, _ = deploy(deployments, "app-1")
    spacer.deployments[first.uid]["state"] = "paused"
    resumed, done = deploy(deployments, "app-1")
    assert (done, resumed.state) == ("resumed", "live")


def test_what_stands_in_the_way_is_said(deployments):
    with pytest.raises(DeployRefused, match="no version 9"):
        deploy(deployments, "app-1", version=9)
    with pytest.raises(DeployRefused, match="lower-case"):
        deploy(deployments, "app-1", slug="Not A Slug")
    deploy(deployments, "app-1", slug="desk")
    with pytest.raises(DeployRefused, match="already at /apps/desk"):
        deploy(deployments, "app-1", slug="other")
    with pytest.raises(DeployRefused, match="could not be read"):
        deploy(deployments, "missing")


def test_an_address_another_account_holds_is_refused_by_ai_agents(deployments, spacer):
    spacer.deployments["theirs"] = {
        "uid": "theirs",
        "app_uid": "x",
        "slug": "desk",
        "version": 1,
    }
    # Theirs is not listed to us in production; the server says no all the same.
    spacer.deployments["theirs"]["app_uid"] = "someone-elses"
    with pytest.raises(DeployRefused):
        deploy(deployments, "app-1", slug="desk")


def test_a_deployment_is_read_as_ai_agents_answers():
    assert slug_of("Web Research!") == "web-research"
    assert slug_problem("", []) and not slug_problem("ok-1", [])
    parsed = deployment_of(
        {"uid": "x", "app_uid": "a", "version": "2", "state": "paused"}
    )
    assert (parsed.version, parsed.state, parsed.target) == (2, "paused", "hosted")
    assert deployment_of(None).version == 1
    assert (
        version_of_model('{"format": "loop.app.item/v1", "state": {"revision": 4}}')
        == 4
    )
    # Another form is refused, not guessed at.
    for older in ('{"version": 4}', "not json", None):
        with pytest.raises(DeployRefused, match="older form"):
            version_of_model(older)


# --- a session of a deployment, woken by its trigger (LOOP R-14) ----------------

DIGEST = {
    "schema": "loop.app/v1",
    "id": "digest",
    "name": "Digest",
    "kind": "worker",
    "agent": "cog-crawler:0.0.1",
    "goal": "A digest of the week's news, every Monday.",
    "triggers": [
        {"type": "once", "at": "launch"},
        {"type": "schedule", "cron": "0 9 * * 1", "prompt": "Write the Monday digest."},
        {"type": "schedule", "cron": "0 18 * * 5", "description": "Sum up the week."},
    ],
}


def test_the_schedules_of_an_application_are_known_by_their_position():
    from agent_runtimes.loop.apps.deployments import ScheduleTrigger, schedule_triggers

    assert schedule_triggers(DIGEST) == [
        ScheduleTrigger(1, "0 9 * * 1", "Write the Monday digest.", ""),
        # No prompt: its description is what the agent is asked.
        ScheduleTrigger(2, "0 18 * * 5", "Sum up the week.", "Sum up the week."),
    ]
    assert schedule_triggers({"triggers": []}) == []
    with pytest.raises(DeployRefused, match="asks its agent nothing"):
        schedule_triggers({"triggers": [{"type": "schedule", "cron": "0 9 * * 1"}]})
    with pytest.raises(DeployRefused, match="says no time"):
        schedule_triggers({"triggers": [{"type": "schedule", "prompt": "Go."}]})


def test_a_woken_session_is_created_with_its_deployment_and_what_woke_it():
    pytest.importorskip("agentspecs.apps")
    from agent_runtimes.loop.apps.deployments import session_payload

    woken = {
        "kind": "schedule",
        "schedule_uid": "sch-1",
        "run_uid": "run-1",
        "cron": "0 9 * * 1",
    }
    payload = session_payload(
        DIGEST, app_uid="app-1", deployment_uid="dep-1", version=4, woken_by=woken
    )
    assert payload["name"] == "digest"
    assert payload["agent_spec_id"] == "cog-crawler"
    assert payload["transport"] == "vercel-ai"
    assert payload["app_spec"] == DIGEST
    assert payload["app_instance"] == {
        "app_uid": "app-1",
        "deployment_uid": "dep-1",
        "version": 4,
        "woken_by": woken,
    }
    with pytest.raises(DeployRefused, match="run by a team"):
        session_payload(
            {
                **{k: v for k, v in DIGEST.items() if k != "agent"},
                "team": "analyze-support-tickets:0.0.1",
            },
            app_uid="app-1",
            deployment_uid="dep-1",
            version=4,
            woken_by=woken,
        )


def _runtime(answers: list[httpx.Response], seen: list[httpx.Request]) -> httpx.Client:
    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return answers.pop(0)

    return httpx.Client(transport=httpx.MockTransport(handle))


def test_a_woken_session_creates_its_agent_then_asks_it(monkeypatch):
    from agent_runtimes.client import agent_client
    from agent_runtimes.loop.apps.deployments import start_session

    asked: list[dict] = []
    monkeypatch.setattr(
        agent_client,
        "run_cloud_agent_chat",
        lambda **kwargs: (
            asked.append(kwargs) or {"status": "completed", "output": {"text": "Done."}}
        ),
    )
    seen: list[httpx.Request] = []
    # The runtime was just launched: it does not answer at first.
    client = _runtime(
        [
            httpx.Response(503, text="starting"),
            httpx.Response(201, json={"id": "digest"}),
        ],
        seen,
    )
    started = start_session(
        ingress="https://r1.example/jupyter/server/rt-1",
        token="tok",
        payload={"name": "digest", "app_instance": {}},
        prompt="Write the Monday digest.",
        wait_seconds=0,
        client=client,
    )
    assert started == {
        "agent_id": "digest",
        "result": {"status": "completed", "output": {"text": "Done."}},
    }
    assert [str(request.url) for request in seen] == [
        "https://r1.example/agent-runtimes/rt-1/api/v1/agents"
    ] * 2
    assert seen[0].headers["authorization"] == "Bearer tok"
    assert asked[0]["route_candidates"] == ["digest"]
    assert asked[0]["prompt"] == "Write the Monday digest."


def test_a_woken_session_the_runtime_refuses_is_said(monkeypatch):
    from agent_runtimes.loop.apps.deployments import SessionNotStarted, start_session

    seen: list[httpx.Request] = []
    refused = _runtime([httpx.Response(422, json={"detail": "no such agent"})], seen)
    with pytest.raises(SessionNotStarted, match="refused the application"):
        start_session(
            ingress="https://rt",
            token="t",
            payload={"name": "d"},
            prompt="p",
            client=refused,
        )
    silent = _runtime([httpx.Response(502)] * 2, seen)
    with pytest.raises(SessionNotStarted, match="could not be created"):
        start_session(
            ingress="https://rt",
            token="t",
            payload={"name": "d"},
            prompt="p",
            attempts=2,
            wait_seconds=0,
            client=silent,
        )


def test_a_kept_deployment_is_made_as_its_hosted_page_would_make_it():
    """LOOP R-33: the agent on the runtime a deployment is kept on is the
    one the hosted page's chat addresses — the application's id, over AG-UI —
    with the deployment as its instance and nothing woken."""
    pytest.importorskip("agentspecs.apps")
    from agent_runtimes.loop.apps.deployments import kept_payload

    payload = kept_payload(
        DIGEST,
        app_uid="app-1",
        deployment_uid="dep-1",
        version=4,
        organization_uid="org-1",
    )
    assert (payload["name"], payload["transport"]) == ("digest", "ag-ui")
    assert payload["app_spec"] == DIGEST
    assert payload["app_instance"] == {
        "app_uid": "app-1",
        "deployment_uid": "dep-1",
        "version": 4,
        "organization_uid": "org-1",
    }
    assert (
        "organization_uid"
        not in kept_payload(DIGEST, app_uid="app-1", deployment_uid="dep-1", version=4)[
            "app_instance"
        ]
    )
    with pytest.raises(DeployRefused, match="not kept on a runtime yet"):
        kept_payload(
            {
                **{k: v for k, v in DIGEST.items() if k != "agent"},
                "team": "analyze-support-tickets:0.0.1",
            },
            app_uid="app-1",
            deployment_uid="dep-1",
            version=4,
        )


def test_a_kept_agent_is_created_once_and_one_already_there_is_kept():
    from agent_runtimes.loop.apps.deployments import create_agent

    seen: list[httpx.Request] = []
    made = create_agent(
        ingress="https://r1.example/jupyter/server/rt-1",
        token="tok",
        payload={"name": "digest"},
        wait_seconds=0,
        client=_runtime(
            [httpx.Response(503), httpx.Response(201, json={"id": "digest"})], seen
        ),
    )
    assert made == "digest" and len(seen) == 2
    there = create_agent(
        ingress="https://r1.example/jupyter/server/rt-1",
        token="tok",
        payload={"name": "Digest"},
        client=_runtime([httpx.Response(409)], seen),
    )
    assert there == "digest"

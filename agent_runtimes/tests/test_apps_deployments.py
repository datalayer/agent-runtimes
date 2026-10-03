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

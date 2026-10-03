# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop apps deploy` (LOOP S-06): the Studio's deployments, from a terminal."""

import json
from typing import Any

import httpx
import pytest

from agent_runtimes.loop.apps.deployments import (
    DEPLOYMENT_FORMAT,
    Deployments,
    DeployRefused,
    deploy,
    parse_deployment,
    slug_of,
    slug_problem,
    version_of_model,
)


class FakeSpacer:
    """The Spacer's items, as much of them as a deployment touches."""

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
        self.created = 0

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/api/spacer/v1")
        if request.method == "GET" and path == "/spaces/items/types/appdeployment":
            items = [
                {"uid": uid}
                for uid, item in self.items.items()
                if item["type_s"] == "appdeployment"
            ]
            return httpx.Response(200, json={"success": True, "items": items})
        if request.method == "GET" and path.startswith("/lexicals/"):
            uid = path.split("/")[2]
            if uid not in self.items:
                return httpx.Response(404, json={"success": False, "message": "no"})
            return httpx.Response(
                200, json={"success": True, "document": self.items[uid]}
            )
        if request.method == "POST" and path == "/lexicals":
            body = request.content.decode()
            assert 'name="spaceId"' in body and "space-1" in body
            self.created += 1
            uid = f"dep-{self.created}"
            content = body.split('filename="deployment.json"')[1]
            content = content[content.index("{") : content.rindex("}") + 1]
            self.items[uid] = {
                "uid": uid,
                "type_s": "appdeployment",
                "model_s": content,
            }
            return httpx.Response(200, json={"success": True, "document": {"uid": uid}})
        if request.method == "PUT" and path.endswith("/model"):
            uid = path.split("/")[2]
            self.items[uid]["model_s"] = json.loads(request.content)["model"]
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
    stored = json.loads(spacer.items[deployment.uid]["model_s"])
    assert stored["format"] == DEPLOYMENT_FORMAT and stored["app"] == "app-1"


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
    model = json.loads(spacer.items[first.uid]["model_s"])
    spacer.items[first.uid]["model_s"] = json.dumps({**model, "state": "paused"})
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


def test_the_format_is_the_studios():
    assert slug_of("Web Research!") == "web-research"
    assert slug_problem("", []) and not slug_problem("ok-1", [])
    assert parse_deployment("x", '{"format": "other", "app": "a"}') is None
    parsed = parse_deployment(
        "x",
        {"format": DEPLOYMENT_FORMAT, "app": "a", "version": "2", "state": "paused"},
    )
    assert parsed and (parsed.version, parsed.state, parsed.target) == (
        2,
        "paused",
        "hosted",
    )
    # A definition written before the new format keeps its version at the top.
    assert version_of_model('{"version": 4}') == 4
    assert version_of_model("not json") == 1

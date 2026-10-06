# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop apps pull` and `push` (LOOP S-04): the same file in a repository and in the Studio."""

import json

import httpx
import pytest

from agent_runtimes.loop.apps.deployments import DeployRefused
from agent_runtimes.loop.apps.store import APP_ITEM_FORMAT, AppStore, pull, push
from agent_runtimes.tests.test_apps_deployments import FakeSpacer

SOURCE = "# The desk.\nschema: loop.app/v1\nid: desk\nname: Desk\nkind: chat\n"
SPEC = {"schema": "loop.app/v1", "id": "desk", "name": "Desk", "kind": "chat"}


class Spacer(FakeSpacer):
    def __init__(self) -> None:
        super().__init__()
        self.items["app-1"]["model_s"] = json.dumps(
            {
                "format": APP_ITEM_FORMAT,
                "spec": SPEC,
                "state": {"revision": 3, "example": "x"},
                "source": SOURCE,
            }
        )
        self.renamed: list[dict] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/api/spacer/v1")
        if request.method == "PUT" and path == "/lexicals/app-1":
            self.renamed.append(json.loads(request.content))
            return httpx.Response(200, json={"success": True})
        if request.method == "POST" and path == "/lexicals":
            body = request.content.decode()
            if "appversion" in body:
                self.created += 1
                uid = f"ver-{self.created}"
                content = body.split('filename="app-version.json"')[1]
                content = content[content.index("{") : content.rindex("}") + 1]
                self.items[uid] = {
                    "uid": uid,
                    "type_s": "appversion",
                    "model_s": content,
                }
                return httpx.Response(
                    200, json={"success": True, "document": {"uid": uid}}
                )
        return super().handle(request)

    def model(self) -> dict:
        return json.loads(self.items["app-1"]["model_s"])


@pytest.fixture
def spacer() -> Spacer:
    return Spacer()


@pytest.fixture
def store(spacer: Spacer) -> AppStore:
    return AppStore(
        "http://spacer",
        "t",
        client=httpx.Client(transport=httpx.MockTransport(spacer.handle)),
    )


def test_pull_writes_the_text_the_studio_keeps(store):
    assert pull(store, "app-1") == (SOURCE, 3, None)


def test_the_same_file_pushed_changes_nothing(store, spacer):
    assert push(store, "app-1", SOURCE) == (3, "unchanged")
    assert not [i for i in spacer.items.values() if i["type_s"] == "appversion"]


def test_a_comment_changed_is_saved_without_a_new_version(store, spacer):
    assert push(store, "app-1", "# Another comment.\n" + SOURCE) == (3, "rewritten")
    assert spacer.model()["source"].startswith("# Another comment.")
    assert spacer.model()["state"]["revision"] == 3


def test_a_changed_specification_is_the_next_version_and_the_last_is_kept(
    store, spacer
):
    text = SOURCE.replace("name: Desk", "name: Front desk")
    assert push(store, "app-1", text) == (4, "saved")
    model = spacer.model()
    assert model["spec"]["name"] == "Front desk"
    assert model["state"] == {"revision": 4, "example": "x"}
    kept = [i for i in spacer.items.values() if i["type_s"] == "appversion"]
    assert len(kept) == 1 and json.loads(kept[0]["model_s"])["spec"] == SPEC
    assert spacer.renamed == [{"name": "Front desk", "description": ""}]


def test_an_application_in_the_older_form_is_refused(store, spacer):
    spacer.items["app-1"]["model_s"] = json.dumps({"version": 2, "question": "?"})
    with pytest.raises(DeployRefused, match="older form"):
        pull(store, "app-1")
    with pytest.raises(DeployRefused, match="older form"):
        push(store, "app-1", SOURCE)


# --- P-10: an app.py kept in the application's item ------------------------------

CODE = {"file": "app.py", "text": "from agent_runtimes.loop.apps import Application\n"}


def test_an_app_py_is_kept_beside_its_spec_and_versioned_with_it(store, spacer):
    built = "# Built from app.py by `loop apps build`\n" + SOURCE
    assert push(store, "app-1", built, code=CODE) == (4, "saved")
    assert spacer.model()["code"] == CODE
    assert pull(store, "app-1") == (built, 4, CODE)
    # The same file again: nothing.
    assert push(store, "app-1", built, code=CODE) == (4, "unchanged")
    # The file changed, its spec the same: the next version, the last kept with its own.
    changed = {**CODE, "text": CODE["text"] + "# more\n"}
    assert push(store, "app-1", built, code=changed) == (5, "saved")
    kept = [
        json.loads(i["model_s"])
        for i in spacer.items.values()
        if i["type_s"] == "appversion"
    ]
    assert [k.get("code") for k in kept] == [None, CODE]
    # Its spec alone is refused: its code builds it.
    with pytest.raises(DeployRefused, match="written in Python: push its app.py"):
        push(store, "app-1", built)

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``POST /api/v1/spaces/files``: a skill's file kept in the runtime owner's Space.

What datalayer-skills' video skill calls from the sandbox (``save_to_space``,
``record_and_zoom --save``): the file goes into a Dataset of the owner's Space,
with the identity the runtime holds, never a token the caller names. The
Datalayer client is a fake answering the real generated models of Contents.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from datalayer_core.models.contents import (
    CatalogSource,
    DatasetRevision,
    SourceList,
    TransferView,
)
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.routes import spaces

USER = "01HZZZZZZZZZZZZZZZZZZZZZZ0"
DEFAULT_SPACE = "01HZZZZZZZZZZZZZZZZZZZZZZ1"
OTHER_SPACE = "01HZZZZZZZZZZZZZZZZZZZZZZ2"
NOW = "2026-11-13T10:00:00+00:00"


def _source(uid: str, name: str, space_uid: str, revision: str | None) -> CatalogSource:
    return CatalogSource.model_validate(
        {
            "permissions": {
                "effective_access_level": "update",
                "execute": False,
                "is_owner": True,
                "update": True,
                "view": True,
            },
            "source": {
                "capabilities": ["browse", "transfer", "materialize"],
                "configuration": {"kind": "dataset", "current_revision_uid": revision},
                "contract_version": "v1",
                "created_at": NOW,
                "updated_at": NOW,
                "kind": "dataset",
                "name": name,
                "principal_kind": "user",
                "principal_uid": USER,
                "space_uid": space_uid,
                "status": "ready",
                "uid": uid,
            },
        }
    )


class FakeClient:
    """The Datalayer client's Spacer and Contents calls, over an in-memory store."""

    def __init__(self, token: str) -> None:
        self.token = token
        self.spaces: list[dict[str, Any]] = [
            {
                "uid": OTHER_SPACE,
                "handle_s": "research",
                "name_t": "Research",
                "variant_s": "project",
            },
            {
                "uid": DEFAULT_SPACE,
                "handle_s": "library",
                "name_t": "Library",
                "variant_s": "default",
            },
        ]
        self.sources: list[CatalogSource] = []
        self.revisions: dict[str, DatasetRevision] = {}
        self.uploads: list[dict[str, Any]] = []
        self.created_revisions: list[dict[str, Any]] = []
        self._next = 0

    def _uid(self) -> str:
        self._next += 1
        return f"01J{self._next:023d}"

    def _list_spaces(self) -> dict[str, Any]:
        return {"success": True, "spaces": self.spaces}

    def list_content_sources(
        self, *, kind, space_uid, cursor=None, limit=50
    ) -> SourceList:
        items = [
            s
            for s in self.sources
            if s.source.kind == kind and s.source.space_uid == space_uid
        ]
        return SourceList(items=items, next_cursor=None)

    def create_content_source(self, source, *, idempotency_key):
        payload = source.model_dump(mode="json", exclude_unset=True)
        created = _source(self._uid(), payload["name"], payload["space_uid"], None)
        self.sources.append(created)

        class Conditional:
            value = created
            etag = "1"

        return Conditional()

    def upload_dataset_file(
        self, local_path, dataset_uid, path, **options
    ) -> TransferView:
        data = Path(local_path).read_bytes()
        self.uploads.append(
            {"dataset": dataset_uid, "path": path, "data": data, **options}
        )
        return TransferView.model_validate(
            {
                "created_at": NOW,
                "updated_at": NOW,
                "completed_at": NOW,
                "destination_uri": f"dataset://{dataset_uid}/{path}",
                "direction": "upload",
                "expected_checksum": "x",
                "expected_size": len(data),
                "media_type": options["media_type"],
                "object_uid": f"obj-{path}",
                "overwrite_policy": options["overwrite"],
                "part_count": 1,
                "path": path,
                "received_bytes": len(data),
                "source_uid": dataset_uid,
                "status": "succeeded",
                "uid": self._uid(),
                "version_uid": f"ver-{len(self.uploads)}",
            }
        )

    def get_dataset_revision(self, source_uid, revision_uid) -> DatasetRevision:
        return self.revisions[revision_uid]

    def create_dataset_revision(
        self, source_uid, request, *, idempotency_key
    ) -> DatasetRevision:
        payload = request.model_dump(mode="json", exclude_unset=True)
        self.created_revisions.append(payload)
        uid = self._uid()
        revision = DatasetRevision.model_validate(
            {
                "actor_uid": USER,
                "created_at": NOW,
                "file_count": len(payload["files"]),
                "files": [
                    {
                        "checksum": "x",
                        "media_type": "video/mp4",
                        "object_uid": f["object_uid"],
                        "path": f["path"],
                        "size": 1,
                        "uid": self._uid(),
                        "version_uid": f["version_uid"],
                    }
                    for f in payload["files"]
                ],
                "manifest_checksum": "m",
                "origin_kind": payload["origin_kind"],
                "source_uid": source_uid,
                "status": "ready",
                "total_size": 1,
                "uid": uid,
            }
        )
        self.revisions[uid] = revision
        # The Dataset's configuration now names this revision, as Contents does.
        for index, item in enumerate(self.sources):
            if item.source.uid == source_uid:
                self.sources[index] = _source(
                    source_uid, item.source.name, item.source.space_uid, uid
                )
        return revision


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeClient:
    holder: dict[str, FakeClient] = {}

    def factory(token: str) -> FakeClient:
        client = holder.get("client")
        if client is None:
            client = holder["client"] = FakeClient(token)
        client.token = token
        return client

    monkeypatch.setattr(spaces, "client_factory", factory)
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "user-jwt")
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    monkeypatch.setenv("DATALAYER_UI_URL", "https://datalayer.app")
    factory("user-jwt")
    return holder["client"]


def _client(host: str = "127.0.0.1") -> TestClient:
    app = FastAPI()
    app.include_router(spaces.router, prefix="/api/v1")
    return TestClient(app, client=(host, 40000))


def test_a_file_lands_in_the_default_spaces_dataset_with_the_runtimes_identity(
    fake: FakeClient,
) -> None:
    answer = _client().post(
        "/api/v1/spaces/files",
        params={"name": "demo.mp4", "folder": "recordings", "collection": "Videos"},
        content=b"video-bytes",
        headers={"Content-Type": "video/mp4"},
    )
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert fake.token == "user-jwt"
    assert body["space"] == {
        "uid": DEFAULT_SPACE,
        "handle": "library",
        "name": "Library",
    }
    assert body["dataset"]["name"] == "Videos"
    assert body["path"] == "recordings/demo.mp4"
    assert body["media_type"] == "video/mp4"
    assert body["bytes"] == len(b"video-bytes")
    assert body["url"] == f"https://datalayer.app/contents/{body['dataset']['uid']}"
    (source,) = fake.sources
    assert source.source.space_uid == DEFAULT_SPACE
    (upload,) = fake.uploads
    assert upload["data"] == b"video-bytes"
    assert upload["overwrite"] == "new-version"
    assert fake.created_revisions == [
        {
            "origin_kind": "sandbox-result",
            "files": [
                {
                    "object_uid": "obj-recordings/demo.mp4",
                    "version_uid": "ver-1",
                    "path": "recordings/demo.mp4",
                }
            ],
        }
    ]


def test_a_second_file_keeps_the_first_and_the_same_name_is_a_new_version(
    fake: FakeClient,
) -> None:
    client = _client()
    for name, data in (("a.mp4", b"a"), ("b.mp4", b"b"), ("a.mp4", b"a2")):
        answer = client.post(
            "/api/v1/spaces/files",
            params={"name": name, "collection": "Videos"},
            content=data,
        )
        assert answer.status_code == 200, answer.text
    assert len(fake.sources) == 1
    last = fake.created_revisions[-1]["files"]
    assert sorted((f["path"], f["version_uid"]) for f in last) == [
        ("a.mp4", "ver-3"),
        ("b.mp4", "ver-2"),
    ]


def test_a_space_is_named_by_handle_or_uid_and_an_unknown_one_is_not_found(
    fake: FakeClient,
) -> None:
    client = _client()
    by_handle = client.post(
        "/api/v1/spaces/files",
        params={"name": "x.png", "space": "research"},
        content=b"x",
    )
    assert by_handle.status_code == 200, by_handle.text
    assert by_handle.json()["space"]["uid"] == OTHER_SPACE
    assert by_handle.json()["dataset"]["name"] == spaces.DEFAULT_COLLECTION
    unknown = client.post(
        "/api/v1/spaces/files",
        params={"name": "x.png", "space": "nowhere"},
        content=b"x",
    )
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == "No Space of yours is nowhere."


def test_no_default_space_is_said(fake: FakeClient) -> None:
    fake.spaces = [s for s in fake.spaces if s["variant_s"] != "default"]
    answer = _client().post(
        "/api/v1/spaces/files", params={"name": "x.mp4"}, content=b"x"
    )
    assert answer.status_code == 409
    assert "no default Space" in answer.json()["detail"]
    assert fake.uploads == []


def test_without_an_identity_no_space_is_reached(
    fake: FakeClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATALAYER_USER_TOKEN")
    answer = _client().post(
        "/api/v1/spaces/files", params={"name": "x.mp4"}, content=b"x"
    )
    assert answer.status_code == 409
    assert "holds no identity" in answer.json()["detail"]


def test_the_api_key_is_the_identity_of_a_runtime_started_with_one(
    fake: FakeClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATALAYER_USER_TOKEN")
    monkeypatch.setenv("DATALAYER_API_KEY", "the-key")
    answer = _client().post(
        "/api/v1/spaces/files", params={"name": "x.mp4"}, content=b"x"
    )
    assert answer.status_code == 200, answer.text
    assert fake.token == "the-key"


def test_only_the_pods_loopback_keeps_files(fake: FakeClient) -> None:
    answer = _client("10.1.2.3").post(
        "/api/v1/spaces/files", params={"name": "x.mp4"}, content=b"x"
    )
    assert answer.status_code == 403
    assert fake.uploads == []


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"name": "../x.mp4"}, 422),
        ({"name": "a/b.mp4"}, 422),
        ({"name": ".hidden"}, 422),
        ({"name": "x.mp4", "folder": "a/../b"}, 422),
    ],
)
def test_a_name_or_folder_that_is_a_path_is_refused(
    fake: FakeClient, params: dict[str, str], status: int
) -> None:
    answer = _client().post("/api/v1/spaces/files", params=params, content=b"x")
    assert answer.status_code == status
    assert fake.uploads == []


def test_an_empty_file_is_refused(fake: FakeClient) -> None:
    answer = _client().post(
        "/api/v1/spaces/files", params={"name": "x.mp4"}, content=b""
    )
    assert answer.status_code == 422
    assert fake.uploads == []

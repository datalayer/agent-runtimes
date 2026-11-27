# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The companion is known by the pod's secret on every runtime it runs beside.

A person's own pool runtime was given no secret (only a deployment's was, with
its proof), so its companion's start hooks reached it as the loopback alone,
which proves nothing (``loopback-no-credential``). The companion now gives the
secret to any runtime, first, and is known by it from then on; the same secret
again is no change, another is refused. A harness's handle, sent as a token
to the routes that ask it themselves, is passed to them unread.

Launch the tests:

```
$ pytest agent_runtimes/tests/test_pod_secret_on_every_runtime.py -v
```
"""

from __future__ import annotations

import asyncio
from typing import Any, Iterator

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.app import create_app
from agent_runtimes.apps import callers, principal
from agent_runtimes.apps.callers import POD_SECRET_HEADER, proves_the_runtime

OUTSIDE = ("203.0.113.9", 50000)
POD = ("127.0.0.1", 50000)
SECRET = "the-pods-secret"
SAID = {POD_SECRET_HEADER: SECRET}


@pytest.fixture(autouse=True)
def clean(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    async def nothing_read(*_: Any) -> None:
        return None

    monkeypatch.setattr(principal, "read_launched_app", nothing_read)
    principal.forget_runtime_proof()
    yield
    principal.forget_runtime_proof()


@pytest.fixture(scope="module")
def app() -> FastAPI:
    return create_app()


def _scope(
    path: str,
    headers: dict[str, str] | None = None,
    client: tuple[str, int] = POD,
    method: str = "PUT",
) -> dict[str, Any]:
    return {
        "type": "http",
        "method": method,
        "path": path,
        "client": client,
        "headers": [
            (k.lower().encode("latin-1"), v.encode("latin-1"))
            for k, v in (headers or {}).items()
        ],
        "query_string": b"",
    }


def _proof(scope: dict[str, Any]) -> callers.Proof:
    return asyncio.run(proves_the_runtime(scope))


def test_a_persons_runtime_takes_the_companions_secret(app: FastAPI) -> None:
    given = TestClient(app, client=POD).put(
        "/api/v1/apps/pod-secret", json={"pod_secret": SECRET}
    )
    assert given.status_code == 200, given.text
    assert given.json() == {"success": True}
    assert principal.holds_a_pod_secret()
    # It is no deployment's runtime for that: it answers as a person's own.
    assert principal.launched_for() == ""
    assert SECRET not in given.text


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/configure/inference/token",
        "/api/v1/configure/social/token",
        "/api/v1/agents/declared-secrets",
        "/api/v1/agents/mcp-servers/start",
    ],
)
def test_the_start_hooks_prove_the_pod_once_it_is_given(path: str) -> None:
    """The four calls the access log named ``loopback-no-credential`` on 27 November 2026."""
    assert _proof(_scope(path, SAID)).reason == "loopback-no-credential"
    principal.give_pod_secret(SECRET)
    assert _proof(_scope(path, SAID)) == callers.Proof(True, kind="pod")
    assert _proof(_scope(path)).reason == "loopback-no-credential"
    assert not _proof(_scope(path, {POD_SECRET_HEADER: "a-guess"})).sufficient
    assert not _proof(_scope(path, SAID, client=OUTSIDE)).sufficient
    passed_on = {**SAID, "X-Forwarded-For": "198.51.100.7"}
    assert not _proof(_scope(path, passed_on)).sufficient


def test_it_is_given_once(app: FastAPI) -> None:
    """What the sandbox would ask, to put a secret of its own once the companion gave one."""
    pod = TestClient(app, client=POD)
    principal.give_pod_secret(SECRET)
    assert (
        pod.put(
            "/api/v1/apps/pod-secret", json={"pod_secret": "the-sandboxes"}
        ).status_code
        == 403
    )
    another = pod.put(
        "/api/v1/apps/pod-secret", json={"pod_secret": "the-sandboxes"}, headers=SAID
    )
    assert another.status_code == 422
    again = pod.put(
        "/api/v1/apps/pod-secret", json={"pod_secret": SECRET}, headers=SAID
    )
    assert again.status_code == 200
    assert principal.pod_secret_is(SECRET)
    assert not principal.pod_secret_is("the-sandboxes")


@pytest.mark.parametrize(
    "client, headers",
    [
        (OUTSIDE, {}),
        (POD, {"X-Forwarded-For": "198.51.100.7"}),
        (POD, {"Origin": "https://elsewhere.example"}),
        (POD, {"Sec-Fetch-Mode": "cors"}),
    ],
)
def test_only_the_pod_itself_gives_it(
    app: FastAPI, client: tuple[str, int], headers: dict[str, str]
) -> None:
    refused = TestClient(app, client=client).put(
        "/api/v1/apps/pod-secret", json={"pod_secret": SECRET}, headers=headers
    )
    assert refused.status_code == 403
    assert not principal.holds_a_pod_secret()


def test_a_blank_secret_is_none(app: FastAPI) -> None:
    blank = TestClient(app, client=POD).put(
        "/api/v1/apps/pod-secret", json={"pod_secret": "  "}
    )
    assert blank.status_code == 422
    assert not principal.holds_a_pod_secret()


def _runtime_proof(deployment: str = "dep-1") -> str:
    return jwt.encode(
        {"sub": "runtime-1", "deployment_uid": deployment},
        "signed-by-the-platform-and-verified-by-ai-agents",
        algorithm="HS256",
    )


def test_a_deployments_proof_comes_after_with_the_same_secret(app: FastAPI) -> None:
    pod = TestClient(app, client=POD)
    principal.give_pod_secret(SECRET)
    unsaid = pod.put(
        "/api/v1/apps/runtime-proof",
        json={"proof": _runtime_proof(), "pod_secret": SECRET},
    )
    assert unsaid.status_code == 403
    another = pod.put(
        "/api/v1/apps/runtime-proof",
        json={"proof": _runtime_proof(), "pod_secret": "another"},
        headers=SAID,
    )
    assert another.status_code == 422
    assert principal.launched_for() == ""
    given = pod.put(
        "/api/v1/apps/runtime-proof",
        json={"proof": _runtime_proof(), "pod_secret": SECRET},
        headers=SAID,
    )
    assert given.status_code == 200, given.text
    assert principal.launched_for() == "dep-1"
    assert principal.pod_secret_is(SECRET)


def test_a_harnesss_handle_is_the_relays_to_ask() -> None:
    """opencode sends its handle as a token: IAM is never asked of it (``token-refused``)."""
    relay = "/api/v1/inference/relay/v1/chat/completions"
    handle = {"Authorization": "Bearer dl-relay-handle"}
    assert _proof(_scope(relay, handle, method="POST")) == callers.Proof(
        True, kind="handle"
    )
    lent = "/api/v1/mcp/lent/github/mcp"
    assert _proof(_scope(lent, handle, method="POST")).kind == "handle"
    assert not _proof(_scope(relay, handle, client=OUTSIDE, method="POST")).sufficient
    passed_on = {**handle, "X-Forwarded-For": "198.51.100.7"}
    assert not _proof(_scope(relay, passed_on, method="POST")).sufficient

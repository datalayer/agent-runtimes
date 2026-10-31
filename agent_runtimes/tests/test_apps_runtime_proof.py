# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A runtime launched for a deployment proves it to ai-agents, and holds its proof.

The platform mints a proof at the launch and the companion gives it, over the
pod's loopback. It is what ai-agents answers a deployment's principal and code
to, for anybody but its owner; it stays in this process's memory, goes to
ai-agents alone, and puts the runtime behind the application's own routes from
its launch.

Launch the tests:

```
$ pytest agent_runtimes/tests/test_apps_runtime_proof.py -v
```
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from types import SimpleNamespace
from typing import Any, Iterator

import jwt
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from agent_runtimes.app import create_app
from agent_runtimes.apps import principal
from agent_runtimes.apps.callers import POD_SECRET_HEADER, is_the_pod
from agent_runtimes.apps.principal import (
    NO_SANDBOX_IN_THIS_PROCESS,
    OWN_ROUTES_ONLY,
    RUNTIME_PROOF_HEADER,
    agent_refused_here,
    forget_runtime_proof,
    give_runtime_proof,
    launched_for,
)
from agent_runtimes.routes.configure import InferenceTokenRequest

OUTSIDE = ("203.0.113.9", 50000)
POD = ("127.0.0.1", 50000)
AI_AGENTS = "https://ai-agents.test"
DEPLOYMENT = "dep-1"
SECRET = "the-pods-secret"
GIVEN = {"pod_secret": SECRET}


def _proof(deployment: str = DEPLOYMENT) -> str:
    return jwt.encode(
        {"sub": "runtime-1", "deployment_uid": deployment},
        "signed-by-the-platform-and-verified-by-ai-agents",
        algorithm="HS256",
    )


@pytest.fixture(autouse=True)
def clean(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", AI_AGENTS)

    async def nothing_read(*_: Any) -> None:
        return None

    monkeypatch.setattr(principal, "read_launched_app", nothing_read)
    forget_runtime_proof()
    yield
    forget_runtime_proof()


@pytest.fixture(scope="module")
def app() -> FastAPI:
    return create_app()


def test_only_the_pod_gives_it(app: FastAPI) -> None:
    outside = TestClient(app, client=OUTSIDE).put(
        "/api/v1/apps/runtime-proof", json={"proof": _proof(), **GIVEN}
    )
    assert outside.status_code == 403
    assert launched_for() == ""
    pod = TestClient(app, client=POD).put(
        "/api/v1/apps/runtime-proof", json={"proof": _proof(), **GIVEN}
    )
    assert pod.status_code == 200, pod.text
    assert pod.json() == {"success": True, "deployment": DEPLOYMENT}
    assert launched_for() == DEPLOYMENT


def test_a_proof_that_names_no_deployment_is_refused(app: FastAPI) -> None:
    pod = TestClient(app, client=POD)
    for proof in ("not-a-token", ""):
        answered = pod.put("/api/v1/apps/runtime-proof", json={"proof": proof, **GIVEN})
        assert answered.status_code == 422
    assert launched_for() == ""


def test_it_is_in_no_environment_and_no_answer(app: FastAPI) -> None:
    proof = _proof()
    answered = TestClient(app, client=POD).put(
        "/api/v1/apps/runtime-proof", json={"proof": proof, **GIVEN}
    )
    assert proof not in answered.text
    assert proof not in json.dumps(dict(os.environ))
    # The pod itself reads its configuration: its proof is not in it.
    pod = TestClient(app, client=POD)
    for path in ("/api/v1/configure", "/api/v1/configure/models", "/health"):
        assert proof not in pod.get(path).text


def test_it_is_sent_for_its_deployment_to_the_ai_agents_it_knew() -> None:
    proof = _proof()
    give_runtime_proof(proof, SECRET)
    assert principal._proved(DEPLOYMENT, AI_AGENTS + "/") == {
        RUNTIME_PROOF_HEADER: proof
    }
    assert principal._proved("another", AI_AGENTS) == {}
    assert principal._proved(DEPLOYMENT, "http://127.0.0.1:9999") == {}


def test_a_changed_environment_does_not_change_where_it_goes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    give_runtime_proof(_proof(), SECRET)
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "http://127.0.0.1:9999")
    assert principal._proved(DEPLOYMENT, "http://127.0.0.1:9999") == {}


class _Answer:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


def test_a_refusal_with_no_proof_is_asked_again_once_it_arrives(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(principal, "RUNTIME_PROOF_WAIT", 5.0)
    asked: list[dict[str, str]] = []

    async def ask(headers: dict[str, str]) -> _Answer:
        asked.append(headers)
        return _Answer(200 if headers else 403)

    async def scenario() -> Any:
        async def late() -> None:
            await asyncio.sleep(0.05)
            give_runtime_proof(_proof(), SECRET)

        giving = asyncio.ensure_future(late())
        answer = await principal._asked_with_proof(DEPLOYMENT, AI_AGENTS, ask)
        await giving
        return answer

    assert asyncio.run(scenario()).status_code == 200
    assert len(asked) == 2 and RUNTIME_PROOF_HEADER in asked[1]


def test_a_refusal_with_its_proof_is_not_asked_again() -> None:
    give_runtime_proof(_proof(), SECRET)
    asked: list[dict[str, str]] = []

    async def ask(headers: dict[str, str]) -> _Answer:
        asked.append(headers)
        return _Answer(403)

    answer = asyncio.run(principal._asked_with_proof(DEPLOYMENT, AI_AGENTS, ask))
    assert answer.status_code == 403 and len(asked) == 1


def test_an_owners_answer_waits_for_no_proof(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(principal, "RUNTIME_PROOF_WAIT", 60.0)

    async def ask(headers: dict[str, str]) -> _Answer:
        return _Answer(200)

    answer = asyncio.run(principal._asked_with_proof(DEPLOYMENT, AI_AGENTS, ask))
    assert answer.status_code == 200


def test_launched_for_a_deployment_it_is_behind_the_applications_routes_at_once(
    app: FastAPI,
) -> None:
    """No agent yet: whoever launched it does not get a runtime of their own to configure."""
    outside = TestClient(app, client=OUTSIDE)
    # A runtime launched for nothing is a person's: it answers them.
    assert outside.get("/api/v1/agents").status_code == 200
    give_runtime_proof(_proof(), SECRET)
    for method, path in (
        ("POST", "/api/v1/agents/sandbox/configure"),
        ("PUT", "/api/v1/configure/inference/token"),
        ("GET", "/api/v1/agents"),
        ("POST", "/api/v1/agents/mcp-servers/start"),
        ("POST", "/api/v1/agents/configure-from-spec"),
    ):
        answered = outside.request(method, path, json={})
        assert answered.status_code == 404, (method, path)
        assert answered.json()["detail"] == OWN_ROUTES_ONLY


def test_from_outside_it_makes_its_deployments_agent_and_no_other() -> None:
    give_runtime_proof(_proof(), SECRET)
    assert agent_refused_here(DEPLOYMENT, None) is None
    assert agent_refused_here(DEPLOYMENT, "jupyter-server") is None
    assert "no other" in str(agent_refused_here("another", None))
    assert "no other" in str(agent_refused_here("", None))
    assert agent_refused_here(DEPLOYMENT, "eval") == NO_SANDBOX_IN_THIS_PROCESS


def test_launched_for_nothing_it_refuses_no_agent() -> None:
    assert agent_refused_here("", "eval") is None


def test_the_route_refuses_another_agent_from_outside(app: FastAPI) -> None:
    give_runtime_proof(_proof(), SECRET)
    answered = TestClient(app, client=OUTSIDE).post(
        "/api/v1/agents",
        json={"name": "somebody-elses", "app_instance": {"deployment_uid": "another"}},
    )
    assert answered.status_code == 403
    assert "no other" in answered.json()["detail"]


def test_no_sandbox_runs_in_this_process_asked_from_the_pod_either(
    app: FastAPI,
) -> None:
    """The sandbox shares the pod's loopback: this is what its code would ask."""
    give_runtime_proof(_proof(), SECRET)
    pod = TestClient(app, client=POD, headers={POD_SECRET_HEADER: SECRET})
    for body in (
        {"variant": "eval"},
        {"variant": "jupyter-server", "jupyter_url": "http://127.0.0.1:9999"},
    ):
        answered = pod.post("/api/v1/agents/sandbox/configure", json=body)
        assert answered.status_code == 403, body
        assert answered.json()["detail"] == NO_SANDBOX_IN_THIS_PROCESS


# --- the pod is not its loopback ---------------------------------------------------

#: What code in the sandbox can ask on the pod's loopback, each a way to the principal.
WHAT_THE_SANDBOX_ASKED = (
    ("POST", "/api/v1/agents/mcp-servers/start"),
    ("POST", "/api/v1/agents/dep-1/mcp-servers/start"),
    ("POST", "/api/v1/agents/configure-from-spec"),
    ("PUT", "/api/v1/configure/inference/token"),
    ("POST", "/api/v1/agents/sandbox/configure"),
    ("GET", "/api/v1/agents"),
    ("POST", "/api/v1/agents"),
)


def test_loopback_alone_is_not_the_pod_on_a_runtime_launched_for_a_deployment(
    app: FastAPI,
) -> None:
    """Code in the sandbox: it shares the pod's loopback, and holds no secret."""
    sandbox = TestClient(app, client=POD)
    # Launched for nothing, this is a person's own runtime: it answers them.
    assert sandbox.get("/api/v1/agents").status_code == 200
    give_runtime_proof(_proof(), SECRET)
    for method, path in WHAT_THE_SANDBOX_ASKED:
        answered = sandbox.request(method, path, json={})
        # Its first agent is still asked for: the route refuses it (403).
        if (method, path) == ("POST", "/api/v1/agents"):
            assert answered.status_code in (403, 422), answered.text
            continue
        assert answered.status_code == 404, (method, path)
        assert answered.json()["detail"] == OWN_ROUTES_ONLY
    wrong = TestClient(app, client=POD, headers={POD_SECRET_HEADER: "a-guess"})
    assert wrong.get("/api/v1/agents").status_code == 404


def test_the_companion_is_answered_by_its_secret_from_the_pod_alone(
    app: FastAPI,
) -> None:
    give_runtime_proof(_proof(), SECRET)
    headers = {POD_SECRET_HEADER: SECRET}
    pod = TestClient(app, client=POD, headers=headers)
    assert pod.get("/api/v1/agents").status_code == 200
    # The secret from outside is nothing: it is the pod's.
    outside = TestClient(app, client=OUTSIDE, headers=headers)
    assert outside.get("/api/v1/agents").status_code == 404


def test_the_sandbox_keeps_its_tool_calls(app: FastAPI) -> None:
    give_runtime_proof(_proof(), SECRET)
    sandbox = TestClient(app, client=POD).get("/api/v1/mcp/proxy/servers")
    assert sandbox.status_code == 200, sandbox.text
    outside = TestClient(app, client=OUTSIDE).get("/api/v1/mcp/proxy/servers")
    assert outside.status_code == 404


def test_its_proof_is_given_once(app: FastAPI) -> None:
    """What the sandbox would ask, to put a proof and a secret of its own."""
    give_runtime_proof(_proof(), SECRET)
    again = TestClient(app, client=POD).put(
        "/api/v1/apps/runtime-proof",
        json={"proof": _proof("another"), "pod_secret": "the-sandboxes"},
    )
    assert again.status_code == 403
    assert launched_for() == DEPLOYMENT
    assert principal.pod_secret_is(SECRET)


def test_its_inference_token_is_the_companions_to_give(app: FastAPI) -> None:
    """A token of the sandbox's, or an empty one: reached past the gate, still refused."""

    async def asgi(secret: str | None) -> int:
        from agent_runtimes.routes.configure import give_inference_token_endpoint

        scope_headers = {POD_SECRET_HEADER: secret} if secret else {}
        request = SimpleNamespace(
            client=SimpleNamespace(host="127.0.0.1"), headers=scope_headers
        )
        try:
            await give_inference_token_endpoint(
                request,
                InferenceTokenRequest(token=" "),
            )
        except HTTPException as refused:
            return refused.status_code
        return 200

    give_runtime_proof(_proof(), SECRET)
    assert asyncio.run(asgi(None)) == 403
    assert asyncio.run(asgi(SECRET)) == 422


def test_loopback_is_no_local_caller_of_the_applications_routes(app: FastAPI) -> None:
    """Its routes answer anybody and ask who calls: the sandbox is not `LOCAL` there."""
    give_runtime_proof(_proof(), SECRET)
    answered = TestClient(app, client=POD).post(
        "/api/v1/apps/principal", json={"deployment": DEPLOYMENT}
    )
    assert answered.status_code == 401


def test_a_proof_comes_with_a_secret(app: FastAPI) -> None:
    pod = TestClient(app, client=POD)
    missing = pod.put("/api/v1/apps/runtime-proof", json={"proof": _proof()})
    assert missing.status_code == 422
    blank = pod.put(
        "/api/v1/apps/runtime-proof", json={"proof": _proof(), "pod_secret": " "}
    )
    assert blank.status_code == 422
    assert launched_for() == ""


def test_launched_for_nothing_loopback_is_the_machine() -> None:
    """A person's runtime, and a developer's localhost, hold nothing of anybody else's."""
    assert is_the_pod("127.0.0.1", None)
    assert not is_the_pod("203.0.113.9", None)


def test_it_is_in_no_environment_and_no_subprocess() -> None:
    give_runtime_proof(_proof(), SECRET)
    assert SECRET not in json.dumps(dict(os.environ))
    told = subprocess.run(  # noqa: S603 - this interpreter, our own line
        [sys.executable, "-c", "import os; print(sorted(os.environ.values()))"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert SECRET not in told.stdout


#: What a harness's command would run, as this user, against the process that holds.
READER = """
import os, sys

pid, secret = sys.argv[1], sys.argv[2].encode()
told = []
for name in ("environ", "maps", "mem"):
    try:
        open(f"/proc/{pid}/{name}", "rb").close()
        told.append(name + "=read")
    except OSError as error:
        told.append(name + "=" + type(error).__name__)
try:
    os.listdir(f"/proc/{pid}/fd")
    told.append("fd=read")
except OSError as error:
    told.append("fd=" + type(error).__name__)
found = False
try:
    with open(f"/proc/{pid}/maps") as maps, open(f"/proc/{pid}/mem", "rb", 0) as mem:
        for line in maps:
            span, perms = line.split()[:2]
            if "r" not in perms or "[v" in line:
                continue
            start, end = (int(part, 16) for part in span.split("-"))
            try:
                mem.seek(start)
                found = found or secret in mem.read(end - start)
            except (OSError, ValueError, OverflowError):
                pass
except OSError:
    pass
print(" ".join(told), "found=" + str(found))
"""

#: A process that holds a value in memory, as this server does, then starts a
#: child of the same user, which is what a harness is.
HOLDER = """
import os, subprocess, sys

from agent_runtimes.apps import principal

if sys.argv[1] == "kept":
    principal._keep_from_this_user()
secret = "held-in-" + "memory-" * 3
done = subprocess.run(
    [sys.executable, "-c", sys.argv[2], str(os.getpid()), secret],
    capture_output=True, text=True, check=True,
)
print(done.stdout)
"""


def _read_as_its_user(mode: str) -> str:
    done = subprocess.run(  # noqa: S603 - this interpreter, our own script
        [sys.executable, "-c", HOLDER, mode, READER],
        capture_output=True,
        text=True,
        check=True,
        timeout=120,
    )
    return done.stdout


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="/proc and prctl")
def test_a_process_of_its_user_reads_nothing_of_a_process_kept_from_it() -> None:
    """A harness's command, in this container, as this user: on real processes."""
    told = _read_as_its_user("kept")
    for name in ("environ", "maps", "mem", "fd"):
        assert f"{name}=PermissionError" in told
    assert "found=False" in told


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="/proc and prctl")
def test_without_it_the_same_process_is_read() -> None:
    """The test above proves something only if this one holds."""
    assert "environ=read" in _read_as_its_user("plain")


def test_a_process_that_cannot_be_kept_holds_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def refused() -> None:
        raise ValueError("This process cannot be made private: refused.")

    monkeypatch.setattr(principal, "_keep_from_this_user", refused)
    with pytest.raises(ValueError, match="private"):
        give_runtime_proof(_proof(), SECRET)
    assert launched_for() == ""

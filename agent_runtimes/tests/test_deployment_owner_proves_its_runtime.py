# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A deployment's owner proves the runtime launched for it is theirs.

On a runtime launched for a deployment (by the proof its companion gave it), a
verified person is its owner when the deployment is theirs, as the platform
says it: the key IAM mints for the deployment's owner to run its runtime names
that deployment, or ai-agents, asked with the person's own token, answers the
deployment to them. An application's token, a visitor's and anybody else's
prove nothing.
"""

from __future__ import annotations

import asyncio
from typing import Any, Iterator

import httpx
import jwt
import pytest

from agent_runtimes.apps import callers, principal
from agent_runtimes.apps.callers import Caller, CallerRefused

DEPLOYMENT = "01DEPLOYMENT"
OWNER = "01OWNER"
LAUNCHER = "01LAUNCHER"
AI_AGENTS = "https://ai-agents.example.com"
ACTOR = "01m8c9a2b3c4d5e6f7g8h9jkmn"


def _key(deployment: str, sub: str = OWNER) -> str:
    """A key IAM mints for a deployment's owner, to run its runtime."""
    return jwt.encode(
        {
            "sub": sub,
            "task_grant_uid": "01GRANT",
            "authorization_details": [
                {
                    "type": callers.DEPLOYMENT_RUNTIME_DETAIL,
                    "deployment_uid": deployment,
                    "environment": "ai-agents-env",
                    "given_name": f"always-on-{deployment[:8]}",
                }
            ],
        },
        "not-verified-here",
        algorithm="HS256",
    )


OWNER_KEY = _key(DEPLOYMENT)
OTHER_DEPLOYMENT_KEY = _key("01ANOTHERDEPLOYMENT")

TOKENS: dict[str, Caller] = {
    OWNER_KEY: Caller(kind="person", uid=OWNER),
    OTHER_DEPLOYMENT_KEY: Caller(kind="person", uid=OWNER),
    "owner-token": Caller(kind="person", uid=OWNER),
    "another-token": Caller(kind="person", uid="01SOMEBODYELSE"),
    "launcher-token": Caller(kind="person", uid=LAUNCHER),
    "principal-token": Caller(kind="principal", uid="01AGENT", app_uid="app"),
    "visitor-token": Caller(kind="visitor", uid="v-1"),
}


class _Verifier:
    async def verify(self, token: str, app_uid: str = "") -> Caller:
        said = TOKENS.get(token)
        if said is None:
            raise CallerRefused(401, "The platform does not accept this token.")
        return said


class _AiAgents:
    """The answer of ai-agents to `GET /apps/deployments/{uid}`, as these tests have it answer."""

    def __init__(self, theirs: dict[str, str]) -> None:
        self.theirs = theirs
        self.asked: list[tuple[str, str]] = []
        self.down = False

    async def __call__(self, url: str, token: str) -> tuple[int, str]:
        self.asked.append((url, token))
        if self.down:
            raise httpx.ConnectError("no route to ai-agents")
        account = self.theirs.get(token)
        return (200, account) if account else (404, "")


@pytest.fixture
def launched(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """A pool runtime launched for DEPLOYMENT, its owner not named to it yet.

    Yields
    ------
    None
        While the test runs; whose the deployment is is forgotten after it.
    """
    monkeypatch.delenv("DATALAYER_USER_UID", raising=False)
    monkeypatch.delenv("DATALAYER_USER_TOKEN", raising=False)
    monkeypatch.delenv("AGENT_RUNTIMES_TARGET", raising=False)
    from agent_runtimes.models import offered

    monkeypatch.setitem(offered._given, "token", None)
    monkeypatch.setattr(
        principal,
        "_PROOF",
        {"deployment_uid": DEPLOYMENT, "ai_agents_url": AI_AGENTS},
    )
    callers.forget_deployment_owners()
    callers.forget_reservation_owner()
    callers.forget_proofs()
    yield
    callers.forget_deployment_owners()
    callers.forget_proofs()


def _proof(token: str) -> tuple[callers.Proof, float]:
    return asyncio.run(callers._proof_of_token(token, _Verifier()))


def _scope(token: str) -> dict[str, Any]:
    return {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/configure/models",
        "client": ("203.0.113.9", 1),
        "headers": [
            (b"authorization", f"Bearer {token}".encode()),
            (b"x-forwarded-for", b"198.51.100.7"),
        ],
        "query_string": b"",
    }


def test_the_owner_s_key_naming_this_deployment_proves_the_runtime_is_theirs(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    ai_agents = _AiAgents({})
    monkeypatch.setattr(callers, "_fetch_deployment_owner", ai_agents)
    proof, seconds = _proof(OWNER_KEY)
    assert proof == callers.Proof(True, kind="owner")
    assert seconds == callers.PROOF_SECONDS
    # IAM's key says it: ai-agents, which answers such a key nothing else, is not asked.
    assert ai_agents.asked == []
    assert callers.deployment_owner_uid() == OWNER
    # The runtime's own owner is left as it was: the deployment's owner is said beside it.
    assert callers.runtime_owner_uid() == ""


def test_the_owner_s_key_proves_it_on_a_runtime_somebody_else_launched(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATALAYER_USER_UID", LAUNCHER)
    monkeypatch.setattr(callers, "_fetch_deployment_owner", _AiAgents({}))
    assert _proof(OWNER_KEY)[0] == callers.Proof(True, kind="owner")
    # Who launched it still proves it is theirs.
    assert _proof("launcher-token")[0] == callers.Proof(True, kind="owner")


def test_a_key_of_another_deployment_proves_nothing(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    ai_agents = _AiAgents({OTHER_DEPLOYMENT_KEY: OWNER})
    monkeypatch.setattr(callers, "_fetch_deployment_owner", ai_agents)
    proof, seconds = _proof(OTHER_DEPLOYMENT_KEY)
    assert proof == callers.Proof(False, reason="another-account")
    assert seconds == callers.PROOF_SECONDS
    assert ai_agents.asked == [] and callers.deployment_owner_uid() == ""


def test_a_key_of_another_deployment_proves_nothing_once_the_owner_is_known(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The same account's key of another deployment, after its owner is remembered,
    and on a runtime assigned to that account: held to its own deployment's runtime."""
    monkeypatch.setattr(callers, "_fetch_deployment_owner", _AiAgents({}))
    assert _proof(OWNER_KEY)[0].sufficient is True
    assert _proof(OTHER_DEPLOYMENT_KEY)[0] == callers.Proof(
        False, reason="another-account"
    )
    monkeypatch.setenv("DATALAYER_USER_UID", OWNER)
    assert _proof(OTHER_DEPLOYMENT_KEY)[0] == callers.Proof(
        False, reason="another-account"
    )


def test_the_owner_s_own_token_proves_it_when_ai_agents_answers_the_deployment_to_them(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    ai_agents = _AiAgents({"owner-token": OWNER})
    monkeypatch.setattr(callers, "_fetch_deployment_owner", ai_agents)
    assert _proof("owner-token")[0] == callers.Proof(True, kind="owner")
    # Asked with the person's own token, at the ai-agents the runtime knew with its proof.
    assert ai_agents.asked == [
        (f"{AI_AGENTS}/api/ai-agents/v1/apps/deployments/{DEPLOYMENT}", "owner-token")
    ]
    # Remembered: asked once, and the owner's key proves it too.
    assert _proof(OWNER_KEY)[0].sufficient is True
    assert _proof("another-token")[0] == callers.Proof(False, reason="another-account")
    assert len(ai_agents.asked) == 1


def test_somebody_else_proves_nothing_and_names_no_owner(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    ai_agents = _AiAgents({"owner-token": OWNER})
    monkeypatch.setattr(callers, "_fetch_deployment_owner", ai_agents)
    proof, seconds = _proof("another-token")
    assert proof == callers.Proof(False, reason="another-account")
    assert seconds == callers.PROOF_SECONDS
    assert callers.deployment_owner_uid() == ""
    assert _proof("owner-token")[0].sufficient is True


def test_ai_agents_answering_somebody_else_s_account_proves_nothing(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        callers, "_fetch_deployment_owner", _AiAgents({"another-token": OWNER})
    )
    assert _proof("another-token")[0] == callers.Proof(False, reason="another-account")
    assert callers.deployment_owner_uid() == ""


def test_ai_agents_not_reached_proves_nothing_and_is_asked_again_soon(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATALAYER_USER_UID", LAUNCHER)
    ai_agents = _AiAgents({"owner-token": OWNER})
    ai_agents.down = True
    monkeypatch.setattr(callers, "_fetch_deployment_owner", ai_agents)
    proof, seconds = _proof("owner-token")
    assert proof == callers.Proof(False, reason="unverifiable")
    assert seconds == callers.PROOF_RETRY_SECONDS
    assert callers.deployment_owner_uid() == ""
    ai_agents.down = False
    assert _proof("owner-token")[0].sufficient is True


@pytest.mark.parametrize("token", ["principal-token", "visitor-token"])
def test_an_application_s_or_a_visitor_s_token_never_asks(
    launched: None, monkeypatch: pytest.MonkeyPatch, token: str
) -> None:
    ai_agents = _AiAgents({token: OWNER})
    monkeypatch.setattr(callers, "_fetch_deployment_owner", ai_agents)
    assert _proof(token)[0] == callers.Proof(False, reason="application-token")
    assert ai_agents.asked == [] and callers.deployment_owner_uid() == ""


def test_a_runtime_launched_for_no_deployment_does_not_ask(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    ai_agents = _AiAgents({"owner-token": OWNER})
    monkeypatch.setattr(callers, "_fetch_deployment_owner", ai_agents)
    monkeypatch.setattr(principal, "_PROOF", {})
    # A key of a deployment's runtime is held to that runtime.
    assert _proof(OWNER_KEY)[0] == callers.Proof(False, reason="another-account")
    assert _proof("owner-token")[0] == callers.Proof(False, reason="owner-unknown")
    assert ai_agents.asked == []


def test_ai_agents_answer_is_read_by_the_deployment_s_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def answer(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer owner-token"
        return httpx.Response(
            200,
            json={
                "success": True,
                "deployment": {"uid": DEPLOYMENT, "account_uid": OWNER},
            },
        )

    transport = httpx.MockTransport(answer)
    real = httpx.AsyncClient

    def client(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        return real(*args, transport=transport, **kwargs)

    monkeypatch.setattr(callers.httpx, "AsyncClient", client)
    url = f"{AI_AGENTS}/api/ai-agents/v1/apps/deployments/{DEPLOYMENT}"
    assert asyncio.run(callers._fetch_deployment_owner(url, "owner-token")) == (
        200,
        OWNER,
    )


@pytest.mark.parametrize("body", [[1, 2], "a sentence", 3, None, {"deployment": [1]}])
def test_an_answer_in_another_shape_names_nobody(
    monkeypatch: pytest.MonkeyPatch, body: Any
) -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=body))
    real = httpx.AsyncClient

    def client(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        return real(*args, transport=transport, **kwargs)

    monkeypatch.setattr(callers.httpx, "AsyncClient", client)
    url = f"{AI_AGENTS}/api/ai-agents/v1/apps/deployments/{DEPLOYMENT}"
    assert asyncio.run(callers._fetch_deployment_owner(url, "owner-token")) == (
        callers.UNEXPECTED_ANSWER,
        "",
    )


@pytest.mark.parametrize("first", ["success", "timeout"])
def test_two_concurrent_first_calls_leave_the_owner_proven(
    launched: None, monkeypatch: pytest.MonkeyPatch, first: str
) -> None:
    """Two first calls of the owner at once, one lookup succeeding and one timing
    out, in either order: the owner stays proven for the calls after them."""
    asked: list[int] = []

    async def fetch(url: str, token: str) -> tuple[int, str]:
        n = len(asked)
        asked.append(n)
        succeeds = (n == 0) == (first == "success")
        await asyncio.sleep(0.05 if n == 0 else 0.1)
        if succeeds:
            return 200, OWNER
        raise httpx.ReadTimeout("ai-agents was slow for this one")

    monkeypatch.setattr(callers, "_fetch_deployment_owner", fetch)

    async def both() -> list[callers.Proof]:
        return list(
            await asyncio.gather(
                callers.proves_the_runtime(_scope("owner-token"), _Verifier()),
                callers.proves_the_runtime(_scope("owner-token"), _Verifier()),
            )
        )

    asyncio.run(both())
    after = asyncio.run(callers.proves_the_runtime(_scope("owner-token"), _Verifier()))
    assert after == callers.Proof(True, kind="owner")
    assert callers.deployment_owner_uid() == OWNER


def _kagent_key(deployment: str, runtime: str) -> str:
    """The key the keeper mints on Kagent: the deployment's, naming the actor's runtime."""
    claims = jwt.decode(_key(deployment), options={"verify_signature": False})
    claims["authorization_details"].append(
        {
            "type": "datalayer_context",
            "kind": "sandbox",
            "uid": runtime,
            "actions": ["write"],
        }
    )
    return jwt.encode(claims, "not-verified-here", algorithm="HS256")


def test_a_deployment_s_key_proves_nothing_on_a_person_s_own_runtime(
    launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Held to its deployment's runtime: on its owner's own runtime (launched for no
    deployment) it proves nothing, while the owner's own token still does."""
    monkeypatch.setattr(principal, "_PROOF", {})
    monkeypatch.setenv("DATALAYER_USER_UID", OWNER)
    assert _proof(OWNER_KEY)[0] == callers.Proof(False, reason="another-account")
    assert _proof("owner-token")[0] == callers.Proof(True, kind="owner")


@pytest.mark.parametrize(
    ("runtime", "proven"),
    [(ACTOR.upper(), True), ("01m8c4f8r89ar40pamvbtjxj4h", False)],
)
def test_on_a_kagent_actor_the_key_naming_its_runtime_proves_it(
    launched: None,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
    runtime: str,
    proven: bool,
) -> None:
    """An actor knows no deployment (no proof reaches it): the keeper's key there
    names the actor's own runtime, and proves nothing on any other."""
    (tmp_path / "actor-name").write_text(f"rt-{ACTOR}\n")
    (tmp_path / "atespace").write_text("datalayer-runtimes\n")
    (tmp_path / "actor-uid").write_text("a1\n")
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "ate")
    monkeypatch.setenv("ATE_SYSTEM_INFO_DIR", str(tmp_path))
    monkeypatch.setattr(principal, "_PROOF", {})
    monkeypatch.setenv("DATALAYER_USER_UID", OWNER)
    key = _kagent_key(DEPLOYMENT, runtime)
    TOKENS[key] = Caller(kind="person", uid=OWNER)
    try:
        assert _proof(key)[0].sufficient is proven
    finally:
        TOKENS.pop(key)

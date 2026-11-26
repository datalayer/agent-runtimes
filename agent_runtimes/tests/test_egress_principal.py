# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A deployment's principal the runtime acts as without holding it.

On a runtime whose sandbox holds no credential (an Agent Substrate actor), the
principal's token is put in at egress for addresses of its own. What these
tests hold, with a gateway that does what the platform's does (it decides on
the host a request names, and replaces the header whatever value was sent):

- the principal is asked for by nobody: what its token says is read through
  the principal's own address, and the token is never in this process;
- a call made as the principal goes to the principal's address; a caller's
  own token, a forged one, goes to the usual address and leaves as it was
  sent;
- the placeholder is nobody's credential: a caller that presents it presents
  nothing;
- a runtime that holds its principal's token (a pool runtime) asks for it and
  sends it exactly as before.
"""

from __future__ import annotations

import asyncio
import base64
import json
import pathlib
import re
import time
from typing import Any

import httpx
import pytest

from agent_runtimes.apps import callers, egress_principal, principal, record
from agent_runtimes.apps.egress_principal import PLACEHOLDER
from agent_runtimes.apps.principal import (
    PrincipalTokenMissing,
    ensure_principal_token,
    forget_principal_token,
    is_held_principal,
    owner_of,
    principal_address,
    principal_token,
    principal_uid_of,
    renew_principal_token,
)

AGENTS = "http://ai-agents-svc.api.svc.cluster.local:4400"
AGENTS_PRINCIPAL = "http://ai-agents-principal-svc.api.svc.cluster.local:4400"
INFERENCE = "http://ai-inference-svc.api.svc.cluster.local:4450"
INFERENCE_PRINCIPAL = "http://ai-inference-principal-svc.api.svc.cluster.local:4450"
IAM = "https://core.example.com"
PRINCIPAL_HOSTS = {
    "ai-agents-principal-svc.api.svc.cluster.local",
    "ai-inference-principal-svc.api.svc.cluster.local",
}


def _jwt(**claims: Any) -> str:
    def part(value: dict) -> str:
        return (
            base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()
        )

    return f"{part({'alg': 'none'})}.{part(claims)}.sig"


#: The principal's token: kept by the gateway, never given to the runtime.
SECRET = _jwt(
    sub="p-1",
    agent_uid="p-1",
    app_uid="app-1",
    account_uid="u-owner",
    task_id="deployment:dep-1:7",
    task_grant_uid="grant-1",
    exp=int(time.time()) + 3600,
)


class Gateway:
    """The egress gateway and what is behind it, as one transport.

    A request to a principal's address has its Authorization replaced by the
    principal's token, whatever it carried; a request to any other address
    allowed leaves as it was sent. Everything is recorded as it left.
    """

    def __init__(self) -> None:
        self.left: list[tuple[str, str, str]] = []
        self.ends = int(time.time()) + 3600
        self.deployment = "dep-1"
        self.refuse = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        authorization = request.headers.get("authorization", "")
        if request.url.host in PRINCIPAL_HOSTS and authorization:
            authorization = f"Bearer {SECRET}"
        self.left.append((request.url.host, request.url.path, authorization))
        if request.url.host not in PRINCIPAL_HOSTS:
            return httpx.Response(401, json={"detail": "judged as the token it is"})
        if self.refuse:
            return httpx.Response(self.refuse, json={"detail": "refused"})
        if request.url.path == egress_principal.CLAIMS_PATH:
            assert authorization == f"Bearer {SECRET}"
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "principal_uid": "p-1",
                    "account_uid": "u-owner",
                    "app_uid": "app-1",
                    "deployment_uid": self.deployment,
                    "expires_at": self.ends,
                    "claims": {
                        "sub": "p-1",
                        "agent_uid": "p-1",
                        "task_grant_uid": "grant-1",
                        "exp": self.ends,
                    },
                },
            )
        return httpx.Response(200, json={"success": True})


@pytest.fixture
def gateway(monkeypatch):
    made = Gateway()
    real = httpx.AsyncClient

    class ThroughTheGateway(real):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs["transport"] = httpx.MockTransport(made)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", ThroughTheGateway)
    return made


@pytest.fixture
def actor(monkeypatch, gateway):
    """An Agent Substrate actor whose template names the principal's addresses.

    Yields
    ------
    Gateway
        The gateway its calls leave through.
    """
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "ate")
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", AGENTS)
    monkeypatch.setenv("DATALAYER_AI_AGENTS_PRINCIPAL_URL", AGENTS_PRINCIPAL)
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", INFERENCE)
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_PRINCIPAL_URL", INFERENCE_PRINCIPAL)
    monkeypatch.setenv("DATALAYER_IAM_URL", IAM)
    monkeypatch.delenv("DATALAYER_USER_TOKEN", raising=False)
    principal.use_asker(None)
    for uid in ("dep-1", "dep-2"):
        forget_principal_token(uid)
    yield gateway
    for uid in ("dep-1", "dep-2"):
        forget_principal_token(uid)


# --- when it applies ------------------------------------------------------------


def test_only_an_actor_told_both_addresses_acts_as_a_principal_it_does_not_hold():
    both = {
        "AGENT_RUNTIMES_TARGET": "ate",
        "DATALAYER_AI_AGENTS_PRINCIPAL_URL": AGENTS_PRINCIPAL,
        "DATALAYER_AI_INFERENCE_PRINCIPAL_URL": INFERENCE_PRINCIPAL + "/",
    }
    assert egress_principal.at_egress(both) is True
    assert egress_principal.inference_principal_url(both) == INFERENCE_PRINCIPAL
    # A pool runtime, whatever its environment says of addresses: never.
    assert egress_principal.at_egress({**both, "AGENT_RUNTIMES_TARGET": ""}) is False
    assert (
        egress_principal.at_egress(
            {k: v for k, v in both.items() if k != "AGENT_RUNTIMES_TARGET"}
        )
        is False
    )
    for missing in (
        "DATALAYER_AI_AGENTS_PRINCIPAL_URL",
        "DATALAYER_AI_INFERENCE_PRINCIPAL_URL",
    ):
        assert (
            egress_principal.at_egress({k: v for k, v in both.items() if k != missing})
            is False
        )
    assert egress_principal.at_egress({}) is False


# --- the principal is read, never held ------------------------------------------


def test_what_the_principal_says_is_read_through_its_own_address_and_its_token_is_never_here(
    actor,
):
    held = asyncio.run(ensure_principal_token("dep-1", "the-caller's-own-token"))
    assert held == PLACEHOLDER == principal_token("dep-1")
    # Asked once, at the principal's address, with the placeholder: the caller's token went nowhere.
    assert [(host, path) for host, path, _ in actor.left] == [
        ("ai-agents-principal-svc.api.svc.cluster.local", egress_principal.CLAIMS_PATH)
    ]
    assert "the-caller's-own-token" not in json.dumps(actor.left)
    # What the runtime needs of the token it does not hold.
    assert owner_of("dep-1") == "u-owner" and principal_uid_of("dep-1") == "p-1"
    assert is_held_principal({"agent_uid": "p-1", "task_grant_uid": "grant-1"})
    assert not is_held_principal(
        {"agent_uid": "p-1", "task_grant_uid": "another-grant"}
    )
    assert not is_held_principal({"agent_uid": "p-2", "task_grant_uid": "grant-1"})
    # The token is nowhere in this process's keeping.
    assert SECRET not in repr(principal._HELD) and "eyJ" not in repr(principal._HELD)
    # Kept: the next request asks nothing.
    asyncio.run(ensure_principal_token("dep-1", None))
    assert len(actor.left) == 1


def test_it_is_read_again_before_it_ends_whoever_calls_and_with_nobodys_token(actor):
    actor.ends = int(time.time()) + 120
    asyncio.run(ensure_principal_token("dep-1", None))
    # Less than the margin left: a visitor's request over A2A, which carries no token to ask with, reads again.
    actor.ends = int(time.time()) + 3600
    asyncio.run(ensure_principal_token("dep-1", None))
    assert (
        len(actor.left) == 2
        and principal._HELD["dep-1"]["expires_at"] > time.time() + 3000
    )
    # Its keeper's renewal reads again too, and answers when it ends.
    assert (
        asyncio.run(renew_principal_token("dep-1", "the-keeper's-key"))
        > time.time() + 3000
    )
    assert "the-keeper's-key" not in json.dumps(actor.left)


def test_another_deployments_principal_is_not_this_agents(actor):
    with pytest.raises(PrincipalTokenMissing, match="is not deployment dep-2's"):
        asyncio.run(ensure_principal_token("dep-2", "owner"))
    assert principal_token("dep-2") is None and owner_of("dep-2") == ""


def test_no_principal_put_in_is_said_and_nothing_is_called(actor):
    actor.refuse = 403
    with pytest.raises(
        PrincipalTokenMissing,
        match="No principal is put in this runtime's calls for deployment dep-1 \\(403\\)",
    ):
        asyncio.run(ensure_principal_token("dep-1", "owner"))
    assert principal_token("dep-1") is None
    # The usual address is never asked for the token in its place.
    assert all(host in PRINCIPAL_HOSTS for host, _, _ in actor.left)


# --- which address a call takes --------------------------------------------------


def test_a_call_made_as_the_principal_goes_to_its_own_address_and_no_other(actor):
    asyncio.run(ensure_principal_token("dep-1", None))
    assert principal_address("dep-1", AGENTS) == AGENTS_PRINCIPAL
    assert (
        principal_address("dep-1", INFERENCE, service="ai-inference")
        == INFERENCE_PRINCIPAL
    )
    # A deployment no agent here serves, and no deployment at all: the usual address.
    assert (
        principal_address("dep-2", AGENTS) == AGENTS
        and principal_address("", AGENTS) == AGENTS
    )


def test_the_record_of_a_deployment_is_written_as_its_principal_and_a_persons_as_themselves(
    actor, monkeypatch
):
    asyncio.run(ensure_principal_token("dep-1", None))
    actor.left.clear()
    asyncio.run(
        record.send_to_ai_agents(
            {
                "app_uid": "app-1",
                "deployment_uid": "dep-1",
                "session_uid": "s",
                "entries": [],
            }
        )
    )
    assert actor.left == [
        (
            "ai-agents-principal-svc.api.svc.cluster.local",
            "/api/ai-agents/v1/apps/records",
            f"Bearer {SECRET}",
        )
    ]
    # A person's own record (a Preview): their own token, to the usual address, as it was sent.
    actor.left.clear()
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "a-person's-own-token")
    with pytest.raises(record.RecordNotSent):
        asyncio.run(
            record.send_to_ai_agents(
                {
                    "app_uid": "app-1",
                    "deployment_uid": "",
                    "session_uid": "s",
                    "entries": [],
                }
            )
        )
    assert actor.left == [
        (
            "ai-agents-svc.api.svc.cluster.local",
            "/api/ai-agents/v1/apps/records",
            "Bearer a-person's-own-token",
        )
    ]


def test_what_a_deployment_tells_its_owner_is_sent_as_its_principal(actor):
    from agent_runtimes.apps import notifications

    asyncio.run(ensure_principal_token("dep-1", None))
    actor.left.clear()
    asyncio.run(
        notifications.send_to_ai_agents(
            {"app_uid": "app-1", "deployment_uid": "dep-1", "notifications": []}
        )
    )
    assert actor.left == [
        (
            "ai-agents-principal-svc.api.svc.cluster.local",
            "/api/ai-agents/v1/apps/notifications",
            f"Bearer {SECRET}",
        )
    ]


def test_what_a_deployment_learns_and_reads_of_its_week_is_asked_as_its_principal(
    actor,
):
    """Its learned skills and its recommendations are asked as its principal, so to
    the principal's address (review of 1.8.8): at the usual one the placeholder is
    nobody's and every such call was refused."""
    from agent_runtimes.apps import learning
    from agent_runtimes.tools import recommendations

    asyncio.run(ensure_principal_token("dep-1", None))
    actor.left.clear()
    asyncio.run(
        learning.ask_ai_agents(
            "/skills/approved",
            {"app_uid": "app-1", "deployment_uid": "dep-1"},
            principal_token("dep-1") or "",
        )
    )
    asyncio.run(recommendations._deployment_recommendations("dep-1", 7))
    assert actor.left == [
        (
            "ai-agents-principal-svc.api.svc.cluster.local",
            "/api/ai-agents/v1/apps/skills/approved",
            f"Bearer {SECRET}",
        ),
        (
            "ai-agents-principal-svc.api.svc.cluster.local",
            "/api/ai-agents/v1/apps/deployments/dep-1/recommendations",
            f"Bearer {SECRET}",
        ),
    ]


def test_the_events_of_a_deployments_agent_are_asked_as_its_principal(
    actor, monkeypatch
):
    """The owner events route acts as the deployment's principal on its runtime: to
    the principal's address, the checked path unchanged; a person's identity keeps
    the usual address."""
    from agent_runtimes.routes import owner

    asked: list[str] = []

    async def recorded(service: str, method: str, url: str, token: str = "", **kw: Any):
        """Ask nothing: record the address asked."""
        asked.append(url)
        return httpx.Response(200, json={"events": []})

    monkeypatch.setattr(owner, "_asked", recorded)
    monkeypatch.setattr(owner, "_runtime_agent", lambda named="": "agent-1")
    asyncio.run(ensure_principal_token("dep-1", None))
    monkeypatch.setattr(
        owner,
        "_identity",
        lambda agent, acting=False: owner.Identity(PLACEHOLDER, "principal", "dep-1"),
    )
    asyncio.run(owner._events("GET", "agent-1"))
    monkeypatch.setattr(
        owner,
        "_identity",
        lambda agent, acting=False: owner.Identity("a-person", "person", ""),
    )
    asyncio.run(owner._events("GET", "agent-1"))
    assert asked == [
        f"{AGENTS_PRINCIPAL}/api/ai-agents/v1/agents/agent-1/events",
        f"{AGENTS}/api/ai-agents/v1/agents/agent-1/events",
    ]


def test_what_a_deployment_asks_its_owner_to_approve_is_asked_as_its_principal(actor):
    """A recommendation put among its owner's approvals is asked with the deployment's
    token, so at the principal's address; an approval asked with a person's own token
    says no deployment, and leaves for the usual address as it was sent."""
    from agent_runtimes.routes.tool_approvals import (
        ToolApprovalRecord,
        forward_approval_to_ai_agents,
    )

    asyncio.run(ensure_principal_token("dep-1", None))
    actor.left.clear()
    asked = ToolApprovalRecord(
        id="a-1",
        agent_id="agent-1",
        tool_name="approve_recommendation",
        tool_call_id="rec-1",
        created_at="2026-11-26T00:00:00+00:00",
        updated_at="2026-11-26T00:00:00+00:00",
    )
    asyncio.run(
        forward_approval_to_ai_agents(
            asked, principal_token("dep-1"), deployment_uid="dep-1"
        )
    )
    asyncio.run(forward_approval_to_ai_agents(asked, "a-person's-own-token"))
    assert actor.left == [
        (
            "ai-agents-principal-svc.api.svc.cluster.local",
            "/api/ai-agents/v1/tool-approvals",
            f"Bearer {SECRET}",
        ),
        (
            "ai-agents-svc.api.svc.cluster.local",
            "/api/ai-agents/v1/tool-approvals",
            "Bearer a-person's-own-token",
        ),
    ]


# --- every call made as the principal, by module -----------------------------------

#: The modules that send a deployment's principal to ai-agents or ai-inference, and
#: what each must name to send it where it is put in.
AS_THE_PRINCIPAL = {
    "apps/record.py": "principal_address",
    "apps/notifications.py": "principal_address",
    "apps/learning.py": "principal_address",
    "routes/owner.py": "principal_address",
    "routes/tool_approvals.py": "principal_address",
    "tools/recommendations.py": "principal_address",
    "models/models.py": "inference_principal_url",
}

#: The modules that read a deployment's principal and send it somewhere it has no
#: address of its own, or hand it on: where. None of them may name ai-agents or
#: ai-inference; one that comes to belongs in `AS_THE_PRINCIPAL`.
THE_PRINCIPAL_ELSEWHERE = {
    "apps/agent.py": "IAM (the Shield's authorizer)",
    "apps/grants.py": "IAM (standing approvals)",
    "apps/saving.py": "Spacer (saving to a Space)",
    "apps/documents.py": "Contents (an application's documents)",
    "adapters/acp_agent.py": "IAM (the Shield's authorizer) and the MCP gateway",
    "mcp/google_workspace.py": "IAM (the owner's Gmail)",
    "mcp/lifecycle.py": "an MCP server's DATALAYER_API_KEY",
    "identity/datalayer.py": "handed to who asks the identity provider",
}

#: Read apart, each for its reason.
READ_APART = {
    # Where the principal is kept, asked for and read at egress: what it sends
    # to ai-agents is a caller's token or this runtime's proof, to ask for it.
    "apps/principal.py",
    # The policies' socket at ai-agents takes the principal only when it names
    # the account the documents are read for, which the placeholder never does
    # (`test_the_placeholder_names_no_account_for_the_policies_socket`).
    "guardrails/managed_policies.py",
}

_READS_THE_PRINCIPAL = re.compile(
    r"(?<![A-Za-z_])(principal_token|api_key_for|token_for|own_token_for)\("
)
_NAMES_THE_SERVICES = re.compile(
    r"ai_agents_url|AI_AGENTS_URL|ai_inference_url|AI_INFERENCE_URL|/api/ai-agents/"
)


def _modules() -> dict[str, str]:
    root = pathlib.Path(principal.__file__).resolve().parent.parent
    return {
        path.relative_to(root).as_posix(): path.read_text(encoding="utf-8")
        for path in root.rglob("*.py")
        if "tests" not in path.relative_to(root).parts
    }


def test_every_module_that_reads_the_principal_is_known_and_sends_it_where_it_is_put_in():
    """A module that comes to read a deployment's principal is listed here with where it
    sends it; one that sends it to ai-agents or ai-inference names the principal's address."""
    modules = _modules()
    known = set(AS_THE_PRINCIPAL) | set(THE_PRINCIPAL_ELSEWHERE) | READ_APART
    assert known <= set(modules), sorted(known - set(modules))
    readers = {
        name for name, text in modules.items() if _READS_THE_PRINCIPAL.search(text)
    }
    assert readers - known == set(), (
        "These modules read a deployment's principal and are not listed: say where each "
        f"sends it (AS_THE_PRINCIPAL or THE_PRINCIPAL_ELSEWHERE): {sorted(readers - known)}"
    )
    for name, names in AS_THE_PRINCIPAL.items():
        assert names in modules[name], (
            f"{name} sends a deployment's principal to ai-agents or ai-inference "
            f"without {names}: on a runtime that does not hold it, the call is refused."
        )
    for name in THE_PRINCIPAL_ELSEWHERE:
        assert not _NAMES_THE_SERVICES.search(modules[name]), (
            f"{name} reads a deployment's principal and now names ai-agents or ai-inference: "
            "send it through principal_address and list it in AS_THE_PRINCIPAL."
        )


def test_the_placeholder_names_no_account_for_the_policies_socket(actor, monkeypatch):
    """The policies' socket is held at ai-agents' usual address with a token in its query,
    where nothing is put in: the principal's is taken only when it names the account, and
    the placeholder names none, so it is never sent there."""
    from agent_runtimes.guardrails import managed_policies

    asyncio.run(ensure_principal_token("dep-1", None))
    monkeypatch.setattr(principal, "deployments_served", lambda: ["dep-1"])
    assert principal_token("dep-1") == PLACEHOLDER
    assert managed_policies.account_of_token(PLACEHOLDER) == ""
    policies = managed_policies.RuntimePolicies()
    policies._credential, policies._account = "the-first-credential", "u-owner"
    assert policies.credential_now() == "the-first-credential"


# --- a caller is judged as itself -------------------------------------------------


def test_a_forged_token_is_checked_at_the_usual_address_and_leaves_as_it_was_sent(
    actor,
):
    """Whoever calls, the check of who they are never takes the principal's address: a token forged
    to name the owner is sent where nothing is put in, and is judged as the token it is."""
    asyncio.run(ensure_principal_token("dep-1", None))
    actor.left.clear()
    forged = _jwt(sub="u-owner", uid="u-owner", exp=int(time.time()) + 600)
    with pytest.raises(callers.CallerRefused):
        asyncio.run(callers.CallerVerifier().verify(forged))
    assert actor.left, "the token was checked with the platform"
    for host, _, authorization in actor.left:
        assert host not in PRINCIPAL_HOSTS and authorization == f"Bearer {forged}"


def test_the_placeholder_is_nobodys_credential(actor):
    asyncio.run(ensure_principal_token("dep-1", None))
    actor.left.clear()
    assert (
        callers.bearer_of(f"Bearer {PLACEHOLDER}") == ""
        and callers.bearer_of("Bearer a-token") == "a-token"
    )
    for scope in (
        {"headers": [(b"authorization", f"Bearer {PLACEHOLDER}".encode())]},
        {"headers": [(b"authorization", f"token {PLACEHOLDER}".encode())]},
        {"headers": [], "query_string": f"token={PLACEHOLDER}".encode()},
    ):
        assert callers.credential_of(scope) == ""
    assert (
        callers.credential_of({"headers": [(b"authorization", b"Bearer a-token")]})
        == "a-token"
    )
    # Presented all the same, it is refused before anything is asked of the platform.
    with pytest.raises(callers.CallerRefused):
        asyncio.run(callers.CallerVerifier().verify(PLACEHOLDER))
    assert actor.left == []


# --- its model calls ---------------------------------------------------------------


def test_a_visitors_turn_is_refused_where_every_model_call_leaves_as_the_application(
    actor,
):
    from agent_runtimes.apps import visitors
    from agent_runtimes.models.offered import InferenceTokenMissing

    async def its_principals() -> str:
        return PLACEHOLDER

    key = visitors.principal_key_only(its_principals)
    assert asyncio.run(key()) == PLACEHOLDER

    async def a_visitors_turn() -> str:
        visitors._TURN_TOKEN.set("a-visitor's-own-token")
        return await key()

    with pytest.raises(
        InferenceTokenMissing, match="every model call leaves as the application"
    ):
        asyncio.run(a_visitors_turn())


def test_a_deployments_model_calls_go_to_the_principals_address(actor):
    from agent_runtimes.models.models import resolve_model_for_inference_provider

    asyncio.run(ensure_principal_token("dep-1", None))
    model = resolve_model_for_inference_provider(
        "bedrock:us.anthropic.claude-sonnet-4-6",
        "datalayer",
        app_instance={"app_uid": "app-1", "deployment_uid": "dep-1"},
    )
    client = model.client
    assert str(client.base_url).startswith(INFERENCE_PRINCIPAL)
    assert asyncio.run(client._api_key_provider()) == PLACEHOLDER
    # An agent that serves no deployment calls the usual address, as before.
    own = resolve_model_for_inference_provider(
        "bedrock:us.anthropic.claude-sonnet-4-6", "datalayer"
    )
    assert str(own.client.base_url).startswith(INFERENCE) and not str(
        own.client.base_url
    ).startswith(INFERENCE_PRINCIPAL)


# --- a runtime that holds its principal's token: as before -------------------------


def test_a_pool_runtime_asks_for_its_token_and_sends_it_where_it_always_did(
    gateway, monkeypatch
):
    monkeypatch.delenv("AGENT_RUNTIMES_TARGET", raising=False)
    # Told the addresses or not, it is no actor: nothing is read at egress.
    monkeypatch.setenv("DATALAYER_AI_AGENTS_PRINCIPAL_URL", AGENTS_PRINCIPAL)
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_PRINCIPAL_URL", INFERENCE_PRINCIPAL)
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", AGENTS)
    asked: list[tuple[str, str]] = []

    async def ask(deployment_uid: str, bearer: str) -> dict:
        asked.append((deployment_uid, bearer))
        return {"access_token": SECRET, "expires_in": 3600, "principal_uid": "p-1"}

    principal.use_asker(ask)
    forget_principal_token("dep-1")
    try:
        assert asyncio.run(ensure_principal_token("dep-1", "owner")) == SECRET
        assert (
            asked == [("dep-1", "owner")] and "claims" not in principal._HELD["dep-1"]
        )
        assert owner_of("dep-1") == "u-owner" and is_held_principal(
            {"agent_uid": "p-1", "task_grant_uid": "grant-1"}
        )
        assert principal_address("dep-1", AGENTS) == AGENTS
        assert (
            principal_address("dep-1", INFERENCE, service="ai-inference") == INFERENCE
        )
        # With nobody's token it is not asked again, as before.
        principal._HELD["dep-1"]["expires_at"] = time.time() + 10
        asyncio.run(ensure_principal_token("dep-1", None))
        assert len(asked) == 1 and gateway.left == []
    finally:
        principal.use_asker(None)
        forget_principal_token("dep-1")

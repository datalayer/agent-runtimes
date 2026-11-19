# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who may call an application's addresses is its deployment's, as it says now.

Decided 18 November 2026: "Someone removed from 'People I invite' should lose access
at once, rather than when the runtime restarts." A runtime launched for a deployment
reads its record from ai-agents again when a request comes and the last read is
``POLICY_READ_SECONDS`` old (one read at a time), for every way in at its four
addresses. Somebody removed is refused on their next request after that window, their
sign-ins at the company end once, and a conversation they stream ends. When ai-agents
does not answer, a private deployment answers from its last read for
``POLICY_GRACE_SECONDS``, then admits its owner alone; a public one stays open.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient
from personal_agent_protocol.company import ApiCall

from agent_runtimes.addresses.access import (
    POLICY_GRACE_SECONDS,
    POLICY_READ_SECONDS,
    AddressAccess,
    AddressPolicy,
    AddressRecordUnread,
    DeploymentPolicy,
    either_token,
)
from agent_runtimes.addresses.accounts import DatalayerAccounts
from agent_runtimes.addresses.addressed import AddressedAgent
from agent_runtimes.addresses.browser_sign_in import COOKIE
from agent_runtimes.addresses.operations import OperationError
from agent_runtimes.addresses.web import web_app
from agent_runtimes.tests.test_addresses import (
    APP,
    AT_ITS_HOST,
    COMPANY,
    HELLO,
    Answers,
    _company_agent,
    _IssuedHere,
    _uid_of,
    _with_an_approved_operation,
    addressed,
)

ACCEPT = {**AT_ITS_HOST, "Accept": "application/json, text/event-stream"}


class _Deployment:
    """ai-agents' record of a deployment, as its runtime reads it, and the clock."""

    def __init__(self, visibility: str = "private", allowed: tuple = ("friend",)):
        self.record: Dict[str, Any] = {
            "uid": "deployment-1",
            "visibility": visibility,
            "owner": {"uid": "owner"},
            "allowed": [{"uid": uid} for uid in allowed],
            "mcp_clients": False,
        }
        self.reads: List[str] = []
        self.now = 0.0
        self.down = False

    async def read(self, slug: str) -> Dict[str, Any]:
        self.reads.append(slug)
        if self.down:
            raise AddressRecordUnread("ai-agents did not answer")
        return dict(self.record)

    def clock(self) -> float:
        return self.now

    def source(self) -> DeploymentPolicy:
        return DeploymentPolicy("shop", self.record, read=self.read, clock=self.clock)

    def allow(self, *uids: str) -> None:
        self.record["allowed"] = [{"uid": uid} for uid in uids]

    def later(self, seconds: float = POLICY_READ_SECONDS) -> None:
        self.now += seconds


def _deployed(agent: AddressedAgent, deployment: _Deployment) -> AddressedAgent:
    """``agent``, its access check its deployment's (as ``addressed_in_runtime`` makes it)."""
    old = agent.access
    agent.access = AddressAccess(
        source=deployment.source(),
        key_checker=old.key_checker,
        token_checker=old.token_checker,
    )
    return agent


def _app_agent(deployment: _Deployment) -> AddressedAgent:
    return _deployed(
        addressed(Answers(), APP, key_checker=_uid_of, token_checker=_uid_of),
        deployment,
    )


def _company(deployment: _Deployment, spec: Dict[str, Any] = COMPANY) -> Any:
    """A company deployed, a personal agent's token taken at its addresses
    (``servers.company_of``)."""
    from agent_runtimes.addresses.servers import pap_token_checker

    agent = _deployed(
        _company_agent(AddressPolicy("public"), spec, _IssuedHere()), deployment
    )
    agent.access.token_checker = either_token(_uid_of, pap_token_checker(agent))
    return agent


# --- somebody removed is refused on their next request, every way in ------------------


@pytest.mark.parametrize(
    "way_in",
    [
        {"X-API-Key": "key-friend"},
        {"Authorization": "Bearer key-friend"},
        {"Authorization": "Bearer the-default"},
        {"cookie": f"{COOKIE}=key-friend"},
    ],
    ids=["API key", "Datalayer token", "personal agent's token", "browser cookie"],
)
def test_somebody_removed_is_refused_on_their_next_request_after_the_window(
    way_in: Dict[str, str],
) -> None:
    deployment = _Deployment()
    agent = _company(deployment)
    with TestClient(web_app(agent)) as client:
        assert client.get("/api/agent", headers=way_in).status_code == 200
        deployment.allow()
        # Within the window it is taken as read: at most POLICY_READ_SECONDS.
        deployment.later(POLICY_READ_SECONDS / 2)
        assert client.get("/api/agent", headers=way_in).status_code == 200
        deployment.later(POLICY_READ_SECONDS / 2)
        refused = client.get("/api/agent", headers=way_in)
        assert refused.status_code == 403
        assert client.get("/api/agent", headers={"X-API-Key": "key-owner"}).is_success


@pytest.mark.parametrize(
    "way_in",
    [
        {"X-API-Key": "key-friend"},
        {"Authorization": "Bearer key-friend"},
        {"Authorization": "Bearer for-the-mcp-server"},
        {"Authorization": "Bearer another-clients"},
    ],
    ids=[
        "API key",
        "Datalayer token",
        "personal agent's token",
        "other MCP client's token",
    ],
)
def test_somebody_removed_is_refused_at_the_companys_mcp_server(
    way_in: Dict[str, str],
) -> None:
    from agent_runtimes.addresses.mcp import mcp_app

    deployment = _Deployment()
    agent = _company(deployment)
    agent.mcp_clients = True
    with TestClient(mcp_app(agent)) as client:
        assert client.post("/mcp", json=HELLO, headers={**ACCEPT, **way_in}).is_success
        deployment.allow()
        deployment.later()
        refused = client.post("/mcp", json=HELLO, headers={**ACCEPT, **way_in})
        assert refused.status_code == 403


@pytest.mark.asyncio
async def test_another_mcp_client_of_somebody_removed_is_refused_its_tools() -> None:
    from agent_runtimes.addresses.mcp import mcp_client_caller

    deployment = _Deployment()
    agent = _company(deployment)
    agent.mcp_clients = True
    theirs = {"Authorization": "Bearer another-clients"}
    assert (await mcp_client_caller(agent, theirs)).uid == "friend"  # type: ignore[union-attr]
    deployment.allow()
    deployment.later()
    with pytest.raises(OperationError) as refused:
        await mcp_client_caller(agent, theirs)
    assert refused.value.status == 403


@pytest.mark.asyncio
async def test_a_personal_agent_of_somebody_removed_is_proposed_nothing() -> None:
    from agent_runtimes.pap.company import ApprovedOperationsApi

    deployment = _Deployment()
    api = ApprovedOperationsApi(_company(deployment, _with_an_approved_operation()))
    call = ApiCall(
        method="POST",
        path="/quote",
        query={},
        body={"items": [1]},
        account_id="friend",
        scopes=("orders:read",),
        client_id="https://atlas.example/agent",
    )
    assert (await api.handle(call)).operation is not None
    deployment.allow()
    deployment.later()
    assert (await api.handle(call)).status == 403


# --- added, turned private --------------------------------------------------------------


@pytest.mark.asyncio
async def test_somebody_added_is_admitted_after_the_window() -> None:
    deployment = _Deployment()
    access = _app_agent(deployment).access
    with pytest.raises(OperationError) as refused:
        await access.admit({"X-API-Key": "key-other"})
    assert refused.value.status == 403
    deployment.allow("friend", "other")
    deployment.later()
    assert (await access.admit({"X-API-Key": "key-other"})).uid == "other"


def test_a_public_deployment_turned_private_refuses_anybody_unnamed() -> None:
    deployment = _Deployment("public")
    agent = _app_agent(deployment)
    with TestClient(web_app(agent)) as client:
        assert client.get("/api/agent").json()["visibility"] == "public"
        deployment.record["visibility"] = "private"
        deployment.later()
        assert client.get("/api/agent").status_code == 401
        mine = client.get("/api/agent", headers={"X-API-Key": "key-owner"})
        assert mine.json()["visibility"] == "private"


# --- ai-agents does not answer ----------------------------------------------------------


@pytest.mark.asyncio
async def test_a_private_deployment_answers_from_its_last_read_within_the_grace() -> (
    None
):
    deployment = _Deployment()
    access = _app_agent(deployment).access
    deployment.down = True
    deployment.later(POLICY_GRACE_SECONDS)
    assert (await access.admit({"X-API-Key": "key-friend"})).uid == "friend"
    assert len(deployment.reads) == 1


@pytest.mark.asyncio
async def test_after_the_grace_a_private_deployment_admits_its_owner_alone() -> None:
    deployment = _Deployment()
    access = _app_agent(deployment).access
    deployment.down = True
    deployment.later(POLICY_GRACE_SECONDS + 1)
    with pytest.raises(OperationError) as refused:
        await access.admit({"X-API-Key": "key-friend"})
    assert refused.value.status == 403
    assert (await access.admit({"X-API-Key": "key-owner"})).uid == "owner"
    # ai-agents answers again: the people allowed are let in again.
    deployment.down = False
    deployment.later()
    assert (await access.admit({"X-API-Key": "key-friend"})).uid == "friend"


@pytest.mark.asyncio
async def test_a_public_deployment_stays_open_while_ai_agents_does_not_answer() -> None:
    deployment = _Deployment("public")
    access = _app_agent(deployment).access
    deployment.down = True
    deployment.later(POLICY_GRACE_SECONDS * 10)
    assert (await access.admit({})).kind == "anonymous"


@pytest.mark.asyncio
async def test_an_outage_ends_no_sign_in() -> None:
    """The fallback refuses at the addresses; it is no removal."""
    deployment = _Deployment()
    access = _app_agent(deployment).access
    deployment.down = True
    deployment.later(POLICY_GRACE_SECONDS + 1)
    assert await DatalayerAccounts(access).signed_out_before("friend") is None


# --- a removed person's sign-ins and streams end ---------------------------------------


class _Service:
    """The SDK's company service, as far as ending sign-ins goes."""

    def __init__(self, sign_ins: List[tuple[str, str]]) -> None:
        self.sign_ins = list(sign_ins)
        self.disconnected: List[tuple[str, str]] = []

    async def open_work(self) -> Any:
        from types import SimpleNamespace

        return SimpleNamespace(sign_ins=tuple(self.sign_ins))

    async def disconnect(self, client_id: str, account_id: str) -> int:
        self.disconnected.append((client_id, account_id))
        self.sign_ins.remove((client_id, account_id))
        return 1


@pytest.mark.asyncio
async def test_a_removed_persons_sign_ins_are_ended_once() -> None:
    from types import SimpleNamespace

    from agent_runtimes.addresses.servers import CompanyAsDeployed

    deployment = _Deployment()
    agent = _company(deployment)
    service = _Service(
        [
            ("https://atlas.example/agent", "friend"),
            ("mcpc_Yx2b7Qd_Kp8mR3vT1nWc4A", "friend"),
            ("https://atlas.example/agent", "owner"),
        ]
    )
    agent.company = SimpleNamespace(service=service)
    deployed = CompanyAsDeployed(agent, "agent-1")
    deployment.later()
    await deployed.current()
    assert service.disconnected == []
    deployment.allow()
    deployment.later()
    await deployed.current()
    assert service.disconnected == [
        ("https://atlas.example/agent", "friend"),
        ("mcpc_Yx2b7Qd_Kp8mR3vT1nWc4A", "friend"),
    ]
    # Read again, unchanged: nothing more is ended.
    deployment.later()
    await deployed.current()
    assert len(service.disconnected) == 2 and len(deployment.reads) == 3


@pytest.mark.asyncio
async def test_the_sdk_is_told_a_removed_persons_sign_ins_are_over() -> None:
    deployment = _Deployment()
    accounts = DatalayerAccounts(_app_agent(deployment).access)
    assert await accounts.signed_out_before("friend") is None
    deployment.allow()
    deployment.later()
    assert await accounts.signed_out_before("friend") is not None
    assert await accounts.signed_out_before("owner") is None


def test_a_conversation_streamed_by_somebody_removed_ends_at_its_next_event() -> None:
    """At its agent host, over A2A: the stream closes, nothing more of it is sent."""
    from starlette.applications import Starlette
    from starlette.responses import StreamingResponse
    from starlette.routing import Route

    from agent_runtimes.addresses.agent_host import AgentHost

    deployment = _Deployment()
    agent = _app_agent(deployment)

    async def events() -> Any:
        for event in (b"one\n", b"two\n", b"three\n"):
            yield event
            # Its owner removes them while the stream is open.
            deployment.allow()
            deployment.later()

    async def a2a(_: Any) -> StreamingResponse:
        return StreamingResponse(events(), media_type="text/event-stream")

    main = Starlette(routes=[Route("/{rest:path}", a2a, methods=["POST"])])
    client = TestClient(AgentHost(main, agent, "shop-agent"))
    headers = {"host": "shop.agent.datalayer.ai", "X-API-Key": "key-friend"}
    with client.stream("POST", "/a2a/", headers=headers, json={}) as streamed:
        assert streamed.status_code == 200
        assert b"".join(streamed.iter_bytes()) == b"one\n"
    assert client.post("/a2a/", headers=headers, json={}).status_code == 403


# --- the one reader of the record -------------------------------------------------------


@pytest.mark.asyncio
async def test_reads_are_one_at_a_time_and_at_most_one_a_window() -> None:
    deployment = _Deployment()
    gate = asyncio.Event()
    reads: List[str] = []

    async def slow(slug: str) -> Dict[str, Any]:
        reads.append(slug)
        await gate.wait()
        return dict(deployment.record)

    source = DeploymentPolicy(
        "shop", deployment.record, read=slow, clock=deployment.clock
    )
    access = AddressAccess(source=source)
    deployment.later()
    waiting = [asyncio.create_task(access.current_policy()) for _ in range(5)]
    await asyncio.sleep(0)
    gate.set()
    await asyncio.gather(*waiting)
    assert reads == ["shop"]
    deployment.later(POLICY_READ_SECONDS - 1)
    await access.current_policy()
    assert reads == ["shop"]
    deployment.later(1)
    await access.current_policy()
    assert reads == ["shop", "shop"]


@pytest.mark.asyncio
async def test_a_failed_read_is_not_asked_again_within_the_window() -> None:
    deployment = _Deployment()
    access = _app_agent(deployment).access
    deployment.down = True
    deployment.later()
    await access.current_policy()
    await access.current_policy()
    assert len(deployment.reads) == 1


@pytest.mark.asyncio
async def test_the_mcp_clients_switch_follows_the_same_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.addresses import servers

    built: List[bool] = []

    def build(addressed_agent: AddressedAgent, agent_id: str) -> Any:
        built.append(addressed_agent.mcp_clients)
        return f"company-{len(built)}"

    monkeypatch.setattr(servers, "build_company_of", build)
    deployment = _Deployment()
    agent = _company(deployment)
    agent.company = "company-0"
    deployed = servers.CompanyAsDeployed(agent, "agent-1")
    deployment.record["mcp_clients"] = True
    # Taken as read within the window: nothing is asked.
    assert await deployed.current() == "company-0" and deployment.reads == []
    deployment.later()
    assert await deployed.current() == "company-1"
    assert (agent.mcp_clients, built, deployment.reads) == (True, [True], ["shop"])
    # Unchanged: read again, not built again.
    deployment.later()
    assert await deployed.current() == "company-1" and built == [True]
    # Not read: it answers as it did.
    deployment.down = True
    deployment.later()
    assert await deployed.current() == "company-1" and agent.mcp_clients is True
    # Turned off: built again without it.
    deployment.down = False
    deployment.record["mcp_clients"] = False
    deployment.later()
    assert await deployed.current() == "company-2"
    assert (agent.mcp_clients, built) == (False, [True, False])


@pytest.mark.asyncio
async def test_an_agent_served_without_a_deployment_keeps_its_configuration() -> None:
    policy = AddressPolicy("private", owner_uid="owner")
    access = AddressAccess(policy, key_checker=_uid_of)
    assert access.source is None
    assert await access.current_policy() is policy
    assert await DatalayerAccounts(access).signed_out_before("friend") is None
    with pytest.raises(ValueError):
        AddressAccess(policy, source=_Deployment().source())

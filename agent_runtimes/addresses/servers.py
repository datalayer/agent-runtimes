# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The three servers beside the main one, in one process: 8766 mcp, 8767 api, 8768 web.

``agent-runtimes serve --mode mcp|api|web --app <path|id>`` serves one of
them for an application, in this process (:func:`serve_mode`). In a runtime
(``AGENT_RUNTIMES_ADDRESSES=1``, as its image sets), the three start with the
main server (:data:`RUNTIME_ADDRESSES`, from its lifespan) and answer 503
until the runtime's agent is made; then they answer for it, whatever it is —
a company's application, a published one, a person's own agent — and the main
server answers its agent host (:class:`AgentHostMiddleware`).

What the runtime's agent is at its addresses:

- its name (``{name}.agent.<domain>``…) is ``AGENT_RUNTIMES_ADDRESS_NAME``, which
  the operator gives the runtime of a deployment or of a person's own agent;
- who may call it is its deployment's "Who may open it", read from ai-agents
  with the runtime's proof, or else the configuration's
  (:func:`~agent_runtimes.addresses.access.policy_from_environment`);
- the agent is ``AGENT_RUNTIMES_ADDRESS_AGENT_ID`` when said, else the
  deployment's own agent on a runtime launched for one, else the first made.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from typing import Any, Dict, Iterator, List, Literal, Optional

import uvicorn

from agent_runtimes.addresses.access import (
    AddressAccess,
    AddressPolicy,
    DeploymentPolicy,
    either_token,
    iam_key_checker,
    iam_token_checker,
    lost_access,
    policy_from_environment,
    read_deployment_record,
)
from agent_runtimes.addresses.addressed import (
    AddressedAgent,
    role_of,
    runtime_agent_source,
)
from agent_runtimes.addresses.agent_host import AgentHost
from agent_runtimes.addresses.asgi import answer_json
from agent_runtimes.addresses.hosts import (
    API_PORT,
    MCP_PORT,
    WEB_PORT,
    AddressHosts,
    consent_page,
)

logger = logging.getLogger(__name__)

Mode = Literal["mcp", "api", "web"]

#: Turns the three servers on in a runtime.
ENABLED_VARIABLE = "AGENT_RUNTIMES_ADDRESSES"
NAME_VARIABLE = "AGENT_RUNTIMES_ADDRESS_NAME"
AGENT_VARIABLE = "AGENT_RUNTIMES_ADDRESS_AGENT_ID"
#: For a person's own agent: the account (ULID) of the person it acts for.
ACTS_FOR_VARIABLE = "AGENT_RUNTIMES_ADDRESS_ACTS_FOR"

PORTS: Dict[Mode, int] = {"mcp": MCP_PORT, "api": API_PORT, "web": WEB_PORT}


def mode_app(addressed: AddressedAgent, mode: Mode) -> Any:
    """The ASGI application of one of the three servers."""
    if mode == "mcp":
        from agent_runtimes.addresses.mcp import mcp_app

        return mcp_app(addressed)
    if mode == "api":
        from agent_runtimes.addresses.api import api_app

        return api_app(addressed)
    if mode == "web":
        from agent_runtimes.addresses.web import web_app

        return web_app(addressed)
    raise ValueError(f"{mode!r} is not a mode: mcp, api or web")


class _Server(uvicorn.Server):
    """A server beside another in one process: the main one handles the signals."""

    @contextlib.contextmanager
    def capture_signals(self) -> Iterator[None]:
        yield


class _Lifespan:
    """An ASGI application's lifespan, run beside its requests (the MCP server's session
    manager starts there)."""

    def __init__(self, app: Any) -> None:
        self.app = app
        self.inbox: asyncio.Queue = asyncio.Queue()
        self.outbox: asyncio.Queue = asyncio.Queue()
        self.task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        self.task = asyncio.create_task(
            self.app(
                {"type": "lifespan", "asgi": {"version": "3.0"}},
                self.inbox.get,
                self.outbox.put,
            )
        )
        await self.inbox.put({"type": "lifespan.startup"})
        said = await self.outbox.get()
        if said["type"] != "lifespan.startup.complete":
            raise RuntimeError(
                f"The {self.app!r} did not start: {said.get('message', '')}"
            )

    async def stop(self) -> None:
        if self.task is None:
            return
        await self.inbox.put({"type": "lifespan.shutdown"})
        await self.outbox.get()
        await self.task


class _Slot:
    """ASGI: the application of one address, once the runtime's agent is made; 503 before."""

    def __init__(self, mode: Mode) -> None:
        self.mode = mode
        self.app: Optional[Any] = None
        self._lifespan: Optional[_Lifespan] = None

    async def fill(self, app: Any) -> None:
        """Answer with ``app`` from now on, its lifespan started here."""
        lifespan = _Lifespan(app)
        await lifespan.start()
        self.app, self._lifespan = app, lifespan

    async def empty(self) -> None:
        if self._lifespan is not None:
            await self._lifespan.stop()
        self.app, self._lifespan = None, None

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] == "lifespan":
            return
        if self.app is None:
            if scope["type"] == "http":
                await answer_json(
                    send,
                    503,
                    {"detail": f"No agent answers at this address ({self.mode}) yet."},
                )
            return
        await self.app(scope, receive, send)


class RuntimeAddresses:
    """The three servers of a runtime, and its agent host."""

    def __init__(self) -> None:
        self.slots: Dict[Mode, _Slot] = {mode: _Slot(mode) for mode in PORTS}
        self.servers: List[_Server] = []
        self.tasks: List[asyncio.Task] = []
        self.addressed: Optional[AddressedAgent] = None
        self.agent_host: Optional[AgentHost] = None

    @staticmethod
    def enabled() -> bool:
        return (os.environ.get(ENABLED_VARIABLE) or "").strip().lower() in (
            "1",
            "true",
            "yes",
        )

    async def start(self, host: str = "0.0.0.0") -> None:  # nosec B104 - the pod's address servers answer on its own IP
        """Start the three servers, answering 503 until the agent is made."""
        for mode, port in PORTS.items():
            server = _Server(
                uvicorn.Config(
                    self.slots[mode],
                    host=host,
                    port=port,
                    lifespan="off",
                    log_level="info",
                )
            )
            self.servers.append(server)
            self.tasks.append(
                asyncio.create_task(server.serve(), name=f"addresses-{mode}")
            )
        logger.info(
            "The agent's addresses: mcp %s, api %s, web %s",
            MCP_PORT,
            API_PORT,
            WEB_PORT,
        )

    async def stop(self) -> None:
        for server in self.servers:
            server.should_exit = True
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        for slot in self.slots.values():
            await slot.empty()
        self.servers, self.tasks = [], []
        self.addressed, self.agent_host = None, None

    async def agent_made(
        self,
        agent_id: str,
        *,
        app_spec: Optional[Dict[str, Any]] = None,
        agent_spec_id: Optional[str] = None,
        name: str = "",
        description: str = "",
        app_instance: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """The runtime made an agent: its addresses answer for it when it is the one they
        are for. Whether they do."""
        wanted = (os.environ.get(AGENT_VARIABLE) or "").strip()
        if self.addressed is not None or (wanted and wanted != agent_id):
            return False
        from agent_runtimes.apps.principal import launched_for

        launched = launched_for()
        if (
            launched
            and str((app_instance or {}).get("deployment_uid") or "") != launched
        ):
            return False
        addressed = await addressed_in_runtime(
            agent_id,
            app_spec=app_spec,
            agent_spec_id=agent_spec_id,
            name=name,
            description=description,
        )
        for mode, slot in self.slots.items():
            await slot.fill(mode_app(addressed, mode))
        if addressed.hosts is not None:
            # A2A at its agent host, whatever transport it was made for.
            _answer_over_a2a(agent_id, addressed)
            company = (
                company_of(addressed, agent_id) if addressed.role == "company" else None
            )
            self.agent_host = AgentHost(
                None,
                addressed,
                agent_id,
                company,
                current_company=(
                    CompanyAsDeployed(addressed, agent_id).current
                    if company is not None and addressed.access.source is not None
                    else None
                ),
            )
        self.addressed = addressed
        logger.info("Agent %s answers at its addresses (%s)", agent_id, addressed.role)
        return True


def take_address(name: str, *, acts_for: str = "", owner_uid: str = "") -> None:
    """This runtime's agent's name at its four addresses, as the platform routed them —
    a person's own agent's (``{agent}-{account ulid}``), with the account of the person
    it acts for and its owner, who alone may call it unless they allow others. Said
    once: a name is never changed, and another is refused (``ValueError``)."""
    AddressHosts.of(name)
    held = (os.environ.get(NAME_VARIABLE) or "").strip()
    if held and held != name:
        raise ValueError(f"This runtime answers at {held} already, not at {name}.")
    os.environ[NAME_VARIABLE] = name
    if acts_for:
        os.environ[ACTS_FOR_VARIABLE] = acts_for
    if owner_uid:
        from agent_runtimes.addresses.access import OWNER_VARIABLE

        os.environ[OWNER_VARIABLE] = owner_uid


def _launched_address() -> str:
    """The name at its four addresses of the deployment this runtime was launched
    for, as ai-agents said it with what it runs (``address``, when its addresses are
    on); ``""`` otherwise."""
    from agent_runtimes.apps.principal import launched_app

    instance = launched_app()[1] or {}
    return str(instance.get("address") or "").strip()


def _answer_over_a2a(agent_id: str, addressed: AddressedAgent) -> None:
    """The agent answers over A2A, its card at its agent host, when it was made for
    another transport (a person's own agent made from its spec for the chat)."""
    from agent_runtimes.routes.a2a import (
        A2AAgentCard,
        _a2a_agents,
        register_a2a_agent,
    )
    from agent_runtimes.routes.acp import _agents

    if agent_id in _a2a_agents or agent_id not in _agents:
        return
    try:
        register_a2a_agent(
            _agents[agent_id][0],
            A2AAgentCard(
                id=agent_id,
                name=addressed.app.name,
                description=addressed.app.description or addressed.app.name,
                url=f"/api/v1/a2a/agents/{agent_id}",
            ),
        )
        logger.info("Agent %s answers over A2A at its agent host", agent_id)
    except Exception as error:  # noqa: BLE001 - said; its other addresses answer
        logger.warning("Agent %s does not answer over A2A: %s", agent_id, error)


def _policy_and_checkers() -> tuple[Optional[str], Any, Any]:
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.addresses.browser_sign_in import iam_userinfo_checker

    iam = getattr(DatalayerURLs.from_environment(), "iam_url", "") or ""
    if not iam:
        return None, None, None
    # A Datalayer token, or the access token of a browser signed in with Datalayer.
    return (
        iam,
        iam_key_checker(iam),
        either_token(iam_token_checker(iam), iam_userinfo_checker(iam)),
    )


def pap_token_checker(addressed: AddressedAgent) -> Any:
    """Whose a PAP access token this runtime's company issued is: the account a person
    signed in to with their personal agent (the SDK's record of the token, while it
    works: unexpired, its sign-in not ended).

    Never the token of another MCP client (the SDK's public clients): that one is for
    its MCP address alone, where its MCP server verifies it (``mcp.company_oauth``);
    here, at its agent, API and web hosts, it is nobody's. Nor any token issued for a
    resource: a company accepts a token issued for a resource only at that service
    (Poppy 1.0 §4.5), so a personal agent's token for the MCP server is nobody's here
    too. Only the default token, issued for no resource, names its account.
    """

    async def check(token: str) -> Optional[str]:
        company = addressed.company
        if company is None:
            return None
        # The SDK's own reading of a bearer it issued (`CompanyService._access_token`).
        issued = await company.service._access_token(token)
        if issued is None or issued.public or issued.resource is not None:
            return None
        return str(issued.account_id)

    return check


def mcp_clients_of(record: Dict[str, Any], policy: AddressPolicy) -> bool:
    """Whether the deployment lets other MCP clients sign in: its owner turned it on
    (``mcp_clients``), and it is private — a public one is open at its MCP address
    already, to anybody, and has no such switch."""
    return record.get("mcp_clients") is True and policy.visibility == "private"


class CompanyAsDeployed:
    """A runtime's company, as its deployment's record says it now.

    Told of each read of the record by the one reader of it, the access check's
    :class:`~agent_runtimes.addresses.access.DeploymentPolicy` (read again at most
    every ``POLICY_READ_SECONDS``, when a request comes):

    - "Let other MCP clients sign in" turned: the company is built again, with or
      without them. Its records are Datalayer's, so nothing is forgotten;
    - somebody it admitted is admitted no more (removed from "People I invite", or
      the deployment turned private): their sign-ins at the company end, once — each
      agent's they signed in with, a personal agent's or another MCP client's, as its
      Disconnect does (``CompanyService.disconnect``): its tokens revoked, its
      Sessions signed out. The SDK refuses what is left on its next request
      (``DatalayerAccounts.signed_out_before``).

    A record that cannot be read changes nothing here.
    """

    def __init__(self, addressed: AddressedAgent, agent_id: str) -> None:
        self.addressed = addressed
        self.agent_id = agent_id
        source = addressed.access.source
        if source is None:
            raise ValueError("A company as deployed is a deployment's: it has none.")
        source.listen(self.read)

    async def current(self) -> Any:
        """The company, the deployment's record read again first when it is time to."""
        await self.addressed.access.refresh()
        return self.addressed.company

    async def read(
        self, record: Dict[str, Any], before: AddressPolicy, after: AddressPolicy
    ) -> None:
        addressed = self.addressed
        assert addressed.hosts is not None
        said = mcp_clients_of(record, after)
        if said != addressed.mcp_clients:
            addressed.mcp_clients = said
            addressed.company = build_company_of(addressed, self.agent_id)
            logger.info(
                "%s %s other MCP clients sign in",
                addressed.hosts.name,
                "lets" if said else "no longer lets",
            )
        if lost_access(before, after):
            ended = await end_sign_ins_not_admitted(addressed.company, after)
            if ended:
                logger.info(
                    "%s: the sign-ins of %d people no longer allowed ended",
                    addressed.hosts.name,
                    len(ended),
                )


async def end_sign_ins_not_admitted(company: Any, policy: AddressPolicy) -> set[str]:
    """End every sign-in at ``company`` of an account ``policy`` does not admit, each
    agent's as its Disconnect does; the accounts whose sign-ins ended."""
    if company is None:
        return set()
    service = company.service
    ended: set[str] = set()
    for client_id, account_id in (await service.open_work()).sign_ins:
        if policy.admits(str(account_id)):
            continue
        await service.disconnect(client_id, account_id)
        ended.add(str(account_id))
    return ended


async def addressed_in_runtime(
    agent_id: str,
    *,
    app_spec: Optional[Dict[str, Any]] = None,
    agent_spec_id: Optional[str] = None,
    name: str = "",
    description: str = "",
) -> AddressedAgent:
    """The runtime's agent at its addresses: its application, or an agent of its own
    wrapped as one (a person's own agent)."""
    from agent_runtimes.apps.loading import load_app
    from agent_runtimes.apps.principal import launched_app, launched_for
    from agent_runtimes.types import AppSpec

    slug = (os.environ.get(NAME_VARIABLE) or "").strip() or (
        _launched_address() if launched_for() else ""
    )
    hosts = AddressHosts.of(slug) if slug else None
    if launched_for():
        # What a runtime launched for a deployment runs is what ai-agents said, never what it was sent.
        app_spec = launched_app()[0] or app_spec
    if app_spec:
        app = load_app(app_spec)
        role = role_of(app)
        acts_for = ""
    else:
        app = AppSpec.model_validate(
            {
                "id": agent_id,
                "name": name or agent_id,
                "kind": "chat",
                "description": description,
                "agent": agent_spec_id or agent_id,
            }
        )
        acts_for = (os.environ.get(ACTS_FOR_VARIABLE) or "").strip()
        role = "personal" if acts_for else "app"
    mcp_clients = False
    _, key_checker, token_checker = _policy_and_checkers()
    if slug and launched_for():
        # Who may call is its deployment's, read again while it runs.
        source = DeploymentPolicy(
            slug, await read_deployment_record(slug), read=read_deployment_record
        )
        mcp_clients = mcp_clients_of(source.record, source.policy)
        access = AddressAccess(
            source=source, key_checker=key_checker, token_checker=token_checker
        )
    else:
        access = AddressAccess(
            policy_from_environment(),
            key_checker=key_checker,
            token_checker=token_checker,
        )
    calls = None
    if slug and launched_for():
        # Every call recorded on its deployment (who, which operation, what it cost).
        from agent_runtimes.addresses.calls import CallRecorder, ai_agents_sender

        calls = CallRecorder(ai_agents_sender(slug))
    return AddressedAgent(
        app=app,
        access=access,
        agent_source=runtime_agent_source(agent_id),
        hosts=hosts,
        role=role,  # type: ignore[arg-type]
        acts_for=acts_for,
        calls=calls,
        mcp_clients=mcp_clients and role == "company" and hosts is not None,
    )


class UnsignedRequestsCap:
    """``pap.company.rateLimit`` for what the SDK asks before it knows who calls: a
    client registering itself (``registration:{address}``) and a token or revocation
    request without a client assertion (``public:{address}``), each so many a minute
    for an address. A personal agent's requests are counted elsewhere, not here."""

    def __init__(self, per_minute: int, clock: Any = None) -> None:
        import time

        from agent_runtimes.addresses.access import RateCap

        self.cap = RateCap(per_minute, clock or time.monotonic)

    async def admit(self, client_id: str, account_id: Optional[str]) -> Optional[int]:
        if not client_id.startswith(("registration:", "public:")):
            return None
        return self.cap.take(client_id) or None


def build_company_of(addressed: AddressedAgent, agent_id: str) -> Any:
    """The PAP company of an agent that is one, at its agent host (the SDK's, as
    :class:`PapCompanyCapability` assembles it), its turns asked over its own A2A route."""
    import httpx
    from reactor import PluginManifest

    from agent_runtimes.addresses.accounts import DatalayerAccounts
    from agent_runtimes.addresses.agent_host import DEVICE_PATH
    from agent_runtimes.apps.principal import launched_for
    from agent_runtimes.pap.company import A2AApplication, PapCompanyCapability

    assert addressed.hosts is not None
    port = int(os.environ.get("AGENT_RUNTIMES_PORT") or 8765)
    client = httpx.AsyncClient(timeout=60.0)
    plugins = []
    if launched_for():
        # Its records kept where Datalayer keeps the deployment's (through ai-agents):
        # a restart forgets no sign-in, and Studio's approvals reach it.
        from agent_runtimes.addresses.company_store import DatalayerStoresPlugin

        plugins.append(
            (
                PluginManifest(name="agent-runtimes.pap.datalayer-stores", version="1"),
                DatalayerStoresPlugin(addressed.hosts.name),
            )
        )
    company = PapCompanyCapability(
        name=addressed.app.name,
        domain=addressed.hosts.host("agent"),
        company=addressed.app.pap.company,
        application=A2AApplication(
            f"http://127.0.0.1:{port}/api/v1/a2a/agents/{agent_id}/", http_client=client
        ),
        # Whose sign-ins are over: those of an account its deployment admits no more.
        accounts=DatalayerAccounts(addressed.access),
        http_client=client,
        device_page=f"{addressed.hosts.agent}{DEVICE_PATH}",
        plugins=plugins,
        hosted=True,
        operations=addressed,
        description=addressed.app.description,
        # Its MCP server is a service at a URL of its own: its issuer lists it in
        # `protected_resources` and issues tokens for it (PAP 1.0 §4.5, §7).
        resource_servers=(addressed.hosts.mcp,),
        # "Let other MCP clients sign in": at its authorization endpoint, allowed on
        # Datalayer's consent page by somebody who may open it, for its MCP address alone.
        mcp_clients=addressed.mcp_clients,
        consent_page=consent_page(addressed.hosts.name)
        if addressed.mcp_clients
        else None,
        rate_limit=UnsignedRequestsCap(addressed.access.policy.rate_per_minute),
    )
    return company


def company_of(addressed: AddressedAgent, agent_id: str) -> Any:
    """The company (:func:`build_company_of`), and its tokens taken at its addresses."""
    company = build_company_of(addressed, agent_id)
    # Its MCP server verifies the tokens issued for it with the company, and a
    # Datalayer token with what was checking tokens before the company's were added.
    addressed.company = company
    addressed.platform_tokens = addressed.access.token_checker
    # A person signed in with their personal agent calls its addresses with its PAP token.
    access = addressed.access
    access.token_checker = (
        either_token(access.token_checker, pap_token_checker(addressed))
        if access.token_checker is not None
        else pap_token_checker(addressed)
    )
    return company


#: The runtime's addresses (one agent, one process).
RUNTIME_ADDRESSES = RuntimeAddresses()


class AgentHostMiddleware:
    """ASGI, in front of the main server: the agent host, once the runtime's agent answers there."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        host = RUNTIME_ADDRESSES.agent_host
        if host is None:
            await self.app(scope, receive, send)
            return
        host.app = self.app
        await host(scope, receive, send)


async def serve_mode(
    addressed: AddressedAgent,
    mode: Mode,
    host: str = "127.0.0.1",
    port: Optional[int] = None,
) -> None:
    """Serve one of the three servers for ``addressed`` in this process, until stopped."""
    config = uvicorn.Config(
        mode_app(addressed, mode), host=host, port=port or PORTS[mode], log_level="info"
    )
    await uvicorn.Server(config).serve()


__all__ = [
    "AgentHostMiddleware",
    "PORTS",
    "RUNTIME_ADDRESSES",
    "RuntimeAddresses",
    "CompanyAsDeployed",
    "UnsignedRequestsCap",
    "addressed_in_runtime",
    "build_company_of",
    "company_of",
    "end_sign_ins_not_admitted",
    "mcp_clients_of",
    "pap_token_checker",
    "mode_app",
    "serve_mode",
    "take_address",
]

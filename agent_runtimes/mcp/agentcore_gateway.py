# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An Amazon Bedrock AgentCore Gateway as a remote MCP server (AC-20).

A catalogue server with ``auth: {kind: agentcore-gateway, identity: …}`` is a
gateway whose inbound authorizer trusts that identity (an identity issued by
``aws-agentcore``). Its bearer is never written in the spec: every request
asks the ``agentcore`` identity provider for the inbound token of the
gateway (``inbound_token``, its audience the gateway's ARN) and sends it as
``Authorization: Bearer …``. The provider keeps the token until it expires,
so a request asks IAM only when the last one has.

The gateway's ARN is its URL's (``https://<gateway-id>.gateway.bedrock-agentcore.<region>.amazonaws.com/mcp``)
in the account of the runtime (``AGENTCORE_RUNTIME_ARN``); a runtime that
does not know its account cannot name it, and the server is refused.

Every request also names the run's **policy session** in
``x-amzn-bedrock-agentcore-policy-session-id``: the session uid of the last
invocation (one session per microVM), over which the organization's policy
engine keeps the history its temporal policies read (AC-44). When the
organization's temporal policies change, AgentCore ends the open policy
sessions and answers ``409``: the session is restarted under a new id
(``<uid>-<n>``), said in a sentence, and the request sent again once.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, AsyncGenerator, Awaitable, Callable, Mapping, Optional
from urllib.parse import urlparse

import httpx2

from agent_runtimes.agentcore.exchange import RUNTIME_ARN_VARIABLE, runtime_exchange
from agent_runtimes.plugins.points import IdentityRefused

logger = logging.getLogger(__name__)

#: The ``auth`` kind of a gateway.
AGENTCORE_GATEWAY_AUTH = "agentcore-gateway"

#: A gateway's MCP host.
GATEWAY_HOST = re.compile(
    r"^(?P<gateway>[a-z0-9][a-z0-9-]*)\.gateway\.bedrock-agentcore\."
    r"(?P<region>[a-z0-9-]+)\.amazonaws\.com$"
)
#: The header a Gateway reads the policy session from.
POLICY_SESSION_HEADER = "x-amzn-bedrock-agentcore-policy-session-id"
#: What a Gateway answers a call in a policy session it ended.
POLICY_SESSION_ENDED = 409
#: An AgentCore runtime's ARN.
RUNTIME_ARN = re.compile(
    r"^arn:aws:bedrock-agentcore:(?P<region>[a-z0-9-]+):(?P<account>\d{12}):runtime/.+$"
)


def gateway_arn_of(url: str, runtime_arn: str) -> str:
    """Return a gateway's ARN from its MCP URL and the runtime's ARN (its account).

    Parameters
    ----------
    url : str
        The gateway's MCP URL.
    runtime_arn : str
        This runtime's ARN; the gateway is in its account.

    Returns
    -------
    str
        ``arn:aws:bedrock-agentcore:<region>:<account>:gateway/<gateway-id>``.

    Raises
    ------
    IdentityRefused
        When the URL is not a gateway's, or the runtime's ARN names no account.
    """
    host = GATEWAY_HOST.match(urlparse(url).hostname or "")
    if host is None:
        raise IdentityRefused(
            f"{url} is not an AgentCore Gateway's URL "
            "(https://<gateway-id>.gateway.bedrock-agentcore.<region>.amazonaws.com/mcp)."
        )
    runtime = RUNTIME_ARN.match(runtime_arn or "")
    if runtime is None:
        raise IdentityRefused(
            f"The gateway at {url} is named by its ARN in this runtime's account, and this "
            f"runtime does not know its own ({RUNTIME_ARN_VARIABLE}): it runs on AgentCore."
        )
    return (
        f"arn:aws:bedrock-agentcore:{host['region']}:{runtime['account']}:"
        f"gateway/{host['gateway']}"
    )


class PolicySession:
    """The AgentCore policy session a run's Gateway calls are decided in.

    It is the session uid of the last invocation; after AgentCore ended it (a
    change of the organization's temporal policies), ``<uid>-<n>``, the
    ``n``-th restart, whose history starts empty.
    """

    def __init__(self) -> None:
        self._uid = ""
        self._restarts = 0

    def use(self, uid: str) -> None:
        """Decide the Gateway's calls in the session ``uid`` from now on (a new invocation's)."""
        if uid != self._uid:
            self._uid = uid
            self._restarts = 0

    @property
    def id(self) -> str:
        """Return the policy session id to send.

        Raises
        ------
        IdentityRefused
            When no invocation has named its session yet.
        """
        if not self._uid:
            raise IdentityRefused(
                "No session to decide the AgentCore Gateway's calls in: an invocation names it."
            )
        return self._uid if self._restarts == 0 else f"{self._uid}-{self._restarts}"

    def restart(self) -> str:
        """Start a new policy session after AgentCore ended the current one; return its id."""
        ended = self.id
        self._restarts += 1
        logger.warning(
            f"AgentCore ended the policy session {ended}: the organization's temporal policies "
            f"changed. The Gateway's calls go on in policy session {self.id}, whose history starts empty."
        )
        return self.id


#: The policy session of this process (one session per microVM).
_POLICY_SESSION = PolicySession()


def policy_session() -> PolicySession:
    """Return this process's policy session."""
    return _POLICY_SESSION


def _invocation_caller() -> Mapping[str, Any]:
    """Return who the run acts for: the last invocation's token (one session per microVM)."""
    exchange = runtime_exchange()
    return {"token": exchange.last_inbound if exchange is not None else ""}


def agentcore_provider(platform: Any = None) -> Any:
    """Return the accepted ``agentcore`` identity provider, whatever the runtime's target."""
    from agent_runtimes.agentcore.identity import AGENTCORE_IDENTITY_ID
    from agent_runtimes.plugins.host import accepted, session_platform
    from agent_runtimes.plugins.points import IDENTITY_PROVIDERS

    for contribution in accepted(session_platform(platform), IDENTITY_PROVIDERS):
        if contribution.id == AGENTCORE_IDENTITY_ID:
            return contribution.value
    raise IdentityRefused(
        "No agentcore identity provider is contributed: an AgentCore Gateway's bearer is its."
    )


class AgentCoreGatewayAuth(httpx2.Auth):
    """Send each request to a gateway with the inbound token the provider obtains.

    Parameters
    ----------
    audience : str
        The gateway's ARN, the token's ``aud``.
    provider : Callable[[], Any], optional
        Return the identity provider asked (the accepted ``agentcore`` one).
    caller : Callable[[], Mapping[str, Any]], optional
        Return who the run acts for (the last invocation's token).
    session : Callable[[], PolicySession], optional
        Return the policy session the calls are decided in (this process's).
    """

    #: The body is read first, so a request can be sent again in a new policy session.
    requires_request_body = True

    def __init__(
        self,
        audience: str,
        *,
        provider: Optional[Callable[[], Any]] = None,
        caller: Optional[Callable[[], Mapping[str, Any]]] = None,
        session: Optional[Callable[[], PolicySession]] = None,
    ) -> None:
        self.audience = audience
        self._provider = provider or agentcore_provider
        self._caller = caller or _invocation_caller
        self._session = session or policy_session

    async def bearer(self) -> str:
        """Return the gateway's inbound token for the run, from the provider."""
        token: Awaitable[str] = self._provider().inbound_token(
            self._caller(), self.audience
        )
        return await token

    async def async_auth_flow(
        self, request: httpx2.Request
    ) -> AsyncGenerator[httpx2.Request, httpx2.Response]:
        """Set the bearer and the policy session on a request; once more in a new session after a 409."""
        session = self._session()
        request.headers["Authorization"] = f"Bearer {await self.bearer()}"
        request.headers[POLICY_SESSION_HEADER] = session.id
        response = yield request
        if response.status_code == POLICY_SESSION_ENDED:
            request.headers[POLICY_SESSION_HEADER] = session.restart()
            yield request

    def sync_auth_flow(self, request: httpx2.Request) -> Any:
        """Refuse a synchronous request: the bearer is asked for asynchronously."""
        raise RuntimeError("An AgentCore Gateway is reached asynchronously.")


def gateway_auth_of(config: Any) -> Optional[AgentCoreGatewayAuth]:
    """Return the auth of a catalogue server whose bearer is minted, or ``None``.

    Parameters
    ----------
    config : MCPServer
        The server's configuration.

    Returns
    -------
    AgentCoreGatewayAuth or None
        For an ``agentcore-gateway`` server; ``None`` for one without ``auth``.

    Raises
    ------
    IdentityRefused
        When its ``auth`` is not one this runtime knows, or its ARN cannot be named.
    """
    auth = getattr(config, "auth", None)
    if auth is None:
        return None
    if auth.kind != AGENTCORE_GATEWAY_AUTH:
        raise IdentityRefused(
            f"MCP server {config.id!r}: its auth {auth.kind!r} is not one this runtime knows."
        )
    return AgentCoreGatewayAuth(
        gateway_arn_of(config.url, os.environ.get(RUNTIME_ARN_VARIABLE, ""))
    )


__all__ = [
    "AGENTCORE_GATEWAY_AUTH",
    "POLICY_SESSION_HEADER",
    "AgentCoreGatewayAuth",
    "PolicySession",
    "agentcore_provider",
    "gateway_arn_of",
    "gateway_auth_of",
    "policy_session",
]

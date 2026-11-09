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
"""

from __future__ import annotations

import os
import re
from typing import Any, AsyncGenerator, Awaitable, Callable, Mapping, Optional
from urllib.parse import urlparse

import httpx2

from agent_runtimes.agentcore.exchange import RUNTIME_ARN_VARIABLE, runtime_exchange
from agent_runtimes.plugins.points import IdentityRefused

#: The ``auth`` kind of a gateway.
AGENTCORE_GATEWAY_AUTH = "agentcore-gateway"

#: A gateway's MCP host.
GATEWAY_HOST = re.compile(
    r"^(?P<gateway>[a-z0-9][a-z0-9-]*)\.gateway\.bedrock-agentcore\."
    r"(?P<region>[a-z0-9-]+)\.amazonaws\.com$"
)
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
    """

    def __init__(
        self,
        audience: str,
        *,
        provider: Optional[Callable[[], Any]] = None,
        caller: Optional[Callable[[], Mapping[str, Any]]] = None,
    ) -> None:
        self.audience = audience
        self._provider = provider or agentcore_provider
        self._caller = caller or _invocation_caller

    async def bearer(self) -> str:
        """Return the gateway's inbound token for the run, from the provider."""
        token: Awaitable[str] = self._provider().inbound_token(
            self._caller(), self.audience
        )
        return await token

    async def async_auth_flow(
        self, request: httpx2.Request
    ) -> AsyncGenerator[httpx2.Request, httpx2.Response]:
        """Set the bearer on a request to the gateway."""
        request.headers["Authorization"] = f"Bearer {await self.bearer()}"
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
    "AgentCoreGatewayAuth",
    "agentcore_provider",
    "gateway_arn_of",
    "gateway_auth_of",
]

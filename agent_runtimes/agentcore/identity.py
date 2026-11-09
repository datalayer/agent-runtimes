# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``agentcore`` identity provider (ID-21): AgentCore Identity's vault.

- ``workload_token`` — on AgentCore Runtime, the token its invocation
  carries (the ``WorkloadAccessToken`` header, held for the turn by
  :func:`use_workload_token`); a runtime-managed workload identity cannot
  fetch its own and this never tries. Elsewhere,
  ``get_workload_access_token_for_jwt(workloadName, userToken)`` (ID-06).
  ``GetWorkloadAccessTokenForUserId`` is never called: asked for a user id,
  it refuses.
- ``oauth_token`` — ``get_resource_oauth2_token`` (ID-07). A token answered is
  returned; an authorization URL is handed to ``on_auth_url`` and the same
  call is repeated with the ``sessionUri`` answered until a token comes, the
  person declines (``sessionStatus = FAILED``, a sentence), or the wait ends
  (five minutes, a sentence). Without ``on_auth_url``,
  :class:`AuthorizationRequired` carries the URL at once.
- ``api_key`` — ``get_resource_api_key`` (ID-08).
- ``complete_binding`` — ``complete_resource_token_auth`` with the person's
  token (ID-09).
- ``inbound_token`` — IAM's exchanged token for the runtime (ID-03) is the
  platform's to mint: given an ``exchange``, it is asked; without one, refused.

Every token answered is held (:func:`agent_runtimes.guardrails.credentials.hold`):
withheld wherever it would be shown.
"""

from __future__ import annotations

import asyncio
import inspect
import os
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Awaitable, Callable, Dict, Iterator, Mapping, Optional, Sequence

from agent_runtimes.agentcore.target import AGENTCORE_TARGET_ID, TARGET_ENV
from agent_runtimes.plugins.points import (
    AuthorizationDeclined,
    AuthorizationRequired,
    AuthorizationTimedOut,
    IdentityRefused,
)

#: The provider's id, as ``identity.provider`` knows it.
AGENTCORE_IDENTITY_ID = "agentcore"

#: The header AgentCore Runtime carries the workload access token in.
WORKLOAD_TOKEN_HEADER = "WorkloadAccessToken"

#: The OAuth flows asked for.
OAUTH_FLOWS = ("USER_FEDERATION", "M2M")

#: How long a grant is waited for, by default.
DEFAULT_WAIT_SECONDS = 300.0
#: How often AgentCore is asked again while waiting.
DEFAULT_POLL_SECONDS = 2.0

#: The workload's name outside AgentCore Runtime, when none is given.
WORKLOAD_NAME_ENV = "AGENTCORE_WORKLOAD_NAME"
#: Where the person is sent back after a grant (the binding URL, ID-09).
RETURN_URL_ENV = "AGENTCORE_OAUTH_RETURN_URL"

#: The workload token of the invocation being served.
_WORKLOAD_TOKEN: ContextVar[str] = ContextVar("agentcore_workload_token", default="")


def workload_token_from_headers(headers: Mapping[str, str]) -> str:
    """The workload token an AgentCore invocation's headers carry, or ``""``."""
    wanted = WORKLOAD_TOKEN_HEADER.lower()
    for name, value in headers.items():
        if str(name).lower() == wanted:
            return str(value or "").strip()
    return ""


@contextmanager
def use_workload_token(token: str) -> Iterator[None]:
    """Hold an invocation's workload token while its turn runs."""
    reset = _WORKLOAD_TOKEN.set(token)
    try:
        yield
    finally:
        _WORKLOAD_TOKEN.reset(reset)


def _hold(token: str) -> str:
    from agent_runtimes.guardrails.credentials import hold

    hold(token)
    return token


async def _call(answer: Any) -> Any:
    return await answer if inspect.isawaitable(answer) else answer


class AgentCoreIdentity:
    """The ``agentcore`` identity provider."""

    id = AGENTCORE_IDENTITY_ID

    def __init__(
        self,
        client: Any = None,
        *,
        region: str = "",
        workload_name: str = "",
        return_url: str = "",
        wait_seconds: float = DEFAULT_WAIT_SECONDS,
        poll_seconds: float = DEFAULT_POLL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
        exchange: Optional[Callable[[Mapping[str, Any], str], Any]] = None,
    ) -> None:
        self._client = client
        self.region = region
        self.workload_name = workload_name
        self.return_url = return_url
        self.wait_seconds = wait_seconds
        self.poll_seconds = poll_seconds
        self.clock = clock
        self.sleep = sleep
        self.exchange = exchange

    def client(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client(
                "bedrock-agentcore",
                region_name=self.region or os.environ.get("AWS_REGION") or None,
            )
        return self._client

    async def _ask(self, operation: str, **parameters: Any) -> Dict[str, Any]:
        return await asyncio.to_thread(getattr(self.client(), operation), **parameters)

    async def inbound_token(self, caller: Mapping[str, Any], audience: str) -> str:
        """Exchange for IAM's token for ``audience`` (the runtime's ARN), by the exchange given."""
        if self.exchange is None:
            raise IdentityRefused(
                f"No token exchange is configured: AgentCore accepts IAM's exchanged token "
                f"for {audience}, which the platform mints."
            )
        token = str(await _call(self.exchange(caller, audience)) or "")
        if not token:
            raise IdentityRefused(
                f"The token exchange answered no token for {audience}."
            )
        return _hold(token)

    async def workload_token(self, context: Mapping[str, Any]) -> str:
        """The agent's workload token: the invocation's, or one asked for by the person's JWT."""
        token = (
            str(context.get("workload_access_token") or "").strip()
            or workload_token_from_headers(context.get("headers") or {})
            or _WORKLOAD_TOKEN.get()
        )
        if token:
            return token
        if context.get("user_id"):
            raise IdentityRefused(
                "A workload token is asked for a person by their JWT, never by a user id: "
                "GetWorkloadAccessTokenForUserId is not called."
            )
        if os.environ.get(TARGET_ENV) == AGENTCORE_TARGET_ID:
            raise IdentityRefused(
                "This runtime runs in AgentCore Runtime and its invocation carried no "
                "workload token: a runtime-managed workload identity cannot fetch its own."
            )
        workload_name = str(
            context.get("workload_name")
            or self.workload_name
            or os.environ.get(WORKLOAD_NAME_ENV, "")
        )
        user_token = str(context.get("user_token") or "")
        if not workload_name or not user_token:
            raise IdentityRefused(
                "A workload token outside AgentCore Runtime needs the workload's name and "
                f"the person's token, and {'neither was' if not (workload_name or user_token) else 'one was not'} given."
            )
        answer = await self._ask(
            "get_workload_access_token_for_jwt",
            workloadName=workload_name,
            userToken=user_token,
        )
        return _hold(answer["workloadAccessToken"])

    async def oauth_token(
        self,
        provider: str,
        scopes: Sequence[str],
        flow: str = "USER_FEDERATION",
        on_auth_url: Optional[Callable[[str], Any]] = None,
        *,
        context: Optional[Mapping[str, Any]] = None,
        force_authentication: bool = False,
        return_url: str = "",
        custom_state: str = "",
    ) -> str:
        """A third party's access token from the vault, waiting for the grant when asked."""
        if flow not in OAUTH_FLOWS:
            raise ValueError(
                f"{flow!r} is not an OAuth flow asked for: one of {', '.join(OAUTH_FLOWS)}."
            )
        if not scopes:
            raise ValueError(
                f"No scopes: a token for {provider} is asked for with one at least."
            )
        request: Dict[str, Any] = {
            "workloadIdentityToken": await self.workload_token(context or {}),
            "resourceCredentialProviderName": provider,
            "scopes": list(scopes),
            "oauth2Flow": flow,
        }
        return_url = return_url or self.return_url or os.environ.get(RETURN_URL_ENV, "")
        if return_url and flow == "USER_FEDERATION":
            request["resourceOauth2ReturnUrl"] = return_url
        if custom_state:
            request["customState"] = custom_state
        first = (
            dict(request, forceAuthentication=True) if force_authentication else request
        )
        answer = await self._ask("get_resource_oauth2_token", **first)
        if answer.get("accessToken"):
            return _hold(answer["accessToken"])
        url = str(answer.get("authorizationUrl") or "")
        if not url:
            raise IdentityRefused(
                f"AgentCore answered neither a token nor an authorization URL for {provider}."
            )
        session_uri = str(answer.get("sessionUri") or "")
        if on_auth_url is None:
            raise AuthorizationRequired(provider, url, session_uri)
        await _call(on_auth_url(url))
        if session_uri:
            request["sessionUri"] = session_uri
        deadline = self.clock() + self.wait_seconds
        while True:
            if self.clock() >= deadline:
                raise AuthorizationTimedOut(
                    f"Access to {provider} was not granted within "
                    f"{int(self.wait_seconds)} seconds: ask again when it is."
                )
            await self.sleep(self.poll_seconds)
            answer = await self._ask("get_resource_oauth2_token", **request)
            if answer.get("accessToken"):
                return _hold(answer["accessToken"])
            if answer.get("sessionStatus") == "FAILED":
                raise AuthorizationDeclined(
                    f"Access to {provider} was not granted: the person declined, or the grant failed."
                )

    async def api_key(
        self, provider: str, *, context: Optional[Mapping[str, Any]] = None
    ) -> str:
        """A third party's API key from the vault."""
        answer = await self._ask(
            "get_resource_api_key",
            workloadIdentityToken=await self.workload_token(context or {}),
            resourceCredentialProviderName=provider,
        )
        return _hold(answer["apiKey"])

    async def complete_binding(
        self, session_uri: str, caller: Mapping[str, Any]
    ) -> None:
        """Finish a consent flow for the person whose token ``caller`` carries."""
        if caller.get("user_id"):
            raise IdentityRefused(
                "A consent is bound to a person by their token, never by a user id."
            )
        user_token = str(caller.get("user_token") or "")
        if not user_token:
            raise IdentityRefused(
                "No token of the person: a consent is bound to who granted it."
            )
        if not session_uri:
            raise IdentityRefused(
                "No session URI: nothing names the consent to complete."
            )
        await self._ask(
            "complete_resource_token_auth",
            userIdentifier={"userToken": user_token},
            sessionUri=session_uri,
        )


#: The contribution.
AGENTCORE_IDENTITY = AgentCoreIdentity()


__all__ = [
    "AGENTCORE_IDENTITY",
    "AGENTCORE_IDENTITY_ID",
    "DEFAULT_POLL_SECONDS",
    "DEFAULT_WAIT_SECONDS",
    "OAUTH_FLOWS",
    "RETURN_URL_ENV",
    "WORKLOAD_NAME_ENV",
    "WORKLOAD_TOKEN_HEADER",
    "AgentCoreIdentity",
    "use_workload_token",
    "workload_token_from_headers",
]

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The built-in ``datalayer`` identity provider (ID-20): what exists today,
behind the ``identity.provider`` point, with no change of behaviour.

- ``inbound_token`` — the platform JWT the caller carries, unchanged.
- ``workload_token`` — the deployment's acting token: its application's
  principal's (:func:`agent_runtimes.apps.principal.principal_token`).
- ``oauth_token`` — IAM's held secret, answered per call: Gmail through
  ``google-workspace`` (:func:`agent_runtimes.mcp.google_workspace.gmail_access_token`),
  narrowed by IAM to the connection's level (the scopes asked are not IAM's
  to widen); the person's GitHub through ``github``
  (:mod:`agent_runtimes.identity.github_connection`), on a runtime of theirs.
  When the person has not connected GitHub, the start link of GitHub's
  consent goes to ``on_auth_url`` and IAM is asked again until the grant is
  there (bounded, a sentence on timeout); without ``on_auth_url``,
  :class:`AuthorizationRequired` carries the link. Any other provider is
  refused, IAM holds no grant for it.
- ``api_key`` — the secret of that name the runtime was given: on a
  deployment only what its specs declare (R-19), set in this process's
  environment by the configure (``guardrails.declared_secrets``).
- ``complete_binding`` — refused: IAM binds a consent on its own pages.
"""

from __future__ import annotations

import asyncio
import inspect
import os
import time
from typing import Any, Awaitable, Callable, Mapping, Optional, Sequence

from agent_runtimes.plugins.points import (
    AuthorizationRequired,
    AuthorizationTimedOut,
    IdentityRefused,
)

#: The provider's id, as ``identity.provider`` knows it.
DATALAYER_IDENTITY_ID = "datalayer"


class DatalayerIdentity:
    """The ``datalayer`` identity provider: Datalayer IAM, as the runtime reaches it today."""

    id = DATALAYER_IDENTITY_ID

    def __init__(
        self,
        *,
        wait_seconds: Optional[float] = None,
        poll_seconds: Optional[float] = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
    ) -> None:
        from agent_runtimes.agentcore.identity import (
            DEFAULT_POLL_SECONDS,
            DEFAULT_WAIT_SECONDS,
        )

        # The grant is waited for as AgentCore's is: as long, as often.
        self.wait_seconds = (
            DEFAULT_WAIT_SECONDS if wait_seconds is None else wait_seconds
        )
        self.poll_seconds = (
            DEFAULT_POLL_SECONDS if poll_seconds is None else poll_seconds
        )
        self.clock = clock
        self.sleep = sleep

    async def inbound_token(self, caller: Mapping[str, Any], audience: str) -> str:
        """The platform JWT the caller carries; the platform's services all accept it."""
        token = str(caller.get("token") or "")
        if not token:
            raise IdentityRefused(
                "The caller carries no platform token: nobody is signed in."
            )
        return token

    async def workload_token(self, context: Mapping[str, Any]) -> str:
        """The token of the deployment's application's principal."""
        from agent_runtimes.apps.principal import (
            principal_token,
            principal_token_refusal,
        )

        deployment_uid = str(context.get("deployment_uid") or "")
        if not deployment_uid:
            raise IdentityRefused(
                "No deployment: an agent acts with its application's principal's token only "
                "when deployed."
            )
        refusal = principal_token_refusal(deployment_uid)
        if refusal:
            raise IdentityRefused(refusal)
        return str(principal_token(deployment_uid))

    async def oauth_token(
        self,
        provider: str,
        scopes: Sequence[str],
        flow: str = "USER_FEDERATION",
        on_auth_url: Optional[Callable[[str], Any]] = None,
        *,
        context: Optional[Mapping[str, Any]] = None,
        force_authentication: bool = False,
    ) -> str:
        """An access token IAM answers from the person's held grant (Gmail, GitHub)."""
        from agent_runtimes.identity.github_connection import GITHUB_PROVIDER
        from agent_runtimes.mcp.google_workspace import (
            GOOGLE_WORKSPACE_SERVER,
            GmailRefused,
            gmail_access_token,
        )

        context = context or {}
        if provider == GITHUB_PROVIDER:
            return await self._github_token(scopes, on_auth_url, context)
        if provider != GOOGLE_WORKSPACE_SERVER:
            raise IdentityRefused(
                f"Datalayer IAM holds no OAuth grant for {provider}: it holds grants for "
                f"{GOOGLE_WORKSPACE_SERVER} and {GITHUB_PROVIDER} alone."
            )
        agent_id = str(context.get("agent_id") or "")
        if not agent_id:
            raise IdentityRefused(
                f"No agent: a {provider} token is minted for a deployed application's agent."
            )
        try:
            return await gmail_access_token(agent_id, context.get("bearer"))
        except GmailRefused as why:
            raise IdentityRefused(str(why)) from None

    async def _github_token(
        self,
        scopes: Sequence[str],
        on_auth_url: Optional[Callable[[str], Any]],
        context: Mapping[str, Any],
    ) -> str:
        """The person's GitHub token from IAM, asking them to connect first when they have not."""
        from agent_runtimes.identity import github_connection as github

        try:
            return await github.ask_token(context, scopes)
        except github.NotConnected as why:
            not_connected = str(why)
        url = await github.connect_url(context, scopes)
        if on_auth_url is None:
            raise AuthorizationRequired(github.GITHUB_PROVIDER, url)
        shown = on_auth_url(url)
        if inspect.isawaitable(shown):
            await shown
        deadline = self.clock() + self.wait_seconds
        while self.clock() < deadline:
            await self.sleep(self.poll_seconds)
            try:
                return await github.ask_token(context, scopes)
            except github.NotConnected as why:
                not_connected = str(why)
        raise AuthorizationTimedOut(
            f"Access to {github.GITHUB_PROVIDER} was not granted within "
            f"{int(self.wait_seconds)} seconds ({not_connected}): ask again when it is."
        )

    async def api_key(
        self, provider: str, *, context: Optional[Mapping[str, Any]] = None
    ) -> str:
        """The secret named ``provider`` the runtime was given."""
        from agent_runtimes.guardrails.declared_secrets import (
            given_names,
            on_a_deployment,
        )

        if on_a_deployment() and provider not in given_names():
            raise IdentityRefused(
                f"{provider} is not among the secrets this runtime's specs declare: "
                "declare it on the MCP server or the skill that needs it."
            )
        value = os.environ.get(provider, "")
        if not value:
            raise IdentityRefused(
                f"{provider} was not given to this runtime: add it to the account's secrets "
                "(or set it before a local run)."
            )
        return value

    async def complete_binding(
        self, session_uri: str, caller: Mapping[str, Any]
    ) -> None:
        """Refused: Datalayer IAM binds a consent on its own pages."""
        raise IdentityRefused(
            "Datalayer IAM binds a consent on its own pages: there is no binding to complete here."
        )


#: The contribution.
DATALAYER_IDENTITY = DatalayerIdentity()


__all__ = ["DATALAYER_IDENTITY", "DATALAYER_IDENTITY_ID", "DatalayerIdentity"]

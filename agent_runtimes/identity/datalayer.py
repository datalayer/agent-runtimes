# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The built-in ``datalayer`` identity provider (ID-20): what exists today,
behind the ``identity.provider`` point, with no change of behaviour.

- ``inbound_token`` — the platform JWT the caller carries, unchanged.
- ``workload_token`` — the deployment's acting token: its application's
  principal's (:func:`agent_runtimes.apps.principal.principal_token`).
- ``oauth_token`` — IAM's held secret minted per call: Gmail through
  ``google-workspace`` (:func:`agent_runtimes.mcp.google_workspace.gmail_access_token`),
  narrowed by IAM to the connection's level (the scopes asked are not IAM's
  to widen); any other provider is refused, IAM holds no grant for it.
- ``api_key`` — the secret of that name the runtime was given: on a
  deployment only what its specs declare (R-19), set in this process's
  environment by the configure (``guardrails.declared_secrets``).
- ``complete_binding`` — refused: IAM binds a consent on its own pages.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Mapping, Optional, Sequence

from agent_runtimes.plugins.points import IdentityRefused

#: The provider's id, as ``identity.provider`` knows it.
DATALAYER_IDENTITY_ID = "datalayer"


class DatalayerIdentity:
    """The ``datalayer`` identity provider: Datalayer IAM, as the runtime reaches it today."""

    id = DATALAYER_IDENTITY_ID

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
        """An access token IAM mints from the person's held grant (Gmail today)."""
        from agent_runtimes.mcp.google_workspace import (
            GOOGLE_WORKSPACE_SERVER,
            GmailRefused,
            gmail_access_token,
        )

        if provider != GOOGLE_WORKSPACE_SERVER:
            raise IdentityRefused(
                f"Datalayer IAM holds no OAuth grant for {provider}: it mints tokens for "
                f"{GOOGLE_WORKSPACE_SERVER} alone."
            )
        context = context or {}
        agent_id = str(context.get("agent_id") or "")
        if not agent_id:
            raise IdentityRefused(
                f"No agent: a {provider} token is minted for a deployed application's agent."
            )
        try:
            return await gmail_access_token(agent_id, context.get("bearer"))
        except GmailRefused as why:
            raise IdentityRefused(str(why)) from None

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

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that demonstrates the PAP Session JWT trust boundary."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from typing import Any

import jwt
from personal_agent_protocol import (
    ClientMetadata,
    DelegatedSessionSigner,
    InMemoryDelegatedKeys,
    JsonWebKeySet,
    SessionError,
    SessionJwtRequest,
)
from personal_agent_protocol.company import MemoryReplayCache
from personal_agent_protocol.company.verify import verify_session_jwt
from personal_agent_protocol.demo.kit import AgentIdentity
from personal_agent_protocol.sessions import new_session_id
from pydantic import SecretStr

from agent_runtimes.apps import Application

app = Application(
    id="pap-session-jwt",
    name="PAP Session JWT",
    description="Verify a Session JWT's bindings and replay refusal without exposing secrets.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_session_jwt to explain how a Session JWT protects a request. Never "
        "ask for or expose a private key, access token, Session JWT, delegation, JWK, "
        "jti, Session ID, or User ID."
    ),
)


@app.tool(does="read")
async def explain_session_jwt(method: str, url: str) -> dict[str, Any]:
    """Sign and verify a real Session JWT, then return only its safety properties."""

    # A key from the agent's `jwks_uri` signs a delegation to a delegated key, one per
    # User ID at one Company, and that key signs each request's Session JWT (§5.2). Both
    # stay in the host's key custody.
    identity = AgentIdentity(domain="agent.example", name="Example")
    signer = DelegatedSessionSigner(InMemoryDelegatedKeys(), signer=identity.signer())
    metadata = ClientMetadata.model_validate(identity.metadata)
    published = JsonWebKeySet.model_validate(identity.jwks)

    async def resolve(
        client_id: str, kid: str | None
    ) -> tuple[ClientMetadata, JsonWebKeySet]:
        return metadata, published

    issuer = "https://company.example"
    access_token = SecretStr("host-only-example-token")
    request = SessionJwtRequest(
        method=method,
        url=url,
        tenant_id="example-tenant",
        issuer=issuer,
        client_id=identity.client_id,
        sid=new_session_id(),
        sub="usr_host_only_example",
        access_token=access_token,
    )
    session_jwt = await signer.sign(request)
    other_user = await signer.sign(replace(request, sub="usr_host_only_other"))
    replay_cache = MemoryReplayCache()

    async def refused(**changed: Any) -> bool:
        """Whether the company answers `invalid_session` for this JWT and this request."""

        checks: dict[str, Any] = {
            "issuer": issuer,
            "method": method,
            "url": url,
            "access_token": access_token.get_secret_value(),
            **changed,
        }
        try:
            await verify_session_jwt(
                session_jwt.get_secret_value(),
                resolve=resolve,
                replay_cache=replay_cache,
                now=datetime.now(timezone.utc),
                **checks,
            )
        except SessionError as error:
            return error.code == "invalid_session"
        return False

    # Each of these fails before the JWT is marked as seen, so it stays usable once.
    another_company = await refused(issuer="https://other-company.example")
    another_method = await refused(
        method="DELETE" if method.upper() != "DELETE" else "GET"
    )
    another_url = await refused(url="https://company.example/elsewhere")
    another_token = await refused(access_token="host-only-other-token")  # noqa: S106
    accepted = not await refused()
    replay_rejected = await refused()

    return {
        "algorithm": "ES256",
        "signature_verified": accepted,
        "method_bound": another_method,
        "url_bound": another_url,
        "access_token_bound": another_token,
        "company_bound": another_company,
        "replay_rejected": replay_rejected,
        "one_delegated_key_per_user_id": jwt.get_unverified_header(
            session_jwt.get_secret_value()
        )["kid"]
        != jwt.get_unverified_header(other_user.get_secret_value())["kid"],
        # What a tool may tell a model: that the checks held. What it may not: anything
        # a request is signed with, or anything that names the User or the Session.
        "session_jwt_withheld": True,
        "delegation_withheld": True,
        "access_token_withheld": True,
        "key_material_withheld": True,
        "session_and_user_ids_withheld": True,
    }

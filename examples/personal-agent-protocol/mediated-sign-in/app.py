# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Relay a user's credentials once through PAP Mediated Sign-In, never through a model."""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import DiscoveryClient, SessionClient
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    ScriptedInput,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import ADA, ADA_CODE, manzanita
from personal_agent_protocol.mediated import MediatedSignInClient

from agent_runtimes.apps import Application

TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_manzanita_000000"

app = Application(
    id="pap-mediated-sign-in",
    name="PAP Mediated Sign-In",
    description="Collect credentials on the host's protected input and send them to one endpoint, once.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_mediated_sign_in. Never ask the user for a password or a "
        "one-time code in chat, and never expose credentials, codes, or tokens."
    ),
)


@app.tool(does="read")
async def explain_mediated_sign_in() -> dict[str, Any]:
    """Run the real Mediated Sign-In client and return only non-secret evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    manzanita(network, clock)
    # `pap.protectedInput`: the host's trusted surface. In a demo it is a script:
    # the credentials, a mistyped code, then the right one.
    surface = ScriptedInput(dict(ADA), {"code": "000000"}, {"code": ADA_CODE})
    host = PersonalAgentHost(atlas, clock, protected_input=surface)
    async with network.client() as http:
        reactor = personal_agent_reactor(host, network=network, http_client=http)
        company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
            "manzanita.example"
        )
        auth = company.document.auth
        assert auth is not None and auth.mediated is not None
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id=atlas.client_id,
            pairwise_user_id=PAIRWISE,
            issuer=auth.issuer,
            token_endpoint=company.oauth_metadata.token_endpoint,  # type: ignore[union-attr]
            tenant_id=TENANT,
        )
        who = {"tenant_id": TENANT, "issuer": auth.issuer}
        mediated = MediatedSignInClient(reactor=reactor, http_client=http)
        started = await mediated.sign_in(
            mediated=auth.mediated,
            organization=company.document.organization,
            scopes=("orders:read",),
            token=session,
            **who,
        )
        assert started.reference is not None
        wrong = await mediated.submit_code(started.reference, token=session, **who)
        done = await mediated.submit_code(started.reference, token=session, **who)

    evidence = (
        done.model_dump_json() + started.model_dump_json() + wrong.model_dump_json()
    )
    return {
        "company": company.document.organization.name,
        "declared_fields": [field.name for field in auth.mediated.fields],
        "secret_fields": [field.name for field in auth.mediated.fields if field.secret],
        "endpoint_host": auth.mediated.endpoint.split("/")[2],
        "asked_on_protected_input": [request.purpose for request in surface.asked],
        "first_answer": started.status,
        "code_sent_to": started.sent_to,
        "mistyped_code_answer": wrong.status,
        "final_status": done.status,
        "same_session_signed_in": done.token is not None
        and done.token.signed_in
        and done.token.session_key == session.session_key,
        "granted_scopes": done.granted_scopes,
        "account_token_stored_by_reference": done.account_token_reference
        in host.vault.values,
        "password_absent_from_every_result": ADA["password"] not in evidence,
        "credentials_and_codes_withheld": True,
        "session_and_account_tokens_withheld": True,
    }

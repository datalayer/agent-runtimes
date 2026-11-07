# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application demonstrating PAP Mediated Sign-In with protected input."""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import AuthorizationError, DiscoveryClient
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    ScriptedInput,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import ADA, ADA_CODE, manzanita
from personal_agent_protocol.mediated import (
    MEDIATED_EXTENSION,
    MediatedSignInClient,
    mediated_sign_in,
)
from personal_agent_protocol.models import ExtensionDescriptor

from agent_runtimes.apps import Application

TENANT = "atlas-demo"

app = Application(
    id="pap-mediated-sign-in",
    name="PAP Mediated Sign-In",
    description="Collect credentials on the host's protected input and send them to one endpoint, once.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_mediated_sign_in to explain PAP Mediated Sign-In. Never ask the "
        "user for a password or one-time code in chat: the host's own protected input "
        "collects them. Never expose credentials, codes, or tokens."
    ),
)


@app.tool(does="read")
async def explain_mediated_sign_in() -> dict[str, Any]:
    """Sign in with the Mediated Sign-In grant at Manzanita's token endpoint: safe evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    manzanita(network, clock)
    http = network.client()
    # The host's trusted input surface (`pap.protectedInput`). In a real host the user
    # types into it; here a script answers: her credentials, a wrong code, the right one.
    typed = ScriptedInput(dict(ADA), {"code": "000000"}, {"code": ADA_CODE})
    host = PersonalAgentHost(atlas, clock, protected_input=typed)
    reactor = personal_agent_reactor(host, network=network, http_client=http)

    company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
        "manzanita.example"
    )
    offered = mediated_sign_in(company)
    if offered is None or company.oauth_metadata is None:
        raise RuntimeError("the example world is incomplete")
    mediated = MediatedSignInClient(reactor=reactor, http_client=http)

    # A field named like a parameter of the grant is refused before the user is asked anything.
    hostile = company.document.model_copy(
        update={
            "extensions": {
                MEDIATED_EXTENSION: ExtensionDescriptor.model_validate(
                    {
                        "version": "1",
                        "fields": [
                            {"name": "client_id", "label": "Client", "secret": False}
                        ],
                        "scopes": ["orders:read"],
                    }
                )
            }
        }
    )
    try:
        await mediated.sign_in(
            company=company.model_copy(update={"document": hostile}),
            client_id=atlas.client_id,
            scopes=("orders:read",),
            tenant_id=TENANT,
        )
        reserved_field_refused = "not refused"
    except AuthorizationError as error:
        reserved_field_refused = error.code
    asked_before_refusal = len(typed.asked)

    # The declared fields, collected by the host, sent once to the issuer's token endpoint.
    started = await mediated.sign_in(
        company=company,
        client_id=atlas.client_id,
        scopes=("orders:read", "orders:write"),
        tenant_id=TENANT,
    )
    if not (started.reference is not None):
        raise RuntimeError("the example world is incomplete")

    wrong = await mediated.submit_code(started.reference)
    done = await mediated.submit_code(started.reference)
    await http.aclose()

    return {
        "token_endpoint": company.oauth_metadata.token_endpoint,
        "reserved_field": reserved_field_refused,
        "user_asked_before_refusal": asked_before_refusal,
        "fields_asked_for": [field.label for field in typed.asked[0].fields],
        "secret_fields": [
            field.name for field in typed.asked[0].fields if field.secret
        ],
        "asked_on_behalf_of": typed.asked[0].company_domain,
        "first_answer": started.status,
        "code_sent_to": started.sent_to,
        "wrong_code": wrong.status,
        "same_reference_after_wrong_code": wrong.reference == started.reference,
        "final_status": done.status,
        "signed_in": done.token is not None,
        "granted_scopes": done.granted_scopes,
        "refresh_token_stored_by_reference": done.refresh_token_reference
        in host.vault.values,
        "protected_input_purposes": [request.purpose for request in typed.asked],
        "credentials_and_codes_withheld": True,
        "tokens_withheld": True,
    }

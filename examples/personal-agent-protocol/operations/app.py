# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Confirm a PAP operation exactly as the user approved it, at most once."""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import (
    ConversationClient,
    DeviceSignInClient,
    DiscoveryClient,
    DpopHttpClient,
    Message,
    SessionClient,
    generate_message_id,
)
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import manzanita
from personal_agent_protocol.models import ClientMetadata
from personal_agent_protocol.operations import (
    OperationError,
    OperationsClient,
    approve,
    operations_endpoint,
)

from agent_runtimes.loop.apps import Application

TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_manzanita_000000"

app = Application(
    id="pap-operations",
    name="PAP Operations",
    description="Exact approval of one revision, terms changes, standing permissions, and cancellation.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_operations. A chat message is never an approval. Never "
        "expose a Session Token, proof, or pairwise identifier."
    ),
)


@app.tool(does="read")
async def explain_operations() -> dict[str, Any]:
    """Run Operations v1 against the demo company and return only safe evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    shop, plugin = manzanita(network, clock)
    async with network.client() as http:
        reactor = personal_agent_reactor(
            PersonalAgentHost(atlas, clock), network=network, http_client=http
        )
        company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
            "manzanita.example"
        )
        metadata = company.oauth_metadata
        assert metadata is not None and metadata.device_authorization_endpoint
        assert company.document.agent is not None
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id=atlas.client_id,
            pairwise_user_id=PAIRWISE,
            issuer=metadata.issuer,
            token_endpoint=metadata.token_endpoint,
            tenant_id=TENANT,
        )
        device = DeviceSignInClient(reactor=reactor, http_client=http)
        started = await device.begin(
            device_authorization_endpoint=metadata.device_authorization_endpoint,
            token_endpoint=metadata.token_endpoint,
            issuer=metadata.issuer,
            client_id=atlas.client_id,
            scopes=("orders:read", "orders:write"),
            tenant_id=TENANT,
            pairwise_user_id=PAIRWISE,
            session_id=session.session_id,
        )
        shop.approve_device(started.user_code, account_id="acct_ada")
        clock.advance(started.poll_interval)
        token = (await device.poll(started.reference)).token
        assert token is not None
        who = {
            "tenant_id": TENANT,
            "pairwise_user_id": PAIRWISE,
            "issuer": metadata.issuer,
        }
        transport = DpopHttpClient(reactor=reactor, http_client=http)
        conversations = ConversationClient(transport=transport)
        endpoint = company.document.agent.protocols[0].endpoint

        async def propose() -> Any:
            page = await conversations.start(
                endpoint,
                Message(
                    id=generate_message_id(reactor),
                    sender="human",
                    text="Exchange my jacket for something warmer",
                ),
                token=token,
                wait=0,
                **who,
            )
            return page.events[-1].message.operation  # type: ignore[union-attr]

        negotiated = operations_endpoint(
            company.document, ClientMetadata.model_validate(atlas.metadata)
        )
        assert negotiated is not None
        operations = OperationsClient(transport=transport)
        first = await propose()

        # A standing permission never confirms what needs the user's own approval.
        try:
            await operations.confirm(
                negotiated,
                first,
                standing=("Manzanita Outfitters", PAIRWISE, "orders.exchange"),
                token=token,
                **who,
            )
            standing_refusal = None
        except OperationError as error:
            standing_refusal = error.code

        # Ada approved revision 1; the company added a return deadline before it was confirmed.
        approval_of_first = approve(first)
        shop.revise(
            first.operation_id,
            summary=f"{first.summary} Return the original by 2026-10-25.",
            terms={**first.terms, "return_by": "2026-10-25"},
        )
        changed = await operations.confirm(
            negotiated, first, approval=approval_of_first, token=token, **who
        )
        second = changed.operation
        assert second is not None
        try:
            await operations.confirm(
                negotiated, second, approval=approval_of_first, token=token, **who
            )
            stale_refusal = None
        except OperationError as error:
            stale_refusal = error.code

        # Shown the new revision, Ada approves it: confirmed, then a retry changes nothing.
        confirmed = await operations.confirm(
            negotiated, second, approval=approve(second), token=token, **who
        )
        retried = await operations.confirm(
            negotiated, second, approval=approve(second), token=token, **who
        )

        other = await propose()
        cancelled = await operations.cancel(
            negotiated, other.operation_id, token=token, **who
        )

    done = confirmed.operation
    assert (
        done is not None and done.confirmation is not None and done.result is not None
    )
    return {
        "company": company.document.organization.name,
        "operations_v1_negotiated": True,
        "proposed_revision": first.revision,
        "user_approval_required": first.user_approval_required,
        "standing_permission_refused_locally": standing_refusal,
        "terms_changed_status": changed.status,
        "changed_terms": changed.changed,
        "new_revision": second.revision,
        "stale_approval_refused_locally": stale_refusal,
        "confirmed_state": done.state,
        "confirmed_revision": done.confirmation.revision,
        "approved_by": done.confirmation.approved_by,
        "result_summary": done.result.summary,
        "retry_returned_the_same_record": retried.operation == done,
        "performed_once": plugin.executor.performed == [first.operation_id],
        "cancelled_state": cancelled.state,
        "cancelled_result": cancelled.result.summary if cancelled.result else None,
        "session_token_and_proofs_withheld": True,
    }

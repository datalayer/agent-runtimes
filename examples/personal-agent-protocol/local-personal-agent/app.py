# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A local runtime's personal agent: PapPersonalAgentCapability with the host's PAP reactor.

The capability opens a pairwise Session at Manzanita (the SDK's demo company),
talks in one conversation, signs Ada in with Device Sign-In on the company's
own page, and confirms the exchange Manzanita proposes only once Ada approved
that exact revision on the host's approval surface (``pap.approvalSurface``).
Every answer is a summary: no Session Token, proof, device code or pairwise id.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from personal_agent_protocol import (
    APPROVAL_SURFACES,
    PAIRWISE_USER_ID_STORES,
    ApprovalRequest,
    SqlitePairwiseUserIdStore,
)
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import manzanita
from reactor import PluginManifest

from agent_runtimes.loop.apps import Application
from agent_runtimes.pap import PapPersonalAgentCapability

DOMAIN = "manzanita.example"

app = Application(
    id="pap-local-personal-agent",
    name="PAP Local Personal Agent",
    description="A local runtime's personal agent at a PAP company: Session, Device Sign-In, conversation, an operation approved by the person.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use walk_through. A chat message is never an approval: the person "
        "approves an operation on the host's own surface."
    ),
)


class LocalHost:
    """What a local runtime contributes to its PAP reactor besides the demo identity."""

    def __init__(self, folder: Path) -> None:
        self.pairwise = SqlitePairwiseUserIdStore(folder / "pairwise.sqlite")
        self.asked: list[str] = []

    async def approve(self, request: ApprovalRequest) -> bool:
        # The host's own surface; here Ada says yes to what she was shown.
        self.asked.append(request.summary)
        return True

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            PAIRWISE_USER_ID_STORES, self.pairwise, contribution_id="local", order=50
        )
        contributions.contribute(
            APPROVAL_SURFACES, self, contribution_id="person", order=50
        )


@app.tool(does="read")
async def walk_through() -> dict[str, Any]:
    """Run the personal agent's journey at Manzanita and return what the agent was told."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    shop, plugin = manzanita(network, clock)
    with tempfile.TemporaryDirectory() as folder:
        host = LocalHost(Path(folder))
        async with network.client() as http:
            reactor = personal_agent_reactor(
                PersonalAgentHost(atlas, clock),
                network=network,
                http_client=http,
                plugins=[(PluginManifest(name="local-host", version="1"), host)],
            )
            pap = PapPersonalAgentCapability(
                reactor=reactor,
                http_client=http,
                client_id=atlas.client_id,
                tenant_id="local",
            )
            first = await pap.ask(DOMAIN, "Where is my jacket order?", user_id="ada")
            sign_in = await pap.sign_in(DOMAIN, user_id="ada")
            # Ada signs in on Manzanita's own page with the code she was shown.
            assert sign_in.code is not None
            await shop.approve_device(sign_in.code, account_id="acct_ada")
            clock.advance(10)
            status = await pap.sign_in_status(DOMAIN, user_id="ada")
            order = await pap.ask(DOMAIN, "Where is my jacket order?", user_id="ada")
            exchange = await pap.ask(
                DOMAIN, "Exchange it for a warmer one", user_id="ada"
            )
            proposed = exchange.operations[0]
            confirmed = await pap.confirm(
                DOMAIN, proposed.operation_ref, proposed.revision, user_id="ada"
            )
    return {
        "signed_out": first.model_dump(),
        "sign_in": {
            "status": sign_in.status,
            "open_on_the_company_page": bool(sign_in.open),
        },
        "signed_in": status.model_dump(),
        "order": order.replies,
        "proposed": proposed.model_dump(),
        "person_was_asked": host.asked,
        "confirmed": confirmed.status,
        "result": confirmed.result,
        "performed_once": len(plugin.executor.performed) == 1,
    }

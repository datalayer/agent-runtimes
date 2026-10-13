# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Protocol Catalog.

The agent protocols Datalayer targets (AGENT_PROTOCOLS PS-01).

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List, Optional

from agent_runtimes.types import ProtocolPackagesSpec, ProtocolSpec

A2A_PROTOCOL_0_0_1 = ProtocolSpec(
    id="a2a",
    version="0.0.1",
    name="Agent2Agent",
    description="How agents talk to agents: teams and scenes talk over it, an application's route serves it, and its Agent Card advertises its extensions.",
    publisher="Google, now the Linux Foundation",
    layer="transport",
    spec_url="https://a2a-protocol.org",
    spec_version="1.0",
    status="shipped",
    connects="Other agents, each at its address with its Agent Card",
    packages=ProtocolPackagesSpec(
        python=["fasta2a", "a2a-sdk"],
        typescript=["@a2a-js/sdk"],
    ),
    protocol_tools=[],
    appspec_block="a2a",
)

A2UI_PROTOCOL_0_0_1 = ProtocolSpec(
    id="a2ui",
    version="0.0.1",
    name="A2UI",
    description="How an agent's answer becomes an interface: components the host renders from a declarative surface.",
    publisher="Google",
    layer="ui",
    spec_url="https://a2ui.org",
    spec_version="0.9",
    status="shipped",
    connects="The person, through components an answer draws",
    packages=ProtocolPackagesSpec(
        python=["agent-runtimes"],
        typescript=["@a2ui/react", "@a2ui/web_core"],
    ),
    protocol_tools=[],
    appspec_block=None,
)

ACP_PROTOCOL_0_0_1 = ProtocolSpec(
    id="acp",
    version="0.0.1",
    name="Agentic Commerce Protocol",
    description="Checkout sessions at a seller, completed with a payment the model never sees. In applications at test merchants only, with no real payment token (decided 2026-10-13): each purchase asked of the person first, made at most once.",
    publisher="OpenAI, Stripe",
    layer="commerce",
    spec_url="https://github.com/agentic-commerce-protocol/agentic-commerce-protocol",
    spec_version="2026-04-17",
    status="shipped",
    connects="Sellers, to check out with a delegated payment",
    packages=ProtocolPackagesSpec(
        python=["agent-runtimes"],
        typescript=["@datalayer/agent-runtimes"],
    ),
    protocol_tools=["agentic-commerce"],
    appspec_block=None,
)

AG_UI_PROTOCOL_0_0_1 = ProtocolSpec(
    id="ag-ui",
    version="0.0.1",
    name="AG-UI",
    description="How an agent streams its run to a page: messages, tool calls and state as events.",
    publisher="CopilotKit",
    layer="ui",
    spec_url="https://docs.ag-ui.com",
    spec_version="0.0.57 (@ag-ui/core)",
    status="shipped",
    connects="The page a person talks to the agent on",
    packages=ProtocolPackagesSpec(
        python=["ag-ui-protocol"],
        typescript=["@ag-ui/client", "@ag-ui/core"],
    ),
    protocol_tools=[],
    appspec_block=None,
)

MCP_PROTOCOL_0_0_1 = ProtocolSpec(
    id="mcp",
    version="0.0.1",
    name="Model Context Protocol",
    description="How an agent calls tools and reads resources: clients and servers in both languages, and the MCP gateway every connection goes through.",
    publisher="Anthropic",
    layer="transport",
    spec_url="https://modelcontextprotocol.io/specification",
    spec_version="2026-07-28 (Python), 2025-11-25 (TypeScript)",
    status="shipped",
    connects="Tools, resources and prompts served by MCP servers",
    packages=ProtocolPackagesSpec(
        python=["mcp"],
        typescript=["@modelcontextprotocol/sdk", "@mcp-ui/client"],
    ),
    protocol_tools=[],
    appspec_block=None,
)

PACT_PROTOCOL_0_0_1 = ProtocolSpec(
    id="pact",
    version="0.0.1",
    name="Personal Agent Consent & Trust",
    description="A personal agent asking a business's agent over A2A, first as itself, then for a person who delegated some of their permissions.",
    publisher="Decagon, Instinct",
    layer="consent",
    spec_url="https://openpactprotocol.org",
    spec_version="1.0",
    status="shipped",
    connects="Businesses' agents, asked for a person with their delegation",
    packages=ProtocolPackagesSpec(
        python=["agent-runtimes"],
        typescript=["@datalayer/agent-runtimes"],
    ),
    protocol_tools=["pact"],
    appspec_block="pact",
)

PAP_PROTOCOL_0_0_1 = ProtocolSpec(
    id="pap",
    version="0.0.1",
    name="Personal Agent Protocol",
    description="A person's agent working with a company for them — signed out, then signed in at the company, its changes confirmed by the person — and an application being a company personal agents reach.",
    publisher="Sierra, Meta",
    layer="consent",
    spec_url="https://poppy.md",
    spec_version="draft 0.1",
    status="shipped",
    connects="Companies, as a person's agent there, or being one",
    packages=ProtocolPackagesSpec(
        python=["personal-agent-protocol"],
        typescript=["@datalayer/personal-agent-protocol"],
    ),
    protocol_tools=["pap"],
    appspec_block="pap",
)

TAP_PROTOCOL_0_0_1 = ProtocolSpec(
    id="tap",
    version="0.0.1",
    name="Trusted Agent Protocol",
    description="An agent-recognition profile over Web Bot Auth for merchants. Planned: nothing is built until its profile is confirmed.",
    publisher="Visa",
    layer="identity",
    spec_url="https://developer.visa.com",
    spec_version="none yet",
    status="planned",
    connects="Merchants that recognise an agent by its signature",
    packages=ProtocolPackagesSpec(
        python=[],
        typescript=[],
    ),
    protocol_tools=[],
    appspec_block=None,
)

UCP_PROTOCOL_0_0_1 = ProtocolSpec(
    id="ucp",
    version="0.0.1",
    name="Universal Commerce Protocol",
    description="Shopping at a merchant: catalogue, checkout and orders, every purchase an exact proposal the person approves. In applications at test merchants only, with no real payment (decided 2026-10-13): each purchase asked of the person first, made at most once.",
    publisher="Google, with Shopify and retailers",
    layer="commerce",
    spec_url="https://github.com/Universal-Commerce-Protocol/ucp",
    spec_version="2026-08-25",
    status="shipped",
    connects="Merchants, to search, check out and follow orders",
    packages=ProtocolPackagesSpec(
        python=["ucp-sdk", "agent-runtimes"],
        typescript=["@ucp-js/sdk", "@datalayer/agent-runtimes"],
    ),
    protocol_tools=["ucp"],
    appspec_block=None,
)

WEB_BOT_AUTH_PROTOCOL_0_0_1 = ProtocolSpec(
    id="web-bot-auth",
    version="0.0.1",
    name="Web Bot Auth",
    description="Signed outbound requests (RFC 9421) and the key directory a website checks them against.",
    publisher="Cloudflare (IETF draft)",
    layer="identity",
    spec_url="https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/",
    spec_version="draft-ietf-webbotauth-httpsig-protocol-00",
    status="shipped",
    connects="Websites, which can tell the application's requests from someone pretending",
    packages=ProtocolPackagesSpec(
        python=["agent-runtimes"],
        typescript=["@datalayer/agent-runtimes", "web-bot-auth"],
    ),
    protocol_tools=[],
    appspec_block=None,
)


PROTOCOL_CATALOGUE: Dict[str, ProtocolSpec] = {
    "a2a": A2A_PROTOCOL_0_0_1,
    "a2ui": A2UI_PROTOCOL_0_0_1,
    "acp": ACP_PROTOCOL_0_0_1,
    "ag-ui": AG_UI_PROTOCOL_0_0_1,
    "mcp": MCP_PROTOCOL_0_0_1,
    "pact": PACT_PROTOCOL_0_0_1,
    "pap": PAP_PROTOCOL_0_0_1,
    "tap": TAP_PROTOCOL_0_0_1,
    "ucp": UCP_PROTOCOL_0_0_1,
    "web-bot-auth": WEB_BOT_AUTH_PROTOCOL_0_0_1,
}


def get_protocol(protocol_id: str) -> Optional[ProtocolSpec]:
    """A protocol by id, or None."""
    return PROTOCOL_CATALOGUE.get(protocol_id)


def list_protocols() -> List[ProtocolSpec]:
    """Every protocol of the catalogue."""
    return list(PROTOCOL_CATALOGUE.values())

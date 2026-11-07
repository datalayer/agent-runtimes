# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The sign-in card as a display: the page gets the link and the code, the model never does."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from ag_ui.core import RunAgentInput, ToolCallResultEvent, UserMessage
from fastmcp.client.transports import FastMCPTransport
from mcp.server.mcpserver import MCPServer
from mcp.types import CallToolResult, TextContent
from personal_agent_protocol import DeviceSignInClient, DiscoveryClient
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import manzanita
from personal_agent_protocol.ui import WAITING_FOR_THE_PERSON, PapSignIn
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelRequest, ToolReturnPart
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaToolCall,
    DeltaToolCalls,
    FunctionModel,
)
from reactor.ui import DISPLAY_META_KEY

from agent_runtimes.apps import Application
from agent_runtimes.mcp.displays import DisplayMCPToolset
from agent_runtimes.transports.agui_displays import DisplayAGUIAdapter

TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_manzanita_000000"

app = Application(
    id="pap-sign-in-display",
    name="PAP Sign-In Display",
    description=(
        "A sign-in tool answers with a PapSignIn display: the model reads its "
        "model view, the page draws the card with the link and the code."
    ),
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_sign_in_display. Never repeat a sign-in link or code: the "
        "page shows them to the person."
    ),
)


async def _device_sign_in() -> dict[str, Any]:
    """Start a real device sign-in at the demo company, answered as the gateway's `pap_sign_in` answers."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    manzanita(network, clock)
    async with network.client() as http:
        reactor = personal_agent_reactor(
            PersonalAgentHost(atlas, clock), network=network, http_client=http
        )
        company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
            "manzanita.example"
        )
        metadata = company.oauth_metadata
        assert metadata is not None and metadata.device_authorization_endpoint
        started = await DeviceSignInClient(reactor=reactor, http_client=http).begin(
            device_authorization_endpoint=metadata.device_authorization_endpoint,
            token_endpoint=metadata.token_endpoint,
            issuer=metadata.issuer,
            client_id=atlas.client_id,
            scopes=("orders:read",),
            tenant_id=TENANT,
            organization=company.document.organization,
            protected_resources=metadata.protected_resources,
        )
    return {
        "status": WAITING_FOR_THE_PERSON,
        "mode": "device",
        "open": started.verification_uri_complete or started.verification_uri,
        "code": started.user_code,
        "expires_at": started.expires_at.isoformat(),
        # The company that asks for the code, by name and domain (§4.6).
        "organization_name": started.organization_name,
        "organization_domain": started.organization_domain,
    }


def _gateway(answer: dict[str, Any]) -> MCPServer:
    """An MCP server whose `pap_sign_in` answers as Datalayer's gateway does.

    The result's content is the display's text and what the model may read;
    the whole `PapSignIn` rides in `_meta["reactor.ui/display"]`.
    """

    display = PapSignIn.from_answer(answer)
    assert display is not None
    said = {
        "status": answer["status"],
        "mode": display.mode,
        "host": display.host,
        "expires_at": answer["expires_at"],
    }
    server = MCPServer("gateway")

    @server.tool(name="pap_sign_in")
    def pap_sign_in() -> CallToolResult:
        """Start a sign-in: the display's text for the model, the display for the page."""
        return CallToolResult(
            content=[TextContent(type="text", text=display.text())],
            structured_content=said,
            _meta=display.tool_meta(),
        )

    return server


def _scripted_model(seen: list[list[ModelMessage]]) -> FunctionModel:
    """A model that calls `pap_sign_in` once and then answers: what it reads is kept."""

    async def answer(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        """Call the tool on the first turn; answer on the next."""
        seen.append(list(messages))
        if len(messages) == 1:
            yield {
                0: DeltaToolCall(
                    name="pap_sign_in", json_args="{}", tool_call_id="call-1"
                )
            }
        else:
            yield "Sign in at Manzanita with the card shown here."

    return FunctionModel(stream_function=answer)


@app.tool(does="read")
async def explain_sign_in_display() -> dict[str, Any]:
    """Run one sign-in through the runtime's MCP toolset and AG-UI stream; return only safe evidence."""

    answer = await _device_sign_in()
    link, code = answer["open"], answer["code"]
    seen: list[list[ModelMessage]] = []
    agent = Agent(
        _scripted_model(seen),
        toolsets=[DisplayMCPToolset(FastMCPTransport(_gateway(answer)))],
    )
    adapter = DisplayAGUIAdapter(
        agent=agent,
        run_input=RunAgentInput(
            thread_id="thread-1",
            run_id="run-1",
            state=None,
            messages=[UserMessage(id="u1", content="Sign me in at Manzanita")],
            tools=[],
            context=[],
            forwarded_props=None,
        ),
    )
    (sent,) = [
        event
        async for event in adapter.run_stream()
        if isinstance(event, ToolCallResultEvent)
    ]
    page = json.loads(sent.content)
    display = page["_meta"][DISPLAY_META_KEY]
    (returned,) = [
        part
        for message in seen[-1]
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, ToolReturnPart)
    ]
    model_read = returned.model_response_str()
    return {
        "display_type": display["type"],
        "display_version": display["version"],
        "model_view_type": page["type"],
        "model_view_text": page["text"],
        "model_view_fields": sorted(page["data"]),
        "model_reads_the_link": link in model_read,
        "model_reads_the_code": code in model_read,
        "page_display_fields": sorted(display["data"]),
        "page_gets_the_link": display["data"]["open"] == link,
        "page_gets_the_code": display["data"]["code"] == code,
        "link_and_code_withheld_here": True,
    }

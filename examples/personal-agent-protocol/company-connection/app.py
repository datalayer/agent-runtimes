# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A company the application works with as a personal agent: one gateway server, given what its level gives."""

from __future__ import annotations

from typing import Any

from agentspecs.apps import parse_app

from agent_runtimes.apps import Application
from agent_runtimes.apps.enforcement import AppRulesCapability
from agent_runtimes.apps.pap_connections import (
    TOOL_CLASSES,
    connection_actions,
    gateway_query,
    remember,
    server_id,
)

app = Application(
    "pap-company-connection",
    "chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}, {"plugin": "pap-sign-in"}],
    agent="example-blank:0.0.1",
    name="PAP Company Connection",
    description=(
        "A company reached as a personal agent through Datalayer's gateway: "
        "its tools prefixed with its domain, given only what the connection's "
        "level gives, its sign-in asking only the scopes the connection names."
    ),
    instructions=(
        "Use explain_company_connection. Never ask the person for a password "
        "or a code in the conversation: a sign-in happens at the company."
    ),
)

# One company, reached through Datalayer's gateway, read only, in each
# person's own account (`pap.connections`, its typed builder:
# a URL, a credential or an unknown field is refused here).
app.company_connection(
    "orders",
    "manzanita.example",
    access="read",
    acts_as="user",
    # The fewest scopes the application needs. The gateway's sign-in asks only
    # these, of what the company offers, and never a `:write` one on a `read`
    # connection.
    scopes=["orders:read"],
    interfaces=["agent", "mcp"],
    sign_in=["device", "direct"],
)


@app.tool(does="read")
async def explain_company_connection() -> dict[str, Any]:
    """Show how the runtime reaches the company and which of its tools the model is given."""

    [connection] = parse_app(app.document).pap.connections
    spec = app.spec
    [sid] = remember(spec)
    rules = AppRulesCapability(app=spec)
    given = {tool: rules.given(f"{sid}_{tool}") for tool in sorted(TOOL_CLASSES)}
    return {
        "company": connection.company,
        "server_id": sid,
        "server_id_is_the_domain": sid == server_id(connection.company),
        "gateway_query": gateway_query(sid),
        "acts_as": connection.acts_as.value,
        "access": connection.access.value,
        "level_granted": sorted(connection_actions(spec, f"{sid}_pap_read") or ()),
        "scopes_named": connection.scopes,
        "sign_in_modes": [mode.value for mode in connection.sign_in],
        "interfaces": [interface.value for interface in connection.interfaces],
        "tools_given": sorted(tool for tool, ok in given.items() if ok),
        "tools_withheld": sorted(tool for tool, ok in given.items() if not ok),
        "credentials_held_here": False,
    }

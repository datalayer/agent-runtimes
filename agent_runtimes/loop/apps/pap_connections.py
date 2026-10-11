# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""The companies an application works with as a personal agent (PAP_DATALAYER ADR-1, B-02, B-03).

Each `pap.connections[]` of an Appspec is reached through Datalayer's MCP
gateway, whose `pap` toolset acts for the person at that company
(``/mcp?only=pap&pap-company=<domain>``): it holds nothing here — no key, no
token of the company's — and is reached in the person's name, with the token
of who talks to the application, as a connection `as: user` is.

In the runtime a company is one gateway server, named from its domain
(:func:`server_id`): two companies' tools never share a name, as each tool is
prefixed with it. What each tool does to the world is the gateway's own table
(:data:`TOOL_CLASSES`, the same as `extensions/pap/pap.py` there), so that
the application's Rules decide them as any other tool: reading reads, a
confirmation does what an operation can do.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple
from urllib.parse import quote

#: What each tool of the gateway's `pap` toolset can do (its `TOOL_CLASSES`).
TOOL_CLASSES: Dict[str, Tuple[str, ...]] = {
    "pap_company": ("read",),
    "pap_ask": ("read",),
    "pap_sign_in": ("read",),
    "pap_sign_in_status": ("read",),
    "pap_read": ("read",),
    "pap_mcp_tools": ("read",),
    "pap_mcp_call": ("write",),
    "pap_confirm": ("write", "buy"),
    "pap_disconnect": ("write",),
}

#: server id -> company domain, for every application this process runs.
_DOMAINS: Dict[str, str] = {}

_PREFIX = "pap_"


def server_id(domain: str) -> str:
    """A company's server in the runtime: `pap_` and its domain in plain characters."""
    return _PREFIX + re.sub(r"[^a-z0-9]+", "_", domain.lower()).strip("_")


def connections_of(app: Any) -> Dict[str, Dict[str, Any]]:
    """An application's companies, by server id."""
    pap = getattr(app, "pap", None)
    found: Dict[str, Dict[str, Any]] = {}
    for connection in getattr(pap, "connections", None) or []:
        company = str((connection or {}).get("company") or "").strip().lower()
        if company:
            found[server_id(company)] = {**connection, "company": company}
    return found


def remember(app: Any) -> list[str]:
    """Know an application's companies as gateway servers; answer their ids."""
    found = connections_of(app)
    for sid, connection in found.items():
        _DOMAINS[sid] = connection["company"]
    return list(found)


def domain_of(sid: str) -> Optional[str]:
    return _DOMAINS.get(sid)


def gateway_query(sid: str) -> Optional[str]:
    """How a company's server reaches the gateway, or None for any other server."""
    domain = _DOMAINS.get(sid)
    if domain is None:
        return None
    return f"only=pap&pap-company={quote(domain, safe='')}"


def tool_prefix(sid: str) -> str:
    """What a company's tools are named with: two companies' tools never collide."""
    return sid


def pap_tool(tool_name: str) -> Optional[Tuple[str, str]]:
    """`(server id, tool)` for a company's tool as the model calls it, or None."""
    for sid in sorted(_DOMAINS, key=len, reverse=True):
        for separator in ("_", "__"):
            head = f"{sid}{separator}"
            if tool_name.startswith(head) and tool_name[len(head) :] in TOOL_CLASSES:
                return sid, tool_name[len(head) :]
    return None


def classes_of(tool_name: str) -> Optional[Tuple[str, ...]]:
    """What a company's tool does, or None for a tool of no company."""
    found = pap_tool(tool_name)
    return TOOL_CLASSES[found[1]] if found else None


def connection_actions(app: Any, tool_name: str) -> Optional[set[str]]:
    """The level the application's connection to that company grants, or None."""
    found = pap_tool(tool_name)
    if found is None:
        return None
    connection = connections_of(app).get(found[0])
    if connection is None:
        return None
    access = str(connection.get("access") or "read")
    return {"read", "write"} if access == "write" else {"read"}


def acts_as(connection: Dict[str, Any]) -> str:
    return str(connection.get("as") or connection.get("acts_as") or "user")


#: agent id -> its application's companies: (server id, in whose name).
_AGENTS: Dict[str, Tuple[Tuple[str, str], ...]] = {}


def remember_agent(agent_id: str, app: Any) -> None:
    """Keep which companies an agent's application works with; none forgets."""
    found = connections_of(app) if app is not None else {}
    for sid, connection in found.items():
        _DOMAINS[sid] = connection["company"]
    if found:
        _AGENTS[agent_id] = tuple((sid, acts_as(c)) for sid, c in sorted(found.items()))
    else:
        _AGENTS.pop(agent_id, None)


def companies_of_agent(agent_id: Optional[str]) -> Tuple[Tuple[str, str], ...]:
    """An agent's companies, as `(server id, in whose name)`."""
    return _AGENTS.get(agent_id or "", ())


def forget() -> None:
    """Forget every company: a test."""
    _DOMAINS.clear()
    _AGENTS.clear()

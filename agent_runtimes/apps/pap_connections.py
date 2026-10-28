# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""The companies an application works with as a personal agent (ADR-1, B-02, B-03).

Each `pap.connections[]` of an Appspec is reached through Datalayer's MCP
gateway, whose `pap` toolset acts for the person at that company
(``/mcp?only=pap&pap-company=<domain>``): it holds nothing here — no key, no
token of the company's — and is reached in the person's name, with the token
of who talks to the application, as a connection `as: user` is.

A business over PACT (each `pact.connections[]`, PI-20) is
reached the same way, through the gateway's `pact` toolset
(``/mcp?only=pact&pact-brand=<domain>``), in the person's name: the gateway
signs the application's personal-agent JWT and holds the person's delegation.

A merchant over UCP or ACP (each `commerce.merchants[]`, PI-20) is reached through the gateway's `ucp` or `acp` toolset
(``/mcp?only=ucp&ucp-merchant=<domain>``), in the person's name: the
gateway shops at test merchants only and asks the person before every
purchase (decided 2026-10-13).

A site it reads pages of (each `signed_fetch.sites[]`, EX-11, decided 2026-10-13) is reached through the gateway's `signed-fetch`
toolset (``/mcp?only=signed-fetch&signed-fetch-site=<domain>``): GET only at
that exact site, every request signed with the application's own Web Bot
Auth key, its one tool a read under the Rules.

In the runtime a company is one gateway server, named from its protocol and
domain (:func:`server_id`): two companies' tools never share a name, as each
tool is prefixed with it. What each tool does to the world is agentspecs'
table of the toolset (:data:`TOOL_CLASSES_BY_PROTOCOL`, which the gateway
reads too), so that the application's Rules decide them as any other tool:
reading reads, a confirmation does what an operation can do.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple
from urllib.parse import quote

from agent_runtimes.specs.actions import PROTOCOL_TOOL_CLASSES

#: What each tool of the gateway's `pap` toolset can do: agentspecs'
#: ``protocol-tools/pap.yaml`` (PR-54), as the gateway reads it.
TOOL_CLASSES_BY_PROTOCOL: Dict[str, Dict[str, Tuple[str, ...]]] = {
    protocol: {
        name: tuple(classes)
        for name, classes in PROTOCOL_TOOL_CLASSES[protocol]["tools"].items()
    }
    for protocol in ("pap", "pact")
}
# A merchant's tools, by its protocol (`ucp`, `acp`): agentspecs' tables name the toolsets' tools.
TOOL_CLASSES_BY_PROTOCOL.update(
    {
        protocol: {
            name: tuple(classes)
            for name, classes in PROTOCOL_TOOL_CLASSES[table]["tools"].items()
        }
        for protocol, table in (
            ("ucp", "ucp"),
            ("acp", "agentic-commerce"),
            ("signed-fetch", "signed-fetch"),
        )
    }
)
TOOL_CLASSES: Dict[str, Tuple[str, ...]] = TOOL_CLASSES_BY_PROTOCOL["pap"]

#: Each protocol's block, the key of its counterpart's domain there, and the
#: gateway's URL parameter naming it.
_BLOCKS: Dict[str, Tuple[str, str]] = {
    "pap": ("company", "pap-company"),
    "pact": ("brand", "pact-brand"),
    "ucp": ("merchant", "ucp-merchant"),
    "acp": ("merchant", "acp-merchant"),
    "signed-fetch": ("site", "signed-fetch-site"),
}

#: A merchant's tool that buys: the gateway asks the person before it, always (decided 2026-10-13).
PURCHASE_TOOLS = frozenset({"ucp_complete", "acp_complete"})

#: server id -> (protocol, company domain), for every application this process runs.
_DOMAINS: Dict[str, Tuple[str, str]] = {}


def server_id(domain: str, protocol: str = "pap") -> str:
    """A company's server in the runtime: its protocol and its domain in plain characters."""
    if protocol not in _BLOCKS:
        raise ValueError(f"no gateway toolset for the protocol {protocol!r}")
    return re.sub(r"[^a-z0-9]+", "_", f"{protocol}_{domain.lower()}").strip("_")


def connections_of(app: Any) -> Dict[str, Dict[str, Any]]:
    """An application's companies (PAP), businesses (PACT), merchants (UCP, ACP) and the sites
    it reads signed (`signed-fetch`), by server id.

    Each carries `protocol` and `company` (its domain), whichever block it is from.
    """
    found: Dict[str, Dict[str, Any]] = {}
    commerce = getattr(getattr(app, "commerce", None), "merchants", None) or []
    for protocol, (key, _) in _BLOCKS.items():
        if protocol in ("ucp", "acp"):
            listed = [m for m in commerce if (m or {}).get("protocol") == protocol]
        elif protocol == "signed-fetch":
            listed = getattr(getattr(app, "signed_fetch", None), "sites", None) or []
        else:
            listed = getattr(getattr(app, protocol, None), "connections", None) or []
        for connection in listed:
            domain = str((connection or {}).get(key) or "").strip().lower()
            if domain:
                found[server_id(domain, protocol)] = {
                    **connection,
                    "company": domain,
                    "protocol": protocol,
                }
    return found


def remember(app: Any) -> list[str]:
    """Know an application's companies as gateway servers; answer their ids."""
    found = connections_of(app)
    for sid, connection in found.items():
        _DOMAINS[sid] = (connection["protocol"], connection["company"])
    return list(found)


def domain_of(sid: str) -> Optional[str]:
    known = _DOMAINS.get(sid)
    return known[1] if known else None


def protocol_of(sid: str) -> Optional[str]:
    """`pap`, `pact`, `ucp`, `acp` or `signed-fetch` for a company's server, None for any other."""
    known = _DOMAINS.get(sid)
    return known[0] if known else None


def gateway_query(sid: str) -> Optional[str]:
    """How a company's server reaches the gateway, or None for any other server."""
    known = _DOMAINS.get(sid)
    if known is None:
        return None
    protocol, domain = known
    return f"only={protocol}&{_BLOCKS[protocol][1]}={quote(domain, safe='')}"


def tool_prefix(sid: str) -> str:
    """What a company's tools are named with: two companies' tools never collide."""
    return sid


def pap_tool(tool_name: str) -> Optional[Tuple[str, str]]:
    """`(server id, tool)` for a company's tool as the model calls it, or None."""
    for sid in sorted(_DOMAINS, key=len, reverse=True):
        tools = TOOL_CLASSES_BY_PROTOCOL[_DOMAINS[sid][0]]
        for separator in ("_", "__"):
            head = f"{sid}{separator}"
            if tool_name.startswith(head) and tool_name[len(head) :] in tools:
                return sid, tool_name[len(head) :]
    return None


def classes_of(tool_name: str) -> Optional[Tuple[str, ...]]:
    """What a company's tool does, or None for a tool of no company."""
    found = pap_tool(tool_name)
    if found is None:
        return None
    return TOOL_CLASSES_BY_PROTOCOL[_DOMAINS[found[0]][0]][found[1]]


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


def is_purchase(tool_name: str) -> bool:
    """Whether a tool buys at a merchant: always asked of the person, at the gateway."""
    found = pap_tool(tool_name)
    return found is not None and found[1] in PURCHASE_TOOLS


def acts_as(connection: Dict[str, Any]) -> str:
    return str(connection.get("as") or connection.get("acts_as") or "user")


#: agent id -> its application's companies: (server id, in whose name).
_AGENTS: Dict[str, Tuple[Tuple[str, str], ...]] = {}


def remember_agent(agent_id: str, app: Any) -> None:
    """Keep which companies an agent's application works with; none forgets."""
    found = connections_of(app) if app is not None else {}
    for sid, connection in found.items():
        _DOMAINS[sid] = (connection["protocol"], connection["company"])
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

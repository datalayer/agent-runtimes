# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Every agent's ``poppy.json``, built with the Personal Agent Protocol SDK.

Served at ``/.well-known/poppy.json`` on the agent's agent and web hosts, so
that two agents of any kind find and reach each other the same way:

- **a company** — its application's ``pap.company`` enabled — publishes the
  SDK's company document (``CompanyService.discovery_document``): its sign-in,
  its scopes, its operations (derived from ``openapi``), its conversations on
  its agent host; its ``apis`` are its API's ``openapi.json`` and its MCP
  server, at their own hosts;
- **a person's own agent**, or **an application** that is no company, publishes
  a document naming its agent (A2A on its agent host), its API and its MCP
  server, and, under the ``datalayer.ai/agent`` extension, what it is: whom it
  acts for, what it accepts from other agents, and how a caller signs in.

Each document is checked by the SDK (``DiscoveryDocument``) before it is served.
"""

from __future__ import annotations

from typing import Any, Dict

import httpx
from personal_agent_protocol.company import build_company
from personal_agent_protocol.models import DiscoveryDocument

from agent_runtimes.addresses.addressed import AddressedAgent
from agent_runtimes.pap.company import company_config
from agent_runtimes.protocols.pap import pap_protocol_version

#: The extension saying what a Datalayer agent is (its role, whom it acts for).
AGENT_EXTENSION = "datalayer.ai/agent"
AGENT_EXTENSION_VERSION = "1"


_CLIENTS: list[httpx.AsyncClient] = []


def _client() -> httpx.AsyncClient:
    """The one client the SDK's company is built with here: its document fetches nothing."""
    if not _CLIENTS:
        _CLIENTS.append(httpx.AsyncClient())
    return _CLIENTS[0]


def _apis(addressed: AddressedAgent) -> list[Dict[str, str]]:
    hosts = addressed.hosts
    assert hosts is not None
    name = addressed.app.name
    return [
        {
            "type": "openapi",
            "url": f"{hosts.api}/openapi.json",
            "description": f"{name}'s operations as a REST API",
        },
        {
            "type": "mcp",
            "url": hosts.mcp,
            "description": f"{name}'s operations as MCP tools",
        },
    ]


def company_document(addressed: AddressedAgent) -> Dict[str, Any]:
    """The ``poppy.json`` of an agent that is a company: the SDK's company document on its
    agent host, its APIs at their own hosts."""
    hosts = addressed.hosts
    if hosts is None:
        raise ValueError(
            "A company's poppy.json names its addresses: it has none here."
        )
    company = addressed.app.pap.company
    interfaces = {str(getattr(i, "value", i)) for i in company.interfaces}
    config = company_config(
        addressed.app.name,
        hosts.host("agent"),
        company,
        web="web" in interfaces,
    )
    service = build_company(config, http_client=_client())
    document = service.discovery_document()
    document["apis"] = _apis(addressed)
    return document


def agent_document(addressed: AddressedAgent) -> Dict[str, Any]:
    """The ``poppy.json`` of a person's own agent, or of an application that is no company."""
    hosts = addressed.hosts
    if hosts is None:
        raise ValueError("An agent's poppy.json names its addresses: it has none here.")
    entry: Dict[str, Any] = {
        "version": AGENT_EXTENSION_VERSION,
        "role": addressed.role,
        "accepts": ["a2a", "mcp", "openapi"],
        # Who may call it (its "Who may open it"): anyone, or the people its owner allowed,
        # with a Datalayer API key or token.
        "access": addressed.access.policy.visibility,
        "sign_in": ["datalayer_api_key", "datalayer_token"],
        "web": hosts.web,
    }
    if addressed.role == "personal":
        entry["acts_for"] = addressed.acts_for
    return {
        "protocol_version": pap_protocol_version(),
        "organization": {"name": addressed.app.name, "domain": hosts.host("agent")},
        "agent": {"protocols": [{"type": "a2a", "endpoint": f"{hosts.agent}/a2a"}]},
        "apis": _apis(addressed),
        "extensions": {AGENT_EXTENSION: [entry]},
    }


def poppy_document(addressed: AddressedAgent) -> Dict[str, Any]:
    """The agent's ``poppy.json``, checked by the SDK."""
    document = (
        company_document(addressed)
        if addressed.role == "company"
        else agent_document(addressed)
    )
    DiscoveryDocument.model_validate(document)
    return document


__all__ = [
    "AGENT_EXTENSION",
    "agent_document",
    "company_document",
    "poppy_document",
]

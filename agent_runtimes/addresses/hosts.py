# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's four addresses and the ports that answer them.

Every agent — a company's application, a published one, a person's own — is
reached at four hosts under one name (``{name}`` a DNS label):

- ``https://{name}.agent.<domain>`` — the runtime's main server (8765): A2A,
  its Agent Card, ``poppy.json``, PAP sign-in and sessions, the chat at ``/``;
- ``https://{name}.mcp.<domain>/mcp`` — its MCP server (8766);
- ``https://{name}.api.<domain>`` — its REST API and ``/openapi.json`` (8767);
- ``https://{name}.web.<domain>`` — its page and ``poppy.json`` (8768).

``<domain>`` is ``DATALAYER_COMPANY_HOSTS_DOMAIN`` (``datalayer.ai``).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass

#: The ports of the three servers beside the main one (8765), in one process.
MCP_PORT = 8766
API_PORT = 8767
WEB_PORT = 8768

#: Where the domain of the four hosts is configured.
DOMAIN_VARIABLE = "DATALAYER_COMPANY_HOSTS_DOMAIN"
DEFAULT_DOMAIN = "datalayer.ai"

#: A name: one DNS label.
NAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


def hosts_domain() -> str:
    """The domain the four hosts are under."""
    return (
        (os.environ.get(DOMAIN_VARIABLE) or DEFAULT_DOMAIN).strip().strip(".").lower()
    )


@dataclass(frozen=True)
class AddressHosts:
    """The four hosts of one name."""

    name: str
    domain: str

    @classmethod
    def of(cls, name: str, domain: str | None = None) -> "AddressHosts":
        """The hosts of ``name`` under ``domain`` (the configured one when unsaid)."""
        if not NAME.fullmatch(str(name or "")):
            raise ValueError(
                f"“{name}” is not an address: lower-case letters, digits and hyphens, at most 63."
            )
        return cls(name=name, domain=(domain or hosts_domain()).strip(".").lower())

    def host(self, kind: str) -> str:
        """``{name}.{kind}.{domain}``, ``kind`` one of agent, mcp, api, web."""
        if kind not in ("agent", "mcp", "api", "web"):
            raise ValueError(f"{kind!r} is not one of the four addresses")
        return f"{self.name}.{kind}.{self.domain}"

    @property
    def agent(self) -> str:
        return f"https://{self.host('agent')}"

    @property
    def mcp(self) -> str:
        return f"https://{self.host('mcp')}/mcp"

    @property
    def api(self) -> str:
        return f"https://{self.host('api')}"

    @property
    def web(self) -> str:
        return f"https://{self.host('web')}"

    def as_dict(self) -> dict[str, dict[str, str]]:
        """``{agent|mcp|api|web: {host, url}}``, as ai-agents says them."""
        return {
            kind: {"host": self.host(kind), "url": getattr(self, kind)}
            for kind in ("agent", "mcp", "api", "web")
        }


__all__ = [
    "API_PORT",
    "AddressHosts",
    "DEFAULT_DOMAIN",
    "DOMAIN_VARIABLE",
    "MCP_PORT",
    "WEB_PORT",
    "hosts_domain",
]

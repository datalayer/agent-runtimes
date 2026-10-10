# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Credential-free PAP summaries for agent tools and runtime surfaces.

The PAP SDK owns protocol validation and remote trust boundaries. Agent
Runtimes owns what may cross into a model, tool result, trace, or UI state.
This module deliberately exposes public capability metadata only. Session and
authorization flows belong in deterministic host services and return opaque
references or safe status through a different boundary.
"""

from __future__ import annotations

from typing import Protocol

from personal_agent_protocol import AgentIdentityClient, DiscoveryClient
from personal_agent_protocol.models import (
    ClientMetadata,
    DiscoveredCompany,
    JsonWebKeySet,
)
from pydantic import BaseModel, ConfigDict


class PapCompanySummary(BaseModel):
    """Verified public company capabilities safe to expose to an agent."""

    model_config = ConfigDict(frozen=True)

    organization: str
    domain: str
    protocol_version: str
    issuer: str | None
    sign_in: tuple[str, ...]
    interfaces: tuple[str, ...]
    extensions: dict[str, str]


class PapAgentIdentitySummary(BaseModel):
    """Verified public personal-agent identity safe to expose to an agent."""

    model_config = ConfigDict(frozen=True)

    client_id: str
    client_name: str
    redirect_count: int
    signing_algorithms: tuple[str, ...]
    extensions: dict[str, str]


class _CompanyClient(Protocol):
    async def discover(self, domain: str) -> DiscoveredCompany: ...


class _IdentityClient(Protocol):
    async def fetch_metadata(self, client_id: str) -> ClientMetadata: ...

    async def fetch_jwks(self, client_id: str) -> JsonWebKeySet: ...


def _company_summary(company: DiscoveredCompany) -> PapCompanySummary:
    document = company.document
    sign_in: list[str] = []
    if document.auth is not None:
        sign_in = [
            name
            for name in ("direct", "device", "mediated")
            if getattr(document.auth, name) is not None
        ]
    interfaces: list[str] = []
    if document.agent is not None:
        interfaces.extend(
            f"agent:{protocol.type}" for protocol in document.agent.protocols
        )
    interfaces.extend(f"api:{api.type}" for api in document.apis)
    if document.web is not None:
        interfaces.append("web")
    return PapCompanySummary(
        organization=document.organization.name,
        domain=document.organization.domain,
        protocol_version=document.protocol_version,
        issuer=document.auth.issuer if document.auth is not None else None,
        sign_in=tuple(sign_in),
        interfaces=tuple(interfaces),
        extensions={name: value.version for name, value in document.extensions.items()},
    )


def _identity_summary(
    metadata: ClientMetadata,
    keys: JsonWebKeySet,
) -> PapAgentIdentitySummary:
    algorithms = {
        key.alg or ("ES256" if key.kty == "EC" else "RS256") for key in keys.keys
    }
    return PapAgentIdentitySummary(
        client_id=metadata.client_id,
        client_name=metadata.client_name,
        redirect_count=len(metadata.redirect_uris),
        signing_algorithms=tuple(sorted(algorithms)),
        extensions={name: value.version for name, value in metadata.extensions.items()},
    )


class PapPersonalAgentCapability:
    """Use PAP clients while enforcing Agent Runtimes' public-summary boundary."""

    def __init__(
        self,
        *,
        company_client: _CompanyClient | None = None,
        identity_client: _IdentityClient | None = None,
    ) -> None:
        if company_client is None:
            self._owned_company: DiscoveryClient | None = DiscoveryClient()
            self._company: _CompanyClient = self._owned_company
        else:
            self._owned_company = None
            self._company = company_client
        if identity_client is None:
            self._owned_identity: AgentIdentityClient | None = AgentIdentityClient()
            self._identity: _IdentityClient = self._owned_identity
        else:
            self._owned_identity = None
            self._identity = identity_client

    async def __aenter__(self) -> PapPersonalAgentCapability:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close only protocol clients created by this capability."""

        if self._owned_company is not None:
            await self._owned_company.aclose()
        if self._owned_identity is not None:
            await self._owned_identity.aclose()

    async def discover_company(self, domain: str) -> PapCompanySummary:
        """Discover and validate a company, then return public capabilities only."""

        return _company_summary(await self._company.discover(domain))

    async def inspect_agent(self, client_id: str) -> PapAgentIdentitySummary:
        """Verify client metadata and public JWKS, then return a safe identity summary."""

        metadata = await self._identity.fetch_metadata(client_id)
        keys = await self._identity.fetch_jwks(client_id)
        return _identity_summary(metadata, keys)

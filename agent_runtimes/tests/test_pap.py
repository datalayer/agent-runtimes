# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from __future__ import annotations

from personal_agent_protocol.models import (
    ClientMetadata,
    DiscoveredCompany,
    DiscoveryDocument,
    JsonWebKeySet,
)

from agent_runtimes.pap import PapPersonalAgentCapability


class CompanyClient:
    async def discover(self, domain: str) -> DiscoveredCompany:
        assert domain == "shop.example"
        return DiscoveredCompany(
            discovery_url="https://shop.example/.well-known/poppy.json",
            document=DiscoveryDocument.model_validate(
                {
                    "protocol_version": "0.1",
                    "organization": {"name": "Example Shop", "domain": "shop.example"},
                    "auth": {
                        "issuer": "https://auth.shop.example",
                        "direct": {"scopes": ["poppy:read"]},
                    },
                    "agent": {
                        "protocols": [
                            {
                                "type": "a2a",
                                "endpoint": "https://shop.example/agent",
                            }
                        ]
                    },
                    "apis": [
                        {
                            "type": "openapi",
                            "url": "https://shop.example/openapi.json",
                            "description": "Read the catalogue",
                        }
                    ],
                    "extensions": {"operations": {"version": "1"}},
                }
            ),
        )


class IdentityClient:
    async def fetch_metadata(self, client_id: str) -> ClientMetadata:
        assert client_id == "https://assistant.example/agent.json"
        return ClientMetadata.model_validate(
            {
                "client_id": client_id,
                "client_name": "Example Assistant",
                "jwks_uri": "https://assistant.example/jwks.json",
                "redirect_uris": ["https://assistant.example/callback"],
                "extensions": {"memory": {"version": "2"}},
            }
        )

    async def fetch_jwks(self, client_id: str) -> JsonWebKeySet:
        assert client_id == "https://assistant.example/agent.json"
        return JsonWebKeySet.model_validate(
            {
                "keys": [
                    {
                        "kty": "EC",
                        "crv": "P-256",
                        "x": "x-coordinate",
                        "y": "y-coordinate",
                        "use": "sig",
                    }
                ]
            }
        )


async def test_company_summary_contains_capabilities_but_no_endpoints() -> None:
    capability = PapPersonalAgentCapability(
        company_client=CompanyClient(),
        identity_client=IdentityClient(),
    )

    summary = await capability.discover_company("shop.example")

    assert summary.organization == "Example Shop"
    assert summary.sign_in == ("direct",)
    assert summary.interfaces == ("agent:a2a", "api:openapi")
    assert summary.extensions == {"operations": "1"}
    serialized = summary.model_dump_json()
    assert "openapi.json" not in serialized
    assert "/agent" not in serialized


async def test_agent_summary_contains_public_key_policy_but_no_key_material() -> None:
    capability = PapPersonalAgentCapability(
        company_client=CompanyClient(),
        identity_client=IdentityClient(),
    )

    summary = await capability.inspect_agent("https://assistant.example/agent.json")

    assert summary.client_name == "Example Assistant"
    assert summary.signing_algorithms == ("ES256",)
    assert summary.extensions == {"memory": "2"}
    serialized = summary.model_dump_json()
    assert "x-coordinate" not in serialized
    assert "y-coordinate" not in serialized

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Identity Catalog.

Who is acting when an agent acts: a person, an agent, an application, an
organization, a visitor or a service, issued by Datalayer IAM, the Personal Agent
Protocol, Amazon Bedrock AgentCore Identity or an organization's OIDC provider;
how each proves it, the token it holds, where its third-party credentials are kept.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import IdentitySpec

# ============================================================================
# Identity Definitions
# ============================================================================

AWS_AGENTCORE_GATEWAY_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "aws-agentcore-gateway",
        "version": "0.0.1",
        "name": "AgentCore Gateway tools",
        "description": "An AgentCore Gateway turning the customer's APIs and Lambda functions into MCP tools. Datalayer agents reach it as an MCP server; its inbound authorizer trusts Datalayer IAM, and its outbound calls take machine-to-machine credentials.",
        "subject": "service",
        "provider": "aws-agentcore",
        "protocols": ["mcp"],
        "inbound": {
            "kind": "jwt",
            "issuer": "https://prod1.datalayer.run/api/iam/v1/oauth",
            "discovery_url": "https://prod1.datalayer.run/api/iam/v1/oauth/.well-known/openid-configuration",
            "algorithms": ["RS256"],
            "audiences": [
                "arn:aws:bedrock-agentcore:<region>:<account>:gateway/<gateway-id>"
            ],
            "clients": ["datalayer-platform"],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 0,
        },
        "workload": {"token": "agentcore-runtime", "lifetime_seconds": 0},
        "credentials": {
            "vault": "agentcore",
            "providers": [
                {"name": "internal-api", "kind": "oauth2", "flow": "m2m", "scopes": []},
                {
                    "name": "partner-api-key",
                    "kind": "api-key",
                    "flow": "",
                    "scopes": [],
                },
            ],
        },
        "custody": {"keys": "vault-transit", "algorithm": "RS256"},
        "consent": {"by": "organization", "hosted_by": "provider", "binding": False},
        "pap": None,
        "enabled": True,
        "tags": ["aws", "agentcore", "gateway", "mcp"],
        "icon": "plug",
        "emoji": "🔌",
    }
)

AWS_AGENTCORE_RUNTIME_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "aws-agentcore-runtime",
        "version": "0.0.1",
        "name": "AgentCore Runtime agent",
        "description": "A Datalayer agent in AgentCore Runtime, in the customer's AWS account. Its JWT authorizer trusts Datalayer IAM's discovery document; Runtime hands the agent a workload access token for the person, and third-party tokens come from AgentCore's token vault, consent bound by Datalayer.",
        "subject": "agent",
        "provider": "aws-agentcore",
        "protocols": ["ag-ui", "a2a", "mcp"],
        "inbound": {
            "kind": "jwt",
            "issuer": "https://prod1.datalayer.run/api/iam/v1/oauth",
            "discovery_url": "https://prod1.datalayer.run/api/iam/v1/oauth/.well-known/openid-configuration",
            "algorithms": ["RS256"],
            "audiences": [
                "arn:aws:bedrock-agentcore:<region>:<account>:runtime/<runtime-id>"
            ],
            "clients": ["datalayer-platform"],
            "scopes": [],
            "claims": {"org_uid": "<organization>"},
            "lifetime_seconds": 900,
        },
        "workload": {"token": "agentcore-runtime", "lifetime_seconds": 0},
        "credentials": {
            "vault": "agentcore",
            "providers": [
                {
                    "name": "github",
                    "kind": "oauth2",
                    "flow": "user-federation",
                    "scopes": ["read:user"],
                },
                {
                    "name": "google-workspace",
                    "kind": "oauth2",
                    "flow": "user-federation",
                    "scopes": [
                        "https://www.googleapis.com/auth/drive.metadata.readonly"
                    ],
                },
                {
                    "name": "salesforce",
                    "kind": "oauth2",
                    "flow": "user-federation",
                    "scopes": ["api", "refresh_token"],
                },
            ],
        },
        "custody": {"keys": "vault-transit", "algorithm": "RS256"},
        "consent": {"by": "person", "hosted_by": "datalayer", "binding": True},
        "pap": None,
        "enabled": True,
        "tags": ["aws", "agentcore", "runtime"],
        "icon": "cloud",
        "emoji": "☁️",
    }
)

AWS_AGENTCORE_VAULT_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "aws-agentcore-vault",
        "version": "0.0.1",
        "name": "AgentCore vault from Datalayer",
        "description": "An agent running on Datalayer, or as an Agent Node on ECS, whose organization keeps third-party tokens in its own AgentCore token vault: the platform obtains the workload access token with the person's verified JWT, never by user id.",
        "subject": "agent",
        "provider": "aws-agentcore",
        "protocols": [],
        "inbound": {
            "kind": "jwt",
            "issuer": "https://prod1.datalayer.run/api/iam/v1/oauth",
            "discovery_url": "https://prod1.datalayer.run/api/iam/v1/oauth/.well-known/openid-configuration",
            "algorithms": ["RS256"],
            "audiences": [],
            "clients": ["datalayer-platform"],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 0,
        },
        "workload": {"token": "agentcore-jwt", "lifetime_seconds": 900},
        "credentials": {
            "vault": "agentcore",
            "providers": [
                {
                    "name": "github",
                    "kind": "oauth2",
                    "flow": "user-federation",
                    "scopes": ["read:user"],
                }
            ],
        },
        "custody": {"keys": "vault-transit", "algorithm": "RS256"},
        "consent": {"by": "person", "hosted_by": "datalayer", "binding": True},
        "pap": None,
        "enabled": True,
        "tags": ["aws", "agentcore", "vault"],
        "icon": "lock",
        "emoji": "🔐",
    }
)

DATALAYER_ACTING_AGENT_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "datalayer-acting-agent",
        "version": "0.0.1",
        "name": "Agent acting for a person",
        "description": "A deployed agent acting for the person it answers to: a 15-minute acting token whose subject is the person, carrying the application and the agent. Every tool call is checked by the Shield against the person, the agent and the call.",
        "subject": "agent",
        "provider": "datalayer",
        "protocols": [],
        "inbound": {
            "kind": "jwt",
            "issuer": "https://prod1.datalayer.run/api/iam/v1/oauth",
            "discovery_url": "",
            "algorithms": ["HS256"],
            "audiences": [],
            "clients": [],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 900,
        },
        "workload": {"token": "acting", "lifetime_seconds": 900},
        "credentials": {"vault": "datalayer", "providers": []},
        "custody": {"keys": "shared-secret", "algorithm": "HS256"},
        "consent": {"by": "person", "hosted_by": "datalayer", "binding": False},
        "pap": None,
        "enabled": True,
        "tags": ["datalayer", "agent"],
        "icon": "dependabot",
        "emoji": "🤖",
    }
)

DATALAYER_PERSON_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "datalayer-person",
        "version": "0.0.1",
        "name": "Datalayer person",
        "description": "A person signed in to Datalayer IAM, by password, GitHub, Google, LinkedIn or Okta. The platform token stays inside Datalayer; anything a third party must verify is exchanged for a short-lived, audience-bound token signed asymmetrically.",
        "subject": "person",
        "provider": "datalayer",
        "protocols": [],
        "inbound": {
            "kind": "session",
            "issuer": "https://prod1.datalayer.run/api/iam/v1/oauth",
            "discovery_url": "",
            "algorithms": ["HS256"],
            "audiences": [],
            "clients": [],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 86400,
        },
        "workload": {"token": "none", "lifetime_seconds": 0},
        "credentials": {
            "vault": "datalayer",
            "providers": [
                {
                    "name": "google-workspace",
                    "kind": "oauth2",
                    "flow": "user-federation",
                    "scopes": ["https://www.googleapis.com/auth/gmail.readonly"],
                },
                {
                    "name": "github",
                    "kind": "oauth2",
                    "flow": "user-federation",
                    "scopes": ["read:user", "repo"],
                },
            ],
        },
        "custody": {"keys": "shared-secret", "algorithm": "HS256"},
        "consent": {"by": "person", "hosted_by": "datalayer", "binding": False},
        "pap": None,
        "enabled": True,
        "tags": ["datalayer", "person"],
        "icon": "person",
        "emoji": "🧑",
    }
)

DATALAYER_SERVICE_AGENT_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "datalayer-service-agent",
        "version": "0.0.1",
        "name": "Service agent",
        "description": "An agent that works unattended for an organization (a schedule, a trigger, a team's worker): a service principal that obtains its token with OAuth 2.0 client credentials, scoped by the organization's policy.",
        "subject": "service",
        "provider": "datalayer",
        "protocols": [],
        "inbound": {
            "kind": "jwt",
            "issuer": "https://prod1.datalayer.run/api/iam/v1/oauth",
            "discovery_url": "",
            "algorithms": ["HS256"],
            "audiences": [],
            "clients": [],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 0,
        },
        "workload": {"token": "client-credentials", "lifetime_seconds": 3600},
        "credentials": {"vault": "datalayer", "providers": []},
        "custody": {"keys": "shared-secret", "algorithm": "HS256"},
        "consent": {"by": "organization", "hosted_by": "datalayer", "binding": False},
        "pap": None,
        "enabled": True,
        "tags": ["datalayer", "service"],
        "icon": "server",
        "emoji": "⚙️",
    }
)

DATALAYER_VISITOR_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "datalayer-visitor",
        "version": "0.0.1",
        "name": "Visitor",
        "description": "Someone talking to an embedded or public application without an account: an ephemeral identity, no vault, never asked to consent to a third party; a tool that needs one is refused in a sentence.",
        "subject": "visitor",
        "provider": "datalayer",
        "protocols": [],
        "inbound": {
            "kind": "jwt",
            "issuer": "https://prod1.datalayer.run/api/iam/v1/oauth",
            "discovery_url": "",
            "algorithms": ["HS256"],
            "audiences": [],
            "clients": [],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 3600,
        },
        "workload": {"token": "none", "lifetime_seconds": 0},
        "credentials": {"vault": "none", "providers": []},
        "custody": {"keys": "shared-secret", "algorithm": "HS256"},
        "consent": {"by": "none", "hosted_by": "none", "binding": False},
        "pap": None,
        "enabled": True,
        "tags": ["datalayer", "visitor"],
        "icon": "eye",
        "emoji": "👀",
    }
)

ORGANIZATION_OIDC_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "organization-oidc",
        "version": "0.0.1",
        "name": "Organization sign-in (OIDC)",
        "description": "An organization's own OpenID Connect provider (Entra ID, Okta, Google), registered on Datalayer for enterprise sign-in and SCIM: its issuer is checked against its discovery document and its keys.",
        "subject": "organization",
        "provider": "oidc",
        "protocols": [],
        "inbound": {
            "kind": "jwt",
            "issuer": "https://login.example.com",
            "discovery_url": "https://login.example.com/.well-known/openid-configuration",
            "algorithms": ["RS256"],
            "audiences": [],
            "clients": [],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 0,
        },
        "workload": {"token": "none", "lifetime_seconds": 0},
        "credentials": {"vault": "none", "providers": []},
        "custody": {"keys": "provider", "algorithm": "RS256"},
        "consent": {"by": "organization", "hosted_by": "provider", "binding": False},
        "pap": None,
        "enabled": True,
        "tags": ["enterprise", "sso"],
        "icon": "organization",
        "emoji": "🏢",
    }
)

PAP_COMPANY_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "pap-company",
        "version": "0.0.1",
        "name": "PAP company",
        "description": "A business answering the personal agents its customers bring: it verifies their client assertions and DPoP proofs against the published keys, signs the person in by itself or mediated, and holds one Account Token per person and application.",
        "subject": "organization",
        "provider": "pap",
        "protocols": ["pap", "pact"],
        "inbound": {
            "kind": "dpop",
            "issuer": "",
            "discovery_url": "",
            "algorithms": ["ES256"],
            "audiences": [],
            "clients": [],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 0,
        },
        "workload": {"token": "none", "lifetime_seconds": 0},
        "credentials": {"vault": "datalayer", "providers": []},
        "custody": {"keys": "vault-transit", "algorithm": "ES256"},
        "consent": {"by": "person", "hosted_by": "provider", "binding": True},
        "pap": {
            "roles": ["company"],
            "client_id_per_application": True,
            "pairwise": True,
            "dpop": True,
        },
        "enabled": True,
        "tags": ["pap", "company"],
        "icon": "briefcase",
        "emoji": "🏪",
    }
)

PAP_PERSON_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "pap-person",
        "version": "0.0.1",
        "name": "PAP person, for themselves",
        "description": "A person who connects their own account at a company, with no application acting for them: the tenant is the person, pairwise and DPoP-bound as an application is.",
        "subject": "person",
        "provider": "pap",
        "protocols": ["pap"],
        "inbound": {
            "kind": "dpop",
            "issuer": "",
            "discovery_url": "",
            "algorithms": ["ES256"],
            "audiences": [],
            "clients": [],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 0,
        },
        "workload": {"token": "none", "lifetime_seconds": 0},
        "credentials": {"vault": "datalayer", "providers": []},
        "custody": {"keys": "vault-transit", "algorithm": "ES256"},
        "consent": {"by": "person", "hosted_by": "datalayer", "binding": True},
        "pap": {
            "roles": ["personal-agent"],
            "client_id_per_application": False,
            "pairwise": True,
            "dpop": True,
        },
        "enabled": True,
        "tags": ["pap", "person"],
        "icon": "person",
        "emoji": "🧑\u200d💼",
    }
)

PAP_PERSONAL_AGENT_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "pap-personal-agent",
        "version": "0.0.1",
        "name": "PAP personal agent",
        "description": "An application acting for a person at a company, under the Personal Agent Protocol: one client id per application published with its keys, a pairwise user id per company that companies cannot link, DPoP-bound tokens, keys signed in Vault transit and never handed to a runtime.",
        "subject": "application",
        "provider": "pap",
        "protocols": ["pap", "web-bot-auth"],
        "inbound": {
            "kind": "dpop",
            "issuer": "",
            "discovery_url": "",
            "algorithms": ["ES256"],
            "audiences": [],
            "clients": [],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 0,
        },
        "workload": {"token": "acting", "lifetime_seconds": 0},
        "credentials": {"vault": "datalayer", "providers": []},
        "custody": {"keys": "vault-transit", "algorithm": "ES256"},
        "consent": {"by": "person", "hosted_by": "datalayer", "binding": True},
        "pap": {
            "roles": ["personal-agent"],
            "client_id_per_application": True,
            "pairwise": True,
            "dpop": True,
        },
        "enabled": True,
        "tags": ["pap", "personal-agent"],
        "icon": "person",
        "emoji": "🙋",
    }
)

WEB_BOT_AUTH_AGENT_IDENTITY_0_0_1 = IdentitySpec.model_validate(
    {
        "id": "web-bot-auth-agent",
        "version": "0.0.1",
        "name": "Signed web agent",
        "description": "An agent whose outbound requests are signed (HTTP Message Signatures, RFC 9421) with a key a website checks against the agent's published key directory, so a site knows which agent is calling.",
        "subject": "agent",
        "provider": "datalayer",
        "protocols": ["web-bot-auth"],
        "inbound": {
            "kind": "http-signature",
            "issuer": "",
            "discovery_url": "",
            "algorithms": ["Ed25519"],
            "audiences": [],
            "clients": [],
            "scopes": [],
            "claims": {},
            "lifetime_seconds": 0,
        },
        "workload": {"token": "none", "lifetime_seconds": 0},
        "credentials": {"vault": "none", "providers": []},
        "custody": {"keys": "vault-transit", "algorithm": "Ed25519"},
        "consent": {"by": "none", "hosted_by": "none", "binding": False},
        "pap": None,
        "enabled": True,
        "tags": ["web-bot-auth", "agent"],
        "icon": "globe",
        "emoji": "✍️",
    }
)


# ============================================================================
# Identity Catalog
# ============================================================================

IDENTITY_CATALOGUE: Dict[str, IdentitySpec] = {
    "aws-agentcore-gateway": AWS_AGENTCORE_GATEWAY_IDENTITY_0_0_1,
    "aws-agentcore-runtime": AWS_AGENTCORE_RUNTIME_IDENTITY_0_0_1,
    "aws-agentcore-vault": AWS_AGENTCORE_VAULT_IDENTITY_0_0_1,
    "datalayer-acting-agent": DATALAYER_ACTING_AGENT_IDENTITY_0_0_1,
    "datalayer-person": DATALAYER_PERSON_IDENTITY_0_0_1,
    "datalayer-service-agent": DATALAYER_SERVICE_AGENT_IDENTITY_0_0_1,
    "datalayer-visitor": DATALAYER_VISITOR_IDENTITY_0_0_1,
    "organization-oidc": ORGANIZATION_OIDC_IDENTITY_0_0_1,
    "pap-company": PAP_COMPANY_IDENTITY_0_0_1,
    "pap-person": PAP_PERSON_IDENTITY_0_0_1,
    "pap-personal-agent": PAP_PERSONAL_AGENT_IDENTITY_0_0_1,
    "web-bot-auth-agent": WEB_BOT_AUTH_AGENT_IDENTITY_0_0_1,
}


def get_identity(identity_id: str) -> IdentitySpec | None:
    """A Identity, by `id` or `id:version`, or None."""
    found = IDENTITY_CATALOGUE.get(identity_id)
    if found is not None:
        return found
    base, _, version = identity_id.rpartition(":")
    return IDENTITY_CATALOGUE.get(base) if base and "." in version else None


def list_identities() -> list[IdentitySpec]:
    """Every Identity of the catalogue, resolved."""
    return list(IDENTITY_CATALOGUE.values())

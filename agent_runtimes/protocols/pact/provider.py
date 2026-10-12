# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A local PACT 1.0 Provider with one Brand, *Example Air* (AGENT_PROTOCOLS PR-13, EX-06).

Both profiles: *Identity* (§2–4: the card, the personal-agent JWT verified
against the agent's registered JWKS, one ``contextId`` per (agent, user,
Brand), idempotent retries by ``messageId``) and *Delegated* (§5: RFC 8628
device code, the Brand's own sign-in simulated by :meth:`ExampleAir.approve`
— the person unticks what they do not grant —, the delegation token, a
step-up when a turn needs a scope the token lacks, and a signed receipt on
every reply under delegation). The verification is
:mod:`agent_runtimes.protocols.pact.tokens`, which a Loop application acting
as a business uses the same way. For tests and examples only.
"""

from __future__ import annotations

import json
import secrets
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from .tokens import verify_delegation_token, verify_personal_agent_jwt

BRAND_ID = "example-air"
SCOPES = {
    "bookings:read": "See your bookings and their status",
    "bookings:change": "Change the date of a booking",
}


def _a2a_error(status: int, reason: str, message: str) -> JSONResponse:
    names = {400: "INVALID_ARGUMENT", 404: "NOT_FOUND"}
    return JSONResponse(
        {
            "error": {
                "code": status,
                "status": "FAILED_PRECONDITION"
                if reason == "UNSUPPORTED_OPERATION"
                else names.get(status, "INTERNAL"),
                "message": message,
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                        "reason": reason,
                        "domain": "a2a-protocol.org",
                    }
                ],
            }
        },
        status_code=status,
        media_type="application/a2a+json",
    )


def _unauthorized(error: str | None = None) -> Response:
    challenge = 'Bearer realm="a2a"' + (f', error="{error}"' if error else "")
    return Response(status_code=401, headers={"WWW-Authenticate": challenge})


@dataclass
class _Grant:
    user_code: str
    client_id: str
    scopes: tuple[str, ...]
    approved: tuple[str, ...] | None = None
    brand_user: str | None = None
    issued: bool = False


@dataclass
class ExampleAir:
    """The Provider's state for its one Brand."""

    base: str = "https://provider.example"
    audience: str = "https://provider.example/a2a"
    #: Registered personal agents: issuer → JWKS (§3.1).
    agents: dict[str, dict[str, Any]] = field(default_factory=dict)
    contexts: dict[str, tuple[str, str, str | None]] = field(default_factory=dict)
    replies: dict[tuple[str, str], dict[str, Any]] = field(default_factory=dict)
    grants: dict[str, _Grant] = field(default_factory=dict)

    def __post_init__(self) -> None:
        from cryptography.hazmat.primitives.asymmetric import ec

        from ..web_bot_auth.keys import public_jwk

        self._key = ec.generate_private_key(ec.SECP256R1())
        self.public_jwk = {
            **public_jwk(self._key.public_key()),
            "alg": "ES256",
            "use": "sig",
        }

    @property
    def interface_url(self) -> str:
        return f"{self.base}/a2a/{BRAND_ID}"

    @property
    def oauth(self) -> str:
        return f"{self.interface_url}/oauth"

    def register(self, issuer: str, jwks: dict[str, Any]) -> None:
        self.agents[issuer] = jwks

    def card(self) -> dict[str, Any]:
        return {
            "name": "Example Air Support",
            "supportedInterfaces": [
                {
                    "url": self.interface_url,
                    "protocolBinding": "HTTP+JSON",
                    "protocolVersion": "1.0",
                }
            ],
            "provider": {"organization": "Example Provider", "url": self.base},
            "version": "0.1.0",
            "capabilities": {
                "streaming": False,
                "pushNotifications": False,
                "extendedAgentCard": False,
            },
            "securitySchemes": {
                "paJwt": {
                    "httpAuthSecurityScheme": {
                        "scheme": "Bearer",
                        "bearerFormat": "JWT",
                    }
                },
                "userDelegation": {
                    "oauth2SecurityScheme": {
                        "flows": {
                            "deviceCode": {
                                "deviceAuthorizationUrl": f"{self.oauth}/device_authorization",
                                "tokenUrl": f"{self.oauth}/token",
                                "scopes": SCOPES,
                            }
                        },
                        "oauth2MetadataUrl": f"{self.oauth}/.well-known/oauth-authorization-server",
                    }
                },
            },
            "securityRequirements": [
                {"schemes": {"paJwt": {"list": []}}},
                {"schemes": {"paJwt": {"list": []}, "userDelegation": {"list": []}}},
            ],
            "defaultInputModes": ["text/plain"],
            "defaultOutputModes": ["text/plain"],
            "skills": [
                {
                    "id": "bookings",
                    "name": "Bookings",
                    "description": "Bookings and changes.",
                    "tags": ["bookings"],
                }
            ],
        }

    def _sign(self, claims: dict[str, Any]) -> str:
        import jwt

        return jwt.encode(
            claims,
            self._key,
            algorithm="ES256",
            headers={"kid": self.public_jwk["kid"]},
        )

    def _personal_agent(self, request: Request) -> dict[str, Any] | None:
        header = request.headers.get("authorization", "")
        if not header.startswith("Bearer "):
            return None
        token = header[len("Bearer ") :]
        import jwt

        try:
            issuer = jwt.decode(token, options={"verify_signature": False}).get("iss")
        except jwt.PyJWTError:
            return None
        jwks = self.agents.get(issuer)
        if jwks is None:
            return None
        try:
            return verify_personal_agent_jwt(
                token, issuer=issuer, audience=self.audience, jwks=jwks
            )
        except PermissionError:
            return None

    def approve(self, user_code: str, brand_user: str, scopes: list[str]) -> None:
        """The person signed in at the Brand and approved ``scopes`` (maybe fewer than asked)."""
        grant = next(g for g in self.grants.values() if g.user_code == user_code)
        grant.approved = tuple(scope for scope in grant.scopes if scope in scopes)
        grant.brand_user = brand_user

    def _answer(
        self, text: str, scopes: tuple[str, ...]
    ) -> tuple[str, list[str], list[dict[str, str]], list[str]]:
        """The Brand's agent: what it says, the scopes it used, its actions, and what it lacks."""
        lowered = text.lower()
        if "change" in lowered:
            if "bookings:change" not in scopes:
                return (
                    "I need permission to change a booking.",
                    [],
                    [],
                    ["bookings:change"],
                )
            return (
                "Booking AB123 now flies on 2026-11-09.",
                ["bookings:read", "bookings:change"],
                [
                    {"tool": "lookup_booking"},
                    {"tool": "change_booking", "argsHash": "sha256:9f"},
                ],
                [],
            )
        if "booking" in lowered and "bookings:read" in scopes:
            return (
                "Your booking AB123 flies on 2026-11-02.",
                ["bookings:read"],
                [{"tool": "lookup_booking"}],
                [],
            )
        return "Happy to help. What is your booking reference?", [], [], []

    async def _send(self, request: Request) -> Response:
        identity = self._personal_agent(request)
        if identity is None:
            return _unauthorized()
        delegation = None
        if request.headers.get("x-a2a-user-delegation"):
            token = request.headers["x-a2a-user-delegation"].removeprefix("Bearer ")
            try:
                delegation = verify_delegation_token(
                    token,
                    issuer=self.oauth,
                    interface_url=self.interface_url,
                    client_id=identity["iss"],
                    jwks={"keys": [self.public_jwk]},
                )
            except PermissionError:
                return _unauthorized("invalid_token")
        body = await request.json()
        message = body.get("message") or {}
        if message.get("role") != "ROLE_USER" or not any(
            p.get("text", "").strip() for p in message.get("parts", [])
        ):
            return _a2a_error(400, "INVALID_PARAMS", "a user message with text")
        if message.get("taskId"):
            return _a2a_error(404, "TASK_NOT_FOUND", "no such task")
        who = (identity["iss"], identity["sub"])
        context_id = message.get("contextId")
        if context_id:
            owner = self.contexts.get(context_id)
            if owner is None or owner[:2] != who:
                return _a2a_error(400, "INVALID_PARAMS", "Unknown contextId")
            if delegation and owner[2] not in (None, delegation["sub"]):
                return _a2a_error(400, "INVALID_PARAMS", "Unknown contextId")
        else:
            context_id = str(uuid.uuid4())
            self.contexts[context_id] = (*who, None)
        if delegation:
            self.contexts[context_id] = (*who, delegation["sub"])
        key = (context_id, message["messageId"])
        if key in self.replies:
            return JSONResponse(self.replies[key], media_type="application/a2a+json")
        text = " ".join(part.get("text", "") for part in message["parts"])
        scopes = tuple(delegation["scope"].split()) if delegation else ()
        said, used, actions, missing = self._answer(text, scopes)
        if missing:
            reply = {
                "task": {
                    "id": f"t-{uuid.uuid4().hex[:8]}",
                    "contextId": context_id,
                    "status": {
                        "state": "TASK_STATE_AUTH_REQUIRED",
                        "message": {"role": "ROLE_AGENT", "parts": [{"text": said}]},
                    },
                    "metadata": {
                        "pact.missingScopes": missing,
                        "pact.verificationUriComplete": f"https://air.example/login?scopes={'+'.join(missing)}",
                    },
                }
            }
            return JSONResponse(reply, media_type="application/a2a+json")
        out: dict[str, Any] = {
            "messageId": f"r-{uuid.uuid4().hex[:8]}",
            "contextId": context_id,
            "role": "ROLE_AGENT",
            "parts": [{"text": said}],
        }
        if delegation:
            claims = {
                "grantId": delegation["grant_id"],
                "user": delegation["sub"],
                "pa": identity["iss"],
                "brand": self.interface_url,
                "scopesUsed": used,
                "actions": actions,
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            import jwt

            jws = jwt.api_jws.encode(
                json.dumps(claims, separators=(",", ":")).encode(),
                self._key,
                algorithm="ES256",
                headers={"kid": self.public_jwk["kid"]},
            )
            out["metadata"] = {"pact.receipt": {"jws": jws, "claims": claims}}
        reply = {"message": out}
        self.replies[key] = reply
        return JSONResponse(reply, media_type="application/a2a+json")

    async def _device_authorization(self, request: Request) -> Response:
        identity = self._personal_agent(request)
        if identity is None:
            return _unauthorized()
        form = await request.form()
        if form.get("client_id") != identity["iss"]:
            return JSONResponse({"error": "invalid_client"}, status_code=400)
        scopes = tuple(str(form.get("scope", "")).split())
        if not scopes or any(scope not in SCOPES for scope in scopes):
            return JSONResponse({"error": "invalid_scope"}, status_code=400)
        device_code = f"dc_{secrets.token_urlsafe(16)}"
        user_code = f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
        self.grants[device_code] = _Grant(
            user_code=user_code, client_id=identity["iss"], scopes=scopes
        )
        login = "https://air.example/login?return_to=consent"
        return JSONResponse(
            {
                "device_code": device_code,
                "user_code": user_code,
                "verification_uri": login,
                "verification_uri_complete": f"{login}&user_code={user_code}",
                "expires_in": 600,
                "interval": 1,
            }
        )

    async def _token(self, request: Request) -> Response:
        identity = self._personal_agent(request)
        if identity is None:
            return _unauthorized()
        form = await request.form()
        grant = self.grants.get(str(form.get("device_code")))
        if grant is None or grant.client_id != identity["iss"] or grant.issued:
            return JSONResponse({"error": "expired_token"}, status_code=400)
        if grant.approved is None:
            return JSONResponse({"error": "authorization_pending"}, status_code=400)
        if not grant.approved:
            return JSONResponse({"error": "access_denied"}, status_code=400)
        grant.issued = True
        now = int(time.time())
        token = self._sign(
            {
                "iss": self.oauth,
                "aud": self.interface_url,
                "sub": grant.brand_user,
                "client_id": grant.client_id,
                "scope": " ".join(grant.approved),
                "grant_id": f"a2agrant_{uuid.uuid4().hex[:10]}",
                "iat": now,
                "exp": now + 3600,
            }
        )
        return JSONResponse(
            {
                "token_type": "Bearer",
                "access_token": token,
                "expires_in": 3600,
                "scope": " ".join(grant.approved),
            }
        )

    def app(self) -> Starlette:
        async def card(request: Request) -> Response:
            return JSONResponse(self.card())

        async def metadata(request: Request) -> Response:
            return JSONResponse(
                {
                    "issuer": self.oauth,
                    "device_authorization_endpoint": f"{self.oauth}/device_authorization",
                    "token_endpoint": f"{self.oauth}/token",
                    "jwks_uri": f"{self.oauth}/jwks.json",
                    "grant_types_supported": [
                        "urn:ietf:params:oauth:grant-type:device_code"
                    ],
                    "scopes_supported": list(SCOPES),
                }
            )

        async def jwks(request: Request) -> Response:
            return JSONResponse({"keys": [self.public_jwk]})

        root = f"/a2a/{BRAND_ID}"
        return Starlette(
            routes=[
                Route(f"{root}/.well-known/agent-card.json", card),
                Route(f"{root}/message:send", self._send, methods=["POST"]),
                Route(f"{root}/oauth/.well-known/oauth-authorization-server", metadata),
                Route(f"{root}/oauth/jwks.json", jwks),
                Route(
                    f"{root}/oauth/device_authorization",
                    self._device_authorization,
                    methods=["POST"],
                ),
                Route(f"{root}/oauth/token", self._token, methods=["POST"]),
            ]
        )


__all__ = ["BRAND_ID", "ExampleAir", "SCOPES"]

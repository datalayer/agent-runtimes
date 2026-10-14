# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A PACT 1.0 Provider's side of a Brand (AGENT_PROTOCOLS PR-13, EX-06).

:class:`PactBrand` is a Brand answered by its Provider, both profiles:
*Identity* (§2–4: the card, the personal-agent JWT verified against the keys
of a registered issuer, one ``contextId`` per (agent, user, Brand),
idempotent retries by ``messageId``) and *Delegated* (§5: RFC 8628 device
code, the person's own sign-in at the Brand's page granting what they choose
— :meth:`PactBrand.approve` —, the delegation token, a step-up when a turn
needs a scope the token lacks, and a signed receipt on every reply under
delegation). What a host decides is passed in, never assumed: the key that
signs (an :class:`~agent_runtimes.protocols.web_bot_auth.HttpSigner`, ES256),
which issuers it accepts (:class:`IssuerKeys`), where its grants, contexts and
replies are kept (:class:`BrandStore`), and the Brand's own agent
(:class:`BrandAgent`). Datalayer hosts an application as a business this way
(ai-agents, ``pact.business``).

:class:`ExampleAir` is one Brand of it with everything in memory, for tests
and examples only. The verification is
:mod:`agent_runtimes.protocols.pact.tokens`.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Mapping, Optional, Protocol

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
    """Answer an A2A JSON error with its HTTP status."""
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
    """Answer 401 with a Bearer challenge, naming the error if any."""
    challenge = 'Bearer realm="a2a"' + (f', error="{error}"' if error else "")
    return Response(status_code=401, headers={"WWW-Authenticate": challenge})


@dataclass
class _Grant:
    """A device grant: the code, the client, the scopes asked and approved."""

    user_code: str
    client_id: str
    scopes: tuple[str, ...]
    approved: tuple[str, ...] | None = None
    brand_user: str | None = None
    issued: bool = False

    def record(self) -> dict[str, Any]:
        """Return the grant as a JSON record for the store."""
        return {
            "user_code": self.user_code,
            "client_id": self.client_id,
            "scopes": list(self.scopes),
            "approved": None if self.approved is None else list(self.approved),
            "brand_user": self.brand_user,
            "issued": self.issued,
        }

    @classmethod
    def of(cls, record: Mapping[str, Any]) -> "_Grant":
        """Read a grant back from its stored record."""
        approved = record.get("approved")
        return cls(
            user_code=str(record["user_code"]),
            client_id=str(record["client_id"]),
            scopes=tuple(record.get("scopes") or ()),
            approved=None if approved is None else tuple(approved),
            brand_user=record.get("brand_user"),
            issued=bool(record.get("issued")),
        )


# --- what a host passes in ------------------------------------------------------------


@dataclass(frozen=True)
class BrandTurn:
    """One message a personal agent sent the Brand: who sent it, for whom, under what."""

    text: str
    #: The personal agent (its JWT's ``iss``) and the person there (its ``sub``).
    issuer: str
    subject: str
    context_id: str
    #: Under a delegation: the person's account at the Brand and the scopes they granted.
    person: Optional[str] = None
    scopes: tuple[str, ...] = ()
    grant_id: Optional[str] = None


@dataclass(frozen=True)
class BrandAnswer:
    """What the Brand's agent says, the scopes it used and its actions (for the receipt),
    and the scopes it lacks (a step-up, §5.5).
    """

    text: str
    scopes_used: tuple[str, ...] = ()
    actions: tuple[Mapping[str, Any], ...] = ()
    missing: tuple[str, ...] = ()


class BrandAgent(Protocol):
    """The Brand's own agent."""

    async def answer(self, turn: BrandTurn) -> BrandAnswer:
        """Answer one turn of a conversation with the Brand."""


class IssuerKeys(Protocol):
    """The personal agents a Brand accepts (§3.1): an issuer's public keys, or None."""

    async def jwks_of(self, issuer: str) -> Optional[Mapping[str, Any]]:
        """Return the issuer's public keys, or None when not accepted."""


class BrandStore(Protocol):
    """Where a Brand keeps its device grants, its contexts and its replies (JSON records)."""

    async def get(self, kind: str, key: str) -> Optional[dict[str, Any]]:
        """Return the record of ``kind`` under ``key``, or None."""

    async def put(
        self, kind: str, key: str, value: dict[str, Any], *, seconds: int
    ) -> None:
        """Keep ``value`` under ``kind`` and ``key`` for ``seconds``."""


class InMemoryBrandStore:
    """A :class:`BrandStore` in this process: tests and examples."""

    def __init__(self) -> None:
        """Start with no records."""
        self.records: dict[tuple[str, str], dict[str, Any]] = {}

    async def get(self, kind: str, key: str) -> Optional[dict[str, Any]]:
        """Return a copy of the record, or None."""
        found = self.records.get((kind, key))
        return None if found is None else json.loads(json.dumps(found))

    async def put(
        self, kind: str, key: str, value: dict[str, Any], *, seconds: int
    ) -> None:
        """Keep a copy of the record (expiry is not enforced)."""
        self.records[(kind, key)] = json.loads(json.dumps(value))


class RegisteredIssuers:
    """An :class:`IssuerKeys` from a table: issuer → JWKS (the registration of §3.1)."""

    def __init__(self, agents: Optional[dict[str, Mapping[str, Any]]] = None) -> None:
        """Accept the given issuers and their keys."""
        self.agents: dict[str, Mapping[str, Any]] = dict(agents or {})

    async def jwks_of(self, issuer: str) -> Optional[Mapping[str, Any]]:
        """Return the registered keys of ``issuer``, or None."""
        return self.agents.get(issuer)


#: How long a device grant waits for the person, a context and a reply are kept.
DEVICE_SECONDS = 600
CONTEXT_SECONDS = 30 * 24 * 3600
TOKEN_SECONDS = 3600


def _b64url(data: bytes) -> str:
    """Encode bytes as unpadded base64url."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class PactBrand:
    """A Brand answered by its Provider, at ``{base}/a2a/{brand_id}``.

    Everything a host decides is passed in: ``signer`` (ES256, the Provider's
    key: its delegation tokens and receipts), ``jwks`` (its public keys, what
    the OAuth metadata names; the last one is the key it signs with now),
    ``issuers`` (the registered personal agents), ``store`` and ``agent``; ``verification_uri`` is the page where a person
    signs in at the Brand and enters the code.
    """

    def __init__(
        self,
        *,
        base: str,
        brand_id: str,
        name: str,
        provider: tuple[str, str],
        scopes: Mapping[str, str],
        audience: str,
        signer: Any,
        jwks: Callable[[], Awaitable[Mapping[str, Any]]],
        issuers: IssuerKeys,
        store: BrandStore,
        agent: BrandAgent,
        verification_uri: str,
        description: str = "",
        skills: tuple[Mapping[str, Any], ...] = (),
    ) -> None:
        """Configure the Brand, its Provider, signer, agent and store."""
        if getattr(signer, "algorithm", "") != "ecdsa-p256-sha256":
            raise ValueError(
                "a Brand's tokens and receipts are signed ES256 (a P-256 key)"
            )
        self.base = base.rstrip("/")
        self.brand_id = brand_id
        self.name = name
        self.provider = provider
        self.scopes = dict(scopes)
        self.audience = audience
        self.signer = signer
        self._jwks = jwks
        self.issuers = issuers
        self.store = store
        self.agent = agent
        self.verification_uri = verification_uri
        self.description = description
        self.skills = tuple(skills)

    @property
    def interface_url(self) -> str:
        """The Brand's A2A interface URL."""
        return f"{self.base}/a2a/{self.brand_id}"

    @property
    def oauth(self) -> str:
        """The Brand's OAuth endpoints root."""
        return f"{self.interface_url}/oauth"

    def card(self) -> dict[str, Any]:
        """Return its A2A Agent Card (§2.1, §5.1): the JWT alone, or with the device-code delegation."""
        schemes: dict[str, Any] = {
            "paJwt": {
                "httpAuthSecurityScheme": {"scheme": "Bearer", "bearerFormat": "JWT"}
            }
        }
        requirements: list[dict[str, Any]] = [{"schemes": {"paJwt": {"list": []}}}]
        if self.scopes:
            schemes["userDelegation"] = {
                "oauth2SecurityScheme": {
                    "flows": {
                        "deviceCode": {
                            "deviceAuthorizationUrl": f"{self.oauth}/device_authorization",
                            "tokenUrl": f"{self.oauth}/token",
                            "scopes": dict(self.scopes),
                        }
                    },
                    "oauth2MetadataUrl": f"{self.oauth}/.well-known/oauth-authorization-server",
                }
            }
            requirements.append(
                {"schemes": {"paJwt": {"list": []}, "userDelegation": {"list": []}}}
            )
        card: dict[str, Any] = {
            "name": self.name,
            "supportedInterfaces": [
                {
                    "url": self.interface_url,
                    "protocolBinding": "HTTP+JSON",
                    "protocolVersion": "1.0",
                }
            ],
            "provider": {"organization": self.provider[0], "url": self.provider[1]},
            "version": "0.1.0",
            "capabilities": {
                "streaming": False,
                "pushNotifications": False,
                "extendedAgentCard": False,
            },
            "securitySchemes": schemes,
            "securityRequirements": requirements,
            "defaultInputModes": ["text/plain"],
            "defaultOutputModes": ["text/plain"],
            "skills": [dict(skill) for skill in self.skills],
        }
        if self.description:
            card["description"] = self.description
        return card

    async def _keyid(self) -> str:
        """The key it signs with now: the last of its published keys (a rotation overlaps)."""
        keys = list((await self._jwks()).get("keys") or [])
        if not keys or not keys[-1].get("kid"):
            raise RuntimeError("the Brand publishes no key to sign with")
        return str(keys[-1]["kid"])

    async def _sign(self, header: dict[str, Any], payload: bytes) -> str:
        """Sign a compact JWS over ``header`` and ``payload``."""
        signing_input = (
            _b64url(json.dumps(header, separators=(",", ":")).encode())
            + "."
            + _b64url(payload)
        )
        signature = await self.signer.sign(signing_input.encode())
        return f"{signing_input}.{_b64url(signature)}"

    async def _personal_agent(self, request: Request) -> dict[str, Any] | None:
        """Verify the personal agent's bearer JWT; None when it fails."""
        header = request.headers.get("authorization", "")
        if not header.startswith("Bearer "):
            return None
        token = header[len("Bearer ") :]
        import jwt

        try:
            issuer = jwt.decode(token, options={"verify_signature": False}).get("iss")
        except jwt.PyJWTError:
            return None
        if not isinstance(issuer, str):
            return None
        jwks = await self.issuers.jwks_of(issuer)
        if jwks is None:
            return None
        try:
            return verify_personal_agent_jwt(
                token, issuer=issuer, audience=self.audience, jwks=jwks
            )
        except PermissionError:
            return None

    async def approve(
        self, user_code: str, brand_user: str, scopes: list[str]
    ) -> tuple[str, ...]:
        """The person signed in at the Brand and approved ``scopes`` (maybe fewer than asked):
        what they granted. :class:`KeyError` for a code unknown, used or expired.
        """
        device_code = (await self.store.get("pact_code", user_code) or {}).get(
            "device_code"
        )
        record = await self.store.get("pact_grant", str(device_code or ""))
        if record is None:
            raise KeyError(user_code)
        grant = _Grant.of(record)
        if grant.approved is not None or grant.issued:
            raise KeyError(user_code)
        grant.approved = tuple(scope for scope in grant.scopes if scope in scopes)
        grant.brand_user = brand_user
        await self.store.put(
            "pact_grant", str(device_code), grant.record(), seconds=DEVICE_SECONDS
        )
        return grant.approved

    async def asked(self, user_code: str) -> dict[str, Any]:
        """What a code's sign-in asks, for the page where the person decides: the personal
        agent and each scope with what it lets it do. :class:`KeyError` when unknown or used.
        """
        device_code = (await self.store.get("pact_code", user_code) or {}).get(
            "device_code"
        )
        record = await self.store.get("pact_grant", str(device_code or ""))
        if record is None:
            raise KeyError(user_code)
        grant = _Grant.of(record)
        if grant.approved is not None or grant.issued:
            raise KeyError(user_code)
        return {
            "personal_agent": grant.client_id,
            "scopes": [
                {"id": scope, "description": self.scopes.get(scope, "")}
                for scope in grant.scopes
            ],
        }

    def step_up_uri(self, missing: tuple[str, ...]) -> str:
        """Where the person grants what a turn lacks (§5.5)."""
        joiner = "&" if "?" in self.verification_uri else "?"
        return f"{self.verification_uri}{joiner}scopes={'+'.join(missing)}"

    async def _send(self, request: Request) -> Response:
        """Handle an A2A message: verify the caller, then answer the turn."""
        identity = await self._personal_agent(request)
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
                    jwks=await self._jwks(),
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
        if not isinstance(message.get("messageId"), str) or not message["messageId"]:
            return _a2a_error(400, "INVALID_PARAMS", "a messageId")
        who = [identity["iss"], identity["sub"]]
        context_id = message.get("contextId")
        if context_id:
            owner = await self.store.get("pact_context", str(context_id))
            if owner is None or owner["who"] != who:
                return _a2a_error(400, "INVALID_PARAMS", "Unknown contextId")
            if delegation and owner.get("person") not in (None, delegation["sub"]):
                return _a2a_error(400, "INVALID_PARAMS", "Unknown contextId")
            person = owner.get("person")
        else:
            context_id = str(uuid.uuid4())
            person = None
        if delegation:
            person = delegation["sub"]
        await self.store.put(
            "pact_context",
            context_id,
            {"who": who, "person": person},
            seconds=CONTEXT_SECONDS,
        )
        key = hashlib.sha256(
            f"{context_id}\x1f{message['messageId']}".encode()
        ).hexdigest()
        kept = await self.store.get("pact_reply", key)
        if kept is not None:
            return JSONResponse(kept, media_type="application/a2a+json")
        text = " ".join(part.get("text", "") for part in message["parts"])
        scopes = tuple(delegation["scope"].split()) if delegation else ()
        answer = await self.agent.answer(
            BrandTurn(
                text=text,
                issuer=identity["iss"],
                subject=identity["sub"],
                context_id=context_id,
                person=delegation["sub"] if delegation else None,
                scopes=scopes,
                grant_id=delegation["grant_id"] if delegation else None,
            )
        )
        if answer.missing:
            reply: dict[str, Any] = {
                "task": {
                    "id": f"t-{uuid.uuid4().hex[:8]}",
                    "contextId": context_id,
                    "status": {
                        "state": "TASK_STATE_AUTH_REQUIRED",
                        "message": {
                            "role": "ROLE_AGENT",
                            "parts": [{"text": answer.text}],
                        },
                    },
                    "metadata": {
                        "pact.missingScopes": list(answer.missing),
                        "pact.verificationUriComplete": self.step_up_uri(
                            answer.missing
                        ),
                    },
                }
            }
            return JSONResponse(reply, media_type="application/a2a+json")
        out: dict[str, Any] = {
            "messageId": f"r-{uuid.uuid4().hex[:8]}",
            "contextId": context_id,
            "role": "ROLE_AGENT",
            "parts": [{"text": answer.text}],
        }
        if delegation:
            claims = {
                "grantId": delegation["grant_id"],
                "user": delegation["sub"],
                "pa": identity["iss"],
                "brand": self.interface_url,
                "scopesUsed": list(answer.scopes_used),
                "actions": [dict(action) for action in answer.actions],
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            jws = await self._sign(
                {"alg": "ES256", "kid": await self._keyid()},
                json.dumps(claims, separators=(",", ":")).encode(),
            )
            out["metadata"] = {"pact.receipt": {"jws": jws, "claims": claims}}
        reply = {"message": out}
        await self.store.put("pact_reply", key, reply, seconds=CONTEXT_SECONDS)
        return JSONResponse(reply, media_type="application/a2a+json")

    async def _device_authorization(self, request: Request) -> Response:
        """Start a device grant for the calling personal agent."""
        identity = await self._personal_agent(request)
        if identity is None:
            return _unauthorized()
        form = await request.form()
        if form.get("client_id") != identity["iss"]:
            return JSONResponse({"error": "invalid_client"}, status_code=400)
        scopes = tuple(str(form.get("scope", "")).split())
        if not scopes or any(scope not in self.scopes for scope in scopes):
            return JSONResponse({"error": "invalid_scope"}, status_code=400)
        device_code = f"dc_{secrets.token_urlsafe(16)}"
        user_code = f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
        await self.store.put(
            "pact_grant",
            device_code,
            _Grant(
                user_code=user_code, client_id=identity["iss"], scopes=scopes
            ).record(),
            seconds=DEVICE_SECONDS,
        )
        await self.store.put(
            "pact_code", user_code, {"device_code": device_code}, seconds=DEVICE_SECONDS
        )
        joiner = "&" if "?" in self.verification_uri else "?"
        return JSONResponse(
            {
                "device_code": device_code,
                "user_code": user_code,
                "verification_uri": self.verification_uri,
                "verification_uri_complete": f"{self.verification_uri}{joiner}user_code={user_code}",
                "expires_in": DEVICE_SECONDS,
                "interval": 1,
            }
        )

    async def _token(self, request: Request) -> Response:
        """Exchange an approved device code for a delegation token."""
        identity = await self._personal_agent(request)
        if identity is None:
            return _unauthorized()
        form = await request.form()
        device_code = str(form.get("device_code"))
        record = await self.store.get("pact_grant", device_code)
        grant = None if record is None else _Grant.of(record)
        if grant is None or grant.client_id != identity["iss"] or grant.issued:
            return JSONResponse({"error": "expired_token"}, status_code=400)
        if grant.approved is None:
            return JSONResponse({"error": "authorization_pending"}, status_code=400)
        if not grant.approved:
            return JSONResponse({"error": "access_denied"}, status_code=400)
        grant.issued = True
        await self.store.put(
            "pact_grant", device_code, grant.record(), seconds=DEVICE_SECONDS
        )
        now = int(time.time())
        token = await self._sign(
            {"alg": "ES256", "kid": await self._keyid(), "typ": "JWT"},
            json.dumps(
                {
                    "iss": self.oauth,
                    "aud": self.interface_url,
                    "sub": grant.brand_user,
                    "client_id": grant.client_id,
                    "scope": " ".join(grant.approved),
                    "grant_id": f"a2agrant_{uuid.uuid4().hex[:10]}",
                    "iat": now,
                    "exp": now + TOKEN_SECONDS,
                },
                separators=(",", ":"),
            ).encode(),
        )
        return JSONResponse(
            {
                "token_type": "Bearer",
                "access_token": token,
                "expires_in": TOKEN_SECONDS,
                "scope": " ".join(grant.approved),
            }
        )

    def metadata(self) -> dict[str, Any]:
        """Return its RFC 8414 authorization server metadata."""
        return {
            "issuer": self.oauth,
            "device_authorization_endpoint": f"{self.oauth}/device_authorization",
            "token_endpoint": f"{self.oauth}/token",
            "jwks_uri": f"{self.oauth}/jwks.json",
            "grant_types_supported": ["urn:ietf:params:oauth:grant-type:device_code"],
            "scopes_supported": list(self.scopes),
        }

    def app(self) -> Starlette:
        """Return the Starlette app serving the Brand's routes."""

        async def card(request: Request) -> Response:
            """Serve the Agent Card."""
            return JSONResponse(self.card())

        async def metadata(request: Request) -> Response:
            """Serve the OAuth authorization server metadata."""
            return JSONResponse(self.metadata())

        async def jwks(request: Request) -> Response:
            """Serve the Brand's public keys."""
            return JSONResponse(dict(await self._jwks()))

        root = f"/a2a/{self.brand_id}"
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


# --- Example Air: one Brand, in memory ----------------------------------------------


class _ExampleAirAgent:
    """Example Air's agent: bookings read and changed, as the person allowed."""

    async def answer(self, turn: BrandTurn) -> BrandAnswer:
        """Answer from the example airline's canned bookings."""
        lowered = turn.text.lower()
        if "change" in lowered:
            if "bookings:change" not in turn.scopes:
                return BrandAnswer(
                    "I need permission to change a booking.",
                    missing=("bookings:change",),
                )
            return BrandAnswer(
                "Booking AB123 now flies on 2026-11-09.",
                scopes_used=("bookings:read", "bookings:change"),
                actions=(
                    {"tool": "lookup_booking"},
                    {"tool": "change_booking", "argsHash": "sha256:9f"},
                ),
            )
        if "booking" in lowered and "bookings:read" in turn.scopes:
            return BrandAnswer(
                "Your booking AB123 flies on 2026-11-02.",
                scopes_used=("bookings:read",),
                actions=({"tool": "lookup_booking"},),
            )
        return BrandAnswer("Happy to help. What is your booking reference?")


class ExampleAir(PactBrand):
    """*Example Air*: a Provider with one Brand, everything in memory (tests and examples)."""

    def __init__(
        self,
        base: str = "https://provider.example",
        audience: str = "https://provider.example/a2a",
    ) -> None:
        """Make the example Brand with a fresh EC signing key."""
        from cryptography.hazmat.primitives.asymmetric import ec

        from ..web_bot_auth.keys import LocalSigner

        signer = LocalSigner(ec.generate_private_key(ec.SECP256R1()))
        self.public_jwk = {**signer.public_jwk, "alg": "ES256", "use": "sig"}
        self._registered = RegisteredIssuers()
        self._memory = InMemoryBrandStore()

        async def jwks() -> Mapping[str, Any]:
            """Return the example Brand's public key set."""
            return {"keys": [self.public_jwk]}

        super().__init__(
            base=base,
            brand_id=BRAND_ID,
            name="Example Air Support",
            provider=("Example Provider", base.rstrip("/")),
            scopes=SCOPES,
            audience=audience,
            signer=signer,
            jwks=jwks,
            issuers=self._registered,
            store=self._memory,
            agent=_ExampleAirAgent(),
            verification_uri="https://air.example/login?return_to=consent",
            skills=(
                {
                    "id": "bookings",
                    "name": "Bookings",
                    "description": "Bookings and changes.",
                    "tags": ["bookings"],
                },
            ),
        )

    @property
    def agents(self) -> dict[str, Mapping[str, Any]]:
        """Registered personal agents: issuer → JWKS (§3.1)."""
        return self._registered.agents

    @property
    def grants(self) -> dict[str, _Grant]:
        """The device grants, by device code (read only)."""
        return {
            key: _Grant.of(value)
            for (kind, key), value in self._memory.records.items()
            if kind == "pact_grant"
        }

    def register(self, issuer: str, jwks: dict[str, Any]) -> None:
        """Accept a personal agent issuer and its keys."""
        self._registered.agents[issuer] = jwks

    def approve(self, user_code: str, brand_user: str, scopes: list[str]) -> None:  # type: ignore[override]
        """The person signed in at the Brand and approved ``scopes`` (maybe fewer than asked).

        :class:`StopIteration` for a code it never gave.
        """
        found = self._memory.records.get(("pact_code", user_code))
        if found is None:
            raise StopIteration(user_code)
        key = ("pact_grant", found["device_code"])
        grant = _Grant.of(self._memory.records[key])
        grant.approved = tuple(scope for scope in grant.scopes if scope in scopes)
        grant.brand_user = brand_user
        self._memory.records[key] = grant.record()

    def step_up_uri(self, missing: tuple[str, ...]) -> str:
        """Return the example sign-in URL asking for ``missing``."""
        return f"https://air.example/login?scopes={'+'.join(missing)}"


__all__ = [
    "BRAND_ID",
    "BrandAgent",
    "BrandAnswer",
    "BrandStore",
    "BrandTurn",
    "ExampleAir",
    "InMemoryBrandStore",
    "IssuerKeys",
    "PactBrand",
    "RegisteredIssuers",
    "SCOPES",
]

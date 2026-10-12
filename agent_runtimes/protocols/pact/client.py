# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A PACT 1.0 personal agent (AGENT_PROTOCOLS PR-11 to PR-13, personal-agent side).

Talks to a Brand's agent over A2A 1.0 HTTP+JSON (§2, §4): every request but
the card carries a fresh personal-agent JWT signed by the host's key (§3),
the conversation goes on in its ``contextId``, a retry reuses its
``messageId``. With the *Delegated* profile (§5), it asks the person to sign
in at the Brand with RFC 8628's device code — it shows the Brand's own link,
never a login of its own — reads back what the person actually approved
(``scope`` may be less than asked), sends the delegation token in
``X-A2A-User-Delegation``, meets a step-up (``TASK_STATE_AUTH_REQUIRED``)
with the missing scopes, and verifies every signed receipt before keeping it.

The delegation token is the host's: kept in the ``pact.delegationStore`` by
an opaque reference, never returned to the agent or the model.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, Protocol, runtime_checkable

import httpx

from .card import PactCard, read_card
from .tokens import sign_personal_agent_jwt, verify_receipt

#: The version of PACT implemented.
PACT_VERSION = "1.0"
A2A_VERSION = "1.0"
DELEGATION_HEADER = "X-A2A-User-Delegation"
DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"


class PactError(RuntimeError):
    """A Brand refused, or a rule of the protocol was not met."""


@runtime_checkable
class DelegationStore(Protocol):
    """Holds delegation tokens by (Brand, user) (``pact.delegationStore``)."""

    async def put(
        self, brand: str, user: str, token: str, scopes: tuple[str, ...]
    ) -> None: ...

    async def get(
        self, brand: str, user: str
    ) -> Optional[tuple[str, tuple[str, ...]]]: ...

    async def delete(self, brand: str, user: str) -> None: ...


class InMemoryDelegationStore:
    """Delegation tokens within one process: tests and examples."""

    def __init__(self) -> None:
        self._held: dict[tuple[str, str], tuple[str, tuple[str, ...]]] = {}

    async def put(
        self, brand: str, user: str, token: str, scopes: tuple[str, ...]
    ) -> None:
        self._held[(brand, user)] = (token, scopes)

    async def get(self, brand: str, user: str) -> Optional[tuple[str, tuple[str, ...]]]:
        return self._held.get((brand, user))

    async def delete(self, brand: str, user: str) -> None:
        self._held.pop((brand, user), None)


@runtime_checkable
class ReceiptStore(Protocol):
    """Keeps the receipts a Brand signed (``pact.receiptStore``): the record (R-07)."""

    async def keep(self, brand: str, user: str, claims: Mapping[str, Any]) -> None: ...


class InMemoryReceiptStore:
    def __init__(self) -> None:
        self.receipts: list[tuple[str, str, dict[str, Any]]] = []

    async def keep(self, brand: str, user: str, claims: Mapping[str, Any]) -> None:
        self.receipts.append((brand, user, dict(claims)))


@dataclass(frozen=True)
class Reply:
    """The Brand's answer: its words, the conversation, and what it used of the grant."""

    text: str
    context_id: str
    scopes_used: tuple[str, ...] = ()
    actions: tuple[str, ...] = ()


@dataclass(frozen=True)
class StepUp:
    """The Brand needs more permission (§5.5): the missing scopes and where to grant them."""

    text: str
    context_id: str
    missing: tuple[str, ...]
    verification_uri: str


@dataclass(frozen=True)
class SignIn:
    """What the person is shown to sign in at the Brand (RFC 8628): never the device code."""

    verification_uri: str
    user_code: str
    expires_in: int
    #: Held for the polling; not for the person, the agent or the model.
    reference: str = field(repr=False, default="")


@dataclass
class PactPersonalAgent:
    """A personal agent at one Brand, for the users it acts for."""

    card_url: str
    issuer: str
    audience: str
    signer: Any
    delegations: DelegationStore
    receipts: ReceiptStore
    http: httpx.AsyncClient = field(
        default_factory=lambda: httpx.AsyncClient(timeout=15.0)
    )
    card: Optional[PactCard] = None
    _pending: dict[str, str] = field(default_factory=dict, repr=False)
    _metadata: Optional[dict[str, Any]] = field(default=None, repr=False)

    async def discover(self) -> PactCard:
        """Read the Brand's card (no token)."""
        answer = await self.http.get(self.card_url)
        if answer.status_code == 404:
            raise PactError("the Brand is unknown to its Provider")
        if answer.status_code != 200:
            raise PactError(f"the card answered {answer.status_code}")
        self.card = read_card(answer.json())
        return self.card

    async def _card(self) -> PactCard:
        return self.card or await self.discover()

    async def _jwt(self, user: str) -> str:
        return await sign_personal_agent_jwt(
            self.signer, issuer=self.issuer, subject=user, audience=self.audience
        )

    async def send(
        self,
        user: str,
        text: str,
        *,
        context_id: Optional[str] = None,
        message_id: Optional[str] = None,
    ) -> Reply | StepUp:
        """One message for ``user`` (an opaque, stable id), with their delegation when held."""
        card = await self._card()
        headers = {
            "Authorization": f"Bearer {await self._jwt(user)}",
            "A2A-Version": A2A_VERSION,
            "Content-Type": "application/json",
        }
        held = await self.delegations.get(card.interface_url, user)
        if held:
            headers[DELEGATION_HEADER] = f"Bearer {held[0]}"
        message: dict[str, Any] = {
            "messageId": message_id or str(uuid.uuid4()),
            "role": "ROLE_USER",
            "parts": [{"text": text}],
        }
        if context_id:
            message["contextId"] = context_id
        answer = await self.http.post(
            f"{card.interface_url}/message:send",
            headers=headers,
            json={"message": message},
        )
        if answer.status_code == 401:
            raise PactError(
                "the Brand refused the personal agent's identity or its delegation"
            )
        if answer.status_code == 429:
            raise PactError(
                f"rate limited: retry after {answer.headers.get('retry-after', '?')}s"
            )
        body = answer.json()
        if "error" in body:
            reason = (
                body["error"]
                .get("details", [{}])[0]
                .get("reason", body["error"].get("status"))
            )
            raise PactError(f"{reason}: {body['error'].get('message', '')}")
        if "task" in body:
            task = body["task"]
            meta = task.get("metadata") or {}
            if task["status"]["state"] != "TASK_STATE_AUTH_REQUIRED":
                raise PactError(f"unexpected task state {task['status']['state']}")
            return StepUp(
                text=" ".join(
                    p.get("text", "")
                    for p in task["status"].get("message", {}).get("parts", [])
                ),
                context_id=task["contextId"],
                missing=tuple(meta.get("pact.missingScopes") or ()),
                verification_uri=str(meta.get("pact.verificationUriComplete", "")),
            )
        reply = body["message"]
        claims: Mapping[str, Any] = {}
        receipt = (reply.get("metadata") or {}).get("pact.receipt")
        if held:
            if receipt is None:
                raise PactError("a reply under delegation carries no receipt")
            claims = verify_receipt(receipt, jwks=await self._jwks())
            await self.receipts.keep(card.interface_url, user, claims)
        return Reply(
            text=" ".join(part.get("text", "") for part in reply.get("parts", [])),
            context_id=reply["contextId"],
            scopes_used=tuple(claims.get("scopesUsed") or ()),
            actions=tuple(
                action.get("tool", "") for action in claims.get("actions") or ()
            ),
        )

    async def _jwks(self) -> dict[str, Any]:
        card = await self._card()
        if card.delegation is None:
            raise PactError("the Brand offers no delegation")
        if self._metadata is None:
            metadata = (await self.http.get(card.delegation.metadata_url)).json()
            self._metadata = {
                "jwks": (await self.http.get(metadata["jwks_uri"])).json()
            }
        return self._metadata["jwks"]

    async def request_sign_in(self, user: str, scopes: list[str]) -> SignIn:
        """Ask for ``scopes`` (ids on the card only); the person signs in at the Brand's link."""
        card = await self._card()
        if card.delegation is None:
            raise PactError("the Brand offers no delegation")
        offered = {scope.id for scope in card.delegation.scopes}
        unknown = [scope for scope in scopes if scope not in offered]
        if unknown:
            raise PactError(f"not on the card: {', '.join(unknown)}")
        answer = await self.http.post(
            card.delegation.device_authorization_url,
            headers={"Authorization": f"Bearer {await self._jwt(user)}"},
            data={"client_id": self.issuer, "scope": " ".join(scopes)},
        )
        if answer.status_code != 200:
            raise PactError(f"device authorization answered {answer.status_code}")
        body = answer.json()
        reference = str(uuid.uuid4())
        self._pending[reference] = body["device_code"]
        return SignIn(
            verification_uri=body.get("verification_uri_complete")
            or body["verification_uri"],
            user_code=body["user_code"],
            expires_in=int(body["expires_in"]),
            reference=reference,
        )

    async def poll_sign_in(
        self, user: str, sign_in: SignIn
    ) -> Optional[tuple[str, ...]]:
        """Ask once whether the person approved (RFC 8628): the scopes they granted,
        or ``None`` while they have not (``authorization_pending``, ``slow_down``)."""
        card = await self._card()
        assert card.delegation is not None
        device_code = self._pending.get(sign_in.reference)
        if device_code is None:
            raise PactError("no sign-in pending under this reference")
        answer = await self.http.post(
            card.delegation.token_url,
            headers={"Authorization": f"Bearer {await self._jwt(user)}"},
            data={
                "grant_type": DEVICE_CODE_GRANT,
                "device_code": device_code,
                "client_id": self.issuer,
            },
        )
        body = answer.json()
        error = body.get("error")
        if error in ("authorization_pending", "slow_down"):
            return None
        if error:
            self._pending.pop(sign_in.reference, None)
            raise PactError(f"the sign-in ended: {error}")
        granted = tuple(str(body.get("scope", "")).split())
        await self.delegations.put(
            card.interface_url, user, body["access_token"], granted
        )
        self._pending.pop(sign_in.reference, None)
        return granted

    async def finish_sign_in(
        self, user: str, sign_in: SignIn, *, interval: float = 5.0, attempts: int = 120
    ) -> tuple[str, ...]:
        """Poll until the person approved (RFC 8628); the scopes they actually granted."""
        for _ in range(attempts):
            granted = await self.poll_sign_in(user, sign_in)
            if granted is not None:
                return granted
            await asyncio.sleep(interval)
        raise PactError("the person did not sign in in time")

    async def disconnect(self, user: str) -> None:
        """Forget the person's delegation at this Brand."""
        card = await self._card()
        await self.delegations.delete(card.interface_url, user)


__all__ = [
    "A2A_VERSION",
    "DELEGATION_HEADER",
    "DelegationStore",
    "InMemoryDelegationStore",
    "InMemoryReceiptStore",
    "PACT_VERSION",
    "PactError",
    "PactPersonalAgent",
    "ReceiptStore",
    "Reply",
    "SignIn",
    "StepUp",
]

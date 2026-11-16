# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who may call an agent at its addresses: its "Who may open it".

The same rule for its agent, MCP, API and web hosts:

- **public** — anyone, anonymous, under the deployment's spend limit and a
  per-caller rate cap (by address, as the visitors' cap is), or by account when
  the caller says who they are;
- **private** — a Datalayer API key (``X-API-Key``), or a bearer token
  (a Datalayer token, the PAP delegated token of a person, or the access token
  of a browser signed in with Datalayer, kept in its cookie), of the owner or
  of a person the owner allowed; nobody else.

What a key or a token says is asked of whoever can tell (:class:`KeyChecker`,
:class:`TokenChecker`): IAM for a Datalayer key or token, the company service
for a PAP token. The policy is the deployment's, read from ai-agents
(:func:`read_policy`), or the configuration's for a local run
(:func:`policy_from_environment`).
"""

from __future__ import annotations

import os
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Deque, Dict, Literal, Mapping, Optional

from agent_runtimes.addresses.operations import OperationError

#: Says whose a Datalayer API key is: its account's uid, or ``None``.
KeyChecker = Callable[[str], Awaitable[Optional[str]]]
#: Says whose a bearer token is: its account's uid, or ``None``.
TokenChecker = Callable[[str], Awaitable[Optional[str]]]

#: How many calls a caller makes in a minute at most, unless configured.
DEFAULT_RATE_PER_MINUTE = 30

Visibility = Literal["public", "private"]


@dataclass(frozen=True)
class AddressPolicy:
    """Who may call an agent at its addresses."""

    visibility: Visibility
    #: The owner's uid: always admitted.
    owner_uid: str = ""
    #: The uids of the people the owner allowed (private).
    allowed: frozenset[str] = field(default_factory=frozenset)
    #: Calls per caller per minute.
    rate_per_minute: int = DEFAULT_RATE_PER_MINUTE

    def __post_init__(self) -> None:
        if self.visibility not in ("public", "private"):
            raise ValueError(
                f"{self.visibility!r} is not who may open it: public or private"
            )
        if self.rate_per_minute < 1:
            raise ValueError("a rate cap admits at least one call a minute")

    def admits(self, uid: str) -> bool:
        """Whether the account ``uid`` may call."""
        if self.visibility == "public":
            return True
        return bool(uid) and (uid == self.owner_uid or uid in self.allowed)


@dataclass(frozen=True)
class Caller:
    """Who called, as the access check found."""

    kind: Literal["anonymous", "api_key", "token"]
    #: The account's uid; empty for anonymous.
    uid: str = ""
    #: The caller's address, as the request came.
    address: str = ""

    @property
    def rate_key(self) -> str:
        """What the rate cap counts by: the account, else the address."""
        return f"uid:{self.uid}" if self.uid else f"address:{self.address}"


class RateCap:
    """At most ``per_minute`` calls a minute per caller, in this process."""

    def __init__(
        self, per_minute: int, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.per_minute = per_minute
        self.clock = clock
        self._calls: Dict[str, Deque[float]] = {}

    def take(self, key: str) -> int:
        """Count a call; ``0`` when admitted, else the seconds to wait."""
        now = self.clock()
        calls = self._calls.setdefault(key, deque())
        while calls and now - calls[0] >= 60.0:
            calls.popleft()
        if len(calls) >= self.per_minute:
            return max(1, int(60.0 - (now - calls[0])) + 1)
        calls.append(now)
        return 0


def _header(headers: Mapping[str, str], name: str) -> str:
    for key, value in headers.items():
        if key.lower() == name.lower():
            return str(value or "").strip()
    return ""


def client_address(headers: Mapping[str, str], peer: str) -> str:
    """The caller's address: the first ``X-Forwarded-For`` hop the ingress wrote, else the peer."""
    forwarded = _header(headers, "x-forwarded-for")
    return forwarded.split(",")[0].strip() if forwarded else peer


class AddressAccess:
    """The access check of one agent's addresses (one per process, shared by its servers)."""

    def __init__(
        self,
        policy: AddressPolicy,
        *,
        key_checker: Optional[KeyChecker] = None,
        token_checker: Optional[TokenChecker] = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.policy = policy
        self.key_checker = key_checker
        self.token_checker = token_checker
        self.rate = RateCap(policy.rate_per_minute, clock)

    async def _who(self, headers: Mapping[str, str]) -> tuple[str, str]:
        """``(kind, uid)`` from the request's credential; ``("anonymous", "")`` without one."""
        key = _header(headers, "x-api-key")
        if key:
            if self.key_checker is None:
                raise OperationError(
                    401, "API keys are not checked here: call with a token."
                )
            uid = await self.key_checker(key)
            if not uid:
                raise OperationError(401, "This API key is not one Datalayer knows.")
            return "api_key", uid
        authorization = _header(headers, "authorization")
        if not authorization.lower().startswith("bearer "):
            # A browser signed in to the agent's page with Datalayer (`browser_sign_in`).
            from agent_runtimes.addresses.browser_sign_in import cookie_of

            signed_in = cookie_of({k.lower(): v for k, v in headers.items()})
            if signed_in:
                authorization = f"Bearer {signed_in}"
        if authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
            if self.token_checker is None:
                raise OperationError(
                    401, "Tokens are not checked here: call with an API key."
                )
            uid = await self.token_checker(token)
            if not uid:
                raise OperationError(401, "This token is not valid here.")
            return "token", uid
        return "anonymous", ""

    async def admit(self, headers: Mapping[str, str], peer: str = "") -> Caller:
        """The caller, admitted and counted; :class:`OperationError` 401, 403 or 429 otherwise."""
        caller = await self.identify(headers, peer)
        self.count(caller)
        return caller

    def count(self, caller: Caller) -> None:
        """Count one call of ``caller``; :class:`OperationError` 429 past its rate cap."""
        wait = self.rate.take(caller.rate_key)
        if wait:
            raise OperationError(429, f"Too many calls: try again in {wait} seconds.")

    async def identify(self, headers: Mapping[str, str], peer: str = "") -> Caller:
        """The caller, when they may call at all (not counted); 401 or 403 otherwise."""
        kind, uid = await self._who(headers)
        caller = Caller(kind=kind, uid=uid, address=client_address(headers, peer))  # type: ignore[arg-type]
        if self.policy.visibility == "private":
            if not uid:
                raise OperationError(
                    401,
                    "Only the people its owner allowed may call it: "
                    "call with your Datalayer API key (X-API-Key) or token.",
                )
            if not self.policy.admits(uid):
                raise OperationError(403, "Its owner has not allowed you to call it.")
        return caller


# --- the policy and its checkers, from the configuration ----------------------------


#: The local configuration of who may call (a run of `agent-runtimes serve --mode`).
VISIBILITY_VARIABLE = "AGENT_RUNTIMES_ADDRESS_VISIBILITY"
OWNER_VARIABLE = "AGENT_RUNTIMES_ADDRESS_OWNER"
ALLOWED_VARIABLE = "AGENT_RUNTIMES_ADDRESS_ALLOWED"
RATE_VARIABLE = "AGENT_RUNTIMES_ADDRESS_RATE_PER_MINUTE"


def policy_from_environment(default: Visibility = "private") -> AddressPolicy:
    """Who may call, as the environment says: private to its owner unless said public."""
    visibility = (os.environ.get(VISIBILITY_VARIABLE) or default).strip().lower()
    allowed = frozenset(
        uid.strip()
        for uid in (os.environ.get(ALLOWED_VARIABLE) or "").split(",")
        if uid.strip()
    )
    rate = int(os.environ.get(RATE_VARIABLE) or DEFAULT_RATE_PER_MINUTE)
    return AddressPolicy(
        visibility=visibility,  # type: ignore[arg-type]
        owner_uid=(os.environ.get(OWNER_VARIABLE) or "").strip(),
        allowed=allowed,
        rate_per_minute=rate,
    )


def policy_of_deployment(
    deployment: Mapping[str, Any], rate_per_minute: int = DEFAULT_RATE_PER_MINUTE
) -> AddressPolicy:
    """Who may call, from ai-agents' record of the deployment
    (``GET /apps/internal/addresses/{slug}``'s ``deployment``)."""
    return AddressPolicy(
        visibility=str(deployment["visibility"]),  # type: ignore[arg-type]
        owner_uid=str((deployment.get("owner") or {}).get("uid") or ""),
        allowed=frozenset(
            str(person.get("uid"))
            for person in deployment.get("allowed") or ()
            if person.get("uid")
        ),
        rate_per_minute=rate_per_minute,
    )


class AddressRecordUnread(RuntimeError):
    """ai-agents did not say the deployment's record."""


async def read_deployment_record(slug: str) -> dict[str, Any]:
    """The record of the deployment this runtime was launched for, at ``slug``, from
    ai-agents (``GET /api/ai-agents/v1/apps/internal/addresses/{slug}``), asked with
    this runtime's proof."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.apps.principal import _asked_with_proof, launched_for

    deployment_uid = launched_for()
    if not deployment_uid:
        raise AddressRecordUnread(
            "This runtime was launched for no deployment: who may call it is the configuration's."
        )
    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise AddressRecordUnread(
            "No ai-agents is configured: who may call it is not known."
        )
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await _asked_with_proof(
            deployment_uid,
            url,
            lambda proved: client.get(
                f"{url.rstrip('/')}/api/ai-agents/v1/apps/internal/addresses/{slug}",
                headers=proved,
            ),
        )
    if response.status_code != 200:
        raise AddressRecordUnread(
            f"ai-agents did not say who may call {slug} ({response.status_code})."
        )
    deployment = (response.json() or {}).get("deployment")
    if not isinstance(deployment, dict) or deployment.get("uid") != deployment_uid:
        raise AddressRecordUnread(
            f"ai-agents said another deployment's record for {slug}."
        )
    return deployment


def iam_key_checker(iam_url: str) -> KeyChecker:
    """Whose a Datalayer API key is, asked of IAM (``GET /api/iam/v1/whoami``): a
    Datalayer API key is a token IAM reads as a bearer, whatever header it came in."""

    async def check(key: str) -> Optional[str]:
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{iam_url.rstrip('/')}/api/iam/v1/whoami",
                headers={"Authorization": f"Bearer {key}"},
            )
        if response.status_code != 200:
            return None
        return (
            str(((response.json() or {}).get("profile") or {}).get("uid") or "") or None
        )

    return check


def iam_token_checker(iam_url: str) -> TokenChecker:
    """Whose a Datalayer token is, asked of IAM (``GET /api/iam/v1/whoami``)."""

    async def check(token: str) -> Optional[str]:
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{iam_url.rstrip('/')}/api/iam/v1/whoami",
                headers={"Authorization": f"Bearer {token}"},
            )
        if response.status_code != 200:
            return None
        return (
            str(((response.json() or {}).get("profile") or {}).get("uid") or "") or None
        )

    return check


def either_token(*checkers: TokenChecker) -> TokenChecker:
    """A token checker answering the first account any of ``checkers`` says."""

    async def check(token: str) -> Optional[str]:
        for checker in checkers:
            uid = await checker(token)
            if uid:
                return uid
        return None

    return check


__all__ = [
    "AddressAccess",
    "AddressPolicy",
    "AddressRecordUnread",
    "Caller",
    "KeyChecker",
    "RateCap",
    "TokenChecker",
    "client_address",
    "either_token",
    "iam_key_checker",
    "iam_token_checker",
    "policy_from_environment",
    "policy_of_deployment",
    "read_deployment_record",
]

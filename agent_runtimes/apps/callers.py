# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who is calling an application's routes.

A runtime's routes carried no authentication of their own: access rested on
the address. An application's route now verifies the caller before anything
else — a person's token, an embed token for that application, or nothing for
a public one — and answers only the origins its deployment allows.

Verified **by asking the platform**, never locally: the platform's tokens are
signed with one shared secret, and a runtime runs an agent's code, so it is
never given that secret. A person's token is what IAM's ``whoami`` accepts; an
embed token is what Spacer accepts for the application it names. A verified
token is remembered until it expires, for five minutes at most, so that a
conversation costs one call and a revoked token stops within minutes.

A visitor without an account holds a token ai-inference minted for them,
naming the visitor and the one application it is for: it is what
ai-inference's ``/anonymous/whoami`` accepts, and only the visitors' runtime
answers it (`agent_runtimes.apps.visitors`), which in turn
answers nobody signed in.

A host — Datalayer's Slack app, an editor, a desktop app — holds no person's
token: it exchanged its installation's key and a linked user for a **host
token** naming that person and one deployment. It is
what ai-agents' ``/apps/hosts/whoami`` accepts, which checks that the
installation, the link and the deployment's allowance still stand; it is
remembered for a minute at most, so that a revocation stops it within one.
A host token ai-agents answers ``visitor: true`` is a person who never linked,
answered because the installation's owner opened it to visitors:
a ``visitor`` caller, named by its pseudonymous id, for its one
deployment (see :func:`is_host_visitor`).

An address is no proof of anybody (decided 26 November 2026: on a person's
own machine a page in their browser reaches the loopback too). The runtime's
own routes take a token from the machine itself as from anywhere else
(:func:`proves_the_runtime`), but for the few a skill's script calls from the
sandbox, which holds none. Every call that cannot be verified is refused: a
runtime that does not know where IAM is refuses, rather than lets through.
"""

from __future__ import annotations

import hashlib
import ipaddress
import os
import re
import secrets
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Mapping, Optional, Tuple

import httpx
import jwt
from starlette.requests import Request

#: The audience of an app embed token (`datalayer_common.authn.app_embed`).
APP_EMBED_AUDIENCE = "datalayer:app:embed"

#: What an embed token names when it runs a session of its application.
SESSION_SCOPE = "session"

#: The audience of a host token (`datalayer_common.authn.app_host`).
APP_HOST_AUDIENCE = "datalayer:app:host"

#: The longest a verified host token is trusted without asking again: a
#: revoked link or installation stops it within this.
HOST_CACHE_SECONDS = 60.0

#: The longest a verified token is trusted without asking again.
CACHE_SECONDS = 300.0

#: The most verified tokens remembered at once; the oldest goes first.
CACHE_SIZE = 1024

#: How long the platform is waited for.
TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class Caller:
    """Who called: a person, an embed of one application, a visitor, or the machine itself.

    A visitor's ``app_uid`` is what their token is for: an example's id, or
    ``at:<slug>`` for an application at its address.
    """

    kind: str  # "person" | "principal" | "embed" | "visitor" | "host" | "local"
    uid: str = ""
    app_uid: str = ""
    #: For an embed: the visit its token was issued for — the host's, kept
    #: across the tokens it renews, else the token's own id — so that one
    #: visitor of the host's page never reaches another's session.
    visit: str = ""
    #: For an embed: what its token names it may do — `read`, `decide`,
    #: `session` — and nothing else.
    scopes: Tuple[str, ...] = ()
    #: For a host: the one deployment its token was issued for; its
    #: installation is its ``visit``.
    deployment_uid: str = ""
    #: For a person: their name, as their verified token's profile says it
    #: (`person_name`); ``""`` when it says none — never their uid.
    name: str = ""
    #: For a visitor: the catalogue Battle their token is played for, as
    #: ai-inference says it; ``""`` for none.
    battle: str = ""
    #: For a visitor: whether ai-inference exempts them from the turns a
    #: visitor has in a day. It is decided where the token is minted, from the
    #: address the visitor asked from and the allowlist the platform's admins
    #: and the deployment set, and said back by ``/anonymous/whoami``; the
    #: runtime, which sees only Traefik, never sees that address.
    turns_unlimited: bool = False


LOCAL = Caller(kind="local")


def is_host_visitor(caller: Any) -> bool:
    """Whether a caller is a host's visitor: a ``visitor``
    whose host token names one deployment. Unlike a visitor of the visitors'
    runtime, whose own token calls the models, the deployment's principal
    acts for them; like one, their turn only reads and asks nobody.
    """
    return getattr(caller, "kind", "") == "visitor" and bool(
        getattr(caller, "deployment_uid", "")
    )


class CallerRefused(Exception):
    """A call that is not let through: its status and its reason, in a sentence."""

    def __init__(self, status: int, reason: str):
        self.status = status
        self.reason = reason
        super().__init__(reason)


def is_loopback(host: Optional[str]) -> bool:
    """Whether a client address is the machine itself."""
    if not host:
        return False
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


#: The header the pod's companion is told by, on a runtime launched for a deployment.
POD_SECRET_HEADER = "X-Datalayer-Pod-Secret"


def is_the_pod(host: Optional[str], secret: Optional[str]) -> bool:
    """Whether a call comes from the pod itself.

    On a runtime launched for a deployment an address proves nothing: its
    sandbox, and a harness in this container, share the pod's loopback. There
    the pod is the companion, known by the secret it gave with the runtime's
    proof (`principal.give_runtime_proof`), held by these two alone. On any
    other runtime nothing here acts as anybody but the person whose it is, and
    loopback is the machine itself.

    Parameters
    ----------
    host : str | None
        The client's address.
    secret : str | None
        What the call says in :data:`POD_SECRET_HEADER`.
    """
    from agent_runtimes.apps.principal import pod_secret_is

    return is_loopback(host) and pod_secret_is(secret)


def bearer_of(authorization: Optional[str]) -> str:
    """The token of an ``Authorization: Bearer …`` header, or nothing.

    The placeholder a runtime without credentials sends in place of one
    (`egress_principal.PLACEHOLDER`) is nobody's token: a caller that presents
    it presents nothing, so it is never passed on as theirs to an address
    where a credential is put in.
    """
    if not authorization:
        return ""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    from agent_runtimes.apps.egress_principal import is_placeholder

    return "" if is_placeholder(token) else token.strip()


def _unverified_claims(token: str) -> Dict[str, Any]:
    """What a token says, read without checking it: only to choose who checks it."""
    try:
        claims = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        return {}
    return claims if isinstance(claims, dict) else {}


def is_host_token(claims: Dict[str, Any]) -> bool:
    audience = claims.get("aud")
    return audience == APP_HOST_AUDIENCE or (
        isinstance(audience, list) and APP_HOST_AUDIENCE in audience
    )


def is_embed_token(claims: Dict[str, Any]) -> bool:
    audience = claims.get("aud")
    return audience == APP_EMBED_AUDIENCE or (
        isinstance(audience, list) and APP_EMBED_AUDIENCE in audience
    )


def person_name(claims: Dict[str, Any]) -> str:
    """A person's name, as the profile their token carries says it (``user``:
    ``firstName``, ``lastName``); ``""`` when it says none.

    Read once IAM accepted the token: its claims are then IAM's own. What
    signs for a person names them by this, or not at all.
    """
    user = claims.get("user")
    if not isinstance(user, dict):
        return ""
    parts = [str(user.get(key) or "").strip() for key in ("firstName", "lastName")]
    return " ".join(part for part in parts if part)


def _platform_url(name: str) -> str:
    return (os.environ.get(name) or "").strip().rstrip("/")


#: Asks the platform: (url, token) -> status code.
Fetch = Callable[[str, str], Awaitable[int]]

#: IAM's answer on a task grant's token: its status, and whether the grant stands.
FetchLive = Callable[[str, str], Awaitable[Tuple[int, bool]]]

#: Where a token exchanged from a task grant is verified. IAM's `whoami`
#: refuses a narrowed token of that kind (decided 14 October 2026: a run's
#: token reads no profile), and this route takes it, verifies it, and says
#: whether its grant still stands.
TASK_GRANT_LIVE = "/api/iam/v1/oauth/task-grants/live"


async def _fetch(url: str, token: str) -> int:
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        return response.status_code


async def _fetch_live(url: str, token: str) -> Tuple[int, bool]:
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        if response.status_code != 200:
            return response.status_code, False
        try:
            return 200, response.json().get("live") is True
        except ValueError:
            return 200, False


class CallerVerifier:
    """Verifies callers by asking the platform, and remembers the answers."""

    def __init__(
        self,
        fetch: Fetch = _fetch,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], float] = time.time,
        fetch_live: FetchLive = _fetch_live,
    ):
        self._fetch = fetch
        self._fetch_live = fetch_live
        self._clock = clock
        self._now = now
        self._verified: Dict[Tuple[str, str], Tuple[Caller, float]] = {}

    def forget(self) -> None:
        self._verified.clear()

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        """The caller a token is, or `CallerRefused`."""
        from agent_runtimes.apps.principal import a_deployment_is_served
        from agent_runtimes.apps.visitors import (
            NOT_HERE,
            ONLY_VISITORS,
            is_anonymous_audience,
            visitors_runtime,
        )

        claims = _unverified_claims(token)
        if not claims:
            raise CallerRefused(401, "The token is not one this platform issues.")
        visitor = is_anonymous_audience(claims)
        if not visitor and visitors_runtime():
            raise CallerRefused(403, ONLY_VISITORS)
        # A visitor is answered by the visitors' runtime, and by the runtime a
        # deployment with code of its own is kept on, which runs it for them
        # (decided 14 October 2026): nowhere else.
        if visitor and not (visitors_runtime() or a_deployment_is_served()):
            raise CallerRefused(403, NOT_HERE)
        if visitor:
            return await self._visitor(token)
        if is_host_token(claims):
            return await self._host(token, claims)
        embed = is_embed_token(claims)
        if embed and not app_uid:
            raise CallerRefused(
                403,
                "An embed token reaches an application, and this runtime runs none.",
            )
        key = (hashlib.sha256(token.encode()).hexdigest(), app_uid if embed else "")
        remembered = self._verified.get(key)
        if remembered and remembered[1] > self._clock():
            return remembered[0]
        expires = claims.get("exp")
        if isinstance(expires, (int, float)) and expires <= self._now():
            raise CallerRefused(401, "The token has expired.")
        if embed:
            if claims.get("app_uid") != app_uid:
                raise CallerRefused(403, "The embed token is for another application.")
            spacer = _platform_url("DATALAYER_SPACER_URL")
            if not spacer:
                raise CallerRefused(
                    503,
                    "This runtime does not know where Spacer is, so it cannot verify an embed token.",
                )
            status = await self._ask(
                f"{spacer}/api/spacer/v1/apps/{app_uid}/embedded", token
            )
            caller = Caller(
                kind="embed",
                uid=str(claims.get("sub") or ""),
                app_uid=app_uid,
                visit=str(claims.get("visit") or claims.get("jti") or ""),
                scopes=tuple(str(claims.get("scope") or "").split()),
            )
        else:
            iam = _platform_url("DATALAYER_IAM_URL")
            if not iam:
                raise CallerRefused(
                    503,
                    "This runtime does not know where IAM is, so it cannot verify a token.",
                )
            if str(claims.get("task_grant_uid") or "").strip():
                # A run's key, a deployment's principal, a kept runtime's key:
                # each exchanged from a task grant, verified where IAM takes
                # them, and refused once the grant no longer stands.
                status, live = await self._ask_live(f"{iam}{TASK_GRANT_LIVE}", token)
                if status == 200 and not live:
                    raise CallerRefused(
                        401, "The task grant behind this token no longer stands."
                    )
            else:
                status = await self._ask(f"{iam}/api/iam/v1/whoami", token)
            agent = str(claims.get("agent_uid") or "")
            if agent and agent == str(claims.get("sub") or ""):
                # A principal's own token — an application's, as a deployment
                # acts — is nobody's: never let through as a person.
                caller = Caller(
                    kind="principal",
                    uid=agent,
                    app_uid=str(claims.get("app_uid") or ""),
                )
            else:
                caller = Caller(
                    kind="person",
                    uid=str(claims.get("sub") or claims.get("uid") or ""),
                    name=person_name(claims),
                )
        if status in (401, 403, 404):
            raise CallerRefused(401, "The platform does not accept this token.")
        if status != 200:
            raise CallerRefused(
                503, f"The platform could not verify the token ({status})."
            )
        lifetime = CACHE_SECONDS
        if isinstance(expires, (int, float)):
            lifetime = min(lifetime, max(0.0, expires - self._now()))
        self._remember(key, caller, self._clock() + lifetime)
        return caller

    async def verify_visitor(self, token: str) -> Caller:
        """The visitor a token is, on any runtime, or `CallerRefused`.

        Only for a route that answers visitors although the runtime is not the
        visitors' one: an application its owner served over A2A open to
        visitors (`agent_runtimes.apps.a2a`). Everything else goes
        through :meth:`verify`, which refuses a visitor off that runtime.
        """
        from agent_runtimes.apps.visitors import is_anonymous_audience

        claims = _unverified_claims(token)
        if not claims or not is_anonymous_audience(claims):
            raise CallerRefused(401, "The token is not a visitor's.")
        expires = claims.get("exp")
        if isinstance(expires, (int, float)) and expires <= self._now():
            raise CallerRefused(
                401, "Your visitor's token has run out: reload the page to go on."
            )
        return await self._visitor(token)

    async def _host(self, token: str, claims: Dict[str, Any]) -> Caller:
        """A host token, asked of ai-agents, which issued it and keeps what it
        rests on: remembered a minute at most.
        """
        key = (hashlib.sha256(token.encode()).hexdigest(), "host")
        remembered = self._verified.get(key)
        if remembered and remembered[1] > self._clock():
            return remembered[0]
        expires = claims.get("exp")
        if isinstance(expires, (int, float)) and expires <= self._now():
            raise CallerRefused(
                401, "The host token has expired: the host asks for another."
            )
        url = _ai_agents_url()
        if not url:
            raise CallerRefused(
                503,
                "This runtime does not know where ai-agents is, so it cannot verify a host token.",
            )
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.get(
                    f"{url}/api/ai-agents/v1/apps/hosts/whoami",
                    headers={"Authorization": f"Bearer {token}"},
                )
        except httpx.HTTPError as error:
            raise CallerRefused(
                503,
                f"ai-agents could not be reached to verify the host token ({type(error).__name__}).",
            ) from None
        if response.status_code in (401, 403, 404, 409):
            detail = ""
            try:
                detail = str((response.json() or {}).get("detail") or "")
            except ValueError:
                pass
            raise CallerRefused(
                401 if response.status_code == 401 else 403,
                detail or "ai-agents does not accept this host token.",
            )
        if response.status_code != 200:
            raise CallerRefused(
                503,
                f"ai-agents could not verify the host token ({response.status_code}).",
            )
        said = response.json()
        caller = Caller(
            # A person who never linked, answered as a visitor.
            kind="visitor" if said.get("visitor") is True else "host",
            uid=str(said.get("sub") or ""),
            app_uid=str(said.get("app_uid") or ""),
            visit=str(said.get("azp") or ""),
            scopes=tuple(str(said.get("scope") or "").split()),
            deployment_uid=str(said.get("deployment_uid") or ""),
        )
        if not caller.uid or not caller.deployment_uid:
            raise CallerRefused(401, "The host token names nobody.")
        lifetime = min(HOST_CACHE_SECONDS, max(0.0, float(said.get("expires_in") or 0)))
        self._remember(key, caller, self._clock() + lifetime)
        return caller

    async def _visitor(self, token: str) -> Caller:
        """A visitor's token, asked of ai-inference, which minted it.

        Remembered as long as ai-inference says it lives, at most
        :data:`CACHE_SECONDS`: a token is worth a few minutes.
        """
        key = (hashlib.sha256(token.encode()).hexdigest(), "visitor")
        remembered = self._verified.get(key)
        if remembered and remembered[1] > self._clock():
            return remembered[0]
        inference = _platform_url("DATALAYER_AI_INFERENCE_URL")
        if not inference:
            raise CallerRefused(
                503,
                "This runtime does not know where ai-inference is, so it cannot verify a visitor.",
            )
        from agent_runtimes.models.models import _normalize_ai_inference_base_url

        url = f"{_normalize_ai_inference_base_url(inference)}/anonymous/whoami"
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.get(
                    url, headers={"Authorization": f"Bearer {token}"}
                )
        except httpx.HTTPError as error:
            raise CallerRefused(
                503,
                f"ai-inference could not be reached to verify the visitor ({type(error).__name__}).",
            ) from None
        if response.status_code in (401, 403, 404):
            raise CallerRefused(
                401, "Your visitor's token has run out: reload the page to go on."
            )
        if response.status_code != 200:
            raise CallerRefused(
                503,
                f"ai-inference could not verify the visitor ({response.status_code}).",
            )
        said = response.json()
        visitor = str(said.get("visitor") or "")
        if not visitor:
            raise CallerRefused(401, "The token names no visitor.")
        caller = Caller(
            kind="visitor",
            uid=visitor,
            app_uid=str(said.get("app") or ""),
            battle=str(said.get("battle") or ""),
            turns_unlimited=said.get("turns_unlimited") is True,
        )
        lifetime = min(CACHE_SECONDS, max(0.0, float(said.get("expires_in") or 0)))
        self._remember(key, caller, self._clock() + lifetime)
        return caller

    def _remember(self, key: Tuple[str, str], caller: Caller, until: float) -> None:
        """Keep an answer; what has expired goes, and the oldest when it is full."""
        now = self._clock()
        for stale in [
            known for known, (_, end) in self._verified.items() if end <= now
        ]:
            del self._verified[stale]
        while len(self._verified) >= CACHE_SIZE:
            del self._verified[next(iter(self._verified))]
        self._verified[key] = (caller, until)

    async def _ask_live(self, url: str, token: str) -> Tuple[int, bool]:
        try:
            return await self._fetch_live(url, token)
        except httpx.HTTPError as error:
            raise CallerRefused(
                503,
                f"The platform could not be reached to verify the token ({type(error).__name__}).",
            ) from None

    async def _ask(self, url: str, token: str) -> int:
        try:
            return await self._fetch(url, token)
        except httpx.HTTPError as error:
            raise CallerRefused(
                503,
                f"The platform could not be reached to verify the token ({type(error).__name__}).",
            ) from None


def _ai_agents_url() -> str:
    """Where ai-agents is, as the runtime's other calls to it say."""
    named = _platform_url("DATALAYER_AI_AGENTS_URL")
    if named:
        return named
    try:
        from datalayer_core.utils.urls import DatalayerURLs

        return str(
            getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
        ).rstrip("/")
    except Exception:  # noqa: BLE001 - no configuration is no ai-agents
        return ""


#: The runtime's verifier: one per process.
VERIFIER = CallerVerifier()


# --- the runtime's own routes: who proves the runtime is theirs -----------------------

#: The headers a proxy adds to what it passes on: a call that carries one did
#: not start on this machine, whatever address it arrives from.
FORWARDED_HEADERS = ("x-forwarded-for", "x-forwarded-host", "x-real-ip", "forwarded")


@dataclass(frozen=True)
class Proof:
    """Whether a call proved the runtime is its caller's, and how or why not.

    ``kind`` when it did: ``pod`` (the companion, by the pod's secret, on a
    runtime that holds one), ``skill`` (a skill's script in the sandbox, on
    one of the few routes it calls: :func:`is_a_skills_call`),
    ``sandbox-token`` (the runtime's own Jupyter token, which its owner holds
    from the platform's record), ``runtime-token`` (the token of this
    process: :func:`runtime_token`) or ``owner`` (the owner's Datalayer
    token). ``reason`` when it did not, in a word a log line can be counted
    by: ``loopback-no-credential`` for a call from the machine itself that
    sent none.
    """

    sufficient: bool
    kind: str = ""
    reason: str = ""


def headers_of(scope: Any) -> Dict[str, str]:
    """An ASGI scope's headers, lower-cased; the last of a repeated one."""
    return {
        key.decode("latin-1").lower(): value.decode("latin-1")
        for key, value in scope.get("headers") or []
    }


def is_forwarded(headers: Mapping[str, str]) -> bool:
    """Whether a proxy passed this call on (:data:`FORWARDED_HEADERS`)."""
    return any(name in headers for name in FORWARDED_HEADERS)


def credential_of(scope: Any, headers: Optional[Mapping[str, str]] = None) -> str:
    """The token a call presents on one of the runtime's own routes, or ``""``.

    ``Authorization: Bearer …`` or Jupyter's ``Authorization: token …``; on a
    websocket, which a browser opens without headers of its own, the ``token``
    query parameter.
    """
    from urllib.parse import parse_qs

    said = (headers if headers is not None else headers_of(scope)).get(
        "authorization", ""
    )
    from agent_runtimes.apps.egress_principal import is_placeholder

    scheme, _, token = said.partition(" ")
    if scheme.lower() in ("bearer", "token") and token.strip():
        # The placeholder of a runtime without credentials is nobody's token.
        return "" if is_placeholder(token) else token.strip()
    query = parse_qs((scope.get("query_string") or b"").decode("latin-1"))
    asked = (query.get("token") or [""])[0].strip()
    return "" if is_placeholder(asked) else asked


def runtime_owner_uid() -> str:
    """The account this runtime is assigned to, or ``""`` while it is nobody's.

    ``DATALAYER_USER_UID``, which the Operator sets at launch or the companion
    names once when the runtime is assigned (`routes.agents._take_owner`);
    else the account of a token the pod gave the runtime for its owner: the
    one it holds for them (``DATALAYER_USER_TOKEN``), then the one it calls
    ai-inference with (`models.offered.give_inference_token`), which every
    assigned runtime is given, with or without an agent. A principal's own
    token names nobody. Last, on an Agent Substrate actor (a Kagent agent's
    runtime, given none of these: its credentials are put in at egress), the
    account IAM said holds its reservation (:func:`owner_by_reservation`).
    """
    named = (os.environ.get("DATALAYER_USER_UID") or "").strip()
    if named:
        return named
    for held in (
        (os.environ.get("DATALAYER_USER_TOKEN") or "").strip(),
        _given_inference_token(),
    ):
        claims = _unverified_claims(held) if held else {}
        if not claims:
            continue
        agent = str(claims.get("agent_uid") or "")
        if agent and agent == str(claims.get("sub") or ""):
            continue
        account = str(claims.get("sub") or claims.get("uid") or "")
        if account:
            return account
    return _RESERVATION_OWNER.get("uid", "")


# --- an actor's owner: the account whose reservation it is --------------------------

#: Where IAM lists the open reservations of the account a token is (its own, and
#: nobody else's: a person's token lists that person's).
RESERVATIONS_PATH = "/api/iam/v1/usage/reservations"

#: The account IAM said holds this actor's reservation, once it said so: a
#: runtime is never given another owner.
_RESERVATION_OWNER: Dict[str, str] = {}

#: Asks IAM for the reservations a token's account holds: (url, token) -> (status, resource uids).
FetchReservations = Callable[[str, str], Awaitable[Tuple[int, Tuple[str, ...]]]]


async def _fetch_reservations(url: str, token: str) -> Tuple[int, Tuple[str, ...]]:
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        if response.status_code != 200:
            return response.status_code, ()
        try:
            listed = (response.json() or {}).get("reservations") or []
        except ValueError:
            return 200, ()
        return 200, tuple(
            str(entry.get("resource") or entry.get("id") or "").lower()
            for entry in listed
            if isinstance(entry, dict)
        )


def actor_runtime_uid() -> str:
    """The runtime an Agent Substrate actor serves, or ``""`` on any other runtime.

    Read from the files Agent Substrate projects for the actor (``rt-<uid>``,
    `ate.identity`): its own, never a variable every clone of its template shares.
    """
    from agent_runtimes.ate.settings import is_ate_target

    if not is_ate_target():
        return ""
    from agent_runtimes.ate.identity import read_identity
    from agent_runtimes.ate.settings import ate_settings

    try:
        identity = read_identity(ate_settings().system_info_dir)
    except (OSError, ValueError):
        return ""
    return (identity.runtime_uid or "") if identity is not None else ""


async def owner_by_reservation(
    caller_uid: str, token: str, fetch: Optional[FetchReservations] = None
) -> Tuple[str, str]:
    """Whether a verified person is the account an actor's reservation is held by.

    A Kagent agent's runtime is an Agent Substrate actor that holds nothing of
    its owner's (their tokens are put in at egress), so nothing in it names
    them, and nobody names them to it: the Operator reaches it through the
    same ingress as anybody. IAM knows: the actor serves the runtime its name
    says (:func:`actor_runtime_uid`), whose reservation is its owner's. The
    person's own token asks IAM for their reservations; when this runtime's
    is one of them, they are its owner, remembered from then on.

    Only on an actor launched for no deployment (an always-on application's
    runtime answers its application's callers, and acts as its principal).

    Returns
    -------
    tuple[str, str]
        ``(owner, "")`` when IAM lists the reservation as the caller's;
        ``("", reason)`` otherwise: ``owner-unknown`` (not an actor of a
        person's own, or no IAM named), ``unverifiable`` (IAM not reached, or
        it did not answer) or ``another-account`` (IAM answered, and the
        reservation is not the caller's).
    """
    from agent_runtimes.apps.principal import a_deployment_is_served, launched_for

    runtime = actor_runtime_uid()
    if not runtime or not caller_uid or launched_for() or a_deployment_is_served():
        return "", "owner-unknown"
    iam = _platform_url("DATALAYER_IAM_URL")
    if not iam:
        return "", "owner-unknown"
    try:
        status, resources = await (fetch or _fetch_reservations)(
            f"{iam}{RESERVATIONS_PATH}", token
        )
    except httpx.HTTPError:
        return "", "unverifiable"
    if status != 200:
        return "", "unverifiable"
    if runtime.lower() not in resources:
        return "", "another-account"
    _RESERVATION_OWNER["uid"] = caller_uid
    return caller_uid, ""


def forget_reservation_owner() -> None:
    """Forget the account IAM said holds the reservation (the tests)."""
    _RESERVATION_OWNER.clear()


def _given_inference_token() -> str:
    """The token the pod gave this runtime to call ai-inference with, or ``""``."""
    try:
        from agent_runtimes.models import offered

        return str(offered._given.get("token") or "")
    except Exception:  # noqa: BLE001 - no token given is no owner said by it
        return ""


def sandbox_token() -> str:
    """The token of the runtime's own Jupyter sandbox, or ``""`` when it has none.

    What its sandbox manager holds; before the companion configures it, the
    token of the sandbox the pod names at launch
    (``AGENT_RUNTIMES_JUPYTER_SANDBOX``, whose ``token`` the platform gives
    the owner with the runtime's record), so that a call signed with it is
    the owner's from the runtime's first second.
    """
    try:
        from agent_runtimes.services.code_sandbox_manager import (
            get_code_sandbox_manager,
        )

        held = str(get_code_sandbox_manager().get_status().get("jupyter_token") or "")
    except Exception:  # noqa: BLE001 - no sandbox is no token
        held = ""
    if held:
        return held
    from urllib.parse import parse_qs, urlsplit

    from agent_runtimes.apps.egress_principal import is_placeholder

    named = (os.environ.get("AGENT_RUNTIMES_JUPYTER_SANDBOX") or "").strip()
    try:
        said = (parse_qs(urlsplit(named).query).get("token") or [""])[0].strip()
    except ValueError:
        return ""
    return "" if not said or is_placeholder(said) else said


#: Where the runtime's own token is said, for a runtime started on a person's
#: machine (`agent-runtimes serve`, the CLI's local runtime) or by a client
#: that starts one and signs its calls with it.
RUNTIME_TOKEN_ENV = "AGENT_RUNTIMES_TOKEN"

_RUNTIME_TOKEN: Dict[str, str] = {}


def runtime_token() -> str:
    """The token this runtime's process takes as its own, and signs its calls to itself with.

    :data:`RUNTIME_TOKEN_ENV` when it is set; else one drawn when first asked,
    held in this process alone and never written to its environment, so that
    nothing it starts inherits it. Whoever holds it proves the runtime is
    theirs, as the owner does: `agent-runtimes serve` on a person's machine
    prints it, and the runtime's own calls to itself send it
    (:func:`runtime_auth_headers`).
    """
    held = _RUNTIME_TOKEN.get("token")
    if held is None:
        from agent_runtimes.apps.egress_principal import is_placeholder

        said = (os.environ.get(RUNTIME_TOKEN_ENV) or "").strip()
        held = said if said and not is_placeholder(said) else secrets.token_urlsafe(32)
        _RUNTIME_TOKEN["token"] = held
    return held


def runtime_auth_headers() -> Dict[str, str]:
    """The headers of the runtime's own calls to itself (:func:`runtime_token`)."""
    return {"Authorization": f"Bearer {runtime_token()}"}


#: The routes a skill's script calls on the runtime's loopback, from the
#: sandbox, which holds no credential: by method, and the path's pattern.
#: The few that are its owner's otherwise; each guards itself too (a browser's
#: page refused, `refuse_unless_a_skill`; on a runtime held to its
#: application's routes, only while code the agent was let run is running,
#: `apps.visitors.OwnRoutesOnly` and `enforcement.code_is_running`).
SKILL_ROUTES: Tuple[Tuple[frozenset, "re.Pattern[str]"], ...] = (
    # The runtime's agents, to find its only one (the memory skills).
    (frozenset({"GET"}), re.compile(r"^/api/v1/agents/?$")),
    # An agent's memory (`memory_*` skills).
    (
        frozenset({"GET", "POST", "DELETE"}),
        re.compile(r"^/api/v1/agents/[^/]+/memory(/search|/[^/]+)?/?$"),
    ),
    # Who the runtime runs for, and its agent's events (`whoami`, `events`).
    (frozenset({"GET"}), re.compile(r"^/api/v1/owner/?$")),
    (
        frozenset({"GET", "POST", "PATCH"}),
        re.compile(r"^/api/v1/owner/events(/[^/]+)?/?$"),
    ),
    # A file saved to a Space, a mail to the person, the owner's work published.
    (frozenset({"POST"}), re.compile(r"^/api/v1/spaces/files/?$")),
    (frozenset({"POST"}), re.compile(r"^/api/v1/configure/mail/?$")),
    (frozenset({"POST"}), re.compile(r"^/api/v1/library/items/[^/]+/publish/?$")),
    # The sandbox's tool calls (codemode's bindings).
    (
        frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"}),
        re.compile(r"^/api/v1/mcp/proxy/"),
    ),
)

#: What a harness reaches on the loopback by a handle it was given, which the
#: route asks (`routes.mcp_lent`, `routes.inference_relay`): its lent toolsets
#: and its model relay. A harness's client may say fetch metadata (Node's
#: fetch does), so a browser's headers are not read here: the handle, which
#: only the harness holds, is the proof.
HANDLE_ROUTES = re.compile(r"^/api/v1/(mcp/lent|inference/relay)/")


def is_a_skills_call(
    method: str, path: str, host: Optional[str], headers: Mapping[str, str]
) -> bool:
    """Whether a call without a credential is a skill's script in the sandbox.

    On the loopback, passed on by no proxy, made by no browser (no ``Origin``,
    no fetch metadata: :func:`from_a_browser`), to one of :data:`SKILL_ROUTES`;
    or a harness on one of :data:`HANDLE_ROUTES`, whose route asks the handle
    it was given. A page on the machine itself is no skill, whatever it calls.
    """
    if not is_loopback(host) or is_forwarded(headers):
        return False
    if HANDLE_ROUTES.match(path) is not None:
        return True
    if from_a_browser(headers):
        return False
    asked = "GET" if method == "HEAD" else method
    return any(
        asked in methods and pattern.match(path) is not None
        for methods, pattern in SKILL_ROUTES
    )


async def proves_the_runtime(scope: Any, verifier: Optional[Any] = None) -> Proof:
    """Whether an HTTP request or a websocket handshake proves the runtime is its caller's.

    A call presents a token (:func:`credential_of`), from the machine itself
    as from anywhere else (decided 26 November 2026: on a person's own
    machine a page in their browser reaches the loopback too): the runtime's
    own Jupyter token, which the platform gives its owner with the runtime's
    record; the token of this process (:func:`runtime_token`), which a local
    runtime prints and its own calls to itself send; or a Datalayer token the
    platform accepts for the account the runtime is assigned to. A token of
    another kind (an application's visitor, embed, host or principal token)
    proves nothing here: those reach the application's routes, which verify
    them themselves.

    Without a token, two callers on the loopback only: the companion, by the
    pod's secret, on a runtime that holds one (`principal.pod_secret_is`);
    and a skill's script in the sandbox, on the few routes it calls
    (:func:`is_a_skills_call`). Any other call from the loopback without a
    token proves nothing (``loopback-no-credential``).
    """
    import hmac

    from agent_runtimes.apps.principal import holds_a_pod_secret, pod_secret_is

    headers = headers_of(scope)
    host = (scope.get("client") or (None,))[0]
    token = credential_of(scope, headers)
    if not token:
        local = is_loopback(host) and not is_forwarded(headers)
        if (
            local
            and holds_a_pod_secret()
            and pod_secret_is(headers.get(POD_SECRET_HEADER.lower()))
        ):
            return Proof(True, kind="pod")
        method = (
            "WS" if scope.get("type") == "websocket" else (scope.get("method") or "GET")
        )
        if is_a_skills_call(method, scope.get("path") or "", host, headers):
            return Proof(True, kind="skill")
        return Proof(
            False, reason="loopback-no-credential" if local else "no-credential"
        )
    held = sandbox_token()
    if held and hmac.compare_digest(token.encode("utf-8"), held.encode("utf-8")):
        return Proof(True, kind="sandbox-token")
    if hmac.compare_digest(token.encode("utf-8"), runtime_token().encode("utf-8")):
        return Proof(True, kind="runtime-token")
    key = hashlib.sha256(token.encode()).hexdigest()
    remembered = _PROOFS.get(key)
    if remembered and remembered[1] > time.monotonic():
        return remembered[0]
    proof, seconds = await _proof_of_token(token, verifier or VERIFIER)
    for stale in [k for k, (_, end) in _PROOFS.items() if end <= time.monotonic()]:
        del _PROOFS[stale]
    held_now = _PROOFS.get(key)
    if held_now and held_now[0].sufficient and not proof.sufficient:
        # A concurrent call of the same token proved it meanwhile: a later
        # failure to ask the platform does not undo that proof.
        return held_now[0]
    while len(_PROOFS) >= CACHE_SIZE:
        del _PROOFS[next(iter(_PROOFS))]
    _PROOFS[key] = (proof, time.monotonic() + seconds)
    return proof


#: What a token proved here, remembered a short while: the platform is asked
#: once for a page's burst of calls, whatever it answers, and a token that
#: stopped being the owner's stops within a minute.
PROOF_SECONDS = 60.0

#: A proof that could not be had yet (the platform not reached, the runtime not
#: assigned) is asked for again much sooner.
PROOF_RETRY_SECONDS = 5.0

_PROOFS: Dict[str, Tuple[Proof, float]] = {}


def forget_proofs() -> None:
    """Forget what tokens proved (a runtime given its owner; the tests)."""
    _PROOFS.clear()


async def _proof_of_token(token: str, verifier: Any) -> Tuple[Proof, float]:
    """What a token that is not the sandbox's proves, and how long that is remembered."""
    try:
        caller = await verifier.verify(token)
    except CallerRefused as refused:
        if refused.status >= 500:
            return Proof(False, reason="unverifiable"), PROOF_RETRY_SECONDS
        return Proof(False, reason="token-refused"), PROOF_SECONDS
    if caller.kind != "person":
        return Proof(False, reason="application-token"), PROOF_SECONDS
    owner = runtime_owner_uid()
    if not owner:
        # An actor nobody names its owner to: IAM says whose reservation it is.
        owner, reason = await owner_by_reservation(caller.uid, token)
        # Another call's lookup may have named the owner while this one waited.
        owner = owner or runtime_owner_uid()
        if not owner:
            seconds = (
                PROOF_SECONDS if reason == "another-account" else PROOF_RETRY_SECONDS
            )
            return Proof(False, reason=reason), seconds
    if caller.uid != owner:
        return Proof(False, reason="another-account"), PROOF_SECONDS
    return Proof(True, kind="owner"), PROOF_SECONDS


def without_sandbox_credentials(answer: Any) -> Any:
    """A copy of an answer with no credential of the sandbox in it.

    What the runtime says of its sandbox to a caller that did not prove the
    runtime is theirs (:func:`proves_the_runtime`): the ``jupyter_token`` key
    is not there at all, at any depth, and an address loses its ``token``
    query parameter. Everything else (variant, kernel, state) is unchanged.
    """
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    if isinstance(answer, dict):
        kept: Dict[str, Any] = {}
        for key, value in answer.items():
            if key == "jupyter_token":
                continue
            kept[key] = without_sandbox_credentials(value)
        return kept
    if isinstance(answer, (list, tuple)):
        return [without_sandbox_credentials(item) for item in answer]
    if isinstance(answer, str) and "token=" in answer and "://" in answer:
        parts = urlsplit(answer)
        query = [
            (k, v)
            for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if k != "token"
        ]
        return urlunsplit(parts._replace(query=urlencode(query)))
    return answer


async def sandbox_answer(connection: Any, answer: Any) -> Any:
    """An answer about the sandbox, as this caller may read it.

    ``connection`` is a request or a websocket. Whole for a caller that may
    read the sandbox's token (:func:`reads_the_sandbox_token`); without the
    sandbox's credentials for anybody else.
    """
    if await reads_the_sandbox_token(connection.scope):
        return answer
    return without_sandbox_credentials(answer)


async def reads_the_sandbox_token(scope: Any) -> bool:
    """Whether a caller is told the sandbox's token in what it reads of the sandbox.

    A caller that proved the runtime is theirs (:func:`proves_the_runtime`).
    While the lock only logs (``log`` mode), also a call from the machine
    itself that sent no token and is no stranger's page (a script, or a page
    of this machine or of the platform: :func:`from_a_strangers_page`), as
    before 1.8.9, so that a local page that does not sign its calls yet keeps
    its kernel; its call is logged as ``loopback-no-credential``. In
    ``enforce`` mode, never.
    """
    proof = await proves_the_runtime(scope)
    if proof.sufficient:
        return True
    if proof.reason != "loopback-no-credential":
        return False
    from agent_runtimes.apps.visitors import ACCESS_MODE_SCOPE_KEY, access_mode

    mode = scope.get(ACCESS_MODE_SCOPE_KEY)
    if mode is None:
        try:
            mode = access_mode()
        except ValueError:
            return False
    return mode == "log" and not from_a_strangers_page(headers_of(scope))


def is_loopback_origin(origin: str) -> bool:
    """Whether a browser's origin is a page served by this machine."""
    try:
        host = httpx.URL(origin).host
    except Exception:  # noqa: BLE001 - an origin that does not parse is nobody's
        return False
    return is_loopback(host)


def platform_origins() -> Tuple[str, ...]:
    """The origins of the platform's own pages: what the operator says, and its URLs."""
    named = (os.environ.get("AGENT_RUNTIMES_APP_ORIGINS") or "").split(",")
    urls = [
        os.environ.get("DATALAYER_UI_URL") or "",
        os.environ.get("DATALAYER_RUN_URL") or "",
    ]
    origins = []
    for entry in [*named, *urls]:
        entry = entry.strip().rstrip("/")
        if entry:
            url = httpx.URL(entry)
            origins.append(f"{url.scheme}://{url.netloc.decode()}")
    return tuple(dict.fromkeys(origins))


def origin_allowed(origin: Optional[str], allowed: Tuple[str, ...]) -> bool:
    """Whether a browser's origin may call.

    No origin is not a browser's cross-site call, and is let through to the
    token check. A page served by this machine is a developer's. Any other
    origin has to be named: by the platform, or by the deployment.
    """
    if not origin:
        return True
    if is_loopback_origin(origin):
        return True
    return origin.rstrip("/") in {entry.rstrip("/") for entry in allowed}


# --- a browser's page on the machine itself -----------------------------------
#
# On a person's own machine a page they opened in a browser reaches the
# runtime's loopback too, and the server's CORS answers any origin: the
# loopback alone is neither proof of a skill nor of the person. A browser's
# request says a browser made it and a script's does not; the routes that
# take the loopback's word read it here, and nowhere else.

#: What a browser puts on a request and a skill's script does not.
BROWSER_HEADERS = ("origin", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest")


def from_a_browser(headers: Mapping[str, str]) -> bool:
    """Whether a request says a browser made it: an ``Origin`` or fetch metadata."""
    return any(name in headers for name in BROWSER_HEADERS)


def from_a_strangers_page(headers: Mapping[str, str]) -> bool:
    """Whether a browser's page that is neither this machine's nor the platform's asks.

    By the origin it names (:func:`origin_allowed` with :func:`platform_origins`;
    ``null`` is nobody's); a request that names none is a stranger's when its
    fetch metadata says another site made it. A script, which says neither, is
    no page at all.
    """
    if "origin" in headers:
        origin = headers.get("origin") or "null"
        return not origin_allowed(origin, platform_origins())
    return (headers.get("sec-fetch-site") or "").strip().lower() == "cross-site"


def refuse_unless_a_skill(request: Request, detail: str) -> None:
    """Refuse (403) a caller that is not a skill's script on the pod's loopback.

    For a route only a skill calls. ``detail`` is said to a caller from
    elsewhere; a browser's page on the loopback is told it is not one, before
    anything is read.

    Parameters
    ----------
    request : starlette.requests.Request
        The request.
    detail : str
        Who alone may call, in a sentence.
    """
    from fastapi import HTTPException  # noqa: PLC0415

    if not is_loopback(request.client.host if request.client else None):
        raise HTTPException(status_code=403, detail=detail)
    refuse_a_browsers_page(request, detail)


def refuse_a_browsers_page(request: Request, detail: str) -> None:
    """Refuse (403) a request a browser made, wherever it comes from.

    For a route only a skill calls and that names no address of its own:
    ``detail`` says who alone may call.
    """
    from fastapi import HTTPException  # noqa: PLC0415

    if from_a_browser(request.headers):
        raise HTTPException(
            status_code=403,
            detail=f"{detail.rstrip('.')}: a browser's page is not one.",
        )


#: Said to another site's page on the runtime's loopback, by the lock and the routes.
STRANGERS_PAGE = (
    "A page that is neither this machine's nor Datalayer's reaches "
    "nothing on this runtime's loopback."
)


async def strangers_page_refused(scope: Any, receive: Any, send: Any) -> None:
    """Refuse (403) another site's page on the loopback, over HTTP or at a websocket's handshake."""
    from starlette.responses import JSONResponse

    refused = JSONResponse({"detail": STRANGERS_PAGE}, status_code=403)
    if scope.get("type") == "websocket":
        from starlette.websockets import WebSocket

        await WebSocket(scope, receive, send).send_denial_response(refused)
        return
    await refused(scope, receive, send)


def refuse_a_strangers_page(request: Request) -> None:
    """Refuse (403) a stranger's page where the loopback stands for proof.

    For a route the runtime's own pages call too, as a route's dependency. On
    the loopback a page that is neither this machine's nor the platform's is
    refused, whether or not it says a proxy passed it on: a forwarding header
    is only a header, and a page can send one (the server's CORS lets it). A
    call from anywhere else is judged by the token it presents, as before, and
    nothing is refused here.
    """
    from fastapi import HTTPException  # noqa: PLC0415

    headers = request.headers
    host = request.client.host if request.client else None
    if is_loopback(host) and from_a_strangers_page(headers):
        raise HTTPException(status_code=403, detail=STRANGERS_PAGE)

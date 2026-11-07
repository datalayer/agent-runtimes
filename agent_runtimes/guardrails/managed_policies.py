# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Shield's policies from IAM, on a runtime (SH-50).

A Datalayer runtime is **managed**: the organization's and the teams' Shield
documents are IAM's, pulled for the account the runtime runs under
(``agent_shield.saas.ManagedPolicies`` over ``GET
/mcp-policies/shield/accounts/{account_uid}`` with the runtime's token),
kept until their ``expires``, and polled every thirty seconds while any
agent of the runtime listens — so a change an administrator saves reaches a
running harness within a minute. **Pushed too**: while it watches, a
managed runtime holds a socket to ai-agents' ``/ws`` (the one the approvals
ride, authenticated with the same token, so it sits on the account's own
channel) and, told ``shield_policy_changed`` — IAM tells ai-agents at every
write of a ``shield`` rule, ai-agents tells the members' sockets — pulls IAM
at once, so the change is in force within seconds; the poll stays for a
runtime whose socket is down. The engine is the package's; this module is
the runtime's one place that knows IAM's URL and the account's token, and
that fans a change out to every agent and every session's budget.

**The credential is read at each read.** The account is decided once, by the
credential the runtime first holds; what IAM is asked with is read every time
(:meth:`RuntimePolicies.credential_now`): the principal's token of a deployment
of that account served here, which its keeper renews for as long as it is kept
on, else that first credential. A kept harness starts under a key minted for
its owner, or the owner's own token, which outlive nothing: held for the
runtime's life, IAM answered 401 and the Shield refused every step once the
copy it held expired (found on r1, 31 October 2026).

**Fail closed.** With a token and IAM's URL, a policy that cannot be read and
no unexpired copy is :class:`agent_shield.saas.PolicyUnavailable`, a
sentence naming IAM: the harness is refused with it at creation, and every
further action of a running one is refused with it until IAM answers. A
runtime with no token at all — the terminal's ``loop``, a test — is
**unmanaged**: the application's Rules and the platform's default alone, as
the standalone proxy runs on its file. So is a process with a token but no
``DATALAYER_IAM_URL`` — a developer's shell, CI — said once in the log: a
Datalayer runtime's pod always carries IAM's URL (the operator sets it), so
on the platform nothing is decided without a readable policy, and off it
the Rules decide as the proxy's file does. (1.5.37 refused such a process outright, which refused
every application run in a shell that only held a token.)
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import os
import time
from typing import Any, Awaitable, Callable, List, Mapping, Optional, Tuple, Union

from agent_shield.policy import Policy
from agent_shield.saas import (
    POLL_SECONDS,
    IamPolicySource,
    ManagedPolicies,
    PolicySource,
    PolicyUnavailable,
    ServedPolicies,
)

logger = logging.getLogger(__name__)

__all__ = [
    "SOCKET_EVENT",
    "CurrentCredentialSource",
    "PolicyUnavailable",
    "RuntimePolicies",
    "account_of_token",
    "ai_agents_socket_url",
    "runtime_policies",
    "use_source",
]

#: The variables the runtime reads IAM and its token from (the configure route sets the token).
IAM_URL_VARIABLE = "DATALAYER_IAM_URL"
TOKEN_VARIABLE = "DATALAYER_USER_TOKEN"  # noqa: S105 - a variable's name, not a secret
#: The account's own key, among its secrets: it outlives a runtime kept for days,
#: where the user's token lapses within the hour and nothing renews it here.
API_KEY_VARIABLE = "DATALAYER_API_KEY"
#: Where ai-agents is, whose ``/ws`` pushes a policy change (the approvals' socket).
AI_AGENTS_URL_VARIABLE = "DATALAYER_AI_AGENTS_URL"

#: The event ai-agents broadcasts on the account's channel when IAM wrote a document.
SOCKET_EVENT = "shield_policy_changed"

#: How long a lost socket waits before connecting again, at most.
SOCKET_RETRY_SECONDS = 15.0


def ai_agents_socket_url(ai_agents_url: str, token: str) -> str:
    """The ``/ws`` of ai-agents at ``ai_agents_url``, with the token as the approvals send it."""
    from urllib.parse import urlencode

    base = ai_agents_url.strip().rstrip("/")
    for suffix in ("/api/ai-agents/v1", "/api/ai-agents"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    scheme = "wss" if base.startswith("https") else "ws"
    host = base.replace("https://", "").replace("http://", "")
    return f"{scheme}://{host}/api/ai-agents/v1/ws?{urlencode({'token': token})}"


OnChange = Callable[[List[Policy]], Union[None, Awaitable[None]]]
OnUnavailable = Callable[[str], Union[None, Awaitable[None]]]


def _claims_of(token: str) -> Mapping[str, Any]:
    """A token's claims, read unverified; ``{}`` for what is not a JWT."""
    parts = token.split(".")
    if len(parts) != 3:
        return {}
    try:
        claims = json.loads(
            base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4))
        )
    except (ValueError, binascii.Error):
        return {}
    return claims if isinstance(claims, dict) else {}


def _expired(token: str) -> bool:
    """Whether a token says it has run out; one that says nothing has not."""
    expires = _claims_of(token).get("exp")
    return isinstance(expires, (int, float)) and expires <= time.time()


def account_of_token(token: str) -> str:
    """The account a token is minted for, read unverified: IAM verifies it at the route.

    An application's principal is somebody of its own, a member of nothing:
    the account it acts for is its owner's (``account_uid``, beside its
    ``agent_uid``), never its own uid. Otherwise the claims carry the person
    under ``user`` (the current layout), under a ``sub`` mapping (the earlier
    one) or at the top (``uid``); a token carrying none is no account, said
    as ``""``.
    """
    claims = _claims_of(token)
    owner = str(claims.get("account_uid") or "").strip()
    if owner and str(claims.get("agent_uid") or "").strip():
        return owner
    for holder in (claims.get("user"), claims.get("sub"), claims):
        if isinstance(holder, dict) and str(holder.get("uid") or "").strip():
            return str(holder["uid"]).strip()
    sub = claims.get("sub")
    return str(sub).strip() if isinstance(sub, str) else ""


class CurrentCredentialSource:
    """IAM over HTTP (:class:`agent_shield.saas.IamPolicySource`), asked for one account
    with the credential held at each read: the first one's expiry ends nothing."""

    def __init__(
        self, iam_url: str, credential: Callable[[], str], account_uid: str
    ) -> None:
        self._credential = credential
        # Refuses a URL, a credential or an account that cannot be asked with, now.
        self._built = IamPolicySource(iam_url, credential(), account_uid)

    @property
    def where(self) -> str:
        return self._built.where

    def fetch(self) -> ServedPolicies:
        built = self._built
        return IamPolicySource(
            built.iam_url, self._credential(), built.account_uid, timeout=built.timeout
        ).fetch()


class RuntimePolicies:
    """The documents in force on this runtime, and who is told when they change."""

    def __init__(self) -> None:
        self._managed: Optional[ManagedPolicies] = None
        self._source_override: Optional[PolicySource] = None
        self._socket_url_override: Optional[str] = None
        #: What the runtime first held, and the account it names (`credential_now`).
        self._credential: str = ""
        self._account: str = ""
        self._said_unmanaged = False
        self._listeners: List[Tuple[OnChange, OnUnavailable]] = []
        self._watcher: Optional[asyncio.Task[None]] = None
        self._socket: Optional[asyncio.Task[None]] = None
        self.poll_seconds = POLL_SECONDS
        #: How many pushes the socket took (for a test, and the panel).
        self.pushed = 0

    # -- configuration -----------------------------------------------------------------

    def use_source(self, source: Optional[PolicySource]) -> None:
        """Use a source in IAM's place (a test's fake); ``None`` reads the environment again."""
        self._source_override = source
        self._managed = None
        self._credential = ""
        self._account = ""
        self._said_unmanaged = False
        self.stop_watching()

    def use_socket(self, url: Optional[str]) -> None:
        """Hold the socket at ``url`` in ai-agents' place (a test's fake); ``None`` reads the environment."""
        self._socket_url_override = url
        self.stop_watching()

    def credential_now(self) -> str:
        """What IAM is asked with now: read at each read, never kept.

        The principal's token of a deployment served here, as
        ``ACPAgent._decision_credential`` reads it: what the keeper renews
        for as long as the deployment is kept on. Only one that acts for the
        account these documents are read for: a person's runtime of somebody
        else's deployment goes on reading that person's. Else what the
        runtime first held, which IAM refuses once it has expired: nothing
        valid held is the Shield's refusal, never a read in another's name.
        """
        if not self._account:
            return self._credential
        from agent_runtimes.apps.principal import (  # noqa: PLC0415
            deployments_served,
            principal_token,
        )

        for deployment in deployments_served():
            held = principal_token(deployment)
            if held and account_of_token(held) == self._account:
                return held
        return self._credential

    def socket_url(self) -> Optional[str]:
        """Where the push is listened for now, or ``None`` when ai-agents is not configured.

        Read at each connection. The first credential while it lasts: only
        the account's own token sits on the channel a change is told on, and
        ai-agents' ``/ws`` takes no narrowed token. Once it has run out, the
        one held now, never an expired one: until ai-agents takes it the
        socket is not held, and the poll stands in.
        """
        if self._socket_url_override is not None:
            return self._socket_url_override or None
        ai_agents_url = (os.environ.get(AI_AGENTS_URL_VARIABLE) or "").strip()
        credential = (
            self._credential
            if self._credential and not _expired(self._credential)
            else self.credential_now()
        )
        if not ai_agents_url or not credential:
            return None
        return ai_agents_socket_url(ai_agents_url, credential)

    def _source(self, token: Optional[str]) -> Optional[PolicySource]:
        if self._source_override is not None:
            return self._source_override
        credential = (
            os.environ.get(API_KEY_VARIABLE)
            or token
            or os.environ.get(TOKEN_VARIABLE)
            or ""
        ).strip()
        if not credential:
            return None
        iam_url = (os.environ.get(IAM_URL_VARIABLE) or "").strip().rstrip("/")
        if not iam_url:
            if not self._said_unmanaged:
                logger.warning(
                    "The Shield runs unmanaged here: a token is held but %s is not set, "
                    "so no policy of IAM's is read; the application's Rules decide",
                    IAM_URL_VARIABLE,
                )
                self._said_unmanaged = True
            return None
        account = account_of_token(credential)
        if not account:
            raise PolicyUnavailable(
                "The Shield cannot read its policy: the runtime's token names no account, "
                "so IAM cannot be asked for its documents"
            )
        self._credential = credential
        self._account = account
        return CurrentCredentialSource(iam_url, self.credential_now, account)

    def managed(self, token: Optional[str] = None) -> Optional[ManagedPolicies]:
        """Build the managed documents once; ``None`` on an unmanaged runtime."""
        if self._managed is None:
            source = self._source(token)
            if source is None:
                return None
            self._managed = ManagedPolicies(source, poll_seconds=self.poll_seconds)
        return self._managed

    @property
    def is_managed(self) -> bool:
        return self._managed is not None

    # -- reading -----------------------------------------------------------------------

    def in_force(self, token: Optional[str] = None) -> List[Policy]:
        """Read IAM's documents for this runtime: ``[]`` unmanaged; raises ``PolicyUnavailable``."""
        managed = self.managed(token)
        if managed is None:
            return []
        if self._listeners:
            # A listener that came before the first read: watched from now on.
            self.ensure_watching()
        return managed.in_force()

    @property
    def last_refusal(self) -> Optional[str]:
        return self._managed.last_refusal if self._managed is not None else None

    # -- watching ----------------------------------------------------------------------

    def listen(
        self, on_change: OnChange, on_unavailable: OnUnavailable
    ) -> Callable[[], None]:
        """Listen for a changed set of documents, or an outage; returns how to stop."""
        pair = (on_change, on_unavailable)
        self._listeners.append(pair)
        self.ensure_watching()

        def stop() -> None:
            if pair in self._listeners:
                self._listeners.remove(pair)
            if not self._listeners:
                self.stop_watching()

        return stop

    def ensure_watching(self) -> None:
        """Start the poll, and the socket, on this loop if a managed runtime is not watching yet."""
        if self._managed is None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._watcher is None or self._watcher.done():
            self._watcher = loop.create_task(
                self._managed.watch(self._changed, on_unavailable=self._unavailable),
                name="shield-policies",
            )
        if (self._socket is None or self._socket.done()) and self.socket_url():
            self._socket = loop.create_task(
                self._hold_socket(), name="shield-policies-socket"
            )

    def stop_watching(self) -> None:
        for task in (self._watcher, self._socket):
            if task is not None:
                task.cancel()
        self._watcher = None
        self._socket = None

    async def refresh_now(self) -> None:
        """Pull IAM now (told of a change); a changed set reaches the listeners."""
        if self._managed is None:
            return
        from agent_shield.saas import fingerprint

        before = (
            fingerprint(self._managed.kept.policies)
            if self._managed.kept is not None
            else None
        )
        try:
            policies = await asyncio.to_thread(self._managed.pull)
        except PolicyUnavailable as unavailable:
            await self._unavailable(str(unavailable))
            return
        if fingerprint(policies) != before:
            await self._changed(policies)

    async def _hold_socket(self) -> None:
        """Hold ai-agents' ``/ws``; each ``shield_policy_changed`` pulls IAM at once.

        A lost socket is opened again after a pause, with the credential
        held by then (`socket_url`); the poll stands in meanwhile. Never
        raises: a runtime whose ai-agents cannot be reached is polled, and
        said so once.
        """
        from websockets.asyncio.client import connect

        said = False
        pause = 1.0
        while True:
            url = self.socket_url()
            if url is None:
                return
            try:
                async with connect(url, open_timeout=10.0) as socket:
                    logger.info(
                        "Shield policies: listening for a push over ai-agents' socket"
                    )
                    said = False
                    pause = 1.0
                    async for raw in socket:
                        try:
                            message = json.loads(raw)
                        except (TypeError, ValueError):
                            continue
                        if (
                            isinstance(message, dict)
                            and message.get("event") == SOCKET_EVENT
                        ):
                            told = message.get("data") or {}
                            logger.info(
                                "Shield policies: told of a change (%s %s, version %s); pulling IAM now",
                                told.get("scope", "?"),
                                told.get("subject_uid", "?"),
                                told.get("version", "?"),
                            )
                            self.pushed += 1
                            await self.refresh_now()
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001 - the socket is a courtesy; the poll stands in
                if not said:
                    logger.warning(
                        "Shield policies: ai-agents' socket is not held (%s); the poll stands in",
                        error,
                    )
                    said = True
            await asyncio.sleep(pause)
            pause = min(pause * 2, SOCKET_RETRY_SECONDS)

    async def _changed(self, policies: List[Policy]) -> None:
        logger.info(
            "Shield policies changed: %s",
            ", ".join(p.scope for p in policies) or "none",
        )
        for on_change, _ in list(self._listeners):
            result = on_change(policies)
            if asyncio.iscoroutine(result):
                await result

    async def _unavailable(self, sentence: str) -> None:
        logger.error("%s", sentence)
        for _, on_unavailable in list(self._listeners):
            result = on_unavailable(sentence)
            if asyncio.iscoroutine(result):
                await result


_RUNTIME = RuntimePolicies()


def runtime_policies() -> RuntimePolicies:
    """The runtime's one holder of IAM's documents."""
    return _RUNTIME


def use_source(source: Optional[PolicySource]) -> None:
    """For a test: a fake in IAM's place; ``None`` to read the environment again."""
    _RUNTIME.use_source(source)

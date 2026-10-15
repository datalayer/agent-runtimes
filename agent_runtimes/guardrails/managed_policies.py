# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Shield's policies from IAM, on a runtime (SHIELD §6.7, SH-50; decisions 10 and 11).

A Datalayer runtime is **managed**: the organization's and the teams' Shield
documents are IAM's, pulled for the account the runtime runs under
(``agent_shield.saas.ManagedPolicies`` over ``GET
/mcp-policies/shield/accounts/{account_uid}`` with the runtime's token),
kept until their ``expires``, and polled every thirty seconds while any
agent of the runtime listens — so a change an administrator saves reaches a
running harness within a minute. The engine is the package's; this module is
the runtime's one place that knows IAM's URL and the account's token, and
that fans a change out to every agent and every session's budget.

**Fail closed.** With a token and IAM's URL, a policy that cannot be read and
no unexpired copy is :class:`agent_shield.saas.PolicyUnavailable`, a
sentence naming IAM: the harness is refused with it at creation, and every
further action of a running one is refused with it until IAM answers. A
runtime with no token at all — the terminal's ``loop``, a test — is
**unmanaged**: the application's Rules and decision 5's default alone, as
the standalone proxy runs on its file. A token without IAM's URL is a
misconfiguration and refused, never run unmanaged.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import os
from typing import Awaitable, Callable, List, Optional, Tuple, Union

from agent_shield.policy import Policy
from agent_shield.saas import (
    POLL_SECONDS,
    IamPolicySource,
    ManagedPolicies,
    PolicySource,
    PolicyUnavailable,
)

logger = logging.getLogger(__name__)

__all__ = [
    "PolicyUnavailable",
    "RuntimePolicies",
    "account_of_token",
    "runtime_policies",
    "use_source",
]

#: The variables the runtime reads IAM and its token from (the configure route sets the token).
IAM_URL_VARIABLE = "DATALAYER_IAM_URL"
TOKEN_VARIABLE = "DATALAYER_USER_TOKEN"  # noqa: S105 - a variable's name, not a secret

OnChange = Callable[[List[Policy]], Union[None, Awaitable[None]]]
OnUnavailable = Callable[[str], Union[None, Awaitable[None]]]


def account_of_token(token: str) -> str:
    """The account a token is minted for, read unverified: IAM verifies it at the route.

    The claims carry the person under ``user`` (the current layout), under a
    ``sub`` mapping (the earlier one) or at the top (``uid``); a token
    carrying none is no account, said as ``""``.
    """
    parts = token.split(".")
    if len(parts) != 3:
        return ""
    try:
        claims = json.loads(
            base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4))
        )
    except (ValueError, binascii.Error):
        return ""
    if not isinstance(claims, dict):
        return ""
    for holder in (claims.get("user"), claims.get("sub"), claims):
        if isinstance(holder, dict) and str(holder.get("uid") or "").strip():
            return str(holder["uid"]).strip()
    sub = claims.get("sub")
    return str(sub).strip() if isinstance(sub, str) else ""


class RuntimePolicies:
    """The documents in force on this runtime, and who is told when they change."""

    def __init__(self) -> None:
        self._managed: Optional[ManagedPolicies] = None
        self._source_override: Optional[PolicySource] = None
        self._listeners: List[Tuple[OnChange, OnUnavailable]] = []
        self._watcher: Optional[asyncio.Task[None]] = None
        self.poll_seconds = POLL_SECONDS

    # -- configuration -----------------------------------------------------------------

    def use_source(self, source: Optional[PolicySource]) -> None:
        """Use a source in IAM's place (a test's fake); ``None`` reads the environment again."""
        self._source_override = source
        self._managed = None
        self.stop_watching()

    def _source(self, token: Optional[str]) -> Optional[PolicySource]:
        if self._source_override is not None:
            return self._source_override
        credential = (token or os.environ.get(TOKEN_VARIABLE) or "").strip()
        if not credential:
            return None
        iam_url = (os.environ.get(IAM_URL_VARIABLE) or "").strip().rstrip("/")
        if not iam_url:
            raise PolicyUnavailable(
                "The Shield cannot read its policy: this runtime has a token but no "
                f"{IAM_URL_VARIABLE}, so IAM cannot be asked and no policy is honoured "
                "(SHIELD decision 11)"
            )
        account = account_of_token(credential)
        if not account:
            raise PolicyUnavailable(
                "The Shield cannot read its policy: the runtime's token names no account, "
                "so IAM cannot be asked for its documents (SHIELD decision 11)"
            )
        return IamPolicySource(iam_url, credential, account)

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
        """Start the poll on this loop if a managed runtime is not watching yet."""
        if self._managed is None or (
            self._watcher is not None and not self._watcher.done()
        ):
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._watcher = loop.create_task(
            self._managed.watch(self._changed, on_unavailable=self._unavailable),
            name="shield-policies",
        )

    def stop_watching(self) -> None:
        if self._watcher is not None:
            self._watcher.cancel()
            self._watcher = None

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

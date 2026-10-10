# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""*Do it if I asked*, decided from what the person approved in advance (LOOP U-25).

A rule that says *Do it if I asked* acts only on what the person approved
before — *send replies to my team, until Friday* — and asks otherwise. Never
from a model's reading of the conversation: from an approval the person gave,
can read back and can revoke, kept by IAM as a task grant of theirs whose one
detail is `datalayer_approval` (an application, an action, to whom, until
when, their words).

**What covers a call.** An approval of the application, standing (neither
revoked nor ended), for an action the call does — and every class the call
has is that action or reading, so an approval to send never covers a tool
that sends and deletes. When it names recipients, every recipient the call's
arguments name is one of them — an address, everyone at a domain
(`@example.com`) or a channel (`#support`) — and a call naming none is not
covered: *to my team* is not *to anyone*.

**Where they are read.** At the tool call, from IAM
(`GET /api/iam/v1/oauth/task-grants/approvals/standing?app_uid=`), with the
token the application acts with (`record.token_for`): a deployment's
principal's — IAM answers its owner's, for its own application only — else
the person's whose Preview it is. Answers are kept `TTL_SECONDS`, so a revoke
is honoured within that window. One that cannot be read is no approval: the
person is asked, and the record says why.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional, Tuple

from agent_runtimes.loop.apps.rules import Decision

logger = logging.getLogger(__name__)

#: How long the approvals read from IAM are kept: a revoke is honoured within it.
TTL_SECONDS = 10.0

#: The arguments a call names its recipients in.
RECIPIENT_KEYS: Tuple[str, ...] = (
    "to",
    "cc",
    "bcc",
    "recipient",
    "recipients",
    "email",
    "emails",
    "address",
    "addresses",
    "attendees",
    "channel",
    "channels",
)

#: A class every action may come with: reading needs no approval.
READ = "read"


@dataclass(frozen=True)
class Approval:
    """One approval given in advance, as IAM answers it."""

    uid: str
    app_uid: str
    action: str
    to: Tuple[str, ...]
    words: str
    until: str

    @classmethod
    def of(cls, raw: Mapping[str, Any]) -> "Approval":
        """Read one approval as IAM answers it."""
        return cls(
            uid=str(raw.get("uid") or ""),
            app_uid=str(raw.get("app_uid") or ""),
            action=str(raw.get("action") or ""),
            to=tuple(str(item).lower() for item in raw.get("to") or ()),
            words=str(raw.get("words") or ""),
            until=str(raw.get("until") or ""),
        )

    @property
    def sentence(self) -> str:
        """What the person approved, in their words, and until when."""
        return f"You approved in advance: “{self.words}”, until {self.until[:10]}."


def _values(value: Any) -> List[str]:
    """The addresses one argument names: a list, a comma-separated text, objects with an email."""
    if isinstance(value, str):
        return [part.strip() for part in value.replace(";", ",").split(",")]
    if isinstance(value, (list, tuple)):
        found: List[str] = []
        for item in value:
            if isinstance(item, Mapping):
                found += _values(item.get("email") or item.get("address") or "")
            else:
                found += _values(item)
        return found
    if isinstance(value, Mapping):
        return _values(value.get("email") or value.get("address") or "")
    return []


def recipients_of(arguments: Optional[Mapping[str, Any]]) -> List[str]:
    """
    The recipients a call's arguments name, lower-cased.

    An address in a name (`Ana <ana@example.com>`) is read as the address.
    """
    found: List[str] = []
    for key, value in (arguments or {}).items():
        if str(key).lower() not in RECIPIENT_KEYS:
            continue
        for item in _values(value):
            item = item.strip().lower()
            if "<" in item and item.endswith(">"):
                item = item[item.rindex("<") + 1 : -1].strip()
            if item and item not in found:
                found.append(item)
    return found


def reaches(recipient: str, allowed: str) -> bool:
    """Whether one recipient is one an approval names: itself, its domain, or its channel."""
    recipient = recipient.lower()
    if allowed.startswith("#"):
        return recipient.lstrip("#") == allowed[1:]
    if allowed.startswith("@"):
        return "@" in recipient and recipient.rsplit("@", 1)[1] == allowed[1:]
    return recipient == allowed


def _standing(approval: Approval, now: Optional[datetime] = None) -> bool:
    """Whether an approval has not ended (IAM answers only those not revoked)."""
    if not approval.until:
        return False
    try:
        until = datetime.fromisoformat(approval.until.replace("Z", "+00:00"))
    except ValueError:
        return False
    until = until if until.tzinfo else until.replace(tzinfo=timezone.utc)
    return until > (now or datetime.now(timezone.utc))


def covers(
    approval: Approval,
    decision: Decision,
    arguments: Optional[Mapping[str, Any]] = None,
    *,
    now: Optional[datetime] = None,
) -> bool:
    """Whether an approval given in advance covers one call, as decided."""
    if not _standing(approval, now):
        return False
    classes = set(decision.classes)
    if approval.action not in classes or not classes <= {approval.action, READ}:
        return False
    if not approval.to:
        return True
    named = recipients_of(arguments)
    return bool(named) and all(
        any(reaches(recipient, allowed) for allowed in approval.to)
        for recipient in named
    )


#: What the capability asks before it asks the person: the approval covering a call, if any.
Granted = Callable[[str, Mapping[str, Any], Decision], Awaitable[Optional[Approval]]]

#: How the standing approvals are read: the application, the deployment; the approvals out.
Read = Callable[[str, str], Awaitable[List[Dict[str, Any]]]]


class ApprovalsNotRead(RuntimeError):
    """The approvals could not be read, and why, in a sentence."""


async def read_from_iam(app_uid: str, deployment_uid: str) -> List[Dict[str, Any]]:
    """The standing approvals of an application, from IAM, with the token it acts with."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.loop.apps.record import token_for

    token, refusal = token_for(deployment_uid)
    if not token:
        raise ApprovalsNotRead(f"Its approvals could not be read: {refusal}")
    url = getattr(DatalayerURLs.from_environment(), "iam_url", "") or ""
    if not url:
        raise ApprovalsNotRead(
            "Its approvals could not be read: no IAM to read them from."
        )
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{url.rstrip('/')}/api/iam/v1/oauth/task-grants/approvals/standing",
            params={"app_uid": app_uid},
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 300:
        raise ApprovalsNotRead(
            f"Its approvals could not be read: IAM answered {response.status_code}."
        )
    return list(response.json().get("approvals") or [])


@dataclass
class StandingApprovals:
    """The approvals given in advance for one application, read at the tool call."""

    app_uid: str
    deployment_uid: str = ""
    read: Read = read_from_iam
    #: Told why, when they could not be read: the person is asked instead.
    unread: Optional[Callable[[str], None]] = None
    _kept: Tuple[float, List[Approval]] = field(
        default=(0.0, []), init=False, repr=False
    )

    async def approvals(self) -> List[Approval]:
        """The standing ones, read again after `TTL_SECONDS`."""
        moment = time.monotonic()
        if self._kept[0] and moment - self._kept[0] <= TTL_SECONDS:
            return self._kept[1]
        try:
            found = [
                Approval.of(raw)
                for raw in await self.read(self.app_uid, self.deployment_uid)
            ]
        except Exception as error:  # noqa: BLE001 - no approval: the person is asked
            logger.warning("Approvals of %s not read: %s", self.app_uid, error)
            if self.unread is not None:
                self.unread(str(error))
            return []
        self._kept = (moment, found)
        return found

    async def granted(
        self, tool_name: str, arguments: Mapping[str, Any], decision: Decision
    ) -> Optional[Approval]:
        """The approval covering a call, or None: then the person is asked."""
        for approval in await self.approvals():
            if approval.app_uid == self.app_uid and covers(
                approval, decision, arguments
            ):
                return approval
        return None

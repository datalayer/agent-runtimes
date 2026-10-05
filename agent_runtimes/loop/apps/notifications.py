# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's notifications, sent through the channels it names (LOOP R-37).

An Appspec's ``notifications`` lists where an approval reaches a person —
``email``, ``slack``, ``teams`` — and those are the channels the runtime
sends through for its sessions, not the ones its agent's own spec names
(which an application's agent is not given).

**The event.** An application notifies when it asks a person before it acts:
a rule that says *Ask me first* (or *Do it if I asked*, until grants are
recorded), or a Gate that asks — each time the question goes through the
tool-approval path, where nobody may be watching. A question asked in the
terminal the person is typing in is not notified: they are already there.

**Where it is sent from.** ai-agents sends (``POST /api/ai-agents/v1/apps/
notifications``): mail through Datalayer's mail to the account's own address,
Slack to the incoming webhook kept among the account's secrets as
``SLACK_WEBHOOK_URL``. The runtime holds neither the mail server nor, for a
deployment, the owner's secrets.

**As whom.** A deployment's runtime asks with its application's principal's
token (LOOP I-03), so what is sent reaches the application's owner, in the
owner's channels. A Preview — a builder trying a draft — asks with the
person's own token, so it reaches that person, in their own channels, and
nobody else: that is how a builder sees the channels work before shipping.

**Never silent.** A channel Datalayer does not offer (Teams today) is refused
here with the sentence the setup states say (LOOP R-27) and not sent; one
ai-agents could not send through — no address, no ``SLACK_WEBHOOK_URL``, a
webhook that refused — comes back with its sentence. Every channel's outcome
is written to the application's record, as a ``notification`` entry, whatever
``record.include`` says, and logged when it was not sent. A notification
never stops the question it is about.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional

from agent_runtimes.loop.apps.record import AppRecorder, current_session, token_for
from agent_runtimes.types import AppSpec

logger = logging.getLogger(__name__)

#: The one event an application notifies on: it asks a person before it acts.
APPROVAL_REQUESTED = "approval.requested"

#: What a channel's sending came to.
SENT = "sent"
REFUSED = "refused"
FAILED = "failed"

#: How a notification is sent: the body for ai-agents in, each channel's outcome out.
Send = Callable[[Dict[str, Any]], Awaitable[List[Dict[str, Any]]]]


class NotificationsNotSent(RuntimeError):
    """Nothing reached ai-agents, and why, in a sentence."""


def _id_of(ref: str) -> str:
    """Return a channel's id without its version: ``slack:0.0.1`` is ``slack``."""
    base, _, version = str(ref).rpartition(":")
    return base if base and "." in version else str(ref)


def not_offered(name: str, app: str) -> str:
    """Return R-27's sentence for a channel Datalayer does not offer."""
    return f"{name} is not offered as a channel yet: nothing {app} sends reaches it."


async def send_to_ai_agents(body: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Ask ai-agents to send a notification through its channels.

    With the token the application writes its record with (`token_for`): a
    deployment's principal's, else the person's.

    Raises
    ------
    NotificationsNotSent
        When there is no token or no ai-agents, or ai-agents refused the
        request as a whole.
    """
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    token, refusal = token_for(str(body.get("deployment_uid") or ""))
    if not token:
        raise NotificationsNotSent(f"Nothing was sent: {refusal}")
    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise NotificationsNotSent("Nothing was sent: no ai-agents to send it.")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/notifications",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code >= 300:
        raise NotificationsNotSent(
            f"Nothing was sent: ai-agents answered {response.status_code}: "
            f"{response.text[:200]}"
        )
    return list(response.json().get("channels") or [])


@dataclass
class AppNotifier:
    """Send an application's notifications through the channels it names."""

    app: AppSpec
    recorder: Optional[AppRecorder] = None
    #: The application as the platform knows it; its id otherwise.
    app_uid: str = ""
    deployment_uid: str = ""
    send: Send = send_to_ai_agents

    def channels(self) -> List[str]:
        """The channels it names, by id, each once, in its order."""
        seen: List[str] = []
        for ref in self.app.notifications:
            channel = _id_of(ref)
            if channel and channel not in seen:
                seen.append(channel)
        return seen

    def _offered(self) -> tuple[List[str], List[Dict[str, Any]]]:
        """The channels to send through, and those refused here with their sentence."""
        from agent_runtimes.specs.notifications import get_notification_spec

        app = self.app.name.strip() or "It"
        offered: List[str] = []
        refused: List[Dict[str, Any]] = []
        for channel in self.channels():
            spec = get_notification_spec(channel)
            if spec is None:
                refused.append(
                    {
                        "channel": channel,
                        "delivery": REFUSED,
                        "detail": f"“{channel}” is no channel of Datalayer's: nothing {app} sends reaches it.",
                    }
                )
            elif spec.available is False:
                refused.append(
                    {
                        "channel": channel,
                        "delivery": REFUSED,
                        "detail": not_offered(spec.name, app),
                    }
                )
            else:
                offered.append(channel)
        return offered, refused

    async def notify(
        self, event: str, *, title: str, message: str
    ) -> List[Dict[str, Any]]:
        """Send one event through every channel it names; each outcome recorded.

        Returns
        -------
        list of dict
            ``{channel, delivery, detail}`` per channel: ``sent``, ``refused``
            (not set up, said in R-27's words) or ``failed``.
        """
        if not self.app.notifications:
            return []
        offered, outcomes = self._offered()
        if offered:
            body = {
                "app_uid": self.app_uid or self.app.id,
                "app_name": self.app.name,
                "deployment_uid": self.deployment_uid,
                "session_uid": current_session(),
                "event": event,
                "title": title,
                "message": message,
                "channels": offered,
            }
            try:
                outcomes += await self.send(body)
            except Exception as error:  # noqa: BLE001 - said in the record, never raised
                outcomes += [
                    {"channel": channel, "delivery": FAILED, "detail": str(error)[:300]}
                    for channel in offered
                ]
        for outcome in outcomes:
            self._record(event, outcome)
        return outcomes

    async def approval_asked(self, tool_name: str, sentence: str) -> None:
        """Tell the channels that it asks a person before it acts."""
        app = self.app.name.strip() or "An application"
        await self.notify(
            APPROVAL_REQUESTED,
            title=f"{app} asks before it acts",
            message=(
                f"{app} wants to use {tool_name}. {sentence} "
                "It waits for your answer under Tool Approvals, on Datalayer."
            ),
        )

    def _record(self, event: str, outcome: Dict[str, Any]) -> None:
        """Write one channel's outcome to the record; log it when it was not sent."""
        channel = str(outcome.get("channel") or "")
        delivery = str(outcome.get("delivery") or "")
        detail = str(outcome.get("detail") or "")
        if delivery != SENT:
            logger.warning(
                "%s: its %s notification was %s: %s",
                self.app.id,
                channel,
                delivery,
                detail,
            )
        if self.recorder is not None:
            self.recorder.add(
                "notification",
                f"{channel}: {delivery}" + (f" — {detail}" if detail else ""),
                {
                    "channel": channel,
                    "event": event,
                    "delivery": delivery,
                    "detail": detail,
                },
            )


__all__ = [
    "APPROVAL_REQUESTED",
    "AppNotifier",
    "FAILED",
    "NotificationsNotSent",
    "REFUSED",
    "SENT",
    "not_offered",
    "send_to_ai_agents",
]

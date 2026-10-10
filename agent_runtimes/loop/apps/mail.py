# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A mailbox for a worker that sorts mail (plans/LOOP.md §8.6: Inbox triage).

Inbox triage reaches mail through Gmail's tools, as the catalogue's Google
Workspace server serves them (`google-workspace__search_gmail_messages`…).
That server is not enabled on Datalayer: reaching a person's Gmail needs
Google's consent screen and, outside Datalayer's own domain, Google's review
(LOOP W-02, W-10). So that the worker runs end to end before then, this
module is the **mail source** it runs against:

- `MailSource` — what a worker needs of a mailbox;
- `FixtureMailbox` — a mailbox of example mail held in memory, for tests and
  demonstrations: what it was asked to do is kept (`effects`), and nothing
  leaves it;
- `gmail_toolset` — Gmail's tools under the names and with the arguments the
  Google Workspace server gives them, served from a source: the same
  Appspec, rules and record run on it as on Gmail, and the same call is
  decided the same way (`user_google_email` says the mailbox, so that a
  forward outside the organization is told from the call);
- `MailWatch` and `post_mail_event` — what arrived since it last looked, as
  `email_received` events, told to ai-agents, which wakes the deployments
  whose Appspec says *when a message arrives* (LOOP R-14, W-03).

An event carries the ids of what arrived and nothing written by its sender:
the session reads the message with its tools, under its rules.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from typing import (
    Any,
    Callable,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Protocol,
    Sequence,
    Tuple,
    TypeVar,
)

import httpx

from agent_runtimes.loop.apps.rules import addresses

_T = TypeVar("_T")

#: The server whose tools a mail source is served as.
SERVER = "google-workspace"

#: The event a message arriving is, as an Appspec's trigger names it.
MAIL_RECEIVED = "email_received"

#: Gmail's own labels, which every mailbox has.
SYSTEM_LABELS: Tuple[str, ...] = (
    "INBOX",
    "UNREAD",
    "STARRED",
    "IMPORTANT",
    "SENT",
    "DRAFT",
    "SPAM",
    "TRASH",
)


class MailRefused(ValueError):
    """What a mailbox refused, in a sentence: the tool answers it, and nothing is done."""


@dataclass(frozen=True)
class MailMessage:
    """One message of a mailbox."""

    id: str
    thread_id: str
    sender: str
    to: Tuple[str, ...]
    subject: str
    body: str
    received_at: str
    labels: Tuple[str, ...] = ("INBOX", "UNREAD")
    cc: Tuple[str, ...] = ()

    @classmethod
    def of(cls, data: Mapping[str, Any]) -> "MailMessage":
        """A message from plain data: `id`, `thread_id`, `from`, `to`, `subject`, `body`, `received_at`, `labels`."""
        missing = [
            key
            for key in ("id", "from", "to", "subject", "body", "received_at")
            if not data.get(key)
        ]
        if missing:
            raise MailRefused(f"A message says no {', '.join(missing)}.")
        return cls(
            id=str(data["id"]),
            thread_id=str(data.get("thread_id") or data["id"]),
            sender=str(data["from"]),
            to=tuple(addresses(data["to"])),
            cc=tuple(addresses(data.get("cc"))),
            subject=str(data["subject"]),
            body=str(data["body"]),
            received_at=str(data["received_at"]),
            labels=tuple(data.get("labels") or ("INBOX", "UNREAD")),
        )


class MailSource(Protocol):
    """What a worker needs of a mailbox. Each method refuses with `MailRefused`."""

    @property
    def address(self) -> str:
        """The mailbox's own address."""
        ...

    def search(self, query: str, limit: int) -> List[MailMessage]:
        """The messages a Gmail query finds, newest first."""
        ...

    def message(self, message_id: str) -> MailMessage:
        """One message."""
        ...

    def thread(self, thread_id: str) -> List[MailMessage]:
        """A thread's messages, oldest first."""
        ...

    def labels(self) -> List[str]:
        """The labels of the mailbox."""
        ...

    def change_labels(
        self, message_id: str, add: Sequence[str], remove: Sequence[str]
    ) -> MailMessage:
        """Add and remove labels of a message; the message as it is then."""
        ...

    def draft(self, message: Mapping[str, Any]) -> str:
        """Keep a draft; its id."""
        ...

    def send(self, message: Mapping[str, Any]) -> str:
        """Send a message — a new one, a reply or a forward; its id."""
        ...


def _matches(message: MailMessage, query: str) -> bool:
    """Whether a message answers a Gmail query, in the words a triage uses.

    `in:<label>`, `label:<label>`, `is:unread`, `is:starred`, `from:<text>`,
    `subject:<text>`, `newer_than:` (ignored: the mailbox is a moment), and
    words, looked for in the subject and the body.
    """
    labels = {label.lower() for label in message.labels}
    text = f"{message.subject}\n{message.body}".lower()
    for word in re.findall(r'"[^"]*"|\S+', query or ""):
        word = word.strip('"').lower()
        key, _, value = word.partition(":")
        if value and key in ("in", "label"):
            if value not in labels:
                return False
        elif value and key == "is":
            if value not in labels:
                return False
        elif value and key == "from":
            if value not in message.sender.lower():
                return False
        elif value and key == "subject":
            if value not in message.subject.lower():
                return False
        elif value and key in ("newer_than", "older_than", "after", "before"):
            continue
        elif word not in text:
            return False
    return True


@dataclass
class FixtureMailbox:
    """A mailbox of example mail, held in memory.

    For tests and demonstrations: it is never a person's mail. What it was
    asked to do — labels changed, drafts kept, messages sent — is kept in
    `effects`, in order; a message sent stays here.
    """

    owner: str
    """The mailbox's own address: its domain is the organization."""

    messages: List[MailMessage]
    """Its messages, in the order they arrived."""

    extra_labels: List[str] = field(default_factory=list)
    """The labels its owner made besides Gmail's own."""

    effects: List[Dict[str, Any]] = field(default_factory=list)
    """What it was asked to do, in order."""

    _drafts: int = 0
    _sent: int = 0

    @classmethod
    def of(cls, data: Mapping[str, Any]) -> "FixtureMailbox":
        """A mailbox from plain data: `address`, `labels`, `messages`."""
        address = addresses(data.get("address"))
        if not address:
            raise MailRefused("A mailbox says its own address.")
        return cls(
            owner=address[0],
            messages=[MailMessage.of(item) for item in data.get("messages") or []],
            extra_labels=[str(label) for label in data.get("labels") or []],
        )

    @property
    def address(self) -> str:
        return self.owner

    def arrive(self, message: Mapping[str, Any]) -> MailMessage:
        """A message arrives."""
        arrived = MailMessage.of(message)
        if any(found.id == arrived.id for found in self.messages):
            raise MailRefused(f"Message {arrived.id} is already in the mailbox.")
        self.messages.append(arrived)
        return arrived

    def search(self, query: str, limit: int) -> List[MailMessage]:
        found = [message for message in self.messages if _matches(message, query)]
        return list(reversed(found))[: max(1, int(limit))]

    def message(self, message_id: str) -> MailMessage:
        for message in self.messages:
            if message.id == message_id:
                return message
        raise MailRefused(f"No message {message_id} in {self.owner}.")

    def thread(self, thread_id: str) -> List[MailMessage]:
        found = [message for message in self.messages if message.thread_id == thread_id]
        if not found:
            raise MailRefused(f"No thread {thread_id} in {self.owner}.")
        return found

    def labels(self) -> List[str]:
        return [*SYSTEM_LABELS, *self.extra_labels]

    def change_labels(
        self, message_id: str, add: Sequence[str], remove: Sequence[str]
    ) -> MailMessage:
        known = set(self.labels())
        unknown = sorted({*add, *remove} - known)
        if unknown:
            raise MailRefused(f"No label {', '.join(unknown)} in {self.owner}.")
        message = self.message(message_id)
        labels = [label for label in message.labels if label not in remove]
        labels.extend(label for label in add if label not in labels)
        changed = replace(message, labels=tuple(labels))
        self.messages[self.messages.index(message)] = changed
        self.effects.append(
            {
                "kind": "labels",
                "message_id": message_id,
                "add": list(add),
                "remove": list(remove),
            }
        )
        return changed

    def draft(self, message: Mapping[str, Any]) -> str:
        self._drafts += 1
        draft_id = f"draft-{self._drafts}"
        self.effects.append({"kind": "draft", "draft_id": draft_id, **message})
        return draft_id

    def send(self, message: Mapping[str, Any]) -> str:
        if message.get("forward_message_id"):
            self.message(str(message["forward_message_id"]))
        self._sent += 1
        sent_id = f"sent-{self._sent}"
        self.effects.append({"kind": "sent", "message_id": sent_id, **message})
        return sent_id

    def done(self, kind: str) -> List[Dict[str, Any]]:
        """What it was asked to do of one kind: `labels`, `draft` or `sent`."""
        return [effect for effect in self.effects if effect["kind"] == kind]


# --- Gmail's tools, served from a source -----------------------------------------------


def _said(message: MailMessage, *, whole: bool) -> str:
    lines = [
        f"Message ID: {message.id}",
        f"Thread ID: {message.thread_id}",
        f"From: {message.sender}",
        f"To: {', '.join(message.to)}",
        *([f"Cc: {', '.join(message.cc)}"] if message.cc else []),
        f"Subject: {message.subject}",
        f"Date: {message.received_at}",
        f"Labels: {', '.join(message.labels)}",
    ]
    if whole:
        lines += ["", message.body]
    return "\n".join(lines)


def _listed(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return [str(item) for item in value]


def _recipients(value: Any) -> List[str]:
    found = addresses(value)
    if value and not found:
        raise MailRefused(f"No mail address in {value!r}.")
    return found


def gmail_toolset(source: MailSource) -> Any:
    """The Gmail tools, as the Google Workspace server names them and takes
    their arguments, served from a mail source.

    Each takes the mailbox it acts on (`user_google_email`) and refuses
    another: a worker reaches the one mailbox it is given. What a source
    refuses is answered as the tool's error, and nothing is done.

    Returns
    -------
    FunctionToolset
        `google-workspace__search_gmail_messages`,
        `google-workspace__get_gmail_message_content`,
        `google-workspace__get_gmail_thread_content`,
        `google-workspace__list_gmail_labels`,
        `google-workspace__modify_gmail_message_labels`,
        `google-workspace__batch_modify_gmail_message_labels`,
        `google-workspace__draft_gmail_message` and
        `google-workspace__send_gmail_message`.
    """
    from pydantic_ai import ModelRetry
    from pydantic_ai.toolsets import FunctionToolset

    def mailbox(user_google_email: str) -> None:
        said = addresses(user_google_email)
        if not said or said[0] != source.address.lower():
            raise ModelRetry(
                f"This worker reaches one mailbox, {source.address}: "
                f"say it as user_google_email, not {user_google_email!r}."
            )

    def answered(call: Callable[[], _T]) -> _T:
        try:
            return call()
        except MailRefused as refused:
            raise ModelRetry(str(refused)) from None

    toolset: FunctionToolset[Any] = FunctionToolset()

    def tool(name: str) -> Any:
        return toolset.tool_plain(name=f"{SERVER}__{name}")

    @tool("search_gmail_messages")
    def search_gmail_messages(
        query: str, user_google_email: str, page_size: int = 10
    ) -> str:
        """Search the mailbox with a Gmail query (`in:inbox is:unread`); the messages' ids, senders and subjects."""
        mailbox(user_google_email)
        found = answered(lambda: source.search(query, page_size))
        if not found:
            return f"No message matches {query!r}."
        return "\n\n".join(_said(message, whole=False) for message in found)

    @tool("get_gmail_message_content")
    def get_gmail_message_content(message_id: str, user_google_email: str) -> str:
        """One message, its body included."""
        mailbox(user_google_email)
        return _said(answered(lambda: source.message(message_id)), whole=True)

    @tool("get_gmail_thread_content")
    def get_gmail_thread_content(thread_id: str, user_google_email: str) -> str:
        """A thread's messages, oldest first, their bodies included."""
        mailbox(user_google_email)
        found = answered(lambda: source.thread(thread_id))
        return "\n\n---\n\n".join(_said(message, whole=True) for message in found)

    @tool("list_gmail_labels")
    def list_gmail_labels(user_google_email: str) -> str:
        """The mailbox's labels."""
        mailbox(user_google_email)
        return "\n".join(source.labels())

    @tool("modify_gmail_message_labels")
    def modify_gmail_message_labels(
        user_google_email: str,
        message_id: str,
        add_label_ids: Optional[List[str]] = None,
        remove_label_ids: Optional[List[str]] = None,
    ) -> str:
        """Add and remove labels of a message: removing INBOX archives it."""
        mailbox(user_google_email)
        add, remove = _listed(add_label_ids), _listed(remove_label_ids)
        if not add and not remove:
            raise ModelRetry("Say the labels to add or to remove.")
        changed = answered(lambda: source.change_labels(message_id, add, remove))
        return (
            f"Message {changed.id}: labels now {', '.join(changed.labels) or 'none'}."
        )

    @tool("batch_modify_gmail_message_labels")
    def batch_modify_gmail_message_labels(
        user_google_email: str,
        message_ids: List[str],
        add_label_ids: Optional[List[str]] = None,
        remove_label_ids: Optional[List[str]] = None,
    ) -> str:
        """Add and remove labels of several messages."""
        mailbox(user_google_email)
        add, remove = _listed(add_label_ids), _listed(remove_label_ids)
        if not add and not remove:
            raise ModelRetry("Say the labels to add or to remove.")
        lines = []
        for message_id in _listed(message_ids):
            changed = answered(lambda: source.change_labels(message_id, add, remove))
            lines.append(
                f"Message {changed.id}: labels now {', '.join(changed.labels)}."
            )
        return "\n".join(lines)

    def outgoing(
        *,
        subject: str,
        body: str,
        to: Any,
        cc: Any,
        bcc: Any,
        thread_id: Optional[str],
        in_reply_to: Optional[str],
        forward_message_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if thread_id:
            answered(lambda: source.thread(thread_id))
        return {
            "from": source.address,
            "to": answered(lambda: _recipients(to)),
            "cc": answered(lambda: _recipients(cc)),
            "bcc": answered(lambda: _recipients(bcc)),
            "subject": subject,
            "body": body,
            **({"thread_id": thread_id} if thread_id else {}),
            **({"in_reply_to": in_reply_to} if in_reply_to else {}),
            **(
                {"forward_message_id": forward_message_id} if forward_message_id else {}
            ),
        }

    @tool("draft_gmail_message")
    def draft_gmail_message(
        user_google_email: str,
        subject: str,
        body: str,
        to: Optional[str] = None,
        cc: Optional[str] = None,
        bcc: Optional[str] = None,
        thread_id: Optional[str] = None,
        in_reply_to: Optional[str] = None,
    ) -> str:
        """Keep a draft — a reply when it names its thread. Nothing is sent."""
        mailbox(user_google_email)
        draft = outgoing(
            subject=subject,
            body=body,
            to=to,
            cc=cc,
            bcc=bcc,
            thread_id=thread_id,
            in_reply_to=in_reply_to,
        )
        return f"Draft {answered(lambda: source.draft(draft))} kept: nothing was sent."

    @tool("send_gmail_message")
    def send_gmail_message(
        user_google_email: str,
        to: str,
        subject: str,
        body: str,
        cc: Optional[str] = None,
        bcc: Optional[str] = None,
        thread_id: Optional[str] = None,
        in_reply_to: Optional[str] = None,
        forward_message_id: Optional[str] = None,
    ) -> str:
        """Send a message — a reply when it names its thread, a forward when it names the message forwarded."""
        mailbox(user_google_email)
        if not addresses(to):
            raise ModelRetry("Say who it is sent to.")
        message = outgoing(
            subject=subject,
            body=body,
            to=to,
            cc=cc,
            bcc=bcc,
            thread_id=thread_id,
            in_reply_to=in_reply_to,
            forward_message_id=forward_message_id,
        )
        return f"Message {answered(lambda: source.send(message))} sent."

    return toolset


# --- what arrived -----------------------------------------------------------------------


@dataclass
class MailWatch:
    """What arrived in a mailbox since it last looked, as events.

    It looks at the inbox (`in:inbox`), and remembers what it told: a
    message is told once. What it remembers is its own; a watch that starts
    again tells what is in the inbox again, unless given what it told
    (`told`).
    """

    source: MailSource
    told: set[str] = field(default_factory=set)
    limit: int = 50

    def arrived(self) -> List[Dict[str, Any]]:
        """The `email_received` events of what arrived, oldest first."""
        found = [
            message
            for message in reversed(self.source.search("in:inbox", self.limit))
            if message.id not in self.told
        ]
        self.told.update(message.id for message in found)
        return [mail_event(message) for message in found]


def mail_event(message: MailMessage) -> Dict[str, Any]:
    """The event of a message arriving: its ids and when, nothing its sender wrote."""
    return {
        "event": MAIL_RECEIVED,
        "details": {
            "message_id": message.id,
            "thread_id": message.thread_id,
            "received_at": message.received_at,
        },
    }


class MailEventNotSent(RuntimeError):
    """Why an event could not be told to ai-agents, in a sentence."""


def post_mail_event(
    *,
    ai_agents_url: str,
    deployment_uid: str,
    event: Mapping[str, Any],
    token: str,
    client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """Tell ai-agents that something happened to a deployment
    (`POST /api/ai-agents/v1/apps/deployments/{uid}/events`): it wakes the
    deployment at each trigger that names the event, as its owner.

    Returns what ai-agents answered: the triggers it woke. `MailEventNotSent`
    when it refused, or did not answer.
    """
    if not token:
        raise MailEventNotSent("No credential to tell ai-agents with.")
    url = f"{ai_agents_url.rstrip('/')}/api/ai-agents/v1/apps/deployments/{deployment_uid}/events"
    http = client or httpx.Client(timeout=30.0)
    try:
        response = http.post(
            url, json=dict(event), headers={"Authorization": f"Bearer {token}"}
        )
    except httpx.HTTPError as error:
        raise MailEventNotSent(f"ai-agents did not answer: {error}") from None
    finally:
        if client is None:
            http.close()
    if response.status_code >= 300:
        raise MailEventNotSent(
            f"ai-agents refused the event ({response.status_code}): {response.text[:300]}"
        )
    return response.json() if response.content else {}


def tell_arrivals(
    watch: MailWatch,
    *,
    ai_agents_url: str,
    deployment_uid: str,
    token: str,
    client: Optional[httpx.Client] = None,
) -> List[Dict[str, Any]]:
    """Tell ai-agents of each message that arrived since the watch last looked; what it answered, in order."""
    return [
        post_mail_event(
            ai_agents_url=ai_agents_url,
            deployment_uid=deployment_uid,
            event=event,
            token=token,
            client=client,
        )
        for event in watch.arrived()
    ]


def fixture_mailbox(
    messages: Iterable[Mapping[str, Any]], *, address: str, labels: Sequence[str] = ()
) -> FixtureMailbox:
    """A mailbox of example mail: its address, its messages, the labels its owner made."""
    return FixtureMailbox.of(
        {"address": address, "labels": list(labels), "messages": list(messages)}
    )


__all__ = [
    "MAIL_RECEIVED",
    "SERVER",
    "FixtureMailbox",
    "MailEventNotSent",
    "MailMessage",
    "MailRefused",
    "MailSource",
    "MailWatch",
    "fixture_mailbox",
    "gmail_toolset",
    "mail_event",
    "post_mail_event",
    "tell_arrivals",
]

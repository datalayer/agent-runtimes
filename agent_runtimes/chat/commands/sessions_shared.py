# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What the session commands of the REPL share: the session API of the
runtime the REPL talks to, reached as `LoopSession` reaches it, and the
sentence said when this conversation is no session yet.

The prompt's turns go to its agent's AG-UI endpoint whose threads are
sessions, so a conversation is a session from its first message — an
application's, or the session of an agent run as such — and ``/resume <uid>``
opens another here, its conversation loaded: ``/pause``, ``/swap``,
``/clone`` and ``/export`` act on it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

NOT_A_SESSION = (
    "This conversation is not a session yet: it is one from its first message, and "
    "`/resume <uid>` opens another (`/sessions` lists yours); then `/pause`, `/swap`, "
    "`/clone` and `/export` act on it."
)


def session_of(tux: "CliTux") -> Any:
    """The REPL's `LoopSession`, whichever attribute the front-end keeps it under."""
    return getattr(tux, "loop_session", None) or getattr(tux, "session", None)


def ask(tux: "CliTux", method: str, path: str, **kwargs: Any) -> httpx.Response:
    """A call to the runtime's session API, signed with the session's token when it has one.

    Raises
    ------
    RuntimeError
        The runtime's refusal, in its sentence.
    """
    session = session_of(tux)
    base = (
        session.api_base
        if session is not None
        else f"{tux.server_url.rstrip('/')}/api/v1"
    )
    token: Optional[str] = getattr(session, "token", None)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = httpx.request(
        method, f"{base}/apps/sessions{path}", headers=headers, timeout=120.0, **kwargs
    )
    if response.status_code >= 300:
        try:
            detail = response.json().get("detail")
        except ValueError:
            detail = response.text
        raise RuntimeError(
            str(detail or f"The runtime answered {response.status_code}.")
        )
    return response


def current_uid(tux: "CliTux") -> Optional[str]:
    """The session this conversation is, or ``None``."""
    session = session_of(tux)
    return getattr(session, "session_uid", None) if session is not None else None


async def load_conversation(
    tux: "CliTux", uid: str, messages: List[Dict[str, Any]]
) -> int:
    """Make the prompt's conversation the session's: its thread the
    session's uid, its messages what was asked and answered so far, so the
    next message is the session's next turn. How many messages were loaded.

    A prompt that does not send its turns to an agent's sessions — one
    connected to an address of another kind — loads nothing.
    """
    from agent_runtimes.loop.session import is_session_agui_url

    agent_url = str(getattr(tux, "agent_url", "") or "")
    if not is_session_agui_url(agent_url):
        return 0
    from agent_runtimes.transports.clients import AGUIClient

    client = getattr(tux, "_agui_client", None)
    if client is None:
        client = AGUIClient(agent_url)
        await client.connect()
        tux._agui_client = client
    conversation = client.conversation
    conversation.clear()
    conversation.thread_id = uid
    loaded = 0
    for message in messages:
        role, content = message.get("role"), message.get("content")
        if not isinstance(content, str) or not content:
            continue
        if role == "user":
            conversation.add_user_message(content)
        elif role == "assistant":
            conversation.add_assistant_message(
                content, str(message.get("id") or "") or None
            )
        else:
            continue
        loaded += 1
    return loaded

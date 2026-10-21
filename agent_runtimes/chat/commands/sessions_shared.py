# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What the session commands of the REPL share (MH-18): the session API of
the runtime the REPL talks to, reached as `LoopSession` reaches it, and the
sentence said when this conversation is no application session.

A conversation becomes a session with ``/resume <uid>``: from then on
``/swap``, ``/clone`` and ``/export`` act on it. The REPL's own turns still go
to its agent's AG-UI endpoint, which carries no thread of its own; driving
the session's thread from the prompt is the browser's and `loop sessions`'.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

NOT_A_SESSION = (
    "This conversation is not an application session: `/resume <uid>` opens one "
    "(`/sessions` lists yours), then `/swap`, `/clone` and `/export` act on it."
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
    """The application session this conversation is, or ``None``."""
    session = session_of(tux)
    return getattr(session, "session_uid", None) if session is not None else None

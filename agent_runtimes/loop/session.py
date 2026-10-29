# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a slash command is allowed to know about the session it runs in.

Commands used to reach into the terminal object for everything: ``tux.agent_id``,
``tux.server_url``, and whatever else happened to be an attribute. That couples
every command to one front-end, and there are three (a terminal, a browser
workspace, a JupyterLab panel).

:class:`LoopSession` is the seam. A command receives the session, not the UI, so
the same command can be driven from a prompt_toolkit prompt or from a React
workspace — and so a session can be handed from one to the other, which is what
``/browser`` does.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class LoopSession:
    """One conversation with one agent, wherever it is being driven from."""

    #: Base URL of the agent-runtimes server backing this session. Either the
    #: ephemeral process the CLI spawned on a free port, or a remote server.
    server_url: str
    #: Agent spec id currently bound to the session.
    agent_id: str = ""
    #: Conversation this session is continuing, when there is one.
    conversation_id: Optional[str] = None
    #: Active model id, as an agentspecs catalog id.
    model: Optional[str] = None
    #: Whether the server was started by this process — a spawned server dies
    #: with the session, a remote one does not, and a handoff has to know which.
    owns_server: bool = False
    #: Sandbox facts as last reported by the server (variant, running, kernel).
    sandbox: dict[str, Any] = field(default_factory=dict)
    #: Free-form extras a front-end wants to carry without subclassing.
    extras: dict[str, Any] = field(default_factory=dict)
    #: The application session this conversation is (MH-07): what `/swap`,
    #: `/clone` and `/export` act on; none for a conversation that is no session.
    session_uid: Optional[str] = None
    #: What the last swap said to the new agent.
    said: str = ""
    #: The token the session route is called with, when one is needed.
    token: Optional[str] = None

    @property
    def api_base(self) -> str:
        """Versioned API root for this session's server."""
        return f"{self.server_url.rstrip('/')}/api/v1"

    @property
    def sandbox_variant(self) -> str:
        """Sandbox variant, or an empty string when nothing is attached."""
        return str(self.sandbox.get("variant") or "")

    @property
    def sandbox_running(self) -> bool:
        """Whether a sandbox is up.

        A Jupyter sandbox reports readiness as ``jupyter_connected`` rather than
        ``sandbox_running``; both spellings mean the same thing to a caller
        deciding whether it can execute code.
        """
        if bool(self.sandbox.get("sandbox_running")):
            return True
        return self.sandbox_variant == "jupyter-server" and bool(
            self.sandbox.get("jupyter_connected")
        )

    def with_agent(self, agent_id: str) -> "LoopSession":
        """The same session, its agent swapped in place through the session
        route (MH-07): ``POST /api/v1/apps/sessions/{uid}/agent``, the
        sentence the new agent was told kept in ``said``.

        Raises
        ------
        LoopRefused
            In a sentence: a conversation that is no session, or the route's
            refusal (a turn running, an unknown agent, settings that do not
            fit).
        """
        import httpx

        if not self.session_uid:
            raise LoopRefused(
                "This conversation is not an application session: resume one with "
                "`/resume <uid>` or `loop sessions resume <uid>`, then swap."
            )
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        response = httpx.post(
            f"{self.api_base}/apps/sessions/{self.session_uid}/agent",
            json={"agent": agent_id},
            headers=headers,
            timeout=120.0,
        )
        if response.status_code >= 300:
            detail: Any = ""
            try:
                detail = response.json().get("detail")
            except ValueError:
                detail = response.text
            raise LoopRefused(
                str(detail or f"The swap was refused ({response.status_code}).")
            )
        answer = response.json()
        self.agent_id = str(answer.get("agent") or agent_id)
        self.said = str(answer.get("said") or "")
        return self


class LoopRefused(RuntimeError):
    """What the session refused, in a sentence."""

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
        """The same session bound to another agent."""
        self.agent_id = agent_id
        return self

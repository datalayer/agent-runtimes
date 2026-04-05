# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""
Agent Runtimes Chat assistant package for code analysis and data science.

This package provides:
- CLI interface for AI-powered code assistance
- ACP (Agent Communication Protocol) client for remote agent connections
- Interactive chat mode with local and remote agents
- Terminal UX (TUX)
"""

# ACP client for remote agent connections (from agent-runtimes)
try:
    # Re-export SDK types for convenience
    from acp import (
        InitializeRequest,
        InitializeResponse,
        NewSessionRequest,
        NewSessionResponse,
        PromptRequest,
        PromptResponse,
        SessionNotification,
    )
    from acp.schema import (
        AgentCapabilities,
        ClientCapabilities,
        Implementation,
    )

    from agent_runtimes.transports.clients import (
        ACPClient,
        ACPClientError,
        connect_acp,
    )

    _has_acp = True
except ImportError:
    _has_acp = False

__all__ = [
    "agent",
    "main",
    "CliTux",
    "run_tux",
]


def __getattr__(name: str) -> object:
    """Lazily import heavy modules to avoid side effects at package import time."""
    if name in {"agent", "main"}:
        from agent_runtimes.chat.cli import agent, main

        return {"agent": agent, "main": main}[name]
    if name in {"CliTux", "run_tux"}:
        from agent_runtimes.chat.tux import CliTux, run_tux

        return {"CliTux": CliTux, "run_tux": run_tux}[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


if _has_acp:
    __all__.extend(
        [
            "ACPClient",
            "ACPClientError",
            "connect_acp",
            # SDK types
            "InitializeRequest",
            "InitializeResponse",
            "NewSessionRequest",
            "NewSessionResponse",
            "PromptRequest",
            "PromptResponse",
            "SessionNotification",
            "AgentCapabilities",
            "ClientCapabilities",
            "Implementation",
        ]
    )

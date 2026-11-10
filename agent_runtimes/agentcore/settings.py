# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What ``agent-runtimes serve --target agentcore`` is started with (AC-01).

AgentCore Runtime starts the container with its environment: the agentspec
the runtime serves in ``AGENT_SPEC_ID``, and, when the runtime's
``protocolConfiguration`` moves it, the port in ``AGENTCORE_PORT``. The
server listens on every interface (AgentCore's contract), on 8080 unless
said otherwise.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Optional

#: The target's name, on ``serve --target`` and in ``AGENT_RUNTIMES_TARGET``.
TARGET = "agentcore"

#: Where the target is written for the app the server loads.
TARGET_VARIABLE = "AGENT_RUNTIMES_TARGET"

#: The agentspec the runtime serves.
SPEC_VARIABLE = "AGENT_SPEC_ID"

#: The port, when the runtime's ``protocolConfiguration`` changes it.
PORT_VARIABLE = "AGENTCORE_PORT"

#: The deployment the runtime runs, when the platform deployed an application
#: on AgentCore: its agent is the deployment's, made as a kept runtime's is.
DEPLOYMENT_VARIABLE = "AGENTCORE_DEPLOYMENT_UID"

#: AgentCore's host: every interface.
HOST = "0.0.0.0"

#: AgentCore's default port for HTTP and AG-UI.
DEFAULT_PORT = 8080

#: The agent the spec is configured as, the one ``/invocations`` runs.
AGENT_ID = "default"


@dataclass(frozen=True)
class AgentCoreSettings:
    """Where the server listens, and the agentspec it serves."""

    spec_id: str
    host: str
    port: int


def agentcore_settings(
    environ: Optional[Mapping[str, str]] = None,
) -> AgentCoreSettings:
    """The settings of an AgentCore runtime, read from its environment.

    Parameters
    ----------
    environ : Mapping[str, str], optional
        The environment; ``os.environ`` when not given.

    Returns
    -------
    AgentCoreSettings
        The agentspec id, the host and the port.

    Raises
    ------
    ValueError
        When ``AGENT_SPEC_ID`` is not set, or ``AGENTCORE_PORT`` is not a port,
        in a sentence.
    """
    env = os.environ if environ is None else environ
    spec_id = (env.get(SPEC_VARIABLE) or "").strip()
    if not spec_id:
        raise ValueError(
            f"--target {TARGET} serves the agentspec named by {SPEC_VARIABLE}, which is not set."
        )
    said = (env.get(PORT_VARIABLE) or "").strip()
    if not said:
        return AgentCoreSettings(spec_id=spec_id, host=HOST, port=DEFAULT_PORT)
    if not said.isdigit() or not 0 < int(said) < 65536:
        raise ValueError(f"{PORT_VARIABLE} is a port from 1 to 65535, not {said!r}.")
    return AgentCoreSettings(spec_id=spec_id, host=HOST, port=int(said))


def is_agentcore_target(environ: Optional[Mapping[str, str]] = None) -> bool:
    """Whether the server was started with ``--target agentcore``."""
    env = os.environ if environ is None else environ
    return (env.get(TARGET_VARIABLE) or "").strip() == TARGET


def deployment_of_runtime(environ: Optional[Mapping[str, str]] = None) -> str:
    """The deployment this AgentCore runtime runs (``AGENTCORE_DEPLOYMENT_UID``), or ``""``."""
    env = os.environ if environ is None else environ
    return (env.get(DEPLOYMENT_VARIABLE) or "").strip()


__all__ = [
    "AGENT_ID",
    "DEFAULT_PORT",
    "DEPLOYMENT_VARIABLE",
    "HOST",
    "PORT_VARIABLE",
    "SPEC_VARIABLE",
    "TARGET",
    "TARGET_VARIABLE",
    "AgentCoreSettings",
    "agentcore_settings",
    "deployment_of_runtime",
    "is_agentcore_target",
]

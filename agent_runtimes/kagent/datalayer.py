# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Datalayer runtime for a kagent Agent: the bridge's Datalayer mode.

In its Datalayer mode the kagent bridge (:mod:`agent_runtimes.kagent.bridge`)
starts no agent-runtimes beside it. It asks the platform for a runtime, the
way every Datalayer client does, and forwards kagent's tasks to that
runtime's agent-runtimes over A2A. The bridge runs in its own environment
(kagent-core, a2a-sdk 1.x) and cannot import the Datalayer client, so it asks
through this module, run as ``agent-runtimes kagent launch-runtime`` and
``agent-runtimes kagent end-runtime`` in agent-runtimes' environment:

- **launch**: ``AgentClient.create_runtime`` with ``client_id="kagent"`` and
  ``agent_uid="<namespace>/<agent>"`` (the normal launch path: the runtime
  comes from the platform's pools, with its credits reservation, and is known
  by its uid), then the agentspec registered on it over A2A as
  :func:`agent_runtimes.subagents.a2a.serve_agentspec` registers any cloud
  subagent. A runtime launched but not served is stopped before the error
  is raised: nothing is left reserved.
- **end**: ``AgentClient.stop_runtime`` by uid, which closes the reservation.

The Datalayer API key is read from ``DATALAYER_API_KEY`` as every Datalayer
client reads it; the bridge sets it for this process only. It is never
printed: the launch answers the runtime's uid, the A2A endpoint and the
expiry, nothing else.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Any, Mapping, Optional

logger = logging.getLogger(__name__)

#: The client a kagent bridge launches its runtimes as (the operator labels
#: such a runtime with its Agent, and ends it when the Agent is deleted).
CLIENT_ID = "kagent"

#: The Datalayer environment the runtime is launched in: set, the bridge is
#: in its Datalayer mode.
ENVIRONMENT_VARIABLE = "DATALAYER_RUNTIME_ENVIRONMENT"

#: The Datalayer plane every service is reached under.
RUN_URL_VARIABLE = "DATALAYER_RUN_URL"

#: How long a runtime is reserved, in minutes.
MINUTES_VARIABLE = "DATALAYER_RUNTIME_MINUTES"
DEFAULT_MINUTES = 30.0

#: The agentspec the runtime serves (as ``settings.SPEC_VARIABLE``).
SPEC_VARIABLE = "AGENT_SPEC_ID"

#: The key, as every Datalayer client reads it.
API_KEY_VARIABLE = "DATALAYER_API_KEY"


class DatalayerModeError(ValueError):
    """What the Datalayer mode cannot start with, in a sentence."""


@dataclass(frozen=True)
class RuntimeRequest:
    """What one runtime for a kagent Agent is launched with."""

    environment: str
    spec_id: str
    run_url: str
    agent_uid: str
    minutes: float
    api_key: str = ""

    def __repr__(self) -> str:  # the key is never shown
        return (
            f"RuntimeRequest(environment={self.environment!r}, spec_id={self.spec_id!r}, "
            f"run_url={self.run_url!r}, agent_uid={self.agent_uid!r}, minutes={self.minutes!r})"
        )


def minutes_of(value: Optional[str]) -> float:
    """The reservation in minutes: ``DEFAULT_MINUTES`` when unset, else a positive number."""
    text = (value or "").strip()
    if not text:
        return DEFAULT_MINUTES
    try:
        minutes = float(text)
    except ValueError:
        minutes = 0.0
    if minutes <= 0:
        raise DatalayerModeError(
            f"{MINUTES_VARIABLE} is a positive number of minutes, not {text!r}."
        )
    return minutes


def agent_uid_of(agent_uid: str) -> str:
    """``<namespace>/<agent>``, as the operator takes a kagent Agent's name."""
    namespace, slash, name = (agent_uid or "").strip().partition("/")
    if not slash or not namespace or not name or "/" in name:
        raise DatalayerModeError(
            f"A kagent Agent is named <namespace>/<agent>, not {agent_uid!r}."
        )
    return f"{namespace}/{name}"


def runtime_request(
    agent_uid: str, environ: Optional[Mapping[str, str]] = None
) -> RuntimeRequest:
    """The launch the environment asks for.

    Raises
    ------
    DatalayerModeError
        When the environment, the plane, the agentspec or the key is missing,
        or the Agent or the minutes are malformed.
    """
    env = os.environ if environ is None else environ
    missing = [
        name
        for name in (
            ENVIRONMENT_VARIABLE,
            RUN_URL_VARIABLE,
            SPEC_VARIABLE,
            API_KEY_VARIABLE,
        )
        if not (env.get(name) or "").strip()
    ]
    if missing:
        raise DatalayerModeError(
            "A Datalayer runtime for a kagent Agent needs " + ", ".join(missing) + "."
        )
    return RuntimeRequest(
        environment=env[ENVIRONMENT_VARIABLE].strip(),
        spec_id=env[SPEC_VARIABLE].strip(),
        run_url=env[RUN_URL_VARIABLE].strip().rstrip("/"),
        agent_uid=agent_uid_of(agent_uid),
        minutes=minutes_of(env.get(MINUTES_VARIABLE)),
        api_key=env[API_KEY_VARIABLE].strip(),
    )


def _client(run_url: str, api_key: str) -> Any:
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.client.agent_client import AgentClient

    return AgentClient(urls=DatalayerURLs.from_single_origin(run_url), api_key=api_key)


def launch_runtime(request: RuntimeRequest) -> dict[str, Any]:
    """Launch a runtime for the Agent and serve its agentspec on it over A2A.

    Returns
    -------
    dict[str, Any]
        ``uid`` (the runtime's), ``url`` (the A2A endpoint of the agent on
        it, ending with ``/``) and ``expired_at`` (seconds since the epoch;
        ``0`` for a runtime that does not expire).
    """
    from agent_runtimes.client.agent_client import build_agent_runtimes_base_url
    from agent_runtimes.subagents.a2a import serve_agentspec

    client = _client(request.run_url, request.api_key)
    runtime = client.create_runtime(
        environment=request.environment,
        time_reservation=request.minutes,
        agent_spec_id=request.spec_id,
        client_id=CLIENT_ID,
        agent_uid=request.agent_uid,
    )
    uid = str(getattr(runtime, "uid", "") or "")
    if not uid:
        raise RuntimeError("The platform answered a runtime without a uid.")
    try:
        ingress = str(getattr(runtime, "ingress", "") or "")
        if not ingress:
            raise RuntimeError(f"The runtime {uid} was created without an ingress.")
        remote = asyncio.run(
            serve_agentspec(
                request.agent_uid.rsplit("/", 1)[-1],
                f"The kagent Agent {request.agent_uid}",
                request.spec_id,
                build_agent_runtimes_base_url(ingress),
                request.api_key,
                launch="cloud",
                runtime_uid=uid,
                wait=True,
            )
        )
    except BaseException:
        logger.error("The runtime %s could not serve the agentspec: stopping it", uid)
        if not client.stop_runtime(uid):
            logger.error("The runtime %s could not be stopped", uid)
        raise
    expired_at = str(getattr(runtime, "expired_at", "") or "").strip()
    return {
        "uid": uid,
        "url": remote.url.rstrip("/") + "/",
        "expired_at": float(expired_at) if expired_at else 0.0,
    }


def end_runtime(uid: str, run_url: str, api_key: str) -> bool:
    """Stop the runtime ``uid``, closing its reservation: whether the platform did."""
    if not (uid or "").strip():
        raise DatalayerModeError("No runtime uid to end.")
    return bool(_client(run_url, api_key).stop_runtime(uid.strip()))


__all__ = [
    "API_KEY_VARIABLE",
    "CLIENT_ID",
    "DEFAULT_MINUTES",
    "DatalayerModeError",
    "ENVIRONMENT_VARIABLE",
    "MINUTES_VARIABLE",
    "RUN_URL_VARIABLE",
    "RuntimeRequest",
    "agent_uid_of",
    "end_runtime",
    "launch_runtime",
    "minutes_of",
    "runtime_request",
]

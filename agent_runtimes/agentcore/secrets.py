# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The secrets a deployment's agent needs, given to an AgentCore runtime as it makes the agent.

On a Datalayer runtime the pod's companion reads the person's secrets at IAM
and gives the runtime's process the ones its specs declare
(`guardrails.declared_secrets`). An AgentCore runtime has no companion, and
its ``environmentVariables`` at AWS are readable by whoever may describe the
agent runtime in the customer's account: a secret is never written there, nor
in the image. The runtime reads them itself, at its first invocation, with
the caller's platform token (the one its exchange at IAM gave it):

``GET {DATALAYER_IAM_URL}/api/iam/v1/secrets/values`` answers the caller's own
secrets; only the names the deployment's specs declare — what its MCP servers
and skills require, and what they are offered — are kept, in this process's
environment, as a pod's process holds them. A new microVM reads them again.
A required one that is not there refuses the invocation in a sentence naming
it and what needs it: the agent is not made without it.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Awaitable, Callable, Mapping, Optional

import httpx

from .exchange import IAM_URL_VARIABLE

logger = logging.getLogger(__name__)

#: IAM's route answering the caller's own secrets, name to value.
SECRET_VALUES_PATH = "/api/iam/v1/secrets/values"


class SecretsRefused(Exception):
    """Why the agent's secrets were not given: an HTTP status, and a sentence."""

    def __init__(self, status: int, sentence: str) -> None:
        self.status = status
        self.sentence = sentence
        super().__init__(sentence)


async def _read_from_iam(bearer: str) -> dict[str, str]:
    """Read the caller's own secrets at IAM, as them."""
    iam = (os.environ.get(IAM_URL_VARIABLE) or "").strip().rstrip("/")
    if not iam:
        raise SecretsRefused(
            503,
            f"The agent's secrets are read at IAM, and this runtime was not told where it is ({IAM_URL_VARIABLE}).",
        )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{iam}{SECRET_VALUES_PATH}",
                headers={"Authorization": f"Bearer {bearer}"},
            )
    except httpx.HTTPError as error:
        raise SecretsRefused(
            502, f"IAM could not be asked for the agent's secrets: {error}."
        ) from None
    if response.status_code >= 300:
        raise SecretsRefused(
            502, f"IAM did not answer the agent's secrets ({response.status_code})."
        )
    try:
        secrets = (response.json() or {}).get("secrets")
    except ValueError:
        secrets = None
    if not isinstance(secrets, dict):
        raise SecretsRefused(
            502, "IAM answered the agent's secrets in no shape read here."
        )
    return {str(name): str(value) for name, value in secrets.items() if value}


#: Who answers the caller's secrets; replaced by a test.
_reader: dict[str, Callable[[str], Awaitable[dict[str, str]]]] = {
    "read": _read_from_iam
}


def use_secrets_reader(
    reader: Optional[Callable[[str], Awaitable[dict[str, str]]]],
) -> None:
    """Set who answers the caller's secrets: IAM, or a test; ``None`` for IAM."""
    _reader["read"] = reader or _read_from_iam


async def give_declared(payload: Mapping[str, Any], bearer: str) -> list[str]:
    """Give this process the secrets the deployment's agent declares, read as the caller.

    Parameters
    ----------
    payload : Mapping[str, Any]
        What makes the deployment's agent (`apps.deployments.kept_payload`).
    bearer : str
        The caller's platform token.

    Returns
    -------
    list[str]
        The names given, sorted: never a value.

    Raises
    ------
    SecretsRefused
        When IAM does not answer (502), or a required one is not among the
        caller's secrets (422), naming it and what needs it.
    """
    from agent_runtimes.guardrails.declared_secrets import keep_declared, note_given
    from agent_runtimes.routes.agents import declared_secrets, get_library_agent_spec

    spec_id = str(payload.get("agent_spec_id") or "")
    declared = declared_secrets(
        get_library_agent_spec(spec_id) if spec_id else None,
        app_spec=payload.get("app_spec"),
        app_instance=payload.get("app_instance"),
        resolve_agent=get_library_agent_spec,
    )
    wanted = frozenset(declared.offered).union(*declared.consumers.values())
    if not wanted:
        return []
    kept, _ = keep_declared(await _reader["read"](bearer), wanted)
    who = str((payload.get("app_spec") or {}).get("name") or spec_id)
    problems = declared.missing(
        lambda name: bool(
            (kept.get(name) or "").strip() or (os.environ.get(name) or "").strip()
        ),
        who,
    )
    if problems:
        raise SecretsRefused(422, " ".join(problems))
    for name, value in kept.items():
        os.environ[name] = value
    note_given(kept)
    # Names only: never any part of a value.
    logger.info("AgentCore: secrets given to %s: %s", who, sorted(kept))
    return sorted(kept)


__all__ = [
    "SECRET_VALUES_PATH",
    "SecretsRefused",
    "give_declared",
    "use_secrets_reader",
]

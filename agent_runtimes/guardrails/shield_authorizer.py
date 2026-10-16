# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""The runtime's authorizer, subject and lent-tool classes for the Shield (SHIELD §6.10, §6.11; SH-70, SH-72, SH-75).

On Datalayer the Shield never holds OpenFGA's address: the runtime hands it
``agent_shield.saas.IamAuthorizer`` — IAM's AuthZen route, asked with the
run's credential — and the **subject** the run acts as: the deployment its
token names (an application's runtime), else the account the token is minted
for. The PAP grant is then a decision input (SH-72): IAM wrote
``connection:<company>`` relationships for the deployment when its grant was
made, and a ``propose`` at a company the person did not connect is refused at
the Rules through the authorizer, as the gateway refuses it at the toolset.

The lent tools of a company (SH-70) are classed by agentspecs' table
(:mod:`agent_runtimes.loop.apps.pap_connections`), the strictest class when a
tool may do two things, and name the company as the resource.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Callable, Optional, Tuple

from agent_shield.policy import Subject, strictest

from agent_runtimes.loop.apps import pap_connections

logger = logging.getLogger(__name__)

#: The classes Datalayer's default session document needs an authorizer's allow for
#: (§6.11) everywhere: a connection granted at a company (``send``, ``buy``).
DATALAYER_AUTHORIZE: tuple[str, ...] = ("send", "buy")

#: And in a runtime pod's workspace, where the platform writes the relationship at
#: the runtime's launch (the operator for its account, IAM for a deployment's grant:
#: ``can_execute workspace:mnt/shared-agent/workspace``, SH-75): reading, writing
#: and running a command there need the authorizer's allow too.
WORKSPACE_AUTHORIZE: tuple[str, ...] = ("read", "write", "execute")

#: The workspace the operator gives a runtime pod (``AGENT_RUNTIMES_WORKSPACE_ROOT``).
RUNTIME_WORKSPACE = "/mnt/shared-agent/workspace"

#: ``off`` keeps a runtime pod's workspace to the Rules alone (the operator's switch
#: should the relationships not be written); anything else, or unset, authorizes it.
WORKSPACE_AUTHORIZE_VARIABLE = "DATALAYER_SHIELD_AUTHORIZE_WORKSPACE"

IAM_URL_VARIABLE = "DATALAYER_IAM_URL"


def datalayer_authorize() -> tuple[str, ...]:
    """
    Return the classes needing the authorizer here.

    :data:`DATALAYER_AUTHORIZE`, and the workspace's in a managed runtime pod
    (its workspace the operator's, an IAM named).
    """
    in_a_pod = (os.environ.get("AGENT_RUNTIMES_WORKSPACE_ROOT") or "").rstrip(
        "/"
    ) == RUNTIME_WORKSPACE
    managed = bool((os.environ.get(IAM_URL_VARIABLE) or "").strip())
    switched_off = (
        os.environ.get(WORKSPACE_AUTHORIZE_VARIABLE) or ""
    ).strip().lower() == "off"
    if in_a_pod and managed and not switched_off:
        return (*WORKSPACE_AUTHORIZE, *DATALAYER_AUTHORIZE)
    return DATALAYER_AUTHORIZE


def runtime_subject(credential: str, deployment_uid: str = "") -> Subject:
    """Who the run acts as: the deployment named, else the token's account, else local."""
    if deployment_uid:
        return Subject(type="deployment", id=deployment_uid)
    from agent_runtimes.guardrails.managed_policies import (
        account_of_token,  # noqa: PLC0415
    )

    account = account_of_token(credential) if credential else ""
    return Subject(type="account", id=account or "local")


def deployment_of_token(credential: str) -> str:
    """The deployment an application principal's token acts for, from its ``task_id`` (``deployment:<uid>:<ulid>``)."""
    import base64  # noqa: PLC0415
    import binascii  # noqa: PLC0415
    import json  # noqa: PLC0415

    parts = credential.split(".")
    if len(parts) != 3:
        return ""
    try:
        claims = json.loads(
            base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4))
        )
    except (ValueError, binascii.Error):
        return ""
    if not isinstance(claims, dict):
        return ""
    task = str(claims.get("task_id") or claims.get("task_uid") or "")
    pieces = task.split(":")
    return pieces[1] if len(pieces) >= 2 and pieces[0] == "deployment" else ""


def runtime_authorizer(credential: str) -> Optional[Any]:
    """
    Answer IAM's authorizer with the run's credential, or ``None`` (said) when no IAM is named.

    Every class a policy lists under ``authorize:`` is then refused — never a fail-open.
    """
    iam_url = (os.environ.get(IAM_URL_VARIABLE) or "").strip().rstrip("/")
    if not iam_url or not credential:
        logger.warning(
            "The Shield has no authorizer here (%s): every class the policies list under 'authorize:' is refused",
            "no IAM URL" if not iam_url else "no credential",
        )
        return None
    from agent_shield.saas import IamAuthorizer  # noqa: PLC0415

    return IamAuthorizer(iam_url, credential)


def lent_tool_class(tool_name: str) -> Optional[Tuple[str, Optional[str]]]:
    """A company's tool as the model names it: its strictest class and the company as the resource."""
    classes = pap_connections.classes_of(tool_name)
    if classes is None:
        return None
    found = pap_connections.pap_tool(tool_name)
    domain = pap_connections.domain_of(found[0]) if found else None
    cls = strictest(classes)
    if cls is None:
        return None
    return cls, f"connection:{domain}" if domain else None


def companies_of(app: Any) -> list[str]:
    """The companies' domains an application connects, every protocol (PAP, PACT, the merchants, the sites)."""
    return sorted({c["company"] for c in pap_connections.connections_of(app).values()})


ToolClass = Callable[[str], Optional[Tuple[str, Optional[str]]]]

__all__ = [
    "DATALAYER_AUTHORIZE",
    "RUNTIME_WORKSPACE",
    "WORKSPACE_AUTHORIZE",
    "WORKSPACE_AUTHORIZE_VARIABLE",
    "datalayer_authorize",
    "IAM_URL_VARIABLE",
    "ToolClass",
    "companies_of",
    "deployment_of_token",
    "lent_tool_class",
    "runtime_authorizer",
    "runtime_subject",
]

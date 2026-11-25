# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A deployment's principal the runtime acts as without holding it.

On a runtime engine whose sandbox holds no credential (Kagent, an Agent
Substrate actor), nothing that is a secret enters this process: what it sends
as a key is a public placeholder, and the platform's egress gateway replaces
the header that carries it with the value it keeps for this runtime alone.

A deployed application's runtime sends two kinds of token to the same
services: its application's principal token, and each caller's own token, to
check who is calling (`callers.CallerVerifier`). The egress gateway decides a
request on the host it names, never on its path, and replaces a header
whatever value was sent. Were the principal put in for the usual names, every
caller check would answer for the principal, a forged token included. So the
principal has names of its own:

- :data:`AGENTS_PRINCIPAL_URL_VARIABLE` and
  :data:`INFERENCE_PRINCIPAL_URL_VARIABLE` name a second address of ai-agents
  and of ai-inference (the same service). A call sent there with the
  placeholder leaves as the application's principal;
- the usual names carry no credential: a token sent there, a caller's own,
  leaves as it was sent and is judged as itself.

**Which name a call takes is decided by what it is for, never by the token it
carries**: the calls made as the principal say so
(`principal.principal_address`), and nothing that checks a caller ever does.
A caller that presents the placeholder as its own token presents nothing
(:func:`is_placeholder`, read by `callers`).

What the runtime needs of a token it does not hold are its claims: whose
application it is, which deployment, which grant, when it ends. It reads them
from ai-agents through the principal's own name (:func:`read_claims`): the
answer is about the token the gateway put in, so it is this runtime's
principal's and nobody's word but ai-agents'.

Nothing here applies to a runtime that holds its principal's token (a pool
runtime): :func:`at_egress` is false there, and every call is made as before.
"""

from __future__ import annotations

import os
import time
from typing import Any, Mapping, Optional

__all__ = [
    "AGENTS_PRINCIPAL_URL_VARIABLE",
    "ClaimsUnread",
    "INFERENCE_PRINCIPAL_URL_VARIABLE",
    "PLACEHOLDER",
    "agents_principal_url",
    "at_egress",
    "inference_principal_url",
    "is_placeholder",
    "read_claims",
]

#: What is sent in place of a credential the egress gateway puts in: public,
#: the same in every runtime and every snapshot.
PLACEHOLDER = "ate-egress-injected"

#: The second address of ai-agents: where a call made as the principal is sent.
AGENTS_PRINCIPAL_URL_VARIABLE = "DATALAYER_AI_AGENTS_PRINCIPAL_URL"

#: The second address of ai-inference: where a model call made as the principal is sent.
INFERENCE_PRINCIPAL_URL_VARIABLE = "DATALAYER_AI_INFERENCE_PRINCIPAL_URL"

#: The route of ai-agents that says what the principal's token put in says.
CLAIMS_PATH = "/api/ai-agents/v1/apps/internal/principal/claims"


class ClaimsUnread(RuntimeError):
    """What the principal put in at egress says could not be read, in a sentence."""


def _said(name: str, environ: Optional[Mapping[str, str]] = None) -> str:
    env = os.environ if environ is None else environ
    return (env.get(name) or "").strip().rstrip("/")


def agents_principal_url(environ: Optional[Mapping[str, str]] = None) -> str:
    """The second address of ai-agents, or ``""`` when this runtime is told none."""
    return _said(AGENTS_PRINCIPAL_URL_VARIABLE, environ)


def inference_principal_url(environ: Optional[Mapping[str, str]] = None) -> str:
    """The second address of ai-inference, or ``""`` when this runtime is told none."""
    return _said(INFERENCE_PRINCIPAL_URL_VARIABLE, environ)


def at_egress(environ: Optional[Mapping[str, str]] = None) -> bool:
    """Whether a deployment's principal is put in this runtime's calls at egress.

    On an Agent Substrate actor (``--target ate``) whose template names both
    second addresses. Anywhere else the runtime holds its principal's token,
    asked of ai-agents, as it always did.
    """
    from agent_runtimes.ate.settings import is_ate_target

    return bool(
        is_ate_target(environ)
        and agents_principal_url(environ)
        and inference_principal_url(environ)
    )


def is_placeholder(token: Optional[str]) -> bool:
    """Whether a token is the placeholder: no credential at all, whoever presents it."""
    return (token or "").strip() == PLACEHOLDER


async def read_claims(deployment_uid: str) -> dict[str, Any]:
    """
    What the principal put in this runtime's calls says, as ai-agents reads it.

    Parameters
    ----------
    deployment_uid : str
        The deployment an agent here serves: the principal must be its own.

    Returns
    -------
    dict
        What `principal._ask_ai_agents` answers for a token it holds, with the
        placeholder in the token's place: ``access_token`` (the placeholder),
        ``expires_in``, ``principal_uid`` and ``claims`` (``account_uid``,
        ``agent_uid``, ``app_uid``, ``task_grant_uid``, ``task_id``, ``exp``).

    Raises
    ------
    ClaimsUnread
        When no principal is put in for this runtime (no rule of its egress
        names the address, or its token ended), ai-agents refused it, or it is
        another deployment's.
    """
    import httpx

    url = agents_principal_url()
    if not url:
        raise ClaimsUnread(
            f"The principal of deployment {deployment_uid} cannot be read: this runtime is told no "
            f"address where it is put in ({AGENTS_PRINCIPAL_URL_VARIABLE})."
        )
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            response = await client.get(
                f"{url}{CLAIMS_PATH}",
                headers={"Authorization": f"Bearer {PLACEHOLDER}"},
            )
    except httpx.HTTPError as error:
        raise ClaimsUnread(
            f"ai-agents could not be asked what the principal of deployment {deployment_uid} says "
            f"({type(error).__name__})."
        ) from None
    if response.status_code >= 300:
        raise ClaimsUnread(
            f"No principal is put in this runtime's calls for deployment {deployment_uid} "
            f"({response.status_code}): it acts in nobody's name, and calls nothing."
        )
    try:
        answer = response.json()
    except ValueError:
        answer = None
    if not isinstance(answer, dict):
        raise ClaimsUnread(
            f"ai-agents answered what the principal of deployment {deployment_uid} says in no JSON."
        )
    named = str(answer.get("deployment_uid") or "")
    if not named or named != deployment_uid:
        raise ClaimsUnread(
            f"The principal put in this runtime's calls is not deployment {deployment_uid}'s: "
            "its agent is not made here."
        )
    principal = str(answer.get("principal_uid") or "")
    owner = str(answer.get("account_uid") or "")
    if not principal or not owner:
        raise ClaimsUnread(
            f"ai-agents did not say whose the principal of deployment {deployment_uid} is."
        )
    claims = dict(answer.get("claims") or {})
    claims.update(account_uid=owner, agent_uid=principal)
    if answer.get("app_uid"):
        claims["app_uid"] = str(answer["app_uid"])
    return {
        "access_token": PLACEHOLDER,
        "expires_in": max(0, int(float(answer.get("expires_at") or 0) - time.time())),
        "principal_uid": principal,
        "claims": claims,
    }

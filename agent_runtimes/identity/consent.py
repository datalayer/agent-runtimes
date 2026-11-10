# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Where a person's consent to a third party comes back to, on AgentCore.

AgentCore Identity sends the person's browser, once they granted a third
party, to the return URL the token request named, with the session to
complete and the request's ``customState``. Datalayer IAM hosts that page:
it checks the state against the one it issued to the same person for the
same runtime, and binds the consent to who is signed in. So, before asking
AgentCore for a token on the person's behalf, the runtime asks IAM for that
state with the person's own platform token, and names IAM's page as the
return URL.

A state is single use and lives ten minutes; one not used yet is kept per
person and runtime and given again, so a turn that needed no consent costs
IAM nothing more. One that was used (the person granted) is forgotten.

On a runtime with no token exchange (no ``AGENTCORE_RUNTIME_ARN``, so no
IAM in its path) there is no page to come back to: refused in a sentence.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Mapping, Optional, Tuple

import httpx

from agent_runtimes.plugins.points import IdentityRefused

#: IAM's binding page, under its base URL.
BIND_PATH = "/api/iam/v1/identity/agentcore/bind"

#: Where IAM issues a state for a consent.
NONCE_PATH = f"{BIND_PATH}/nonce"

#: Seconds before a state's expiry it is no longer given.
EXPIRY_MARGIN = 60.0

#: How long IAM is waited for, in seconds.
TIMEOUT = 10.0


@dataclass(frozen=True)
class Consent:
    """What a token request names so that a consent comes back to IAM."""

    return_url: str
    custom_state: str


#: States issued and not used yet, by (person's token, runtime).
_STATES: Dict[Tuple[str, str], Tuple[str, float]] = {}


def forget_states() -> None:
    """Forget every state kept (a test)."""
    _STATES.clear()


def used(context: Mapping[str, Any], consent: Consent) -> None:
    """Forget a state IAM consumed: the person completed a consent with it."""
    for key, (state, _) in list(_STATES.items()):
        if state == consent.custom_state:
            del _STATES[key]


def _runtime() -> Tuple[str, str]:
    from agent_runtimes.agentcore.exchange import runtime_exchange

    exchange = runtime_exchange()
    if exchange is None:
        raise IdentityRefused(
            "This runtime has no Datalayer IAM in its path (no AGENTCORE_RUNTIME_ARN): "
            "nothing hosts the page a consent comes back to."
        )
    return exchange.iam_url.rstrip("/"), exchange.runtime_arn


async def consent_for(
    context: Mapping[str, Any],
    *,
    client: Optional[Callable[[], httpx.AsyncClient]] = None,
    clock: Callable[[], float] = time.time,
) -> Consent:
    """Return IAM's binding page and a state for the person the run acts for.

    Parameters
    ----------
    context : Mapping[str, Any]
        The run's identity context; its ``bearer`` is the person's platform
        token (on AgentCore, the one the invocation's token was exchanged for).
    client : Callable[[], httpx.AsyncClient], optional
        Make the HTTP client IAM is asked with (a test's transport).
    clock : Callable[[], float], optional
        The time, in epoch seconds.

    Raises
    ------
    IdentityRefused
        With no person's token, no IAM in the runtime's path, or IAM's refusal,
        in a sentence.
    """
    iam_url, runtime_arn = _runtime()
    bearer = str(context.get("bearer") or "").strip()
    if not bearer:
        raise IdentityRefused(
            "No token of the person: a consent is asked for the person the run acts for."
        )
    key = (bearer, runtime_arn)
    now = clock()
    kept = _STATES.get(key)
    if kept is not None and kept[1] - EXPIRY_MARGIN > now:
        return Consent(f"{iam_url}{BIND_PATH}", kept[0])
    make = client or (lambda: httpx.AsyncClient(timeout=TIMEOUT))
    try:
        async with make() as http:
            response = await http.post(
                f"{iam_url}{NONCE_PATH}",
                json={"resource": runtime_arn},
                headers={"Authorization": f"Bearer {bearer}"},
            )
    except httpx.HTTPError as error:
        raise IdentityRefused(
            f"Datalayer IAM could not be asked for a consent's state: {error}"
        ) from None
    try:
        answer = response.json()
    except ValueError:
        answer = {}
    if response.status_code != 200 or not answer.get("state"):
        detail = answer.get("detail") if isinstance(answer, dict) else None
        raise IdentityRefused(
            f"Datalayer IAM issued no consent state ({response.status_code}): "
            f"{detail or response.text[:200]}"
        )
    state = str(answer["state"])
    _STATES[key] = (state, now + float(answer.get("expires_in") or 0))
    return Consent(f"{iam_url}{BIND_PATH}", state)


__all__ = [
    "BIND_PATH",
    "NONCE_PATH",
    "Consent",
    "consent_for",
    "forget_states",
    "used",
]

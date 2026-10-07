# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who the user of an embedded application is, when it matters (plans/LOOP.md, D-21).

What a host page passes as `user` is a claim: anybody's page can say anything.
An application whose Appspec says ``deployment.embedded.host.user: signed``
acts in each user's name, or shows data that is theirs, and takes only a user
the host's **server** signed: a short token, HS256 with the deployment's
secret, naming ``sub`` (the host's own id for the user), ``name`` and ``exp``
at most an hour away. The page hands it over (the element's ``user-token``),
and it goes with the run that opens the session (``forwardedProps.loop
.user_token``, or ``user_token`` when a session is started).

Verified **here, where the session opens**, with the secret given to the
runtime — never by the page, which the secret never reaches, and not by
ai-agents for each session: the runtimes that open an embed's sessions are
the host's own server (``server``, ``app.mount``), where the host keeps the
secret itself, and its owner's runtimes on Datalayer, which are given its
owner's secrets as they start. ai-agents makes the secret and keeps it among
its owner's secrets under :func:`secret_variable` — the variable it arrives
in — and shows it to its owner once (``POST …/deployments/{uid}/user-secret``).

The user it names is the session's: who `host_context` answers as `user`,
the application's code's ``session.user``, and who a page it saves was
written for (I-10). A session it does not open is refused in a sentence: 401
with no token, 403 with a token that is not one, 503 on a runtime that was
not given the secret.

Pure but for the environment, which :func:`use_user_secret` stands in for.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional

import jwt

from agent_runtimes.types import AppSpec

__all__ = [
    "ALGORITHM",
    "MAX_SECONDS",
    "HostUser",
    "UserNotSigned",
    "host_user_of",
    "reads_user",
    "secret_variable",
    "signed_host_context",
    "takes_signed_user",
    "use_user_secret",
    "verify_host_user",
]

#: The one algorithm a host signs its user's token with.
ALGORITHM = "HS256"

#: The longest such a token may live, in seconds.
MAX_SECONDS = 3600

#: What a clock apart is forgiven, in seconds.
LEEWAY_SECONDS = 30

#: The tool its agent reads what the page passes with (D-10).
HOST_CONTEXT_TOOL = "host_context"


@dataclass(frozen=True)
class HostUser:
    """A user the host's server signed: its own id for them, and their name."""

    sub: str
    name: str

    def as_value(self) -> Dict[str, Any]:
        """As `host_context` answers it, and the session says it."""
        return {"sub": self.sub, "name": self.name, "signed": True}


class UserNotSigned(Exception):
    """A session not opened for want of a signed user: the status to answer, and why."""

    def __init__(self, status: int, reason: str):
        """Keep the status to answer and the sentence that says why."""
        self.status = status
        self.reason = reason
        super().__init__(reason)


def secret_variable(deployment_uid: str) -> str:
    """Where a deployment's secret arrives on a runtime, and the name ai-agents
    keeps it under among its owner's secrets: ``DATALAYER_APP_USER_SECRET_<UID>``."""
    uid = re.sub(r"[^A-Za-z0-9]", "_", str(deployment_uid or "").strip()).upper()
    if not uid:
        raise ValueError(
            "A deployment's secret is named by its uid, and none was given."
        )
    return f"DATALAYER_APP_USER_SECRET_{uid}"


#: Secrets given in the process, by deployment (a test, or a host's own code).
_GIVEN: Dict[str, str] = {}


def use_user_secret(deployment_uid: str, secret: Optional[str]) -> None:
    """Give this runtime a deployment's secret in the process; ``None`` takes it back."""
    if secret:
        _GIVEN[deployment_uid] = secret
    else:
        _GIVEN.pop(deployment_uid, None)


def _secret_of(deployment_uid: str) -> str:
    return (
        _GIVEN.get(deployment_uid)
        or os.environ.get(secret_variable(deployment_uid), "").strip()
    )


def reads_user(app: AppSpec) -> bool:
    """Whether its agent reads the page's `user` with `host_context` (D-10)."""
    embedded = app.deployment.embedded if app.deployment else None
    host = embedded.host if embedded else None
    return bool(host is not None and "user" in host.context)


def takes_signed_user(app: AppSpec) -> bool:
    """Whether its Appspec says its user is only one the host's server signed."""
    embedded = app.deployment.embedded if app.deployment else None
    host = embedded.host if embedded else None
    return bool(host is not None and host.signed_user)


def verify_host_user(
    token: str, secret: str, *, now: Optional[float] = None
) -> HostUser:
    """The user a token names, when the host's server signed it with ``secret``.

    HS256 only, its ``sub`` and ``name`` said, its ``exp`` not past and at
    most an hour away (:data:`MAX_SECONDS`). Any audience it names is the
    host's business, not read.

    Raises
    ------
    UserNotSigned
        403, in a sentence, for a token that is not one.
    """
    if not secret:
        raise ValueError("A user's token is verified with the deployment's secret.")
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise UserNotSigned(
            403,
            "The token naming the user is not a token: your server signs one, HS256.",
        ) from None
    if header.get("alg") != ALGORITHM:
        raise UserNotSigned(
            403,
            f"The token naming the user is signed with {header.get('alg')!r}: "
            f"only {ALGORITHM}, with the deployment's secret, is taken.",
        )
    at = time.time() if now is None else now
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[ALGORITHM],
            options={
                "require": ["exp", "sub"],
                "verify_aud": False,
                "verify_iat": False,
                "verify_exp": False,
            },
        )
    except jwt.InvalidSignatureError:
        raise UserNotSigned(
            403,
            "The token naming the user is not signed with this deployment's secret: rotated, or another's.",
        ) from None
    except jwt.MissingRequiredClaimError as missing:
        raise UserNotSigned(
            403, f"The token naming the user says no {missing.claim}."
        ) from None
    except jwt.PyJWTError:
        raise UserNotSigned(
            403,
            "The token naming the user cannot be read: your server signs one, HS256.",
        ) from None
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or isinstance(exp, bool):
        raise UserNotSigned(
            403, "The token naming the user says when it ends (exp) in seconds."
        )
    if exp + LEEWAY_SECONDS <= at:
        raise UserNotSigned(
            403, "The token naming the user has expired: your server signs a new one."
        )
    if exp > at + MAX_SECONDS + LEEWAY_SECONDS:
        raise UserNotSigned(
            403,
            "The token naming the user lives longer than an hour: your server signs a short one.",
        )
    sub = claims.get("sub")
    name = claims.get("name")
    if not isinstance(sub, str) or not sub.strip():
        raise UserNotSigned(
            403, "The token naming the user says no sub: your own id for the user."
        )
    if not isinstance(name, str) or not name.strip():
        raise UserNotSigned(403, "The token naming the user says no name.")
    return HostUser(sub=sub.strip(), name=" ".join(name.split()))


def host_user_of(
    app: AppSpec,
    instance: Mapping[str, Any],
    token: Optional[str],
    *,
    woken: bool = False,
) -> Optional[HostUser]:
    """The signed user a session of ``app`` opens for; ``None`` when it takes what the page says.

    Asked as a session opens, of a deployment's: a Preview is its owner's,
    and a session a schedule woke has nobody there to sign.

    Raises
    ------
    UserNotSigned
        401 with no token, 403 with a bad one, 503 when this runtime was not
        given the deployment's secret.
    """
    deployment = str(instance.get("deployment_uid") or "")
    if not takes_signed_user(app) or not deployment or woken:
        return None
    name = app.name or app.id
    said = str(token or "").strip()
    if not said:
        raise UserNotSigned(
            401,
            f"{name} acts in the name of each of its users: the page hands over a token its server "
            "signed naming the user (user-token), and none was sent.",
        )
    secret = _secret_of(deployment)
    if not secret:
        raise UserNotSigned(
            503,
            f"This runtime was not given the secret {name}'s users are signed with "
            f"({secret_variable(deployment)}): set it where the runtime runs.",
        )
    return verify_host_user(said, secret)


def signed_host_context(
    messages: List[Dict[str, Any]], user: Optional[HostUser]
) -> List[Dict[str, Any]]:
    """The conversation, with every `host_context` answer's `user` the signed one.

    `host_context` is answered in the page, where whoever holds the page
    could say anything: the runtime puts back the user it verified, in
    place of whatever came, before its agent reads it.
    """
    if user is None:
        return messages
    calls = {
        str(call.get("id") or "")
        for message in messages
        if message.get("role") == "assistant"
        for call in message.get("toolCalls") or message.get("tool_calls") or []
        if isinstance(call, Mapping)
        and str((call.get("function") or {}).get("name") or "") == HOST_CONTEXT_TOOL
    }
    if not calls:
        return messages
    signed: List[Dict[str, Any]] = []
    for message in messages:
        call_id = str(message.get("toolCallId") or message.get("tool_call_id") or "")
        if message.get("role") != "tool" or call_id not in calls:
            signed.append(message)
            continue
        try:
            answered = json.loads(message.get("content") or "{}")
        except (TypeError, ValueError):
            answered = {}
        if not isinstance(answered, dict):
            answered = {}
        values = (
            answered.get("values") if isinstance(answered.get("values"), dict) else {}
        )
        unsaid = [name for name in answered.get("unsaid") or [] if name != "user"]
        answer = {**answered, "values": {**values, "user": user.as_value()}}
        if unsaid:
            answer["unsaid"] = unsaid
        else:
            answer.pop("unsaid", None)
        signed.append({**message, "content": json.dumps(answer)})
    return signed

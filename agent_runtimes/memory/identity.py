# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Trusted memory identity resolution.

Memory isolation must be keyed by the *authenticated* user, never by an
agent id or by any identifier supplied by the model/caller. Memories are
scoped to a user's personal account. In a Datalayer runtime the trusted
identity is injected as environment variables by the runtime owner:

- cloud: the operator sets ``DATALAYER_USER_UID`` / ``DATALAYER_USER_HANDLE``
  on the runtime pod from the reservation labels, so a pod can never spoof
  another user.
- local: the same variables are set from the developer's authenticated
  session (or fall back to a stable ``local`` identity).

This module acts as the memory gateway: it derives a single effective
``user_id`` (the personal account) from that trusted environment and rejects
any caller-provided ownership id.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# Explicit override wins over everything else (single trusted value).
_ENV_EXPLICIT_USER_ID = "AGENT_RUNTIMES_MEMORY_USER_ID"
# Trusted identity injected by the runtime owner (operator / local session).
_ENV_USER_UID = "DATALAYER_USER_UID"
_ENV_USER_HANDLE = "DATALAYER_USER_HANDLE"

_DEFAULT_USER_ID = "default"


@dataclass(frozen=True)
class MemoryIdentity:
    """Resolved, trusted memory ownership scope.

    Attributes
    ----------
    user_id:
        Effective user identity passed to the backend (the user's personal
        account, for example ``"user-123"``). It is the trusted ownership
        boundary that memories never cross; the backend combines it with the
        agent uid to form the persistence key.
    user_uid:
        Raw authenticated user uid, when known.
    user_handle:
        Human-readable handle for the user, when known.
    """

    user_id: str
    user_uid: str | None = None
    user_handle: str | None = None


def _clean(name: str) -> str:
    return os.environ.get(name, "").strip()


def resolve_memory_identity() -> MemoryIdentity:
    """Resolve the trusted memory identity from the runtime environment.

    The resulting ``user_id`` is derived solely from server-set environment
    variables. Any ownership id provided by the model or an untrusted caller
    is ignored.
    """
    explicit = _clean(_ENV_EXPLICIT_USER_ID)
    user_uid = _clean(_ENV_USER_UID)
    user_handle = _clean(_ENV_USER_HANDLE)

    user = user_uid or user_handle

    if explicit:
        user_id = explicit
    elif user:
        user_id = user
    else:
        user_id = _DEFAULT_USER_ID

    return MemoryIdentity(
        user_id=user_id,
        user_uid=user_uid or None,
        user_handle=user_handle or None,
    )

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The credential a delegation hands its worker, for the run (ORCHESTRATOR.md, O1-17).

The control plane sends an execution's own token with the delegation, under
``datalayer.credential`` in the A2A message's ``metadata`` or the ACP prompt's
``_meta``, beside the model budget. It is a bearer credential, so it is taken
out of the message as the message arrives — before an A2A task, its context or
the work a broker owes is written — and kept in this process, for the run it
was sent for, and nowhere else. What the message keeps is that one was sent
(``withheld``): a run a restarted runtime owes has lost it, and fails rather
than run as the runtime; the execution's retry dispatches with a token of its
own.
"""

from __future__ import annotations

from collections.abc import Mapping, MutableMapping
from typing import Any

from agent_runtimes.guardrails.model_budget import DELEGATION_META_KEY

__all__ = [
    "CREDENTIAL_FIELD",
    "WITHHELD",
    "CredentialLost",
    "hold",
    "release",
    "take_credential",
    "was_delegated",
]

#: Where, under ``datalayer``, the delegation carries the credential.
CREDENTIAL_FIELD = "credential"

#: What the message keeps in its place: that one was sent, and not what it was.
WITHHELD = "withheld"

#: Run id -> the credential delegated for it. Process memory only.
_held: dict[str, str] = {}


class CredentialLost(RuntimeError):
    """A run delegated with a credential this process no longer holds."""


def take_credential(meta: Any) -> str | None:
    """
    Take the delegated credential out of a message's metadata, and answer it.

    Parameters
    ----------
    meta : Any
        The A2A message's ``metadata`` or the ACP prompt's ``_meta``; changed
        in place, so nothing that keeps the message keeps the credential —
        only ``withheld`` where it was.

    Returns
    -------
    str | None
        The credential, when the delegation carried one.
    """
    if not isinstance(meta, MutableMapping):
        return None
    ours = meta.get(DELEGATION_META_KEY)
    if not isinstance(ours, MutableMapping):
        return None
    credential = ours.get(CREDENTIAL_FIELD)
    if not isinstance(credential, str) or not credential or credential == WITHHELD:
        return None
    ours[CREDENTIAL_FIELD] = WITHHELD
    return credential


def was_delegated(meta: Any) -> bool:
    """
    Whether a message was delegated with a credential.

    Parameters
    ----------
    meta : Any
        The A2A message's ``metadata``, as it was kept.

    Returns
    -------
    bool
        True when a credential was taken out of it.
    """
    ours = meta.get(DELEGATION_META_KEY) if isinstance(meta, Mapping) else None
    return isinstance(ours, Mapping) and ours.get(CREDENTIAL_FIELD) == WITHHELD


def hold(run_id: str, credential: str) -> None:
    """
    Keep a run's credential until the run takes it.

    Parameters
    ----------
    run_id : str
        The A2A task the credential arrived with.
    credential : str
        The credential.
    """
    _held[run_id] = credential


def release(run_id: str) -> str | None:
    """
    The credential held for a run, forgotten as it is answered.

    Parameters
    ----------
    run_id : str
        The A2A task.

    Returns
    -------
    str | None
        The credential, when one was held.
    """
    return _held.pop(run_id, None)

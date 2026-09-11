# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a delegation hands its worker, and what the worker hands back (ORCHESTRATOR.md, O1-17, O2-05).

**The credential.** The control plane sends an execution's own token with the
delegation, under ``datalayer.credential`` in the A2A message's ``metadata``
or the ACP prompt's ``_meta``, beside the model budget. It is a bearer
credential, so it is taken out of the message as the message arrives — before
an A2A task, its context or the work a broker owes is written — and kept in
this process, for the run it was sent for, and nowhere else. What the message
keeps is that one was sent (``withheld``): a run a restarted runtime owes has
lost it, and fails rather than run as the runtime; the execution's retry
dispatches with a token of its own.

**The extension.** A worker ``agent-runtimes`` serves speaks the Datalayer
orchestration extension (``EXTENSION_URI``): its delegation names its
execution (``datalayer.execution``), which is the scope its checkpoints are
kept under; it can be asked to pause, and answers with the checkpoint it
paused at (``datalayer.paused``); a delegation naming that checkpoint
(``datalayer.checkpoint``) resumes from it; and a steer delivered while it
works is added to its run before the next model request (``SteerCapability``).
"""

from __future__ import annotations

import dataclasses
from collections.abc import Mapping, MutableMapping
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ModelRequest, UserPromptPart

from agent_runtimes.guardrails.model_budget import DELEGATION_META_KEY

__all__ = [
    "CHECKPOINT_FIELD",
    "CREDENTIAL_FIELD",
    "EXECUTION_FIELD",
    "EXTENSION_URI",
    "PAUSED_FIELD",
    "PAUSE_FIELD",
    "STEER_METHOD",
    "WITHHELD",
    "CredentialLost",
    "SteerCapability",
    "checkpoint_of",
    "close_steering",
    "deliver_steer",
    "enter_execution",
    "execution_of",
    "forget_pause",
    "hold",
    "open_steering",
    "pause_asked",
    "pause_meta",
    "pause_requested",
    "paused_at",
    "paused_meta",
    "release",
    "request_pause",
    "run_execution",
    "take_credential",
    "take_steers",
    "was_delegated",
]

#: The Datalayer orchestration extension this runtime's workers speak: on the
#: A2A agent card, and in the ACP agent's capabilities.
EXTENSION_URI = "https://datalayer.ai/extensions/orchestration/v1"

#: Where, under ``datalayer``, the delegation carries the credential.
CREDENTIAL_FIELD = "credential"
#: The execution a delegation is for: ``{executionId, parentExecutionId, rootExecutionId, depth}``.
EXECUTION_FIELD = "execution"
#: The checkpoint a delegation resumes from: ``{checkpointId}``.
CHECKPOINT_FIELD = "checkpoint"
#: What a paused worker answers: ``{checkpointId}``.
PAUSED_FIELD = "paused"
#: What an ACP ``session/cancel`` carries when it asks for a pause: ``true``.
PAUSE_FIELD = "pause"
#: The ACP notification that steers a running turn: ``{sessionId, instructions}``.
STEER_METHOD = "_datalayer/steer"

#: What the message keeps in the credential's place: that one was sent, and not what it was.
WITHHELD = "withheld"

#: Run id -> the credential delegated for it. Process memory only.
_held: dict[str, str] = {}
#: The runs asked to pause.
_pauses: set[str] = set()
#: Run id -> what was steered into it and not yet given to its model; a run
#: is here only while it can be steered.
_steers: dict[str, list[str]] = {}
#: The execution the current run works on, as its delegation named it, when
#: the control plane dispatched the run; a tool reads it here (O2-06).
_run_execution: ContextVar[dict[str, Any] | None] = ContextVar(
    "datalayer_run_execution", default=None
)


class CredentialLost(RuntimeError):
    """A run delegated with a credential this process no longer holds."""


def _ours(meta: Any) -> Mapping[str, Any] | None:
    ours = meta.get(DELEGATION_META_KEY) if isinstance(meta, Mapping) else None
    return ours if isinstance(ours, Mapping) else None


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
    ours = _ours(meta)
    return ours is not None and ours.get(CREDENTIAL_FIELD) == WITHHELD


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


def execution_of(meta: Any) -> str | None:
    """
    The execution a delegation is for, which its checkpoints are kept under.

    Parameters
    ----------
    meta : Any
        The A2A message's ``metadata`` or the ACP prompt's ``_meta``.

    Returns
    -------
    str | None
        Its ``executionId``, when the delegation names one.
    """
    ours = _ours(meta)
    execution = ours.get(EXECUTION_FIELD) if ours is not None else None
    execution_id = execution.get("executionId") if isinstance(execution, Mapping) else None
    return execution_id if isinstance(execution_id, str) and execution_id else None


def enter_execution(meta: Any) -> None:
    """
    Put on the current run the execution its delegation names, or none.

    Called by a transport as a run starts, so a run nobody orchestrates is
    never taken for the one before it (O2-06).

    Parameters
    ----------
    meta : Any
        The A2A message's ``metadata`` or the ACP prompt's ``_meta``.
    """
    ours = _ours(meta)
    execution = ours.get(EXECUTION_FIELD) if ours is not None else None
    named = execution_of(meta) is not None and isinstance(execution, Mapping)
    _run_execution.set(dict(execution) if named else None)


def run_execution() -> dict[str, Any] | None:
    """
    The execution the current run works on, when the control plane dispatched it.

    Returns
    -------
    dict[str, Any] | None
        ``{executionId, rootExecutionId, parentExecutionId, depth, accountUid}``
        as the delegation named it, or ``None`` for a run nobody orchestrates.
    """
    return _run_execution.get()


def checkpoint_of(meta: Any) -> str | None:
    """
    The checkpoint a delegation resumes from.

    Parameters
    ----------
    meta : Any
        The A2A message's ``metadata`` or the ACP prompt's ``_meta``.

    Returns
    -------
    str | None
        Its ``checkpointId``, when the delegation names one.
    """
    ours = _ours(meta)
    checkpoint = ours.get(CHECKPOINT_FIELD) if ours is not None else None
    checkpoint_id = checkpoint.get("checkpointId") if isinstance(checkpoint, Mapping) else None
    return checkpoint_id if isinstance(checkpoint_id, str) and checkpoint_id else None


def paused_meta(checkpoint_id: str) -> dict[str, Any]:
    """
    What a paused worker answers with: the checkpoint a resume names.

    Parameters
    ----------
    checkpoint_id : str
        The checkpoint the worker saved as it paused.

    Returns
    -------
    dict[str, Any]
        The A2A status message's ``metadata``, or the ACP response's ``_meta``.
    """
    return {DELEGATION_META_KEY: {PAUSED_FIELD: {"checkpointId": checkpoint_id}}}


def paused_at(meta: Any) -> str | None:
    """
    The checkpoint a worker says it paused at, when it paused.

    Parameters
    ----------
    meta : Any
        The A2A status message's ``metadata`` or the ACP response's ``_meta``.

    Returns
    -------
    str | None
        The checkpoint id.
    """
    ours = _ours(meta)
    paused = ours.get(PAUSED_FIELD) if ours is not None else None
    checkpoint_id = paused.get("checkpointId") if isinstance(paused, Mapping) else None
    return checkpoint_id if isinstance(checkpoint_id, str) and checkpoint_id else None


def pause_meta() -> dict[str, Any]:
    """
    What an ACP ``session/cancel`` carries to ask for a pause rather than a stop.

    Returns
    -------
    dict[str, Any]
        The notification's ``_meta``.
    """
    return {DELEGATION_META_KEY: {PAUSE_FIELD: True}}


def pause_asked(meta: Any) -> bool:
    """
    Whether a cancel asks to pause rather than only to stop.

    Parameters
    ----------
    meta : Any
        The ACP ``session/cancel``'s ``_meta``.

    Returns
    -------
    bool
        True when it carries ``datalayer.pause``.
    """
    ours = _ours(meta)
    return ours is not None and ours.get(PAUSE_FIELD) is True


def request_pause(run_id: str) -> None:
    """
    Ask a run to pause: it saves a checkpoint and stops, rather than being cancelled.

    Parameters
    ----------
    run_id : str
        The A2A task or the ACP session.
    """
    _pauses.add(run_id)


def pause_requested(run_id: str) -> bool:
    """
    Whether a run was asked to pause.

    Parameters
    ----------
    run_id : str
        The A2A task or the ACP session.

    Returns
    -------
    bool
        True when it was.
    """
    return run_id in _pauses


def forget_pause(run_id: str) -> None:
    """
    Forget that a run was asked to pause, once it has.

    Parameters
    ----------
    run_id : str
        The A2A task or the ACP session.
    """
    _pauses.discard(run_id)


def open_steering(run_id: str) -> None:
    """
    Let a run be steered while it works.

    Parameters
    ----------
    run_id : str
        The A2A task or the ACP session.
    """
    _steers.setdefault(run_id, [])


def close_steering(run_id: str) -> None:
    """
    Stop steering a run that has stopped; what it was not given is dropped.

    Parameters
    ----------
    run_id : str
        The A2A task or the ACP session.
    """
    _steers.pop(run_id, None)


def deliver_steer(run_id: str, instructions: str) -> bool:
    """
    Steer a working run: its next model request sees the instructions.

    Parameters
    ----------
    run_id : str
        The A2A task or the ACP session.
    instructions : str
        What to add.

    Returns
    -------
    bool
        False when the run is not working, so the steer reached nobody.
    """
    if run_id not in _steers:
        return False
    _steers[run_id].append(instructions)
    return True


def take_steers(run_id: str) -> list[str]:
    """
    What was steered into a run since its last model request, taken.

    Parameters
    ----------
    run_id : str
        The A2A task or the ACP session.

    Returns
    -------
    list[str]
        The instructions, in the order they arrived.
    """
    steers = _steers.get(run_id)
    if not steers:
        return []
    taken = list(steers)
    steers.clear()
    return taken


@dataclass
class SteerCapability(AbstractCapability[Any]):
    """
    Add what was steered into a run to its next model request (O2-05).

    The instructions join the request about to be sent, as a user prompt part
    of it, so the model reads them with the tool results it is about to see —
    within the turn, not after it.

    Parameters
    ----------
    run_id : str
        The A2A task or the ACP session steered.
    """

    run_id: str = ""

    async def before_model_request(self, ctx: Any, request_context: Any) -> Any:
        steers = take_steers(self.run_id)
        if not steers:
            return request_context
        part = UserPromptPart(content="Steering from the orchestrator:\n" + "\n\n".join(steers))
        messages = list(request_context.messages)
        if messages and isinstance(messages[-1], ModelRequest):
            messages[-1] = dataclasses.replace(messages[-1], parts=[*messages[-1].parts, part])
        else:
            messages.append(ModelRequest(parts=[part]))
        return dataclasses.replace(request_context, messages=messages)

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The orchestration extension's wire contract, as JSON Schema (O3-01).

`EXTENSION_URI` is a public identifier: a worker's A2A agent card advertises
it, an ACP `initialize` result names it, and a third party is expected to
implement against it. Prose is not enough for that — an implementer needs
something a validator can read — and a schema hand-written beside the code
is a schema that stops being true on the first rename.

So this builds the document from the constants that *are* the contract, in
`agent_runtimes.context.delegation` and `agent_runtimes.orchestration.budget`.
Rename `SPENT_FIELD` and the schema renames with it; add a field to the
envelope and the schema does not, which is what
`test_orchestration_extension_schema.py` fails on.

Only what is actually on the wire is described. Five fields the specification
proposes — `acknowledgement`, `attempt`, `contextManifest`,
`artifactProvenance`, `approvalRequest` — are deliberately absent, because a
schema that described them would tell an implementer to expect fields nothing
sends.
"""

from __future__ import annotations

from typing import Any

from agent_runtimes.context.delegation import (
    CHECKPOINT_FIELD,
    CREDENTIAL_FIELD,
    EXECUTION_FIELD,
    EXTENSION_URI,
    PAUSE_FIELD,
    PAUSED_FIELD,
    SPENT_FIELD,
    STEER_METHOD,
    WITHHELD,
)
from agent_runtimes.guardrails.model_budget import DELEGATION_META_KEY

#: The budget field of a delegation, which `budget.model_budget` writes.
BUDGET_FIELD = "budget"

#: What a worker says stopped it, which `budget.budget_refusal` reads.
ERROR_FIELD = "error"

_TOKENS = {"type": "integer", "minimum": 0}
_CURRENCY = {"type": "string", "default": "USD"}


def _usage(description: str) -> dict[str, Any]:
    """
    The shape of a token-and-cost count, which both directions use.

    Parameters
    ----------
    description : str
        What this particular count means.

    Returns
    -------
    dict[str, Any]
        The JSON Schema object.
    """
    return {
        "type": "object",
        "description": description,
        "properties": {
            "inputTokens": _TOKENS,
            "outputTokens": _TOKENS,
            "cost": {"type": "number", "minimum": 0},
            "currency": _CURRENCY,
        },
        "additionalProperties": False,
    }


def extension_schema() -> dict[str, Any]:
    """
    The JSON Schema of the `datalayer` envelope, both directions.

    Returns
    -------
    dict[str, Any]
        A JSON Schema document describing what an orchestrator may send a
        worker and what a worker may answer with, keyed by the field names
        the implementation actually uses.
    """
    orchestrator_sends = {
        EXECUTION_FIELD: {
            "type": "object",
            "description": (
                "Which execution this delegation is, and where it sits in its "
                "tree. Neither protocol can say which task is whose parent."
            ),
            "properties": {
                "executionId": {"type": "string"},
                "rootExecutionId": {"type": "string"},
                "parentExecutionId": {"type": "string"},
                "depth": {"type": "integer", "minimum": 0},
                "accountUid": {
                    "type": "string",
                    "description": "The account a request for a child is made in.",
                },
            },
            "required": ["executionId", "rootExecutionId", "depth"],
            "additionalProperties": False,
        },
        BUDGET_FIELD: _usage(
            "The limits this worker must decline before exceeding, rather "
            "than have detected after the spend."
        ),
        CREDENTIAL_FIELD: {
            "type": "string",
            "description": (
                "The execution's short-lived token, scoped to its context "
                "manifest. A bearer credential: taken out of the message on "
                f"arrival and replaced by {WITHHELD!r} in anything stored."
            ),
        },
        CHECKPOINT_FIELD: {
            "type": "object",
            "description": "Continue the work this checkpoint holds.",
            "properties": {"checkpointId": {"type": "string"}},
            "required": ["checkpointId"],
            "additionalProperties": False,
        },
        PAUSE_FIELD: {
            "type": "boolean",
            "description": (
                "Stop at a checkpoint you can be resumed from. Neither "
                "protocol has a pause; both only cancel."
            ),
        },
    }
    worker_sends = {
        SPENT_FIELD: _usage(
            "What this turn spent. A budget's cost is a limit, not a "
            "measurement, and nothing else records what one node of a tree "
            "used. `cost` only when the worker could price its own model."
        ),
        PAUSED_FIELD: {
            "type": "object",
            "description": "The checkpoint the worker actually stopped at.",
            "properties": {"checkpointId": {"type": "string"}},
            "required": ["checkpointId"],
            "additionalProperties": False,
        },
        ERROR_FIELD: {
            "type": "object",
            "description": (
                "A refusal the worker owns, as distinct from a worker that "
                "broke: nothing another attempt could spend differently."
            ),
            "properties": {
                "code": {"type": "string", "enum": ["budget_exhausted"]},
                "limit": {"type": "string"},
            },
            "required": ["code"],
            "additionalProperties": True,
        },
    }
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": f"{EXTENSION_URI}/schema.json",
        "title": "Datalayer orchestration extension, v1",
        "description": (
            "The optional envelope an orchestrator and a worker exchange "
            "under the key "
            f"{DELEGATION_META_KEY!r} — in an A2A message's `metadata`, or an "
            "ACP prompt's or result's `_meta`. Every field is optional: a "
            "worker implementing none of it still runs, completes, returns "
            "artifacts and can be cancelled. Negotiated rather than assumed: "
            "an orchestrator sends these only to a worker whose agent card or "
            f"`initialize` result advertises {EXTENSION_URI!r}."
        ),
        "type": "object",
        "properties": {
            DELEGATION_META_KEY: {
                "type": "object",
                "properties": {**orchestrator_sends, **worker_sends},
                "additionalProperties": False,
            }
        },
        "additionalProperties": True,
        "x-datalayer-extension": {
            "uri": EXTENSION_URI,
            "envelopeKey": DELEGATION_META_KEY,
            "orchestratorSends": sorted(orchestrator_sends),
            "workerSends": sorted(worker_sends),
            "methods": {
                STEER_METHOD: (
                    "Add instructions to a running turn. A2A cannot; ACP can "
                    "prompt the same session again, so this is defined once "
                    "and an orchestrator does not branch on protocol."
                )
            },
            "specifiedNotYetOnTheWire": [
                "acknowledgement",
                "attempt",
                "contextManifest",
                "artifactProvenance",
                "approvalRequest",
            ],
        },
    }


__all__ = ["BUDGET_FIELD", "ERROR_FIELD", "extension_schema"]

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The evalset spec, frozen.

An ``*.evalset.json`` file is what the CLI, the SDK, the GitHub Action and
the UI's import all turn into a ``POST /evalsets``. The four used to agree
by habit; this is the agreement written down (BENCHMARK.md, B0-03): a spec
that validates here creates the same evalset from any of them, and a spec
that does not is refused before a request is made, with the path that is
wrong.

Cases carry their own evaluators; the evalset carries evalset-level and
report-level evaluators; ``schema`` and ``metadata`` are free documents the
spec's author owns. Nothing here renames a field: the keys are the API's.

@module agent_runtimes.evals.spec_schema
"""

from __future__ import annotations

from typing import Any

import jsonschema

__all__ = [
    "EVALSET_SPEC_SCHEMA",
    "EvalsetSpecError",
    "validate_evalset_spec",
    "evalset_payload_from_spec",
]

_EVALUATOR_REF = {
    "type": "object",
    "required": ["name"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "arguments": {"type": "object"},
        "config": {"type": "object"},
    },
}

_CASE = {
    "type": "object",
    "required": ["name"],
    "properties": {
        "id": {"type": "string"},
        "name": {"type": "string", "minLength": 1},
        "inputs": {"type": ["object", "string"]},
        "expected_output": {},
        "evaluators": {"type": "array", "items": _EVALUATOR_REF},
        "metadata": {"type": "object"},
    },
}

#: JSON Schema (draft 2020-12) of an evalset spec file.
EVALSET_SPEC_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://datalayer.ai/schemas/evalset-spec.json",
    "title": "Datalayer evalset spec",
    "type": "object",
    "required": ["name"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "description": {"type": "string"},
        "run_environment": {"type": "string", "enum": ["ui", "sdk"]},
        "kind": {"type": "string", "enum": ["batch", "interactive"]},
        "category": {
            "type": "string",
            "enum": ["data", "coding", "tool-use", "model", "visual", "performance"],
        },
        "tags": {"type": "array", "items": {"type": "string"}},
        "metadata": {"type": "object"},
        "schema": {"type": "object"},
        "evalset_evaluators": {"type": "array", "items": _EVALUATOR_REF},
        "report_evaluators": {"type": "array", "items": _EVALUATOR_REF},
        "cases": {"type": "array", "items": _CASE},
        "is_public": {"type": "boolean"},
    },
}


class EvalsetSpecError(ValueError):
    """A spec that is not an evalset spec, and where it went wrong."""


def validate_evalset_spec(spec: Any, *, source: str = "spec") -> dict[str, Any]:
    """Validate a loaded spec and return it.

    Raises :class:`EvalsetSpecError` naming the JSON path of the first
    problem, so a CI log says which case or which field to fix.
    """
    if not isinstance(spec, dict):
        raise EvalsetSpecError(f"{source}: an evalset spec is a JSON object")
    validator = jsonschema.Draft202012Validator(EVALSET_SPEC_SCHEMA)
    errors = sorted(validator.iter_errors(spec), key=lambda error: list(error.absolute_path))
    if errors:
        first = errors[0]
        path = "/".join(str(part) for part in first.absolute_path) or "(root)"
        raise EvalsetSpecError(f"{source}: {path}: {first.message}")
    return spec


def evalset_payload_from_spec(spec: dict[str, Any]) -> dict[str, Any]:
    """The ``POST /evalsets`` body a valid spec becomes.

    The SDK's ``evals_create_eval_from_spec``, the UI's import and the
    service's ``POST /evalsets/import`` all derive the same body from the
    same spec through this function, which is what makes them identical.
    """
    validate_evalset_spec(spec)
    return {
        "name": str(spec.get("name") or "").strip(),
        "description": str(spec.get("description") or ""),
        "run_environment": str(spec.get("run_environment") or "sdk"),
        "kind": str(spec.get("kind") or "batch"),
        "schema": dict(spec.get("schema") or {}),
        "evalset_evaluators": [dict(item) for item in (spec.get("evalset_evaluators") or [])],
        "report_evaluators": [dict(item) for item in (spec.get("report_evaluators") or [])],
        "tags": [str(tag) for tag in (spec.get("tags") or []) if str(tag).strip()],
        "metadata": dict(spec.get("metadata") or {}),
        "cases": [dict(item) for item in (spec.get("cases") or [])],
    }

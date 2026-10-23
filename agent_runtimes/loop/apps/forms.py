# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Forms an application asks with, checked again when they arrive (C-16).

What an application needs from a person — a quote's parameters, an approval's
reason — is a Form block on its surface: the JSON Schema of its fields. The
page draws it with ``@datalayer/primer-rjsf`` and sends nothing the schema
refuses. What it sends is its action's payload, which the runtime checks
against the model the action of its code declares (``@app.action(name,
payload=Model)``, RU-5) before its code runs.

An application's settings are a form of the same kind (``interface.settings``):
the values a run is given and a deployment set, checked against that schema
when they arrive (`refused_by`), each field starting at its ``default``.
"""

from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

import jsonschema

from agent_runtimes.types import AppSpec


def form_fields(schema: Optional[Mapping[str, Any]]) -> Dict[str, Mapping[str, Any]]:
    """A form's fields by name, in the order its schema says them; none without one."""
    properties = (schema or {}).get("properties") or {}
    return {
        str(name): field
        for name, field in properties.items()
        if isinstance(field, Mapping)
    }


def form_defaults(schema: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    """What each field of a form starts at: its ``default``, for those that say one."""
    return {
        name: field["default"]
        for name, field in form_fields(schema).items()
        if "default" in field
    }


def field_title(schema: Optional[Mapping[str, Any]], name: str) -> str:
    """A field as a person reads it: its ``title``, else its name."""
    field = form_fields(schema).get(name) or {}
    return str(field.get("title") or name)


def refused_by(schema: Mapping[str, Any], values: Any, title: str) -> Optional[str]:
    """Why a form's schema refuses its values, in a sentence; None when it takes them.

    Parameters
    ----------
    schema : mapping
        The JSON Schema of the form.
    values : Any
        What was sent.
    title : str
        The form, as a person reads it.

    Returns
    -------
    str or None
        The form, then each field and why.
    """
    refused = sorted(
        jsonschema.Draft202012Validator(schema).iter_errors(values),
        key=lambda error: list(error.path),
    )
    if not refused:
        return None
    said = "; ".join(
        f"{'.'.join(str(part) for part in error.path) or 'its values'}: {error.message}"
        for error in refused
    )
    return f"“{title}” was sent what its fields refuse: {said}."


__all__ = [
    "field_title",
    "form_defaults",
    "form_fields",
    "refused_by",
]

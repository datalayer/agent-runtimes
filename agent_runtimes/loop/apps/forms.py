# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Forms an application asks with, checked again when they arrive (LOOP C-16).

What an application needs from a person — a quote's parameters, an approval's
reason — is a Form block on its surface: the JSON Schema of its fields. The
page draws it with ``@datalayer/primer-rjsf`` and sends nothing the schema
refuses; the runtime checks what it receives against the same schema before
the application acts on it, so that a page that skipped the check, or a call
made without the page, is refused in a sentence.

A form's values reach the runtime as its action's context: the action named by
the block (``action.event.name``), whose context reads the path its ``values``
binding writes. Each Form whose action is the one received, and whose values
the payload carries, is checked.

An application's settings are a form of the same kind (``interface.settings``):
the values a run is given and a deployment set, checked against that schema
when they arrive (`refused_by`), each field starting at its ``default``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional

import jsonschema

from agent_runtimes.types import AppSpec


def _path(value: Any) -> Optional[str]:
    """The path a binding points at, or None."""
    if isinstance(value, Mapping) and isinstance(value.get("path"), str):
        return str(value["path"])
    return None


def _form_keys(node: Mapping[str, Any], action: str) -> List[str]:
    """The keys of an action's context that carry a Form's values."""
    event = (node.get("action") or {}).get("event") or {}
    if event.get("name") != action:
        return []
    context = event.get("context") or {}
    bound = _path(node.get("values"))
    return [
        key
        for key, value in context.items()
        if _path(value) is not None and (bound is None or _path(value) == bound)
    ]


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


def form_values_refused(
    app: AppSpec, action: str, payload: Mapping[str, Any]
) -> Optional[str]:
    """Why the values a Form sent with an action are refused, or None.

    Parameters
    ----------
    app : AppSpec
        The application, whose surface holds its forms.
    action : str
        The action received, as its block names it.
    payload : mapping
        Its context, as the page resolved it.

    Returns
    -------
    str or None
        The refusal in a sentence: the form, then each field and why.
    """
    surface = app.interface.surface
    if surface is None:
        return None
    for node in surface.components:
        if node.get("component") != "Form":
            continue
        # A Form has its schema: the Appspec is refused without one (form_problems).
        schema: Mapping[str, Any] = node["schema"]
        for key in _form_keys(node, action):
            if key not in payload:
                continue
            refused = refused_by(
                schema, payload[key], str(node.get("title") or node["id"])
            )
            if refused:
                return refused
    return None


__all__ = [
    "field_title",
    "form_defaults",
    "form_fields",
    "form_values_refused",
    "refused_by",
]

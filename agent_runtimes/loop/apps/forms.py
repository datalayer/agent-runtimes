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
"""

from __future__ import annotations

from typing import Any, List, Mapping, Optional

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
        schema = node.get("schema")
        for key in _form_keys(node, action):
            if key not in payload:
                continue
            refused = sorted(
                jsonschema.Draft202012Validator(schema).iter_errors(payload[key]),
                key=lambda error: list(error.path),
            )
            if refused:
                said = "; ".join(
                    f"{'.'.join(str(part) for part in error.path) or 'its values'}: "
                    f"{error.message}"
                    for error in refused
                )
                title = node.get("title") or node["id"]
                return f"“{title}” was sent what its fields refuse: {said}."
    return None


__all__ = ["form_values_refused"]

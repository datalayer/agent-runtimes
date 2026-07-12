# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2UI generative-UI example tool.

This module exposes a single backend tool, :func:`render_a2ui_surface`, that
turns a declarative field specification produced by the model into a fully
validated A2UI v0.9 surface (``createSurface`` + ``updateComponents`` +
``updateDataModel`` messages).

The frontend renders the returned messages inline in the chat (and in a main
canvas) using the ``@a2ui/react`` renderer, giving the agent the ability to
generate real, interactive user interfaces — forms, cards and lists — from a
natural-language request.

The tool is referenced from a ToolSpec ``runtime`` block via ``package`` +
``method`` and registered on a ``pydantic_ai.Agent`` through
``register_agent_tools`` (which wires it with ``tool_plain``).
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Any, Literal, Optional

from a2ui.basic_catalog.provider import BasicCatalog
from a2ui.schema.constants import VERSION_0_9
from a2ui.schema.manager import A2uiSchemaManager
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

A2UI_BASIC_CATALOG_ID = BasicCatalog.get_catalog_id(VERSION_0_9)

FieldType = Literal[
    "text",
    "longtext",
    "email",
    "choice",
    "multichoice",
    "checkbox",
    "slider",
    "date",
    "datetime",
]


class A2uiOption(BaseModel):
    """A selectable option for a ``choice`` or ``multichoice`` field."""

    label: str = Field(description="Human-readable option label.")
    value: str = Field(description="Stable machine value stored in the data model.")


class A2uiField(BaseModel):
    """A single declarative field the agent wants rendered on the surface."""

    id: str = Field(description="Unique field id (kebab-case, no spaces).")
    label: str = Field(description="Human-readable label shown to the user.")
    type: FieldType = Field(description="The kind of input control to render.")
    help: Optional[str] = Field(
        default=None,
        description="Optional helper text rendered under the field label.",
    )
    required: bool = Field(
        default=False,
        description=(
            "Whether the user must provide a value before the form can be "
            "submitted. Mark essential fields (name, email, category, ...) as "
            "required; leave optional fields (comments, notes, ...) unmarked. "
            "Required fields are labelled with a '*' and the submit is blocked "
            "until they are filled in."
        ),
    )
    options: Optional[list[A2uiOption]] = Field(
        default=None,
        description="Options for 'choice' / 'multichoice' fields.",
    )
    pattern: Optional[str] = Field(
        default=None,
        description=(
            "Optional regular expression the value must match (text/email/"
            "longtext fields). Use for things like phone numbers or codes. "
            "Email fields are already validated for email format automatically."
        ),
    )
    min_length: Optional[int] = Field(
        default=None,
        description=(
            "Optional minimum number of characters for text/longtext fields."
        ),
    )
    default: Optional[str] = Field(
        default=None,
        description=(
            "Optional default value. For text fields a string; for choice fields "
            "the option value; for checkbox 'true'/'false'; for slider a number."
        ),
    )
    min: Optional[float] = Field(
        default=None, description="Minimum value for a 'slider' field."
    )
    max: Optional[float] = Field(
        default=None, description="Maximum value for a 'slider' field."
    )


class A2uiSummaryItem(BaseModel):
    """A read-only key/value chip shown in the surface header."""

    label: str = Field(description="Short label, e.g. 'Priority'.")
    value: str = Field(description="Short value, e.g. 'High'.")


@lru_cache(maxsize=1)
def _catalog() -> Any:
    manager = A2uiSchemaManager(
        version=VERSION_0_9,
        catalogs=[BasicCatalog.get_config(version=VERSION_0_9)],
    )
    return manager.get_selected_catalog()


def _validate(messages: list[dict[str, Any]]) -> list[str]:
    """Validate messages against the basic catalog, returning warning strings."""
    warnings: list[str] = []
    try:
        catalog = _catalog()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("A2UI catalog unavailable for validation: %s", exc)
        return warnings
    for index, message in enumerate(messages):
        try:
            catalog.validator.validate(message)
        except Exception as exc:
            command = next((k for k in message if k != "version"), "unknown")
            warning = f"message {index} ({command}) failed validation: {exc}"
            warnings.append(warning)
            logger.warning("A2UI %s", warning)
    return warnings


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "field"


def _default_for(field: A2uiField) -> Any:
    if field.type in ("choice", "multichoice"):
        if field.default:
            return [field.default]
        return []
    if field.type == "checkbox":
        return str(field.default).strip().lower() in ("true", "1", "yes", "on")
    if field.type == "slider":
        try:
            return float(field.default) if field.default is not None else (
                field.min if field.min is not None else 0
            )
        except ValueError:
            return field.min if field.min is not None else 0
    return field.default or ""


def _field_rule(field: A2uiField) -> dict[str, Any]:
    """Build the client-side validation rule descriptor for a field.

    The frontend uses this to gate form submission: required fields must be
    filled in, ``email`` fields must contain a valid email address, and any
    ``pattern`` / ``min_length`` / slider ``min``/``max`` constraints must
    hold before the submission is sent back to the agent.
    """
    rule: dict[str, Any] = {
        "id": field.id,
        "label": field.label,
        "type": field.type,
        "required": field.required,
    }
    if field.type == "email":
        rule["format"] = "email"
    if field.pattern:
        rule["pattern"] = field.pattern
    if field.min_length is not None:
        rule["minLength"] = field.min_length
    if field.type == "slider":
        if field.min is not None:
            rule["min"] = field.min
        if field.max is not None:
            rule["max"] = field.max
    return rule


def _field_checks(field: A2uiField) -> list[dict[str, Any]]:
    """Build A2UI checks for a field so errors render inline by the control."""
    value = {"path": f"/form/{field.id}"}
    checks: list[dict[str, Any]] = []

    if field.required:
        checks.append(
            {
                "condition": {
                    "call": "required",
                    "args": {"value": value},
                },
                "message": f"{field.label} is required.",
            }
        )

    if field.type == "email":
        checks.append(
            {
                "condition": {
                    "call": "email",
                    "args": {"value": value},
                },
                "message": f"{field.label} must be a valid email address.",
            }
        )

    if field.pattern and field.required:
        checks.append(
            {
                "condition": {
                    "call": "regex",
                    "args": {
                        "value": value,
                        "pattern": field.pattern,
                    },
                },
                "message": f"{field.label} is not in the expected format.",
            }
        )

    return checks


def _submit_checks(fields: list[A2uiField]) -> list[dict[str, Any]]:
    """Build button checks so invalid forms cannot be submitted."""
    conditions: list[dict[str, Any]] = []

    for field in fields:
        value = {"path": f"/form/{field.id}"}
        if field.required:
            conditions.append(
                {
                    "call": "required",
                    "args": {"value": value},
                }
            )
        if field.type == "email":
            conditions.append(
                {
                    "call": "email",
                    "args": {"value": value},
                }
            )
        if field.pattern and field.required:
            conditions.append(
                {
                    "call": "regex",
                    "args": {
                        "value": value,
                        "pattern": field.pattern,
                    },
                }
            )

    if not conditions:
        return []

    return [
        {
            "condition": {
                "call": "and",
                "args": {"values": conditions},
            },
            "message": "Please fix the highlighted fields before submitting.",
        }
    ]


def _field_components(
    field: A2uiField,
) -> tuple[list[dict[str, Any]], Optional[str]]:
    """Return (components, label_component_id) for a single field.

    The label component id is returned so it can be inserted into the parent
    column before the control (fields with a native ``label`` return ``None``).
    """
    path = f"/form/{field.id}"
    base = {"id": field.id}
    label = f"{field.label} *" if field.required else field.label

    if field.type in ("text", "email"):
        base.update(
            {
                "component": "TextField",
                "label": label,
                "value": {"path": path},
                "checks": _field_checks(field),
            }
        )
        return [base], None

    if field.type == "longtext":
        base.update(
            {
                "component": "TextField",
                "label": label,
                "variant": "longText",
                "value": {"path": path},
                "checks": _field_checks(field),
            }
        )
        return [base], None

    if field.type in ("choice", "multichoice"):
        options = field.options or []
        base.update(
            {
                "component": "ChoicePicker",
                "label": label,
                "variant": (
                    "multipleSelection"
                    if field.type == "multichoice"
                    else "mutuallyExclusive"
                ),
                "displayStyle": "chips" if field.type == "choice" else "checkbox",
                "options": [
                    {"label": opt.label, "value": opt.value} for opt in options
                ],
                "value": {"path": path},
                "checks": _field_checks(field),
            }
        )
        return [base], None

    if field.type == "checkbox":
        base.update(
            {
                "component": "CheckBox",
                "label": label,
                "value": {"path": path},
                "checks": _field_checks(field),
            }
        )
        return [base], None

    if field.type == "slider":
        base.update(
            {
                "component": "Slider",
                "label": label,
                "min": field.min if field.min is not None else 0,
                "max": field.max if field.max is not None else 100,
                "value": {"path": path},
                "checks": _field_checks(field),
            }
        )
        return [base], None

    if field.type in ("date", "datetime"):
        base.update(
            {
                "component": "DateTimeInput",
                "label": label,
                "enableDate": True,
                "enableTime": field.type == "datetime",
                "value": {"path": path},
                "checks": _field_checks(field),
            }
        )
        return [base], None

    # Unknown type — render a plain text note so the surface stays valid.
    base.update({"component": "Text", "text": f"Unsupported field: {field.type}"})
    return [base], None


async def render_a2ui_surface(
    title: str,
    intro: str,
    fields: list[A2uiField],
    submit_label: str = "Submit",
    summary_items: Optional[list[A2uiSummaryItem]] = None,
    surface_id: str = "a2ui-agent-surface",
) -> dict[str, Any]:
    """Render an interactive A2UI surface from a declarative field spec.

    Use this tool whenever the user asks for a form, intake, configurator,
    survey, booking, checklist or any other interactive UI. Provide a concise
    ``title``, a one-sentence ``intro`` and a list of ``fields``. The rendered
    surface is shown to the user directly — do not repeat the field contents in
    your text reply, just briefly confirm what you built.

    Args:
        title: Heading shown at the top of the surface.
        intro: One-sentence description of what the surface is for.
        fields: Ordered list of input fields to render. Supported ``type``
            values: ``text``, ``longtext``, ``email``, ``choice``,
            ``multichoice``, ``checkbox``, ``slider``, ``date``, ``datetime``.
            ``choice``/``multichoice`` require ``options``; ``slider`` accepts
            ``min``/``max``. Set ``required=True`` on fields the user must fill
            in before submitting; the form blocks submission until they have a
            value.
        submit_label: Label for the primary submit button.
        summary_items: Optional read-only key/value chips shown in the header
            (for example detected priority or category).
        surface_id: Stable surface identifier (defaults are fine).

    Returns:
        A dict with the surface id, catalog id and the ordered list of A2UI
        v0.9 messages the frontend renders.
    """
    summary_items = summary_items or []

    # ----- components -----------------------------------------------------
    components: list[dict[str, Any]] = []
    root_children: list[str] = ["surface-title", "surface-intro"]

    components.append(
        {
            "id": "surface-title",
            "component": "Text",
            "variant": "h2",
            "text": title,
        }
    )
    components.append(
        {
            "id": "surface-intro",
            "component": "Text",
            "text": intro,
        }
    )

    # Optional summary chips row.
    if summary_items:
        chip_ids: list[str] = []
        for index, item in enumerate(summary_items):
            chip_id = f"summary-{index}"
            chip_ids.append(chip_id)
            components.append(
                {
                    "id": chip_id,
                    "component": "Text",
                    "variant": "caption",
                    "text": f"{item.label}: {item.value}",
                }
            )
        components.append(
            {
                "id": "summary-row",
                "component": "Row",
                "children": chip_ids,
                "justify": "start",
                "align": "center",
            }
        )
        root_children.append("summary-row")

    # Form card.
    form_children: list[str] = []
    for field in fields:
        field_components, _ = _field_components(field)
        components.extend(field_components)
        form_children.append(field.id)
        if field.help:
            help_id = f"{field.id}-help"
            components.append(
                {
                    "id": help_id,
                    "component": "Text",
                    "variant": "caption",
                    "text": field.help,
                }
            )
            form_children.append(help_id)

    # Submit button + label.
    submit_context: dict[str, Any] = {
        field.id: {"path": f"/form/{field.id}"} for field in fields
    }
    components.append(
        {
            "id": "submit-label",
            "component": "Text",
            "text": submit_label,
        }
    )
    components.append(
        {
            "id": "submit-button",
            "component": "Button",
            "variant": "primary",
            "child": "submit-label",
            "checks": _submit_checks(fields),
            "action": {
                "event": {
                    "name": "submit_a2ui_form",
                    "context": submit_context,
                }
            },
        }
    )
    form_children.append("submit-button")

    components.append(
        {
            "id": "form-column",
            "component": "Column",
            "children": form_children,
        }
    )
    components.append(
        {
            "id": "form-card",
            "component": "Card",
            "child": "form-column",
        }
    )
    root_children.append("form-card")

    components.insert(
        0,
        {
            "id": "root",
            "component": "Column",
            "children": root_children,
        },
    )

    # ----- data model -----------------------------------------------------
    form_values: dict[str, Any] = {
        field.id: _default_for(field) for field in fields
    }

    messages: list[dict[str, Any]] = [
        {
            "version": "v0.9",
            "createSurface": {
                "surfaceId": surface_id,
                "catalogId": A2UI_BASIC_CATALOG_ID,
                "sendDataModel": True,
            },
        },
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": surface_id,
                "components": components,
            },
        },
        {
            "version": "v0.9",
            "updateDataModel": {
                "surfaceId": surface_id,
                "path": "/",
                "value": {"form": form_values},
            },
        },
    ]

    warnings = _validate(messages)

    required_fields = [
        {"id": field.id, "label": field.label}
        for field in fields
        if field.required
    ]

    field_rules = [_field_rule(field) for field in fields]

    return {
        "surfaceId": surface_id,
        "catalogId": A2UI_BASIC_CATALOG_ID,
        "title": title,
        "messages": messages,
        "requiredFields": required_fields,
        "fieldRules": field_rules,
        "warnings": warnings,
    }

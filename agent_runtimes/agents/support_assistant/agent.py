# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A deterministic A2UI support assistant used by the examples app."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from a2ui.basic_catalog.provider import BasicCatalog
from a2ui.schema.constants import VERSION_0_9
from a2ui.schema.manager import A2uiSchemaManager

A2UI_BASIC_CATALOG_ID = BasicCatalog.get_catalog_id(VERSION_0_9)
logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_a2ui_catalog() -> Any:
    manager = A2uiSchemaManager(
        version=VERSION_0_9,
        catalogs=[BasicCatalog.get_config(version=VERSION_0_9)],
    )
    return manager.get_selected_catalog()


def _validate_a2ui_messages(messages: list[dict[str, Any]]) -> None:
    try:
        catalog = _get_a2ui_catalog()
    except Exception as exc:  # pragma: no cover
        logger.warning("A2UI support catalog unavailable for validation: %s", exc)
        return
    for index, message in enumerate(messages):
        try:
            catalog.validator.validate(message)
        except Exception as exc:
            command = next((k for k in message if k != "version"), "unknown")
            logger.warning(
                "A2UI support message %d (%s) failed validation: %s",
                index,
                command,
                exc,
            )


def _create_surface(surface_id: str) -> dict[str, Any]:
    return {
        "version": "v0.9",
        "createSurface": {
            "surfaceId": surface_id,
            "catalogId": A2UI_BASIC_CATALOG_ID,
            "sendDataModel": True,
        },
    }


def _build_support_surface(
    *,
    summary: str,
    issue_type: str,
    priority: str,
    recommended_team: str,
    next_steps: list[str],
    user_query: str,
) -> list[dict[str, Any]]:
    return [
        _create_surface("support-chat"),
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": "support-chat",
                "components": [
                    {
                        "id": "root",
                        "component": "Column",
                        "children": [
                            "title",
                            "summary-card",
                            "intake-form-card",
                            "steps-card",
                        ],
                    },
                    {
                        "id": "title",
                        "component": "Text",
                        "variant": "h2",
                        "text": "Support Assistant Workspace",
                    },
                    {
                        "id": "summary-card",
                        "component": "Card",
                        "child": "summary-column",
                    },
                    {
                        "id": "summary-column",
                        "component": "Column",
                        "children": [
                            "summary-heading",
                            "summary-text",
                            "meta-row",
                        ],
                    },
                    {
                        "id": "summary-heading",
                        "component": "Text",
                        "variant": "h3",
                        "text": "Intake Summary",
                    },
                    {
                        "id": "summary-text",
                        "component": "Text",
                        "text": {"path": "/summary"},
                    },
                    {
                        "id": "meta-row",
                        "component": "Row",
                        "children": ["issue-type", "priority", "team"],
                        "justify": "spaceBetween",
                    },
                    {
                        "id": "issue-type",
                        "component": "Text",
                        "variant": "caption",
                        "text": {"path": "/issueTypeLabel"},
                    },
                    {
                        "id": "priority",
                        "component": "Text",
                        "variant": "caption",
                        "text": {"path": "/priorityLabel"},
                    },
                    {
                        "id": "team",
                        "component": "Text",
                        "variant": "caption",
                        "text": {"path": "/teamLabel"},
                    },
                    {
                        "id": "intake-form-card",
                        "component": "Card",
                        "child": "intake-form",
                    },
                    {
                        "id": "intake-form",
                        "component": "Column",
                        "children": [
                            "form-title",
                            "ticket-title",
                            "issue-type-picker",
                            "priority-picker",
                            "callback-checkbox",
                            "schedule-input",
                            "notes-field",
                            "form-actions",
                        ],
                    },
                    {
                        "id": "form-title",
                        "component": "Text",
                        "variant": "h3",
                        "text": "Escalation Form",
                    },
                    {
                        "id": "ticket-title",
                        "component": "TextField",
                        "label": "Ticket title",
                        "value": {"path": "/form/title"},
                    },
                    {
                        "id": "issue-type-picker",
                        "component": "ChoicePicker",
                        "label": "Issue type",
                        "variant": "mutuallyExclusive",
                        "displayStyle": "chips",
                        "options": [
                            {"label": "Access", "value": "access"},
                            {"label": "Runtime", "value": "runtime"},
                            {"label": "Billing", "value": "billing"},
                            {"label": "Incident", "value": "incident"},
                        ],
                        "value": {"path": "/form/issueType"},
                    },
                    {
                        "id": "priority-picker",
                        "component": "ChoicePicker",
                        "label": "Priority",
                        "variant": "mutuallyExclusive",
                        "displayStyle": "chips",
                        "options": [
                            {"label": "Low", "value": "low"},
                            {"label": "Medium", "value": "medium"},
                            {"label": "High", "value": "high"},
                            {"label": "Critical", "value": "critical"},
                        ],
                        "value": {"path": "/form/priority"},
                    },
                    {
                        "id": "callback-checkbox",
                        "component": "CheckBox",
                        "label": "Request callback",
                        "value": {"path": "/form/requestCallback"},
                    },
                    {
                        "id": "schedule-input",
                        "component": "DateTimeInput",
                        "label": "Preferred callback",
                        "enableDate": True,
                        "enableTime": True,
                        "value": {"path": "/form/callbackAt"},
                    },
                    {
                        "id": "notes-field",
                        "component": "TextField",
                        "label": "Notes",
                        "variant": "longText",
                        "value": {"path": "/form/notes"},
                    },
                    {
                        "id": "submit-label",
                        "component": "Text",
                        "text": "Submit request",
                    },
                    {
                        "id": "refresh-label",
                        "component": "Text",
                        "text": "Refresh plan",
                    },
                    {
                        "id": "form-actions",
                        "component": "Row",
                        "children": ["submit-btn", "refresh-btn"],
                        "align": "center",
                        "justify": "start",
                    },
                    {
                        "id": "submit-btn",
                        "component": "Button",
                        "variant": "primary",
                        "child": "submit-label",
                        "action": {
                            "event": {
                                "name": "submit_support_request",
                                "context": {
                                    "title": {"path": "/form/title"},
                                    "issueType": {"path": "/form/issueType"},
                                    "priority": {"path": "/form/priority"},
                                    "requestCallback": {
                                        "path": "/form/requestCallback"
                                    },
                                    "callbackAt": {"path": "/form/callbackAt"},
                                    "notes": {"path": "/form/notes"},
                                },
                            }
                        },
                    },
                    {
                        "id": "refresh-btn",
                        "component": "Button",
                        "variant": "default",
                        "child": "refresh-label",
                        "action": {
                            "event": {
                                "name": "refresh_support_plan",
                                "context": {
                                    "issueType": {"path": "/form/issueType"},
                                    "priority": {"path": "/form/priority"},
                                },
                            }
                        },
                    },
                    {
                        "id": "steps-card",
                        "component": "Card",
                        "child": "steps-column",
                    },
                    {
                        "id": "steps-column",
                        "component": "Column",
                        "children": ["steps-title", "steps-list"],
                    },
                    {
                        "id": "steps-title",
                        "component": "Text",
                        "variant": "h3",
                        "text": "Recommended next steps",
                    },
                    {
                        "id": "steps-list",
                        "component": "List",
                        "direction": "vertical",
                        "children": {
                            "componentId": "step-template",
                            "path": "/steps",
                        },
                    },
                    {
                        "id": "step-template",
                        "component": "Row",
                        "children": ["step-index", "step-text"],
                        "align": "center",
                    },
                    {
                        "id": "step-index",
                        "component": "Text",
                        "variant": "caption",
                        "text": {"path": "index"},
                    },
                    {
                        "id": "step-text",
                        "component": "Text",
                        "text": {"path": "text"},
                    },
                ],
            },
        },
        {
            "version": "v0.9",
            "updateDataModel": {
                "surfaceId": "support-chat",
                "path": "/",
                "value": {
                    "summary": summary,
                    "issueTypeLabel": f"Type: {issue_type}",
                    "priorityLabel": f"Priority: {priority}",
                    "teamLabel": f"Team: {recommended_team}",
                    "steps": [
                        {"index": f"{i + 1}.", "text": step}
                        for i, step in enumerate(next_steps)
                    ],
                    "form": {
                        "title": user_query,
                        "issueType": [issue_type],
                        "priority": [priority],
                        "requestCallback": False,
                        "callbackAt": "",
                        "notes": "",
                    },
                },
            },
        },
    ]


def _classify(query: str) -> tuple[str, str, str, str, list[str]]:
    lowered = query.lower()

    issue_type = "runtime"
    recommended_team = "Runtime Platform"
    priority = "medium"
    steps = [
        "Confirm affected environment and region.",
        "Collect recent error logs and stack traces.",
        "Validate deployment health checks.",
    ]

    if any(token in lowered for token in ["login", "auth", "token", "permission"]):
        issue_type = "access"
        recommended_team = "Identity & Access"
        steps = [
            "Check account role assignments.",
            "Validate token expiration and scopes.",
            "Run sign-in flow in a clean browser profile.",
        ]
    elif any(token in lowered for token in ["bill", "invoice", "cost", "price"]):
        issue_type = "billing"
        recommended_team = "Billing Operations"
        steps = [
            "Verify subscription and workspace id.",
            "Capture invoice id and date window.",
            "Compare expected plan limits with usage.",
        ]
    elif any(token in lowered for token in ["outage", "down", "critical", "sev"]):
        issue_type = "incident"
        recommended_team = "Incident Response"
        priority = "critical"
        steps = [
            "Open a severity incident channel.",
            "Attach incident timeline and blast radius.",
            "Post mitigation updates every 15 minutes.",
        ]

    if any(token in lowered for token in ["urgent", "asap", "production", "p0"]):
        priority = "high"

    summary = (
        f"Detected a {priority} {issue_type} request. "
        f"Routing recommendation: {recommended_team}."
    )

    return summary, issue_type, priority, recommended_team, steps


async def run_support_assistant(
    query: str,
    base_url: str = "http://localhost:8765",
) -> dict[str, Any]:
    del base_url

    summary, issue_type, priority, recommended_team, steps = _classify(query)
    messages = _build_support_surface(
        summary=summary,
        issue_type=issue_type,
        priority=priority,
        recommended_team=recommended_team,
        next_steps=steps,
        user_query=query,
    )
    _validate_a2ui_messages(messages)

    return {
        "success": True,
        "text": (
            "I prepared a support workflow card with recommended actions. "
            "You can edit the form and submit the request directly."
        ),
        "a2ui_messages": messages,
    }


async def handle_support_action(
    action_id: str,
    context: dict[str, Any],
    base_url: str = "http://localhost:8765",
) -> dict[str, Any]:
    del base_url

    if action_id == "submit_support_request":
        title = str(context.get("title") or "Untitled request")
        issue_type = str((context.get("issueType") or ["runtime"])[0])
        priority = str((context.get("priority") or ["medium"])[0])
        callback = bool(context.get("requestCallback"))
        callback_at = str(context.get("callbackAt") or "Not scheduled")
        notes = str(context.get("notes") or "")

        lines = [
            f"Ticket '{title}' submitted.",
            f"Type={issue_type}, Priority={priority}.",
            f"Callback requested={'yes' if callback else 'no'} at {callback_at}.",
        ]
        if notes:
            lines.append("Notes captured and attached to the request.")

        summary = " ".join(lines)
        messages = _build_support_surface(
            summary=summary,
            issue_type=issue_type,
            priority=priority,
            recommended_team="Human Support Queue",
            next_steps=[
                "Support triage will review within SLA.",
                "Watch your notifications for updates.",
                "Reply in chat to add more context.",
            ],
            user_query=title,
        )
        _validate_a2ui_messages(messages)

        return {
            "success": True,
            "text": "Request submitted successfully. I refreshed the support panel.",
            "a2ui_messages": messages,
        }

    if action_id == "refresh_support_plan":
        issue_type = str((context.get("issueType") or ["runtime"])[0])
        priority = str((context.get("priority") or ["medium"])[0])
        summary = (
            "Plan refreshed using the latest selections from the intake form."
        )
        messages = _build_support_surface(
            summary=summary,
            issue_type=issue_type,
            priority=priority,
            recommended_team="Smart Routing",
            next_steps=[
                "Validate impacted services.",
                "Collect diagnostics from the runtime page.",
                "Escalate with reproduction steps if unresolved.",
            ],
            user_query="Refreshed support plan",
        )
        _validate_a2ui_messages(messages)
        return {
            "success": True,
            "text": "I refreshed the recommended plan based on the form values.",
            "a2ui_messages": messages,
        }

    return {
        "success": False,
        "error": f"Unknown action: {action_id}",
    }

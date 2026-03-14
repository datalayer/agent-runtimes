# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Notification Channel Catalog.

Predefined notification channel configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class NotificationField(BaseModel):
    """Dynamic field definition for a notification channel."""

    name: str = Field(..., description="Field key")
    label: str = Field(..., description="Display label")
    type: Literal["string", "boolean", "number"] = Field(..., description="Input type")
    required: bool = Field(default=False, description="Whether this field is required")
    placeholder: Optional[str] = Field(default=None, description="UI placeholder")
    default: str | bool | int | float | None = Field(default=None, description="Default value")


class NotificationChannelSpec(BaseModel):
    """Notification channel specification."""

    id: str = Field(..., description="Unique channel identifier")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Channel description")
    icon: str = Field(default="bell", description="Icon identifier")
    available: bool = Field(default=True, description="Whether channel is currently available")
    coming_soon: bool = Field(default=False, description="Whether channel is planned but not available yet")
    fields: List[NotificationField] = Field(default_factory=list, description="Channel configuration fields")


# ============================================================================
# Notification Channel Definitions
# ============================================================================

EMAIL_NOTIFICATION_SPEC = NotificationChannelSpec(
    id="email",
    name="Email",
    description="Send notifications via email when agent events occur. Supports completion alerts, failure reports, and summary digests.",
    icon="mail",
    available=True,
    coming_soon=False,
    fields=[
        NotificationField(**{"name": "recipients", "label": "Recipients", "type": "string", "required": True, "placeholder": "ops@company.com, team-lead@company.com"}),
        NotificationField(**{"name": "subject_template", "label": "Subject Template", "type": "string", "required": False, "placeholder": "[Agent] {{agent_name}} — {{event_type}}"}),
        NotificationField(**{"name": "include_output", "label": "Include Output", "type": "boolean", "required": False, "default": True}),
    ],
)

SLACK_NOTIFICATION_SPEC = NotificationChannelSpec(
    id="slack",
    name="Slack",
    description="Post notifications to a Slack channel or direct message when agent events occur. Supports rich message formatting with blocks.",
    icon="bell",
    available=True,
    coming_soon=False,
    fields=[
        NotificationField(**{"name": "channel", "label": "Channel", "type": "string", "required": True, "placeholder": "#sales-analytics"}),
        NotificationField(**{"name": "mention_on_failure", "label": "Mention on Failure", "type": "string", "required": False, "placeholder": "@oncall-team"}),
        NotificationField(**{"name": "include_output", "label": "Include Output", "type": "boolean", "required": False, "default": False}),
    ],
)

TEAMS_NOTIFICATION_SPEC = NotificationChannelSpec(
    id="teams",
    name="Teams",
    description="Post notifications to a Microsoft Teams channel via incoming webhook connector when agent events occur.",
    icon="bell",
    available=False,
    coming_soon=True,
    fields=[
        NotificationField(**{"name": "webhook_url", "label": "Webhook URL", "type": "string", "required": True, "placeholder": "https://outlook.office.com/webhook/..."}),
        NotificationField(**{"name": "include_output", "label": "Include Output", "type": "boolean", "required": False, "default": False}),
    ],
)

WEBHOOK_NOTIFICATION_SPEC = NotificationChannelSpec(
    id="webhook",
    name="Webhook",
    description="Send notifications to a custom HTTP endpoint via POST request. Payload includes event type, agent metadata, and optional output.",
    icon="bell",
    available=False,
    coming_soon=True,
    fields=[
        NotificationField(**{"name": "url", "label": "Webhook URL", "type": "string", "required": True, "placeholder": "https://api.example.com/agent-events"}),
        NotificationField(**{"name": "secret", "label": "Signing Secret", "type": "string", "required": False, "placeholder": "Optional HMAC secret for payload signing"}),
        NotificationField(**{"name": "include_output", "label": "Include Output", "type": "boolean", "required": False, "default": True}),
    ],
)

# ============================================================================
# Notification Channel Catalog
# ============================================================================

NOTIFICATION_CATALOG: Dict[str, NotificationChannelSpec] = {
    "email": EMAIL_NOTIFICATION_SPEC,
    "slack": SLACK_NOTIFICATION_SPEC,
    "teams": TEAMS_NOTIFICATION_SPEC,
    "webhook": WEBHOOK_NOTIFICATION_SPEC,
}


def get_notification_spec(channel_id: str) -> NotificationChannelSpec | None:
    """Get a notification channel specification by ID."""
    return NOTIFICATION_CATALOG.get(channel_id)


def list_notification_specs() -> List[NotificationChannelSpec]:
    """List all notification channel specifications."""
    return list(NOTIFICATION_CATALOG.values())

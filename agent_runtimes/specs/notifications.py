# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Notification Channel Catalog.

Predefined notification channel configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import NotificationChannelSpec, NotificationField


# ============================================================================
# Notification Channel Definitions
# ============================================================================

EMAIL_NOTIFICATION_SPEC_0_0_1 = NotificationChannelSpec(
    id="email",
    version="0.0.1",
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

SLACK_NOTIFICATION_SPEC_0_0_1 = NotificationChannelSpec(
    id="slack",
    version="0.0.1",
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

TEAMS_NOTIFICATION_SPEC_0_0_1 = NotificationChannelSpec(
    id="teams",
    version="0.0.1",
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

WEBHOOK_NOTIFICATION_SPEC_0_0_1 = NotificationChannelSpec(
    id="webhook",
    version="0.0.1",
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
    "email": EMAIL_NOTIFICATION_SPEC_0_0_1,
    "slack": SLACK_NOTIFICATION_SPEC_0_0_1,
    "teams": TEAMS_NOTIFICATION_SPEC_0_0_1,
    "webhook": WEBHOOK_NOTIFICATION_SPEC_0_0_1,
}


def get_notification_spec(channel_id: str) -> NotificationChannelSpec | None:
    """Get a notification channel specification by ID (accepts both bare and versioned refs)."""
    spec = NOTIFICATION_CATALOG.get(channel_id)
    if spec is not None:
        return spec
    base, _, ver = channel_id.rpartition(':')
    if base and '.' in ver:
        return NOTIFICATION_CATALOG.get(base)
    return None


def list_notification_specs() -> List[NotificationChannelSpec]:
    """List all notification channel specifications."""
    return list(NOTIFICATION_CATALOG.values())

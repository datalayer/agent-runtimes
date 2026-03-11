# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Trigger Catalog.

Predefined trigger type configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Any, Dict, List, Literal, Optional
from dataclasses import dataclass, field


@dataclass
class TriggerField:
    """Dynamic field definition for a trigger type."""

    name: str
    label: str
    type: Literal["string", "boolean", "number"]
    required: bool
    placeholder: Optional[str] = None
    help: Optional[str] = None
    font: Optional[str] = None


@dataclass
class TriggerSpec:
    """Trigger type specification."""

    id: str
    name: str
    description: str
    type: Literal["once", "schedule", "event"]
    fields: List[TriggerField] = field(default_factory=list)


# ============================================================================
# Trigger Definitions
# ============================================================================

EVENT_TRIGGER_SPEC = TriggerSpec(
    id="event",
    name="Event-Based",
    description="Trigger on specific events such as a webhook call, API request, database change, file upload, or email arrival.",
    type="event",
    fields=[
        TriggerField(**{"name": "event_source", "label": "Event Source URL", "type": "string", "required": False, "placeholder": "https://helpdesk.example.com/webhooks", "help": "Allowed event source URL (leave empty to allow any source)"}),
        TriggerField(**{"name": "event", "label": "Event Name", "type": "string", "required": False, "placeholder": "email_received"}),
        TriggerField(**{"name": "description", "label": "Description", "type": "string", "required": False, "placeholder": "Description (e.g. 'Triggered on incoming email')"}),
    ],
)

ONCE_TRIGGER_SPEC = TriggerSpec(
    id="once",
    name="Run Once",
    description="Execute agent immediately after deployment.",
    type="once",
)

SCHEDULE_TRIGGER_SPEC = TriggerSpec(
    id="schedule",
    name="Schedule",
    description="Run on a recurring schedule using a cron expression (e.g. daily at 9 AM, every Monday, monthly on the 1st).",
    type="schedule",
    fields=[
        TriggerField(**{"name": "cron", "label": "Cron Expression", "type": "string", "required": True, "placeholder": "0 9 * * * (every day at 9 AM)", "font": "mono"}),
        TriggerField(**{"name": "description", "label": "Description", "type": "string", "required": False, "placeholder": "Description (e.g. 'Monthly sales report')"}),
    ],
)

# ============================================================================
# Trigger Catalog
# ============================================================================

TRIGGER_CATALOG: Dict[str, TriggerSpec] = {
    "event": EVENT_TRIGGER_SPEC,
    "once": ONCE_TRIGGER_SPEC,
    "schedule": SCHEDULE_TRIGGER_SPEC,
}


def get_trigger_spec(trigger_id: str) -> TriggerSpec | None:
    """Get a trigger specification by ID."""
    return TRIGGER_CATALOG.get(trigger_id)


def list_trigger_specs() -> List[TriggerSpec]:
    """List all trigger specifications."""
    return list(TRIGGER_CATALOG.values())

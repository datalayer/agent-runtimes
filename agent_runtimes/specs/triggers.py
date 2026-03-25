# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Trigger Catalog.

Predefined trigger type configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class TriggerField(BaseModel):
    """Dynamic field definition for a trigger type."""

    name: str = Field(..., description="Field key")
    label: str = Field(..., description="Display label")
    type: Literal["string", "boolean", "number"] = Field(..., description="Input type")
    required: bool = Field(default=False, description="Whether field is required")
    placeholder: Optional[str] = Field(default=None, description="UI placeholder")
    help: Optional[str] = Field(default=None, description="Help text")
    font: Optional[str] = Field(default=None, description="Suggested font style")


class TriggerSpec(BaseModel):
    """Trigger type specification."""

    id: str = Field(..., description="Unique trigger identifier")
    version: str = Field(default="0.0.1", description="Trigger version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Trigger description")
    type: Literal["once", "schedule", "event"] = Field(..., description="Trigger execution mode")
    fields: List[TriggerField] = Field(default_factory=list, description="Trigger configuration fields")


# ============================================================================
# Trigger Definitions
# ============================================================================

EVENT_TRIGGER_SPEC_0_0_1 = TriggerSpec(
    id="event",
    version="0.0.1",
    name="Event-Based",
    description="Trigger on specific events such as a webhook call, API request, database change, file upload, or email arrival.",
    type="event",
    fields=[
        TriggerField(**{"name": "event_source", "label": "Event Source URL", "type": "string", "required": False, "placeholder": "https://helpdesk.example.com/webhooks", "help": "Allowed event source URL (leave empty to allow any source)"}),
        TriggerField(**{"name": "event", "label": "Event Name", "type": "string", "required": False, "placeholder": "email_received"}),
        TriggerField(**{"name": "description", "label": "Description", "type": "string", "required": False, "placeholder": "Description (e.g. 'Triggered on incoming email')"}),
        TriggerField(**{"name": "prompt", "label": "Trigger Prompt", "type": "string", "required": False, "placeholder": "Handle the incoming event and execute the workflow end-to-end."}),
    ],
)

ONCE_TRIGGER_SPEC_0_0_1 = TriggerSpec(
    id="once",
    version="0.0.1",
    name="Run Once",
    description="Execute agent immediately after deployment.",
    type="once",
    fields=[
        TriggerField(**{"name": "prompt", "label": "Trigger Prompt", "type": "string", "required": False, "placeholder": "Start when requested by a user and complete the workflow once."}),
    ],
)

SCHEDULE_TRIGGER_SPEC_0_0_1 = TriggerSpec(
    id="schedule",
    version="0.0.1",
    name="Schedule",
    description="Run on a recurring schedule using a cron expression (e.g. daily at 9 AM, every Monday, monthly on the 1st).",
    type="schedule",
    fields=[
        TriggerField(**{"name": "cron", "label": "Cron Expression", "type": "string", "required": True, "placeholder": "0 9 * * * (every day at 9 AM)", "font": "mono"}),
        TriggerField(**{"name": "description", "label": "Description", "type": "string", "required": False, "placeholder": "Description (e.g. 'Monthly sales report')"}),
        TriggerField(**{"name": "prompt", "label": "Trigger Prompt", "type": "string", "required": False, "placeholder": "Run the scheduled workflow and produce the configured deliverable."}),
    ],
)

# ============================================================================
# Trigger Catalog
# ============================================================================

TRIGGER_CATALOG: Dict[str, TriggerSpec] = {
    "event": EVENT_TRIGGER_SPEC_0_0_1,
    "once": ONCE_TRIGGER_SPEC_0_0_1,
    "schedule": SCHEDULE_TRIGGER_SPEC_0_0_1,
}


def get_trigger_spec(trigger_id: str) -> TriggerSpec | None:
    """Get a trigger specification by ID (accepts both bare and versioned refs)."""
    spec = TRIGGER_CATALOG.get(trigger_id)
    if spec is not None:
        return spec
    base, _, ver = trigger_id.rpartition(':')
    if base and '.' in ver:
        return TRIGGER_CATALOG.get(base)
    return None


def list_trigger_specs() -> List[TriggerSpec]:
    """List all trigger specifications."""
    return list(TRIGGER_CATALOG.values())

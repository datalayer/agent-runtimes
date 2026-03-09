# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Webhook-based trigger support for durable agents.

Exposes HTTP endpoints that external systems (helpdesk, CI/CD, monitoring)
can POST to in order to trigger an agent run. Source validation ensures
only authorized origins can invoke the agent.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

webhook_router = APIRouter(prefix="/agents", tags=["triggers"])


# --- Config ---


@dataclass
class WebhookTriggerConfig:
    """Configuration for a webhook-based trigger.

    Attributes:
        agent_id: The agent to trigger.
        event_source: Allowed origin URL or hostname for source validation.
        description: Human-readable description of the event.
        enabled: Whether the trigger is active.
        allowed_ips: Additional allowed IPs (optional).
        secret: Shared secret for HMAC validation (optional, future).
        metadata: Additional metadata.
    """

    agent_id: str
    event_source: str = ""
    description: str = "External event"
    enabled: bool = True
    allowed_ips: list[str] = field(default_factory=list)
    secret: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class WebhookTriggerResult:
    """Result of a webhook trigger execution."""

    agent_id: str
    triggered_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    success: bool = False
    workflow_id: str | None = None
    output: str | None = None
    error: str | None = None


class WebhookTrigger:
    """Manages a webhook trigger configuration for an agent.

    The actual HTTP handling is done by the FastAPI router endpoints.
    This class provides configuration storage and validation logic.
    """

    def __init__(self, config: WebhookTriggerConfig) -> None:
        self.config = config

    def validate_source(self, origin: str) -> bool:
        """Validate that the incoming request is from an allowed source.

        Checks:
        1. If event_source is empty, allow all (no restriction).
        2. If origin matches event_source hostname, allow.
        3. If origin is in allowed_ips, allow.

        Args:
            origin: The origin header or client IP of the request.

        Returns:
            True if the source is authorized.
        """
        if not self.config.event_source:
            return True

        # Check against event_source hostname
        try:
            expected_host = urlparse(self.config.event_source).hostname
            if expected_host and expected_host in origin:
                return True
        except Exception:
            pass

        # Direct match
        if origin == self.config.event_source:
            return True

        # Check allowed IPs
        if origin in self.config.allowed_ips:
            return True

        return False


# --- Registry ---

_webhook_triggers: dict[str, WebhookTrigger] = {}


def register_webhook_trigger(config: WebhookTriggerConfig) -> WebhookTrigger:
    """Register a webhook trigger for an agent."""
    trigger = WebhookTrigger(config)
    _webhook_triggers[config.agent_id] = trigger
    logger.info(
        f"Registered webhook trigger for agent {config.agent_id} "
        f"(source: {config.event_source or 'any'})"
    )
    return trigger


def unregister_webhook_trigger(agent_id: str) -> bool:
    """Unregister a webhook trigger."""
    removed = _webhook_triggers.pop(agent_id, None)
    if removed:
        logger.info(f"Unregistered webhook trigger for agent {agent_id}")
        return True
    return False


def get_webhook_trigger(agent_id: str) -> WebhookTrigger | None:
    """Get the webhook trigger config for an agent."""
    return _webhook_triggers.get(agent_id)


# --- API Models ---


class WebhookResponse(BaseModel):
    """Response from a webhook trigger invocation."""

    status: str = "triggered"
    agent_id: str
    workflow_id: str | None = None
    message: str | None = None


class WebhookInfo(BaseModel):
    """Information about a webhook endpoint for external registration."""

    webhook_url: str
    agent_id: str
    methods: list[str] = ["POST"]
    content_type: str = "application/json"
    event_source: str | None = None
    description: str | None = None


# --- Routes ---


@webhook_router.post("/{agent_id}/webhook", response_model=WebhookResponse)
async def webhook_trigger(agent_id: str, request: Request) -> WebhookResponse:
    """Receive external events and trigger an agent run.

    Event sources POST to this endpoint with a JSON payload.
    The agent's trigger config defines which event_source URLs are allowed.

    Returns:
        WebhookResponse with trigger status and optional workflow ID.
    """
    # Check if agent has a webhook trigger registered
    trigger = _webhook_triggers.get(agent_id)

    if trigger is None:
        raise HTTPException(
            status_code=404,
            detail=f"No webhook trigger registered for agent '{agent_id}'",
        )

    if not trigger.config.enabled:
        raise HTTPException(
            status_code=403,
            detail=f"Webhook trigger for agent '{agent_id}' is disabled",
        )

    # Validate event source
    origin = request.headers.get(
        "X-Webhook-Source",
        request.headers.get("Origin", request.client.host if request.client else ""),
    )
    if not trigger.validate_source(origin):
        logger.warning(
            f"Unauthorized webhook source '{origin}' for agent {agent_id}"
        )
        raise HTTPException(
            status_code=403,
            detail="Unauthorized event source",
        )

    # Parse the payload
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    # Format event as agent input message
    description = trigger.config.description or "external event"
    event_message = f"Event received: {description}\n"
    event_message += f"Payload: {json.dumps(payload, indent=2)}"

    # Execute the agent
    try:
        result = await _execute_agent_webhook(agent_id, event_message)
        return WebhookResponse(
            status="triggered",
            agent_id=agent_id,
            workflow_id=result.get("workflow_id"),
            message="Agent triggered successfully",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Webhook trigger failed for agent {agent_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger agent: {str(e)}",
        )


@webhook_router.get("/{agent_id}/webhook", response_model=WebhookInfo)
async def webhook_info(agent_id: str) -> WebhookInfo:
    """Return webhook URL and configuration for external systems to register.

    This endpoint provides the information needed by external systems
    to configure their webhook callbacks.
    """
    trigger = _webhook_triggers.get(agent_id)

    return WebhookInfo(
        webhook_url=f"/api/v1/agents/{agent_id}/webhook",
        agent_id=agent_id,
        event_source=trigger.config.event_source if trigger else None,
        description=trigger.config.description if trigger else None,
    )


# --- Agent execution helper ---


async def _execute_agent_webhook(
    agent_id: str, message: str
) -> dict[str, Any]:
    """Execute an agent via webhook, wrapping in DBOS workflow if available.

    Returns:
        Dict with at least 'output' key, and optionally 'workflow_id'.
    """
    # Import here to avoid circular imports
    from ..routes.acp import _agents

    agent_entry = _agents.get(agent_id)
    if agent_entry is None:
        raise ValueError(f"Agent '{agent_id}' not found in registry")

    adapter, _info = agent_entry

    # Try to run as DBOS workflow for durability
    try:
        from dbos import DBOS

        @DBOS.workflow()
        async def webhook_workflow(msg: str) -> dict[str, Any]:
            result = await adapter.run(msg)
            return {
                "output": str(result) if result else None,
                "workflow_id": DBOS.workflow_id,
            }

        return await webhook_workflow(message)
    except ImportError:
        # No DBOS — run directly
        result = await adapter.run(message)
        return {"output": str(result) if result else None}

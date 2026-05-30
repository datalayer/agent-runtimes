# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local Agent Node configuration endpoints."""

from __future__ import annotations

import os
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/agent-node", tags=["agent-node"])

AgentNodeMode = Literal["run", "host", "sleep"]


class AgentNodeConfiguration(BaseModel):
    mode: AgentNodeMode = "sleep"
    billable_account_uid: str | None = None
    billable_account_type: str | None = None
    billable_account_handle: str | None = None
    sharing: dict[str, Any] = Field(default_factory=dict)


_DEFAULT_CONFIGURATION = AgentNodeConfiguration(
    mode=(os.environ.get("AGENT_NODE_MODE") or "sleep").strip().lower() or "sleep"
)
_CURRENT_CONFIGURATION = _DEFAULT_CONFIGURATION


def get_agent_node_configuration() -> AgentNodeConfiguration:
    return _CURRENT_CONFIGURATION


def set_agent_node_configuration(configuration: AgentNodeConfiguration) -> AgentNodeConfiguration:
    global _CURRENT_CONFIGURATION
    _CURRENT_CONFIGURATION = configuration
    return _CURRENT_CONFIGURATION


@router.get("/configuration")
def get_configuration_endpoint() -> dict[str, Any]:
    return {
        "success": True,
        "message": "Agent node configuration loaded",
        "configuration": get_agent_node_configuration().model_dump(),
    }


@router.post("/configuration")
def set_configuration_endpoint(body: AgentNodeConfiguration) -> dict[str, Any]:
    updated = set_agent_node_configuration(body)
    return {
        "success": True,
        "message": "Agent node configuration updated",
        "configuration": updated.model_dump(),
    }

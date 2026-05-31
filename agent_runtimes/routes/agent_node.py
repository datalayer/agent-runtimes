# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local Agent Node configuration endpoints."""

from __future__ import annotations

import os
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/agent-node", tags=["agent-node"])

AgentNodeModeInput = Literal["private", "shared", "sleep", "run", "host"]
AgentNodeMode = Literal["private", "shared", "sleep"]


class AgentNodeConfiguration(BaseModel):
    mode: AgentNodeModeInput = "sleep"
    billable_account_uid: str | None = None
    billable_account_type: str | None = None
    billable_account_handle: str | None = None
    sharing: dict[str, Any] = Field(default_factory=dict)


def _normalize_mode(mode: AgentNodeModeInput) -> AgentNodeMode:
    if mode == "run":
        return "private"
    if mode == "host":
        return "shared"
    return mode


def _normalize_configuration(configuration: AgentNodeConfiguration) -> AgentNodeConfiguration:
    return AgentNodeConfiguration(
        mode=_normalize_mode(configuration.mode),
        billable_account_uid=configuration.billable_account_uid,
        billable_account_type=configuration.billable_account_type,
        billable_account_handle=configuration.billable_account_handle,
        sharing=configuration.sharing,
    )


_DEFAULT_CONFIGURATION = _normalize_configuration(
    AgentNodeConfiguration(
        mode=(os.environ.get("AGENT_NODE_MODE") or "sleep").strip().lower() or "sleep"
    )
)
_CURRENT_CONFIGURATION = _DEFAULT_CONFIGURATION


def get_agent_node_configuration() -> AgentNodeConfiguration:
    return _CURRENT_CONFIGURATION


def set_agent_node_configuration(configuration: AgentNodeConfiguration) -> AgentNodeConfiguration:
    global _CURRENT_CONFIGURATION
    _CURRENT_CONFIGURATION = _normalize_configuration(configuration)
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

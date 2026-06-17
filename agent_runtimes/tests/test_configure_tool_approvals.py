# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for tool-approvals runtime configuration endpoints."""

import pytest

from agent_runtimes.routes.configure import (
    ToolApprovalsRequest,
    get_tool_approvals,
    set_tool_approvals,
    set_tool_approvals_disabled,
)


@pytest.mark.asyncio
async def test_get_tool_approvals_reports_state() -> None:
    set_tool_approvals_disabled(False)
    payload = await get_tool_approvals()
    assert payload["disabled"] is False

    set_tool_approvals_disabled(True)
    payload = await get_tool_approvals()
    assert payload["disabled"] is True


@pytest.mark.asyncio
async def test_set_tool_approvals_updates_state() -> None:
    response = await set_tool_approvals(ToolApprovalsRequest(disabled=True))
    assert response["success"] is True
    assert response["disabled"] is True

    response = await set_tool_approvals(ToolApprovalsRequest(disabled=False))
    assert response["success"] is True
    assert response["disabled"] is False

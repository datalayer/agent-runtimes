# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``loop tool-approvals``: list, approve and reject against ai-agents (mocked)."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from typer.testing import CliRunner

from agent_runtimes.commands import tool_approvals as command
from agent_runtimes.commands.tool_approvals import ApprovalsClient, ApprovalsError

PENDING = [
    {
        "id": "01M6Y0SQ973NCAYB7QWRWDQMAQ",
        "status": "pending",
        "tool_name": "tavily_search",
        "agent_id": "default",
        "runtime_name": "01m6y0drdskpa1am2vq83qne3w",
        "tool_args": {"query": "Datalayer"},
        "created_at": "2026-11-08T16:45:22Z",
    },
    {
        "id": "01M6Y1AAAAAAAAAAAAAAAAAAAA",
        "status": "pending",
        "tool_name": "write_file",
        "agent_id": "default",
        "created_at": "2026-11-08T16:46:00Z",
    },
]


class FakeAiAgents:
    """ai-agents' approvals routes, as they answer (one person's approvals)."""

    def __init__(self) -> None:
        self.records = {r["id"]: dict(r) for r in PENDING}
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert request.headers["Authorization"] == "Bearer TOKEN"
        path = request.url.path.removeprefix("/api/ai-agents/v1/tool-approvals")
        if request.method == "GET" and path == "":
            status = request.url.params.get("status")
            tool = request.url.params.get("tool_name")
            rows = [
                r
                for r in self.records.values()
                if (status is None or r["status"] == status)
                and (tool is None or r["tool_name"] == tool)
            ]
            return httpx.Response(
                200, json={"success": True, "total": len(rows), "approvals": rows}
            )
        if request.method == "POST":
            approval_id, verb = path.strip("/").split("/")
            record = self.records.get(approval_id)
            if record is None:
                return httpx.Response(404, json={"detail": "Tool approval not found"})
            if record["status"] != "pending":
                return httpx.Response(
                    409, json={"detail": f"Approval is already '{record['status']}'"}
                )
            record["status"] = "approved" if verb == "approve" else "rejected"
            record["note"] = json.loads(request.content or b"{}").get("note")
            return httpx.Response(200, json={"success": True, "approval": record})
        return httpx.Response(405)


@pytest.fixture
def ai_agents(monkeypatch: pytest.MonkeyPatch) -> FakeAiAgents:
    fake = FakeAiAgents()

    def client(api_key: Any, ai_agents_url: Any) -> ApprovalsClient:
        return ApprovalsClient(
            "https://ai-agents.test", "TOKEN", transport=httpx.MockTransport(fake)
        )

    monkeypatch.setattr(command, "_client", client)
    return fake


runner = CliRunner()


def test_list_shows_the_pending_approvals(ai_agents: FakeAiAgents) -> None:
    result = runner.invoke(command.app, ["list", "--json"])

    assert result.exit_code == 0, result.output
    assert [r["id"] for r in json.loads(result.output)] == [r["id"] for r in PENDING]
    assert ai_agents.requests[0].url.params["status"] == "pending"


def test_list_all_asks_for_every_status(ai_agents: FakeAiAgents) -> None:
    runner.invoke(command.app, ["list", "--status", "all", "--tool", "tavily_search"])

    params = ai_agents.requests[0].url.params
    assert "status" not in params
    assert params["tool_name"] == "tavily_search"


def test_approve_by_the_start_of_an_id(ai_agents: FakeAiAgents) -> None:
    result = runner.invoke(command.app, ["approve", "01M6Y0SQ", "--note", "drill"])

    assert result.exit_code == 0, result.output
    assert "Approved tavily_search" in result.output
    record = ai_agents.records["01M6Y0SQ973NCAYB7QWRWDQMAQ"]
    assert record["status"] == "approved"
    assert record["note"] == "drill"


def test_reject(ai_agents: FakeAiAgents) -> None:
    result = runner.invoke(command.app, ["reject", "01M6Y1AAAAAAAAAAAAAAAAAAAA"])

    assert result.exit_code == 0, result.output
    assert ai_agents.records["01M6Y1AAAAAAAAAAAAAAAAAAAA"]["status"] == "rejected"


def test_a_prefix_of_several_is_refused(ai_agents: FakeAiAgents) -> None:
    result = runner.invoke(command.app, ["approve", "01M6Y"])

    assert result.exit_code == 1
    assert "starts 2 pending approvals" in result.output
    assert all(r["status"] == "pending" for r in ai_agents.records.values())


def test_a_decided_approval_says_so(ai_agents: FakeAiAgents) -> None:
    ai_agents.records["01M6Y0SQ973NCAYB7QWRWDQMAQ"]["status"] = "approved"

    result = runner.invoke(command.app, ["reject", "01M6Y0SQ973NCAYB7QWRWDQMAQ"])

    assert result.exit_code == 1
    assert "already 'approved'" in result.output


def test_no_token_is_refused() -> None:
    with pytest.raises(ApprovalsError, match="Not signed in"):
        ApprovalsClient("https://ai-agents.test", "")

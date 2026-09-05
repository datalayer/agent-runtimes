# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
An agent reaches an MCP source of Contents through a session, never a server.

What these check, against a fake Contents API rather than a fake MCP server
— there is no MCP server on this side, which is the point:

- a selection of origin ``contents`` names a session, and nothing else;
- the toolset offers exactly the session's ``allowed_tools``, with the schemas
  the source reports, and refuses any other tool before Contents is asked;
- a call goes over with the caller's token and comes back as content plus
  artifact handles, never bytes;
- ``pending-approval`` raises the runtime's own approval flow, and the
  decision — either way — is relayed to Contents;
- the proxy authorizes per caller: no token is 401, somebody else's token is
  403, a tool outside the allowlist is 403, and only then is a call forwarded.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from agent_runtimes.mcp.contents_toolset import (
    ContentsMcpError,
    ContentsMcpToolset,
    register_contents_toolset,
    set_contents_mcp_client,
    unregister_contents_toolset,
)
from agent_runtimes.routes.agents import McpServerSelection
from agent_runtimes.routes.mcp_proxy import router as mcp_proxy_router

SESSION = "01SESSION0000000000000000"
SOURCE = "01SOURCE00000000000000000"
TOKEN = "user-token"
ALLOWED = ["search_earth_datasets", "download_earth_data_granules"]


class FakeContents:
    """The Contents MCP endpoints, remembering what was asked and by whom."""

    def __init__(self) -> None:
        self.sessions: dict[str, dict[str, Any]] = {
            SESSION: {
                "uid": SESSION,
                "source_uid": SOURCE,
                "allowed_tools": list(ALLOWED),
                "status": "active",
            }
        }
        self.owner_token: dict[str, str] = {SESSION: TOKEN}
        self.calls: list[tuple[str, str, dict[str, Any], str, str | None]] = []
        self.records: dict[str, dict[str, Any]] = {}
        self.decisions: list[tuple[str, str, str | None]] = []
        self.polls: list[str] = []
        self.pending = False

    async def get_session(self, session_uid: str, *, token: str) -> dict[str, Any]:
        if self.owner_token.get(session_uid) != token:
            raise ContentsMcpError(f"Contents answered 403 to GET /mcp-sessions/{session_uid}")
        return dict(self.sessions[session_uid])

    async def create_session(self, source_uid: str, *, token: str, **kwargs: Any) -> dict[str, Any]:
        return {"uid": "01NEWSESSION", "source_uid": source_uid, "allowed_tools": ALLOWED}

    async def discover_tools(self, source_uid: str, *, token: str) -> dict[str, Any]:
        assert source_uid == SOURCE
        return {
            "tools": [
                {
                    "name": "search_earth_datasets",
                    "description": "Search datasets",
                    "input_schema": {
                        "type": "object",
                        "properties": {"search_keywords": {"type": "string"}},
                        "required": ["search_keywords"],
                    },
                },
                {
                    "name": "download_earth_data_granules",
                    "description": "Acquire granules",
                    "input_schema": {"type": "object", "properties": {"short_name": {"type": "string"}}},
                },
                {
                    "name": "delete_everything",
                    "description": "Offered by the server, not by the session",
                    "input_schema": {"type": "object", "properties": {}},
                },
            ],
            "resources": [],
        }

    async def call_tool(
        self,
        session_uid: str,
        tool: str,
        arguments: dict[str, Any],
        *,
        token: str,
        destination_uri: str | None = None,
    ) -> dict[str, Any]:
        self.calls.append((session_uid, tool, dict(arguments), token, destination_uri))
        uid = f"call-{len(self.calls)}"
        record: dict[str, Any] = {"uid": uid, "session_uid": session_uid, "tool": tool}
        if self.pending:
            record.update({"status": "pending-approval", "approval_uid": "appr-1"})
        else:
            record.update({"status": "succeeded", "result": self._result()})
        self.records[uid] = record
        return dict(record)

    @staticmethod
    def _result() -> dict[str, Any]:
        return {
            "content": [{"type": "text", "text": "2 granules selected"}],
            "artifacts": [
                {"name": "a.nc", "size": 1024, "transfer_uid": "01TRANSFER", "url": None},
                {"name": "b.nc", "object_uid": "01OBJECT"},
            ],
        }

    async def get_call(self, session_uid: str, call_uid: str, *, token: str) -> dict[str, Any]:
        self.polls.append(call_uid)
        record = self.records[call_uid]
        # Approved calls run for one poll, then finish.
        if record["status"] == "approved":
            record["status"] = "running"
        elif record["status"] == "running":
            record.update({"status": "succeeded", "result": self._result()})
        return dict(record)

    async def decide_approval(
        self, approval_uid: str, decision: str, *, token: str, note: str | None = None
    ) -> dict[str, Any]:
        self.decisions.append((approval_uid, decision, note))
        for record in self.records.values():
            if record.get("approval_uid") == approval_uid:
                record["status"] = "approved" if decision == "approve" else "denied"
                if decision == "reject":
                    record["error"] = note
        return {"uid": approval_uid, "status": "approved" if decision == "approve" else "rejected"}


class FakeApprovals:
    """The runtime's approval manager, deciding as told."""

    def __init__(self, decision: str = "approve") -> None:
        self.decision = decision
        self.requests: list[tuple[str, dict[str, Any], str | None]] = []

    async def request_and_wait(
        self, tool_name: str, tool_args: dict[str, Any], tool_call_id: str | None = None
    ) -> dict[str, Any]:
        self.requests.append((tool_name, dict(tool_args), tool_call_id))
        if self.decision == "reject":
            raise RuntimeError("rejected by the reviewer")
        return {"approved": True, "note": "looks fine"}


async def _no_sleep(seconds: float) -> None:
    return None


def _toolset(contents: FakeContents, approvals: Any = None) -> ContentsMcpToolset:
    toolset = ContentsMcpToolset(
        session_uid=SESSION,
        client=contents,
        static_token=TOKEN,
        approval_manager=approvals or FakeApprovals(),
        poll_interval=0.0,
    )
    toolset._sleep = _no_sleep
    return toolset


# -- the selection ----------------------------------------------------------


def test_a_contents_selection_names_a_session_and_nothing_else() -> None:
    selection = McpServerSelection(id=SOURCE, origin="contents", session_uid=SESSION)
    assert selection.is_contents
    assert selection.session_uid == SESSION

    with pytest.raises(ValidationError, match="needs a session_uid"):
        McpServerSelection(id=SOURCE, origin="contents")
    with pytest.raises(ValidationError, match="only meaningful"):
        McpServerSelection(id="github", origin="catalog", session_uid=SESSION)
    # The other origins are untouched.
    assert McpServerSelection(id="github", origin="catalog").session_uid is None


# -- the toolset --------------------------------------------------------------


@pytest.mark.asyncio
async def test_the_toolset_offers_exactly_the_sessions_allowed_tools() -> None:
    contents = FakeContents()
    toolset = _toolset(contents)

    tools = await toolset.get_tools(None)  # type: ignore[arg-type]

    assert set(tools) == set(ALLOWED)
    definition = tools["search_earth_datasets"].tool_def
    assert definition.description == "Search datasets"
    assert definition.parameters_json_schema["required"] == ["search_keywords"]
    assert definition.metadata == {"contents_session_uid": SESSION, "source_uid": SOURCE}


@pytest.mark.asyncio
async def test_a_call_goes_over_with_the_callers_token_and_comes_back_as_handles() -> None:
    contents = FakeContents()
    toolset = _toolset(contents)

    result = await toolset.direct_call_tool(
        "download_earth_data_granules",
        {"short_name": "MUR", "mode": "manifest"},
        destination_uri="home-folder:///earthdata",
    )

    assert contents.calls == [
        (SESSION, "download_earth_data_granules", {"short_name": "MUR", "mode": "manifest"}, TOKEN, "home-folder:///earthdata")
    ]
    # Text becomes text; artifacts are handles, and nothing in them is bytes.
    assert result == {
        "content": "2 granules selected",
        "artifacts": [
            {"name": "a.nc", "size": 1024, "transfer_uid": "01TRANSFER"},
            {"name": "b.nc", "object_uid": "01OBJECT"},
        ],
    }


@pytest.mark.asyncio
async def test_a_tool_outside_the_allowlist_is_refused_before_contents_is_asked() -> None:
    contents = FakeContents()
    toolset = _toolset(contents)

    with pytest.raises(ContentsMcpError, match="not allowed"):
        await toolset.direct_call_tool("delete_everything", {})

    assert contents.calls == []


@pytest.mark.asyncio
async def test_pending_approval_raises_the_runtime_flow_and_relays_the_approval() -> None:
    contents = FakeContents()
    contents.pending = True
    approvals = FakeApprovals("approve")
    toolset = _toolset(contents, approvals)

    result = await toolset.direct_call_tool(
        "download_earth_data_granules", {"short_name": "MUR"}, tool_call_id="tc-1"
    )

    # The reviewer saw the tool, its arguments and the Contents approval uid.
    assert approvals.requests == [
        ("download_earth_data_granules", {"short_name": "MUR", "contents_approval_uid": "appr-1"}, "tc-1")
    ]
    # The decision reached Contents, the call was polled to its end.
    assert contents.decisions == [("appr-1", "approve", "looks fine")]
    assert contents.records["call-1"]["status"] == "succeeded"
    assert result["content"] == "2 granules selected"


@pytest.mark.asyncio
async def test_a_rejection_is_relayed_to_contents_and_raised_to_the_model() -> None:
    contents = FakeContents()
    contents.pending = True
    toolset = _toolset(contents, FakeApprovals("reject"))

    with pytest.raises(RuntimeError, match="rejected by the reviewer"):
        await toolset.direct_call_tool("download_earth_data_granules", {"short_name": "MUR"})

    assert contents.decisions == [("appr-1", "reject", "rejected by the reviewer")]
    assert contents.records["call-1"]["status"] == "denied"


@pytest.mark.asyncio
async def test_a_call_that_ends_denied_or_failed_is_an_error_not_a_result() -> None:
    contents = FakeContents()
    toolset = _toolset(contents)

    async def failing(session_uid: str, tool: str, arguments: dict[str, Any], *, token: str, destination_uri: str | None = None) -> dict[str, Any]:
        return {"uid": "call-x", "session_uid": session_uid, "tool": tool, "status": "failed", "error": "server went away"}

    contents.call_tool = failing  # type: ignore[method-assign]

    with pytest.raises(ContentsMcpError, match="ended failed: server went away"):
        await toolset.direct_call_tool("search_earth_datasets", {"search_keywords": "sst"})


# -- the proxy ----------------------------------------------------------------


@pytest.fixture
def proxy() -> Any:
    contents = FakeContents()
    set_contents_mcp_client(contents)
    register_contents_toolset(_toolset(contents))
    app = FastAPI()
    app.include_router(mcp_proxy_router, prefix="/api/v1")
    try:
        yield TestClient(app), contents
    finally:
        unregister_contents_toolset(SESSION)
        set_contents_mcp_client(None)


def test_the_proxy_wants_the_callers_token(proxy: Any) -> None:
    client, contents = proxy

    response = client.post(
        f"/api/v1/mcp/proxy/contents/{SESSION}/tools/search_earth_datasets",
        json={"arguments": {"search_keywords": "sst"}},
    )

    assert response.status_code == 401
    assert contents.calls == []


def test_the_proxy_refuses_somebody_elses_session(proxy: Any) -> None:
    client, contents = proxy

    response = client.post(
        f"/api/v1/mcp/proxy/contents/{SESSION}/tools/search_earth_datasets",
        json={"arguments": {"search_keywords": "sst"}},
        headers={"Authorization": "Bearer not-the-owner"},
    )

    assert response.status_code == 403
    assert "not available to the caller" in response.json()["detail"]
    assert contents.calls == []


def test_the_proxy_refuses_a_tool_outside_the_session_allowlist(proxy: Any) -> None:
    client, contents = proxy

    response = client.post(
        f"/api/v1/mcp/proxy/contents/{SESSION}/tools/delete_everything",
        json={"arguments": {}},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    assert response.status_code == 403
    assert "not allowed" in response.json()["detail"]
    assert contents.calls == []


def test_the_proxy_forwards_an_allowed_call_with_the_callers_token(proxy: Any) -> None:
    client, contents = proxy

    response = client.post(
        f"/api/v1/mcp/proxy/contents/{SESSION}/tools/download_earth_data_granules",
        json={"arguments": {"short_name": "MUR"}, "destination_uri": "home-folder:///earthdata"},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True
    assert body["result"]["content"] == "2 granules selected"
    assert body["result"]["artifacts"][0]["transfer_uid"] == "01TRANSFER"
    assert contents.calls == [
        (SESSION, "download_earth_data_granules", {"short_name": "MUR"}, TOKEN, "home-folder:///earthdata")
    ]


def test_the_proxy_refuses_a_revoked_session(proxy: Any) -> None:
    client, contents = proxy
    contents.sessions[SESSION]["status"] = "revoked"

    response = client.post(
        f"/api/v1/mcp/proxy/contents/{SESSION}/tools/search_earth_datasets",
        json={"arguments": {"search_keywords": "sst"}},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    assert response.status_code == 403
    assert "revoked" in response.json()["detail"]

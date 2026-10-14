# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an agent that serves a deployment holds is nobody's to read or decide on its runtime.

PAP_DATALAYER's release gates, found on r1 (14 October 2026): a shipped
application kept always on serves every visitor from one agent, whose message
history in memory is the last run's — whoever ran it. A second account, and a
caller with no token at all, read the first person's turns from the runtime's
history route and its monitoring stream, were shown their pending approval
with its arguments, and approved it there: the first person's tool call ran.

Each person's conversation is their session's (`/apps/sessions`), their
approvals ai-agents'; the runtime's agent-wide reads hand a deployment's agent
to nobody. A Preview's agent (an application, no deployment) is unchanged.

Launch the tests:

```
$ pytest agent_runtimes/tests/test_apps_deployment_conversation_private.py -v
```
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterator

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic_ai.messages import (
    ModelMessagesTypeAdapter,
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)

from agent_runtimes.context.usage import get_usage_tracker
from agent_runtimes.models.models import remember_app_instance
from agent_runtimes.routes.history import router as history_router
from agent_runtimes.routes.tool_approvals import (
    _APPROVALS,
    _APPROVALS_LOCK,
    ToolApprovalCreateRequest,
    _create_approval,
    _decide_approval_via_ws,
    _list_approvals,
)
from agent_runtimes.streams import loop as streams

SHIPPED = "shop-shipped"
PREVIEW = "shop-preview"
AT = datetime(2026, 10, 14, 7, 30, tzinfo=timezone.utc)
# A turn as the usage tracker keeps it: pydantic-ai's own messages, dumped.
TURN = ModelMessagesTypeAdapter.dump_python(
    [
        ModelRequest(
            parts=[UserPromptPart(content="Exchange order ord_7Hk2 for size L.")],
            timestamp=AT,
        ),
        ModelResponse(parts=[TextPart(content="Proposed: waiting for your approval.")]),
    ],
    mode="json",
)


@pytest.fixture
def agents() -> Iterator[None]:
    remember_app_instance(
        SHIPPED, {"app_uid": "01APP", "deployment_uid": "dep-7", "version": 1}
    )
    remember_app_instance(
        PREVIEW, {"app_uid": "01APP", "deployment_uid": "", "version": 1}
    )
    tracker = get_usage_tracker()
    for agent in (SHIPPED, PREVIEW):
        tracker.register_agent(agent).message_history = [dict(m) for m in TURN]
    try:
        yield
    finally:
        for agent in (SHIPPED, PREVIEW):
            remember_app_instance(agent, None)
            tracker.unregister_agent(agent)


@pytest.fixture
def client(agents: None) -> TestClient:
    app = FastAPI()
    app.include_router(history_router, prefix="/api/v1")
    return TestClient(app)


async def _pending(agent: str) -> Any:
    return await _create_approval(
        ToolApprovalCreateRequest(
            agent_id=agent,
            tool_name="pap_ask",
            tool_args={"message": "Do you sell gloves?"},
        )
    )


async def _forget_approvals() -> None:
    async with _APPROVALS_LOCK:
        _APPROVALS.clear()


def test_a_deployments_history_is_read_changed_and_cleared_by_nobody(
    client: TestClient,
) -> None:
    for method in ("get", "delete"):
        answer = getattr(client, method)(
            "/api/v1/history", params={"agent_id": SHIPPED}
        )
        assert answer.status_code == 404
        assert "every visitor's" in answer.json()["detail"]
    posted = client.post(
        "/api/v1/history", params={"agent_id": SHIPPED}, json={"messages": []}
    )
    assert posted.status_code == 404
    assert get_usage_tracker().get_agent_stats(SHIPPED).message_history == TURN
    # A Preview's own conversation is read as before.
    preview = client.get("/api/v1/history", params={"agent_id": PREVIEW}).json()[
        "messages"
    ]
    assert [m["role"] for m in preview] == ["user", "assistant"]


def test_default_never_resolves_to_a_deployments_agent(agents: None) -> None:
    tracker = get_usage_tracker()
    tracker.get_agent_stats(PREVIEW).message_history = []
    app = FastAPI()
    app.include_router(history_router, prefix="/api/v1")
    answer = TestClient(app).get("/api/v1/history")
    assert answer.status_code == 200
    assert answer.json()["messages"] == []


@pytest.mark.asyncio
async def test_a_deployments_snapshot_carries_none_of_its_conversation_or_approvals(
    agents: None,
) -> None:
    await _forget_approvals()
    try:
        await _pending(SHIPPED)
        await _pending(PREVIEW)
        shipped = await streams.build_monitoring_snapshot_payload(
            SHIPPED, list_approvals=_list_approvals
        )
        assert shipped.approvals == []
        assert shipped.full_context is None and shipped.context_snapshot is None
        everyone = await streams.build_monitoring_snapshot_payload(
            None, list_approvals=_list_approvals
        )
        assert [a["agent_id"] for a in everyone.approvals] == [PREVIEW]
        preview = await streams.build_monitoring_snapshot_payload(
            PREVIEW, list_approvals=_list_approvals
        )
        assert [a["agent_id"] for a in preview.approvals] == [PREVIEW]
    finally:
        await _forget_approvals()


def test_a_deployments_events_reach_no_subscriber(agents: None) -> None:
    everything = streams.subscribe_stream(None)
    own = streams.subscribe_stream(SHIPPED)
    try:
        for agent in (SHIPPED, PREVIEW):
            streams.enqueue_stream_message(
                agent,
                streams.AgentStreamMessage.create(
                    type="tool_approval_created", payload={}, agent_id=agent
                ),
            )
        assert own.empty()
        assert everything.qsize() == 1 and everything.get_nowait().agent_id == PREVIEW
    finally:
        streams.unsubscribe_stream(None, everything)
        streams.unsubscribe_stream(SHIPPED, own)


@pytest.mark.asyncio
async def test_nobody_decides_a_deployments_approval_on_its_runtimes_stream(
    agents: None,
) -> None:
    await _forget_approvals()
    try:
        shipped = await _pending(SHIPPED)
        with pytest.raises(HTTPException) as refused:
            await _decide_approval_via_ws(
                shipped.id, approved=True, note="a second visitor"
            )
        assert refused.value.status_code == 403
        assert _APPROVALS[shipped.id].status == "pending"
        preview = await _pending(PREVIEW)
        assert (
            await _decide_approval_via_ws(preview.id, approved=True)
        ).status == "approved"
    finally:
        await _forget_approvals()

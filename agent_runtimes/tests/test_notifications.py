# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Notifications: channels, delivery records, the agent's tools and the routes."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.notifications import (
    NotificationsCapability,
    NotificationStore,
    build_notifications_capability,
    drop_notification_store,
    get_notification_store,
)
from agent_runtimes.routes import notifications_router


@pytest.fixture
def agent_id():
    name = "notify-agent"
    yield name
    drop_notification_store(name)


@pytest.mark.asyncio
async def test_in_app_is_on_by_default_and_the_others_wait_for_a_target() -> None:
    store = NotificationStore("a1")
    assert store.enabled_channels() == ["in-app"]

    records = await store.notify("Hi", "there")
    assert [r.channel for r in records] == ["in-app"]
    assert records[0].delivery == "stored"
    assert store.list()[0].read is False

    store.configure("email", enabled=True, target="me@example.com")
    records = await store.notify("Disk", "is low", level="warning")
    by_channel = {r.channel: r for r in records}
    assert by_channel["email"].delivery == "unconfigured"
    assert "no email provider" in (by_channel["email"].detail or "")
    assert by_channel["in-app"].level == "warning"


@pytest.mark.asyncio
async def test_slack_needs_a_webhook_url() -> None:
    store = NotificationStore("a2")
    store.configure("slack", enabled=True, target="not-a-url")
    (record,) = await store.notify("x", "y", channels=["slack"])
    assert record.delivery == "unconfigured"
    assert "webhook" in (record.detail or "")


def test_read_state_and_the_rolling_window() -> None:
    import asyncio

    store = NotificationStore("a3")
    for i in range(3):
        asyncio.run(store.notify(f"n{i}", "b"))
    first = store.list()[-1]
    assert store.mark_read(first.id) is not None
    assert [n.read for n in store.list()] == [False, False, True]
    assert store.mark_all_read() == 2
    assert store.mark_read("nope") is None


def test_factory_builds_the_capability_from_the_spec_section(agent_id: str) -> None:
    class Spec:
        guardrails = None
        capabilities = None
        advanced = None
        subagents = None
        memory = None
        memory_config = None
        checkpoints = None
        model = "test"
        notifications = {
            "in-app": {"enabled": True},
            "slack": "https://hooks.example/x",
        }

    caps = build_capabilities_from_agent_spec(Spec(), agent_id=agent_id)
    found = [c for c in caps if isinstance(c, NotificationsCapability)]
    assert len(found) == 1
    store = get_notification_store(agent_id)
    assert store is not None
    slack = next(c for c in store.channels() if c.channel == "slack")
    assert slack.enabled and slack.target == "https://hooks.example/x"
    assert build_notifications_capability(None, agent_id="other") is None


@pytest.mark.asyncio
async def test_the_model_sends_and_lists_through_its_tools(agent_id: str) -> None:
    cap = build_notifications_capability({"in-app": True}, agent_id=agent_id)
    assert cap is not None

    def model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        last = messages[-1]
        if any(p.part_kind == "user-prompt" for p in last.parts):
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="send_notification",
                        args={"title": "Hello", "body": "It works", "level": "info"},
                    )
                ]
            )
        if any(
            p.part_kind == "tool-return" and p.tool_name == "send_notification"
            for p in last.parts
        ):
            return ModelResponse(
                parts=[ToolCallPart(tool_name="list_notifications", args={})]
            )
        returned = next(p for p in last.parts if p.part_kind == "tool-return")
        return ModelResponse(parts=[TextPart(content=str(returned.content))])

    agent = Agent(FunctionModel(model), capabilities=[cap])
    result = await agent.run("notify me")

    assert "Hello via in-app (stored, unread)" in result.output
    store = get_notification_store(agent_id)
    assert store is not None and len(store.list()) == 1


def test_routes_list_configure_test_and_mark_read(agent_id: str) -> None:
    app = FastAPI()
    app.include_router(notifications_router, prefix="/api/v1")
    client = TestClient(app)
    base = f"/api/v1/agents/{agent_id}/notifications"

    assert client.get(base).json() == []
    channels = client.get(f"{base}/channels").json()
    assert [(c["channel"], c["enabled"]) for c in channels] == [
        ("in-app", True),
        ("email", False),
        ("slack", False),
    ]

    updated = client.put(
        f"{base}/channels",
        json={"channel": "email", "enabled": True, "target": "me@example.com"},
    ).json()
    email = next(c for c in updated if c["channel"] == "email")
    assert email["enabled"] and email["target"] == "me@example.com"

    sent = client.post(f"{base}/test")
    assert sent.status_code == 201
    assert sent.json()["channels"] == ["in-app", "email"]
    records = sent.json()["notifications"]
    assert {r["channel"]: r["delivery"] for r in records} == {
        "in-app": "stored",
        "email": "unconfigured",
    }

    listed = client.get(base).json()
    assert len(listed) == 2 and all(n["read"] is False for n in listed)
    read = client.post(f"{base}/{listed[0]['id']}/read").json()
    assert read["read"] is True
    assert client.get(f"{base}?unread_only=true").json()[0]["id"] == listed[1]["id"]
    assert client.post(f"{base}/read-all").json()["marked"] == 1
    assert client.post(f"{base}/nope/read").status_code == 404

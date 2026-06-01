# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for agent node tunnel prompt extraction and local dispatch."""

from __future__ import annotations

from typing import cast

import pytest

from agent_runtimes import agent_node_tunnel as tunnel
from agent_runtimes.adapters.base import AgentContext, AgentResponse, BaseAgent
from agent_runtimes.routes import acp as acp_route


def test_extract_prompt_supports_direct_and_message_shapes() -> None:
    """Support text, prompt, and messages payload shapes for prompt extraction."""
    assert tunnel._extract_prompt({"text": "hello"}) == "hello"
    assert tunnel._extract_prompt({"prompt": "what time is it"}) == "what time is it"
    assert (
        tunnel._extract_prompt(
            {
                "messages": [
                    {"role": "assistant", "content": "old"},
                    {"role": "user", "content": "latest user prompt"},
                ]
            }
        )
        == "latest user prompt"
    )


@pytest.mark.asyncio
async def test_run_local_chat_request_uses_registered_agent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Route local tunnel requests through the registered ACP agent."""

    class _FakeAgent:
        """Minimal fake agent used to validate local tunnel dispatch."""

        async def run(self, prompt: str, context: AgentContext) -> AgentResponse:
            """Return a deterministic response for assertions."""
            assert prompt == "hello tunnel"
            assert context.user_id == "owner-1"
            return AgentResponse(
                content="tunnel response",
                usage={"prompt_tokens": 1, "completion_tokens": 2},
                metadata={"path": "local"},
            )

    original_agents = dict(acp_route._agents)
    try:
        acp_route._agents.clear()
        acp_route._agents["default"] = (
            cast(BaseAgent, _FakeAgent()),
            acp_route.AgentInfo(id="default", name="default"),
        )

        payload = await tunnel._run_local_chat_request(
            {
                "agent_id": "default",
                "text": "hello tunnel",
                "requester_uid": "owner-1",
            }
        )

        assert payload["text"] == "tunnel response"
        assert payload["metadata"]["agent_id"] == "default"
        assert payload["metadata"]["path"] == "local"
        assert payload["usage"]["prompt_tokens"] == 1
        assert payload["source"] == "agent-node-tunnel"
    finally:
        acp_route._agents.clear()
        acp_route._agents.update(original_agents)


@pytest.mark.asyncio
async def test_run_local_chat_request_fails_without_prompt() -> None:
    """Reject local dispatch when no prompt text can be extracted."""
    with pytest.raises(ValueError, match="Missing prompt text"):
        await tunnel._run_local_chat_request({"messages": []})


def test_node_id_prefers_persisted_uid_over_hostname(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Use persisted node UID when no environment override is set."""

    class _Cfg:
        node_uid = "node-ulid-123"

    monkeypatch.delenv("AGENT_NODE_ID", raising=False)
    monkeypatch.setattr(
        "agent_runtimes.routes.agent_node.get_agent_node_configuration",
        lambda: _Cfg(),
    )

    assert tunnel._node_id() == "node-ulid-123"


def test_node_id_env_override_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prefer AGENT_NODE_ID over persisted node UID when provided."""

    class _Cfg:
        node_uid = "node-ulid-123"

    monkeypatch.setenv("AGENT_NODE_ID", "env-node-999")
    monkeypatch.setattr(
        "agent_runtimes.routes.agent_node.get_agent_node_configuration",
        lambda: _Cfg(),
    )

    assert tunnel._node_id() == "env-node-999"

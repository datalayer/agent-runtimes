# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from __future__ import annotations

import pytest

from agent_runtimes.adapters.base import AgentContext, AgentResponse
from agent_runtimes.routes import acp as acp_route
from agent_runtimes import agent_node_tunnel as tunnel


def test_extract_prompt_supports_direct_and_message_shapes() -> None:
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
async def test_run_local_chat_request_uses_registered_agent(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeAgent:
        async def run(self, prompt: str, context: AgentContext) -> AgentResponse:
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
        acp_route._agents["default"] = (_FakeAgent(), object())

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
    with pytest.raises(ValueError, match="Missing prompt text"):
        await tunnel._run_local_chat_request({"messages": []})

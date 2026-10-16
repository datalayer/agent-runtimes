# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness served over the runtime's transports, and the orchestrator's stdio channel.

- AG-UI (SHIELD SH-10, SH-19): ``BaseAgent.stream`` as AG-UI events, what the
  terminal (``loop``) and the web chat read;
- the orchestration adapter's ``ShieldChannel`` (SH-02's agent-runtimes
  part): ``stdio:<command>`` launches the agent through ``agent_shield.acp``,
  and the adapter's four verbs hold.

Both on the ACP SDK's fake agent (``fixtures/acp_fake_agent.py``).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

from agent_runtimes.adapters.acp_agent import ACPAgent
from agent_runtimes.guardrails.shield_policy import policies_of
from agent_runtimes.tests.test_acp_agent import FAKE, Approvals, fake_harness
from agent_runtimes.transports.agui_stream import (
    agui_app_of,
    agui_events,
    conversation_of,
)


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    (tmp_path / "README.md").write_text("# A readme\n", encoding="utf-8")
    return tmp_path


def an_agent(workspace: Path, **kwargs: Any) -> ACPAgent:
    return ACPAgent(
        agent_id="fake",
        harness=fake_harness(),
        command=[sys.executable, str(FAKE)],
        workspace=workspace,
        policies=policies_of(None),
        **kwargs,
    )


def test_the_prompt_is_the_last_user_message_and_the_rest_its_history() -> None:
    prompt, history = conversation_of(
        {
            "messages": [
                {"role": "user", "content": "first"},
                {"role": "assistant", "content": [{"type": "text", "text": "one"}]},
                {"role": "user", "content": [{"type": "text", "text": "second"}]},
            ]
        }
    )
    assert prompt == "second"
    assert history == [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "one"},
    ]
    assert conversation_of({"prompt": "bare"}) == ("bare", [])


class TestAGUI:
    pytestmark = pytest.mark.asyncio

    async def test_a_turn_as_agui_events(self, workspace: Path) -> None:
        agent = an_agent(workspace, approvals=Approvals())
        try:
            events = [
                e
                async for e in agui_events(
                    agent,
                    {
                        "threadId": "t",
                        "runId": "r",
                        "messages": [{"role": "user", "content": "edit"}],
                    },
                )
            ]
        finally:
            await agent.cleanup()
        types = [e.type.value for e in events]
        assert types[0] == "RUN_STARTED" and types[-1] == "RUN_FINISHED"
        assert "THINKING_TEXT_MESSAGE_CONTENT" in types
        assert (
            types.count("TOOL_CALL_START") == 2
        )  # the agent's edit, the Shield's write
        starts = [e for e in events if e.type.value == "TOOL_CALL_START"]
        assert {s.tool_call_name for s in starts} == {
            "Edit hello.txt",
            "Write hello.txt — do it",
        }
        results = [
            json.loads(e.content) for e in events if e.type.value == "TOOL_CALL_RESULT"
        ]
        assert any(
            r["display"] and r["display"][0]["display"] == "diff" for r in results
        )
        # The page's display beside the result, as every protocol display
        # travels (SH-16).
        shown = [r["_meta"]["reactor.ui/display"] for r in results if "_meta" in r]
        assert shown and all(
            s["type"] == "application/vnd.datalayer.shield.diff+json" for s in shown
        )
        assert any(s["data"]["new_text"] == "hello, shield\n" for s in shown)
        customs = [e for e in events if e.type.value == "CUSTOM"]
        assert any(
            c.name == "datalayer.harness.tool_call"
            and c.value.get("awaiting") == "approval"
            for c in customs
        )
        text = "".join(
            e.delta for e in events if e.type.value == "TEXT_MESSAGE_CONTENT"
        )
        assert text == "done"
        assert events[-1].result["stop_reason"] == "end_turn"
        assert (workspace / "hello.txt").exists()

    async def test_a_running_terminal_reaches_the_page_before_its_result(
        self, workspace: Path
    ) -> None:
        """SH-13, SH-16: the output so far rides the row's custom event, so the
        page's terminal card fills while the command runs."""
        agent = an_agent(workspace, approvals=Approvals())
        try:
            events = [
                e
                async for e in agui_events(
                    agent,
                    {
                        "threadId": "t",
                        "runId": "r",
                        "messages": [
                            {
                                "role": "user",
                                "content": "run sh -c 'echo one; sleep 1; echo two'",
                            }
                        ],
                    },
                )
            ]
        finally:
            await agent.cleanup()
        running = [
            (index, e.value["_meta"]["reactor.ui/display"])
            for index, e in enumerate(events)
            if e.type.value == "CUSTOM"
            and e.name == "datalayer.harness.tool_call"
            and "_meta" in e.value
        ]
        assert running and running[0][1]["data"]["output"] == "one\n"
        assert running[0][1]["data"]["exit_code"] is None
        call = events[running[0][0]].value["id"]
        result_at = next(
            index
            for index, e in enumerate(events)
            if e.type.value == "TOOL_CALL_RESULT" and e.tool_call_id == call
        )
        assert running[0][0] < result_at
        final = json.loads(events[result_at].content)["_meta"]["reactor.ui/display"]
        assert final["id"] == running[0][1]["id"]
        assert final["data"]["output"] == "one\ntwo\n"

    async def test_a_plan_is_a_custom_event_and_a_refusal_ends_the_run(
        self, workspace: Path
    ) -> None:
        agent = an_agent(workspace)
        try:
            plan = [e async for e in agui_events(agent, {"prompt": "plan"})]
            bad = [e async for e in agui_events(agent, {"prompt": "bad"})]
        finally:
            await agent.cleanup()
        [custom] = [e for e in plan if e.type.value == "CUSTOM"]
        assert (
            custom.name == "datalayer.harness.plan"
            and custom.value["steps"][0]["content"] == "step one"
        )
        assert (
            bad[-1].type.value == "RUN_FINISHED"
            and bad[-1].result["stop_reason"] == "refusal"
        )
        assert "[Shield] " in "".join(
            e.delta for e in bad if e.type.value == "TEXT_MESSAGE_CONTENT"
        )

    async def test_the_app_streams_server_sent_events(self, workspace: Path) -> None:
        import httpx

        agent = an_agent(workspace)
        await agent.initialize()
        try:
            # On this loop: the agent's process is bound to it (a TestClient
            # would run the app on another and wait forever).
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=agui_app_of(agent, "fake")),
                base_url="http://runtime",
            ) as client:
                answer = await client.post(
                    "/",
                    json={
                        "threadId": "t",
                        "runId": "r",
                        "messages": [{"role": "user", "content": "hello"}],
                    },
                )
                assert answer.status_code == 200
                assert answer.headers["content-type"].startswith("text/event-stream")
                lines = [
                    json.loads(line[6:])
                    for line in answer.text.splitlines()
                    if line.startswith("data: ")
                ]
        finally:
            await agent.cleanup()
        assert [line["type"] for line in lines][:2] == ["RUN_STARTED", "THINKING_START"]
        assert any(
            line["type"] == "TEXT_MESSAGE_CONTENT" and line["delta"] == "done"
            for line in lines
        )
        assert lines[-1]["type"] == "RUN_FINISHED"

    async def test_the_agui_transport_serves_an_agent_that_is_not_pydantic_ai(
        self, workspace: Path
    ) -> None:
        from agent_runtimes.transports.agui import AGUITransport

        agent = an_agent(workspace)
        transport = AGUITransport(agent, agent_id="fake")
        app = transport.get_app()
        assert app is transport.get_app()
        assert [route.path for route in app.routes] == ["/"]
        await agent.cleanup()


class TestShieldChannel:
    pytestmark = pytest.mark.asyncio

    async def test_stdio_launches_initializes_prompts_and_answers_a_permission(
        self, workspace: Path
    ) -> None:
        import asyncio

        from acp import AGENT_METHODS

        from agent_runtimes.orchestration.adapters.acp import ShieldChannel

        channel = await ShieldChannel.connect(f"stdio:{sys.executable} {FAKE}")
        try:
            assert (
                channel.agent_capabilities is not None
                and channel.agent_capabilities.load_session
            )
            opened = await channel.request(
                AGENT_METHODS["session_new"], {"cwd": str(workspace), "mcpServers": []}
            )
            assert opened is not None
            session_id = opened["sessionId"]
            heard: list[dict] = []
            stop = channel.listen(heard.append)

            async def answer_permissions() -> None:
                while not any(
                    m.get("method") == "session/request_permission" for m in heard
                ):
                    await asyncio.sleep(0.01)
                asked = next(
                    m for m in heard if m.get("method") == "session/request_permission"
                )
                assert asked["params"]["toolCall"]["title"] == "git push origin main"
                await channel.respond(
                    asked["id"],
                    {"outcome": {"outcome": "selected", "optionId": "reject"}},
                )

            answering = asyncio.create_task(answer_permissions())
            result = await channel.request(
                AGENT_METHODS["session_prompt"],
                {"sessionId": session_id, "prompt": [{"type": "text", "text": "push"}]},
            )
            await answering
            stop()
            assert result is not None and result["stopReason"] == "end_turn"
            updates = [m for m in heard if m.get("method") == "session/update"]
            assert any("option_id='reject'" in json.dumps(m["params"]) for m in updates)
            assert all("direction" not in m for m in heard)
            await channel.notify(
                AGENT_METHODS["session_cancel"], {"sessionId": session_id}
            )
        finally:
            await channel.close()

    async def test_an_endpoint_that_is_neither_is_refused(self) -> None:
        from agent_runtimes.orchestration.adapters.acp import ShieldChannel

        with pytest.raises(ValueError, match="stdio:<command line>, ws:// or wss://"):
            await ShieldChannel.connect("http://agent.test")
        with pytest.raises(ValueError, match="names the agent's command"):
            await ShieldChannel.connect("stdio:")

    async def test_the_adapter_dispatches_over_stdio(self, workspace: Path) -> None:
        """The orchestrator's adapter, default connection, against a local stdio agent."""
        from datalayer_core.orchestration import AgentBinding, AgentProtocol

        from agent_runtimes.orchestration.adapters.acp import ACPWorkerAdapter

        adapter = ACPWorkerAdapter()
        worker = await adapter.resolve(
            AgentBinding(
                agent_id="fake",
                capability="code.edit",
                protocol=AgentProtocol.ACP,
                endpoint=f"stdio:{sys.executable} {FAKE}",
            )
        )
        assert worker.endpoint is not None and worker.endpoint.startswith("stdio:")
        assert worker.details.get("loadSession") is True


class TestTheRuntimeStartedWithAHarness:
    """``loop --harness`` (SH-19): the runtime makes the harness's agent at startup
    through the create route, serves it over AG-UI, and ends its process with it.
    """

    pytestmark = pytest.mark.asyncio

    async def test_startup_serves_the_harness_and_delete_ends_it(
        self, workspace: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import httpx
        from fastapi import FastAPI

        from agent_runtimes.adapters.acp_agent import WORKSPACE_VARIABLE
        from agent_runtimes.app import _create_harness_agent
        from agent_runtimes.routes import agents as agents_route
        from agent_runtimes.specs import harnesses as catalogue

        monkeypatch.setitem(catalogue.HARNESS_CATALOGUE, "fake", fake_harness())
        monkeypatch.setenv(WORKSPACE_VARIABLE, str(workspace))
        monkeypatch.setenv("AGENT_RUNTIMES_AGENT_NAME", "chat")
        app = FastAPI()
        app.state.codemode_workspace_path = str(workspace)
        app.state.codemode_generated_path = str(workspace / "generated")
        app.state.codemode_skills_path = str(workspace / "skills")
        app.state.durable_lifecycle = None
        await _create_harness_agent(app, "fake", "/api/v1")
        try:
            agent, info = agents_route._agents["chat"]
            assert isinstance(agent, ACPAgent) and agent.started
            assert info.protocol == "ag-ui"
            process = agent.channel.process
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://runtime"
            ) as client:
                answer = await client.post(
                    "/api/v1/ag-ui/chat/",
                    json={
                        "threadId": "t",
                        "runId": "r",
                        "messages": [{"role": "user", "content": "hello"}],
                    },
                )
            assert answer.status_code == 200
            lines = [
                json.loads(line[6:])
                for line in answer.text.splitlines()
                if line.startswith("data: ")
            ]
            assert any(
                line["type"] == "TEXT_MESSAGE_CONTENT" and line["delta"] == "done"
                for line in lines
            )
            assert lines[-1]["type"] == "RUN_FINISHED"
            await agents_route.delete_agent("chat")
            assert "chat" not in agents_route._agents
            assert process.returncode is not None
        finally:
            if "chat" in agents_route._agents:
                await agents_route._agents["chat"][0].cleanup()
                agents_route._agents.pop("chat", None)
            agents_route._agentspecs.pop("chat", None)

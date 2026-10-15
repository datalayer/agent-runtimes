# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# The ACP SDK agent of agent-shield's tests (tests/fixtures/fake_agent.py at
# 75e60f2), carried here because the published package ships no tests: the
# harness every drill of ACPAgent runs against while a funded key is missing.
"""A small ACP agent on the official SDK, for the tests and for a keyless spike.

On a prompt it streams a thought and an answer; when the prompt says
``edit``, it asks permission to edit ``hello.txt``, writes it through the
client's ``fs/write_text_file`` and reports the diff; ``read [<path>]`` reads
``README.md``, or the path named, through ``fs/read_text_file``; ``write
<path>`` writes the path through ``fs/write_text_file``; ``run <command>`` opens a
terminal through ``terminal/create`` and waits for it; ``push`` asks
permission for a ``git push``; ``fetch`` says a fetch tool call; ``bad``
sends an update ACP does not describe; ``slow`` waits until cancelled;
``mcp`` says which MCP servers its session was given, by name and shape
(never a header). With ``FAKE_AGENT_MCP_HTTP=1`` in its environment it
advertises ``mcpCapabilities.http``.
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import Any

from acp import (
    PROTOCOL_VERSION,
    Agent,
    Client,
    InitializeResponse,
    NewSessionResponse,
    PromptResponse,
    RequestError,
    run_agent,
    text_block,
    tool_content,
    tool_diff_content,
    tool_terminal_ref,
    update_agent_message_text,
    update_agent_thought_text,
    update_tool_call,
)
from acp.helpers import plan_entry, start_tool_call, update_plan
from acp.schema import (
    AgentCapabilities,
    Implementation,
    LoadSessionResponse,
    McpCapabilities,
    PermissionOption,
    PromptCapabilities,
    SetSessionModeResponse,
    ToolCallLocation,
    ToolCallUpdate,
)


class FakeAgent(Agent):
    def __init__(self) -> None:
        self._client: Client | None = None
        self._sessions: dict[str, str] = {}
        self._given: dict[str, list[str]] = {}
        self._cancelled: set[str] = set()
        self._counter = 0

    def on_connect(self, conn: Client) -> None:
        self._client = conn

    @property
    def client(self) -> Client:
        assert self._client is not None
        return self._client

    async def initialize(
        self,
        protocol_version: int,
        client_capabilities=None,
        client_info=None,
        **kwargs: Any,
    ):
        # Any requested version is answered with the one supported (ACP-INIT-003).
        return InitializeResponse(
            protocol_version=PROTOCOL_VERSION,
            agent_capabilities=AgentCapabilities(
                load_session=True,
                prompt_capabilities=PromptCapabilities(
                    image=False, audio=False, embedded_context=True
                ),
                mcp_capabilities=McpCapabilities(
                    http=os.environ.get("FAKE_AGENT_MCP_HTTP") == "1", sse=False
                ),
            ),
            agent_info=Implementation(
                name="fake-agent", title="Fake agent", version="0.0.1"
            ),
        )

    async def new_session(
        self, cwd: str, mcp_servers: list, **kwargs: Any
    ) -> NewSessionResponse:
        self._counter += 1
        session_id = f"fake_{self._counter}"
        self._sessions[session_id] = cwd
        names = [getattr(server, "name", "?") for server in mcp_servers]
        self._given[session_id] = [
            f"{name}:{'http' if getattr(server, 'type', None) == 'http' else 'stdio'}"
            for name, server in zip(names, mcp_servers)
        ]
        print(
            f"fake-agent: session {session_id} in {cwd} with mcp {names}",
            file=sys.stderr,
            flush=True,
        )
        return NewSessionResponse(session_id=session_id)

    async def load_session(
        self, cwd: str, mcp_servers: list, session_id: str, **kwargs: Any
    ):
        if session_id not in self._sessions:
            raise RequestError.resource_not_found(session_id)
        await self.client.session_update(
            session_id=session_id, update=update_agent_message_text("loaded")
        )
        return LoadSessionResponse()

    async def set_session_mode(self, mode_id: str, session_id: str, **kwargs: Any):
        return SetSessionModeResponse()

    async def authenticate(self, method_id: str, **kwargs: Any):
        return None

    async def cancel(self, session_id: str, **kwargs: Any) -> None:
        self._cancelled.add(session_id)

    async def ext_method(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        raise RequestError.method_not_found(f"_{method}")

    async def ext_notification(self, method: str, params: dict[str, Any]) -> None:
        return None

    async def prompt(
        self, prompt: list, session_id: str, **kwargs: Any
    ) -> PromptResponse:
        if session_id not in self._sessions:
            raise RequestError.resource_not_found(session_id)
        self._cancelled.discard(session_id)
        text = " ".join(
            block.text for block in prompt if getattr(block, "type", None) == "text"
        )
        say = self.client.session_update
        await say(session_id=session_id, update=update_agent_thought_text("thinking"))
        if "bad" in text:
            await say(session_id=session_id, update=start_tool_call("c0", "Mystery"))
        if "mcp" in text:
            await say(
                session_id=session_id,
                update=update_agent_message_text(
                    f"mcp: {self._given.get(session_id, [])}"
                ),
            )
        if "plan" in text:
            await say(
                session_id=session_id,
                update=update_plan([plan_entry("step one", status="in_progress")]),
            )
        if "edit" in text:
            await say(
                session_id=session_id,
                update=start_tool_call(
                    "c1",
                    "Edit hello.txt",
                    kind="edit",
                    status="pending",
                    locations=[ToolCallLocation(path="hello.txt")],
                    raw_input={"path": "hello.txt"},
                ),
            )
            answer = await self.client.request_permission(
                session_id=session_id,
                tool_call=ToolCallUpdate(
                    tool_call_id="c1",
                    title="Edit hello.txt",
                    kind="edit",
                    status="pending",
                ),
                options=[
                    PermissionOption(
                        option_id="allow", name="Allow", kind="allow_once"
                    ),
                    PermissionOption(
                        option_id="always", name="Always", kind="allow_always"
                    ),
                    PermissionOption(
                        option_id="reject", name="Reject", kind="reject_once"
                    ),
                ],
            )
            outcome = answer.outcome
            chosen = getattr(outcome, "option_id", None)
            if chosen in ("allow", "always"):
                await self.client.write_text_file(
                    session_id=session_id, path="hello.txt", content="hello, shield\n"
                )
                await say(
                    session_id=session_id,
                    update=update_tool_call(
                        "c1",
                        status="completed",
                        content=[tool_diff_content("hello.txt", "hello, shield\n", "")],
                    ),
                )
            else:
                await say(
                    session_id=session_id,
                    update=update_tool_call("c1", status="failed"),
                )
                await say(
                    session_id=session_id,
                    update=update_agent_message_text(f"edit refused: {outcome}"),
                )
        if "read" in text:
            named = (
                text.split("read", 1)[1].strip().split(" ")[0] if "read" in text else ""
            )
            path = named or "README.md"
            await say(
                session_id=session_id,
                update=start_tool_call(
                    "c2", f"Read {path}", kind="read", status="in_progress"
                ),
            )
            try:
                content = await self.client.read_text_file(
                    session_id=session_id, path=path
                )
                await say(
                    session_id=session_id,
                    update=update_tool_call(
                        "c2",
                        status="completed",
                        content=[tool_content(text_block(content.content[:40]))],
                    ),
                )
            except RequestError as exc:
                await say(
                    session_id=session_id,
                    update=update_tool_call("c2", status="failed"),
                )
                await say(
                    session_id=session_id,
                    update=update_agent_message_text(f"read refused: {exc}"),
                )
        if text.startswith("write "):
            path = text.split("write ", 1)[1].strip().split(" ")[0]
            try:
                await self.client.write_text_file(
                    session_id=session_id, path=path, content="written by the agent\n"
                )
                await say(
                    session_id=session_id,
                    update=update_agent_message_text(f"written {path}"),
                )
            except RequestError as exc:
                await say(
                    session_id=session_id,
                    update=update_agent_message_text(f"write refused: {exc}"),
                )
        if "outside" in text:
            try:
                await self.client.read_text_file(
                    session_id=session_id, path="/etc/hostname"
                )
                await say(
                    session_id=session_id,
                    update=update_agent_message_text("outside read happened"),
                )
            except RequestError as exc:
                await say(
                    session_id=session_id,
                    update=update_agent_message_text(f"outside refused: {exc}"),
                )
        if "run " in text:
            command = text.split("run ", 1)[1].strip()
            await say(
                session_id=session_id,
                update=start_tool_call(
                    "c3", f"Run {command}", kind="execute", status="pending"
                ),
            )
            try:
                terminal = await self.client.create_terminal(
                    session_id=session_id, command=command
                )
                await say(
                    session_id=session_id,
                    update=update_tool_call(
                        "c3",
                        status="in_progress",
                        content=[tool_terminal_ref(terminal.id)],
                    ),
                )
                exit_status = await terminal.wait_for_exit()
                output = await terminal.current_output()
                await terminal.release()
                await say(
                    session_id=session_id,
                    update=update_tool_call(
                        "c3",
                        status="completed",
                        raw_output={
                            "exit": exit_status.exit_code,
                            "output": output.output,
                        },
                    ),
                )
            except RequestError as exc:
                await say(
                    session_id=session_id,
                    update=update_tool_call("c3", status="failed"),
                )
                await say(
                    session_id=session_id,
                    update=update_agent_message_text(f"run refused: {exc}"),
                )
        if "push" in text:
            answer = await self.client.request_permission(
                session_id=session_id,
                tool_call=ToolCallUpdate(
                    tool_call_id="c4",
                    title="git push origin main",
                    kind="execute",
                    status="pending",
                    raw_input={"command": "git push origin main"},
                ),
                options=[
                    PermissionOption(
                        option_id="allow", name="Allow", kind="allow_once"
                    ),
                    PermissionOption(
                        option_id="reject", name="Reject", kind="reject_once"
                    ),
                ],
            )
            await say(
                session_id=session_id,
                update=update_agent_message_text(f"push: {answer.outcome}"),
            )
        if "fetch" in text:
            await say(
                session_id=session_id,
                update=start_tool_call(
                    "c5",
                    "Fetch https://example.com/",
                    kind="fetch",
                    status="pending",
                    raw_input={"url": "https://example.com/"},
                ),
            )
        if "slow" in text:
            for _ in range(200):
                if session_id in self._cancelled:
                    return PromptResponse(stop_reason="cancelled")
                await asyncio.sleep(0.05)
        await say(session_id=session_id, update=update_agent_message_text("done"))
        return PromptResponse(stop_reason="end_turn")


if __name__ == "__main__":
    asyncio.run(run_agent(FakeAgent()))

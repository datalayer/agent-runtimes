# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A tool's display reaches the page; the model reads its model view (RU-1).

The gateway's ``pap_sign_in`` answers with a ``PapSignIn`` in its result's
``_meta["reactor.ui/display"]``. pydantic-ai's MCP client drops ``_meta``, so
the runtime keeps the display: the model is given the display's model view —
never the page to open nor the code — and the page receives the whole display
beside the result it draws. A result without a display passes through.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import pytest
from ag_ui.core import RunAgentInput, ToolCallResultEvent, UserMessage
from fastmcp import Client
from fastmcp.client.client import CallToolResult
from mcp.types import TextContent
from personal_agent_protocol.ui import PapSignIn
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.messages import (
    FunctionToolResultEvent,
    ModelMessage,
    ModelRequest,
    ToolReturn,
    ToolReturnPart,
)
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaToolCall,
    DeltaToolCalls,
    FunctionModel,
)
from reactor.ui import DISPLAY_META_KEY

from agent_runtimes.mcp.displays import DisplayMCPToolset, model_view_of, returned
from agent_runtimes.transports.agui_displays import (
    DisplayAGUIAdapter,
    DisplayAGUIEventStream,
)

OPEN = "https://manzanita.example/device?user_code=WDJB-MJHT"
CODE = "WDJB-MJHT"
ANSWER = {
    "status": "waiting_for_the_person",
    "mode": "device",
    "open": OPEN,
    "code": CODE,
    "expires_at": "2026-10-11T12:15:00+00:00",
}
PLAIN = {"company": "manzanita", "open": OPEN}


@pytest.fixture
def gateway(monkeypatch: Any) -> DisplayMCPToolset:
    """A gateway answering ``pap_sign_in`` as the services' one does today.

    Its client answers in the process: the MCP session is not the subject.
    """

    async def call_tool(
        client: Client[Any], name: str, arguments: dict[str, Any], **kw: Any
    ) -> CallToolResult:
        if name == "pap_sign_in":
            display = PapSignIn.from_answer(ANSWER)
            assert display is not None
            return CallToolResult(
                content=[TextContent(type="text", text=json.dumps(ANSWER))],
                structured_content=ANSWER,
                meta=display.tool_meta(),
                data=ANSWER,
            )
        return CallToolResult(
            content=[TextContent(type="text", text=json.dumps(PLAIN))],
            structured_content=PLAIN,
            meta=None,
            data=PLAIN,
        )

    async def entered(self: MCPToolset) -> MCPToolset:
        return self

    async def left(self: MCPToolset, *args: Any) -> None:
        return None

    monkeypatch.setattr(Client, "call_tool", call_tool)
    monkeypatch.setattr(MCPToolset, "__aenter__", entered)
    monkeypatch.setattr(MCPToolset, "__aexit__", left)
    return DisplayMCPToolset("https://gateway.example/mcp", id="datalayer")


#: What `get_tools` would say of a tool: not run as a task.
TOOL = SimpleNamespace(tool_def=SimpleNamespace(metadata={}))


def agent_over(toolset: DisplayMCPToolset, tool: str, seen: list[Any]) -> Agent:
    """An agent whose model calls ``tool`` of the gateway once, then answers.

    The tool is named as a company's gateway toolset prefixes it.
    """

    async def answer(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        seen.append(list(messages))
        if len(messages) == 1:
            yield {
                0: DeltaToolCall(
                    name=f"manzanita__{tool}", json_args="{}", tool_call_id="call-1"
                )
            }
        else:
            yield "done"

    agent = Agent(FunctionModel(stream_function=answer))

    @agent.tool_plain(name=f"manzanita__{tool}")
    async def call() -> Any:
        return await toolset.call_tool(tool, {}, None, TOOL)

    return agent


def tool_return(messages: list[ModelMessage]) -> ToolReturnPart:
    (part,) = [
        part
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, ToolReturnPart)
    ]
    return part


@pytest.mark.asyncio
async def test_the_model_reads_the_display_s_model_view_only(
    gateway: DisplayMCPToolset,
) -> None:
    back = await gateway.call_tool("pap_sign_in", {}, None, TOOL)

    assert isinstance(back, ToolReturn)
    read = json.dumps(back.return_value)
    assert OPEN not in read and CODE not in read and "user_code" not in read
    assert back.return_value["type"] == "application/vnd.datalayer.pap.sign-in+json"
    assert back.return_value["text"] == (
        "Sign in at manzanita.example: open its sign-in page, shown here, "
        "and enter the code shown with it."
    )
    # The model view's fields, never the page's (open, code); a newer PAP
    # (0.23: company, needs) adds its own beside them.
    data = back.return_value["data"]
    assert "open" not in data and "code" not in data
    assert (data["mode"], data["expires_at"], data["sent_to"]) == (
        "device",
        "2026-10-11T12:15:00Z",
        None,
    )
    # The page's: the whole display.
    display = back.metadata[DISPLAY_META_KEY]
    assert display["type"] == "application/vnd.datalayer.pap.sign-in+json"
    assert display["data"]["open"] == OPEN and display["data"]["code"] == CODE


@pytest.mark.asyncio
async def test_a_result_without_a_display_passes_through(
    gateway: DisplayMCPToolset,
) -> None:
    back = await gateway.call_tool("plain", {}, None, TOOL)

    assert back == PLAIN


@pytest.mark.asyncio
async def test_a_display_outside_a_call_of_its_toolset_is_refused(
    gateway: DisplayMCPToolset,
) -> None:
    with pytest.raises(RuntimeError, match="outside a call"):
        await gateway.direct_call_tool("pap_sign_in", {})


@pytest.mark.asyncio
async def test_the_page_receives_the_display_the_model_does_not(
    gateway: DisplayMCPToolset,
) -> None:
    seen: list[Any] = []
    adapter = DisplayAGUIAdapter(
        agent=agent_over(gateway, "pap_sign_in", seen),
        run_input=RunAgentInput(
            thread_id="t1",
            run_id="r1",
            state=None,
            messages=[UserMessage(id="u1", content="Sign me in at Manzanita")],
            tools=[],
            context=[],
            forwarded_props=None,
        ),
    )

    (result,) = [
        event
        async for event in adapter.run_stream()
        if isinstance(event, ToolCallResultEvent)
    ]

    page = json.loads(result.content)
    display = page["_meta"][DISPLAY_META_KEY]
    assert display["data"]["open"] == OPEN and display["data"]["code"] == CODE
    assert page["text"].startswith("Sign in at manzanita.example")
    assert "open" not in page["data"] and "code" not in page["data"]
    # The model's message holds the model view alone.
    read = tool_return(seen[-1]).model_response_str()
    assert OPEN not in read and CODE not in read
    assert "manzanita.example" in read


@pytest.mark.asyncio
async def test_a_result_without_a_display_reaches_the_page_as_the_model_s() -> None:
    stream = DisplayAGUIEventStream()
    part = ToolReturnPart("plain", {"open": OPEN}, tool_call_id="c1")

    (result,) = [
        event
        async for event in stream.handle_function_tool_result(
            FunctionToolResultEvent(part)
        )
        if isinstance(event, ToolCallResultEvent)
    ]

    assert json.loads(result.content) == {"open": OPEN}


def test_an_unregistered_display_gives_the_model_its_text_only() -> None:
    back = returned(
        {
            "type": "application/vnd.tests.unknown+json",
            "version": 1,
            "id": "d1",
            "text": "Something to see",
            "data": {"secret_link": OPEN},
        }
    )

    assert isinstance(back, ToolReturn)
    assert back.return_value == {
        "type": "application/vnd.tests.unknown+json",
        "text": "Something to see",
    }
    assert back.metadata[DISPLAY_META_KEY]["data"] == {"secret_link": OPEN}


def test_a_malformed_display_is_refused() -> None:
    with pytest.raises(ValueError):
        returned({"type": "application/vnd.tests.x+json", "data": {}})


def test_a_registered_display_s_model_view_is_its_class_s() -> None:
    display = PapSignIn.from_answer(ANSWER)
    assert display is not None
    assert model_view_of(display.wire()) == display.model_view()


@pytest.mark.asyncio
async def test_the_vercel_ai_stream_puts_the_display_beside_the_output() -> None:
    from pydantic_ai.ui.vercel_ai.response_types import ToolOutputAvailableChunk

    from agent_runtimes.transports import vercel_ai
    from agent_runtimes.transports.vercel_displays import (
        DisplayVercelAIAdapter,
        DisplayVercelAIEventStream,
    )

    # The transport streams with it.
    assert vercel_ai.VercelAIAdapter is DisplayVercelAIAdapter
    sign_in = PapSignIn.from_answer(ANSWER)
    assert sign_in is not None
    back = returned(sign_in.wire().model_dump(mode="json"))
    part = ToolReturnPart(
        "pap_sign_in",
        back.return_value,
        tool_call_id="c1",
        metadata=back.metadata,
    )

    (output,) = [
        chunk
        async for chunk in DisplayVercelAIEventStream(None).handle_function_tool_result(
            FunctionToolResultEvent(part)
        )
        if isinstance(chunk, ToolOutputAvailableChunk)
    ]

    display = output.output["_meta"][DISPLAY_META_KEY]
    assert display["data"]["open"] == OPEN and display["data"]["code"] == CODE
    assert "open" not in output.output["data"]


@pytest.mark.asyncio
async def test_a_plain_output_reaches_the_vercel_page_as_the_model_s() -> None:
    from pydantic_ai.ui.vercel_ai.response_types import ToolOutputAvailableChunk

    from agent_runtimes.transports.vercel_displays import DisplayVercelAIEventStream

    part = ToolReturnPart("plain", {"open": OPEN}, tool_call_id="c1")
    (output,) = [
        chunk
        async for chunk in DisplayVercelAIEventStream(None).handle_function_tool_result(
            FunctionToolResultEvent(part)
        )
        if isinstance(chunk, ToolOutputAvailableChunk)
    ]

    assert output.output == {"open": OPEN}


@pytest.mark.asyncio
async def test_a_reloaded_history_draws_the_display_the_model_never_read(
    gateway: DisplayMCPToolset,
) -> None:
    from agent_runtimes.context.usage import serialize_messages
    from agent_runtimes.routes.history import _convert_to_chat_messages

    seen: list[Any] = []
    agent = agent_over(gateway, "pap_sign_in", seen)
    async with agent.run_stream("Sign me in at Manzanita") as run:
        await run.get_output()
        messages = run.all_messages()

    stored = serialize_messages(messages)
    (kept,) = [
        part
        for message in stored
        for part in message["parts"]
        if part["part_kind"] == "tool-return"
    ]
    # What is stored as the model's content is the model view, as JSON.
    assert OPEN not in kept["content"] and CODE not in kept["content"]
    assert json.loads(kept["content"])["type"] == PapSignIn.display_type

    (tool,) = [m for m in _convert_to_chat_messages(stored, "a1") if m.role == "tool"]
    assert isinstance(tool.content, str)
    page = json.loads(tool.content)
    display = page["_meta"][DISPLAY_META_KEY]
    assert display["data"]["open"] == OPEN and display["data"]["code"] == CODE
    assert "open" not in page["data"]

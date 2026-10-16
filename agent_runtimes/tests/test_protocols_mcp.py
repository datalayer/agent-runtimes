# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""MCP conformance in Python (PR-51, EX-09).

``agent_runtimes/protocols/mcp/fixtures/session.json`` holds one server's
answers as they arrive on the wire and what a client reads from each; the
TypeScript ``mcpClient.unit.test.ts`` reads the same file. Here the ``mcp``
SDK's types read the wire answers, and its ``Client`` reads the fixture's
server in process: the same readings, both ways.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_protocols_mcp.py -v
```
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from mcp.client import Client
from mcp.types import (
    LATEST_PROTOCOL_VERSION,
    CallToolResult,
    GetPromptResult,
    ListToolsResult,
    ReadResourceResult,
)

from agent_runtimes.protocols.mcp.reading import (
    call_reading,
    prompt_reading,
    resource_reading,
    tool_reading,
)

ROOT = Path(__file__).parents[2]


def _example():
    path = ROOT / "examples" / "protocols" / "mcp" / "fixture_server.py"
    spec = importlib.util.spec_from_file_location("mcp_fixture_server", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


EXAMPLE = _example()
FIXTURE = EXAMPLE.load_fixture()


def test_the_python_sdk_speaks_the_version_the_fixture_says() -> None:
    assert LATEST_PROTOCOL_VERSION == FIXTURE["versions"]["python"]


def test_the_tools_listed_are_read_with_the_specifications_defaults() -> None:
    listed = ListToolsResult.model_validate(FIXTURE["tools"]["wire"])
    assert [tool_reading(tool) for tool in listed.tools] == FIXTURE["tools"]["read"]


@pytest.mark.parametrize("call", FIXTURE["calls"], ids=lambda c: c["read"]["text"])
def test_each_answer_is_read_as_the_fixture_says(call: dict) -> None:
    assert call_reading(CallToolResult.model_validate(call["wire"])) == call["read"]


def test_resources_and_prompts_are_read_as_the_fixture_says() -> None:
    for resource in FIXTURE["resources"]:
        read = ReadResourceResult.model_validate(resource["wire"])
        assert resource_reading(read) == resource["read"]
    for prompt in FIXTURE["prompts"]:
        got = GetPromptResult.model_validate(prompt["wire"])
        assert prompt_reading(got) == prompt["read"]


def test_a_binary_resource_is_refused_not_decoded() -> None:
    blob = ReadResourceResult.model_validate(
        {"contents": [{"uri": "note://logo", "mimeType": "image/png", "blob": "AA=="}]}
    )
    with pytest.raises(ValueError, match="note://logo is not text"):
        resource_reading(blob)


@pytest.mark.asyncio
async def test_the_client_reads_the_fixture_server_as_the_fixture_says() -> None:
    async with Client(EXAMPLE.fixture_server(FIXTURE)) as client:
        assert client.protocol_version == FIXTURE["versions"]["python"]
        listed = await client.list_tools()
        assert [tool_reading(tool) for tool in listed.tools] == FIXTURE["tools"]["read"]
        for call in FIXTURE["calls"]:
            answer = await client.call_tool(call["tool"], call["arguments"])
            assert call_reading(answer) == call["read"]
        for resource in FIXTURE["resources"]:
            read = await client.read_resource(resource["uri"])
            assert resource_reading(read) == resource["read"]
        for prompt in FIXTURE["prompts"]:
            got = await client.get_prompt(prompt["name"], prompt["get"])
            assert prompt_reading(got) == prompt["read"]


@pytest.mark.asyncio
async def test_a_call_the_fixture_does_not_hold_is_refused() -> None:
    async with Client(EXAMPLE.fixture_server(FIXTURE)) as client:
        answer = await client.call_tool("add", {"a": 1, "b": 1})
        assert call_reading(answer)["isError"] is True

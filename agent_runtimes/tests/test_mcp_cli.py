# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`agent-runtimes mcp` and the client under it, without a network.

The gateway answers a tool with JSON *text* content; the client decodes it,
keeps an error's words, and the CLI exits non-zero on one.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_mcp_cli.py -v
```
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

import pytest
import typer
from mcp.types import (
    CallToolRequest,
    CallToolResult,
    ImageContent,
    ListToolsResult,
    TextContent,
    Tool,
)
from typer.testing import CliRunner

from agent_runtimes.commands import mcp as mcp_cli
from agent_runtimes.mcp.hosted_client import (
    HostedMCPClient,
    MCPToolError,
    _headers,
    decode_result,
    endpoint_url,
    toolsets_url,
)

GATEWAY = "https://mcp.datalayer.run/mcp"


def text_result(*texts: str, is_error: bool = False) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=text) for text in texts],
        is_error=is_error,
    )


class FakeSession:
    """What `HostedMCPClient` asks of a `ClientSession`."""

    def __init__(self, results: dict[str, CallToolResult] | None = None) -> None:
        self.results = results or {}
        self.requests: list[CallToolRequest] = []
        self.pages = [
            ListToolsResult(
                tools=[
                    Tool(
                        name="odoo_get_account",
                        description="Who the session is.\nMore.",
                        input_schema={"type": "object"},
                    )
                ],
                next_cursor="2",
            ),
            ListToolsResult(
                tools=[
                    Tool(
                        name="odoo_search_records",
                        description="Search records.",
                        input_schema={
                            "type": "object",
                            "properties": {"model": {"type": "string"}},
                        },
                    )
                ]
            ),
        ]
        self.cursors: list[str | None] = []

    async def list_tools(self, params=None):
        cursor = params.cursor if params else None
        self.cursors.append(cursor)
        return self.pages[int(cursor or 1) - 1]

    async def send_request(self, request, result_type):
        assert result_type is CallToolResult
        self.requests.append(request)
        return self.results[request.params.name]


# -- addresses ---------------------------------------------------------------


def test_endpoint_url_adds_toolsets_and_params(monkeypatch):
    monkeypatch.delenv("DATALAYER_MCP_SERVER_URL", raising=False)
    assert endpoint_url() == GATEWAY
    assert (
        endpoint_url(toolsets=["odoo", "odoo-accounting"], params={"odoo-company": 2})
        == f"{GATEWAY}?odoo,odoo-accounting&odoo-company=2"
    )
    assert (
        endpoint_url(toolsets=["odoo-accounting"], only=True)
        == f"{GATEWAY}?only=odoo-accounting"
    )


def test_endpoint_url_reads_env_and_keeps_an_existing_query(monkeypatch):
    monkeypatch.setenv("DATALAYER_MCP_SERVER_URL", "http://localhost:4100/mcp/")
    assert endpoint_url(params={"a": "b c"}) == "http://localhost:4100/mcp?a=b%20c"
    assert (
        endpoint_url("https://x.test/mcp?only=pap", params={"k": 1})
        == "https://x.test/mcp?only=pap&k=1"
    )


def test_only_without_toolsets_is_refused():
    with pytest.raises(ValueError):
        endpoint_url(GATEWAY, only=True)


def test_toolsets_url_sits_beside_mcp():
    assert (
        toolsets_url(GATEWAY, ["odoo"], {"odoo-company": 1})
        == "https://mcp.datalayer.run/toolsets?odoo&odoo-company=1"
    )
    assert toolsets_url("https://x.test/api") == "https://x.test/api/toolsets"


def test_headers_bearer_from_env_and_never_empty(monkeypatch):
    monkeypatch.setenv("MY_KEY", "secret")
    assert _headers(None, "MY_KEY", {"X-A": "1"}) == {
        "X-A": "1",
        "Authorization": "Bearer secret",
    }
    monkeypatch.delenv("MY_KEY")
    assert _headers(None, "MY_KEY", None) == {}
    # A caller's Authorization wins.
    assert _headers("t", "MY_KEY", {"authorization": "Basic x"}) == {
        "authorization": "Basic x"
    }


# -- decoding and calls ------------------------------------------------------


def test_decode_result_json_text_and_other_contents():
    result = CallToolResult(
        content=[
            TextContent(type="text", text='{"a": 1}'),
            TextContent(type="text", text="not json"),
            ImageContent(type="image", data="AA==", mime_type="image/png"),
        ]
    )
    decoded = decode_result(result)
    assert decoded[0] == {"a": 1}
    assert decoded[1] == "not json"
    assert decoded[2]["type"] == "image"
    assert decode_result(CallToolResult(content=[], structured_content={"x": 2})) == [
        {"x": 2}
    ]
    # An empty search: no content, its list wrapped in structured content.
    assert (
        decode_result(CallToolResult(content=[], structured_content={"result": []}))
        == []
    )
    assert decode_result(
        CallToolResult(content=[], structured_content={"result": [{"id": 1}]})
    ) == [{"id": 1}]
    assert decode_result(CallToolResult(content=[])) == []


def test_call_sends_a_raw_tools_call_and_decodes():
    session = FakeSession({"odoo_get_account": text_result('{"name": "Datalayer"}')})
    client = HostedMCPClient(session)
    # A tool argument called `name` does not collide with the tool's.
    assert asyncio.run(client.call("odoo_get_account", name="x")) == [
        {"name": "Datalayer"}
    ]
    [request] = session.requests
    assert request.method == "tools/call"
    assert request.params.name == "odoo_get_account"
    assert request.params.arguments == {"name": "x"}


def test_call_raises_with_the_error_text():
    session = FakeSession({"bad": text_result("Odoo refused it", is_error=True)})
    with pytest.raises(MCPToolError) as caught:
        asyncio.run(HostedMCPClient(session).call("bad"))
    assert caught.value.tool == "bad"
    assert caught.value.text == "Odoo refused it"
    # call_raw keeps the result as it came.
    assert asyncio.run(HostedMCPClient(session).call_raw("bad")).is_error


def test_list_tools_pages_and_describe():
    session = FakeSession()
    client = HostedMCPClient(session)
    names = [tool.name for tool in asyncio.run(client.list_tools())]
    assert names == ["odoo_get_account", "odoo_search_records"]
    assert session.cursors == [None, "2"]
    assert asyncio.run(client.describe("odoo_search_records")).name == (
        "odoo_search_records"
    )
    with pytest.raises(KeyError):
        asyncio.run(client.describe("nope"))


# -- argument parsing --------------------------------------------------------


def test_parse_arguments_json_file_and_pairs(tmp_path):
    path = tmp_path / "args.json"
    path.write_text('{"model": "res.partner", "limit": 10}')
    assert mcp_cli.parse_arguments(
        f"@{path}", ["limit=5", "ids=[1,2]", "draft=true", "name=Acme SA"]
    ) == {
        "model": "res.partner",
        "limit": 5,
        "ids": [1, 2],
        "draft": True,
        "name": "Acme SA",
    }
    assert mcp_cli.parse_arguments('{"a": "b"}', None) == {"a": "b"}


@pytest.mark.parametrize("bad", ["[1, 2]", "{not json"])
def test_parse_arguments_refuses_non_objects(bad):
    with pytest.raises(typer.BadParameter):
        mcp_cli.parse_arguments(bad, None)


def test_parse_arguments_refuses_a_pair_without_equals():
    with pytest.raises(typer.BadParameter):
        mcp_cli.parse_arguments(None, ["limit"])


# -- the CLI -----------------------------------------------------------------


@pytest.fixture
def fake(monkeypatch):
    """The CLI's `connect`, answering from a FakeSession; records its options."""
    session = FakeSession(
        {
            "odoo_get_account": text_result('{"current_company": [1, "Datalayer"]}'),
            "two": text_result('{"a": 1}', '{"b": 2}'),
            "bad": text_result("Odoo refused it", is_error=True),
        }
    )
    seen: dict = {}

    @asynccontextmanager
    async def connect(**options):
        seen.update(options)
        yield HostedMCPClient(session, "fake")

    monkeypatch.setattr(mcp_cli, "connect", connect)
    return session, seen


runner = CliRunner()


def test_cli_call_prints_json_and_passes_session_options(fake):
    session, seen = fake
    result = runner.invoke(
        mcp_cli.app,
        [
            "call",
            "odoo_get_account",
            "-t",
            "odoo,odoo-accounting",
            "-p",
            "odoo-company=1",
            "-H",
            "X-Trace=1",
            "-a",
            "limit=3",
        ],
    )
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == {"current_company": [1, "Datalayer"]}
    assert seen["toolsets"] == ["odoo", "odoo-accounting"]
    assert seen["params"] == {"odoo-company": "1"}
    assert seen["headers"] == {"X-Trace": "1"}
    assert seen["token_env"] == "DATALAYER_API_KEY"
    assert session.requests[0].params.arguments == {"limit": 3}


def test_cli_call_prints_a_list_for_several_contents(fake):
    result = runner.invoke(mcp_cli.app, ["call", "two"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == [{"a": 1}, {"b": 2}]


def test_cli_call_error_exits_non_zero_with_the_text(fake):
    result = runner.invoke(mcp_cli.app, ["call", "bad"])
    assert result.exit_code == 1
    assert "Odoo refused it" in result.output
    raw = runner.invoke(mcp_cli.app, ["call", "bad", "--raw"])
    assert raw.exit_code == 1
    assert json.loads(raw.stdout)["isError"] is True


def test_cli_tools_lists_names_and_first_lines(fake):
    result = runner.invoke(mcp_cli.app, ["tools", "--only", "-t", "odoo"])
    assert result.exit_code == 0, result.output
    assert "odoo_get_account     Who the session is." in result.stdout
    assert "More." not in result.stdout
    as_json = runner.invoke(mcp_cli.app, ["tools", "--json"])
    assert [tool["name"] for tool in json.loads(as_json.stdout)] == [
        "odoo_get_account",
        "odoo_search_records",
    ]


def test_cli_describe_and_schema(fake):
    result = runner.invoke(mcp_cli.app, ["describe", "odoo_search_records", "--json"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout)["inputSchema"]["properties"]["model"] == {
        "type": "string"
    }
    schema = runner.invoke(mcp_cli.app, ["tools", "--schema", "odoo_search_records"])
    assert schema.exit_code == 0
    assert "Input schema:" in schema.stdout
    missing = runner.invoke(mcp_cli.app, ["describe", "nope"])
    assert missing.exit_code == 1


def test_cli_run_reuses_one_session(fake, tmp_path):
    session, _ = fake
    script = tmp_path / "body.py"
    script.write_text(
        "async def main(client):\n"
        "    [account] = await client.call('odoo_get_account')\n"
        "    both = await client.call('two')\n"
        "    return {'company': account['current_company'][0], 'n': len(both)}\n"
    )
    result = runner.invoke(mcp_cli.app, ["run", str(script)])
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == {"company": 1, "n": 2}
    assert len(session.requests) == 2


def test_cli_run_tool_error_exits_one(fake, tmp_path):
    script = tmp_path / "body.py"
    script.write_text("async def main(client):\n    await client.call('bad')\n")
    result = runner.invoke(mcp_cli.app, ["run", str(script)])
    assert result.exit_code == 1
    assert "Odoo refused it" in result.output


def test_cli_run_needs_an_async_main(fake, tmp_path):
    script = tmp_path / "body.py"
    script.write_text("def main(client):\n    pass\n")
    result = runner.invoke(mcp_cli.app, ["run", str(script)])
    assert result.exit_code != 0


def test_cli_session_failure_is_one_line_exit_two(monkeypatch):
    @asynccontextmanager
    async def connect(**options):
        raise ExceptionGroup("tg", [ConnectionError("401 Unauthorized")])
        yield  # pragma: no cover

    monkeypatch.setattr(mcp_cli, "connect", connect)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    result = runner.invoke(mcp_cli.app, ["tools"])
    assert result.exit_code == 2
    assert "ConnectionError: 401 Unauthorized" in result.output
    assert "$DATALAYER_API_KEY is not set" in result.output


def test_cli_toolsets_marks_active(monkeypatch):
    seen: dict = {}

    async def list_toolsets(**options):
        seen.update(options)
        return {
            "toolsets": [
                {"name": "odoo", "description": "Odoo.", "active": True},
                {"name": "spaces", "description": "Spaces.", "default": True},
            ],
            "active": ["odoo"],
            "unknown": ["nope"],
        }

    monkeypatch.setattr(mcp_cli, "list_toolsets", list_toolsets)
    result = runner.invoke(mcp_cli.app, ["toolsets", "-t", "odoo", "-t", "nope"])
    assert result.exit_code == 0, result.output
    assert "* odoo    Odoo." in result.stdout
    assert "  spaces  Spaces. (default)" in result.stdout
    assert "Unknown toolsets: nope" in result.output
    assert seen["toolsets"] == ["odoo", "nope"]

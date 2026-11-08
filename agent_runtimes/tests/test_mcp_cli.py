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
import base64
import json
import logging
import sys
from contextlib import asynccontextmanager

import pytest
import typer
from mcp.shared.exceptions import MCPError
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
from agent_runtimes.mcp import hosted_client
from agent_runtimes.mcp.hosted_client import (
    HostedMCPClient,
    MCPConnectError,
    MCPToolError,
    _headers,
    coerce_arguments,
    connect,
    decode_result,
    endpoint_url,
    health_urls,
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
                    ),
                    Tool(
                        name="find_document",
                        description="Find a document by its number.",
                        input_schema=FIND_SCHEMA,
                    ),
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
        if request.params.name not in self.results:
            raise MCPError(-32602, f"Unknown tool: {request.params.name}")
        return self.results[request.params.name]


#: A tool whose `number` is a string however numeric it looks.
FIND_SCHEMA = {
    "type": "object",
    "properties": {
        "number": {"type": "string"},
        "limit": {"type": "integer"},
        "amount": {"anyOf": [{"type": "number"}, {"type": "null"}]},
        "draft": {"type": "boolean"},
        "ids": {"type": "array", "items": {"type": "integer"}},
        "kind": {"$ref": "#/$defs/Kind"},
    },
    "$defs": {"Kind": {"enum": ["bill", "invoice"]}},
}


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
    assert names == ["odoo_get_account", "odoo_search_records", "find_document"]
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
            "find_document": text_result('{"found": true}'),
            "attachment": text_result(
                json.dumps(
                    {
                        "name": "bill.xml",
                        "xml_base64": base64.b64encode(b"<Invoice/>").decode(),
                        "raw": {"content": base64.b64encode(b"%PDF").decode()},
                    }
                )
            ),
            "text": text_result("plain words"),
        }
    )
    seen: dict = {}

    @asynccontextmanager
    async def connect(**options):
        seen.update(options)
        # What botocore says at import, and httpx on every request.
        logging.getLogger("botocore.credentials").info("Found credentials.")
        logging.getLogger("httpx").info("HTTP Request: POST")
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
        "find_document",
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


# -- round two: coercion -----------------------------------------------------


def test_coerce_arguments_by_schema_types():
    texts = {
        "number": "1618720029",
        "limit": "5",
        "amount": "12.5",
        "draft": "True",
        "ids": "[1, 2]",
        "kind": "bill",
        "other": "7",
    }
    assert coerce_arguments(texts, FIND_SCHEMA, from_text=True) == {
        "number": "1618720029",  # a string property keeps the text
        "limit": 5,
        "amount": 12.5,
        "draft": True,
        "ids": [1, 2],
        "kind": "bill",  # an enum of strings, through $ref
        "other": 7,  # untyped: JSON when it is JSON
    }
    # Python values: an int for a string property is sent as its text; an
    # untyped string stays a string.
    assert coerce_arguments(
        {"number": 1618720029, "limit": "5", "other": "7", "draft": False},
        FIND_SCHEMA,
    ) == {"number": "1618720029", "limit": 5, "other": "7", "draft": False}


def test_parse_arguments_keeps_args_json_as_is():
    assert mcp_cli.parse_arguments('{"number": 12}', ["limit=3"], FIND_SCHEMA) == {
        "number": 12,
        "limit": 3,
    }


def test_client_call_coerce_fetches_the_schema_once():
    session = FakeSession({"find_document": text_result('{"found": true}')})
    client = HostedMCPClient(session)
    assert asyncio.run(
        client.call("find_document", coerce=True, number=1618720029, limit="2")
    ) == [{"found": True}]
    assert session.requests[0].params.arguments == {
        "number": "1618720029",
        "limit": 2,
    }
    asyncio.run(client.call("find_document", coerce=True, number=1))
    assert session.cursors == [None, "2"]  # listed once per session
    # Without coerce, as given.
    asyncio.run(client.call("find_document", number=3))
    assert session.requests[-1].params.arguments == {"number": 3}


def test_client_call_turns_a_json_rpc_refusal_into_a_tool_error():
    with pytest.raises(MCPToolError) as caught:
        asyncio.run(HostedMCPClient(FakeSession()).call("nope"))
    assert "Unknown tool: nope" in caught.value.text


def test_cli_call_coerces_pairs_by_the_tool_schema(fake):
    session, _ = fake
    result = runner.invoke(
        mcp_cli.app,
        ["call", "find_document", "-a", "number=1618720029", "-a", "limit=5"],
    )
    assert result.exit_code == 0, result.output
    assert session.requests[-1].params.arguments == {
        "number": "1618720029",
        "limit": 5,
    }


# -- round two: stdout is the result alone -----------------------------------


def test_configure_logging_moves_stdout_handlers_and_quiets_libraries():
    noisy = logging.getLogger("noisy.library")
    handler = logging.StreamHandler(sys.stdout)
    noisy.addHandler(handler)
    root_level = logging.getLogger().level
    try:
        mcp_cli.configure_logging(False)
        assert handler.stream is sys.stderr
        assert not logging.getLogger("botocore.credentials").isEnabledFor(logging.INFO)
        mcp_cli.configure_logging(True)
        assert logging.getLogger("botocore.credentials").isEnabledFor(logging.INFO)
    finally:
        noisy.removeHandler(handler)
        logging.getLogger().setLevel(root_level)
        for name in mcp_cli.QUIET_LOGGERS:
            logging.getLogger(name).setLevel(logging.NOTSET)


def test_cli_call_stdout_is_json_despite_noisy_loggers(fake, caplog):
    caplog.set_level(logging.NOTSET)
    result = runner.invoke(mcp_cli.app, ["call", "odoo_get_account"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == {"current_company": [1, "Datalayer"]}
    assert "Found credentials" not in result.stdout
    assert not [r for r in caplog.records if r.name.startswith(("botocore", "httpx"))]
    verbose = runner.invoke(mcp_cli.app, ["-v", "call", "odoo_get_account"])
    assert json.loads(verbose.stdout) == {"current_company": [1, "Datalayer"]}
    assert [r for r in caplog.records if r.name == "botocore.credentials"]
    for name in mcp_cli.QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.NOTSET)


def test_cli_call_output_text_and_compact(fake):
    text = runner.invoke(mcp_cli.app, ["call", "text", "-o", "text"])
    assert text.stdout == "plain words\n"
    compact = runner.invoke(mcp_cli.app, ["call", "two", "--compact"])
    assert compact.stdout == '[{"a":1},{"b":2}]\n'


def test_cli_company_is_odoo_company_sugar(fake):
    _, seen = fake
    result = runner.invoke(mcp_cli.app, ["call", "odoo_get_account", "-c", "2"])
    assert result.exit_code == 0, result.output
    assert seen["params"] == {"odoo-company": 2}
    assert seen["retries"] == 2
    runner.invoke(mcp_cli.app, ["tools", "--retries", "0", "--retry-wait", "0.5"])
    assert (seen["retries"], seen["retry_wait"]) == (0, 0.5)


def test_cli_call_json_rpc_refusal_exits_one_without_a_trace(fake):
    result = runner.invoke(mcp_cli.app, ["call", "nope"])
    assert result.exit_code == 1
    assert "nope failed: Unknown tool: nope" in result.output
    assert "Traceback" not in result.output
    assert result.stdout == ""


# -- round two: base64 results -----------------------------------------------


def test_cli_call_save_decodes_the_base64_field(fake, tmp_path):
    target = tmp_path / "bill.xml"
    result = runner.invoke(mcp_cli.app, ["call", "attachment", "--save", str(target)])
    assert result.exit_code == 0, result.output
    assert target.read_bytes() == b"<Invoice/>"
    printed = json.loads(result.stdout)
    assert printed["name"] == "bill.xml"
    assert printed["xml_base64"] == f"<10 bytes saved to {target}>"
    pdf = tmp_path / "bill.pdf"
    named = runner.invoke(
        mcp_cli.app,
        ["call", "attachment", "--save", str(pdf), "--save-field", "raw.content"],
    )
    assert named.exit_code == 0, named.output
    assert pdf.read_bytes() == b"%PDF"


def test_cli_call_save_without_a_base64_field_exits_one(fake, tmp_path):
    result = runner.invoke(
        mcp_cli.app, ["call", "odoo_get_account", "--save", str(tmp_path / "x")]
    )
    assert result.exit_code == 1
    assert "No base64 field" in result.output
    assert not (tmp_path / "x").exists()


# -- round two: run with argv ------------------------------------------------


def test_cli_run_passes_argv_after_double_dash(fake, tmp_path):
    script = tmp_path / "body.py"
    script.write_text(
        "async def main(client, argv):\n"
        "    apply = '--apply' in argv\n"
        "    return {'apply': apply, 'argv': argv}\n"
    )
    result = runner.invoke(
        mcp_cli.app,
        ["run", str(script), "-c", "1", "--", "--apply", "--company", "2"],
    )
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == {
        "apply": True,
        "argv": ["--apply", "--company", "2"],
    }
    dry = runner.invoke(mcp_cli.app, ["run", str(script)])
    assert json.loads(dry.stdout) == {"apply": False, "argv": []}


def test_cli_run_argv_needs_a_main_that_takes_it(fake, tmp_path):
    script = tmp_path / "body.py"
    script.write_text("async def main(client):\n    return 1\n")
    result = runner.invoke(mcp_cli.app, ["run", str(script), "--", "--apply"])
    assert result.exit_code != 0
    flat = " ".join(result.output.replace("│", " ").split())
    assert "main(client, argv)" in flat


# -- round two: retries in connect -------------------------------------------


class FakeResponse:
    def __init__(self, status: int) -> None:
        self.status_code = status
        self.request = type("Request", (), {"method": "POST"})()


@pytest.fixture
def transport(monkeypatch):
    """`connect`'s SDK pieces; `plan` scripts each initialize: None succeeds,
    an int answers that HTTP status and fails, an exception is raised."""
    import mcp.client.session
    import mcp.client.streamable_http
    import mcp.shared._httpx_utils

    state = {"plan": [], "initialized": 0, "hooks": None}

    class FakeHTTP:
        event_hooks: dict = {}

        async def __aenter__(self):
            state["hooks"] = self.event_hooks
            return self

        async def __aexit__(self, *exc):
            return False

    @asynccontextmanager
    async def streamable_http_client(address, http_client):
        yield ("read", "write", None)

    class FakeClientSession(FakeSession):
        def __init__(self, read, write):
            super().__init__({"w": text_result("{}")})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def initialize(self):
            state["initialized"] += 1
            step = state["plan"].pop(0) if state["plan"] else None
            if isinstance(step, int):
                for hook in state["hooks"]["response"]:
                    await hook(FakeResponse(step))
                raise MCPError(-32603, "Server returned an error response")
            if isinstance(step, BaseException):
                raise step

    monkeypatch.setattr(
        mcp.shared._httpx_utils, "create_mcp_http_client", lambda headers: FakeHTTP()
    )
    monkeypatch.setattr(
        mcp.client.streamable_http, "streamable_http_client", streamable_http_client
    )
    monkeypatch.setattr(mcp.client.session, "ClientSession", FakeClientSession)
    return state


def _open(state, plan, **options):
    state["plan"] = list(plan)
    told: list[str] = []

    async def go():
        async with connect(
            GATEWAY, retry_wait=0, on_retry=told.append, **options
        ) as client:
            return client

    return asyncio.run(go()), told


def test_connect_retries_transient_failures_then_opens(transport):
    import httpx2

    client, told = _open(
        transport,
        [503, httpx2.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED] self-signed")],
    )
    assert isinstance(client, HostedMCPClient)
    assert transport["initialized"] == 3
    assert len(told) == 2
    assert "attempt 1/3 failed (HTTP 503)" in told[0]
    assert "ConnectError" in told[1]


def test_connect_gives_up_with_a_diagnosis(transport):
    with pytest.raises(MCPConnectError) as caught:
        _open(transport, [503, 503, 503])
    assert caught.value.status == 503
    assert caught.value.attempts == 3
    assert "answered 503 at initialize" in str(caught.value)
    assert "https://mcp.datalayer.run/api/mcp/readyz" in str(caught.value)


def test_connect_does_not_retry_an_auth_refusal(transport):
    with pytest.raises(MCPConnectError) as caught:
        _open(transport, [401])
    assert transport["initialized"] == 1
    assert "check the token" in str(caught.value)


def test_connect_names_a_self_signed_certificate(transport):
    import httpx2

    error = httpx2.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED] self-signed")
    with pytest.raises(MCPConnectError) as caught:
        _open(transport, [error], retries=0)
    assert "TLS certificate was refused" in str(caught.value)


def test_connect_never_retries_once_the_session_is_open(transport):
    transport["plan"] = []

    async def go():
        async with connect(GATEWAY, retry_wait=0) as client:
            await client.call("w")
            raise MCPError(-32603, "Server returned an error response")

    with pytest.raises(MCPError):
        asyncio.run(go())
    assert transport["initialized"] == 1


def test_connect_failure_in_the_cli_is_one_line_exit_two(monkeypatch):
    @asynccontextmanager
    async def connect_fails(**options):
        raise MCPConnectError(
            "the server answered 503 at initialize (after 3 attempts): check "
            "https://mcp.datalayer.run/api/mcp/readyz"
        )
        yield  # pragma: no cover

    monkeypatch.setattr(mcp_cli, "connect", connect_fails)
    result = runner.invoke(mcp_cli.app, ["call", "odoo_get_account"])
    assert result.exit_code == 2
    assert "answered 503 at initialize" in result.output
    assert result.stdout == ""


# -- round two: health -------------------------------------------------------


def test_health_urls_sit_beside_mcp():
    assert health_urls(GATEWAY) == {
        "readyz": "https://mcp.datalayer.run/api/mcp/readyz",
        "healthz": "https://mcp.datalayer.run/api/mcp/healthz",
    }
    assert hosted_client.health_urls("http://localhost:4100/mcp?only=x")["healthz"] == (
        "http://localhost:4100/api/mcp/healthz"
    )


def test_cli_health_prints_status_and_failing_checks(monkeypatch):
    async def gateway_health(url=None, headers=None):
        return [
            {
                "name": "readyz",
                "url": "https://g/api/mcp/readyz",
                "status": 503,
                "body": {
                    "status": "not_ready",
                    "dependencies": [
                        {
                            "name": "iam",
                            "required": True,
                            "ready": False,
                            "detail": "timed out",
                        },
                        {"name": "store", "required": True, "ready": True},
                    ],
                },
            },
            {
                "name": "healthz",
                "url": "https://g/api/mcp/healthz",
                "status": 200,
                "body": {"status": "ok"},
            },
        ]

    monkeypatch.setattr(mcp_cli, "gateway_health", gateway_health)
    result = runner.invoke(mcp_cli.app, ["health"])
    assert result.exit_code == 1
    assert "readyz   503  https://g/api/mcp/readyz  not_ready" in result.stdout
    assert "failing: iam (required): timed out" in result.stdout
    assert "store" not in result.stdout
    assert "healthz  200" in result.stdout
